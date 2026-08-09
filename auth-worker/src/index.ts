import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env } from './types/env';
import { storeOTP, verifyOTPForEmail, hasOTP, deleteOTP, getOTPStats } from './utils/otp-manager';
import { EmailService } from './services/email-service';
import { JWTService } from './services/jwt-service';
import { PasskeyService, isAuthenticationResponse, isRegistrationResponse } from './services/passkey-service';

const app = new Hono<{ Bindings: Env }>();
type AuthContext = Context<{ Bindings: Env }>;

function userManagementHeaders(env: Env, contentType = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = 'application/json';
  if (env.PASSKEY_SERVICE_TOKEN) headers['X-Internal-Auth'] = env.PASSKEY_SERVICE_TOKEN;
  return headers;
}

function hasInternalAuth(c: AuthContext): boolean {
  if (c.env.ENVIRONMENT === 'development') return true;
  const token = c.env.PASSKEY_SERVICE_TOKEN;
  return typeof token === 'string' && token.length > 0 && c.req.header('X-Internal-Auth') === token;
}

async function getActiveUser(env: Env, userId: string): Promise<boolean> {
  const response = await fetch(`${env.USER_MANAGEMENT_WORKER_URL}/users/${encodeURIComponent(userId)}`, {
    headers: userManagementHeaders(env),
  });
  if (!response.ok) return false;
  const body = await response.json() as { success?: boolean; data?: { status?: string } };
  return body.success === true && body.data?.status === 'ACTIVE';
}

