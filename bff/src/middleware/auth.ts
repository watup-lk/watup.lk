import { Request, Response, NextFunction } from 'express';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:8080';

// Validates the Bearer token by calling identity-service /auth/validate
// Attaches x-user-id header for downstream services
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const response = await fetch(`${IDENTITY_URL}/auth/validate`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    const { user_id } = await response.json() as { user_id: string };
    // Pass user_id to downstream service as a header — never the raw JWT
    req.headers['x-user-id'] = user_id;
    next();
  } catch {
    res.status(502).json({ message: 'identity service unavailable' });
  }
}
