import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';

// Initialize Firebase Admin (uses default credentials securely in AI Studio / Cloud Run)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'gen-lang-client-0526957989',
  });
}
export const db = admin.firestore();

// Extend Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
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
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    
    // Fetch user role from Firestore for RBAC
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists) {
      req.userRole = userDoc.data()?.role || 'user';
    } else {
      // Create default user profile if it doesn't exist
      await db.collection('users').doc(decodedToken.uid).set({
        role: 'user',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      req.userRole = 'user';
    }
    
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
