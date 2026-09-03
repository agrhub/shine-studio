import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import type { PlatformAccount } from '@/types.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { emailService } from '@/services/EmailService.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { EnvConfig } from '@/config/env.js';
import { getActivePlatformConfig } from './admin.js';
import { OAuthService } from '@/services/OAuthService.js';
import { Logger } from '~/utils/logger.js';

const router = Router();
const JWT_SECRET = EnvConfig.jwtSecret;
const REFRESH_SECRET = EnvConfig.jwtRefreshSecret;

// Standardized response helper
function ok(res: Response, data: any, message = 'Success', statusCode = 200) {
  res.status(statusCode).json({ code: statusCode, data, message, error: null });
}
function fail(res: Response, statusCode: number, message: string) {
  res.status(statusCode).json({ code: statusCode, data: null, message: null, error: message });
}

// In-memory OTP storage
interface OtpEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
  purpose: 'enable_2fa' | 'disable_2fa' | 'login' | 'signup';
  userId?: string;
  email?: string;
  payload?: any;
}
const otpStore = new Map<string, OtpEntry>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

// POST /api/auth/signup - Initiate user registration (Sends OTP to Email)
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      fail(res, 400, 'Email and password are required'); return;
    }

    if (password.length < 6) {
      fail(res, 400, 'Password must be at least 6 characters'); return;
    }

    const db = await getDatabaseProvider();
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      fail(res, 400, 'User with this email already exists'); return;
    }

    const signupId = nanoid(16);
    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(`signup_${signupId}`, {
      otp,
      expiresAt,
      attempts: 0,
      purpose: 'signup',
      email,
      payload: {
        name: name || email.split('@')[0],
        email,
        password_hash: passwordHash,
      },
    });

    // Send OTP email in background
    emailService.sendOtpEmail(email, otp, 'signup').catch(console.error);

    const tempToken = jwt.sign(
      { signupId, email, tempSignup: true },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    ok(res, {
      require_otp: true,
      temp_token: tempToken,
      email: maskEmail(email),
    }, 'Verification code sent to your email');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/auth/signup/verify-otp - Verify Signup OTP & Create Account
router.post('/signup/verify-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_token, otp } = req.body;
    if (!temp_token || !otp) {
      fail(res, 400, 'Temporary token and OTP are required'); return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(temp_token, JWT_SECRET);
    } catch {
      fail(res, 401, 'Invalid or expired registration session. Please sign up again.'); return;
    }

    if (!decoded.tempSignup || !decoded.signupId) {
      fail(res, 401, 'Invalid registration token'); return;
    }

    const key = `signup_${decoded.signupId}`;
    const entry = otpStore.get(key);
    if (!entry || !entry.payload) {
      fail(res, 400, 'Registration session not found or expired. Please sign up again.'); return;
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      fail(res, 400, 'Verification code has expired. Please request a new code.'); return;
    }

    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts > 5) {
      otpStore.delete(key);
      fail(res, 429, 'Too many invalid attempts. Please sign up again.'); return;
    }

    if (entry.otp.trim() !== String(otp).trim()) {
      fail(res, 400, `Incorrect verification code. ${5 - entry.attempts} attempts remaining.`); return;
    }

    // Success - consume OTP
    otpStore.delete(key);

    const db = await getDatabaseProvider();
    const existingUser = await db.getUserByEmail(entry.payload.email);
    if (existingUser) {
      fail(res, 400, 'User with this email already exists'); return;
    }

    const totalUsersCount = await db.countUsers();
    const isFirstUser = totalUsersCount === 0;
    const assignedRole = isFirstUser ? "admin" : "user";
    const assignedTier = isFirstUser ? 'ENTERPRISE' : 'FREE';
    const assignedCredits = isFirstUser ? 10000 : 100;

    const userId = `usr_${nanoid(10)}`;
    const user = await db.createUser({
      id: userId,
      email: entry.payload.email,
      password_hash: entry.payload.password_hash,
      name: entry.payload.name,
      role: assignedRole,
      tier: assignedTier,
      credits: assignedCredits,
      status: 'active',
      is_active: true,
      theme: 'dark',
      language: 'en',
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    });

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, tier: user.tier }, JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '30d' });

    // Send welcome email in background
    emailService.sendWelcomeEmail(user.email, user.name || 'Creator').catch(console.error);

    ok(res, {
      token,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || assignedRole,
        tier: user.tier,
        credits: user.credits,
        theme: user.theme || 'dark',
        language: user.language || 'en',
      },
    }, 'Account created successfully', 201);
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/auth/signup/resend-otp - Resend Signup OTP
router.post('/signup/resend-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_token } = req.body;
    if (!temp_token) {
      fail(res, 400, 'Temporary token is required'); return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(temp_token, JWT_SECRET);
    } catch {
      fail(res, 401, 'Invalid or expired registration session. Please sign up again.'); return;
    }

    if (!decoded.tempSignup || !decoded.signupId) {
      fail(res, 401, 'Invalid registration token'); return;
    }

    const key = `signup_${decoded.signupId}`;
    const entry = otpStore.get(key);
    if (!entry || !entry.payload) {
      fail(res, 400, 'Registration session not found or expired. Please sign up again.'); return;
    }

    const newOtp = generateOtp();
    entry.otp = newOtp;
    entry.expiresAt = Date.now() + 10 * 60 * 1000;
    entry.attempts = 0;

    emailService.sendOtpEmail(entry.email || entry.payload.email, newOtp, 'signup').catch(console.error);

    ok(res, {
      email: maskEmail(entry.email || entry.payload.email),
    }, 'New verification code sent to your email');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/auth/login - Authenticate user
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      fail(res, 400, 'Email and password are required'); return;
    }

    const db = await getDatabaseProvider();
    const user = await db.getUserByEmail(email);
    if (!user) {
      fail(res, 401, 'Invalid credentials'); return;
    }

    // Check account status
    if (user.status === 'locked' || user.is_active === false) {
      fail(res, 403, 'Account is locked. Please contact administrator.'); return;
    }

    // SSO users without a password_hash cannot log in via password form unless they set a password
    if (!user.password_hash) {
      fail(res, 401, 'This account was registered using Single Sign-On (Google/OAuth). Please sign in with SSO or reset your password.');
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      fail(res, 401, 'Invalid credentials'); return;
    }

    // Update last login timestamp
    user.last_login_at = new Date().toISOString();
    await db.updateUser(user).catch(() => {});

    // Check if Two-Factor Authentication is enabled for this user
    if (user.two_factor_enabled) {
      const tempToken = jwt.sign({ userId: user.id, temp2fa: true }, JWT_SECRET, { expiresIn: '10m' });
      const otp = generateOtp();
      otpStore.set(`login_${user.id}`, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
        purpose: 'login',
        userId: user.id,
        email: user.email,
      });

      emailService.sendOtpEmail(user.email, otp, 'login').catch(console.error);

      ok(res, {
        require_2fa: true,
        temp_token: tempToken,
        email: maskEmail(user.email),
      }, 'Two-factor authentication code sent to email');
      return;
    }

    const userRole = user.role || (user.email.startsWith('admin') ? 'admin' : 'user');
    const token = jwt.sign({ userId: user.id, email: user.email, role: userRole, tier: user.tier }, JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '30d' });

    ok(res, {
      token,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
        tier: user.tier,
        credits: user.credits,
        theme: user.theme || 'dark',
        language: user.language || 'en',
      },
    }, 'Login successful');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/auth/login/verify-2fa - Verify Login 2FA OTP
