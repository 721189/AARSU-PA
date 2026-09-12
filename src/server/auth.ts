import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Load the active Firebase config for this environment
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

// Initialize Firebase Admin (uses default credentials securely in AI Studio / Cloud Run)
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Extend Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: DecodedIdToken;
      userRole?: string;
    }
  }
}

// Authentication Middleware
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    
    // Defaulting role to 'user' since we removed Admin DB access
    req.userRole = 'user';
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Role-Based Access Control (RBAC) Middleware
export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.userRole !== role && req.userRole !== 'admin') { // Admins override
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};
