const express = require('express');
const axios = require('axios');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { maybeAwardBadges } = require('../badges');

const router = express.Router();

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const XP_PER_DIFFICULTY = 30;

// GET /api/challenges — liste (sans les tests, pour ne pas les exposer côté client)
router.get('/', async (req, res) => {
  const result = await db.query(
    'SELECT id, lang, title, description, starter_code, difficulty FROM challenges ORDER BY difficulty'
  );
  res.json({ challenges: result.rows });
});

// GET /api/challenges/:id
router.get('/:id', async (req, res) => {
  const result = await db.query(
    'SELECT id, lang, title, description, starter_code, difficulty FROM challenges WHERE id = $1',
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Défi introuvable.' });
  res.json({ challenge: result.rows[0] });
});

/**
 * Envoie le code + un test à Judge0 pour exécution sandboxée isolée,
 * puis compare stdout à la sortie attendue.
 * Doc Judge0 : https://ce.judge0.com/
 */
async function runOnJudge0(sourceCode, languageId, stdin) {
  const submission = {
    source_code: sourceCode,
    language_id: languageId,
    stdin: stdin || '',
  };
  const headers = { 
    'Content-Type': 'application/json',
    'x-rapidapi-key': process.env.JUDGE0_API_KEY,
    'x-rapidapi-host': new URL(JUDGE0_URL).hostname
  };

  const { data } = await axios.post(
    `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
    submission,
    { headers, timeout: 15000 }
  );
  return data; // { stdout, stderr, compile_output, status: {id, description}, ... }
}

// POST /api/challenges/:id/submit — exécute le code contre tous les tests
router.post('/:id/submit', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Le champ "code" est requis.' });
  }
  const chRes = await db.query('SELECT * FROM challenges WHERE id = $1', [req.params.id]);
  const challenge = chRes.rows[0];
  if (!challenge) return res.status(404).json({ error: 'Défi introuvable.' });

  try {
    const results = [];
    for (const test of challenge.test_cases) {
      const run = await runOnJudge0(code, challenge.judge0_language_id, test.input);
      const actual = (run.stdout || '').trim();
      const passed = actual === String(test.expected_output).trim() && run.status?.id === 3; // 3 = Accepted
      results.push({ passed, actual, expected: test.expected_output, stderr: run.stderr, compileError: run.compile_output });
    }
    const allPassed = results.every((r) => r.passed);

    await db.query(
      `INSERT INTO user_challenge_submissions (user_id, challenge_id, code, passed) VALUES ($1,$2,$3,$4)`,
      [req.user.id, challenge.id, code, allPassed]
    );

    let xpAwarded = 0;
    if (allPassed) {
      const already = await db.query(
        `SELECT 1 FROM user_challenge_submissions
         WHERE user_id=$1 AND challenge_id=$2 AND passed=true
         ORDER BY submitted_at ASC LIMIT 1`,
        [req.user.id, challenge.id]
      );
      // XP uniquement à la première réussite (already.rows[0] correspond à cette soumission elle-même,
      // donc on vérifie s'il n'y en avait pas d'autre avant celle-ci)
      const priorCount = await db.query(
        `SELECT COUNT(*)::int AS n FROM user_challenge_submissions
         WHERE user_id=$1 AND challenge_id=$2 AND passed=true`,
        [req.user.id, challenge.id]
      );
      if (priorCount.rows[0].n === 1) {
        xpAwarded = XP_PER_DIFFICULTY * challenge.difficulty;
        await db.query('UPDATE users SET xp = xp + $1 WHERE id = $2', [xpAwarded, req.user.id]);
      }
      await maybeAwardBadges(req.user.id);
    }

    res.json({ passed: allPassed, results, xpAwarded });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Le service d'exécution de code est indisponible. Réessaie dans un instant." });
  }
});

module.exports = router;
