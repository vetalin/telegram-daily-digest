# Multi-stage build for Node.js and Python
FROM node:18-alpine AS node-base

# Install Python and build dependencies
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm ci --only=production

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy TypeScript source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install Python runtime
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Copy built application
COPY --from=node-base /app/dist ./dist
COPY --from=node-base /app/node_modules ./node_modules
COPY --from=node-base /app/package*.json ./

# Copy Python dependencies
COPY --from=node-base /usr/lib/python3.*/site-packages /usr/lib/python3.11/site-packages

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]