async function ensureUserForOTP(env: Env, userId: string): Promise<boolean> {
  const response = await fetch(`${env.USER_MANAGEMENT_WORKER_URL}/users/${encodeURIComponent(userId)}`, {
    headers: userManagementHeaders(env),
  });
  if (response.status === 404) {
    const createResponse = await fetch(`${env.USER_MANAGEMENT_WORKER_URL}/users`, {
      method: 'POST',
      headers: userManagementHeaders(env, true),
      body: JSON.stringify({ email_hash: userId, account_type: 'FREE' }),
    });
    if (!createResponse.ok) return false;
    const created = await createResponse.json() as { success?: boolean; data?: { status?: string } };
    return created.success === true && created.data?.status === 'ACTIVE';
  }
  if (!response.ok) return false;
  const body = await response.json() as { success?: boolean; data?: { status?: string } };
  return body.success === true && body.data?.status === 'ACTIVE';
}

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return '';
    return c.env.WEBAUTHN_ORIGIN === origin ? origin : '';
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));

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
      email: 'unknown'
    }
  };

  try {
    // Test OTP_KV access
    const testKey = `${env.OTP_KV_PREFIX || 'default'}:__health_check_otp__`;
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
    // Test Cloudflare send_email binding configuration
    if (env.send_email && typeof env.send_email.send === 'function') {
      health.services.email = 'healthy';
    } else {
      health.services.email = 'unhealthy';
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.email = 'unhealthy';
    health.status = 'degraded';
    console.error('Email binding configuration check failed:', error);
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
    const existingOTP = await hasOTP(c.env.OTP_KV, email, c.env.OTP_KV_PREFIX);
    if (existingOTP) {
      return c.json({
        success: false,
        message: 'OTP already exists for this email. Please wait for it to expire or verify it first.'
      }, 409);
    }

    const result = await storeOTP(c.env.OTP_KV, email, undefined, undefined, c.env.OTP_KV_PREFIX);
    
    if (result.success) {
      // Always send verification email (security best practice)
      let emailSent = false;
      if (result.otp) {
        try {
          const emailService = new EmailService(c.env);
          const emailResult = await emailService.sendVerificationEmail(email, result.otp, 10);
          
          if (emailResult.success) {
            emailSent = true;
            console.log('Verification email sent successfully:', emailResult.messageId);
          } else {
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
        message: 'OTP generated successfully. Please check your email for the verification code.',
        emailSent: emailSent
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

    const result = await verifyOTPForEmail(c.env.OTP_KV, email, otp, c.env.OTP_KV_PREFIX);
    
    if (result.success) {
      const emailHash = result.user_id;
      if (!emailHash) {
        return c.json({ success: false, message: 'Authentication failed' }, 500);
      }

      // A valid OTP is not enough to bypass an account suspension/deletion.
      // User creation is allowed only for a genuinely new email hash.
      let activeUser = false;
      try {
        activeUser = await ensureUserForOTP(c.env, emailHash);
      } catch (userError) {
        console.error('Error checking user status:', userError);
      }
      if (!activeUser) {
        return c.json({ success: false, message: 'Authentication service unavailable' }, 503);
      }

      let jwtToken = null;
      try {
        const jwtService = new JWTService(c.env);
        const tokenResult = await jwtService.createToken(emailHash, email, 604800);
        if (tokenResult.success && tokenResult.token) {
          jwtToken = tokenResult.token;
        } else {
          console.error('Failed to generate JWT token:', tokenResult.error);
        }
      } catch (jwtError) {
        console.error('Error generating JWT token:', jwtError);
      }

      // Record successful login (best effort after account status is confirmed).
      try {
        const loginResponse = await fetch(`${c.env.USER_MANAGEMENT_WORKER_URL}/login-history`, {
          method: 'POST',
          headers: userManagementHeaders(c.env, true),
          body: JSON.stringify({
            user_id: emailHash,
            login_method: 'OTP',
            success: true,
            ip_address: c.req.header('CF-Connecting-IP'),
            user_agent: c.req.header('User-Agent')
          })
        });
        if (!loginResponse.ok) console.error('Failed to record login history');
      } catch (userError) {
        console.error('Error recording login history:', userError);
      }

      // Return success response with JWT token if available
      if (jwtToken) {
        return c.json({
          success: true,
          message: 'OTP verified successfully',
          token: jwtToken,
          expiresIn: 604800,
          user: {
            id: result.user_id,
            email: email
          }
        }, 200);
      } else {
        // Fall back to success without token
        return c.json({
          success: true,
          message: 'OTP verified successfully',
          user: {
            id: result.user_id,
            email: email
          }
        }, 200);
      }
    }
    
    // If OTP verification failed, return the original result
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

// Refresh JWT token
app.post('/auth/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return c.json({
        success: false,
        message: 'Token is required and must be a string'
      }, 400);
    }

    try {
      const { JWTService } = await import('./services/jwt-service');
      const jwtService = new JWTService(c.env);
      
      // Verify the existing token
      const verifyResult = await jwtService.verifyToken(token);
      
      if (!verifyResult.success || !verifyResult.payload) {
        return c.json({
          success: false,
          message: verifyResult.error || 'Invalid token'
        }, 400);
      }

      if (!(await getActiveUser(c.env, verifyResult.payload.sub))) {
        return c.json({ success: false, message: 'Authentication failed' }, 401);
      }

      // Create a new token with extended expiration (sliding window — refresh any valid token)
      const newTokenResult = await jwtService.createToken(
        verifyResult.payload.sub,
        verifyResult.payload.email,
        604800 // 7 days
      );

      if (newTokenResult.success && newTokenResult.token) {
        return c.json({
          success: true,
          message: 'Token refreshed successfully',
          token: newTokenResult.token,
          expiresIn: 604800,
          user: {
            id: verifyResult.payload.sub,
            email: verifyResult.payload.email
          }
        });
      } else {
        return c.json({
          success: false,
          message: 'Failed to refresh token'
        }, 500);
      }
    } catch (jwtError) {
      console.error('Error refreshing JWT token:', jwtError);
      return c.json({
        success: false,
        message: 'Token refresh failed'
      }, 500);
    }
  } catch (error) {
    console.error('Error in token refresh endpoint:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Validate JWT token
app.post('/auth/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return c.json({
        success: false,
        message: 'Token is required and must be a string'
      }, 400);
    }

    try {
      const { JWTService } = await import('./services/jwt-service');
      const jwtService = new JWTService(c.env);
      
      const result = await jwtService.verifyToken(token);
      
      if (result.success && result.payload) {
        const active = await getActiveUser(c.env, result.payload.sub);
        if (!active) {
          return c.json({ success: false, valid: false, message: 'Authentication failed' });
        }
        return c.json({
          success: true,
          valid: true,
          user: {
            id: result.payload.sub,
            email: result.payload.email
          },
          expiresAt: result.payload.exp,
          timeUntilExpiration: jwtService.getTimeUntilExpiration(result.payload)
        });
      } else {
        return c.json({
          success: false,
          valid: false,
          message: result.error || 'Invalid token'
        });
      }
    } catch (jwtError) {
      console.error('Error validating JWT token:', jwtError);
      return c.json({
        success: false,
        valid: false,
        message: 'Token validation failed'
      });
    }
  } catch (error) {
    console.error('Error in token validation endpoint:', error);
    return c.json({
      success: false,
      message: 'Internal server error'
    }, 500);
  }
});

// Check OTP status
app.get('/otp/status/:email', async (c) => {
  if (!hasInternalAuth(c)) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const email = c.req.param('email');

    if (!email) {
      return c.json({
        success: false,
        message: 'Email parameter is required'
      }, 400);
    }

    const stats = await getOTPStats(c.env.OTP_KV, email, c.env.OTP_KV_PREFIX);
    
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
  if (!hasInternalAuth(c)) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const email = c.req.param('email');

    if (!email) {
      return c.json({
        success: false,
        message: 'Email parameter is required'
      }, 400);
    }

    const deleted = await deleteOTP(c.env.OTP_KV, email, c.env.OTP_KV_PREFIX);
    
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
  if (!hasInternalAuth(c)) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json();
    const { email, otp, expiryMinutes = 10 } = body;

    console.log('📧 Email verification request:', { email, expiryMinutes });

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

    console.log('✅ Request validation passed, calling email service with email:', email);

    const emailService = new EmailService(c.env);
    const result = await emailService.sendVerificationEmail(email, otp, expiryMinutes);
    
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

// Passkey endpoints
function normalizePasskeyEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function getAuthPayload(c: AuthContext) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token || token.length > 4096) return null;

  const result = await new JWTService(c.env).verifyToken(token);
  return result.success && result.payload ? result.payload : null;
}

