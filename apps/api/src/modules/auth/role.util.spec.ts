import { primaryRole } from './role.util';

describe('primaryRole', () => {
  it('ranks ADMIN above CREATOR', () => {
    expect(primaryRole(['CREATOR', 'ADMIN'])).toBe('ADMIN');
  });

  it('returns CREATOR for a creator', () => {
    expect(primaryRole(['CREATOR'])).toBe('CREATOR');
  });

  it('falls back to the first unknown role, or null for none', () => {
    expect(primaryRole(['CUSTOM'])).toBe('CUSTOM');
    expect(primaryRole([])).toBeNull();
  });
});
