export * from './districts';

/** Server/UI shared tuning values. */
export const APP = {
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  locale: 'en-IN',
  /** A check-in further than this from the shop's saved pin is flagged for the admin. */
  visitDistanceFlagMeters: 300,
  /** Odometer km above this multiple of GPS km is flagged. */
  odometerGpsFlagRatio: 1.3,
  /** Salesman location ping interval while a work day is open and the app is foregrounded. */
  pingIntervalMinutes: 10,
  /** A ping gap longer than this during working hours is shown as a gap. */
  pingGapFlagHours: 2,
  /** Start/end day is flagged when GPS accuracy is worse than this. */
  gpsAccuracyFlagMeters: 200,
} as const;

export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 25,
  maxLimit: 200,
} as const;

export const AUTH = {
  accessTokenTtl: '15m',
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 30,
  refreshCookieName: 'juma_rt',
} as const;
