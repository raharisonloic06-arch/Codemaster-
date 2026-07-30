-- ============================================================
-- CodeMaster — Schéma PostgreSQL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- pour gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(80) NOT NULL,
  email         VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  xp            INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 1,
  last_active   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Vérification d'email
  email_verified        BOOLEAN NOT NULL DEFAULT false,
  verification_token    TEXT,
  verification_expires  TIMESTAMPTZ,

  -- Réinitialisation de mot de passe
  reset_token           TEXT,
  reset_expires         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);

CREATE TABLE IF NOT EXISTS courses (
  id        VARCHAR(60) PRIMARY KEY,   -- ex: 'py-basics'
  lang      VARCHAR(30) NOT NULL,      -- python | javascript | java | html | cpp
  level     VARCHAR(20) NOT NULL,      -- Débutant | Intermédiaire | Avancé
  title     VARCHAR(160) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS chapters (
  id          SERIAL PRIMARY KEY,
  course_id   VARCHAR(60) REFERENCES courses(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,        -- ordre dans le cours
  title       VARCHAR(160) NOT NULL,
  explanation TEXT NOT NULL,
  code_example TEXT NOT NULL,
  exercise    TEXT NOT NULL,
  UNIQUE(course_id, position)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id          SERIAL PRIMARY KEY,
  chapter_id  INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  options     JSONB NOT NULL,          -- ["a","b","c","d"]
  correct_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_course_progress (
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id     VARCHAR(60) REFERENCES courses(id) ON DELETE CASCADE,
  chapters_done INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id          VARCHAR(60) PRIMARY KEY,
  lang        VARCHAR(30) NOT NULL,
  title       VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  starter_code TEXT NOT NULL,
  difficulty  SMALLINT NOT NULL DEFAULT 1,
  judge0_language_id INTEGER NOT NULL,   -- id du langage cote Judge0
  test_cases  JSONB NOT NULL             -- [{"input":"...","expected_output":"..."}]
);

CREATE TABLE IF NOT EXISTS user_challenge_submissions (
  id          SERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id VARCHAR(60) REFERENCES challenges(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  passed      BOOLEAN NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS badges (
  id    VARCHAR(30) PRIMARY KEY,
  name  VARCHAR(80) NOT NULL,
  icon  VARCHAR(10) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  badge_id  VARCHAR(30) REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_users_xp ON users (xp DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters (course_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON user_challenge_submissions (user_id);

-- Quelques badges de base
INSERT INTO badges (id, name, icon) VALUES
  ('b1','Premier pas','🌱'),
  ('b2','Assidu','🔥'),
  ('b3','Quiz Master','🧠'),
  ('b4','Débogueur','🐞'),
  ('b5','Polyglotte','🌍'),
  ('b6','Niveau 5','⭐')
ON CONFLICT (id) DO NOTHING;
