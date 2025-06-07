import { createMcpHandler } from '@vercel/mcp-adapter';
import { z } from 'zod';
import axios from 'axios';
import FormData from 'form-data';

// Helper functions
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

// Types
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

// Pica Client Class
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

// Singleton instance management
let picaClient: PicaClient | null = null;
let picaInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializePica = async () => {
  if (picaInitialized && picaClient) {
    return;
  }
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  const PICA_SECRET = process.env.PICA_SECRET;
  if (!PICA_SECRET) {
    throw new Error("PICA_SECRET environment variable is required");
  }

  const PICA_BASE_URL = process.env.PICA_BASE_URL || "https://api.picaos.com";
  
  initializationPromise = (async () => {
    try {
      picaClient = new PicaClient(PICA_SECRET, PICA_BASE_URL);
      await picaClient.initialize();
      picaInitialized = true;
      console.error("Pica client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Pica client:", error);
      initializationPromise = null;
      throw error;
    }
  })();
  
  return initializationPromise;
};

// Create the MCP handler
const handler = createMcpHandler((server) => {
  // Tool: list_user_connections_and_available_connectors
  server.tool(
    "list_user_connections_and_available_connectors",
    "List all available connectors offered by Pica and connections in the user's Pica account",
    {},
    async () => {
      await initializePica();
      if (!picaClient) throw new Error("Pica client not initialized");

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
  );

  // Tool: get_available_actions
  server.tool(
    "get_available_actions",
    "Get available actions for a specific platform",
    {
      platform: z.string().describe("Platform name")
    },
    async ({ platform }) => {
      await initializePica();
      if (!picaClient) throw new Error("Pica client not initialized");

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
  );

  // Tool: get_action_knowledge
  server.tool(
    "get_action_knowledge",
    "Get detailed information about a specific action",
    {
      actionId: z.string().describe("ID of the action")
    },
    async ({ actionId }) => {
      await initializePica();
      if (!picaClient) throw new Error("Pica client not initialized");

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
  );

  // Tool: execute_action
  server.tool(
    "execute_action",
    "Prepare to execute a specific action (requires confirmation)",
    {
      actionId: z.string().describe("ID of the action to execute"),
      connectionKey: z.string().describe("Key of the connection to use"),
      method: z.string().describe("HTTP method (GET, POST, PUT, DELETE, etc.)"),
      path: z.string().describe("API path"),
      data: z.any().optional().describe("Request data (for POST, PUT, etc.)"),
      pathVariables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Variables to replace in the path"),
      queryParams: z.record(z.any()).optional().describe("Query parameters"),
      headers: z.record(z.string()).optional().describe("Additional headers"),
      isFormData: z.boolean().optional().describe("Whether to send data as multipart/form-data"),
      isFormUrlEncoded: z.boolean().optional().describe("Whether to send data as application/x-www-form-urlencoded")
    },
    async ({ actionId, connectionKey, method, path, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded }) => {
      await initializePica();
      if (!picaClient) throw new Error("Pica client not initialized");

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
  );

  // Tool: generate_action_config_knowledge
  server.tool(
    "generate_action_config_knowledge",
    "Generate request configuration for an action using knowledge-based path handling, this is to be used when the user is asking you to write code.",
    {
      platform: z.string().describe("Platform name"),
      action: z.object({
        _id: z.string().describe("Action ID"),
        path: z.string().describe("Action path template with variables")
      }).describe("Action object with ID and path"),
      method: z.string().describe("HTTP method (GET, POST, PUT, DELETE, etc.)"),
      connectionKey: z.string().describe("Key of the connection to use"),
      data: z.any().optional().describe("Request data (for POST, PUT, etc.)"),
      pathVariables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Variables to replace in the path"),
      queryParams: z.record(z.any()).optional().describe("Query parameters"),
      headers: z.record(z.string()).optional().describe("Additional headers"),
      isFormData: z.boolean().optional().describe("Whether to send data as multipart/form-data"),
      isFormUrlEncoded: z.boolean().optional().describe("Whether to send data as application/x-www-form-urlencoded")
    },
    async ({ platform, action, method, connectionKey, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded }) => {
      await initializePica();
      if (!picaClient) throw new Error("Pica client not initialized");

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
  );
});

export { handler as GET, handler as POST, handler as DELETE }; 