router.post('/login/verify-2fa', async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_token, otp } = req.body;
    if (!temp_token || !otp) {
      fail(res, 400, 'Temporary token and OTP are required'); return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(temp_token, JWT_SECRET);
    } catch {
      fail(res, 401, 'Invalid or expired 2FA session. Please login again.'); return;
    }

    if (!decoded.temp2fa || !decoded.userId) {
      fail(res, 401, 'Invalid token payload'); return;
    }

    const key = `login_${decoded.userId}`;
    const entry = otpStore.get(key);
    if (!entry) {
      fail(res, 400, 'Verification code has expired or was not requested. Please resend code.'); return;
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      fail(res, 400, 'Verification code has expired. Please request a new code.'); return;
    }

    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts > 5) {
      otpStore.delete(key);
      fail(res, 429, 'Too many invalid attempts. Please request a new verification code.'); return;
    }

    if (entry.otp.trim() !== String(otp).trim()) {
      fail(res, 400, `Incorrect verification code. ${5 - entry.attempts} attempts remaining.`); return;
    }

    // Success - clean OTP
    otpStore.delete(key);

    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);
    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    if (user.status === 'locked' || user.is_active === false) {
      fail(res, 403, 'Account is locked. Please contact administrator.'); return;
    }

    // Update last login timestamp
    user.last_login_at = new Date().toISOString();
    await db.updateUser(user).catch(() => {});

    const userRole = user.role || (user.email.startsWith('admin') ? 'admin' : 'user');
    const token = jwt.sign({ userId: user.id, email: user.email, role: userRole, tier: user.tier }, JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '30d' });

    ok(res, {
      token,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
        tier: user.tier,
        credits: user.credits,
        theme: user.theme || 'dark',
        language: user.language || 'en',
      },
    }, 'Two-factor authentication verified successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Verification failed');
  }
});

