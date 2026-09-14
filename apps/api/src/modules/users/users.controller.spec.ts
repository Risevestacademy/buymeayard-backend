import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRole } from '@buymeayard/types';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findByIdWithRoles: jest.Mock;
    getPublicProfile: jest.Mock;
    updateProfile: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByIdWithRoles: jest.fn(),
      getPublicProfile: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return the current user profile with roles', async () => {
      const mockProfile = { id: 'user-1', name: 'Alice', roles: ['USER'] };
      usersService.findByIdWithRoles.mockResolvedValue(mockProfile);

      const result = await controller.getProfile('user-1');
      expect(result).toEqual(mockProfile);
      expect(usersService.findByIdWithRoles).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateProfile', () => {
    it('should update and return the updated user profile', async () => {
      const dto = { name: 'Alice Updated' };
      const updatedUser = { id: 'user-1', name: 'Alice Updated' };
      usersService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile('user-1', dto);
      expect(result).toEqual(updatedUser);
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getUserById', () => {
    it('should return full profile with roles when caller is accessing own profile', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        roles: ['CREATOR'],
      };
      usersService.findByIdWithRoles.mockResolvedValue(mockUser);

      const result = await controller.getUserById('user-1', {
        id: 'user-1',
        roles: ['CREATOR'],
      });
      expect(result).toEqual(mockUser);
      expect(usersService.findByIdWithRoles).toHaveBeenCalledWith('user-1');
      expect(usersService.getPublicProfile).not.toHaveBeenCalled();
    });

    it('should return full profile with roles when caller is an admin', async () => {
      const mockUser = {
        id: 'user-2',
        name: 'Bob',
        email: 'bob@example.com',
        roles: ['SUPPORTER'],
      };
      usersService.findByIdWithRoles.mockResolvedValue(mockUser);

      const result = await controller.getUserById('user-2', {
        id: 'admin-1',
        roles: [UserRole.ADMIN],
      });
      expect(result).toEqual(mockUser);
      expect(usersService.findByIdWithRoles).toHaveBeenCalledWith('user-2');
      expect(usersService.getPublicProfile).not.toHaveBeenCalled();
    });

    it('should return public profile projection when caller is another user', async () => {
      const mockPublicUser = {
        id: 'user-2',
        name: 'Bob',
        image: 'https://example.com/bob.jpg',
      };
      usersService.getPublicProfile.mockResolvedValue(mockPublicUser);

      const result = await controller.getUserById('user-2', {
        id: 'user-1',
        roles: ['SUPPORTER'],
      });
      expect(result).toEqual(mockPublicUser);
      expect(usersService.getPublicProfile).toHaveBeenCalledWith('user-2');
      expect(usersService.findByIdWithRoles).not.toHaveBeenCalled();
    });
  });
});
