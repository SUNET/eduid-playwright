import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { expectLanguageSwitchMatchesPage, setLanguage } from '../src/helpers/ui';

test.describe('Start page', () => {
  test.use({ magicCookie: false });

  for (const lang of LANGS) {
    test(`start-page-001 start page texts and buttons (${lang}) @smoke`, async ({ page, app }) => {
      const t = texts[lang];
      await app.start.goto();
      await setLanguage(page, lang);

      await expect(page).toHaveTitle(t.titles.start);
      await expect(app.start.headline).toHaveText(t.startPage.headline);
      for (const text of [...t.startPage.paragraphs, ...t.startPage.steps]) {
        await expect(page.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(app.start.signUpButton).toHaveText(new RegExp(t.startPage.signUp, 'i'));
      await expect(app.start.loginButton).toHaveText(new RegExp(`^${t.startPage.login}$`, 'i'));
      await expect(app.start.footer).toContainText(`©2013-${new Date().getFullYear()}`);
    });
  }

  test('start-page-002 links on the start page respond @smoke', async ({ page, app, request }) => {
    await app.start.goto();
    const hrefs = await page.locator('main a[href], #footer a[href]').evaluateAll((links) =>
      [...new Set(links.map((a) => (a as HTMLAnchorElement).href))],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const response = await request.get(href, { failOnStatusCode: false, maxRedirects: 5 });
      expect.soft(response.status(), href).toBeLessThan(400);
    }
  });

  test('start-page-003 unknown route shows the not-found page with a way back', async ({ page }) => {
    const t = texts.sv;
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText(t.notFound.heading)).toBeVisible();
    await page.locator('#not-found-link').click();
    await expect(page.locator('#login-button')).toBeVisible();
  });

  test.describe('with an English browser', () => {
    test.use({ locale: 'en-GB' });

    test('start-page-004 anonymous pages follow the browser language (Accept-Language)', async ({ page, app }) => {
      await app.start.goto();
      await expect(app.start.headline).toHaveText(texts.en.startPage.headline);
      await expect(page.locator('#language-selector button')).toHaveText(texts.en.otherLanguageButton);
    });
  });

  test('start-page-005 appearance (dark mode) toggle switches theme and persists @mobile', async ({ page, app }) => {
    await app.start.goto();
    const theme = () =>
      page.evaluate(() => ({
        html: document.documentElement.className + ' ' + (document.documentElement.dataset.theme ?? ''),
        body: document.body.className,
        bg: getComputedStyle(document.body).backgroundColor,
      }));
    const before = await theme();
    await page.locator('label[for="color-mode"], #color-mode').first().click();
    await expect.poll(theme).not.toEqual(before);
    const after = await theme();
    await page.reload();
    await app.start.loginButton.waitFor();
    expect(await theme()).toEqual(after);
  });

  test('start-page-006 the language switch names the other language: "English" on Swedish pages, "Svenska" on English pages', async ({ page, app }) => {
    await app.start.goto();
    await expectLanguageSwitchMatchesPage(page, (lang) => expect(app.start.headline).toHaveText(texts[lang].startPage.headline));

    await app.start.openLogin();
    await expectLanguageSwitchMatchesPage(page, (lang) => expect(page).toHaveTitle(texts[lang].titles.login));

    await app.login.forgotPassword.click();
    await expectLanguageSwitchMatchesPage(page, (lang) => expect(page).toHaveTitle(texts[lang].titles.resetPassword));

    await app.register.open();
    await expectLanguageSwitchMatchesPage(page, (lang) => expect(page).toHaveTitle(texts[lang].titles.register));
  });
});
