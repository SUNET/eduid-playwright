import { Page } from '@playwright/test';
import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { config } from '../src/config';
import { codes } from '../src/helpers/codes';
import { enterSixDigitCode, fillStable, setLanguage } from '../src/helpers/ui';
import { App } from '../src/fixtures';

async function startReset(page: Page, app: App, email: string): Promise<void> {
  await app.start.openLogin();
  await app.login.forgotPassword.click();
  await expect(app.resetPassword.emailInput).toBeVisible();
  await fillStable(app.resetPassword.emailInput, email);
  await app.resetPassword.sendEmail.click();
  await app.register.solveCaptcha();
}

test.describe('Reset password', () => {
  for (const lang of LANGS) {
    test(`reset-password-001 reset password start page texts (${lang})`, async ({ page, app }) => {
      const t = texts[lang];
      await app.start.openLogin();
      await app.login.forgotPassword.click();
      await setLanguage(page, lang);
      await expect(page).toHaveTitle(t.titles.resetPassword);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.resetPassword.enterEmailHeading);
      await expect(app.resetPassword.emailInput).toHaveAttribute('placeholder', t.register.emailPlaceholder);
      await expect(app.resetPassword.sendEmail).toHaveText(new RegExp(t.resetPassword.sendEmail, 'i'));
    });
  }

  test('reset-password-002 reset password without extra security, then log in with the new password @smoke', async ({ page, app, account }) => {
    await startReset(page, app, account.email);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.verifyEmailHeading);
    await expect(page.getByText(account.email)).toBeVisible();

    await enterSixDigitCode(page, await codes.resetPassword(page.context(), account.eppn!));
    // Accounts without verified identity or MFA go straight to the password step.
    if (await app.resetPassword.continueWithoutSecurity.isVisible()) await app.resetPassword.continueWithoutSecurity.click();
    const newPassword = await app.password.useSuggested();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.completedHeading);
    await expect(page.locator('#user-email')).toHaveText(account.email);
    await expect(page.locator('#user-password')).toHaveText(newPassword);
    await app.resetPassword.finished.click();

    await app.login.login(account.email, account.password);
    await expect(page.getByText(texts.sv.login.wrongCredentials)).toBeVisible();
    await app.login.loginToDashboard(account.email, newPassword);
  });

  test('reset-password-003 a wrong reset code is rejected and does not reveal the password form', async ({ page, app, sharedAccount }) => {
    await startReset(page, app, sharedAccount.email);
    await enterSixDigitCode(page, '000000');
    await expect(page.getByText(texts.sv.errors.resetCodeFailed)).toBeVisible();
    await expect(app.password.suggestedRadio).toHaveCount(0);
  });

  test('reset-password-004 cancel on the reset page returns to login', async ({ page, app }) => {
    await app.start.openLogin();
    await app.login.forgotPassword.click();
    await app.resetPassword.cancel.click();
    await expect(page.locator('#login-form-button')).toBeVisible();
  });

  test('reset-password-005 reset password for a non-existing email address', async ({ page, app }) => {
    await startReset(page, app, `no-such-user-${Date.now()}@dev.eduid.sunet.se`);
    // Observation OBS-02: this message tells an attacker which addresses are registered.
    await expect(page.getByText(texts.sv.resetPassword.userNotFound)).toBeVisible();
  });
});

test.describe('Test back-doors are closed without the magic cookie', () => {
  test.use({ magicCookie: false });

  test('reset-password-006 get-code endpoints do not hand out codes without the autotests cookie @security', async ({ request, sharedAccount }) => {
    // `request` is a fresh API context without the cookie.
    const urls = [
      config.resetPwCodeUrl + sharedAccount.eppn,
      config.signupCodeUrl + encodeURIComponent(sharedAccount.email),
      `${config.emailCodeUrl}?email=${encodeURIComponent(sharedAccount.email)}&eppn=${sharedAccount.eppn}`,
      config.letterCodeUrl,
    ];
    for (const url of urls) {
      const response = await request.get(url, { failOnStatusCode: false });
      const body = (await response.text()).trim();
      expect.soft(response.ok(), `${new URL(url).pathname} status ${response.status()}`).toBe(false);
      expect.soft(body, `${new URL(url).pathname} body`).not.toMatch(/^[0-9a-z]{6,10}$/i);
    }
  });
});
