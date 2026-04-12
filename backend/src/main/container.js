/**
 * container.js — Injection de dépendances manuelle.
 * Construit et câble toutes les couches : infrastructure → application → interfaces.
 * Aucun new() n'existe dans les controllers ou use cases — tout vient d'ici.
 */

const path = require('path');

// ── Infrastructure : modèles Mongoose ────────────────────────────────────────

const UserModel          = require('../infrastructure/database/models/UserModel');
const PosteModel         = require('../infrastructure/database/models/PosteModel');
const ProduitModel       = require('../infrastructure/database/models/ProduitModel');
const ReferenceModel     = require('../infrastructure/database/models/ReferenceModel');
const SlotModel          = require('../infrastructure/database/models/SlotModel');
const TestResultModel    = require('../infrastructure/database/models/TestResultModel');
const TelnetCommandModel = require('../infrastructure/database/models/TelnetCommandModel');
const AuditLogModel      = require('../infrastructure/database/models/AuditLogModel');
const ReportModel        = require('../infrastructure/database/models/ReportModel');

// ── Infrastructure : repositories ────────────────────────────────────────────

const MongoUserRepository          = require('../infrastructure/database/repositories/MongoUserRepository');
const MongoPosteRepository         = require('../infrastructure/database/repositories/MongoPosteRepository');
const MongoProduitRepository       = require('../infrastructure/database/repositories/MongoProduitRepository');
const MongoReferenceRepository     = require('../infrastructure/database/repositories/MongoReferenceRepository');
const MongoSlotRepository          = require('../infrastructure/database/repositories/MongoSlotRepository');
const MongoTestResultRepository    = require('../infrastructure/database/repositories/MongoTestResultRepository');
const MongoTelnetCommandRepository = require('../infrastructure/database/repositories/MongoTelnetCommandRepository');
const MongoAuditLogRepository      = require('../infrastructure/database/repositories/MongoAuditLogRepository');
const MongoReportRepository        = require('../infrastructure/database/repositories/MongoReportRepository');

// ── Infrastructure : services ─────────────────────────────────────────────────

const TestWorkerManager             = require('../infrastructure/telnet/TestWorkerManager');
const { createMetrics }             = require('../infrastructure/metrics/prometheusMetrics');

// ── Application : use cases ───────────────────────────────────────────────────

const LoginUseCase                  = require('../application/usecases/auth/LoginUseCase');
const LogoutUseCase                 = require('../application/usecases/auth/LogoutUseCase');

const GetPostesUseCase              = require('../application/usecases/poste/GetPostesUseCase');
const CreatePosteUseCase            = require('../application/usecases/poste/CreatePosteUseCase');
const UpdatePosteUseCase            = require('../application/usecases/poste/UpdatePosteUseCase');
const DeletePosteUseCase            = require('../application/usecases/poste/DeletePosteUseCase');

const GetProduitsUseCase            = require('../application/usecases/produit/GetProduitsUseCase');
const CreateProduitUseCase          = require('../application/usecases/produit/CreateProduitUseCase');
const UpdateProduitUseCase          = require('../application/usecases/produit/UpdateProduitUseCase');
const DeleteProduitUseCase          = require('../application/usecases/produit/DeleteProduitUseCase');

const GetSlotsUseCase               = require('../application/usecases/slot/GetSlotsUseCase');
const CreateSlotUseCase             = require('../application/usecases/slot/CreateSlotUseCase');
const UpdateSlotUseCase             = require('../application/usecases/slot/UpdateSlotUseCase');
const DeleteSlotUseCase             = require('../application/usecases/slot/DeleteSlotUseCase');

const GetReferencesUseCase          = require('../application/usecases/reference/GetReferencesUseCase');
const CreateReferenceUseCase        = require('../application/usecases/reference/CreateReferenceUseCase');
const UpdateReferenceUseCase        = require('../application/usecases/reference/UpdateReferenceUseCase');
const DeleteReferenceUseCase        = require('../application/usecases/reference/DeleteReferenceUseCase');

