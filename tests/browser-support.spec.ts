import { Page } from '@playwright/test';
import { test, expect } from '../src/fixtures';

/**
 * The app warns, through its notification bar, when the browser lacks features it needs (BrowserSupportCheck in
 * eduid-front). Current browsers have every feature, so the tests remove them before the app starts.
 * This proves that the check reacts to a missing feature, not that a real old browser lacks it.
 *
 * Texts: the English defaults of browserSupport.unsupported / browserSupport.noWebauthn. There is no Swedish
 * translation until Transifex delivers one, so the tests run with an English browser locale.
 */
const UNSUPPORTED = /Your browser may not work well with eduID/;
const NO_WEBAUTHN = /Security keys and passkeys are not supported by this browser/;

/**
 * Each entry removes one capability. Runs in the page before any of the app's scripts.
 * String.replaceAll is not here: a library in the bundle calls it while the app starts, so without it nothing
 * renders and no notice can be shown.
 */
const MISSING_FEATURES: Record<string, string> = {
  'CSS nesting': `Object.defineProperty(CSSStyleRule.prototype, 'cssRules', { get() { return []; }, configurable: true });`,
  ':has() selector': `const supports = CSS.supports.bind(CSS); CSS.supports = (q, v) => (String(q).includes(':has') ? false : supports(q, v));`,
  'Array.at': `delete Array.prototype.at;`,
  'Intl.DisplayNames': `delete Intl.DisplayNames;`,
};
const NO_PUBLIC_KEY_CREDENTIAL = `delete window.PublicKeyCredential;`;

const notice = (page: Page) => page.locator('.notifications-area');

async function openStart(page: Page, removeScripts: string[] = []): Promise<void> {
  for (const script of removeScripts) await page.addInitScript(script);
  await page.goto('/');
  // The start page is rendered, so the check (a mount effect of the same tree) has had its chance to run.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('Browser support notice', () => {
  test.use({ magicCookie: false, locale: 'en-GB' });

  test('browser-support-001 a browser with every feature gets no notice', async ({ page }) => {
    await openStart(page);
    await expect(notice(page)).toHaveCount(0);
  });

  for (const [feature, script] of Object.entries(MISSING_FEATURES)) {
    test(`browser-support-002 missing ${feature} shows the browser notice`, async ({ page }) => {
      await openStart(page, [script]);
      await expect(notice(page)).toContainText(UNSUPPORTED);
      await expect(notice(page)).not.toContainText(NO_WEBAUTHN);
    });
  }

  test('browser-support-003 missing WebAuthn shows only the security key notice', async ({ page }) => {
    await openStart(page, [NO_PUBLIC_KEY_CREDENTIAL]);
    await expect(notice(page)).toContainText(NO_WEBAUTHN);
    await expect(notice(page)).not.toContainText(UNSUPPORTED);
  });

  test('browser-support-004 missing features and WebAuthn show both in one notice', async ({ page }) => {
    await openStart(page, [MISSING_FEATURES['Array.at'], NO_PUBLIC_KEY_CREDENTIAL]);
    await expect(notice(page)).toContainText(UNSUPPORTED);
    await expect(notice(page)).toContainText(NO_WEBAUTHN);
  });

  test('browser-support-005 the notice is shown once per browser session and can be closed', async ({ page }) => {
    await openStart(page, [MISSING_FEATURES['Array.at']]);
    await expect(notice(page)).toContainText(UNSUPPORTED);

    await page.locator('#close-error').click();
    await expect(notice(page)).toHaveCount(0);

    // Same tab, so sessionStorage keeps the "already shown" flag: the init script still removes the feature.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });
});
