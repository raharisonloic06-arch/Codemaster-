const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../mailer');

const router = express.Router();

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
};

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, xp: u.xp, streak: u.streak, emailVerified: u.email_verified };
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe sont requis.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }
  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const verifToken = makeToken();
    const verifExpires = new Date(Date.now() + 24 * 3600 * 1000);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, verification_token, verification_expires)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, xp, streak, email_verified`,
      [name.trim(), email.toLowerCase(), hash, verifToken, verifExpires]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.cookie('cm_token', token, COOKIE_OPTS);

    // L'échec d'envoi d'email ne doit pas bloquer la création du compte :
    // l'utilisateur pourra redemander un email de vérification via /resend-verification.
    sendVerificationEmail(user.email, user.name, verifToken).catch((e) =>
      console.error("Échec d'envoi de l'email de vérification :", e.message)
    );

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors de la création du compte." });
  }
});

// GET /api/auth/verify-email?token=...
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token manquant.' });
  const result = await db.query(
    `SELECT id FROM users WHERE verification_token = $1 AND verification_expires > now()`,
    [token]
  );
  if (!result.rows[0]) {
    return res.status(400).json({ error: 'Ce lien de vérification est invalide ou a expiré. Redemande un email depuis ton profil.' });
  }
  await db.query(
    `UPDATE users SET email_verified = true, verification_token = NULL, verification_expires = NULL WHERE id = $1`,
    [result.rows[0].id]
  );
  res.json({ ok: true, message: 'Adresse email confirmée. Tu peux maintenant profiter de toutes les fonctionnalités.' });
});

// POST /api/auth/resend-verification — nécessite d'être connecté
router.post('/resend-verification', requireAuth, async (req, res) => {
  const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (user.email_verified) return res.json({ ok: true, message: 'Ton email est déjà confirmé.' });

  const verifToken = makeToken();
  const verifExpires = new Date(Date.now() + 24 * 3600 * 1000);
  await db.query(
    'UPDATE users SET verification_token = $1, verification_expires = $2 WHERE id = $3',
    [verifToken, verifExpires, user.id]
  );
  await sendVerificationEmail(user.email, user.name, verifToken);
  res.json({ ok: true, message: 'Email de vérification renvoyé.' });
});

// POST /api/auth/request-password-reset
router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis.' });

  const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = userRes.rows[0];

  // Réponse identique que le compte existe ou non : évite de révéler quels emails sont inscrits.
  const genericResponse = { ok: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation vient d\'être envoyé.' };
  if (!user) return res.json(genericResponse);

  const resetToken = makeToken();
  const resetExpires = new Date(Date.now() + 3600 * 1000); // 1h
  await db.query('UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3', [resetToken, resetExpires, user.id]);
  sendPasswordResetEmail(user.email, user.name, resetToken).catch((e) =>
    console.error("Échec d'envoi de l'email de réinitialisation :", e.message)
  );
  res.json(genericResponse);
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token et nouveau mot de passe requis.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });

  const userRes = await db.query(
    'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > now()',
    [token]
  );
  if (!userRes.rows[0]) {
    return res.status(400).json({ error: 'Ce lien de réinitialisation est invalide ou a expiré.' });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await db.query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
    [hash, userRes.rows[0].id]
  );
  res.json({ ok: true, message: 'Mot de passe mis à jour. Tu peux te connecter.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

    // Mise à jour du streak (jours consécutifs)
    const today = new Date().toISOString().slice(0, 10);
    const last = user.last_active?.toISOString?.().slice(0, 10);
    let streak = user.streak;
    if (last !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = last === yesterday ? streak + 1 : 1;
      await db.query('UPDATE users SET streak = $1, last_active = $2 WHERE id = $3', [streak, today, user.id]);
    }

    const token = signToken(user);
    res.cookie('cm_token', token, COOKIE_OPTS);
    res.json({ user: publicUser({ ...user, streak }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('cm_token', COOKIE_OPTS);
  res.json({ ok: true });
});

// GET /api/auth/me — utilisateur courant à partir du cookie
router.get('/me', requireAuth, async (req, res) => {
  const result = await db.query('SELECT id, name, email, xp, streak, email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user: publicUser(result.rows[0]) });
});

module.exports = router;
