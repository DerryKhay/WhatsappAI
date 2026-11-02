FROM node:20-slim

# Install system dependencies (ca-certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source code and dashboard assets
COPY src/ ./src/
COPY public/ ./public/

# Expose web dashboard port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start bot and dashboard
CMD ["node", "src/index.js"]
