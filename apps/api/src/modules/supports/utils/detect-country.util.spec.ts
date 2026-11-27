import { clientIp, detectCountry } from './detect-country.util';

describe('detectCountry', () => {
  it('uses a CDN country header first', () => {
    const lookup = jest.fn();
    expect(detectCountry({ 'cf-ipcountry': 'us' }, '1.1.1.1', lookup)).toBe(
      'US',
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(['XX', 'T1', 'USA', ''])('ignores the header value %p', (value) => {
    expect(detectCountry({ 'cf-ipcountry': value }, undefined)).toBeNull();
  });

  it('looks up the first X-Forwarded-For address when there is no header', () => {
    const lookup = jest.fn().mockReturnValue('gh');
    const headers = { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' };
    expect(detectCountry(headers, '10.0.0.2', lookup)).toBe('GH');
    expect(lookup).toHaveBeenCalledWith('8.8.8.8');
  });

  it('returns null when there is no lookup, no address, or the lookup throws', () => {
    expect(detectCountry({}, '8.8.8.8')).toBeNull();
    expect(detectCountry({}, undefined, jest.fn())).toBeNull();
    expect(
      detectCountry({}, '8.8.8.8', () => {
        throw new Error('db missing');
      }),
    ).toBeNull();
  });

  it('falls back to the socket address', () => {
    expect(clientIp({}, '9.9.9.9')).toBe('9.9.9.9');
  });
});
