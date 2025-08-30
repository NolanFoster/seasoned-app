/**
 * Type definitions and constants for the recipe feeder worker
 */

// Environment constants
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PREVIEW: 'preview',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

// Default configuration values
export const DEFAULT_CONFIG = {
  BATCH_SIZE: 100,
  CHUNK_SIZE: 50,
  MAX_CYCLES: 1,
  MAX_PROCESSING_TIME_MS: 50000,
  VECTOR_DIMENSIONS: 384,
  CONCURRENCY_LIMIT: 5
};

// Queue configuration
export const QUEUE_CONFIG = {
  EMBEDDING_QUEUE_NAME: 'recipe-embedding-queue',
  MAX_BATCH_SIZE: 50,
  MAX_BATCH_TIMEOUT: 30
};

// Error types
export const ERROR_TYPES = {
  KV_SCAN_ERROR: 'kv_scan_error',
  VECTOR_CHECK_ERROR: 'vector_check_error',
  QUEUE_ERROR: 'queue_error',
  CHUNK_ERROR: 'chunk_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error'
};

// Status constants
export const STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  PARTIAL: 'partial',
  TIMEOUT: 'timeout'
};