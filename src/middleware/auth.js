const jwt = require('jsonwebtoken');

/**
 * Vérifie le token JWT présent dans le cookie httpOnly "cm_token".
 * Sur succès, attache req.user = { id, email }.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.cm_token;
  if (!token) {
    return res.status(401).json({ error: 'Non authentifié. Connecte-toi pour continuer.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalide ou expirée. Reconnecte-toi.' });
  }
}

/**
 * Version optionnelle : n'échoue pas si absent, utile pour des routes publiques
 * qui personnalisent la réponse si l'utilisateur est connecté (ex: progression sur /courses).
 */
function optionalAuth(req, res, next) {
  const token = req.cookies?.cm_token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
  } catch (_) { /* ignore un token invalide en mode optionnel */ }
  next();
}

module.exports = { requireAuth, optionalAuth };
