import { validate } from 'class-validator';
import {
  IsValidPassword,
  isPasswordValid,
  PASSWORD_ERROR_MESSAGES,
} from './is-valid-password.decorator';

class TestPasswordDto {
  @IsValidPassword()
  password!: string;

  constructor(password: any) {
    this.password = password;
  }
}

describe('IsValidPassword decorator and isPasswordValid', () => {
  describe('isPasswordValid helper', () => {
    it('should return true for a strong password', () => {
      expect(isPasswordValid('StrongP@ss1')).toBe(true);
      expect(isPasswordValid('MySecure#Pass2026')).toBe(true);
    });

    it('should return false for passwords shorter than 8 characters', () => {
      expect(isPasswordValid('Sh0rt!')).toBe(false);
      expect(isPasswordValid('')).toBe(false);
    });

    it('should return false if missing uppercase letter', () => {
      expect(isPasswordValid('lowercase1!')).toBe(false);
    });

    it('should return false if missing lowercase letter', () => {
      expect(isPasswordValid('UPPERCASE1!')).toBe(false);
    });

    it('should return false if missing number', () => {
      expect(isPasswordValid('NoNumberPass!')).toBe(false);
    });

    it('should return false if missing special character', () => {
      expect(isPasswordValid('NoSpecialChar123')).toBe(false);
    });
  });

  describe('Validation using class-validator', () => {
    it('should pass validation for a compliant password', async () => {
      const dto = new TestPasswordDto('ValidP@ssw0rd!');
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject a password with fewer than 8 characters', async () => {
      const dto = new TestPasswordDto('P@1a');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints || {};
      expect(Object.values(constraints)).toContain(
        PASSWORD_ERROR_MESSAGES.minLength,
      );
    });

    it('should reject a password without an uppercase letter', async () => {
      const dto = new TestPasswordDto('nouppercase123!');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints || {};
      expect(Object.values(constraints)).toContain(
        PASSWORD_ERROR_MESSAGES.uppercase,
      );
    });

    it('should reject a password without a lowercase letter', async () => {
      const dto = new TestPasswordDto('NOLOWERCASE123!');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints || {};
      expect(Object.values(constraints)).toContain(
        PASSWORD_ERROR_MESSAGES.lowercase,
      );
    });

    it('should reject a password without a number', async () => {
      const dto = new TestPasswordDto('NoNumberHere!@#');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints || {};
      expect(Object.values(constraints)).toContain(
        PASSWORD_ERROR_MESSAGES.number,
      );
    });

    it('should reject a password without a special character', async () => {
      const dto = new TestPasswordDto('NoSpecial123456');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints || {};
      expect(Object.values(constraints)).toContain(
        PASSWORD_ERROR_MESSAGES.special,
      );
    });
  });
});
