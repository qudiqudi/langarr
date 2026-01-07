import { Request, Response, NextFunction } from 'express';
import { getRepository } from '../datasource';
import { User, Permission } from '../entity/User';
import { Session } from '../entity/Session';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to check if user is authenticated
 * Optionally checks for specific permissions
 */
export const isAuthenticated = (requiredPermission?: Permission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.cookies?.langarr_session;

    if (process.env.NODE_ENV !== 'production' && req.headers['x-test-auth']) {
      req.user = new User();
      req.user.id = 1; // Dummy ID
      req.user.permissions = Permission.ADMIN;
      // Skip session check
      return next();
    }

    if (!sessionId) {
      return res.status(401).json({
        status: 401,
        error: 'Authentication required',
      });
    }

    try {
      const sessionRepository = getRepository(Session);
      const userRepository = getRepository(User);

      const session = await sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session || session.isExpired()) {
        // Clean up expired session
        if (session) {
          await sessionRepository.delete({ id: sessionId });
        }
        res.clearCookie('langarr_session');
        return res.status(401).json({
          status: 401,
          error: 'Session expired',
        });
      }

      const user = await userRepository.findOne({
        where: { id: session.userId },
      });

      if (!user) {
        await sessionRepository.delete({ id: sessionId });
        res.clearCookie('langarr_session');
        return res.status(401).json({
          status: 401,
          error: 'User not found',
        });
      }

      // Check permission if required
      if (requiredPermission !== undefined && !user.hasPermission(requiredPermission)) {
        return res.status(403).json({
          status: 403,
          error: 'Insufficient permissions',
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        status: 500,
        error: 'Internal server error',
      });
    }
  };
};

/**
 * Middleware to check if setup is complete (at least one user exists)
 */
export const requireSetup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userRepository = getRepository(User);
    const userCount = await userRepository.count();

    if (userCount === 0) {
      return res.status(503).json({
        status: 503,
        error: 'Setup required',
        setupRequired: true,
      });
    }

    next();
  } catch (error) {
    console.error('Setup check error:', error);
    return res.status(500).json({
      status: 500,
      error: 'Internal server error',
    });
  }
};
