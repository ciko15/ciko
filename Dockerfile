# Use the official Bun image
FROM oven/bun:1.3.11-slim

# Create and define the application directory
WORKDIR /app

# Install system dependencies if any (e.g. for ping or snmp)
RUN apt-get update && apt-get install -y \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy the rest of the application code
COPY . .

# Expose the application port
EXPOSE 3100

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3100

# Start the application
CMD ["bun", "run", "server.js"]
