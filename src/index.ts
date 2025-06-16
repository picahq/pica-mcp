#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CreateMessageRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import FormData from 'form-data';

// Helper functions for generating prompt context
function formatConnectionsInfo(connections: Connection[]): string {
  if (connections.length === 0) {
    return "No active connections found. User needs to connect to platforms first.";
  }

  const groupedByPlatform = connections.reduce((acc, conn) => {
    if (!acc[conn.platform]) {
      acc[conn.platform] = [];
    }
    acc[conn.platform].push(conn.key);
    return acc;
  }, {} as Record<string, string[]>);

  return Object.entries(groupedByPlatform)
    .map(([platform, keys]) => `- ${platform}: ${keys.join(', ')}`)
    .join('\n');
}

function formatAvailablePlatformsInfo(connectionDefinitions: ConnectionDefinition[]): string {
  if (connectionDefinitions.length === 0) {
    return "No available platform information found.";
  }

  const platforms = connectionDefinitions
    .filter(def => def.active && !def.deprecated)
    .map(def => `- ${def.platform}: ${def.description}`)
    .join('\n');

  return platforms || "No active platforms available.";
}

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
      console.error("Failed to initialize connections:", error);
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
    if (!platform) {
      throw new Error("Platform name is required");
    }

    try {
      const headers = this.generateHeaders();
      const url = `${this.baseUrl}/v1/knowledge?supported=true&connectionPlatform=${encodeURIComponent(platform)}&limit=1000`;
      const response = await axios.get(url, { headers });
      return response.data?.rows || [];
    } catch (error) {
      console.error("Error fetching available actions:", error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch available actions: ${error.response?.status} ${error.response?.statusText}`);
      }
      throw new Error("Failed to fetch available actions");
    }
  }

  async getActionKnowledge(actionId: string) {
    if (!actionId) {
      throw new Error("Action ID is required");
    }

    try {
      const headers = this.generateHeaders();
      const url = `${this.baseUrl}/v1/knowledge?_id=${encodeURIComponent(actionId)}`;
      const response = await axios.get(url, { headers });

      if (!response.data.rows || response.data.rows.length === 0) {
        throw new Error(`Action with ID ${actionId} not found`);
      }

      return response.data.rows[0];
    } catch (error) {
      console.error("Error fetching action knowledge:", error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch action knowledge: ${error.response?.status} ${error.response?.statusText}`);
      }
      throw new Error("Failed to fetch action knowledge");
    }
  }

  public replacePathVariables(path: string, variables: Record<string, string | number | boolean>): string {
    if (!path) return path;

    return path.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const trimmedVariable = variable.trim();
      const value = variables[trimmedVariable];
      if (value === undefined || value === null || value === '') {
        throw new Error(`Missing value for path variable: ${trimmedVariable}`);
      }
      return encodeURIComponent(value.toString());
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

  async generateRequestConfig(
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

    return requestConfig;
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
      sampling: {},
    },
  }
);

// Validate required environment variables
const PICA_SECRET = process.env.PICA_SECRET;
if (!PICA_SECRET) {
  console.error("PICA_SECRET environment variable is required");
  process.exit(1);
}

const PICA_BASE_URL = process.env.PICA_BASE_URL || "https://api.picaos.com";
const picaClient = new PicaClient(PICA_SECRET, PICA_BASE_URL);

let picaInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializePica = async () => {
  if (picaInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      await picaClient.initialize();
      picaInitialized = true;
      console.error("Pica client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Pica client:", error);
      // Reset so we can try again next time
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
};

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  await initializePica();

  const resources = [];

  // Add connections as resources
  const connections = picaClient.getConnections();
  for (const connection of connections) {
    if (connection.active) {
      resources.push({
        uri: `pica-connection://${connection.platform}/${connection.key}`,
        name: `${connection.platform} Connection (${connection.key})`,
        description: `Active connection to ${connection.platform}`,
        mimeType: "application/json"
      });
    }
  }

  // Add unique platforms as resources
  const platforms = [...new Set(connections.map(c => c.platform))];
  for (const platform of platforms) {
    resources.push({
      uri: `pica-platform://${platform}`,
      name: `${platform} Actions`,
      description: `Available actions for ${platform}`,
      mimeType: "application/json"
    });
  }

  return {
    resources
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
  } else if (scheme === 'pica-action:') {
    const actionId = url.hostname;
    try {
      const action = await picaClient.getActionKnowledge(actionId);

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify({
            id: action._id,
            title: action.title,
            knowledge: action.knowledge,
            path: action.path,
            tags: action.tags || []
          }, null, 2)
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get action details: ${error.message}`);
    }
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
      },
      {
        name: "generate_action_config_knowledge",
        description: "Generate request configuration for an action using knowledge-based path handling, this is to be used when the user is asking you to write code.",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              description: "Platform name"
            },
            action: {
              type: "object",
              properties: {
                _id: {
                  type: "string",
                  description: "Action ID"
                },
                path: {
                  type: "string",
                  description: "Action path template with variables"
                }
              },
              required: ["_id", "path"],
              description: "Action object with ID and path"
            },
            method: {
              type: "string",
              description: "HTTP method (GET, POST, PUT, DELETE, etc.)"
            },
            connectionKey: {
              type: "string",
              description: "Key of the connection to use"
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
          required: ["platform", "action", "method", "connectionKey"]
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

    case "generate_action_config_knowledge": {
      const {
        platform,
        action,
        method,
        connectionKey,
        data,
        pathVariables,
        queryParams,
        headers,
        isFormData,
        isFormUrlEncoded
      } = request.params.arguments as any;

      try {
        // Check if connection exists
        const connections = picaClient.getConnections();
        if (!connections.some(conn => conn.key === connectionKey)) {
          throw new Error(`Connection not found. Please add a ${platform} connection first.`);
        }

        // Handle path variables from action.path
        const templateVariables = action.path.match(/\{\{([^}]+)\}\}/g);
        let resolvedPath = action.path;
        let finalPathVariables = pathVariables || {};
        let finalData = data;

        if (templateVariables) {
          const requiredVariables = templateVariables.map((v: string) => v.replace(/\{\{|\}\}/g, ''));
          const combinedVariables = {
            ...(Array.isArray(data) ? {} : (data || {})),
            ...(pathVariables || {})
          };

          const missingVariables = requiredVariables.filter((v: string) => !combinedVariables[v]);

          if (missingVariables.length > 0) {
            throw new Error(
              `Missing required path variables: ${missingVariables.join(', ')}. ` +
              `Please provide values for these variables.`
            );
          }

          // Clean up data object and prepare path variables
          if (!Array.isArray(data) && data) {
            finalData = { ...data };
            requiredVariables.forEach((v: string) => {
              if (finalData && finalData[v] && (!pathVariables || !pathVariables[v])) {
                finalPathVariables[v] = finalData[v];
                delete finalData[v];
              }
            });
          }

          resolvedPath = picaClient.replacePathVariables(action.path, finalPathVariables);
        }

        const requestConfig = await picaClient.generateRequestConfig(
          action._id,
          connectionKey,
          method,
          resolvedPath,
          finalData,
          finalPathVariables,
          queryParams,
          headers,
          isFormData,
          isFormUrlEncoded
        );

        // Generate TypeScript code example
        const tsCode = `
import axios from 'axios';

const requestConfig = ${JSON.stringify(requestConfig, null, 2)};

// Make the request
try {
  const response = await axios(requestConfig);
  console.log('Response:', response.data);
} catch (error) {
  console.error('Error:', error.response?.data || error.message);
}

IMPORTANT: For the Pica secret always use the environment variable PICA_SECRET.
`;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              title: "Request config returned",
              message: "Request config returned without execution. Use the TypeScript code below to make the HTTP request.",
              requestConfig,
              typeScriptCode: tsCode
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              title: "Failed to create request config",
              message: error.message
            }, null, 2)
          }]
        };
      }
    }

    default:
      throw new Error("Unknown tool");
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "create-api-integration",
        description: "Generate code for integrating with a specific API endpoint",
        arguments: [
          {
            name: "platform",
            description: "The platform to integrate with (e.g., slack, github)",
            required: true
          },
          {
            name: "action",
            description: "The specific action to perform",
            required: true
          },
          {
            name: "language",
            description: "Programming language for the integration (typescript, python, javascript)",
            required: false
          }
        ]
      },
      {
        name: "list-platform-actions",
        description: "Get a formatted list of available actions for a platform",
        arguments: [
          {
            name: "platform",
            description: "The platform to list actions for",
            required: true
          }
        ]
      },
      {
        name: "knowledge-agent-system",
        description: "System prompt with Pica Knowledge Agent capabilities for enhanced API guidance",
        arguments: [
          {
            name: "includeEnvironmentVariables",
            description: "Whether to include environment variable access in the prompt",
            required: false
          }
        ]
      },
      {
        name: "default-system",
        description: "Basic system prompt with Pica Intelligence Tools",
        arguments: []
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  await initializePica();
  const { name, arguments: args } = request.params;

  switch (name) {
    case "create-api-integration": {
      const platform = args?.platform;
      const action = args?.action;
      const language = args?.language || "typescript";

      if (!platform || !action) {
        throw new Error("Platform and action arguments are required");
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a ${language} integration for the ${platform} API to ${action}. Include proper error handling, type definitions (if applicable), and example usage.`
            }
          }
        ]
      };
    }

    case "list-platform-actions": {
      const platform = args?.platform;

      if (!platform) {
        throw new Error("Platform argument is required");
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `List all available actions for the ${platform} platform. Format the output as a categorized list with descriptions for each action.`
            }
          }
        ]
      };
    }

    case "knowledge-agent-system": {
      const includeEnvironmentVariables = args?.includeEnvironmentVariables || false;
      const connections = picaClient.getConnections().filter(conn => conn.active);
      const connectionDefinitions = picaClient.getConnectionDefinitions();

      const connectionsInfo = formatConnectionsInfo(connections);
      const availablePlatformsInfo = formatAvailablePlatformsInfo(connectionDefinitions);

      const envPrompt = includeEnvironmentVariables ? `

ENVIRONMENT VARIABLES:
You can access environment variables when needed for configuration or API keys.` : '';

      const systemPrompt = `You have access to Pica's Intelligence Tools with Knowledge Agent capabilities that can help you connect to various APIs and services.

ACTIVE CONNECTIONS:
${connectionsInfo}

AVAILABLE PLATFORMS:
${availablePlatformsInfo}${envPrompt}

You can:
1. Get available actions for any platform using getAvailableActions
2. Get detailed knowledge about specific actions using getActionKnowledge  
3. Generate request configurations (without executing) using execute

As a Knowledge Agent, you have enhanced understanding of API documentation and can provide detailed guidance on using various platforms and their APIs.

When using the execute tool, you will receive a TypeScript code block showing how to make the HTTP request using the Pica Passthrough API.

Always check what connections are available before attempting to use them.`;

      return {
        messages: [
          {
            role: "system",
            content: {
              type: "text",
              text: systemPrompt
            }
          }
        ]
      };
    }

    case "default-system": {
      const connections = picaClient.getConnections().filter(conn => conn.active);
      const connectionDefinitions = picaClient.getConnectionDefinitions();

      const connectionsInfo = formatConnectionsInfo(connections);
      const availablePlatformsInfo = formatAvailablePlatformsInfo(connectionDefinitions);

      const systemPrompt = `You have access to Pica's Intelligence Tools that can help you connect to various APIs and services.

ACTIVE CONNECTIONS:
${connectionsInfo}

AVAILABLE PLATFORMS:
${availablePlatformsInfo}

You can:
1. Get available actions for any platform using getAvailableActions
2. Get detailed knowledge about specific actions using getActionKnowledge  
3. Generate request configurations (without executing) using execute

When using the execute tool, you will receive a TypeScript code block showing how to make the HTTP request using the Pica Passthrough API.

Always check what connections are available before attempting to use them.`;

      return {
        messages: [
          {
            role: "system",
            content: {
              type: "text",
              text: systemPrompt
            }
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

server.setRequestHandler(CreateMessageRequestSchema, async (request) => {
  const { messages, modelPreferences } = request.params;

  // Extract context from the conversation
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error("Expected user message");
  }

  let content = '';
  if (typeof lastMessage.content === 'string') {
    content = lastMessage.content;
  } else if (typeof lastMessage.content === 'object' && 'text' in lastMessage.content) {
    content = (lastMessage.content as any).text || '';
  }

  // Analyze the request and generate appropriate response
  if (content.includes('generate') && content.includes('code')) {
    // Extract platform and action from context
    const platformMatch = content.match(/(?:for|using)\s+(\w+)/i);
    const actionMatch = content.match(/(?:to|for)\s+(.+?)(?:\.|$)/i);

    if (platformMatch && actionMatch) {
      const platform = platformMatch[1];
      const action = actionMatch[1];

      return {
        model: modelPreferences?.hints?.find(h => h.name === 'model')?.value || 'claude-3',
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll help you generate code for ${platform} to ${action}. First, let me check what actions are available for this platform...`
        }
      };
    }
  }

  // Default response
  return {
    model: modelPreferences?.hints?.find(h => h.name === 'model')?.value || 'claude-3',
    role: 'assistant',
    content: {
      type: 'text',
      text: "I can help you with Pica integrations. You can ask me to list connections, get available actions for a platform, or generate integration code."
    }
  };
});

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pica MCP server running on stdio");

    // Log debug info if requested
    if (process.env.DEBUG === 'true') {
      console.error("Debug mode enabled");
      console.error(`PICA_BASE_URL: ${PICA_BASE_URL}`);
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error("Shutting down server...");
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error("Shutting down server...");
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
