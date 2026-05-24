'use strict';

const CreatePosteUseCase = require('../CreatePosteUseCase');

const AUDIT_CTX = { userId: 1, username: 'admin', method: 'POST', url: '/postes', ip: '127.0.0.1' };

function makeRepos(lastId = 3) {
  return {
    posteRepo: {
      findLastId: jest.fn().mockResolvedValue(lastId),
      create:     jest.fn().mockImplementation(data => Promise.resolve(data))
    },
    auditLogRepo: {
      create: jest.fn().mockResolvedValue({})
    }
  };
}

describe('CreatePosteUseCase', () => {
  describe('validation', () => {
    it('throws 400 when nom is missing', async () => {
      const { posteRepo, auditLogRepo } = makeRepos();
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      await expect(useCase.execute({ nom: '' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 400, message: 'Le nom est requis' });
    });

    it('does not call repository when validation fails', async () => {
      const { posteRepo, auditLogRepo } = makeRepos();
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      await expect(useCase.execute({ nom: '' }, AUDIT_CTX)).rejects.toThrow();
      expect(posteRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('poste creation', () => {
    it('returns message and created poste', async () => {
      const { posteRepo, auditLogRepo } = makeRepos();
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      const result = await useCase.execute({ nom: 'Poste A', description: 'desc', statut: 'actif' }, AUDIT_CTX);

      expect(result.message).toBe('Poste créé');
      expect(result.poste).toBeDefined();
    });

    it('uses default empty string for description when not provided', async () => {
      const { posteRepo, auditLogRepo } = makeRepos();
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      await useCase.execute({ nom: 'Poste B' }, AUDIT_CTX);

      expect(posteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: '' })
      );
    });

    it('uses default "actif" statut when not provided', async () => {
      const { posteRepo, auditLogRepo } = makeRepos();
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      await useCase.execute({ nom: 'Poste C' }, AUDIT_CTX);

      expect(posteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ statut: 'actif' })
      );
    });

    it('auto-increments ID from last poste', async () => {
      const { posteRepo, auditLogRepo } = makeRepos(10);
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      await useCase.execute({ nom: 'Poste D' }, AUDIT_CTX);

      expect(posteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 11 })
      );
    });

    it('creates audit log with CREATE_POSTE action', async () => {
      const { posteRepo, auditLogRepo } = makeRepos();
      const useCase = new CreatePosteUseCase(posteRepo, auditLogRepo);

      await useCase.execute({ nom: 'Poste E' }, AUDIT_CTX);

      expect(auditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE_POSTE' })
      );
    });
  });
});
