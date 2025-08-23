import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from './types/env';
import { UserDatabaseService } from './services/user-database';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check endpoint
app.get('/health', async (c) => {
  const env = c.env;
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT,
    services: {
      d1: 'unknown'
    }
  };

  try {
    // Test D1 access
    const result = await env.USER_DB.prepare('SELECT 1 as test').first();
    if (result?.test === 1) {
      health.services.d1 = 'healthy';
    }
  } catch (error) {
    // If table doesn't exist, try to check if D1 is accessible
    try {
      await env.USER_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").first();
      health.services.d1 = 'healthy';
    } catch (innerError) {
      health.services.d1 = 'unhealthy';
      health.status = 'degraded';
      console.error('D1 health check failed:', error);
    }
  }

  // Determine overall health
  const unhealthyServices = Object.values(health.services).filter(status => status === 'unhealthy');
  if (unhealthyServices.length === Object.keys(health.services).length) {
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 503 : 500;

  return c.json(health, statusCode);
});

// User Management Endpoints

// Create new user
app.post('/users', async (c) => {
  try {
    const body = await c.req.json();
    const { email_hash, email_encrypted, status, account_type, email_verified, two_factor_enabled } = body;

    if (!email_hash || typeof email_hash !== 'string') {
      return c.json({
        success: false,
        message: 'Email hash is required and must be a string'
      }, 400);
    }

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.createUser({
      email_hash,
      email_encrypted,
      status,
      account_type,
      email_verified,
      two_factor_enabled
    });

    if (result.success) {
      return c.json({
        success: true,
        message: 'User created successfully',
        data: result.data
      }, 201);
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error creating user:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Get user by ID
app.get('/users/:user_id', async (c) => {
  try {
    const user_id = c.req.param('user_id');
    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.getUserById(user_id);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 404);
    }
  } catch (error) {
    console.error('Error getting user:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Get user by email hash
app.get('/users/email/:email_hash', async (c) => {
  try {
    const email_hash = c.req.param('email_hash');
    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.getUserByEmailHash(email_hash);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 404);
    }
  } catch (error) {
    console.error('Error getting user by email hash:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Update user
app.put('/users/:user_id', async (c) => {
  try {
    const user_id = c.req.param('user_id');
    const body = await c.req.json();
    const { status, account_type, email_verified, two_factor_enabled } = body;

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.updateUser(user_id, {
      status,
      account_type,
      email_verified,
      two_factor_enabled
    });

    if (result.success) {
      return c.json({
        success: true,
        message: 'User updated successfully',
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Delete user
app.delete('/users/:user_id', async (c) => {
  try {
    const user_id = c.req.param('user_id');
    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.deleteUser(user_id);

    if (result.success) {
      return c.json({
        success: true,
        message: 'User deleted successfully',
        affectedRows: result.data?.affectedRows
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Get users with pagination
app.get('/users', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    if (page < 1 || limit < 1 || limit > 100) {
      return c.json({
        success: false,
        message: 'Invalid pagination parameters'
      }, 400);
    }

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.getUsersWithPagination(page, limit);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error getting users:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Search users
app.get('/users/search/:query', async (c) => {
  try {
    const query = c.req.param('query');
    const limit = parseInt(c.req.query('limit') || '20');

    if (!query || query.length < 2) {
      return c.json({
        success: false,
        message: 'Search query must be at least 2 characters'
      }, 400);
    }

    if (limit < 1 || limit > 100) {
      return c.json({
        success: false,
        message: 'Invalid limit parameter'
      }, 400);
    }

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.searchUsers(query, limit);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error searching users:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Get users by status
app.get('/users/status/:status', async (c) => {
  try {
    const status = c.req.param('status') as 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    
    if (!['ACTIVE', 'SUSPENDED', 'DELETED'].includes(status)) {
      return c.json({
        success: false,
        message: 'Invalid status parameter'
      }, 400);
    }

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.getUsersByStatus(status);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error getting users by status:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Login History Endpoints

// Create login history record
app.post('/login-history', async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, ip_address, user_agent, location_data, country, region, city, latitude, longitude, timezone, login_method, success, failure_reason, device_fingerprint, risk_score } = body;

    if (!user_id || !login_method || success === undefined) {
      return c.json({
        success: false,
        message: 'user_id, login_method, and success are required'
      }, 400);
    }

    if (!['OTP', 'MAGIC_LINK'].includes(login_method)) {
      return c.json({
        success: false,
        message: 'Invalid login method'
      }, 400);
    }

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.createLoginHistory({
      user_id,
      ip_address,
      user_agent,
      location_data,
      country,
      region,
      city,
      latitude,
      longitude,
      timezone,
      login_method,
      success,
      failure_reason,
      device_fingerprint,
      risk_score
    });

    if (result.success) {
      return c.json({
        success: true,
        message: 'Login history created successfully',
        data: result.data
      }, 201);
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error creating login history:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Get recent login activity
app.get('/login-history/recent', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');

    if (limit < 1 || limit > 100) {
      return c.json({
        success: false,
        message: 'Invalid limit parameter'
      }, 400);
    }

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.getRecentLoginActivity(limit);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 400);
    }
  } catch (error) {
    console.error('Error getting recent login activity:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Get user statistics
app.get('/users/:user_id/statistics', async (c) => {
  try {
    const user_id = c.req.param('user_id');
    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.getUserStatistics(user_id);

    if (result.success) {
      return c.json({
        success: true,
        data: result.data
      });
    } else {
      return c.json({
        success: false,
        message: result.error
      }, 404);
    }
  } catch (error) {
    console.error('Error getting user statistics:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'user-management-worker',
    version: '1.0.0',
    description: 'User management and database operations worker',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint'
      },
      {
        path: '/users',
        method: 'POST',
        description: 'Create new user',
        body: { email_hash: 'string', email_encrypted: 'string?', status: 'string?', account_type: 'string?', email_verified: 'boolean?', two_factor_enabled: 'boolean?' }
      },
      {
        path: '/users/:user_id',
        method: 'GET',
        description: 'Get user by ID'
      },
      {
        path: '/users/email/:email_hash',
        method: 'GET',
        description: 'Get user by email hash'
      },
      {
        path: '/users/:user_id',
        method: 'PUT',
        description: 'Update user',
        body: { status: 'string?', account_type: 'string?', email_verified: 'boolean?', two_factor_enabled: 'boolean?' }
      },
      {
        path: '/users/:user_id',
        method: 'DELETE',
        description: 'Delete user'
      },
      {
        path: '/users',
        method: 'GET',
        description: 'Get users with pagination',
        query: { page: 'number?', limit: 'number?' }
      },
      {
        path: '/users/search/:query',
        method: 'GET',
        description: 'Search users',
        query: { limit: 'number?' }
      },
      {
        path: '/users/status/:status',
        method: 'GET',
        description: 'Get users by status'
      },
      {
        path: '/users/:user_id/statistics',
        method: 'GET',
        description: 'Get user statistics'
      },
      {
        path: '/login-history',
        method: 'POST',
        description: 'Create login history record',
        body: { user_id: 'string', login_method: 'OTP|MAGIC_LINK', success: 'boolean' }
      },
      {
        path: '/login-history/recent',
        method: 'GET',
        description: 'Get recent login activity',
        query: { limit: 'number?' }
      }
    ]
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `The requested endpoint ${c.req.path} does not exist`
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`Error handling request: ${err}`);
  return c.json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  }, 500);
});

export default app;
