import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findByIdWithRoles: jest.Mock;
    updateProfile: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByIdWithRoles: jest.fn(),
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
    it('should return user by id', async () => {
      const mockUser = { id: 'user-2', name: 'Bob', roles: [] };
      usersService.findByIdWithRoles.mockResolvedValue(mockUser);

      const result = await controller.getUserById('user-2');
      expect(result).toEqual(mockUser);
      expect(usersService.findByIdWithRoles).toHaveBeenCalledWith('user-2');
    });
  });
});
