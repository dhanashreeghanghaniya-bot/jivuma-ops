export const LOCALES = ['en', 'gu'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Every user-facing string goes through here so Gujarati can be filled in later
 * without touching components. Missing `gu` keys fall back to `en`.
 */
export const dictionaries = {
  en: {
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
  },

  // Filled in during Phase 8; anything missing falls back to English.
  gu: {
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
  },
} as const;

export type TranslationKey = keyof (typeof dictionaries)['en'];
