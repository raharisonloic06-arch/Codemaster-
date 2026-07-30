require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const challengeRoutes = require('./routes/challenges');
const userRoutes = require('./routes/users');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Limite globale anti-abus (ajuster selon besoin, plus stricte sur /auth et /submit)
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const execLimiter = rateLimit({ windowMs: 60_000, max: 20 });

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/challenges', execLimiter, challengeRoutes);
app.use('/api/users', userRoutes);

// Gestion d'erreurs générique
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Une erreur interne est survenue.' });
});

module.exports = app;
