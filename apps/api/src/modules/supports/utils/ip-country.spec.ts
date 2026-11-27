import { lookupIpCountry } from './ip-country';

describe('lookupIpCountry', () => {
  it.each([
    ['8.8.8.8', 'US'],
    ['102.89.23.1', 'NG'],
    ['2001:4860:4860::8888', 'US'],
  ])('finds the country of %s', (ip, country) => {
    expect(lookupIpCountry(ip)).toBe(country);
  });

  it('gives null for a private or invalid address', () => {
    expect(lookupIpCountry('10.0.0.1')).toBeNull();
    expect(lookupIpCountry('not-an-ip')).toBeNull();
  });
});
