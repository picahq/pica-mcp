#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import FormData from 'form-data';

interface AvailableAction {
  _id: string;
  title: string;
  tags?: string[];
  knowledge?: any;
  path?: string;
}

interface Connection {
  key: string;
  platform: string;
  active: boolean;
}

interface ConnectionDefinition {
  name: string;
  key: string;
  platform: string;
  platformVersion: string;
  description: string;
  category: string;
  image: string;
  tags: string[];
  oauth: boolean;
  createdAt: number;
  updatedAt: number;
  updated: boolean;
  version: string;
  lastModifiedBy: string;
  deleted: boolean;
  active: boolean;
  deprecated: boolean;
}

class PicaClient {
  private secret: string;
  private connections: Connection[] = [];
  private connectionDefinitions: ConnectionDefinition[] = [];
  private baseUrl: string;

  constructor(secret: string, baseUrl = "https://api.picaos.com") {
    this.secret = secret;
    this.baseUrl = baseUrl;
  }

  private generateHeaders() {
    return {
      "Content-Type": "application/json",
      "x-pica-secret": this.secret,
    };
  }

  async initialize() {
    await Promise.all([
      this.initializeConnections(),
      this.initializeConnectionDefinitions(),
    ]);
  }

  private async initializeConnections() {
    try {
      await this.refreshConnections();
    } catch (error) {
      this.connections = [];
    }
  }

  private async initializeConnectionDefinitions() {
    try {
      const headers = this.generateHeaders();
      const url = `${this.baseUrl}/v1/available-connectors?limit=500`;
      const response = await axios.get(url, { headers });
      this.connectionDefinitions = response.data?.rows || [];
    } catch (error) {
      console.error("Failed to initialize connection definitions:", error);
      this.connectionDefinitions = [];
    }
  }

  getConnections() {
    return this.connections;
  }

  getConnectionDefinitions() {
    return this.connectionDefinitions;
  }

  async refreshConnections() {
    try {
      const headers = this.generateHeaders();
      const url = `${this.baseUrl}/v1/vault/connections?limit=300`;
      const response = await axios.get(url, { headers });
      this.connections = response.data?.rows || [];
      return this.connections;
    } catch (error) {
      console.error("Failed to fetch connections:", error);
      return this.connections;
    }
  }

  async getAvailableActions(platform: string) {
    try {
      const headers = this.generateHeaders();
      const url = `${this.baseUrl}/v1/knowledge?supported=true&connectionPlatform=${platform}&limit=1000`;
      const response = await axios.get(url, { headers });
      return response.data?.rows || [];
    } catch (error) {
      console.error("Error fetching available actions:", error);
      throw new Error("Failed to fetch available actions");
    }
  }

  async getActionKnowledge(actionId: string) {
    try {
      const headers = this.generateHeaders();
      const url = `${this.baseUrl}/v1/knowledge?_id=${actionId}`;
      const response = await axios.get(url, { headers });

      if (!response.data.rows || response.data.rows.length === 0) {
        throw new Error(`Action with ID ${actionId} not found`);
      }

      return response.data.rows[0];
    } catch (error) {
      console.error("Error fetching action knowledge:", error);
      throw new Error("Failed to fetch action knowledge");
    }
  }

  public replacePathVariables(path: string, variables: Record<string, string | number | boolean>): string {
    return path.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const value = variables[variable];
      if (!value) {
        throw new Error(`Missing value for path variable: ${variable}`);
      }
      return value.toString();
    });
  }

  async executeAction(
    actionId: string,
    connectionKey: string,
    method: string,
    path: string,
    data?: any,
    pathVariables?: Record<string, string | number | boolean>,
    queryParams?: Record<string, any>,
    headers?: Record<string, any>,
    isFormData?: boolean,
    isFormUrlEncoded?: boolean
  ) {
    try {
      const newHeaders = {
        ...this.generateHeaders(),
        'x-pica-connection-key': connectionKey,
        'x-pica-action-id': actionId,
        ...(isFormData ? { 'Content-Type': 'multipart/form-data' } : {}),
        ...(isFormUrlEncoded ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...headers
      };

      // Handle path variables
      let resolvedPath = path;
      if (pathVariables) {
        resolvedPath = this.replacePathVariables(path, pathVariables);
      }

      const url = `${this.baseUrl}/v1/passthrough${resolvedPath.startsWith('/') ? resolvedPath : '/' + resolvedPath}`;

      const requestConfig: any = {
        url,
        method,
        headers: newHeaders,
        params: queryParams
      };

      if (method?.toLowerCase() !== 'get') {
        if (isFormData) {
          const formData = new FormData();

          if (data && typeof data === 'object' && !Array.isArray(data)) {
            Object.entries(data).forEach(([key, value]) => {
              if (typeof value === 'object') {
                formData.append(key, JSON.stringify(value));
              } else {
                formData.append(key, value);
              }
            });
          }

          requestConfig.data = formData;
          Object.assign(requestConfig.headers, formData.getHeaders());
        } else if (isFormUrlEncoded) {
          const params = new URLSearchParams();

          if (data && typeof data === 'object' && !Array.isArray(data)) {
            Object.entries(data).forEach(([key, value]) => {
              if (typeof value === 'object') {
                params.append(key, JSON.stringify(value));
              } else {
                params.append(key, String(value));
              }
            });
          }

          requestConfig.data = params;
        } else {
          requestConfig.data = data;
        }
      }

      const response = await axios(requestConfig);
      return {
        responseData: response.data,
        requestConfig
      };
    } catch (error) {
      console.error("Error executing action:", error);
      throw error;
    }
  }
}