const GetTelnetCommandsUseCase      = require('../application/usecases/telnetCommand/GetTelnetCommandsUseCase');
const CreateTelnetCommandUseCase    = require('../application/usecases/telnetCommand/CreateTelnetCommandUseCase');
const UpdateTelnetCommandUseCase    = require('../application/usecases/telnetCommand/UpdateTelnetCommandUseCase');
const DeleteTelnetCommandUseCase    = require('../application/usecases/telnetCommand/DeleteTelnetCommandUseCase');

const RunTestUseCase                = require('../application/usecases/test/RunTestUseCase');
const StopTestUseCase               = require('../application/usecases/test/StopTestUseCase');
const StopMonitoringUseCase         = require('../application/usecases/test/StopMonitoringUseCase');
const GetTestResultsUseCase         = require('../application/usecases/test/GetTestResultsUseCase');
const GetTestResultUseCase          = require('../application/usecases/test/GetTestResultUseCase');

const GetAuditLogsUseCase           = require('../application/usecases/admin/GetAuditLogsUseCase');
const GetUsersUseCase               = require('../application/usecases/admin/GetUsersUseCase');
const CreateUserUseCase             = require('../application/usecases/admin/CreateUserUseCase');
const UpdateUserUseCase             = require('../application/usecases/admin/UpdateUserUseCase');
const ResetPasswordUseCase          = require('../application/usecases/admin/ResetPasswordUseCase');
const DeleteUserUseCase             = require('../application/usecases/admin/DeleteUserUseCase');
const GetStatsUseCase               = require('../application/usecases/admin/GetStatsUseCase');
const GetAdminTestsUseCase          = require('../application/usecases/admin/GetAdminTestsUseCase');
const AdminStopTestUseCase          = require('../application/usecases/admin/AdminStopTestUseCase');
const AdminDeleteTestUseCase        = require('../application/usecases/admin/AdminDeleteTestUseCase');
const AdminBulkDeleteTestsUseCase   = require('../application/usecases/admin/AdminBulkDeleteTestsUseCase');
const GetAnalyticsUseCase           = require('../application/usecases/admin/GetAnalyticsUseCase');
const GetSystemLogsUseCase          = require('../application/usecases/admin/GetSystemLogsUseCase');

const GetReportsUseCase             = require('../application/usecases/report/GetReportsUseCase');
const GenerateReportUseCase         = require('../application/usecases/report/GenerateReportUseCase');
const GetReportUseCase              = require('../application/usecases/report/GetReportUseCase');
const DeleteReportUseCase           = require('../application/usecases/report/DeleteReportUseCase');

// ── Interfaces : controllers ──────────────────────────────────────────────────

const AuthController                = require('../interfaces/http/controllers/AuthController');
const PosteController               = require('../interfaces/http/controllers/PosteController');
const ProduitController             = require('../interfaces/http/controllers/ProduitController');
const SlotController                = require('../interfaces/http/controllers/SlotController');
const ReferenceController           = require('../interfaces/http/controllers/ReferenceController');
const TelnetCommandController       = require('../interfaces/http/controllers/TelnetCommandController');
const TestController                = require('../interfaces/http/controllers/TestController');
const AdminController               = require('../interfaces/http/controllers/AdminController');
const ReportController              = require('../interfaces/http/controllers/ReportController');

// ── Interfaces : middlewares ──────────────────────────────────────────────────

const { createAuthenticateMiddleware } = require('../interfaces/http/middlewares/authenticate');
const { requirePermission }            = require('../interfaces/http/middlewares/requirePermission');
const { requireRole }                  = require('../interfaces/http/middlewares/requireRole');
const { createAuditLogMiddleware }     = require('../interfaces/http/middlewares/auditLog');
const { createMetricsMiddleware }      = require('../interfaces/http/middlewares/metricsMiddleware');

