function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user?.permissions?.includes(permission)) {
      return res.status(403).json({ error: 'Permission refusée' });
    }
    next();
  };
}

module.exports = { requirePermission };
