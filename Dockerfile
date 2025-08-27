# Multi-stage build for optimal production deployment
# Stage 1: Build environment
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build:production

# Stage 2: Runtime environment
FROM nginx:alpine AS runtime

# Install additional tools for health checks
RUN apk add --no-cache curl

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY deployment/nginx.conf /etc/nginx/nginx.conf
COPY deployment/default.conf /etc/nginx/conf.d/default.conf

# Copy health check script
COPY deployment/health-check.sh /usr/local/bin/health-check.sh
RUN chmod +x /usr/local/bin/health-check.sh

# Create nginx user
RUN addgroup -g 1001 -S nginx-app && \
    adduser -S nginx-app -G nginx-app

# Set ownership
RUN chown -R nginx-app:nginx-app /usr/share/nginx/html && \
    chown -R nginx-app:nginx-app /var/cache/nginx && \
    chown -R nginx-app:nginx-app /var/log/nginx && \
    chown -R nginx-app:nginx-app /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx-app:nginx-app /var/run/nginx.pid

# Switch to non-root user
USER nginx-app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Labels for metadata
LABEL maintainer="SMAIRS Team" \
      version="1.0.0" \
      description="SMAIRS Production Application" \
      org.opencontainers.image.source="https://github.com/company/smairs"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]