'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const LoginUseCase = require('../LoginUseCase');

const AUDIT_CTX = { method: 'POST', url: '/login', ip: '127.0.0.1', userAgent: 'jest' };

function makeRepos(overrides = {}) {
  return {
    userRepo: {
      findByUsername: jest.fn(),
      updateById:     jest.fn().mockResolvedValue({}),
      ...overrides.userRepo
    },
    auditLogRepo: {
      create: jest.fn().mockResolvedValue({}),
      ...overrides.auditLogRepo
    }
  };
}

describe('LoginUseCase', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key';
  });

  describe('validation', () => {
    it('throws 400 when username is missing', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new LoginUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: '', password: 'pass' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 400, message: 'Identifiants manquants' });
    });

    it('throws 400 when password is missing', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      const useCase = new LoginUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: 'admin', password: '' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('authentication', () => {
    it('throws 401 when user does not exist', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      userRepo.findByUsername.mockResolvedValue(null);
      const useCase = new LoginUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: 'ghost', password: 'pass' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 401, message: 'Identifiants incorrects' });
    });

    it('throws 401 when password is wrong', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      userRepo.findByUsername.mockResolvedValue({
        id: 1, username: 'admin',
        password: await bcrypt.hash('correct', 10),
        role: 'admin'
      });
      const useCase = new LoginUseCase(userRepo, auditLogRepo);

      await expect(useCase.execute({ username: 'admin', password: 'wrong' }, AUDIT_CTX))
        .rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('successful login', () => {
    let result;
    const mockUser = {
      id: 1, username: 'admin', role: 'admin',
      email: 'admin@test.com',
      permissions: ['read', 'write', 'admin']
    };

    beforeEach(async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      userRepo.findByUsername.mockResolvedValue({
        ...mockUser,
        password: await bcrypt.hash('secret', 10)
      });
      const useCase = new LoginUseCase(userRepo, auditLogRepo);
      result = await useCase.execute({ username: 'admin', password: 'secret' }, AUDIT_CTX);
    });

    it('returns a JWT token', () => {
      expect(result.token).toBeDefined();
      const decoded = jwt.verify(result.token, 'test-secret-key');
      expect(decoded.id).toBe(1);
      expect(decoded.username).toBe('admin');
      expect(decoded.role).toBe('admin');
    });

    it('returns user info without password', () => {
      expect(result.user.username).toBe('admin');
      expect(result.user.role).toBe('admin');
      expect(result.user.permissions).toEqual(['read', 'write', 'admin']);
      expect(result.user.password).toBeUndefined();
    });

    it('creates an audit log entry with LOGIN action', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      userRepo.findByUsername.mockResolvedValue({
        ...mockUser,
        password: await bcrypt.hash('secret', 10)
      });
      const useCase = new LoginUseCase(userRepo, auditLogRepo);
      await useCase.execute({ username: 'admin', password: 'secret' }, AUDIT_CTX);

      expect(auditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', username: 'admin', userId: 1 })
      );
    });

    it('updates lastLogin timestamp', async () => {
      const { userRepo, auditLogRepo } = makeRepos();
      userRepo.findByUsername.mockResolvedValue({
        ...mockUser,
        password: await bcrypt.hash('secret', 10)
      });
      const useCase = new LoginUseCase(userRepo, auditLogRepo);
      await useCase.execute({ username: 'admin', password: 'secret' }, AUDIT_CTX);

      expect(userRepo.updateById).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ lastLogin: expect.any(String) })
      );
    });
  });
});
