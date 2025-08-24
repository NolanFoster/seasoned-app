#!/bin/bash

# Deploy and Test Script for Auth Worker
# This script deploys the worker to different environments and runs tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WORKER_NAME="auth-worker"
TEST_EMAIL="test@example.com"

# Functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "Deploy and Test Script for Auth Worker"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --env <environment>     Deploy to specific environment (preview, staging, production)"
    echo "  --deploy-only           Only deploy, don't run tests"
    echo "  --test-only             Only run tests, don't deploy"
    echo "  --email <email>         Email address for testing (default: test@example.com)"
    echo "  --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env preview"
    echo "  $0 --env staging --email developer@company.com"
    echo "  $0 --env production --deploy-only"
    echo "  $0 --test-only --env preview"
}

# Parse command line arguments
ENVIRONMENT=""
DEPLOY_ONLY=false
TEST_ONLY=false
EMAIL="test@example.com"

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --deploy-only)
            DEPLOY_ONLY=true
            shift
            ;;
        --test-only)
            TEST_ONLY=true
            shift
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ -n "$ENVIRONMENT" ]]; then
    case $ENVIRONMENT in
        preview|staging|production)
            ;;
        *)
            error "Invalid environment: $ENVIRONMENT"
            error "Valid environments: preview, staging, production"
            exit 1
            ;;
    esac
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    error "wrangler is not installed. Please install it first:"
    error "npm install -g wrangler"
    exit 1
fi

# Check if we're in the right directory
if [[ ! -f "wrangler.toml" ]]; then
    error "wrangler.toml not found. Please run this script from the auth-worker directory."
    exit 1
fi

# Deploy function
deploy_worker() {
    local env=$1
    log "Deploying to $env environment..."
    
    if [[ "$env" == "preview" ]]; then
        wrangler deploy --env preview
    elif [[ "$env" == "staging" ]]; then
        wrangler deploy --env staging
    elif [[ "$env" == "production" ]]; then
        wrangler deploy --env production
    else
        wrangler deploy
    fi
    
    success "Deployed to $env environment successfully!"
}

# Test function
test_worker() {
    local env=$1
    local email=$2
    
    log "Testing $env environment with email: $email"
    
    # Set environment variable and run tests
    export TEST_ENV="$env"
    node test-email.js "$email" "TEST$(date +%s)" 15
    
    success "Tests completed for $env environment!"
}

# Main execution
main() {
    log "Starting deploy and test process..."
    log "Worker: $WORKER_NAME"
    log "Test Email: $EMAIL"
    
    if [[ -n "$ENVIRONMENT" ]]; then
        log "Target Environment: $ENVIRONMENT"
    else
        log "Target Environment: local (default)"
    fi
    
    # Deploy if requested
    if [[ "$TEST_ONLY" == false ]]; then
        if [[ -n "$ENVIRONMENT" ]]; then
            deploy_worker "$ENVIRONMENT"
        else
            warning "No environment specified, skipping deployment"
        fi
    fi
    
    # Test if requested
    if [[ "$DEPLOY_ONLY" == false ]]; then
        if [[ -n "$ENVIRONMENT" ]]; then
            test_worker "$ENVIRONMENT" "$EMAIL"
        else
            log "Testing local environment..."
            test_worker "local" "$EMAIL"
        fi
    fi
    
    success "Deploy and test process completed!"
}

# Run main function
main "$@"
