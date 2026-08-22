import { Hono } from 'hono';
import { jwtVerify } from 'jose';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Bindings } from './types/env';
import { UserDatabaseService } from './services/user-database';
import { DEFAULT_PROFILE, validateCulinaryProfileInput } from './services/culinary-profile';
import { PantryService, validatePantryItemInput } from './services/pantry';
import { detectPantryItems, MAX_PANTRY_PHOTO_BYTES, validatePantryPhoto } from './services/pantry-scan';
import type { PantryScanFile } from './services/pantry-scan';
import { RecipeNotesService, validateRecipeNoteInput } from './services/recipe-notes';

const app = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

const JWT_ISSUER = 'auth-worker.nolanfoster.workers.dev';
const JWT_AUDIENCE = 'seasoned-app';

// A missing JWT_SECRET is a deployment fault, not a caller fault: without it no
// token can ever verify, so every request would look like a rejected sign-in.
// It is reported separately so the failure is diagnosable from the response and
// the logs, while genuine token problems stay indistinguishable from each other.
type AuthOutcome =
  | { status: 'authenticated'; userId: string }
  | { status: 'unauthenticated' }
  | { status: 'unconfigured' };

async function authenticateRequest(c: { env: Bindings; req: { header(name: string): string | undefined } }): Promise<AuthOutcome> {
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET is not configured on this deployment; authenticated /me routes cannot verify tokens issued by auth-worker');
    return { status: 'unconfigured' };
  }

  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { status: 'unauthenticated' };
  const token = authorization.slice('Bearer '.length).trim();
  if (!token || token.length > 4096) return { status: 'unauthenticated' };

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    });
    return typeof payload.sub === 'string' && payload.sub.length > 0
      ? { status: 'authenticated', userId: payload.sub }
      : { status: 'unauthenticated' };
  } catch {
    // Invalid tokens are intentionally indistinguishable from missing tokens.
    return { status: 'unauthenticated' };
  }
}

function culinaryProfileEnabled(env: Bindings): boolean {
  return env.CULINARY_PROFILE_ENABLED !== 'false';
}

function pantryEnabled(env: Bindings): boolean {
  return env.PANTRY_ENABLED !== 'false';
}

function pantryScanEnabled(env: Bindings): boolean {
  return env.PANTRY_SCAN_ENABLED !== 'false';
}

function isPantryPath(path: string): boolean {
  return path === '/me/pantry-items' || path.startsWith('/me/pantry-items/') || path === '/me/pantry-scan';
}

function recipeNotesEnabled(env: Bindings): boolean {
  return env.RECIPE_NOTES_ENABLED !== 'false';
}

function isRecipeNotesPath(path: string): boolean {
  return path === '/me/recipe-notes' || path.startsWith('/me/recipe-notes/');
}

function hasPasskeyServiceAccess(c: { env: Bindings; req: { header(name: string): string | undefined } }): boolean {
  const configuredToken = c.env.PASSKEY_SERVICE_TOKEN;
  if (c.env.ENVIRONMENT === 'development') return true;
  return typeof configuredToken === 'string' && configuredToken.length > 0 && c.req.header('X-Internal-Auth') === configuredToken;
}

// Middleware
app.use('*', logger());
app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));

// User data and audit routes are worker-internal. Development keeps the
// existing local workflow convenient; deployed environments require the shared
// PASSKEY_SERVICE_TOKEN secret configured on both workers.
app.use('*', async (c, next) => {
  if (c.req.path === '/me/culinary-profile' || isPantryPath(c.req.path) || isRecipeNotesPath(c.req.path)) {
    if (c.req.path === '/me/culinary-profile' && !culinaryProfileEnabled(c.env)) {
      return c.json({ success: false, message: 'Not Found' }, 404);
    }
    if (isPantryPath(c.req.path) && !pantryEnabled(c.env)) {
      return c.json({ success: false, message: 'Not Found' }, 404);
    }
    if (c.req.path === '/me/pantry-scan' && !pantryScanEnabled(c.env)) {
      return c.json({ success: false, message: 'Not Found' }, 404);
    }
    if (isRecipeNotesPath(c.req.path) && !recipeNotesEnabled(c.env)) {
      return c.json({ success: false, message: 'Not Found' }, 404);
    }
    const auth = await authenticateRequest(c);
    if (auth.status === 'unconfigured') {
      return c.json({ success: false, message: 'Authentication is not configured on this deployment' }, 503);
    }
    if (auth.status === 'unauthenticated') {
      return c.json({ success: false, message: 'Authentication required' }, 401);
    }
    c.set('userId', auth.userId);
    await next();
    return;
  }

  if (c.req.path === '/' || c.req.path === '/health' || hasPasskeyServiceAccess(c)) {
    await next();
    return;
  }
  return c.json({ success: false, message: 'Unauthorized' }, 401);
});

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