async function readJsonBody(c: AuthContext): Promise<Record<string, unknown>> {
  const body = await c.req.json();
  return body && typeof body === 'object' ? body as Record<string, unknown> : {};
}

async function beginPasskeyRegistration(c: AuthContext) {
  try {
    const payload = await getAuthPayload(c);
    if (!payload?.sub || !payload.email) {
      return c.json({ success: false, message: 'Authentication required' }, 401);
    }
    if (!(await getActiveUser(c.env, payload.sub))) {
      return c.json({ success: false, message: 'Authentication required' }, 401);
    }

    const result = await new PasskeyService(c.env).beginRegistration(payload.sub, payload.email);
    return result.success
      ? c.json({ success: true, state: result.state, options: result.options })
      : c.json({ success: false, message: result.error || 'Unable to begin passkey registration' }, 400);
  } catch (error) {
    console.error('Error beginning passkey registration:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
}

async function completePasskeyRegistration(c: AuthContext) {
  try {
    const payload = await getAuthPayload(c);
    if (!payload?.sub) {
      return c.json({ success: false, message: 'Authentication required' }, 401);
    }
    if (!(await getActiveUser(c.env, payload.sub))) {
      return c.json({ success: false, message: 'Authentication required' }, 401);
    }

    const body = await readJsonBody(c);
    const state = typeof body.state === 'string' ? body.state : body.sessionToken;
    if (typeof state !== 'string' || !isRegistrationResponse(body.response)) {
      return c.json({ success: false, message: 'state and a valid passkey response are required' }, 400);
    }

    const result = await new PasskeyService(c.env).completeRegistration(payload.sub, state, body.response);
    return result.success
      ? c.json({ success: true, credentialId: result.credentialId })
      : c.json({ success: false, message: result.error || 'Passkey registration failed' }, 400);
  } catch (error) {
    console.error('Error completing passkey registration:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
}

async function beginPasskeyAuthentication(c: AuthContext) {
  try {
    const body = await readJsonBody(c);
    const email = normalizePasskeyEmail(body.email);
    if (!email) {
      return c.json({ success: false, message: 'A valid email is required' }, 400);
    }

    const result = await new PasskeyService(c.env).beginAuthentication(email);
    return result.success
      ? c.json({ success: true, state: result.state, options: result.options })
      : c.json({ success: false, message: 'No passkey is registered for this email' }, 404);
  } catch (error) {
    console.error('Error beginning passkey authentication:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
}

async function completePasskeyAuthentication(c: AuthContext) {
  try {
    const body = await readJsonBody(c);
    const email = normalizePasskeyEmail(body.email);
    const state = typeof body.state === 'string' ? body.state : body.sessionToken;
    if (!email || typeof state !== 'string' || !isAuthenticationResponse(body.response)) {
      return c.json({ success: false, message: 'email, state, and a valid passkey response are required' }, 400);
    }

    const result = await new PasskeyService(c.env).completeAuthentication(email, state, body.response);
    if (!result.success || !result.jwtToken || !result.user) {
      return c.json({ success: false, message: result.error || 'Passkey authentication failed' }, 400);
    }

    return c.json({
      success: true,
      message: 'Passkey authenticated successfully',
      token: result.jwtToken,
      expiresIn: 604800,
      user: result.user,
    });
  } catch (error) {
    console.error('Error completing passkey authentication:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
}

app.post('/passkeys/register/begin', beginPasskeyRegistration);
app.post('/passkeys/register/complete', completePasskeyRegistration);
app.post('/passkeys/authenticate/begin', beginPasskeyAuthentication);
app.post('/passkeys/authenticate/complete', completePasskeyAuthentication);

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
      },
      {
        path: '/passkeys/register/begin',
        method: 'POST',
        description: 'Create WebAuthn registration options (Bearer JWT required)'
      },
      {
        path: '/passkeys/register/complete',
        method: 'POST',
        description: 'Verify and save a WebAuthn registration (Bearer JWT required)'
      },
      {
        path: '/passkeys/authenticate/begin',
        method: 'POST',
        description: 'Create WebAuthn authentication options',
        body: { email: 'string' }
      },
      {
        path: '/passkeys/authenticate/complete',
        method: 'POST',
        description: 'Verify a WebAuthn authentication response',
        body: { email: 'string', state: 'string', response: 'object' }
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
export { PasskeyChallengeObject } from './passkey-challenge-do';
