export type DeviceType = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';

export interface ParsedClientDevice {
  deviceType: DeviceType;
  browser: string;
  os: string;
  deviceLabel: string;
}

/**
 * Parses user agent string to extract device category, browser name, operating system, and display label.
 */
export function parseUserAgent(
  userAgent: string | null | undefined,
): ParsedClientDevice {
  if (!userAgent || typeof userAgent !== 'string' || !userAgent.trim()) {
    return {
      deviceType: 'UNKNOWN',
      browser: 'Unknown Browser',
      os: 'Unknown OS',
      deviceLabel: 'Unknown Device',
    };
  }

  const ua = userAgent.trim();

  // 1. Check for Buy Me A Yard Custom App User-Agent
  if (ua.toLowerCase().includes('buymeayard') || ua.toLowerCase().includes('bmay')) {
    let os = 'Mobile';
    if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
    else if (/android/i.test(ua)) os = 'Android';

    return {
      deviceType: /ipad|tablet/i.test(ua) ? 'TABLET' : 'MOBILE',
      browser: 'Buy Me a Yard App',
      os,
      deviceLabel: `Buy Me a Yard App on ${os}`,
    };
  }

  // 2. Detect OS
  let os = 'Unknown OS';
  if (/iPad/i.test(ua)) {
    os = 'iPadOS';
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 10/11';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Detect Device Type
  let deviceType: DeviceType = 'DESKTOP';
  if (/iPad|tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'TABLET';
  } else if (/iPhone|iPod|Mobile|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = 'MOBILE';
  } else if (os === 'macOS' || os.startsWith('Windows') || os === 'Linux' || os === 'ChromeOS') {
    deviceType = 'DESKTOP';
  }

  // 4. Detect Browser
  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/Chrome|CriOS/i.test(ua) && !/Edg\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
    browser = deviceType === 'MOBILE' ? 'Safari' : 'Safari';
  }

  // 5. Construct user-friendly Device Label
  const deviceLabel = `${browser} on ${os}`;

  return {
    deviceType,
    browser,
    os,
    deviceLabel,
  };
}

/**
 * Resolves location descriptor from client IP address.
 */
export function resolveLocationFromIp(
  ipAddress: string | null | undefined,
): string {
  if (!ipAddress || typeof ipAddress !== 'string' || !ipAddress.trim()) {
    return 'Unknown Location';
  }

  const cleanIp = ipAddress.trim();

  // Local / Private IP ranges
  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp) ||
    cleanIp.startsWith('fc00:') ||
    cleanIp.startsWith('fe80:')
  ) {
    return 'Local Network';
  }

  // Common Nigerian ISP subnet signatures (convenient for local dev/testing)
  if (cleanIp.startsWith('102.') || cleanIp.startsWith('105.') || cleanIp.startsWith('197.')) {
    return 'Lagos, Nigeria';
  }

  return 'Online';
}
