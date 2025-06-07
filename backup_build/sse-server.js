#!/usr/bin/env node
import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import FormData from 'form-data';
class PicaClient {
    secret;
    connections = [];
    connectionDefinitions = [];
    baseUrl;
    constructor(secret, baseUrl = "https://api.picaos.com") {
        this.secret = secret;
        this.baseUrl = baseUrl;
    }
    generateHeaders() {
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
    async initializeConnections() {
        try {
            await this.refreshConnections();
        }
        catch (error) {
            console.error("Failed to initialize connections:", error);
            this.connections = [];
        }
    }
    async initializeConnectionDefinitions() {
        try {
            const headers = this.generateHeaders();
            const url = `${this.baseUrl}/v1/available-connectors?limit=500`;
            const response = await axios.get(url, { headers });
            this.connectionDefinitions = response.data?.rows || [];
        }
        catch (error) {
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
        }
        catch (error) {
            console.error("Failed to fetch connections:", error);
            return this.connections;
        }
    }
    async getAvailableActions(platform) {
        if (!platform) {
            throw new Error("Platform name is required");
        }
        try {
            const headers = this.generateHeaders();
            const url = `${this.baseUrl}/v1/knowledge?supported=true&connectionPlatform=${encodeURIComponent(platform)}&limit=1000`;
            const response = await axios.get(url, { headers });
            return response.data?.rows || [];
        }
        catch (error) {
            console.error("Error fetching available actions:", error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch available actions: ${error.response?.status} ${error.response?.statusText}`);
            }
            throw new Error("Failed to fetch available actions");
        }
    }
    async getActionKnowledge(actionId) {
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
        }
        catch (error) {
            console.error("Error fetching action knowledge:", error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch action knowledge: ${error.response?.status} ${error.response?.statusText}`);
            }
            throw new Error("Failed to fetch action knowledge");
        }
    }
    replacePathVariables(path, variables) {
        if (!path)
            return path;
        return path.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
            const trimmedVariable = variable.trim();
            const value = variables[trimmedVariable];
            if (value === undefined || value === null || value === '') {
                throw new Error(`Missing value for path variable: ${trimmedVariable}`);
            }
            return encodeURIComponent(value.toString());
        });
    }
    async executeAction(actionId, connectionKey, method, path, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded) {
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
            const requestConfig = {
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
                            }
                            else {
                                formData.append(key, value);
                            }
                        });
                    }
                    requestConfig.data = formData;
                    Object.assign(requestConfig.headers, formData.getHeaders());
                }
                else if (isFormUrlEncoded) {
                    const params = new URLSearchParams();
                    if (data && typeof data === 'object' && !Array.isArray(data)) {
                        Object.entries(data).forEach(([key, value]) => {
                            if (typeof value === 'object') {
                                params.append(key, JSON.stringify(value));
                            }
                            else {
                                params.append(key, String(value));
                            }
                        });
                    }
                    requestConfig.data = params;
                }
                else {
                    requestConfig.data = data;
                }
            }
            const response = await axios(requestConfig);
            return {
                responseData: response.data,
                requestConfig
            };
        }
        catch (error) {
            console.error("Error executing action:", error);
            throw error;
        }
    }
    async generateRequestConfig(actionId, connectionKey, method, path, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded) {
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
        const requestConfig = {
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
                        }
                        else {
                            formData.append(key, value);
                        }
                    });
                }
                requestConfig.data = formData;
                Object.assign(requestConfig.headers, formData.getHeaders());
            }
            else if (isFormUrlEncoded) {
                const params = new URLSearchParams();
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    Object.entries(data).forEach(([key, value]) => {
                        if (typeof value === 'object') {
                            params.append(key, JSON.stringify(value));
                        }
                        else {
                            params.append(key, String(value));
                        }
                    });
                }
                requestConfig.data = params;
            }
            else {
                requestConfig.data = data;
            }
        }
        return requestConfig;
    }
}
// Validate required environment variables
const PICA_SECRET = process.env.PICA_SECRET;
if (!PICA_SECRET) {
    console.error("PICA_SECRET environment variable is required");
    process.exit(1);
}
const PICA_BASE_URL = process.env.PICA_BASE_URL || "https://api.picaos.com";
const PORT = parseInt(process.env.PORT || "3000");
const picaClient = new PicaClient(PICA_SECRET, PICA_BASE_URL);
let picaInitialized = false;
let initializationPromise = null;
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
            console.log("Pica client initialized successfully");
        }
        catch (error) {
            console.error("Failed to initialize Pica client:", error);
            initializationPromise = null;
            throw error;
        }
    })();
    return initializationPromise;
};
// Create the MCP server
function createServer() {
    const server = new Server({
        name: "pica-mcp-server",
        version: "0.1.0",
    }, {
        capabilities: {
            resources: {},
            tools: {},
        },
    });
    // Set up all the request handlers (same as stdio version)
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        await initializePica();
        return { resources: [] };
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
                            text: JSON.stringify(actions.map((action) => ({
                                id: action._id,
                                title: action.title,
                                tags: action.tags || []
                            })), null, 2)
                        }]
                };
            }
            catch (error) {
                throw new Error(`Failed to get platform actions: ${error.message}`);
            }
        }
        else if (scheme === 'pica-connection:') {
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
                            actionId: { type: "string", description: "ID of the action to execute" },
                            connectionKey: { type: "string", description: "Key of the connection to use" },
                            method: { type: "string", description: "HTTP method (GET, POST, PUT, DELETE, etc.)" },
                            path: { type: "string", description: "API path" },
                            data: { type: "object", description: "Request data (for POST, PUT, etc.)" },
                            pathVariables: { type: "object", description: "Variables to replace in the path" },
                            queryParams: { type: "object", description: "Query parameters" },
                            headers: { type: "object", description: "Additional headers" },
                            isFormData: { type: "boolean", description: "Whether to send data as multipart/form-data" },
                            isFormUrlEncoded: { type: "boolean", description: "Whether to send data as application/x-www-form-urlencoded" }
                        },
                        required: ["actionId", "connectionKey", "method", "path"]
                    }
                },
                {
                    name: "generate_action_config_knowledge",
                    description: "Generate request configuration for an action using knowledge-based path handling",
                    inputSchema: {
                        type: "object",
                        properties: {
                            platform: { type: "string", description: "Platform name" },
                            action: {
                                type: "object",
                                properties: {
                                    _id: { type: "string", description: "Action ID" },
                                    path: { type: "string", description: "Action path template with variables" }
                                },
                                required: ["_id", "path"],
                                description: "Action object with ID and path"
                            },
                            method: { type: "string", description: "HTTP method (GET, POST, PUT, DELETE, etc.)" },
                            connectionKey: { type: "string", description: "Key of the connection to use" },
                            data: { type: "object", description: "Request data (for POST, PUT, etc.)" },
                            pathVariables: { type: "object", description: "Variables to replace in the path" },
                            queryParams: { type: "object", description: "Query parameters" },
                            headers: { type: "object", description: "Additional headers" },
                            isFormData: { type: "boolean", description: "Whether to send data as multipart/form-data" },
                            isFormUrlEncoded: { type: "boolean", description: "Whether to send data as application/x-www-form-urlencoded" }
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
                                    actions: actions.map((action) => ({
                                        id: action._id,
                                        title: action.title,
                                        tags: action.tags || []
                                    }))
                                }, null, 2)
                            }]
                    };
                }
                catch (error) {
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({ success: false, error: error.message }, null, 2)
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
                }
                catch (error) {
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({ success: false, error: error.message }, null, 2)
                            }]
                    };
                }
            }
            case "execute_action": {
                const { actionId, connectionKey, method, path, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded } = request.params.arguments;
                try {
                    const result = await picaClient.executeAction(actionId, connectionKey, method, path, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded);
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({
                                    success: true,
                                    result: result.responseData,
                                    requestConfig: {
                                        method, path,
                                        headers: Object.keys(result.requestConfig.headers || {})
                                    }
                                }, null, 2)
                            }]
                    };
                }
                catch (error) {
                    let errorMessage = error.message;
                    if (error.response) {
                        errorMessage = `${error.message} - Server responded with: ${JSON.stringify(error.response.data)}`;
                    }
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({ success: false, error: errorMessage }, null, 2)
                            }]
                    };
                }
            }
            case "generate_action_config_knowledge": {
                const { platform, action, method, connectionKey, data, pathVariables, queryParams, headers, isFormData, isFormUrlEncoded } = request.params.arguments;
                try {
                    const connections = picaClient.getConnections();
                    if (!connections.some(conn => conn.key === connectionKey)) {
                        throw new Error(`Connection not found. Please add a ${platform} connection first.`);
                    }
                    const templateVariables = action.path.match(/\{\{([^}]+)\}\}/g);
                    let resolvedPath = action.path;
                    let finalPathVariables = pathVariables || {};
                    let finalData = data;
                    if (templateVariables) {
                        const requiredVariables = templateVariables.map((v) => v.replace(/\{\{|\}\}/g, ''));
                        const combinedVariables = {
                            ...(Array.isArray(data) ? {} : (data || {})),
                            ...(pathVariables || {})
                        };
                        const missingVariables = requiredVariables.filter((v) => !combinedVariables[v]);
                        if (missingVariables.length > 0) {
                            throw new Error(`Missing required path variables: ${missingVariables.join(', ')}. ` +
                                `Please provide values for these variables.`);
                        }
                        if (!Array.isArray(data) && data) {
                            finalData = { ...data };
                            requiredVariables.forEach((v) => {
                                if (finalData && finalData[v] && (!pathVariables || !pathVariables[v])) {
                                    finalPathVariables[v] = finalData[v];
                                    delete finalData[v];
                                }
                            });
                        }
                        resolvedPath = picaClient.replacePathVariables(action.path, finalPathVariables);
                    }
                    const requestConfig = await picaClient.generateRequestConfig(action._id, connectionKey, method, resolvedPath, finalData, finalPathVariables, queryParams, headers, isFormData, isFormUrlEncoded);
                    const tsCode = `
import axios from 'axios';

const requestConfig = ${JSON.stringify(requestConfig, null, 2)};

// Make the request
try {
  const response = await axios(requestConfig);
  console.log('Response:', response.data);
} catch (error) {
  console.error('Error:', error.response?.data || error.message);
}`;
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
                }
                catch (error) {
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
    return server;
}
// Create Express app
const app = express();
// Enable CORS for all routes
app.use(cors({
    origin: "*", // In production, specify your actual origins
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
// Store active SSE transports
const transports = new Map();
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// SSE endpoint - establishes the Server-Sent Events connection
app.get("/sse", async (req, res) => {
    try {
        console.log("New SSE connection established");
        const server = createServer();
        const transport = new SSEServerTransport("/messages", res);
        // Store transport for message handling
        transports.set(transport.sessionId, transport);
        // Clean up on connection close
        res.on("close", () => {
            console.log(`SSE connection closed: ${transport.sessionId}`);
            transports.delete(transport.sessionId);
        });
        // Connect the server to the transport
        await server.connect(transport);
        console.log(`MCP server connected via SSE: ${transport.sessionId}`);
    }
    catch (error) {
        console.error("Error establishing SSE connection:", error);
        res.status(500).json({ error: "Failed to establish SSE connection" });
    }
});
// Message endpoint - handles incoming MCP messages
app.post("/messages", async (req, res) => {
    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: "sessionId query parameter is required" });
        }
        const transport = transports.get(sessionId);
        if (!transport) {
            return res.status(404).json({ error: "Session not found. Please establish SSE connection first." });
        }
        // Handle the message through the transport
        await transport.handlePostMessage(req, res, req.body);
    }
    catch (error) {
        console.error("Error handling message:", error);
        res.status(500).json({ error: "Failed to handle message" });
    }
});
// Start server
async function main() {
    try {
        // Initialize Pica client
        await initializePica();
        app.listen(PORT, () => {
            console.log(`🚀 Pica MCP SSE Server running on http://localhost:${PORT}`);
            console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
            console.log(`📤 Messages endpoint: http://localhost:${PORT}/messages`);
            console.log(`🏥 Health check: http://localhost:${PORT}/health`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log("Shutting down SSE server...");
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log("Shutting down SSE server...");
    process.exit(0);
});
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
