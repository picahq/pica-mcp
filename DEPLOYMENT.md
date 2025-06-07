# Deploying Pica MCP Server to Vercel

This guide will help you deploy your Pica MCP server to Vercel.

## Prerequisites

1. A [Vercel account](https://vercel.com/signup)
2. [Vercel CLI](https://vercel.com/docs/cli) installed (`npm i -g vercel`)
3. Your Pica API secret key

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables in Vercel

You need to set up your environment variables in Vercel. You can do this via the Vercel dashboard or CLI.

#### Option 1: Using Vercel CLI (Recommended for first deployment):

During your first deployment, Vercel will prompt you to set environment variables:

```bash
vercel
# When prompted for environment variables, enter:
# PICA_SECRET: your-pica-secret-here
# PICA_BASE_URL: https://api.picaos.com (or press Enter to use default)
```

#### Option 2: Using Vercel Dashboard:

1. Go to your project settings in Vercel (after first deployment)
2. Navigate to "Environment Variables"
3. Add the following variables:
   - `PICA_SECRET`: Your Pica API secret key (required)
   - `PICA_BASE_URL`: The Pica API base URL (optional, defaults to https://api.picaos.com)

#### Option 3: Using Vercel CLI with Environment Variables:

```bash
vercel env add PICA_SECRET
# Enter your secret when prompted

vercel env add PICA_BASE_URL  
# Enter https://api.picaos.com or your custom URL
```

### 3. Deploy to Vercel

#### First Deployment:

```bash
vercel
```

Follow the prompts to:
- Link to an existing project or create a new one
- Configure your project settings

#### Subsequent Deployments:

```bash
vercel --prod
```

## Project Structure

```
pica-mcp/
├── api/
│   └── [transport]/
│       └── route.ts       # Vercel serverless function entry point
├── src/
│   └── index.ts           # Original MCP server (for local development)
├── package.json           # Dependencies
├── vercel.json            # Vercel configuration
└── tsconfig.json          # TypeScript configuration
```

## How It Works

- The `api/[transport]/route.ts` file uses the `@vercel/mcp-adapter` to wrap your MCP server as a Vercel serverless function
- The `[transport]` dynamic route automatically handles different MCP transport types
- All MCP tools, resources, and prompts are automatically exposed through the Vercel deployment
- The server handles authentication using the `PICA_SECRET` environment variable
- HTTP transport is available at `/api/mcp` (recommended for most use cases)

## Testing Your Deployment

Once deployed, your MCP server will be available at:

```
https://your-project-name.vercel.app
```

You can test it using any MCP-compatible client by pointing to this URL.

## Available Tools

Your deployed server exposes the following tools:

1. **list_user_connections_and_available_connectors** - List all connections and available platforms
2. **get_available_actions** - Get available actions for a specific platform
3. **get_action_knowledge** - Get detailed information about a specific action
4. **execute_action** - Execute a specific API action
5. **generate_action_config_knowledge** - Generate request configuration for code generation

## Security Notes

- Always use environment variables for sensitive data like `PICA_SECRET`
- Never commit secrets to your repository
- Use Vercel's built-in secrets management for production deployments

## Troubleshooting

If you encounter issues:

1. Check the Vercel function logs: `vercel logs`
2. Ensure your environment variables are properly set
3. Verify your Pica API secret is valid
4. Check that the Pica API base URL is correct (if using a custom one)

## Local Development

For local development, you can still use the original MCP server:

```bash
npm run inspector
```

This will run the server locally using the MCP inspector tool. 