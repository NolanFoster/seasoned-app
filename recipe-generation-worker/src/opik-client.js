/**
 * Opik Tracing Client for Recipe Generation
 * Provides tracing and observability around the original recipe generation methods
 */

import { Opik } from 'opik';

/**
 * Opik Tracing Client - adds tracing around existing recipe generation methods
 */
export class OpikClient {
  constructor(apiKey = null, workspaceName = 'recipe-generation') {
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

    try {
      console.log('Attempting to initialize Opik client with API key length:', this.apiKey.length);
      this.client = new Opik({
        apiKey: this.apiKey,
        apiUrl: 'https://www.comet.com/opik/api',
        projectName: 'recipe-generation',
        workspaceName: this.workspaceName
      });
      console.log('Opik client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Opik client:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      this.client = null;
    }
  }

  /**
   * Set API key from environment variable
   * @param {string} envApiKey - API key from environment
   */
  setApiKey(envApiKey) {
    console.log('Setting Opik API key, provided key length:', envApiKey ? envApiKey.length : 'null/undefined');
    if (envApiKey && envApiKey.trim() !== '') {
      this.apiKey = envApiKey;
      console.log('API key set, attempting initialization...');
      this.initializeClient();
    } else {
      console.log('Invalid API key provided, disabling Opik client');
      this.apiKey = null;
      this.client = null;
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
   * Get detailed health status for debugging
   * @returns {Object} Health status details
   */
  getHealthStatus() {
    return {
      isHealthy: this.isHealthy(),
      hasApiKey: this.apiKey !== null && this.apiKey !== undefined,
      apiKeyLength: this.apiKey ? this.apiKey.length : 0,
      hasClient: this.client !== null,
      workspaceName: this.workspaceName
    };
  }

  /**
   * Create a trace for recipe generation
   * @param {string} operationName - Name of the operation being traced
   * @param {Object} input - Input data for the trace (map from strings to any)
   * @param {Object} output - Output data for the trace (map from strings to any, optional)
   * @param {Object} metadata - Additional metadata (optional)
   * @param {string} startTime - Actual start time (optional, defaults to now)
   * @param {string} endTime - Actual end time (optional, defaults to now if output provided)
   * @returns {Object} Opik trace object
   */
  createTrace(operationName, input = {}, output = null, metadata = null, startTime = null, endTime = null) {
    if (!this.client) {
      console.warn('Opik client not initialized, skipping tracing');
      return null;
    }

    try {
      const tracePayload = {
        start_time: startTime || new Date().toISOString(),
        name: operationName,
        input: input,
        ...(output && { output: output }),
        ...(output && { end_time: endTime || new Date().toISOString() }),
        ...(metadata && { metadata: metadata })
      };

      //console.log('Creating trace with payload:', JSON.stringify(tracePayload, null, 2));
      const trace = this.client.trace(tracePayload);
      //console.log('Trace created successfully:', trace ? 'success' : 'failed');
      return trace;
    } catch (error) {
      console.error('Failed to create Opik trace:', {
        message: error.message,
        stack: error.stack,
        input: input,
        output: output
      });
      return null;
    }
  }

  /**
   * Create a span for a specific operation within a trace
   * @param {Object} trace - Opik trace object
   * @param {string} spanName - Name of the span
   * @param {string} spanType - Type of the span (valid values: 'general', 'tool', 'llm', 'guardrail')
   * @param {Object} input - Input data for the span (map from strings to any)
   * @param {Object} output - Output data for the span (map from strings to any, optional)
   * @param {Object} options - Additional options (metadata, model, provider, tags, etc.)
   * @param {string} startTime - Actual start time (optional, defaults to now)
   * @param {string} endTime - Actual end time (optional, defaults to now if output provided)
   * @returns {Object} Opik span object
   */
  createSpan(trace, spanName, spanType, input = {}, output = null, options = {}, startTime = null, endTime = null) {
    if (!trace) {
      console.warn('Cannot create span: trace is null');
      return null;
    }

    try {
      const spanPayload = {
        start_time: startTime || new Date().toISOString(),
        name: spanName,
        type: spanType,
        input: input,
        ...(output && { output: output }),
        ...(output && { end_time: endTime || new Date().toISOString() }),
        ...(options.metadata && { metadata: options.metadata }),
        ...(options.model && { model: options.model }),
        ...(options.provider && { provider: options.provider }),
        ...(options.tags && { tags: options.tags })
      };

      //console.log(`Creating span "${spanName}" with payload:`, JSON.stringify(spanPayload, null, 2));
      const span = trace.span(spanPayload);
      //console.log('Span created successfully:', span ? 'success' : 'failed');
      return span;
    } catch (error) {
      console.error('Failed to create Opik span:', {
        message: error.message,
        stack: error.stack,
        spanName: spanName,
        spanType: spanType,
        input: input,
        output: output,
        options: options
      });
      return null;
    }
  }

  /**
   * End a span
   * @param {Object} span - Opik span object
   * @param {Error} error - Error if the operation failed
   */
  endSpan(span, error = null) {
    if (!span) {
      console.warn('Cannot end span: span is null');
      return;
    }

    try {
      if (error) {
        console.log('Ending span with error:', error.message);
        span.error(error);
      } else {
        console.log('Ending span successfully');
        span.end();
      }
    } catch (spanError) {
      console.error('Failed to end Opik span:', {
        message: spanError.message,
        stack: spanError.stack
      });
    }
  }

  /**
   * End a trace
   * @param {Object} trace - Opik trace object
   * @param {Error} error - Error if the operation failed
   */
  endTrace(trace, error = null) {
    if (!trace) {
      console.warn('Cannot end trace: trace is null');
      return;
    }

    try {
      if (error) {
        console.log('Ending trace with error:', error.message);
        trace.error(error);
      } else {
        console.log('Ending trace successfully');
        trace.end();
      }
    } catch (traceError) {
      console.error('Failed to end Opik trace:', {
        message: traceError.message,
        stack: traceError.stack
      });
    }
  }

  /**
   * Flush the Opik client to ensure all data is sent
   */
  async flush() {
    if (!this.client) {
      console.warn('Opik client not initialized, skipping flush');
      return;
    }

    try {
      console.log('Flushing Opik client...');
      await this.client.flush();
      console.log('Opik client flushed successfully');
    } catch (error) {
      console.error('Failed to flush Opik client:', {
        message: error.message,
        stack: error.stack
      });
    }
  }
}

/**
 * Factory function to create an Opik client instance
 * @param {string} apiKey - Opik API key
 * @param {string} workspaceName - Workspace name for the client
 * @returns {OpikClient} New Opik client instance
 */
export function createOpikClient(apiKey = null, workspaceName = 'recipe-generation') {
  return new OpikClient(apiKey, workspaceName);
}

