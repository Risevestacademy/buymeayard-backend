import { applyDecorators } from '@nestjs/common';
import { IsString, MinLength, Matches } from 'class-validator';

export const PASSWORD_PATTERN_UPPERCASE = /(?=.*[A-Z])/;
export const PASSWORD_PATTERN_LOWERCASE = /(?=.*[a-z])/;
export const PASSWORD_PATTERN_NUMBER = /(?=.*\d)/;
export const PASSWORD_PATTERN_SPECIAL = /(?=.*[^A-Za-z0-9])/;

export const PASSWORD_ERROR_MESSAGES = {
  minLength: 'Password must be at least 8 characters long',
  uppercase: 'Password must contain at least one uppercase letter',
  lowercase: 'Password must contain at least one lowercase letter',
  number: 'Password must contain at least one number',
  special: 'Password must contain at least one special character',
};

/**
 * Validates that a password satisfies complexity requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function IsValidPassword() {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: PASSWORD_ERROR_MESSAGES.minLength }),
    Matches(PASSWORD_PATTERN_UPPERCASE, {
      message: PASSWORD_ERROR_MESSAGES.uppercase,
    }),
    Matches(PASSWORD_PATTERN_LOWERCASE, {
      message: PASSWORD_ERROR_MESSAGES.lowercase,
    }),
    Matches(PASSWORD_PATTERN_NUMBER, {
      message: PASSWORD_ERROR_MESSAGES.number,
    }),
    Matches(PASSWORD_PATTERN_SPECIAL, {
      message: PASSWORD_ERROR_MESSAGES.special,
    }),
  );
}

/**
 * Helper to check password strength synchronously.
 */
export function isPasswordValid(password: string): boolean {
  if (!password || typeof password !== 'string' || password.length < 8) {
    return false;
  }
  return (
    PASSWORD_PATTERN_UPPERCASE.test(password) &&
    PASSWORD_PATTERN_LOWERCASE.test(password) &&
    PASSWORD_PATTERN_NUMBER.test(password) &&
    PASSWORD_PATTERN_SPECIAL.test(password)
  );
}
