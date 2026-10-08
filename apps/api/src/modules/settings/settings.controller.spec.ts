jest.mock('../auth/better-auth', () => ({
  createBetterAuth: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: any;

  beforeEach(async () => {
    service = {
      getAccountSettings: jest.fn(),
      deleteAccount: jest.fn(),
      getSecuritySettings: jest.fn(),
      disconnectProvider: jest.fn(),
      listSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeOtherSessions: jest.fn(),
      getNotificationPreferences: jest.fn(),
      updateNotificationPreferences: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  describe('Account', () => {
    it('delegates getAccountSettings to service with current user id', async () => {
      service.getAccountSettings.mockResolvedValue({
        user: { id: 'usr_1', legalName: 'David' },
        creator: null,
      });

      const res = await controller.getAccountSettings('usr_1');

      expect(service.getAccountSettings).toHaveBeenCalledWith('usr_1');
      expect(res).toEqual({
        user: { id: 'usr_1', legalName: 'David' },
        creator: null,
      });
    });

    it('delegates deleteAccount to service with current user id and dto', async () => {
      service.deleteAccount.mockResolvedValue({
        success: true,
        message: 'Account deleted',
      });

      const res = await controller.deleteAccount('usr_1', {
        password: 'password123',
      });

      expect(service.deleteAccount).toHaveBeenCalledWith('usr_1', {
        password: 'password123',
      });
      expect(res).toEqual({ success: true, message: 'Account deleted' });
    });
  });

  describe('Security & Sessions', () => {
    it('delegates getSecuritySettings to service', async () => {
      service.getSecuritySettings.mockResolvedValue({
        hasPassword: true,
        providers: [],
      });

      const res = await controller.getSecuritySettings('usr_1');

      expect(service.getSecuritySettings).toHaveBeenCalledWith('usr_1');
      expect(res).toEqual({ hasPassword: true, providers: [] });
    });

    it('delegates disconnectProvider to service', async () => {
      service.disconnectProvider.mockResolvedValue({
        success: true,
        message: 'Google unlinked',
      });

      const res = await controller.disconnectProvider('usr_1', 'google');

      expect(service.disconnectProvider).toHaveBeenCalledWith(
        'usr_1',
        'google',
      );
      expect(res).toEqual({ success: true, message: 'Google unlinked' });
    });

    it('delegates listSessions to service', async () => {
      service.listSessions.mockResolvedValue({ sessions: [] });

      const res = await controller.listSessions('usr_1', 'tok_active');

      expect(service.listSessions).toHaveBeenCalledWith('usr_1', 'tok_active');
      expect(res).toEqual({ sessions: [] });
    });

    it('delegates revokeSession to service', async () => {
      service.revokeSession.mockResolvedValue({
        success: true,
        message: 'Revoked',
      });

      const res = await controller.revokeSession(
        'usr_1',
        'sess_1',
        'tok_active',
      );

      expect(service.revokeSession).toHaveBeenCalledWith(
        'usr_1',
        'sess_1',
        'tok_active',
      );
      expect(res).toEqual({ success: true, message: 'Revoked' });
    });

    it('delegates revokeOtherSessions to service', async () => {
      service.revokeOtherSessions.mockResolvedValue({
        success: true,
        revokedCount: 2,
      });

      const res = await controller.revokeOtherSessions(
        'usr_1',
        'sess_id',
        'tok_active',
      );

      expect(service.revokeOtherSessions).toHaveBeenCalledWith(
        'usr_1',
        'sess_id',
        'tok_active',
      );
      expect(res).toEqual({ success: true, revokedCount: 2 });
    });
  });

  describe('Notification Preferences', () => {
    it('delegates getNotificationPreferences to service', async () => {
      service.getNotificationPreferences.mockResolvedValue({
        emailOnContribution: true,
      });

      const res = await controller.getNotificationPreferences('usr_1');

      expect(service.getNotificationPreferences).toHaveBeenCalledWith('usr_1');
      expect(res).toEqual({ emailOnContribution: true });
    });

    it('delegates updateNotificationPreferences to service', async () => {
      service.updateNotificationPreferences.mockResolvedValue({
        emailOnContribution: false,
      });

      const res = await controller.updateNotificationPreferences('usr_1', {
        emailOnContribution: false,
      });

      expect(service.updateNotificationPreferences).toHaveBeenCalledWith(
        'usr_1',
        { emailOnContribution: false },
      );
      expect(res).toEqual({ emailOnContribution: false });
    });
  });
});
