# Pica MCP Server

[![smithery badge](https://smithery.ai/badge/@picahq/pica)](https://smithery.ai/server/@picahq/pica)

![Pica MCP Banner](https://assets.picaos.com/github/mcp.jpeg)

A [Model Context Protocol](https://modelcontextprotocol.io) Server for [Pica](https://picaos.com), built in TypeScript.

<a href="https://glama.ai/mcp/servers/@picahq/mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@picahq/mcp-server/badge" alt="Pica Server MCP server" />
</a>

**Setup Video:** https://youtu.be/JJ62NUEkKAs

**Demo Video:** https://youtu.be/0jeasO20PyM

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is a system that lets AI apps, like [Claude Desktop](https://claude.ai/download), connect to external tools and data sources. It gives a clear and safe way for AI assistants to work with local services and APIs while keeping the user in control.

## What is Pica?

[Pica](https://picaos.com) is a powerful agentic tooling platform that enables connections to 70+ third-party services and applications. This MCP server allows Claude Desktop and anything using the [Model Context Protocol](https://modelcontextprotocol.io) to securely interact with all these connections through natural language requests.

With Pica MCP Server, you can:

- **Access Multiple Data Sources**: Query databases, fetch files, and retrieve information across services
- **Automate Workflows**: Trigger actions and automate tasks across your connected platforms
- **Enhance LLM Capabilities**: Give Claude Desktop powerful real-world capabilities through API access

### Supported Connections

Pica supports [70+ connections](https://app.picaos.com/tools) (with more added regularly) across categories like:

#### Communication & Collaboration
- Gmail, Outlook Mail, Slack, Teams, SendGrid
- Notion, Google Drive, Dropbox, OneDrive

#### Data & Analytics
- PostgreSQL, BigQuery, Supabase
- Google Sheets, Airtable

#### Business & CRM
- Salesforce, HubSpot, Pipedrive, Zoho
- Zendesk, Freshdesk, Intercom

#### AI & ML Services
- OpenAI, Anthropic, Gemini, ElevenLabs

#### E-commerce & Financial
- Shopify, BigCommerce, Square, Stripe
- QuickBooks, Xero, NetSuite

## Installation 🛠️

### Installing via Smithery

To install pica for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@picahq/pica):

```bash
npx -y @smithery/cli install @picahq/pica --client claude
```

### Environment Setup

This server requires a [Pica API key](https://app.picaos.com/settings/api-keys). Set the environment variable:

```bash
export PICA_SECRET=your_pica_secret_key
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

### Manual Installation

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

### Using Claude Desktop

To use with [Claude Desktop](https://claude.ai/download), add the server config:

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`

On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

#### Docker

To use the Docker container with Claude Desktop, update your `claude_desktop_config.json` with:

```json
{
  "mcpServers": {
    "pica-mcp-server": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "PICA_SECRET=YOUR_PICA_SECRET_KEY",
        "pica-mcp-server"
      ]
    }
  }
}
```

#### Manual

```json
{
  "mcpServers": {
    "pica-mcp-server": {
      "command": "node",
      "args": [
        "/path/to/pica-mcp-server/build/index.js"
      ],
      "env": {
        "PICA_SECRET": "YOUR_PICA_SECRET_KEY"
      }
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## Example Usage ✨

Once you've added the server config and connected some platforms in the [Pica dashboard](https://app.picaos.com/connections), restart Claude Desktop and try out some examples:

### Communication & Productivity
- Send an email using Gmail to a colleague with a meeting summary
- Create a calendar event in Google Calendar for next Tuesday at 2pm
- Send a message in Slack to the #marketing channel with the latest campaign metrics
- Find documents in Google Drive related to Q3 planning

### Data Access & Analysis
- List the top 10 customers from my PostgreSQL database
- Create a new sheet in Google Sheets with sales data
- Query Salesforce for opportunities closing this month
- Update a Notion database with project statuses

### Business Operations
- Create a support ticket in Zendesk from customer feedback
- Process a refund for a customer order in Stripe
- Add a new lead to HubSpot from a website inquiry
- Generate an invoice in QuickBooks for a client project

### AI & Content
- Generate an image with DALL-E based on product specifications
- Transcribe a meeting recording with ElevenLabs
- Research market trends using Tavily or SerpApi
- Analyze customer sentiment from support tickets

Got any cool examples? [Open a PR](https://github.com/picahq/awesome-pica) and share them!

## License

This project is licensed under the GPL-3.0 license. See the [LICENSE](LICENSE) file for details.