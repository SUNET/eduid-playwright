import { defineConfig, devices } from '@playwright/test';
import { config } from './src/config';

/**
 * Projects
 *  - chromium : the regression suite (desktop, Swedish browser locale — same default as the Java suite)
 *  - mobile   : the tests tagged @mobile on a phone viewport
 *  - mobile-safari : the same on an iPhone (WebKit)
 *  - firefox / webkit : desktop Firefox and Safari (WebKit) on the browser-sensitive pages, plus every @smoke flow
 *  - a11y     : axe-core WCAG scans (tests/accessibility.spec.ts)
 *
 * WebAuthn tests use the Chrome DevTools Protocol, so they run on Chromium only.
 */
// grep matches the file name too: every @smoke test plus all tests of the pages whose UI is rendered by the browser.
const CROSS_BROWSER = /@smoke|(start-page|login|registration|reset-password|account|dashboard|identity|help)\.spec/;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry in CI only. The Java suite retried every method; here a retry is reported as "flaky", not hidden.
  retries: process.env.CI ? 1 : 0,
  // dev.eduid.se is a shared environment. Keep parallelism modest.
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: config.baseUrl,
    locale: 'sv-SE',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, locale: 'sv-SE' },
      testIgnore: /accessibility\.spec\.ts/,
      grepInvert: /@mobile-only/,
    },
    // Phones run the mobile-specific tests and the release-blocking @smoke flows.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], locale: 'sv-SE' },
      grep: /@mobile|@smoke/,
      testIgnore: /accessibility\.spec\.ts/,
    },
    {
      // Every iOS browser uses WebKit. CDP-based tests (virtual authenticator) skip themselves here.
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'], locale: 'sv-SE' },
      grep: /@mobile|@smoke/,
      testIgnore: /accessibility\.spec\.ts/,
    },
    // Other desktop engines. Freja+/eIDAS/other-device run their @smoke flows only: the external IdPs are the same for every
    // browser. WebAuthn (CDP) tests skip themselves outside Chromium.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 }, locale: 'sv-SE' },
      grep: CROSS_BROWSER,
      grepInvert: /@mobile-only/,
      testIgnore: /accessibility\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 }, locale: 'sv-SE' },
      grep: CROSS_BROWSER,
      grepInvert: /@mobile-only/,
      testIgnore: /accessibility\.spec\.ts/,
    },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, locale: 'sv-SE' },
      testMatch: /accessibility\.spec\.ts/,
    },
  ],
});
