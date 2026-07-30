const db = require('./db');

/**
 * Vérifie les conditions de badges pour un utilisateur et les attribue si besoin.
 * Appelé après : fin de chapitre, quiz, défi résolu.
 */
async function maybeAwardBadges(userId) {
  const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user) return;

  const [{ n: lessonsCompleted }] = (await db.query(
    'SELECT COALESCE(SUM(chapters_done),0)::int AS n FROM user_course_progress WHERE user_id=$1', [userId]
  )).rows;
  const [{ n: coursesStarted }] = (await db.query(
    'SELECT COUNT(*)::int AS n FROM user_course_progress WHERE user_id=$1', [userId]
  )).rows;
  const [{ n: challengesSolved }] = (await db.query(
    'SELECT COUNT(DISTINCT challenge_id)::int AS n FROM user_challenge_submissions WHERE user_id=$1 AND passed=true', [userId]
  )).rows;

  const level = Math.floor(user.xp / 200) + 1;

  const checks = [
    { id: 'b1', ok: lessonsCompleted >= 1 },
    { id: 'b2', ok: user.streak >= 3 },
    { id: 'b4', ok: challengesSolved >= 1 },
    { id: 'b5', ok: coursesStarted >= 3 },
    { id: 'b6', ok: level >= 5 },
  ];

  for (const c of checks) {
    if (c.ok) {
      await db.query(
        'INSERT INTO user_badges (user_id, badge_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [userId, c.id]
      );
    }
  }
}

module.exports = { maybeAwardBadges };