// POST /api/auth/login/resend-2fa-otp - Resend Login 2FA OTP
router.post('/login/resend-2fa-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_token } = req.body;
    if (!temp_token) {
      fail(res, 400, 'Temporary token is required'); return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(temp_token, JWT_SECRET);
    } catch {
      fail(res, 401, 'Invalid or expired 2FA session. Please login again.'); return;
    }

    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);
    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    const otp = generateOtp();
    otpStore.set(`login_${user.id}`, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      purpose: 'login',
      userId: user.id,
      email: user.email,
    });

    emailService.sendOtpEmail(user.email, otp, 'login').catch(console.error);

    ok(res, { success: true, email: maskEmail(user.email) }, 'New verification code sent to your email');
  } catch (err: any) {
    fail(res, 500, err.message || 'Failed to resend verification code');
  }
});

// POST /api/auth/2fa/send-otp - Send OTP for enabling/disabling 2FA in settings
router.post('/2fa/send-otp', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    const enable = req.body.enable !== false;
    const purpose = enable ? 'enable_2fa' : 'disable_2fa';
    const otp = generateOtp();
    const key = `2fa_settings_${user.id}`;

    otpStore.set(key, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      purpose,
      userId: user.id,
      email: user.email,
    });

    emailService.sendOtpEmail(user.email, otp, purpose).catch(console.error);

    ok(res, { success: true, masked_email: maskEmail(user.email) }, 'Verification code sent to email');
  } catch {
    fail(res, 401, 'Invalid or expired token');
  }
});

// POST /api/auth/2fa/verify - Verify and apply 2FA in settings
router.post('/2fa/verify', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    const { otp, enable } = req.body;
    if (!otp) {
      fail(res, 400, 'Verification code is required'); return;
    }

    const key = `2fa_settings_${user.id}`;
    const entry = otpStore.get(key);

    if (!entry) {
      fail(res, 400, 'Verification code expired or not requested. Please send a new code.'); return;
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      fail(res, 400, 'Verification code has expired. Please request a new code.'); return;
    }

    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts > 5) {
      otpStore.delete(key);
      fail(res, 429, 'Too many invalid attempts. Please request a new verification code.'); return;
    }

    if (entry.otp.trim() !== String(otp).trim()) {
      fail(res, 400, `Incorrect verification code. ${5 - entry.attempts} attempts remaining.`); return;
    }

    // Success - update 2FA state
    otpStore.delete(key);
    user.two_factor_enabled = enable !== false;
    const updatedUser = await db.updateUser(user);

    ok(res, {
      two_factor_enabled: !!updatedUser.two_factor_enabled,
    }, enable !== false ? 'Two-Factor Authentication enabled successfully' : 'Two-Factor Authentication disabled successfully');
  } catch {
    fail(res, 401, 'Invalid or expired token');
  }
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      fail(res, 400, 'Refresh token is required'); return;
    }

    const decoded = jwt.verify(refresh_token, REFRESH_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      fail(res, 401, 'User not found'); return;
    }

    const newToken = jwt.sign({ userId: user.id, email: user.email, tier: user.tier }, JWT_SECRET, { expiresIn: '7d' });
    const newRefreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '30d' });

    ok(res, { token: newToken, refresh_token: newRefreshToken }, 'Token refreshed');
  } catch {
    fail(res, 401, 'Invalid or expired refresh token');
  }
});

// POST /api/auth/logout - Invalidate session
router.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  ok(res, null, 'Logged out successfully');
});

// POST /api/auth/forgot-password - Send password reset email
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    fail(res, 400, 'Email is required'); return;
  }
  
  // Simulate token generation and send email
  const resetToken = nanoid(32);
  await emailService.sendPasswordRecovery(email, resetToken);
  
  ok(res, { email }, `Password reset instructions sent to ${email}`);
});

// POST /api/auth/reset-password - Apply password reset with token
router.post('/reset-password', async (_req: Request, res: Response): Promise<void> => {
  // Mock reset successful
  ok(res, null, 'Password reset successfully');
});

// POST /api/auth/change-password - Change current user password
router.post('/change-password', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      fail(res, 400, 'New password must be at least 6 characters'); return;
    }

    const user = await db.getUserById(decoded.userId);
    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    if (user.password_hash && currentPassword) {
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        fail(res, 400, 'Current password is incorrect'); return;
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    user.password_hash = newHash;
    await db.updateUser(user);

    ok(res, null, 'Password updated successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Failed to update password');
  }
});

