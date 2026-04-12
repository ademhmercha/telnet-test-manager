const jwt = require('jsonwebtoken');

/**
 * Factory : crée le middleware d'authentification JWT.
 * Injecté avec userRepository depuis le container.
 */
function createAuthenticateMiddleware(userRepository) {
  return function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requis' });

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ error: 'Token invalide' });
      try {
        const fullUser = await userRepository.findById(decoded.id);
        if (!fullUser) return res.status(403).json({ error: 'Utilisateur non trouvé' });
        req.user = { ...decoded, ...fullUser };
        next();
      } catch (e) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
    });
  };
}

module.exports = { createAuthenticateMiddleware };
