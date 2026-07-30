const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/leaderboard — top 50 par XP
router.get('/leaderboard', async (req, res) => {
  const result = await db.query(
    'SELECT name, xp FROM users ORDER BY xp DESC LIMIT 50'
  );
  res.json({ leaderboard: result.rows });
});

// GET /api/users/me/profile — profil complet : stats + badges
router.get('/me/profile', requireAuth, async (req, res) => {
  const user = (await db.query('SELECT id, name, email, xp, streak FROM users WHERE id=$1', [req.user.id])).rows[0];

  const lessonsCompleted = (await db.query(
    'SELECT COALESCE(SUM(chapters_done),0)::int AS n FROM user_course_progress WHERE user_id=$1', [req.user.id]
  )).rows[0].n;

  const coursesInProgress = (await db.query(
    'SELECT COUNT(*)::int AS n FROM user_course_progress WHERE user_id=$1', [req.user.id]
  )).rows[0].n;

  const challengesCompleted = (await db.query(
    'SELECT COUNT(DISTINCT challenge_id)::int AS n FROM user_challenge_submissions WHERE user_id=$1 AND passed=true', [req.user.id]
  )).rows[0].n;

  const badges = (await db.query(
    `SELECT b.id, b.name, b.icon FROM user_badges ub
     JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id=$1`, [req.user.id]
  )).rows;

  const level = Math.floor(user.xp / 200) + 1;
  const inLevel = user.xp % 200;

  res.json({
    user,
    level: { level, xpInLevel: inLevel, xpToNext: 200 - inLevel },
    stats: { lessonsCompleted, coursesInProgress, challengesCompleted },
    badges,
  });
});

module.exports = router;
