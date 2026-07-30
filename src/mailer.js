const nodemailer = require('nodemailer');

/**
 * En production : renseigne SMTP_HOST/PORT/USER/PASS dans .env (ex: SendGrid, Mailgun,
 * Amazon SES, Postmark...). En dev, si SMTP_HOST est vide, on crée automatiquement un
 * compte Ethereal (boîte de test jetable) et on affiche un lien de prévisualisation
 * dans les logs — aucun vrai email n'est envoyé, rien à configurer pour tester le flow.
 */
let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
    // Fallback dev : compte de test Ethereal généré à la volée
    const testAccount = await nodemailer.createTestAccount();
    console.log('ℹ️  Aucun SMTP configuré — utilisation d\'un compte Ethereal de test pour les emails.');
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

async function sendMail({ to, subject, html }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"CodeMaster" <no-reply@codemaster.dev>',
    to,
    subject,
    html,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`✉️  Email envoyé (aperçu dev) : ${preview}`);
  return info;
}

function baseTemplate(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif; background:#0d1017; padding:32px; color:#eef1f8;">
    <div style="max-width:480px;margin:0 auto;background:#151a25;border-radius:16px;padding:32px;border:1px solid #262c3a;">
      <div style="font-weight:700;font-size:18px;margin-bottom:18px;">&lt;/&gt; CodeMaster</div>
      <h2 style="font-size:20px;margin-bottom:14px;">${title}</h2>
      ${bodyHtml}
      <p style="color:#5d6478;font-size:12px;margin-top:28px;">Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</p>
    </div>
  </div>`;
}

async function sendVerificationEmail(to, name, token) {
  const link = `${process.env.APP_URL}/verify-email?token=${token}`;
  await sendMail({
    to,
    subject: 'Confirme ton compte CodeMaster',
    html: baseTemplate(
      `Bienvenue ${name} !`,
      `<p style="color:#a7b0c2;line-height:1.6;">Confirme ton adresse email pour activer ton compte et sauvegarder ta progression.</p>
       <a href="${link}" style="display:inline-block;margin-top:12px;background:#2dd9c8;color:#04141a;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;">Confirmer mon email</a>
       <p style="color:#5d6478;font-size:12px;margin-top:16px;">Ce lien expire dans 24 heures.</p>`
    ),
  });
}

async function sendPasswordResetEmail(to, name, token) {
  const link = `${process.env.APP_URL}/reset-password?token=${token}`;
  await sendMail({
    to,
    subject: 'Réinitialise ton mot de passe CodeMaster',
    html: baseTemplate(
      `Réinitialisation du mot de passe`,
      `<p style="color:#a7b0c2;line-height:1.6;">Bonjour ${name}, clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
       <a href="${link}" style="display:inline-block;margin-top:12px;background:#9d7cf0;color:#0b0713;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;">Réinitialiser mon mot de passe</a>
       <p style="color:#5d6478;font-size:12px;margin-top:16px;">Ce lien expire dans 1 heure.</p>`
    ),
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