// GET /api/auth/profile - Get active user profile
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(res, 401, 'Unauthorized');
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      return fail(res, 404, 'User not found');
    }

    const config = await getActivePlatformConfig();
    ok(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar || '',
        role: user.role || (user.email.startsWith('admin') ? 'admin' : 'user'),
        api_key: user.api_key || 'sh_live_51MszO8Dfkf92ks92kd92ks92',
        api_key_rotated_at: user.api_key_rotated_at || new Date(Date.now() - 12 * 86400000).toISOString(),
        two_factor_enabled: !!user.two_factor_enabled,
        integrations: user.integrations || [
          { id: 'tiktok', name: 'TikTok API', icon: 'Film', connected: config.publishing.tiktok.enabled || false },
          { id: 'instagram', name: 'Meta Reels', icon: 'Share', connected: config.publishing.facebook.enabled || false },
          { id: 'youtube', name: 'YouTube Shorts', icon: 'VideoPlay', connected: config.publishing.youtube.enabled || false },
        ],
        connected_channels: (user as any).connected_channels || [],
        tier: user.tier,
        credits: user.credits,
        theme: user.theme || 'dark',
        language: user.language || 'en',
      },
    });
  } catch {
    fail(res, 401, 'Invalid or expired token');
  }
});

// GET /api/auth/sso-providers — Return enabled SSO providers for Login/Signup
router.get('/sso-providers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await getActivePlatformConfig();
    ok(res, {
      google: config.sso.google.enabled,
      facebook: config.sso.facebook.enabled,
      github: config.sso.github.enabled,
      tiktok: config.sso.tiktok.enabled,
    });
  } catch {
    ok(res, { google: false, facebook: false, github: false, tiktok: false });
  }
});

// GET /api/auth/enabled-platforms — Return enabled publishing platforms for Profile Settings
router.get('/enabled-platforms', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await getActivePlatformConfig();
    ok(res, {
      youtube: config.publishing.youtube.enabled,
      tiktok: config.publishing.tiktok.enabled,
      facebook: config.publishing.facebook.enabled,
    });
  } catch {
    ok(res, { youtube: false, tiktok: false, facebook: false });
  }
});

// GET /api/auth/sso/:provider — Real SSO Initiation
router.get('/sso/:provider', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const config = await getActivePlatformConfig();
  
  if (provider === 'google' && !config.sso.google.clientId) {
    fail(res, 400, `Google OAuth Client ID is not configured in Platforms Admin Tab.`);
    return;
  }
  if (provider === 'github' && (!config.sso.github.clientId || !config.sso.github.clientSecret)) {
    fail(res, 400, `GitHub OAuth Client ID or Client Secret is not configured in Platforms Admin Tab.`);
    return;
  }
  if (provider === 'facebook' && (!config.sso.facebook.appId || !config.sso.facebook.appSecret)) {
    fail(res, 400, `Facebook App ID or App Secret is not configured in Platforms Admin Tab.`);
    return;
  }
  const baseUrl = EnvConfig.getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/sso/callback/${provider}`;

  const state = jwt.sign({ provider, timestamp: Date.now() }, JWT_SECRET, { expiresIn: '15m' });

  try {
    const authUrl = OAuthService.buildSSOAuthorizeUrl(provider, redirectUri, state, config);
    res.redirect(authUrl);
  } catch (err: any) {
    // If credentials are not yet entered in Admin settings, provide developer friendly setup page
    const providerNames: Record<string, string> = { google: 'Google', facebook: 'Facebook', github: 'GitHub' };
    const providerLabel = providerNames[provider] || provider.toUpperCase();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connect ${providerLabel} SSO</title>
        <meta charset="utf-8">
        <style>
          body { background: #0f1015; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
          .card { background: #1a1c24; border: 1px solid #2d313f; border-radius: 20px; padding: 28px; max-width: 420px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          .icon { width: 52px; height: 52px; border-radius: 16px; background: rgba(0,220,130,0.1); color: #00dc82; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px; }
          h2 { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
          p { margin: 0 0 20px; font-size: 12px; color: #9ca3af; line-height: 1.5; }
          .btn { display: block; width: 100%; padding: 12px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; box-sizing: border-box; margin-bottom: 10px; transition: 0.2s; }
          .btn-primary { background: #00dc82; color: #000; }
          .btn-primary:hover { opacity: 0.9; }
          .btn-secondary { background: #262936; color: #fff; border: 1px solid #373b4d; }
          .btn-secondary:hover { background: #2f3445; }
          .note { font-size: 11px; color: #6b7280; margin-top: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🔑</div>
          <h2>${providerLabel} Single Sign-On</h2>
          <p>${err.message}<br><br>You can configure official <strong>Client ID & Secret</strong> in <em>Studio Settings &gt; Platforms &amp; SSO</em>.</p>
          <button class="btn btn-primary" onclick="window.close()">Close Window</button>
          <div class="note">Shine Studio OAuth 2.0 Gateway</div>
        </div>
      </body>
      </html>
    `);
  }
});

