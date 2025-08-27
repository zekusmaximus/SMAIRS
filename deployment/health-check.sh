#!/bin/sh

# Health check script for SMAIRS application
# This script performs comprehensive health checks including:
# - Basic HTTP response
# - Application readiness
# - Critical functionality

set -e

# Configuration
HOST="localhost"
PORT="8080"
TIMEOUT=10
MAX_RETRIES=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

error() {
    log "${RED}ERROR: $1${NC}"
    exit 1
}

warn() {
    log "${YELLOW}WARNING: $1${NC}"
}

success() {
    log "${GREEN}SUCCESS: $1${NC}"
}

# Function to check HTTP endpoint
check_http() {
    local url="$1"
    local expected_status="$2"
    local description="$3"
    
    log "Checking $description..."
    
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time $TIMEOUT \
        --retry $MAX_RETRIES \
        --retry-delay 1 \
        "$url" || echo "000")
    
    if [ "$status" = "$expected_status" ]; then
        success "$description check passed (HTTP $status)"
        return 0
    else
        error "$description check failed (HTTP $status, expected $expected_status)"
        return 1
    fi
}

# Function to check response content
check_content() {
    local url="$1"
    local pattern="$2"
    local description="$3"
    
    log "Checking $description content..."
    
    local response
    response=$(curl -s --max-time $TIMEOUT \
        --retry $MAX_RETRIES \
        --retry-delay 1 \
        "$url" || echo "")
    
    if echo "$response" | grep -q "$pattern"; then
        success "$description content check passed"
        return 0
    else
        error "$description content check failed (pattern '$pattern' not found)"
        return 1
    fi
}

# Function to check application readiness
check_readiness() {
    local base_url="http://$HOST:$PORT"
    
    # Check if main page loads
    check_http "$base_url" "200" "Main application page"
    
    # Check if critical assets are available
    check_http "$base_url/assets" "200" "Static assets"
    
    # Check health endpoint
    check_http "$base_url/health" "200" "Health endpoint"
    check_content "$base_url/health" "healthy" "Health endpoint response"
    
    # Check if JavaScript bundles are available
    local js_files
    js_files=$(curl -s "$base_url" | grep -o 'src="[^"]*\.js"' | sed 's/src="//;s/"//' | head -3)
    
    for js_file in $js_files; do
        if [ -n "$js_file" ]; then
            check_http "$base_url$js_file" "200" "JavaScript bundle $js_file"
        fi
    done
    
    # Check if CSS files are available
    local css_files
    css_files=$(curl -s "$base_url" | grep -o 'href="[^"]*\.css"' | sed 's/href="//;s/"//' | head -3)
    
    for css_file in $css_files; do
        if [ -n "$css_file" ]; then
            check_http "$base_url$css_file" "200" "CSS file $css_file"
        fi
    done
}

# Function to check performance metrics
check_performance() {
    local base_url="http://$HOST:$PORT"
    
    log "Checking application performance..."
    
    # Measure response time
    local response_time
    response_time=$(curl -o /dev/null -s -w "%{time_total}" \
        --max-time $TIMEOUT \
        "$base_url")
    
    # Convert to milliseconds
    response_time_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "$response_time")
    
    log "Response time: ${response_time_ms}ms"
    
    # Check if response time is acceptable (< 2 seconds)
    if [ "$(echo "$response_time < 2" | bc 2>/dev/null || echo 0)" = "1" ]; then
        success "Response time is acceptable"
    else
        warn "Response time is slow (${response_time}s)"
    fi
}

# Function to check memory usage
check_memory() {
    log "Checking memory usage..."
    
    local memory_usage
    memory_usage=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2 }')
    
    log "Memory usage: ${memory_usage}%"
    
    # Warning if memory usage > 80%
    if [ "$(echo "$memory_usage > 80" | bc 2>/dev/null || echo 0)" = "1" ]; then
        warn "High memory usage: ${memory_usage}%"
    else
        success "Memory usage is normal"
    fi
}

# Function to check disk space
check_disk() {
    log "Checking disk space..."
    
    local disk_usage
    disk_usage=$(df /usr/share/nginx/html | awk 'NR==2 {print $5}' | sed 's/%//')
    
    log "Disk usage: ${disk_usage}%"
    
    # Warning if disk usage > 90%
    if [ "$disk_usage" -gt 90 ]; then
        warn "High disk usage: ${disk_usage}%"
    else
        success "Disk usage is normal"
    fi
}

# Main health check function
main() {
    log "Starting SMAIRS health check..."
    
    # Basic checks
    check_readiness
    
    # Performance checks
    check_performance
    
    # System resource checks
    check_memory
    check_disk
    
    success "All health checks passed!"
    exit 0
}

# Run the health check
main "$@"