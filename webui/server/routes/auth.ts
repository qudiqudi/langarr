import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PlexTvAPI } from '../lib/plexClient';
import { getRepository } from '../datasource';
import { User, Permission } from '../entity/User';
import { Session } from '../entity/Session';
import { isAuthenticated } from '../middleware/auth';

const authRoutes = Router();

// Get current user
authRoutes.get('/me', isAuthenticated(), async (req, res) => {
  const userRepository = getRepository(User);

  if (!req.user) {
    return res.status(401).json({
      status: 401,
      error: 'Not authenticated',
    });
  }

  const user = await userRepository.findOne({
    where: { id: req.user.id },
  });

  if (!user) {
    return res.status(404).json({
      status: 404,
      error: 'User not found',
    });
  }

  return res.status(200).json(user.toJSON());
});

// Plex OAuth login
authRoutes.post('/plex', async (req, res, next) => {
  const userRepository = getRepository(User);
  const sessionRepository = getRepository(Session);
  const body = req.body as { authToken?: string };

  if (!body.authToken) {
    return res.status(400).json({
      status: 400,
      error: 'Authentication token required',
    });
  }

  try {
    // Get user info from Plex
    const plexTv = new PlexTvAPI(body.authToken);
    const account = await plexTv.getUser();

    // Find or create user
    let user = await userRepository.findOne({
      where: [
        { plexId: account.id },
        { email: account.email.toLowerCase() },
      ],
    });

    const userCount = await userRepository.count();

    if (!user && userCount === 0) {
      // First user - make them admin
      user = new User();
      user.email = account.email.toLowerCase();
      user.plexUsername = account.username;
      user.plexId = account.id;
      user.plexToken = account.authToken;
      user.permissions = Permission.ADMIN;
      user.avatar = account.thumb;

      await userRepository.save(user);
      console.log(`Created admin user: ${user.plexUsername}`);
    } else if (!user) {
      // Not first user, need to check if they have access
      // For now, reject non-first users (single-user app)
      return res.status(403).json({
        status: 403,
        error: 'Only the first user can access this application',
      });
    } else {
      // Existing user - update their token
      user.plexToken = account.authToken;
      user.plexUsername = account.username;
      user.avatar = account.thumb;
      await userRepository.save(user);
    }

    // Create session
    const session = new Session();
    session.id = uuidv4();
    session.userId = user.id;
    session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await sessionRepository.save(session);

    // Set session cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
    res.cookie('langarr_session', session.id, cookieOptions);

    return res.status(200).json(user.toJSON());
  } catch (error) {
    console.error('Plex auth error:', error);
    return res.status(500).json({
      status: 500,
      error: 'Failed to authenticate with Plex',
    });
  }
});

// Logout
authRoutes.post('/logout', isAuthenticated(), async (req, res) => {
  const sessionRepository = getRepository(Session);
  const sessionId = req.cookies?.langarr_session;

  if (sessionId) {
    await sessionRepository.delete({ id: sessionId });
  }

  res.clearCookie('langarr_session');
  return res.status(200).json({ success: true });
});

export default authRoutes;
