# Pica MCP Server

[![smithery badge](https://smithery.ai/badge/@picahq/pica)](https://smithery.ai/server/@picahq/pica)

<img src="https://assets.picaos.com/github/pica-mcp.svg" alt="Pica MCP Banner" style="border-radius: 5px;">

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io)  server that integrates with the Pica API platform, enabling seamless interaction with various third-party services through a standardized interface. Features enhanced intent detection, improved security, and robust code generation capabilities.

**Setup Video:** https://youtu.be/JJ62NUEkKAs

**Demo Video:** https://youtu.be/0jeasO20PyM

## Features

### 🔧 Tools
- **list_user_connections_and_available_connectors** - List all available connectors and active connections
- **get_available_actions** - Get available actions for a specific platform
- **get_action_knowledge** - Get detailed information about a specific action including API documentation
- **execute_action** - Execute API actions immediately with full parameter support
- **generate_action_config_knowledge** - Generate secure, production-ready request configurations for code integration

### 📚 Resources
- **pica-platform://{platform}** - Browse available actions for a platform
- **pica-connection://{platform}/{key}** - View connection details
- **pica-action://{actionId}** - Get detailed action information with knowledge base

## Key Capabilities

### 🎯 **Smart Intent Detection**
The server automatically detects whether you want to:
- **Execute actions immediately**: "read my emails", "send this message now"
- **Generate integration code**: "write code to send emails", "create a UI for messaging"

### 🔒 **Enhanced Security**
- Never exposes secrets in generated code
- Uses environment variables: `PICA_SECRET`, `PICA_[PLATFORM]_CONNECTION_KEY`
- Sanitized request configurations for production use

### 🌐 **Multi-Language Support**
Generate production-ready code in:
- TypeScript/JavaScript
- Python
- Go, PHP, and more
- Auto-detects language from context or asks user

### ⚡ **Production-Ready Code Generation**
- Real, working HTTP requests (no demo code)
- Proper error handling and type definitions
- Clean, maintainable code structure
- Environment variable best practices

## Installation

```bash
npm install @picahq/pica-mcp
```

## Deployment Options

### Deploy to Vercel

You can deploy this MCP server to Vercel for remote access:

1. Install dependencies including Vercel adapter:
   ```bash
   npm install @vercel/mcp-adapter zod
   ```

2. Deploy to Vercel:
   ```bash
   vercel
   ```

3. Configure your MCP client to use the remote server:
   - **For Cursor**: `https://your-project.vercel.app/api/mcp`
   - **For Claude/Cline**: Use `npx mcp-remote https://your-project.vercel.app/api/mcp`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed Vercel deployment instructions.

## Usage

### As a Standalone Server

```bash
npx @picahq/pica-mcp
```

### In Claude Desktop

To use with [Claude Desktop](https://claude.ai/download), add the server config:

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`

On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pica": {
      "command": "npx",
      "args": ["@picahq/pica-mcp"],
      "env": {
        "PICA_SECRET": "your-pica-secret-key"
      }
    }
  }
}
```

### In Cursor

In the Cursor menu, select "MCP Settings" and update the MCP JSON file to include the following:

```json
{
  "mcpServers": {
    "pica": {
      "command": "npx",
      "args": ["@picahq/pica-mcp"],
      "env": {
        "PICA_SECRET": "your-pica-secret-key"
      }
    }
  }
}
```

### Using Docker

Build the Docker Image:

```bash
docker build -t pica-mcp-server .
```

Run the Docker Container:

```bash
docker run -e PICA_SECRET=your_pica_secret_key pica-mcp-server
```

### Installing via Smithery

To install pica for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@picahq/pica):

```bash
npx -y @smithery/cli install @picahq/pica --client claude
```

## Usage Examples

### 🚀 **Execute Actions Immediately**

**Natural Language:**
> "Read my last 5 emails from Gmail"

**What happens:**
1. Server detects execution intent
2. Finds Gmail connection
3. Executes action immediately
4. Returns actual email data

### 🔧 **Generate Integration Code**

**Natural Language:**
> "Create a React UI and write the code to send emails using Gmail"

**What happens:**
1. Server detects code generation intent
2. Gets Gmail send email action knowledge
3. Generates sanitized request configuration
4. AI creates production-ready React + API code
5. Uses environment variables for security

## Intent Detection Guide

The server automatically detects your intent based on natural language:

### ✅ **Execute Immediately**
- "Read my emails"
- "Send this message now" 
- "Get my GitHub repositories"
- "Create a new Slack channel"
- "Delete this file"

### ✅ **Generate Code**
- "Write code to read emails"
- "Create a UI for messaging"
- "Build an app that syncs data"
- "Show me how to implement this"
- "Generate integration code"

### ❓ **When Unclear**
The server will ask: *"Would you like me to execute this action now, or generate code for you to use?"*

### 🔐 **Required Environment Variables**
```bash
# Always required
PICA_SECRET=your-pica-secret-key

# Required when generating code for specific platforms
PICA_GMAIL_CONNECTION_KEY=your-gmail-connection-key
PICA_SLACK_CONNECTION_KEY=your-slack-connection-key
# etc.
```

## API Reference

### Tools

#### execute_action
Execute a specific action immediately and return actual results. Use ONLY when the user wants immediate action execution.

**When to use:** "send this email now", "get my data", "create this item"

**Parameters:**
- `actionId` (string, required): Action ID
- `connectionKey` (string, required): Connection key
- `method` (string, required): HTTP method
- `path` (string, required): API path
- `data` (object, optional): Request body
- `pathVariables` (object, optional): Path variables for URL templating
- `queryParams` (object, optional): Query parameters
- `headers` (object, optional): Additional headers
- `isFormData` (boolean, optional): Send as multipart/form-data
- `isFormUrlEncoded` (boolean, optional): Send as URL-encoded

**Returns:**
- `result`: Actual API response data
- `requestConfig`: Sanitized request configuration (no secrets)

#### generate_action_config_knowledge
Generate secure request configuration for building real integration code. Use when the user wants to build apps, write code, or create integrations.

**When to use:** "write code", "build an app", "create a UI", "show me how to implement"

**Parameters:**
- `platform` (string, required): Platform name
- `action` (object, required): Action object with _id and path
- `method` (string, required): HTTP method
- `connectionKey` (string, required): Connection key
- `language` (string, optional): Programming language
- `data` (object, optional): Request body
- `pathVariables` (object, optional): Path variables for URL templating
- `queryParams` (object, optional): Query parameters
- `headers` (object, optional): Additional headers
- `isFormData` (boolean, optional): Send as multipart/form-data
- `isFormUrlEncoded` (boolean, optional): Send as URL-encoded

**Returns:**
- `requestConfig`: Sanitized request configuration with environment variables
- `environmentVariables`: Required environment variables and descriptions
- `actionKnowledge`: API documentation and parameter details
- `codeGenerationInstructions`: Guidelines for creating production code
- `exampleUsage`: Code structure example

## Error Handling

The server implements comprehensive error handling:

- ✅ Connection validation before action execution
- ✅ Path variable validation and substitution  
- ✅ Missing parameter detection with helpful error messages
- ✅ Graceful handling of API failures
- ✅ Detailed error messages for debugging
- ✅ Security validation for generated configurations

## Security

- 🔐 API keys passed via environment variables only
- 🛡️ Connections validated before use
- 🔒 All requests include proper authentication headers
- 🚫 Secrets never exposed in generated code or responses
- ✅ Request configurations sanitized for production use
- ⚡ Platform-specific environment variable naming
- 🔍 Sensitive headers filtered from responses
- 🛡️ Input validation and sanitization
- 🔐 Secure authentication patterns enforced
- ❌ No hardcoded API keys or credentials
- ✅ Production-ready code generation
- 🔒 Environment variable validation on startup

## License

GPL-3.0

## Support

For support, please contact support@picaos.com or visit https://picaos.com
