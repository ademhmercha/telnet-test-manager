'use strict';

const bcrypt = require('bcryptjs');
const CreateUserUseCase = require('../CreateUserUseCase');

const AUDIT_CTX = { userId: 1, username: 'admin', method: 'POST', url: '/admin/users', ip: '127.0.0.1' };

function makeRepos(lastId = 2) {
  return {
    userRepo: {
      findByUsername: jest.fn().mockResolvedValue(null),
      findLastId:     jest.fn().mockResolvedValue(lastId),
      create:         jest.fn().mockImplementation(data => Promise.resolve(data))
    },
    auditLogRepo: {
      create: jest.fn().mockResolvedValue({})
    }
  };
}

describe('CreateUserUseCase', () => {
  describe('validation', () => {
    it('throws 400 when required fields are missing', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: '', password: '', role: '' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 when role is invalid', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: 'user', password: 'pass', role: 'superadmin' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Rôle invalide') });
    });

    it('throws 409 when username already exists', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      userRepo.findByUsername.mockResolvedValue({ id: 1, username: 'existing' });
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: 'existing', password: 'pass', role: 'engineer' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('user creation', () => {
    it('assigns full permissions to admin role', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await useCase.execute({ username: 'newadmin', password: 'pass', role: 'admin' }, AUDIT_CTX);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: ['read','write','delete','admin','audit','manage_users','view_logs','run_tests']
        })
      );
    });

    it('assigns limited permissions to engineer role', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await useCase.execute({ username: 'neweng', password: 'pass', role: 'engineer' }, AUDIT_CTX);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ permissions: ['read','write','run_tests'] })
      );
    });

    it('hashes the password before storing', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await useCase.execute({ username: 'user', password: 'plaintext', role: 'engineer' }, AUDIT_CTX);

      const stored = userRepo.create.mock.calls[0][0];
      expect(stored.password).not.toBe('plaintext');
      expect(await bcrypt.compare('plaintext', stored.password)).toBe(true);
    });

    it('auto-increments ID from last user', async () => {
      const { userRepo, auditLogRepo } = makeRepos(5);
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await useCase.execute({ username: 'user6', password: 'pass', role: 'engineer' }, AUDIT_CTX);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 6 })
      );
    });

    it('defaults email to empty string when not provided', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await useCase.execute({ username: 'user', password: 'pass', role: 'engineer' }, AUDIT_CTX);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: '' })
      );
    });

    it('creates audit log with CREATE_USER action', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new CreateUserUseCase(userRepo, auditLogRepo);

      await useCase.execute({ username: 'user', password: 'pass', role: 'engineer' }, AUDIT_CTX);

      expect(auditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE_USER' })
      );
    });
  });
});
