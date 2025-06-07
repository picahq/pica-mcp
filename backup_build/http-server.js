#!/usr/bin/env node
import express from "express";
import cors from "cors";
import axios from "axios";
// Environment validation
const PICA_SECRET = process.env.PICA_SECRET;
if (!PICA_SECRET) {
    console.error("PICA_SECRET environment variable is required");
    process.exit(1);
}
const PICA_BASE_URL = process.env.PICA_BASE_URL || "https://api.picaos.com";
const PORT = parseInt(process.env.PORT || "3000");
// Simple PicaClient for HTTP server
class PicaClient {
    secret;
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
    async getConnections() {
        try {
            const headers = this.generateHeaders();
            const url = `${this.baseUrl}/v1/vault/connections?limit=300`;
            const response = await axios.get(url, { headers });
            return response.data?.rows || [];
        }
        catch (error) {
            console.error("Failed to fetch connections:", error);
            return [];
        }
    }
    async getAvailableActions(platform) {
        try {
            const headers = this.generateHeaders();
            const url = `${this.baseUrl}/v1/knowledge?supported=true&connectionPlatform=${encodeURIComponent(platform)}&limit=1000`;
            const response = await axios.get(url, { headers });
            return response.data?.rows || [];
        }
        catch (error) {
            console.error("Failed to fetch actions:", error);
            return [];
        }
    }
    async executeAction(actionId, connectionKey, method, path, data) {
        try {
            const headers = {
                ...this.generateHeaders(),
                'x-pica-connection-key': connectionKey,
                'x-pica-action-id': actionId,
            };
            const url = `${this.baseUrl}/v1/passthrough${path.startsWith('/') ? path : '/' + path}`;
            const requestConfig = {
                url,
                method,
                headers
            };
            if (method?.toLowerCase() !== 'get' && data) {
                requestConfig.data = data;
            }
            const response = await axios(requestConfig);
            return response.data;
        }
        catch (error) {
            console.error("Error executing action:", error);
            throw error;
        }
    }
}
const picaClient = new PicaClient(PICA_SECRET, PICA_BASE_URL);
// Express app setup
const app = express();
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "Pica MCP HTTP Server",
        version: "0.1.0"
    });
});
// Server info endpoint
app.get("/info", (req, res) => {
    res.json({
        name: "Pica MCP Server",
        version: "0.1.0",
        transport: "HTTP",
        endpoints: {
            health: "/health",
            info: "/info",
            connections: "/connections",
            actions: "/actions/:platform",
            execute: "/execute"
        }
    });
});
// API endpoints
app.get("/connections", async (req, res) => {
    try {
        const connections = await picaClient.getConnections();
        res.json({
            success: true,
            connections: connections.map((conn) => ({
                key: conn.key,
                platform: conn.platform,
                active: conn.active
            }))
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to fetch connections"
        });
    }
});
app.get("/actions/:platform", async (req, res) => {
    try {
        const platform = req.params.platform;
        const actions = await picaClient.getAvailableActions(platform);
        res.json({
            success: true,
            platform,
            actions: actions.map((action) => ({
                id: action._id,
                title: action.title,
                tags: action.tags || []
            }))
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to fetch actions"
        });
    }
});
app.post("/execute", async (req, res) => {
    try {
        const { actionId, connectionKey, method, path, data } = req.body;
        if (!actionId || !connectionKey || !method || !path) {
            return res.status(400).json({
                success: false,
                error: "Missing required parameters: actionId, connectionKey, method, path"
            });
        }
        const result = await picaClient.executeAction(actionId, connectionKey, method, path, data);
        res.json({
            success: true,
            result
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "Failed to execute action"
        });
    }
});
// For SSE-like functionality, we can create a simple streaming endpoint
app.get("/events", (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);
    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        console.log('SSE client disconnected');
    });
});
// Start the server
async function main() {
    try {
        app.listen(PORT, () => {
            console.log(`🚀 Pica MCP HTTP Server running on http://localhost:${PORT}`);
            console.log(`🏥 Health check: http://localhost:${PORT}/health`);
            console.log(`ℹ️  Server info: http://localhost:${PORT}/info`);
            console.log(`🔗 Connections: http://localhost:${PORT}/connections`);
            console.log(`⚡ Actions: http://localhost:${PORT}/actions/{platform}`);
            console.log(`🎯 Execute: POST http://localhost:${PORT}/execute`);
            console.log(`📡 Events (SSE): http://localhost:${PORT}/events`);
            console.log(`\nTo run with environment: PICA_SECRET=your_secret npm run http`);
        });
    }
    catch (error) {
        console.error("Failed to start HTTP server:", error);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log("\nShutting down HTTP server...");
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log("\nShutting down HTTP server...");
    process.exit(0);
});
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
