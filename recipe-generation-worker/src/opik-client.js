/**
 * Opik Tracing Client for Recipe Generation
 * Provides tracing and observability around the original recipe generation methods
 */

import { Opik } from 'opik';

/**
 * Opik Tracing Client - adds tracing around existing recipe generation methods
 */
export class OpikClient {
  constructor(apiKey = null, workspaceName = 'recipe-generation-worker') {
    this.apiKey = apiKey;
    this.workspaceName = workspaceName;
    this.client = null;

    if (this.apiKey) {
      this.initializeClient();
    }
  }

  /**
   * Initialize the Opik client
   */
  initializeClient() {
    if (!this.apiKey) {
      throw new Error('API key is required to initialize Opik client');
    }

    this.client = new Opik({
      apiKey: this.apiKey,
      apiUrl: 'https://www.comet.com/opik/api',
      projectName: 'recipe-generation-worker',
      workspaceName: this.workspaceName
    });
  }

  /**
   * Set API key from environment variable
   * @param {string} envApiKey - API key from environment
   */
  setApiKey(envApiKey) {
    if (envApiKey) {
      this.apiKey = envApiKey;
      this.initializeClient();
    }
  }

  /**
   * Check if the Opik client is healthy and ready for tracing
   * @returns {boolean} True if client is ready for tracing
   */
  isHealthy() {
    return this.client !== null;
  }

  /**
   * Create a trace for recipe generation
   * @param {string} operationName - Name of the operation being traced
   * @param {Object} input - Input data for the trace
   * @returns {Object} Opik trace object
   */
  createTrace(operationName, input = {}) {
    if (!this.client) {
      console.warn('Opik client not initialized, skipping tracing');
      return null;
    }

    try {
      return this.client.trace({
        name: operationName,
        input: input
      });
    } catch (error) {
      console.warn('Failed to create Opik trace:', error.message);
      return null;
    }
  }

  /**
   * Create a span for a specific operation within a trace
   * @param {Object} trace - Opik trace object
   * @param {string} spanName - Name of the span
   * @param {string} spanType - Type of the span (e.g., 'llm', 'embedding', 'search')
   * @param {Object} input - Input data for the span
   * @returns {Object} Opik span object
   */
  createSpan(trace, spanName, spanType, input = {}) {
    if (!trace) {
      return null;
    }

    try {
      return trace.span({
        name: spanName,
        type: spanType,
        input: input
      });
    } catch (error) {
      console.warn('Failed to create Opik span:', error.message);
      return null;
    }
  }

  /**
   * End a span and record the result
   * @param {Object} span - Opik span object
   * @param {Object} output - Output data from the operation
   * @param {Error} error - Error if the operation failed
   */
  endSpan(span, output = null, error = null) {
    if (!span) {
      return;
    }

    try {
      if (error) {
        span.error(error);
      } else {
        span.end(output);
      }
    } catch (spanError) {
      console.warn('Failed to end Opik span:', spanError.message);
    }
  }

  /**
   * End a trace and record the final result
   * @param {Object} trace - Opik trace object
   * @param {Object} output - Final output data
   * @param {Error} error - Error if the operation failed
   */
  endTrace(trace, output = null, error = null) {
    if (!trace) {
      return;
    }

    try {
      if (error) {
        trace.error(error);
      } else {
        trace.end(output);
      }
    } catch (traceError) {
      console.warn('Failed to end Opik trace:', traceError.message);
    }
  }
}

/**
 * Factory function to create an Opik client instance
 * @param {string} apiKey - Opik API key
 * @param {string} workspaceName - Workspace name for the client
 * @returns {OpikClient} New Opik client instance
 */
export function createOpikClient(apiKey = null, workspaceName = 'recipe-generation-worker') {
  return new OpikClient(apiKey, workspaceName);
}

/**
 * Default Opik client instance
 */
export const opikClient = new OpikClient();

