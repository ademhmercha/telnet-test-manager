class GetSystemLogsUseCase {
  async execute() {
    return {
      message: 'Logs système',
      logs: [
        { timestamp: new Date().toISOString(),                  level: 'INFO',    message: 'Système opérationnel',             component: 'system' },
        { timestamp: new Date(Date.now()-60000).toISOString(),  level: 'INFO',    message: 'Connexion utilisateur établie',    component: 'auth' },
        { timestamp: new Date(Date.now()-120000).toISOString(), level: 'WARNING', message: 'Test terminé avec avertissements', component: 'test-engine' }
      ],
      total: 3
    };
  }
}
module.exports = GetSystemLogsUseCase;
