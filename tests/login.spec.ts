import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { setLanguage } from '../src/helpers/ui';

test.describe('Login page', () => {
  for (const lang of LANGS) {
    test(`login-001 login page texts, placeholders and buttons (${lang}) @smoke`, async ({ page, app }) => {
      const t = texts[lang].login;
      await app.start.openLogin();
      await setLanguage(page, lang);

      await expect(page).toHaveTitle(texts[lang].titles.login);
      await expect(page.getByRole('heading', { name: t.heading })).toBeVisible();
      await expect(app.login.username).toHaveAttribute('placeholder', t.usernamePlaceholder);
      await expect(app.login.password).toHaveAttribute('placeholder', t.passwordPlaceholder);
      await expect(app.login.forgotPassword).toHaveText(t.forgotPassword);
      await expect(app.login.submit).toHaveText(new RegExp(`^${t.loginButton}$`, 'i'));
      await expect(app.login.otherDevice).toHaveText(new RegExp(t.otherDevice, 'i'));
      await expect(app.login.cancel).toHaveText(new RegExp(t.cancel, 'i'));
      await expect(app.login.passkey).toHaveText(new RegExp(t.passkeyButton, 'i'));
      await expect(page.getByText(t.rememberMe)).toBeVisible();
    });
  }

  test('login-002 login with incorrect password is rejected in both languages @smoke', async ({ page, app, sharedAccount }) => {
    for (const lang of LANGS) {
      // Choose the language before the attempt: switching afterwards re-renders the login page, and the
      // passkey autofill banner (DEF-04) can then replace the error message.
      await app.start.openLogin();
      await setLanguage(page, lang);
      await app.login.login(sharedAccount.email, 'notTheCorrectPassword');
      await expect(page.getByText(texts[lang].login.wrongCredentials)).toBeVisible();
      await expect(page).not.toHaveURL(/\/start/);
    }
    await setLanguage(page, 'sv');
  });

  test('login-003 login with unknown user gives the same message as a wrong password (no user enumeration) @security', async ({ page, app }) => {
    await app.start.openLogin();
    await app.login.login('no-such-user-' + Date.now() + '@dev.eduid.sunet.se', 'whatever123');
    await expect(page.getByText(texts.sv.login.wrongCredentials)).toBeVisible();
  });

  test('login-004 successful login shows dashboard; logout and Back does not return to it @smoke', async ({ page, app, sharedAccount }) => {
    await app.start.openLogin();
    const eppn = await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    expect(eppn).toMatch(/^[a-z]{5}-[a-z]{5}$/);
    await app.header.logout();
    await page.goBack();
    await expect(page.locator('#user-eppn')).toHaveCount(0);
    await page.goto('/start');
    await expect(page).not.toHaveURL(/\/start$/);
  });

  test('login-005 login with the unique ID (EPPN) as username', async ({ app, sharedAccount }) => {
    await app.start.openLogin();
    const eppn = await app.login.loginToDashboard(sharedAccount.eppn!, sharedAccount.password);
    expect(eppn).toBe(sharedAccount.eppn);
  });

  test('login-006 username is case-insensitive', async ({ app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email.toUpperCase(), sharedAccount.password);
  });

  test('login-007 surrounding whitespace in the username is ignored [known defect DEF-01]', async ({ app, sharedAccount }) => {
    // A trailing space (typical of mobile autocomplete) currently gives "wrong email or password".
    // test.fail() keeps the suite green while the defect exists and flags the test as soon as it is fixed.
    test.fail(true, 'DEF-01: username is not trimmed before authentication');
    await app.start.openLogin();
    await app.login.loginToDashboard(`${sharedAccount.email} `, sharedAccount.password);
  });

  test('login-008 show/hide toggles the password field type', async ({ app }) => {
    await app.start.openLogin();
    await app.login.password.fill('secret');
    await expect(app.login.password).toHaveAttribute('type', 'password');
    await app.login.showHidePassword.click();
    await expect(app.login.password).toHaveAttribute('type', 'text');
    await app.login.showHidePassword.click();
    await expect(app.login.password).toHaveAttribute('type', 'password');
  });

  test('login-009 keyboard-only login (Tab/Enter) @a11y-functional', async ({ page, app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.username.focus();
    await page.keyboard.type(sharedAccount.email);
    // DOM order puts the "Show" button before the password input, so it may take two Tabs (see DEF-02).
    for (let i = 0; i < 3 && !(await app.login.password.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(app.login.password).toBeFocused();
    await page.keyboard.type(sharedAccount.password);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/start/);
  });
});

test.describe('Remember me', () => {
  test('login-010 remember me on: after logout the username is pre-filled and only password is asked', async ({ page, app, account }) => {
    await app.start.openLogin();
    await app.login.setRememberMe(true);
    await app.login.loginToDashboard(account.email, account.password);
    await app.header.logout();
    await app.start.loginButton.click();
    await expect(page.getByText(texts.sv.login.welcomeBack + `${account.givenName} ${account.surName}`)).toBeVisible();
    await expect(app.login.notYou).toBeVisible();
    await app.login.login(account.email, account.password);
    await expect(page).toHaveURL(/\/start/);
  });

  test('login-011 remember me off: after logout the username is not pre-filled', async ({ app, account }) => {
    await app.start.openLogin();
    await app.login.setRememberMe(false);
    await app.login.loginToDashboard(account.email, account.password);
    await app.header.logout();
    await app.start.loginButton.click();
    await expect(app.login.username).toBeVisible();
    await expect(app.login.username).toHaveValue('');
  });

  test('login-012 "Not you?" clears the remembered user so another user can log in', async ({ page, app, account, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.setRememberMe(true);
    await app.login.loginToDashboard(account.email, account.password);
    await app.header.logout();
    await app.start.loginButton.click();
    await app.login.notYou.click();
    await expect(app.login.username).toBeVisible();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    await expect(page.locator('#header')).toContainText(sharedAccount.email);
  });

  test('login-013 after logout a new login in the same session requires the password again', async ({ page, app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    await app.header.logout();
    await app.start.loginButton.click();
    await expect(app.login.password).toBeVisible();
    await expect(app.login.password).toHaveValue('');
    await expect(page).not.toHaveURL(/\/start/);
  });
});
