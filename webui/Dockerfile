FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install ALL dependencies including devDependencies (needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Build Server
# Using npx to ensure we use the local typescript version
RUN npx tsc -p tsconfig.server.json

# Cleanup dev dependencies to reduce image size
RUN npm prune --production

# Expose port
EXPOSE 8383

# Environment variables (default to production)
ENV NODE_ENV=production
ENV PORT=8383

# Start server
CMD ["node", "dist/server/index.js"]