const server = new Server(
  {
    name: "pica-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

const PICA_SECRET = process.env.PICA_SECRET!;
const picaClient = new PicaClient(PICA_SECRET);

let picaInitialized = false;
const initializePica = async () => {
  if (!picaInitialized) {
    await picaClient.initialize();
    picaInitialized = true;
  }
};

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  await initializePica();

  return {
    resources: []
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  await initializePica();

  const url = new URL(request.params.uri);
  const scheme = url.protocol;

  if (scheme === 'pica-platform:') {
    const platform = url.hostname;
    try {
      const actions = await picaClient.getAvailableActions(platform);

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(actions.map((action: AvailableAction) => ({
            id: action._id,
            title: action.title,
            tags: action.tags || []
          })), null, 2)
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get platform actions: ${error.message}`);
    }
  } else if (scheme === 'pica-connection:') {
    const [platform, key] = url.pathname.replace(/^\//, '').split('/');
    const connections = picaClient.getConnections();
    const connection = connections.find(c => c.key === key && c.platform === platform);

    if (!connection) {
      throw new Error(`Connection not found for ${platform} with key ${key}`);
    }

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(connection, null, 2)
      }]
    };
  }

  throw new Error(`Unsupported resource URI scheme: ${scheme}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_user_connections_and_available_connectors",
        description: "List all available connectors offered by Pica and connections in the user's Pica account",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "get_available_actions",
        description: "Get available actions for a specific platform",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              description: "Platform name"
            }
          },
          required: ["platform"]
        }
      },
      {
        name: "get_action_knowledge",
        description: "Get detailed information about a specific action",
        inputSchema: {
          type: "object",
          properties: {
            actionId: {
              type: "string",
              description: "ID of the action"
            }
          },
          required: ["actionId"]
        }
      },
      {
        name: "execute_action",
        description: "Prepare to execute a specific action (requires confirmation)",
        inputSchema: {
          type: "object",
          properties: {
            actionId: {
              type: "string",
              description: "ID of the action to execute"
            },
            connectionKey: {
              type: "string",
              description: "Key of the connection to use"
            },
            method: {
              type: "string",
              description: "HTTP method (GET, POST, PUT, DELETE, etc.)"
            },
            path: {
              type: "string",
              description: "API path"
            },
            data: {
              type: "object",
              description: "Request data (for POST, PUT, etc.)"
            },
            pathVariables: {
              type: "object",
              description: "Variables to replace in the path"
            },
            queryParams: {
              type: "object",
              description: "Query parameters"
            },
            headers: {
              type: "object",
              description: "Additional headers"
            },
            isFormData: {
              type: "boolean",
              description: "Whether to send data as multipart/form-data"
            },
            isFormUrlEncoded: {
              type: "boolean",
              description: "Whether to send data as application/x-www-form-urlencoded"
            }
          },
          required: ["actionId", "connectionKey", "method", "path"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  await initializePica();

  switch (request.params.name) {
    case "list_user_connections_and_available_connectors": {
      await picaClient.refreshConnections();
      const connections = picaClient.getConnections();
      const activeConnections = connections.filter(conn => conn.active);

      const availableConnectors = picaClient.getConnectionDefinitions();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            connections: activeConnections.map(conn => ({
              key: conn.key,
              platform: conn.platform,
              active: conn.active
            })),
            availablePicaConnectors: availableConnectors.map(connector => ({
              title: connector.name,
              platform: connector.platform,
              image: connector.image
            })),
            message: `Found ${activeConnections.length} active connections in your Pica account.`
          }, null, 2)
        }]
      };
    }

    case "get_available_actions": {
      const platform = String(request.params.arguments?.platform);

      try {
        const actions = await picaClient.getAvailableActions(platform);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              platform,
              actions: actions.map((action: AvailableAction) => ({
                id: action._id,
                title: action.title,
                tags: action.tags || []
              }))
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message
            }, null, 2)
          }]
        };
      }
    }

    case "get_action_knowledge": {
      const actionId = String(request.params.arguments?.actionId);

      try {
        const action = await picaClient.getActionKnowledge(actionId);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              action: {
                id: action._id,
                title: action.title,
                knowledge: action.knowledge,
                path: action.path
              }
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message
            }, null, 2)
          }]
        };
      }
    }

    case "execute_action": {
      const {
        actionId,
        connectionKey,
        method,
        path,
        data,
        pathVariables,
        queryParams,
        headers,
        isFormData,
        isFormUrlEncoded
      } = request.params.arguments as any;

      try {
        const result = await picaClient.executeAction(
          actionId,
          connectionKey,
          method,
          path,
          data,
          pathVariables,
          queryParams,
          headers,
          isFormData,
          isFormUrlEncoded
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              result: result.responseData,
              requestConfig: {
                method,
                path,
                headers: Object.keys(result.requestConfig.headers || {})
              }
            }, null, 2)
          }]
        };
      } catch (error: any) {
        let errorMessage = error.message;

        if (error.response) {
          errorMessage = `${error.message} - Server responded with: ${JSON.stringify(error.response.data)}`;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: errorMessage
            }, null, 2)
          }]
        };
      }
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