function buildContainer() {
  // ── Métriques Prometheus ────────────────────────────────────────────────────
  const metrics = createMetrics();

  // ── Repositories ────────────────────────────────────────────────────────────
  const userRepo          = new MongoUserRepository(UserModel);
  const posteRepo         = new MongoPosteRepository(PosteModel);
  const produitRepo       = new MongoProduitRepository(ProduitModel);
  const referenceRepo     = new MongoReferenceRepository(ReferenceModel);
  const slotRepo          = new MongoSlotRepository(SlotModel);
  const testResultRepo    = new MongoTestResultRepository(TestResultModel);
  const telnetCommandRepo = new MongoTelnetCommandRepository(TelnetCommandModel);
  const auditLogRepo      = new MongoAuditLogRepository(AuditLogModel);
  const reportRepo        = new MongoReportRepository(ReportModel);

  // ── TestWorkerManager ────────────────────────────────────────────────────────
  const workerScriptPath  = path.join(__dirname, '../infrastructure/telnet/testWorker.js');
  const testWorkerManager = new TestWorkerManager(workerScriptPath);

  // ── Use Cases ─────────────────────────────────────────────────────────────────
  const loginUseCase   = new LoginUseCase(userRepo, auditLogRepo);
  const logoutUseCase  = new LogoutUseCase(userRepo, auditLogRepo);

  const getPostesUseCase    = new GetPostesUseCase(posteRepo);
  const createPosteUseCase  = new CreatePosteUseCase(posteRepo, auditLogRepo);
  const updatePosteUseCase  = new UpdatePosteUseCase(posteRepo, auditLogRepo);
  const deletePosteUseCase  = new DeletePosteUseCase(posteRepo, auditLogRepo);

  const getProduitsUseCase    = new GetProduitsUseCase(produitRepo);
  const createProduitUseCase  = new CreateProduitUseCase(produitRepo, auditLogRepo);
  const updateProduitUseCase  = new UpdateProduitUseCase(produitRepo, auditLogRepo);
  const deleteProduitUseCase  = new DeleteProduitUseCase(produitRepo, auditLogRepo);

  const getSlotsUseCase    = new GetSlotsUseCase(slotRepo);
  const createSlotUseCase  = new CreateSlotUseCase(slotRepo, auditLogRepo);
  const updateSlotUseCase  = new UpdateSlotUseCase(slotRepo, auditLogRepo);
  const deleteSlotUseCase  = new DeleteSlotUseCase(slotRepo, auditLogRepo);

  const getReferencesUseCase    = new GetReferencesUseCase(referenceRepo);
  const createReferenceUseCase  = new CreateReferenceUseCase(referenceRepo, auditLogRepo);
  const updateReferenceUseCase  = new UpdateReferenceUseCase(referenceRepo, auditLogRepo);
  const deleteReferenceUseCase  = new DeleteReferenceUseCase(referenceRepo, auditLogRepo);

  const getTelnetCommandsUseCase   = new GetTelnetCommandsUseCase(telnetCommandRepo);
  const createTelnetCommandUseCase = new CreateTelnetCommandUseCase(telnetCommandRepo, auditLogRepo);
  const updateTelnetCommandUseCase = new UpdateTelnetCommandUseCase(telnetCommandRepo, auditLogRepo);
  const deleteTelnetCommandUseCase = new DeleteTelnetCommandUseCase(telnetCommandRepo, auditLogRepo);

  const runTestUseCase       = new RunTestUseCase(testResultRepo, slotRepo, telnetCommandRepo, auditLogRepo, testWorkerManager, metrics);
  const stopTestUseCase      = new StopTestUseCase(testResultRepo, auditLogRepo, testWorkerManager);
  const stopMonitoringUseCase = new StopMonitoringUseCase(testResultRepo, testWorkerManager);
  const getTestResultsUseCase = new GetTestResultsUseCase(testResultRepo);
  const getTestResultUseCase  = new GetTestResultUseCase(testResultRepo);

  const getAuditLogsUseCase        = new GetAuditLogsUseCase(auditLogRepo);
  const getUsersUseCase            = new GetUsersUseCase(userRepo);
  const createUserUseCase          = new CreateUserUseCase(userRepo, auditLogRepo);
  const updateUserUseCase          = new UpdateUserUseCase(userRepo, auditLogRepo);
  const resetPasswordUseCase       = new ResetPasswordUseCase(userRepo, auditLogRepo);
  const deleteUserUseCase          = new DeleteUserUseCase(userRepo, auditLogRepo);
  const getStatsUseCase            = new GetStatsUseCase(testResultRepo, userRepo, telnetCommandRepo, reportRepo, testWorkerManager);
  const getAdminTestsUseCase       = new GetAdminTestsUseCase(testResultRepo);
  const adminStopTestUseCase       = new AdminStopTestUseCase(testResultRepo, auditLogRepo, testWorkerManager);
  const adminDeleteTestUseCase     = new AdminDeleteTestUseCase(testResultRepo, auditLogRepo);
  const adminBulkDeleteTestsUseCase = new AdminBulkDeleteTestsUseCase(testResultRepo, auditLogRepo);
  const getAnalyticsUseCase        = new GetAnalyticsUseCase(testResultRepo, auditLogRepo, produitRepo, userRepo);
  const getSystemLogsUseCase       = new GetSystemLogsUseCase();

  const getReportsUseCase    = new GetReportsUseCase(reportRepo);
  const generateReportUseCase = new GenerateReportUseCase(reportRepo, testResultRepo, slotRepo);
  const getReportUseCase     = new GetReportUseCase(reportRepo);
  const deleteReportUseCase  = new DeleteReportUseCase(reportRepo);

  // ── Controllers ──────────────────────────────────────────────────────────────
  const authController         = new AuthController(loginUseCase, logoutUseCase);
  const posteController        = new PosteController(getPostesUseCase, createPosteUseCase, updatePosteUseCase, deletePosteUseCase);
  const produitController      = new ProduitController(getProduitsUseCase, createProduitUseCase, updateProduitUseCase, deleteProduitUseCase);
  const slotController         = new SlotController(getSlotsUseCase, createSlotUseCase, updateSlotUseCase, deleteSlotUseCase);
  const referenceController    = new ReferenceController(getReferencesUseCase, createReferenceUseCase, updateReferenceUseCase, deleteReferenceUseCase);
  const telnetCommandController = new TelnetCommandController(getTelnetCommandsUseCase, createTelnetCommandUseCase, updateTelnetCommandUseCase, deleteTelnetCommandUseCase);
  const testController         = new TestController(runTestUseCase, stopTestUseCase, stopMonitoringUseCase, getTestResultsUseCase, getTestResultUseCase);

  const adminController = new AdminController({
    getAuditLogsUseCase, getUsersUseCase, createUserUseCase, updateUserUseCase,
    resetPasswordUseCase, deleteUserUseCase, getStatsUseCase, getAdminTestsUseCase,
    adminStopTestUseCase, adminDeleteTestUseCase, adminBulkDeleteTestsUseCase,
    getAnalyticsUseCase, getSystemLogsUseCase
  });

  const reportController = new ReportController(getReportsUseCase, generateReportUseCase, getReportUseCase, deleteReportUseCase);

  // ── Middlewares ───────────────────────────────────────────────────────────────
  const authenticate     = createAuthenticateMiddleware(userRepo);
  const auditLog         = createAuditLogMiddleware(auditLogRepo);
  const metricsMiddleware = createMetricsMiddleware(metrics.httpRequestsTotal, metrics.httpRequestDuration);

  return {
    // Controllers
    authController, posteController, produitController, slotController,
    referenceController, telnetCommandController, testController,
    adminController, reportController,
    // Middlewares
    authenticate, requirePermission, requireRole, auditLog, metricsMiddleware,
    // Services
    testWorkerManager,
    metrics
  };
}

module.exports = { buildContainer };
