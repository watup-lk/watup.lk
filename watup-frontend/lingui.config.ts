import type { LinguiConfig } from '@lingui/conf';

const config: LinguiConfig = {
  locales: ['en', 'si'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: '<rootDir>/locales/{locale}/messages',
      include: ['<rootDir>/app/**/*.{ts,tsx}', '<rootDir>/components/**/*.{ts,tsx}', '<rootDir>/features/**/*.{ts,tsx}'],
    },
  ],
  format: 'po',
};

export default config;
