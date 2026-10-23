import { fieldEn, fieldGu } from './field';

export const LOCALES = ['en', 'gu'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Every user-facing string goes through here so Gujarati can be filled in later
 * without touching components. Missing `gu` keys fall back to `en`.
 */
const coreEn = {
  'app.name': 'Juma Food Products',
  'app.tagline': 'Sales & Distribution Operations',

  'auth.signIn': 'Sign in',
  'auth.signingIn': 'Signing in...',
  'auth.signOut': 'Sign out',
  'auth.mobile': 'Mobile number',
  'auth.mobilePlaceholder': '98XXXXXXXX',
  'auth.password': 'Password',
  'auth.loading': 'Checking your session...',
  'auth.sessionExpired': 'Your session has expired. Please sign in again.',

  'nav.dashboard': 'Dashboard',
  'nav.partners': 'Partners',
  'nav.leads': 'Leads',
  'nav.orders': 'Orders',
  'nav.salesTeam': 'Sales team',
  'nav.expenses': 'Expenses',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',
  'nav.users': 'Users',
  'nav.today': 'Today',
  'nav.visits': 'Visits',
  'nav.profile': 'Profile',
  'nav.openMenu': 'Open menu',
  'nav.closeMenu': 'Close menu',

  'users.title': 'Users',
  'users.subtitle': 'Create salesmen, reset passwords and deactivate accounts.',
  'users.add': 'Add user',
  'users.name': 'Name',
  'users.role': 'Role',
  'users.hq': 'Headquarter',
  'users.reportsTo': 'Reports to',
  'users.joined': 'Joined',
  'users.status': 'Status',
  'users.active': 'Active',
  'users.inactive': 'Inactive',
  'users.search': 'Search by name or mobile',
  'users.resetPassword': 'Reset password',
  'users.deactivate': 'Deactivate',
  'users.activate': 'Activate',
  'users.newPassword': 'New password',
  'users.empty': 'No users match this filter yet.',

  'common.save': 'Save',
  'common.saving': 'Saving...',
  'common.cancel': 'Cancel',
  'common.actions': 'Actions',
  'common.loading': 'Loading...',
  'common.error': 'Something went wrong',
  'common.retry': 'Try again',
  'common.all': 'All',
  'common.none': 'None',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.comingSoon': 'Coming in a later phase',

  // SPEC 5.1: location is mandatory, so the "turn it on" steps exist in both languages.
  'location.deniedTitle': 'Location permission is blocked',
  'location.offTitle': 'Could not get your location',
  'location.step1': 'Open your phone Settings and turn on Location (GPS).',
  'location.step2':
    'In the browser, tap the lock icon next to the address and allow Location for this app.',
  'location.step3': 'Step outside or near a window for a better signal, then try again.',
  'location.unsupported': 'This browser cannot share your location. Open the app in Chrome.',
  'field.offline': 'Offline',
  'field.pending': 'pending sync',
  'field.syncing': 'Syncing...',
} as const;

const en = { ...coreEn, ...fieldEn };
export type TranslationKey = keyof typeof en;

/** Anything missing here falls back to English. */
const gu: Partial<Record<TranslationKey, string>> = {
  'app.name': 'જુમા ફૂડ પ્રોડક્ટ્સ',
  'auth.signIn': 'લોગ ઇન',
  'auth.signOut': 'લોગ આઉટ',
  'auth.mobile': 'મોબાઇલ નંબર',
  'auth.password': 'પાસવર્ડ',
  'nav.today': 'આજે',
  'nav.visits': 'મુલાકાતો',
  'nav.orders': 'ઓર્ડર',
  'nav.expenses': 'ખર્ચ',
  'nav.profile': 'પ્રોફાઇલ',
  'common.retry': 'ફરી પ્રયાસ કરો',
  'common.save': 'સેવ કરો',
  'common.saving': 'સેવ થઈ રહ્યું છે...',
  'common.cancel': 'રદ કરો',
  'common.loading': 'લોડ થઈ રહ્યું છે...',
  'common.error': 'કંઈક ખોટું થયું',
  'common.all': 'બધા',
  'common.none': 'કોઈ નહીં',
  'common.previous': 'પાછળ',
  'common.next': 'આગળ',
  'auth.signingIn': 'લોગ ઇન થઈ રહ્યું છે...',
  'auth.loading': 'તમારું સેશન તપાસી રહ્યા છીએ...',
  'auth.sessionExpired': 'તમારું સેશન પૂરું થયું. ફરી લોગ ઇન કરો.',
  'app.tagline': 'સેલ્સ અને ડિસ્ટ્રિબ્યુશન ઓપરેશન્સ',
  'location.deniedTitle': 'લોકેશનની પરવાનગી બંધ છે',
  'location.offTitle': 'તમારું લોકેશન મળ્યું નથી',
  'location.step1': 'ફોનના સેટિંગ્સ ખોલો અને લોકેશન (GPS) ચાલુ કરો.',
  'location.step2':
    'બ્રાઉઝરમાં એડ્રેસ પાસેના તાળાના આઇકન પર ટેપ કરો અને આ એપ માટે લોકેશનની મંજૂરી આપો.',
  'location.step3': 'સારા સિગ્નલ માટે બહાર અથવા બારી પાસે જાઓ, પછી ફરી પ્રયાસ કરો.',
  'location.unsupported': 'આ બ્રાઉઝર લોકેશન આપી શકતું નથી. એપને Chrome માં ખોલો.',
  'field.offline': 'ઑફલાઇન',
  'field.pending': 'સિંક બાકી',
  'field.syncing': 'સિંક થઈ રહ્યું છે...',
  ...fieldGu,
};

export const dictionaries: { en: typeof en; gu: typeof gu } = { en, gu };
