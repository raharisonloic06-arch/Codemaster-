const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/courses — liste des cours avec progression si connecté
router.get('/', optionalAuth, async (req, res) => {
  const courses = await db.query(
    `SELECT c.*, COUNT(ch.id)::int AS chapter_count
     FROM courses c LEFT JOIN chapters ch ON ch.course_id = c.id
     GROUP BY c.id ORDER BY c.id`
  );
  let progressMap = {};
  if (req.user) {
    const prog = await db.query(
      'SELECT course_id, chapters_done FROM user_course_progress WHERE user_id = $1',
      [req.user.id]
    );
    prog.rows.forEach((p) => (progressMap[p.course_id] = p.chapters_done));
  }
  const data = courses.rows.map((c) => ({ ...c, chapters_done: progressMap[c.id] || 0 }));
  res.json({ courses: data });
});

// GET /api/courses/:id — détail + chapitres
router.get('/:id', async (req, res) => {
  const course = await db.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!course.rows[0]) return res.status(404).json({ error: 'Cours introuvable.' });
  const chapters = await db.query(
    'SELECT id, position, title, explanation, code_example, exercise FROM chapters WHERE course_id = $1 ORDER BY position',
    [req.params.id]
  );
  res.json({ course: course.rows[0], chapters: chapters.rows });
});

// GET /api/courses/chapters/:chapterId/quiz — questions du quiz
router.get('/chapters/:chapterId/quiz', async (req, res) => {
  const result = await db.query(
    'SELECT id, question, options FROM quiz_questions WHERE chapter_id = $1',
    [req.params.chapterId]
  );
  res.json({ questions: result.rows }); // correct_index volontairement omis côté client
});

// POST /api/courses/chapters/:chapterId/quiz/submit — correction du quiz
router.post('/chapters/:chapterId/quiz/submit', requireAuth, async (req, res) => {
  const { answers } = req.body; // [{questionId, selectedIndex}]
  const ids = answers.map((a) => a.questionId);
  const rows = await db.query('SELECT id, correct_index FROM quiz_questions WHERE id = ANY($1::int[])', [ids]);
  const correctMap = Object.fromEntries(rows.rows.map((r) => [r.id, r.correct_index]));
  let score = 0;
  answers.forEach((a) => { if (correctMap[a.questionId] === a.selectedIndex) score++; });
  res.json({ score, total: answers.length });
});

// POST /api/courses/:id/complete-chapter — marque un chapitre terminé + XP
router.post('/:id/complete-chapter', requireAuth, async (req, res) => {
  const { chaptersDone } = req.body; // nombre de chapitres complétés (côté client, validé ici)
  const courseId = req.params.id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_course_progress (user_id, course_id, chapters_done)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, course_id)
       DO UPDATE SET chapters_done = GREATEST(user_course_progress.chapters_done, $3), updated_at = now()`,
      [req.user.id, courseId, chaptersDone]
    );
    const XP_PER_CHAPTER = 50;
    const updated = await client.query(
      'UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING xp',
      [XP_PER_CHAPTER, req.user.id]
    );
    await client.query('COMMIT');
    res.json({ xpAwarded: XP_PER_CHAPTER, totalXp: updated.rows[0].xp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la progression.' });
  } finally {
    client.release();
  }
});

module.exports = router;
