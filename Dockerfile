FROM node:20-slim

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Copy source files BEFORE npm install
COPY tsconfig.json ./
COPY src/ ./src/

# Install dependencies without running prepare script
RUN npm install --ignore-scripts

# Build the application manually
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Run the server
CMD ["node", "build/index.js"] 