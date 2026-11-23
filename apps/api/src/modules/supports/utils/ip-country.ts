import * as geoip from 'geoip-country';
import { IpCountryLookup } from './detect-country.util';

/**
 * Country of an IP address from the database bundled in `geoip-country`.
 * Offline: nothing is sent to a third party. Private and unknown addresses
 * give null. The data only updates when the package does.
 */
export const lookupIpCountry: IpCountryLookup = (ip) =>
  geoip.lookup(ip)?.country ?? null;
