import { Page } from '@playwright/test';
import { test, expect } from '../src/fixtures';
import { config } from '../src/config';
import { VirtualAuthenticator } from '../src/helpers/webauthn';
import { openOnDevice2, startOtherDeviceRemembered } from '../src/helpers/flows';

/*
 * Redirects and output escaping, tested through eduID's normal pages and its logout endpoint.
 * registration-012 (registration.spec.ts) covers HTML in the name on the dashboard.
 */

/** Text that would add elements and run script if a page rendered it as HTML. */
const HTML_NAME = '<b>Bold</b><img src=x onerror="window.__xss=1">';
const HTML_KEY_NAME = '<i>k</i><img src=x onerror="window.__xss=1">'; // key names: max 50 characters

/** The text is shown literally, nothing from it was turned into elements, and no script ran. */
async function expectShownAsText(page: Page, where: string, text: string): Promise<void> {
  await expect(page.locator('main, #root').first(), where).toContainText(text);
  await expect(page.locator('img[src="x"]'), `${where}: no injected <img>`).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `${where}: no script ran`).toBeUndefined();
}

test.describe('Redirects @security', () => {
  test.use({ magicCookie: false });

  const logout = `https://dashboard.${config.host}/services/authn/logout`;
  // `.invalid` is reserved (RFC 2606), so these addresses can never resolve.
  for (const next of ['https://redirect-test.invalid/', '//redirect-test.invalid/', '/\\redirect-test.invalid/']) {
    test(`web-security-001 logout ignores an outside "next" address (${next})`, async ({ request }) => {
      const response = await request.get(`${logout}?next=${encodeURIComponent(next)}`, { maxRedirects: 0, failOnStatusCode: false });
      expect(response.status()).toBe(302);
      const location = new URL(response.headers()['location'], logout);
      expect(location.origin).toBe(config.baseUrl);
    });
  }
});

test.describe('Redirect after login @security', () => {
  test('web-security-002 a login started from a deep link ends on eduID\'s own dashboard', async ({ page, app, sharedAccount }) => {
    await page.goto('/account');
    await expect(app.login.submit).toBeVisible();
    await app.login.login(sharedAccount.email, sharedAccount.password);
    await expect(page.locator('#header')).toContainText(sharedAccount.email, { timeout: 30_000 });
    // The target after login is chosen on the server (frontend_action), not taken from the URL. The deep link
    // itself is not kept: the user lands on /start, not /account (observation OBS-23).
    await expect(page).toHaveURL(`${config.baseUrl}/start`);
  });
});

test.describe('Output escaping @security', () => {
  test('web-security-003 HTML in the names is shown as text on every page that shows them, also on the other-device page', async ({ page, app, loggedInAccount, browser }) => {
    await app.header.goTo('identity');
    await app.identity.updateNames(HTML_NAME, 'Escape');
    await expectShownAsText(page, 'identity', HTML_NAME);

    for (const section of ['start', 'account', 'security'] as const) {
      await app.header.goTo(section);
      await expect(page.locator('#root')).toBeVisible();
      await expect(page.locator('img[src="x"]'), `${section}: no injected <img>`).toHaveCount(0);
    }
    await app.header.goTo('start');
    await expectShownAsText(page, 'dashboard', HTML_NAME);

    // Device 2 of "log in with another device" shows the remembered user's name (OBS-16).
    await app.header.logout();
    await startOtherDeviceRemembered(app, loggedInAccount);
    const device2 = await openOnDevice2(browser, app);
    try {
      await expectShownAsText(device2.page, 'other device, device 2', HTML_NAME);
    } finally {
      await device2.context.close();
    }
  });

  test('web-security-004 HTML in a security key name is shown as text', async ({ page, app, loggedInAccount, browserName }) => {
    test.skip(browserName !== 'chromium', 'virtual authenticator needs Chromium');
    void loggedInAccount;
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey(HTML_KEY_NAME);
    await expectShownAsText(page, 'security', HTML_KEY_NAME);
    await page.reload();
    await expectShownAsText(page, 'security after reload', HTML_KEY_NAME);
  });
});