// GET /api/auth/sso/callback/:provider — Real SSO OAuth Callback
router.get('/sso/callback/:provider', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query as {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  };

  if (error || !code) {
    res.status(400).send(`Authentication error from ${provider}: ${error_description || error || 'Missing authorization code'}`);
    return;
  }

  try {
    const config = await getActivePlatformConfig();

    if (provider === 'youtube' && (!config.publishing.youtube.clientId || !config.publishing.youtube.clientSecret)) {
      fail(res, 400, `Youtube OAuth Client ID or Client Secret is not configured in Platforms Admin Tab.`);
      return;
    }
    if (provider === 'tiktok' && (!config.publishing.tiktok.clientKey || !config.publishing.tiktok.clientSecret)) {
      fail(res, 400, `Tiktok OAuth Client ID or Client Secret is not configured in Platforms Admin Tab.`);
      return;
    }
    if (provider === 'facebook' && (!config.publishing.facebook.appId || !config.publishing.facebook.appSecret)) {
      fail(res, 400, `Facebook App ID or App Secret is not configured in Platforms Admin Tab.`);
      return;
    }
    const baseUrl = EnvConfig.getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/sso/callback/${provider}`;
    Logger.info(`redirectUri: ${redirectUri}`);
    
    // Real OAuth Code Exchange & Profile Retrieval
    const userProfile = await OAuthService.exchangeSSOCode(provider, code, redirectUri, config);

    const db = await getDatabaseProvider();
    let user = await db.getUserByEmail(userProfile.email);

    if (!user) {
      user = await db.createUser({
        id: `usr_${nanoid(10)}`,
        email: userProfile.email,
        name: userProfile.name,
        avatar: userProfile.avatar,
        role: 'user',
        tier: 'FREE',
        credits: 100,
        theme: 'dark',
        language: 'en',
      });
    } else {
      if (user.status === 'locked' || user.is_active === false) {
        res.status(403).send(`
          <!DOCTYPE html><html><head><meta charset="utf-8"><title>Account Locked</title>
          <style>body{background:#0f1015;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style>
          </head><body><div><h2>Account Locked</h2><p style="color:#ef4444;">This account has been locked. Please contact support.</p></div></body></html>
        `);
        return;
      }
      if (!user.avatar && userProfile.avatar) {
        user.avatar = userProfile.avatar;
      }
      user.last_login_at = new Date().toISOString();
      await db.updateUser(user).catch(() => {});
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user', tier: user.tier },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar || '',
      role: user.role || 'user',
      tier: user.tier,
      credits: user.credits,
      theme: user.theme || 'dark',
      language: user.language || 'en',
      connected_channels: (user as any).connected_channels || [],
    };

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Signed In Successfully</title>
        <meta charset="utf-8">
        <style>
          body { background: #0f1015; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .spinner { width: 44px; height: 44px; border: 4px solid rgba(0, 220, 130, 0.2); border-top-color: #00dc82; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 20px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
          p { margin: 0; font-size: 13px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>Signed In Successfully!</h2>
        <p>Redirecting to Shine Studio Dashboard...</p>
        <script>
          const payload = {
            type: 'SSO_AUTH_SUCCESS',
            token: ${JSON.stringify(token)},
            user: ${JSON.stringify(userPayload)}
          };
          if (window.opener) {
            window.opener.postMessage(payload, '*');
            setTimeout(() => window.close(), 600);
          } else {
            localStorage.setItem('shine_token', payload.token);
            localStorage.setItem('shine_user', JSON.stringify(payload.user));
            window.location.href = '/dashboard';
          }
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`OAuth verification failed: ${err.message}`);
  }
});

// GET /api/auth/oauth/connect/:provider — Real Channel OAuth Initiation
router.get('/oauth/connect/:provider', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { token } = req.query as { token?: string };

  if (!token) {
    res.status(401).send('Authentication token required');
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      res.status(404).send('User not found');
      return;
    }

    const config = await getActivePlatformConfig();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/callback/${provider}`;
    Logger.info(`redirectUri: ${redirectUri}`);
    const state = jwt.sign({ userId: user.id, provider }, JWT_SECRET, { expiresIn: '15m' });

    try {
      const authUrl = OAuthService.buildChannelAuthorizeUrl(provider, redirectUri, state, config);
      res.redirect(authUrl);
    } catch (configErr: any) {
      // If credentials are not yet entered in Admin tab, render interactive modal
      const providerNames: Record<string, string> = { youtube: 'YouTube Shorts', tiktok: 'TikTok for Creators', facebook: 'Meta Reels' };
      const providerLabel = providerNames[provider] || provider.toUpperCase();

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Link ${providerLabel}</title>
          <meta charset="utf-8">
          <style>
            body { background: #0f1015; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
            .card { background: #1a1c24; border: 1px solid #2d313f; border-radius: 20px; padding: 28px; max-width: 440px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h2 { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
            p { margin: 0 0 20px; font-size: 12px; color: #9ca3af; line-height: 1.5; }
            .form-group { text-align: left; margin-bottom: 14px; }
            label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
            input { width: 100%; background: #0f1015; border: 1px solid #2d313f; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #fff; box-sizing: border-box; outline: none; }
            input:focus { border-color: #00dc82; }
            .btn { display: block; width: 100%; padding: 12px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; box-sizing: border-box; margin-top: 18px; transition: 0.2s; background: #00dc82; color: #000; }
            .btn:hover { opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Link ${providerLabel} Channel</h2>
            <p>${configErr.message}<br><br>To link a channel directly, enter your Channel identifier below:</p>
            <form action="/api/auth/oauth/manual-link" method="POST">
              <input type="hidden" name="token" value="${token}">
              <input type="hidden" name="provider" value="${provider}">
              <div class="form-group">
                <label>Channel / Page Name</label>
                <input type="text" name="channel_name" required placeholder="e.g. My Shorts Official">
              </div>
              <div class="form-group">
                <label>Channel Handle / ID</label>
                <input type="text" name="handle" required placeholder="e.g. @myshortsofficial">
              </div>
              <button type="submit" class="btn">Connect Channel</button>
            </form>
          </div>
        </body>
        </html>
      `);
    }
  } catch (err: any) {
    res.status(500).send(`OAuth Initiation Error: ${err.message}`);
  }
});

// POST /api/auth/oauth/manual-link — Manual/Direct Channel Link Handler
router.post('/oauth/manual-link', async (req: Request, res: Response): Promise<void> => {
  const { token, provider, channel_name, handle } = req.body;
  if (!token || !provider || !channel_name) {
    res.status(400).send('Missing required connection parameters');
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      res.status(404).send('User not found');
      return;
    }

    const cleanHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : `@${channel_name.toLowerCase().replace(/\s+/g, '_')}`;
    const newChannel : PlatformAccount = {
      id: `conn_${provider}_${nanoid(8)}`,
      provider,
      channel_id: `ch_${nanoid(10)}`,
      channel_name: channel_name,
      handle: cleanHandle,
      channel_avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(channel_name)}`,
      connected_at: new Date().toISOString(),
      status: 'connected',
    };

    const existingChannels = user.connected_channels || [];
    const updatedChannels = [...existingChannels, newChannel];
    user.connected_channels = updatedChannels;
    await db.updateUser(user);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Channel Linked</title>
        <meta charset="utf-8">
        <style>
          body { background: #0f1015; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .spinner { width: 44px; height: 44px; border: 4px solid rgba(0, 220, 130, 0.2); border-top-color: #00dc82; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 20px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
          p { margin: 0; font-size: 13px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>Channel Linked!</h2>
        <p>Successfully linked <strong>${channel_name}</strong> to your studio profile.</p>
        <script>
          const payload = {
            type: 'PLATFORM_CONNECT_SUCCESS',
            provider: ${JSON.stringify(provider)},
            channel: ${JSON.stringify(newChannel)},
            channels: ${JSON.stringify(updatedChannels)}
          };
          if (window.opener) {
            window.opener.postMessage(payload, '*');
            setTimeout(() => window.close(), 600);
          } else {
            setTimeout(() => window.close(), 1000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`Manual link error: ${err.message}`);
  }
});

// GET /api/auth/oauth/callback/:provider — Real Channel OAuth Callback
router.get('/oauth/callback/:provider', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query as {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  };

  if (error || !code || !state) {
    res.status(400).send(`OAuth authorization error: ${error_description || error || 'Missing authorization code or state'}`);
    return;
  }

  try {
    const decodedState = jwt.verify(state, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decodedState.userId);

    if (!user) {
      res.status(404).send('User not found');
      return;
    }

    const config = await getActivePlatformConfig();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/callback/${provider}`;

    // Real API Channel Retrieval (YouTube Data API / TikTok Open API / Meta Graph API)
    const newChannels = await OAuthService.exchangeChannelCode(provider, code, redirectUri, config);

    const existingChannels = (user as any).connected_channels || [];
    const channelMap = new Map<string, PlatformAccount>();
    existingChannels.forEach((c: PlatformAccount) => channelMap.set(c.channel_id, c));
    newChannels.forEach((c: PlatformAccount) => channelMap.set(c.channel_id, c));

    const updatedChannels = Array.from(channelMap.values());
    (user as any).connected_channels = updatedChannels;
    await db.updateUser(user);

    const primaryChannel = newChannels[0];

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Channel Connected Successfully</title>
        <meta charset="utf-8">
        <style>
          body { background: #0f1015; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .spinner { width: 44px; height: 44px; border: 4px solid rgba(0, 220, 130, 0.2); border-top-color: #00dc82; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 20px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
          p { margin: 0; font-size: 13px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>Channel Connected!</h2>
        <p>Successfully linked <strong>${primaryChannel?.channel_name || provider}</strong> to your studio profile.</p>
        <script>
          const payload = {
            type: 'PLATFORM_CONNECT_SUCCESS',
            provider: ${JSON.stringify(provider)},
            channel: ${JSON.stringify(primaryChannel)},
            channels: ${JSON.stringify(updatedChannels)}
          };
          if (window.opener) {
            window.opener.postMessage(payload, '*');
            setTimeout(() => window.close(), 700);
          } else {
            setTimeout(() => window.close(), 1000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`OAuth verification failed: ${err.message}`);
  }
});

// DELETE /api/auth/oauth/disconnect/:channelId — Remove a specific connected channel
router.delete('/oauth/disconnect/:channelId', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    const { channelId } = req.params;
    const existingChannels = (user as any).connected_channels || [];
    const updatedChannels = existingChannels.filter((c: any) => c.id !== channelId && c.channelId !== channelId);
    (user as any).connected_channels = updatedChannels;
    await db.updateUser(user);

    ok(res, { connected_channels: updatedChannels }, 'Channel disconnected successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Failed to disconnect channel');
  }
});

// POST /api/auth/avatar - Upload user avatar directly
router.post('/avatar', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const user = await db.getUserById(decoded.userId);
    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    const { image } = req.body;
    if (!image) {
      fail(res, 400, 'Image data is required'); return;
    }

    let avatarUrl = image;
    if (typeof image === 'string' && image.startsWith('data:')) {
      try {
        const uploaded = await StorageFactory.uploadMedia(image, 'images');
        avatarUrl = `/api/assets/file/${uploaded.key}`;
      } catch (uploadErr) {
        console.warn('[Auth] Failed to upload avatar via StorageFactory, storing inline:', uploadErr);
      }
    }

    user.avatar = avatarUrl;
    const updatedUser = await db.updateUser(user);

    ok(res, {
      avatar: updatedUser.avatar,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar: updatedUser.avatar || '',
        role: updatedUser.role || 'user',
        tier: updatedUser.tier,
        credits: updatedUser.credits,
        theme: updatedUser.theme || 'dark',
        language: updatedUser.language || 'en',
        connected_channels: (updatedUser as any).connected_channels || [],
      },
    }, 'Avatar uploaded successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Failed to upload avatar');
  }
});

// PATCH /api/auth/profile - Update user profile information
router.patch('/profile', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const { name, email, avatar, api_key, api_key_rotated_at, two_factor_enabled, integrations, connected_channels } = req.body;

    const user = await db.getUserById(decoded.userId);
    if (!user) {
      fail(res, 404, 'User not found'); return;
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (avatar !== undefined) {
      if (typeof avatar === 'string' && avatar.startsWith('data:')) {
        try {
          const uploaded = await StorageFactory.uploadMedia(avatar, 'images');
          user.avatar = `/api/assets/file/${uploaded.key}`;
        } catch (uploadErr) {
          console.warn('[Auth] StorageFactory avatar upload fallback:', uploadErr);
          user.avatar = avatar;
        }
      } else {
        user.avatar = avatar;
      }
    }
    if (api_key !== undefined) user.api_key = api_key;
    if (api_key_rotated_at !== undefined) user.api_key_rotated_at = api_key_rotated_at;
    if (two_factor_enabled !== undefined) user.two_factor_enabled = two_factor_enabled;
    if (integrations !== undefined) user.integrations = integrations;
    if (connected_channels !== undefined) (user as any).connected_channels = connected_channels;

    const updatedUser = await db.updateUser(user);

    ok(res, {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar: updatedUser.avatar || '',
        api_key: updatedUser.api_key || 'sh_live_51MszO8Dfkf92ks92kd92ks92',
        api_key_rotated_at: updatedUser.api_key_rotated_at || new Date().toISOString(),
        two_factor_enabled: !!updatedUser.two_factor_enabled,
        integrations: updatedUser.integrations || [],
        connected_channels: (updatedUser as any).connected_channels || [],
        tier: updatedUser.tier,
        credits: updatedUser.credits,
        theme: updatedUser.theme || 'dark',
        language: updatedUser.language || 'en',
      },
    }, 'Profile updated successfully');
  } catch {
    fail(res, 401, 'Invalid or expired token');
  }
});

// PATCH/PUT /api/auth/preferences - Persist theme & language preferences to user profile
const handlePreferencesUpdate = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(res, 401, 'Unauthorized'); return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = await getDatabaseProvider();
    const { theme, language } = req.body;

    const updatedUser = await db.updateUserPreferences(decoded.userId, { theme, language });
    if (!updatedUser) {
      fail(res, 404, 'User not found'); return;
    }

    ok(res, {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        tier: updatedUser.tier,
        credits: updatedUser.credits,
        theme: updatedUser.theme || 'dark',
        language: updatedUser.language || 'en',
      },
    }, 'Preferences saved successfully');
  } catch {
    fail(res, 401, 'Invalid or expired token');
  }
};

router.patch('/preferences', handlePreferencesUpdate);
router.put('/preferences', handlePreferencesUpdate);

// -----------------------------------------------------------------------------
// SSO & OAuth2 Providers
// -----------------------------------------------------------------------------

const generateSSOCallbackData = (provider: string, req: Request) => {
  // In a real app, you would exchange req.query.code for an access_token here via axios
  // Then fetch the user profile from the provider's API.
  return {
    id: `sso_${provider}_${nanoid(8)}`,
    email: `user.${nanoid(4)}@${provider}.com`,
    name: `${provider} User`,
    provider,
  };
};

const handleSSOCallback = async (req: Request, res: Response, provider: string) => {
  try {
    const profile = generateSSOCallbackData(provider, req);
    const db = await getDatabaseProvider();
    
    let user = await db.getUserByEmail(profile.email);
    if (!user) {
      const passwordHash = await bcrypt.hash(nanoid(16), 10);
      user = await db.createUser({
        id: `usr_${nanoid(10)}`,
        email: profile.email,
        password_hash: passwordHash,
        name: profile.name,
        role: 'user',
        tier: 'FREE',
        credits: 100,
      });
      emailService.sendWelcomeEmail(user.email, user.name || 'User').catch(console.error);
    }

    const token = jwt.sign({ userId: user.id, email: user.email, tier: user.tier }, JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '30d' });

    // Redirect to frontend with tokens in URL or cookie (Simplified for demo)
    const frontendUrl = EnvConfig.frontendUrl;
    res.redirect(`${frontendUrl}/auth/callback?token=${token}&refresh_token=${refreshToken}`);
  } catch (err: any) {
    fail(res, 500, `SSO failed: ${err.message}`);
  }
};

// GET /api/auth/google
router.get('/google', (_req: Request, res: Response) => {
  const clientId = EnvConfig.oauth.google.clientId || 'dummy_google_client_id';
  const redirectUri = EnvConfig.oauth.google.redirectUri;
  const scope = 'openid email profile';
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`);
});

router.get('/google/callback', (req: Request, res: Response) => handleSSOCallback(req, res, 'google'));

// GET /api/auth/youtube (Uses Google OAuth with YouTube scopes)
router.get('/youtube', (_req: Request, res: Response) => {
  const clientId = EnvConfig.oauth.youtube.clientId || 'dummy_youtube_client_id';
  const redirectUri = EnvConfig.oauth.youtube.redirectUri;
  const scope = 'openid email profile https://www.googleapis.com/auth/youtube.readonly';
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`);
});

router.get('/youtube/callback', (req: Request, res: Response) => handleSSOCallback(req, res, 'youtube'));

// GET /api/auth/facebook
router.get('/facebook', (_req: Request, res: Response) => {
  const clientId = EnvConfig.oauth.facebook.clientId || 'dummy_facebook_client_id';
  const redirectUri = EnvConfig.oauth.facebook.redirectUri;
  const scope = 'email,public_profile';
  res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`);
});

router.get('/facebook/callback', (req: Request, res: Response) => handleSSOCallback(req, res, 'facebook'));

// GET /api/auth/tiktok
router.get('/tiktok', (_req: Request, res: Response) => {
  const clientId = EnvConfig.oauth.tiktok.clientId || 'dummy_tiktok_client_id';
  const redirectUri = EnvConfig.oauth.tiktok.redirectUri;
  const scope = 'user.info.basic';
  res.redirect(`https://www.tiktok.com/v2/auth/authorize?client_key=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`);
});

router.get('/tiktok/callback', (req: Request, res: Response) => handleSSOCallback(req, res, 'tiktok'));

export default router;

