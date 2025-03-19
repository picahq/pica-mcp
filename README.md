# Pica MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) Server for [Pica](https://picaos.com), built in TypeScript.

Setup Video: https://youtu.be/JJ62NUEkKAs

Demo Video: https://youtu.be/0jeasO20PyM

## Development

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

## Installation

To use with [Claude Desktop](https://claude.ai/download), add the server config:

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`

On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

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

### Environment Setup

This server requires a [Pica API key](https://app.picaos.com/settings/api-keys). Set the environment variable:

```bash
export PICA_SECRET=your_pica_secret_key
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## Example Usage

Once you've added the server config and connected some platforms in the [Pica dashboard](https://app.picaos.com/connections), restart Claude Desktop and try out some examples:

- What connections do I have access to?
- Send an email using gmail to hello@picaos.com
- What actions can I perform with google sheets?
- Create an event in my calendar
- List 5 users from my postgres users table
- Send a message in slack to the #general channel with today's weather

Got any cool examples? [Open a PR](https://github.com/picahq/awesome-pica) and share them!

## License

This project is licensed under the GPL-3.0 license. See the [LICENSE](LICENSE) file for details.