// Authenticated culinary profile endpoints. The user id always comes from a
// verified JWT subject; clients cannot choose another user's profile id.
app.get('/me/culinary-profile', async (c) => {
  try {
    const userId = c.get('userId');
    const result = await new UserDatabaseService(c.env.USER_DB).getCulinaryProfile(userId);
    if (!result.success) return c.json({ success: false, message: result.error }, 500);

    return c.json({
      success: true,
      exists: Boolean(result.data),
      data: result.data || { user_id: userId, ...DEFAULT_PROFILE, created_at: null, updated_at: null },
    });
  } catch (error) {
    console.error('Error getting culinary profile:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.put('/me/culinary-profile', async (c) => {
  try {
    const body = await c.req.json();
    const input = body && typeof body === 'object' && !Array.isArray(body) && body.profile && typeof body.profile === 'object'
      ? body.profile
      : body;
    const errors = validateCulinaryProfileInput(input);
    if (errors.length > 0) return c.json({ success: false, message: 'Invalid culinary profile', errors }, 400);

    const userId = c.get('userId');
    const result = await new UserDatabaseService(c.env.USER_DB).upsertCulinaryProfile(userId, input);
    if (!result.success) return c.json({ success: false, message: result.error }, 400);
    return c.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error saving culinary profile:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Authenticated pantry inventory endpoints. Every query is scoped to the
// verified JWT subject so a caller cannot read or mutate another user's items.
app.get('/me/pantry-items', async (c) => {
  try {
    const items = await new PantryService(c.env.USER_DB).listItems(c.get('userId'));
    return c.json({ success: true, data: items });
  } catch (error) {
    console.error('Error listing pantry items:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.post('/me/pantry-items', async (c) => {
  try {
    const body = await c.req.json();
    const input = body && typeof body === 'object' && !Array.isArray(body) && body.item && typeof body.item === 'object'
      ? body.item
      : body;
    const errors = validatePantryItemInput(input);
    if (errors.length > 0) return c.json({ success: false, message: 'Invalid pantry item', errors }, 400);

    const item = await new PantryService(c.env.USER_DB).createItem(c.get('userId'), input);
    if (!item) return c.json({ success: false, message: 'Failed to create pantry item' }, 500);
    return c.json({ success: true, data: item }, 201);
  } catch (error) {
    console.error('Error creating pantry item:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.patch('/me/pantry-items/:item_id', async (c) => {
  try {
    const itemId = Number(c.req.param('item_id'));
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
      return c.json({ success: false, message: 'Invalid pantry item id' }, 400);
    }
    const body = await c.req.json();
    const input = body && typeof body === 'object' && !Array.isArray(body) && body.item && typeof body.item === 'object'
      ? body.item
      : body;
    const errors = validatePantryItemInput(input, { partial: true });
    if (errors.length > 0) return c.json({ success: false, message: 'Invalid pantry item', errors }, 400);

    const item = await new PantryService(c.env.USER_DB).updateItem(c.get('userId'), itemId, input);
    if (!item) return c.json({ success: false, message: 'Pantry item not found or no fields to update' }, 404);
    return c.json({ success: true, data: item });
  } catch (error) {
    console.error('Error updating pantry item:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.delete('/me/pantry-items/:item_id', async (c) => {
  try {
    const itemId = Number(c.req.param('item_id'));
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
      return c.json({ success: false, message: 'Invalid pantry item id' }, 400);
    }
    const affectedRows = await new PantryService(c.env.USER_DB).deleteItem(c.get('userId'), itemId);
    if (affectedRows === 0) return c.json({ success: false, message: 'Pantry item not found' }, 404);
    return c.json({ success: true, affectedRows });
  } catch (error) {
    console.error('Error deleting pantry item:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Pantry photos are sent directly to Workers AI and are never persisted by this
// worker. The client must review the returned candidates before creating pantry
// rows through the normal CRUD endpoint.
app.post('/me/pantry-scan', async (c) => {
  const ai = c.env.AI;
  if (!ai) return c.json({ success: false, message: 'Pantry photo scan is not configured' }, 503);

  const contentLength = Number(c.req.header('Content-Length') || 0);
  if (contentLength > MAX_PANTRY_PHOTO_BYTES + 64 * 1024) {
    return c.json({ success: false, message: 'Pantry photos must be 10 MB or smaller' }, 413);
  }
  const contentType = (c.req.header('Content-Type') || '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data')) {
    return c.json({ success: false, message: 'Upload a pantry photo as multipart form data' }, 400);
  }

  try {
    const body = await c.req.parseBody();
    const file = body.image || body.photo;
    if (!file) return c.json({ success: false, message: 'Upload a pantry photo in the image form field' }, 400);
    const errors = validatePantryPhoto(file);
    if (errors.length > 0) return c.json({ success: false, message: errors[0] }, 400);

    const items = await detectPantryItems(file as PantryScanFile, ai);
    return c.json({
      success: true,
      data: {
        items,
        processedEphemerally: true,
        message: items.length ? 'Review these estimates before adding them to your pantry.' : 'No food items were detected.',
      },
    });
  } catch (error) {
    console.error('Error scanning pantry photo:', error);
    return c.json({ success: false, message: 'Could not scan that pantry photo. Try another image.' }, 502);
  }
});

// Authenticated private recipe notes. Notes are scoped to the verified JWT
// subject and stored beside the user's other data, so a note never mutates the
// shared recipe record and is never visible to another user.
app.get('/me/recipe-notes', async (c) => {
  try {
    const recipeId = c.req.query('recipeId') ?? c.req.query('recipe_id') ?? null;
    const notes = await new RecipeNotesService(c.env.USER_DB).listNotes(c.get('userId'), recipeId);
    return c.json({ success: true, data: notes });
  } catch (error) {
    console.error('Error listing recipe notes:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.post('/me/recipe-notes', async (c) => {
  try {
    const body = await c.req.json();
    const input = body && typeof body === 'object' && !Array.isArray(body) && body.note && typeof body.note === 'object'
      ? body.note
      : body;
    const errors = validateRecipeNoteInput(input);
    if (errors.length > 0) return c.json({ success: false, message: 'Invalid recipe note', errors }, 400);

    const note = await new RecipeNotesService(c.env.USER_DB).createNote(c.get('userId'), input);
    if (!note) return c.json({ success: false, message: 'Failed to create recipe note' }, 500);
    return c.json({ success: true, data: note }, 201);
  } catch (error) {
    console.error('Error creating recipe note:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.patch('/me/recipe-notes/:note_id', async (c) => {
  try {
    const noteId = Number(c.req.param('note_id'));
    if (!Number.isSafeInteger(noteId) || noteId < 1) {
      return c.json({ success: false, message: 'Invalid recipe note id' }, 400);
    }
    const body = await c.req.json();
    const input = body && typeof body === 'object' && !Array.isArray(body) && body.note && typeof body.note === 'object'
      ? body.note
      : body;
    const errors = validateRecipeNoteInput(input, { partial: true });
    if (errors.length > 0) return c.json({ success: false, message: 'Invalid recipe note', errors }, 400);

    const note = await new RecipeNotesService(c.env.USER_DB).updateNote(c.get('userId'), noteId, input);
    if (!note) return c.json({ success: false, message: 'Recipe note not found or no fields to update' }, 404);
    return c.json({ success: true, data: note });
  } catch (error) {
    console.error('Error updating recipe note:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.delete('/me/recipe-notes/:note_id', async (c) => {
  try {
    const noteId = Number(c.req.param('note_id'));
    if (!Number.isSafeInteger(noteId) || noteId < 1) {
      return c.json({ success: false, message: 'Invalid recipe note id' }, 400);
    }
    const affectedRows = await new RecipeNotesService(c.env.USER_DB).deleteNote(c.get('userId'), noteId);
    if (affectedRows === 0) return c.json({ success: false, message: 'Recipe note not found' }, 404);
    return c.json({ success: true, affectedRows });
  } catch (error) {
    console.error('Error deleting recipe note:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
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
    const { email_encrypted, status, account_type, email_verified, two_factor_enabled } = body;

    const userDB = new UserDatabaseService(c.env.USER_DB);
    const result = await userDB.updateUser(user_id, {
      email_encrypted,
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

    if (!['OTP', 'MAGIC_LINK', 'PASSKEY'].includes(login_method)) {
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

// Passkey credential endpoints. These are intended for the Auth Worker and
// can be protected with PASSKEY_SERVICE_TOKEN in deployed environments.
app.get('/passkey-credentials/user/:user_id', async (c) => {
  if (!hasPasskeyServiceAccess(c)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const userId = c.req.param('user_id');
    const result = await new UserDatabaseService(c.env.USER_DB).getPasskeyCredentialsByUserId(userId);
    return result.success
      ? c.json({ success: true, data: result.data })
      : c.json({ success: false, message: result.error }, 500);
  } catch (error) {
    console.error('Error getting passkey credentials:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.get('/passkey-credentials/:credential_id', async (c) => {
  if (!hasPasskeyServiceAccess(c)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const credentialId = c.req.param('credential_id');
    const result = await new UserDatabaseService(c.env.USER_DB).getPasskeyCredential(credentialId);
    return result.success
      ? c.json({ success: true, data: result.data })
      : c.json({ success: false, message: result.error }, 404);
  } catch (error) {
    console.error('Error getting passkey credential:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.post('/passkey-credentials', async (c) => {
  if (!hasPasskeyServiceAccess(c)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json();
    const { credential_id, user_id, public_key, counter, device_type, backed_up, transports } = body;

    if (typeof credential_id !== 'string' || !credential_id ||
        typeof user_id !== 'string' || !user_id ||
        typeof public_key !== 'string' || !public_key ||
        !Number.isInteger(counter) || counter < 0 ||
        !['singleDevice', 'multiDevice'].includes(device_type)) {
      return c.json({ success: false, message: 'Invalid passkey credential' }, 400);
    }

    if (transports !== undefined && (!Array.isArray(transports) || transports.some((item) => typeof item !== 'string'))) {
      return c.json({ success: false, message: 'Invalid passkey transports' }, 400);
    }

    const result = await new UserDatabaseService(c.env.USER_DB).createPasskeyCredential({
      credential_id,
      user_id,
      public_key,
      counter,
      device_type,
      backed_up: backed_up === true || backed_up === 1,
      transports
    });
    return result.success
      ? c.json({ success: true, data: result.data }, 201)
      : c.json({ success: false, message: result.error }, 409);
  } catch (error) {
    console.error('Error creating passkey credential:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.patch('/passkey-credentials/:credential_id/counter', async (c) => {
  if (!hasPasskeyServiceAccess(c)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const credentialId = c.req.param('credential_id');
    const body = await c.req.json();
    const { previous_counter, counter } = body;
    if (!Number.isInteger(previous_counter) || previous_counter < 0 ||
        !Number.isInteger(counter) || counter < 0 || counter < previous_counter) {
      return c.json({ success: false, message: 'Invalid passkey counter' }, 400);
    }

    const result = await new UserDatabaseService(c.env.USER_DB).updatePasskeyCounter(credentialId, previous_counter, counter);
    return result.success
      ? c.json({ success: true, data: result.data })
      : c.json({ success: false, message: result.error }, 409);
  } catch (error) {
    console.error('Error updating passkey counter:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

app.delete('/passkey-credentials/:credential_id', async (c) => {
  if (!hasPasskeyServiceAccess(c)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const credentialId = c.req.param('credential_id');
    const userId = c.req.query('user_id');
    const result = await new UserDatabaseService(c.env.USER_DB).deletePasskeyCredential(credentialId, userId);
    return result.success
      ? c.json({ success: true, affectedRows: result.affectedRows })
      : c.json({ success: false, message: result.error }, 500);
  } catch (error) {
    console.error('Error deleting passkey credential:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
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
        body: { email_encrypted: 'string?', status: 'string?', account_type: 'string?', email_verified: 'boolean?', two_factor_enabled: 'boolean?' }
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
        body: { user_id: 'string', login_method: 'OTP|MAGIC_LINK|PASSKEY', success: 'boolean' }
      },
      {
        path: '/login-history/recent',
        method: 'GET',
        description: 'Get recent login activity',
        query: { limit: 'number?' }
      },
      {
        path: '/me/culinary-profile',
        method: 'GET|PUT',
        description: 'Read or update the authenticated user culinary profile (Bearer JWT required)'
      },
      {
        path: '/me/pantry-items',
        method: 'GET|POST|PATCH|DELETE',
        description: 'Manage authenticated user pantry inventory (Bearer JWT required)'
      },
      {
        path: '/me/pantry-scan',
        method: 'POST',
        description: 'Identify food candidates in an ephemeral pantry photo (Bearer JWT required)'
      },
      {
        path: '/me/recipe-notes',
        method: 'GET|POST|PATCH|DELETE',
        description: 'Manage the authenticated user private recipe notes (Bearer JWT required)',
        query: { recipeId: 'string? — narrow the listing to one recipe' }
      },
      {
        path: '/passkey-credentials/*',
        method: 'GET|POST|PATCH|DELETE',
        description: 'Internal passkey credential storage routes'
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
