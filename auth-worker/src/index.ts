import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from './types/env';
import { storeOTP, verifyOTPForEmail, hasOTP, deleteOTP, getOTPStats } from './utils/otp-manager';
import { SESService } from './services/ses-service';

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
      otp_kv: 'unknown',
      user_management: 'unknown',
      ses: 'unknown'
    }
  };

  try {
    // Test OTP_KV access
    const testKey = '__health_check_otp__';
    await env.OTP_KV.put(testKey, new Date().toISOString(), {
      expirationTtl: 60 // Expire after 1 minute
    });
    const otpKvValue = await env.OTP_KV.get(testKey);
    if (otpKvValue) {
      health.services.otp_kv = 'healthy';
    }
  } catch (error) {
    health.services.otp_kv = 'unhealthy';
    health.status = 'degraded';
    console.error('OTP_KV health check failed:', error);
  }

  try {
    // Test User Management Worker connectivity
    const response = await fetch(`${env.USER_MANAGEMENT_WORKER_URL}/health`);
    if (response.ok) {
      health.services.user_management = 'healthy';
    } else {
      health.services.user_management = 'unhealthy';
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.user_management = 'unhealthy';
    health.status = 'degraded';
    console.error('User Management Worker health check failed:', error);
  }

  try {
    // Test AWS SES configuration
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      health.services.ses = 'healthy';
    } else {
      health.services.ses = 'unhealthy';
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.ses = 'unhealthy';
    health.status = 'degraded';
    console.error('SES configuration check failed:', error);
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

// OTP Endpoints

// Generate and store OTP
app.post('/otp/generate', async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return c.json({
        success: false,
        message: 'Email is required and must be a string'
      }, 400);
    }

    // Check if OTP already exists
    const existingOTP = await hasOTP(c.env.OTP_KV, email);
    if (existingOTP) {
      return c.json({
        success: false,
        message: 'OTP already exists for this email. Please wait for it to expire or verify it first.'
      }, 409);
    }

    const result = await storeOTP(c.env.OTP_KV, email);
    
    if (result.success) {
      // Send verification email if in production
      if (c.env.ENVIRONMENT === 'production' && result.otp) {
        try {
          const sesService = new SESService(c.env);
          const emailResult = await sesService.sendVerificationEmail(email, result.otp, 10);
          
          if (!emailResult.success) {
            console.error('Failed to send verification email:', emailResult.error);
            // Don't fail the OTP generation if email fails, but log it
          }
        } catch (emailError) {
          console.error('Error sending verification email:', emailError);
          // Don't fail the OTP generation if email fails
        }
      }

      return c.json({
        success: true,
        message: 'OTP generated successfully',
        // In production, you would send this via email instead of returning it
        otp: c.env.ENVIRONMENT === 'production' ? undefined : result.otp,
        emailSent: c.env.ENVIRONMENT === 'production'
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 500);
    }
  } catch (error) {
    console.error('Error generating OTP:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Verify OTP
app.post('/otp/verify', async (c) => {
  try {
    const body = await c.req.json();
    const { email, otp } = body;

    if (!email || typeof email !== 'string') {
      return c.json({
        success: false,
        message: 'Email is required and must be a string'
      }, 400);
    }

    if (!otp || typeof otp !== 'string') {
      return c.json({
        success: false,
        message: 'OTP is required and must be a string'
      }, 400);
    }

    const result = await verifyOTPForEmail(c.env.OTP_KV, email, otp);
    
    if (result.success) {
      // Create or update user in User Management Worker
      try {
        const emailHash = result.user_id; // This should be the email hash from OTP verification
        
        // Check if user exists
        const userResponse = await fetch(`${c.env.USER_MANAGEMENT_WORKER_URL}/users/email/${emailHash}`);
        
        if (!userResponse.ok) {
          // User doesn't exist, create new user
          const createUserResponse = await fetch(`${c.env.USER_MANAGEMENT_WORKER_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email_hash: emailHash,
              account_type: 'FREE'
            })
          });
          
          if (!createUserResponse.ok) {
            console.error('Failed to create user in User Management Worker');
          }
        }
        
        // Record successful login
        const loginResponse = await fetch(`${c.env.USER_MANAGEMENT_WORKER_URL}/login-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: emailHash,
            login_method: 'OTP',
            success: true,
            ip_address: c.req.header('CF-Connecting-IP'),
            user_agent: c.req.header('User-Agent')
          })
        });
        
        if (!loginResponse.ok) {
          console.error('Failed to record login history');
        }
      } catch (userError) {
        console.error('Error managing user data:', userError);
        // Don't fail the OTP verification if user management fails
      }
    }
    
    const statusCode = result.success ? 200 : 400;
    return c.json(result, statusCode);
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Check OTP status
app.get('/otp/status/:email', async (c) => {
  try {
    const email = c.req.param('email');

    if (!email) {
      return c.json({
        success: false,
        message: 'Email parameter is required'
      }, 400);
    }

    const stats = await getOTPStats(c.env.OTP_KV, email);
    
    return c.json({
      success: true,
      exists: stats.exists,
      attempts: stats.attempts,
      expiresAt: stats.expiresAt
    });
  } catch (error) {
    console.error('Error getting OTP status:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Delete OTP (admin/cleanup endpoint)
app.delete('/otp/:email', async (c) => {
  try {
    const email = c.req.param('email');

    if (!email) {
      return c.json({
        success: false,
        message: 'Email parameter is required'
      }, 400);
    }

    const deleted = await deleteOTP(c.env.OTP_KV, email);
    
    return c.json({
      success: deleted,
      message: deleted ? 'OTP deleted successfully' : 'Failed to delete OTP'
    });
  } catch (error) {
    console.error('Error deleting OTP:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Send verification email manually
app.post('/email/send-verification', async (c) => {
  try {
    const body = await c.req.json();
    const { email, otp, expiryMinutes = 10 } = body;

    console.log('📧 Email verification request:', { email, otp, expiryMinutes });

    if (!email || typeof email !== 'string') {
      return c.json({
        success: false,
        message: 'Email is required and must be a string'
      }, 400);
    }

    if (!otp || typeof otp !== 'string') {
      return c.json({
        success: false,
        message: 'OTP is required and must be a string'
      }, 400);
    }

    console.log('✅ Request validation passed, calling SES service with email:', email);

    const sesService = new SESService(c.env);
    const result = await sesService.sendVerificationEmail(email, otp, expiryMinutes);
    
    if (result.success) {
      return c.json({
        success: true,
        message: 'Verification email sent successfully',
        messageId: result.messageId
      });
    } else {
      return c.json({
        success: false,
        message: 'Failed to send verification email',
        error: result.error
      }, 500);
    }
  } catch (error) {
    console.error('Error sending verification email:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'auth-worker',
    version: '1.0.0',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint'
      },
      {
        path: '/otp/generate',
        method: 'POST',
        description: 'Generate and store OTP for email',
        body: { email: 'string' }
      },
      {
        path: '/otp/verify',
        method: 'POST',
        description: 'Verify OTP for email',
        body: { email: 'string', otp: 'string' }
      },
      {
        path: '/otp/status/:email',
        method: 'GET',
        description: 'Get OTP status for email'
      },
      {
        path: '/otp/:email',
        method: 'DELETE',
        description: 'Delete OTP for email (admin endpoint)'
      },
      {
        path: '/email/send-verification',
        method: 'POST',
        description: 'Send verification email manually',
        body: { email: 'string', otp: 'string', expiryMinutes: 'number (optional)' }
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