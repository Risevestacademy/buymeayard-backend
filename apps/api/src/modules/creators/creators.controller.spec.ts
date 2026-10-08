import { Test, TestingModule } from '@nestjs/testing';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';

describe('CreatorsController', () => {
  let controller: CreatorsController;
  let creatorsService: {
    findAll: jest.Mock;
    findByUserId: jest.Mock;
    findBySlug: jest.Mock;
    findByUsername: jest.Mock;
    onboardCreator: jest.Mock;
    formatCreatorProfile: jest.Mock;
    checkSlugAvailability: jest.Mock;
    updateProfile: jest.Mock;
    uploadAvatar: jest.Mock;
    getCreatorMaterials: jest.Mock;
    saveCreatorMaterials: jest.Mock;
    createCustomMaterial: jest.Mock;
    getShareLink: jest.Mock;
    getShareLinkBySlug: jest.Mock;
    updateCreatorSettings: jest.Mock;
    updatePageStatus: jest.Mock;
    getDashboardOverview: jest.Mock;
    getDashboardBalance: jest.Mock;
    getDashboardEarnings: jest.Mock;
    getDashboardContributions: jest.Mock;
    getDashboardMetrics: jest.Mock;
    getDashboardRecentContributions: jest.Mock;
  };

  const rawCreatorProfile = {
    id: 'creator-1',
    userId: 'user-1',
    slug: 'adeola',
    creatorName: 'Adeola Johnson',
    status: 'PROFILE_CREATED',
    kycStatus: 'NOT_SUBMITTED',
    socialLinks: [],
    materials: [],
  };

  beforeEach(async () => {
    creatorsService = {
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findBySlug: jest.fn(),
      findByUsername: jest.fn(),
      onboardCreator: jest.fn(),
      checkSlugAvailability: jest.fn(),
      updateProfile: jest.fn(),
      uploadAvatar: jest.fn(),
      getCreatorMaterials: jest.fn(),
      saveCreatorMaterials: jest.fn(),
      createCustomMaterial: jest.fn(),
      getShareLink: jest.fn(),
      getShareLinkBySlug: jest.fn(),
      updateCreatorSettings: jest.fn(),
      updatePageStatus: jest.fn(),
      getDashboardOverview: jest.fn(),
      getDashboardBalance: jest.fn(),
      getDashboardEarnings: jest.fn(),
      getDashboardContributions: jest.fn(),
      getDashboardMetrics: jest.fn(),
      getDashboardRecentContributions: jest.fn(),
      formatCreatorProfile: jest.fn((p) => {
        if (!p) return p;
        const {
          name: _name,
          displayName: _displayName,
          firstName: _firstName,
          lastName: _lastName,
          username: _username,
          personalizedLink: _personalizedLink,
          ...clean
        } = p;
        return {
          ...clean,
          creatorName: p.creatorName || p.user?.name || '',
          slug: p.slug || p.username || '',
        };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [
        {
          provide: CreatorsService,
          useValue: creatorsService,
        },
      ],
    }).compile();

    controller = module.get<CreatorsController>(CreatorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyProfile (GET /creators/me)', () => {
    it('should return creator profile with creatorName and slug, and without redundant name fields', async () => {
      creatorsService.findByUserId.mockResolvedValue({
        ...rawCreatorProfile,
        name: 'Adeola Johnson',
        displayName: 'Adeola Johnson',
        firstName: 'Adeola',
        lastName: 'Johnson',
      });

      const result = await controller.getMyProfile('user-1');

      expect(creatorsService.findByUserId).toHaveBeenCalledWith('user-1');
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.creatorName).toBe('Adeola Johnson');
      expect(result.slug).toBe('adeola');
      expect(result.username).toBeUndefined();
      expect(result.personalizedLink).toBeUndefined();

      // Verify that redundant name fields are strictly NOT returned
      expect(result.name).toBeUndefined();
      expect(result.displayName).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });
  });

  describe('onboardCreator (PUT /creators/me/onboarding)', () => {
    it('should onboard creator using pure slug and return clean creator profile', async () => {
      const dto = {
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        socialLinks: [{ platform: 'twitter', url: 'https://x.com/adeola' }],
      };

      creatorsService.onboardCreator.mockResolvedValue({
        ...rawCreatorProfile,
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
      });

      const result = await controller.onboardCreator('user-1', dto);

      expect(creatorsService.onboardCreator).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.creatorName).toBe('Adeola Johnson');
      expect(result.slug).toBe('adeola');
      expect(result.name).toBeUndefined();
      expect(result.displayName).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.username).toBeUndefined();
      expect(result.personalizedLink).toBeUndefined();
    });
  });

  describe('getCreatorBySlug (GET /creators/:slug)', () => {
    it('should return public creator profile formatted with creatorName and slug', async () => {
      creatorsService.findBySlug.mockResolvedValue(rawCreatorProfile);

      const result = await controller.getCreatorBySlug('adeola');

      expect(creatorsService.findBySlug).toHaveBeenCalledWith('adeola');
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.creatorName).toBe('Adeola Johnson');
      expect(result.slug).toBe('adeola');
      expect(result.name).toBeUndefined();
      expect(result.displayName).toBeUndefined();
      expect(result.username).toBeUndefined();
      expect(result.personalizedLink).toBeUndefined();
    });
  });

  describe('getCreators (GET /creators)', () => {
    it('should return list of creators from creatorsService.findAll', async () => {
      const mockCreators = [
        { ...rawCreatorProfile, creatorName: 'Adeola Johnson', slug: 'adeola' },
      ];
      creatorsService.findAll.mockResolvedValue(mockCreators);

      const result = await controller.getCreators({ search: 'adeola' });

      expect(creatorsService.findAll).toHaveBeenCalledWith({
        search: 'adeola',
      });
      expect(result).toEqual(mockCreators);
    });
  });

  describe('checkSlug (GET /creators/check-slug)', () => {
    it('should call creatorsService.checkSlugAvailability with query and userId', async () => {
      const mockResult = {
        available: true,
        slug: 'aesthetefisayo',
        message: 'Handle is available',
      };
      creatorsService.checkSlugAvailability = jest
        .fn()
        .mockResolvedValue(mockResult);

      const result = await controller.checkSlug('aesthetefisayo', 'user-1');

      expect(creatorsService.checkSlugAvailability).toHaveBeenCalledWith(
        'aesthetefisayo',
        'user-1',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateProfile (PUT /creators/me/profile)', () => {
    it('should update profile via service', async () => {
      const dto = { creatorName: 'Updated Name', bio: 'Updated bio' };
      creatorsService.updateProfile.mockResolvedValue({
        id: 'creator-1',
        slug: 'adeola',
        ...dto,
      });

      const result = await controller.updateProfile('user-1', dto);

      expect(creatorsService.updateProfile).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ id: 'creator-1', slug: 'adeola', ...dto });
    });
  });

  describe('uploadAvatar (POST /creators/me/avatar)', () => {
    it('should delegate avatar upload to service', async () => {
      const mockFile = { buffer: Buffer.from('data') } as Express.Multer.File;
      creatorsService.uploadAvatar.mockResolvedValue({
        avatarUrl: 'https://cdn.buymeayard.com/avatar.jpg',
      });

      const result = await controller.uploadAvatar('user-1', mockFile);

      expect(creatorsService.uploadAvatar).toHaveBeenCalledWith(
        'user-1',
        mockFile,
      );
      expect(result.avatarUrl).toBe('https://cdn.buymeayard.com/avatar.jpg');
    });
  });

  describe('getMyMaterials (GET /creators/me/materials)', () => {
    it('should return creator materials', async () => {
      const mockMaterials = [{ id: 'cm-1', price: 500000 }];
      creatorsService.getCreatorMaterials.mockResolvedValue(mockMaterials);

      const result = await controller.getMyMaterials('user-1');

      expect(creatorsService.getCreatorMaterials).toHaveBeenCalledWith(
        'user-1',
      );
      expect(result).toEqual(mockMaterials);
    });
  });

  describe('saveMyMaterials (PUT /creators/me/materials)', () => {
    it('should save creator materials', async () => {
      const dto = { materials: [{ materialId: 'mat-1', price: 500000 }] };
      const mockMaterials = [{ id: 'cm-1', ...dto.materials[0] }];
      creatorsService.saveCreatorMaterials.mockResolvedValue(mockMaterials);

      const result = await controller.saveMyMaterials('user-1', dto);

      expect(creatorsService.saveCreatorMaterials).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(result).toEqual(mockMaterials);
    });
  });

  describe('createCustomMaterial (POST /creators/me/materials/custom)', () => {
    it('should create custom material for creator', async () => {
      const dto = { name: 'Silk Velvet', description: 'Custom' };
      const mockResult = {
        id: 'cm-custom',
        displayName: 'Silk Velvet',
        isCustom: true,
      };
      creatorsService.createCustomMaterial.mockResolvedValue(mockResult);

      const result = await controller.createCustomMaterial('user-1', dto);

      expect(creatorsService.createCustomMaterial).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getMyShareLink (GET /creators/me/share-link)', () => {
    it('should delegate share link generation to service for logged in creator', async () => {
      const mockShareData = {
        publicUrl: 'https://buymeayard.com/adeola',
        slug: 'adeola',
        qrCodeUrl:
          'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...',
        shareText: 'Support my creative work on Buy Me a Yard!',
        socialLinks: {
          twitter: 'https://twitter.com/intent/tweet?...',
          whatsapp: 'https://api.whatsapp.com/send?...',
          facebook: 'https://www.facebook.com/sharer/...',
          linkedin: 'https://www.linkedin.com/sharing/...',
          telegram: 'https://t.me/share/...',
        },
      };
      creatorsService.getShareLink.mockResolvedValue(mockShareData);

      const result = await controller.getMyShareLink('user-1');

      expect(creatorsService.getShareLink).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockShareData);
    });
  });

  describe('getShareLinkBySlug (GET /creators/:slug/share-link)', () => {
    it('should delegate share link lookup by slug to service', async () => {
      const mockShareData = {
        publicUrl: 'https://buymeayard.com/adeola',
        slug: 'adeola',
        qrCodeUrl:
          'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...',
        shareText: 'Support my creative work on Buy Me a Yard!',
        socialLinks: {
          twitter: 'https://twitter.com/intent/tweet?...',
          whatsapp: 'https://api.whatsapp.com/send?...',
          facebook: 'https://www.facebook.com/sharer/...',
          linkedin: 'https://www.linkedin.com/sharing/...',
          telegram: 'https://t.me/share/...',
        },
      };
      creatorsService.getShareLinkBySlug.mockResolvedValue(mockShareData);

      const result = await controller.getShareLinkBySlug('adeola');

      expect(creatorsService.getShareLinkBySlug).toHaveBeenCalledWith('adeola');
      expect(result).toEqual(mockShareData);
    });
  });

  describe('updateCreatorSettings (PATCH /creators/me/settings)', () => {
    it('should update thank-you message and showSupportersOnPage flag', async () => {
      creatorsService.updateCreatorSettings.mockResolvedValue({
        ...rawCreatorProfile,
        thankYouMessage: 'Thank you for your generous yards! 🙏',
        showSupportersOnPage: true,
      });

      const result = await controller.updateCreatorSettings('user-1', {
        thankYouMessage: 'Thank you for your generous yards! 🙏',
        showSupportersOnPage: true,
      });

      expect(creatorsService.updateCreatorSettings).toHaveBeenCalledWith(
        'user-1',
        {
          thankYouMessage: 'Thank you for your generous yards! 🙏',
          showSupportersOnPage: true,
        },
      );
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.thankYouMessage).toBe(
        'Thank you for your generous yards! 🙏',
      );
    });
  });

  describe('updatePageStatus (PATCH /creators/me/page-status)', () => {
    it('should update page published status and format profile', async () => {
      creatorsService.updatePageStatus.mockResolvedValue({
        ...rawCreatorProfile,
        isPublished: true,
      });

      const result = await controller.updatePageStatus('user-1', {
        isPublished: true,
      });

      expect(creatorsService.updatePageStatus).toHaveBeenCalledWith('user-1', {
        isPublished: true,
      });
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.isPublished).toBe(true);
    });
  });

  describe('getDashboard (GET /creators/me/dashboard)', () => {
    it('should delegate to creatorsService.getDashboardOverview with default or query period', async () => {
      const mockDashboard = {
        creator: { id: 'c-1', creatorName: 'Adeola', pageStatus: 'LIVE' },
        metrics: { totalContributions: 24, totalContributionAmount: 12000000 },
        balance: { availableBalance: 9800000, canWithdraw: true },
        recentContributions: [],
        earningsChart: { period: '30d', points: [] },
      };
      creatorsService.getDashboardOverview.mockResolvedValue(mockDashboard);

      const res = await controller.getDashboard('user-1', '30d');
      expect(creatorsService.getDashboardOverview).toHaveBeenCalledWith(
        'user-1',
        '30d',
      );
      expect(res).toBe(mockDashboard);
    });
  });

  describe('getOverview (GET /creators/me/overview)', () => {
    it('should alias to getDashboardOverview', async () => {
      const mockDashboard = { creator: { id: 'c-1' } };
      creatorsService.getDashboardOverview.mockResolvedValue(mockDashboard);

      const res = await controller.getOverview('user-1', '7d');
      expect(creatorsService.getDashboardOverview).toHaveBeenCalledWith(
        'user-1',
        '7d',
      );
      expect(res).toBe(mockDashboard);
    });
  });

  describe('getDashboardEarnings (GET /creators/me/dashboard/earnings)', () => {
    it('should delegate to creatorsService.getDashboardEarnings', async () => {
      const mockEarnings = {
        period: '90d',
        totalGrossAmount: 15000000,
        points: [],
      };
      creatorsService.getDashboardEarnings.mockResolvedValue(mockEarnings);

      const res = await controller.getDashboardEarnings('user-1', {
        period: '90d',
      });
      expect(creatorsService.getDashboardEarnings).toHaveBeenCalledWith(
        'user-1',
        { period: '90d' },
      );
      expect(res).toBe(mockEarnings);
    });
  });

  describe('getDashboardContributions (GET /creators/me/dashboard/contributions)', () => {
    it('should delegate to creatorsService.getDashboardContributions', async () => {
      const mockContributions = {
        data: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 1 },
      };
      creatorsService.getDashboardContributions.mockResolvedValue(
        mockContributions,
      );

      const res = await controller.getDashboardContributions('user-1', {
        page: 1,
        limit: 10,
      });
      expect(creatorsService.getDashboardContributions).toHaveBeenCalledWith(
        'user-1',
        { page: 1, limit: 10 },
      );
      expect(res).toBe(mockContributions);
    });
  });

  describe('getDashboardBalance (GET /creators/me/dashboard/balance)', () => {
    it('should delegate to creatorsService.getDashboardBalance', async () => {
      const mockBalance = {
        availableBalance: 5000000,
        pendingBalance: 1000000,
        withdrawnToDate: 2000000,
        canWithdraw: true,
      };
      creatorsService.getDashboardBalance.mockResolvedValue(mockBalance);

      const res = await controller.getDashboardBalance('user-1');
      expect(creatorsService.getDashboardBalance).toHaveBeenCalledWith(
        'user-1',
      );
      expect(res).toBe(mockBalance);
    });
  });

  describe('getDashboardMetrics (GET /creators/me/dashboard/metrics and /creators/me/metrics)', () => {
    it('should delegate to creatorsService.getDashboardMetrics', async () => {
      const mockMetrics = {
        totalContributions: 24,
        totalContributionAmount: 12000000,
        netEarnings: 11400000,
        platformFees: 600000,
        currency: 'NGN',
      };
      creatorsService.getDashboardMetrics.mockResolvedValue(mockMetrics);

      const res = await controller.getDashboardMetrics('user-1');
      expect(creatorsService.getDashboardMetrics).toHaveBeenCalledWith(
        'user-1',
      );
      expect(res).toBe(mockMetrics);

      const aliasRes = await controller.getMetricsAlias('user-1');
      expect(aliasRes).toBe(mockMetrics);
    });
  });

  describe('getDashboardRecentContributions (GET /creators/me/dashboard/recent-contributions)', () => {
    it('should delegate to creatorsService.getDashboardRecentContributions', async () => {
      const mockRecent = [
        {
          id: 's-1',
          amount: 500000,
          supporter: { name: 'Ada', initials: 'AO' },
        },
      ];
      creatorsService.getDashboardRecentContributions.mockResolvedValue(
        mockRecent,
      );

      const res = await controller.getDashboardRecentContributions('user-1', {
        limit: 5,
      });
      expect(
        creatorsService.getDashboardRecentContributions,
      ).toHaveBeenCalledWith('user-1', 5);
      expect(res).toBe(mockRecent);

      const aliasRes = await controller.getRecentContributionsAlias('user-1', {
        limit: 5,
      });
      expect(aliasRes).toBe(mockRecent);
    });
  });

  describe('Aliases (/creators/me/balance and /creators/me/analytics/earnings)', () => {
    it('should delegate balance alias to getDashboardBalance', async () => {
      const mockBalance = { availableBalance: 5000000 };
      creatorsService.getDashboardBalance.mockResolvedValue(mockBalance);

      const res = await controller.getBalanceAlias('user-1');
      expect(creatorsService.getDashboardBalance).toHaveBeenCalledWith(
        'user-1',
      );
      expect(res).toBe(mockBalance);
    });

    it('should delegate earnings alias to getDashboardEarnings', async () => {
      const mockEarnings = { period: '30d', points: [] };
      creatorsService.getDashboardEarnings.mockResolvedValue(mockEarnings);

      const res = await controller.getEarningsAlias('user-1', {
        period: '30d',
      });
      expect(creatorsService.getDashboardEarnings).toHaveBeenCalledWith(
        'user-1',
        { period: '30d' },
      );
      expect(res).toBe(mockEarnings);
    });
  });
});
