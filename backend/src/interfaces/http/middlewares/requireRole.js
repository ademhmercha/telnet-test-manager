function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'Rôle requis' });
    next();
  };
}

module.exports = { requireRole };
