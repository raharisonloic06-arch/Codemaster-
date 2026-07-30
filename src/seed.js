/**
 * Insère les cours, chapitres, quiz et défis de démonstration.
 * Lancer une fois après la migration : node src/seed.js
 */
const db = require('./db');

async function seed() {
  await db.query(`INSERT INTO courses (id, lang, level, title, description) VALUES
    ('py-basics','python','Débutant','Python — Les fondamentaux','Variables, boucles et conditions pour bien démarrer.'),
    ('js-basics','javascript','Débutant','JavaScript — Les bases du web','Le langage du navigateur, variables et fonctions.'),
    ('java-basics','java','Débutant','Java — Introduction','Syntaxe, classes et méthode main.')
    ON CONFLICT (id) DO NOTHING;`);

  const chap = await db.query(`INSERT INTO chapters (course_id, position, title, explanation, code_example, exercise) VALUES
    ('py-basics',1,'Variables & types','En Python, une variable est un nom qui pointe vers une valeur.','nom = "Fifaliana"\nprint(nom)','Crée une variable ville et affiche-la.')
    ON CONFLICT (course_id, position) DO NOTHING RETURNING id;`);

  if (chap.rows[0]) {
    await db.query(`INSERT INTO quiz_questions (chapter_id, question, options, correct_index) VALUES
      ($1, 'Quel mot-clé définit une fonction en Python ?', '["func","def","function","lambda"]'::jsonb, 1)`,
      [chap.rows[0].id]);
  }

  await db.query(`INSERT INTO challenges (id, lang, title, description, starter_code, difficulty, judge0_language_id, test_cases) VALUES
    ('ch1','javascript','Somme de deux nombres','Lis deux entiers depuis l''entrée standard et affiche leur somme.',
     'const [a,b] = require("fs").readFileSync(0,"utf8").split(" ").map(Number);\nconsole.log(a+b);',
     1, 63, '[{"input":"4 7","expected_output":"11"}]'::jsonb)
    ON CONFLICT (id) DO NOTHING;`);
  // 63 = id Judge0 pour Node.js. Voir GET {JUDGE0_URL}/languages pour la liste complète.

  console.log('✓ Données de démonstration insérées.');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
