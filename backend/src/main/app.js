const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const { createAuthRouter }           = require('../interfaces/http/routes/authRoutes');
const { createPosteRouter }          = require('../interfaces/http/routes/posteRoutes');
const { createProduitRouter }        = require('../interfaces/http/routes/produitRoutes');
const { createSlotRouter }           = require('../interfaces/http/routes/slotRoutes');
const { createReferenceRouter }      = require('../interfaces/http/routes/referenceRoutes');
const { createTelnetCommandRouter }  = require('../interfaces/http/routes/telnetCommandRoutes');
const { createTestRouter }           = require('../interfaces/http/routes/testRoutes');
const { createAdminRouter }          = require('../interfaces/http/routes/adminRoutes');
const { createReportRouter }         = require('../interfaces/http/routes/reportRoutes');
const { createHealthRouter }         = require('../interfaces/http/routes/healthRoutes');
const { errorHandler }               = require('../interfaces/http/middlewares/errorHandler');

function createApp(container) {
  const app = express();

  // ── Sécurité ──────────────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws://localhost:3003", "ws://localhost:3002"]
      }
    }
  }));

  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // ── Rate limiter login ─────────────────────────────────────────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
  });

  // ── Métriques middleware ───────────────────────────────────────────────────────
  app.use(container.metricsMiddleware);

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use('/', createAuthRouter(container.authController, loginLimiter, container.authenticate));
  app.use('/postes',          createPosteRouter(container.posteController,         container.authenticate, container.requirePermission, container.requireRole, container.auditLog));
  app.use('/produits',        createProduitRouter(container.produitController,     container.authenticate, container.requirePermission, container.requireRole, container.auditLog));
  app.use('/slots',           createSlotRouter(container.slotController,           container.authenticate, container.requirePermission, container.requireRole, container.auditLog));
  app.use('/references',      createReferenceRouter(container.referenceController, container.authenticate, container.requirePermission, container.requireRole, container.auditLog));
  app.use('/telnet-commands', createTelnetCommandRouter(container.telnetCommandController, container.authenticate, container.requirePermission, container.requireRole));
  app.use('/',                createTestRouter(container.testController,   container.authenticate, container.requirePermission));
  app.use('/admin',           createAdminRouter(container.adminController, container.authenticate, container.requirePermission, container.requireRole));
  app.use('/reports',         createReportRouter(container.reportController, container.authenticate, container.requirePermission));
  app.use('/',                createHealthRouter(container.metrics.register));

  // ── Error handler global ──────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
