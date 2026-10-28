import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { expectLanguageSwitchMatchesPage, setLanguage } from '../src/helpers/ui';
import { Section } from '../src/pages/Header';
import { config } from '../src/config';

test.describe('Dashboard and navigation', () => {
  test.beforeEach(async ({ app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
  });

  for (const lang of LANGS) {
    test(`dashboard-001 dashboard texts and status overview for a new account (${lang}) @smoke`, async ({ page, app, sharedAccount }) => {
      const t = texts[lang];
      await setLanguage(page, lang);
      await expect(page).toHaveTitle(t.titles.dashboard);
      await expect(app.dashboard.welcomeHeading).toContainText(`${t.dashboard.welcome}${sharedAccount.givenName} ${sharedAccount.surName}!`);
      await expect(page.locator('#uniqueId-container')).toContainText(t.dashboard.uniqueId);
      await expect(app.dashboard.eppn).toHaveValue(sharedAccount.eppn!);
      await expect(app.dashboard.statusOverview).toContainText(t.dashboard.statusOverview);
      for (const item of [t.dashboard.confirmedAccount, t.dashboard.verifyIdentity, t.dashboard.enhanceSecurity, t.dashboard.verifySecurityKey]) {
        await expect(app.dashboard.statusOverview).toContainText(item);
      }
      for (const [section, label] of Object.entries(t.menu)) {
        if (section === 'logout') await expect(app.header.logoutButton).toHaveText(new RegExp(label, 'i'));
        else await expect(app.header.menuLink(section as Section)).toHaveText(label);
      }
    });
  }

  test('dashboard-009 on every logged-in page the language switch names the other language, and the page and menu follow it', async ({ page, app }) => {
    for (const section of ['start', 'identity', 'security', 'account'] as const) {
      await app.header.goTo(section);
      await expectLanguageSwitchMatchesPage(page, async (lang) => {
        await expect(page).toHaveTitle(texts[lang].titles[section === 'start' ? 'dashboard' : section]);
        await expect(app.header.menuLink(section)).toHaveText(texts[lang].menu[section]);
      });
    }
  });

  test('dashboard-002 every main menu entry opens its page and every sub-menu anchor exists on it', async ({ page, app }) => {
    for (const section of ['identity', 'security', 'account', 'start'] as Section[]) {
      await app.header.goTo(section);
      const anchors = await page
        .locator(`#header a[href^="/${section}#"]`)
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')!.split('#')[1]));
      for (const anchor of anchors) {
        await expect(page.locator(`[id="${anchor}"]`), `#${anchor} on /${section}`).toBeAttached();
      }
    }
  });

  test('dashboard-003 copy button copies the unique ID to the clipboard', async ({ page, app, sharedAccount, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only here');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.dashboard.copyEppn.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sharedAccount.eppn);
  });

  test('dashboard-004 the eduID logo in the header leads to a working page (not the 404 page)', async ({ page, app }) => {
    await app.header.logo.click();
    await expect(page.locator('#not-found-link')).toHaveCount(0);
  });
});

test.describe('Access control', () => {
  for (const path of ['/start', '/identity', '/security', '/account', '/chpass']) {
    test(`dashboard-005 ${path} requires login @security`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('#login-form-button, #login-button').first()).toBeVisible();
      await expect(page.locator('#user-eppn')).toHaveCount(0);
    });
  }

  test('dashboard-006 the session is invalidated server-side at logout @security', async ({ page, app, sharedAccount, browser }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    const stolen = await page.context().storageState();
    await app.header.logout();

    // Replay the cookies captured before logout in a fresh browser: they must not grant access any more.
    const replay = await browser.newContext({ storageState: stolen });
    const replayPage = await replay.newPage();
    await replayPage.goto('/start');
    await expect(replayPage.locator('#login-form-button, #login-button').first()).toBeVisible();
    await expect(replayPage.locator('#user-eppn')).toHaveCount(0);
    await replay.close();
  });

  test('dashboard-007 session cookies are Secure and HttpOnly @security', async ({ page, app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    const cookies = (await page.context().cookies()).filter((c) => c.name !== 'autotests');
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect.soft(c.secure, `${c.name} Secure`).toBe(true);
      expect.soft(c.httpOnly, `${c.name} HttpOnly`).toBe(true);
    }
  });
});

test.describe('Security headers', () => {
  test.use({ magicCookie: false });

  for (const sub of ['', 'idp.', 'dashboard.']) {
    test(`dashboard-008 ${sub}${config.host} sends basic security headers @security`, async ({ request }) => {
      const response = await request.get(`https://${sub}${config.host}/`, { failOnStatusCode: false });
      const h = response.headers();
      expect.soft(h['strict-transport-security'], 'HSTS').toBeTruthy();
      expect.soft(h['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
      expect
        .soft(h['x-frame-options'] ?? h['content-security-policy']?.match(/frame-ancestors[^;]*/)?.[0], 'clickjacking protection')
        .toBeTruthy();
    });
  }
});
