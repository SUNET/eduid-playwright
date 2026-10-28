import { Page } from '@playwright/test';
import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { codes } from '../src/helpers/codes';
import { uniqueEmail } from '../src/helpers/testdata';
import { fillStable, setLanguage } from '../src/helpers/ui';

test.describe('Account page — read only', () => {
  test.beforeEach(async ({ page, app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    await setLanguage(page, 'sv'); // the shared account's language is server-side state; pin it
    await app.header.goTo('account');
  });

  for (const lang of LANGS) {
    test(`account-001 account page sections and texts (${lang})`, async ({ page, app, sharedAccount }) => {
      const t = texts[lang].account;
      await setLanguage(page, lang);
      await expect(page).toHaveTitle(texts[lang].titles.account);
      await expect(page.getByText(t.intro)).toBeVisible();
      for (const heading of [t.uniqueId, t.emails, t.language, t.changePassword, t.orcid, t.esi, t.deleteHeading]) {
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      }
      await expect(page.locator('#user-eppn')).toHaveValue(sharedAccount.eppn!);
      await expect(app.account.emailRow(sharedAccount.email)).toContainText(new RegExp(t.primary, 'i'));
      await expect(app.account.addMoreEmails).toHaveText(t.addMore);
    });
  }

  test('account-002 the primary address cannot be added again as an extra address', async ({ page, app, sharedAccount }) => {
    await app.account.addMoreEmails.click();
    await fillStable(app.account.newEmailInput, sharedAccount.email);
    await expect(page.getByText(texts.sv.account.emailAlreadyInList)).toBeVisible();
    await expect(app.account.addEmailButton).toBeDisabled();
    await expect(app.account.emailSection.locator('tr', { hasText: sharedAccount.email })).toHaveCount(1);
  });

  test('account-003 an invalid email address is rejected by the add-email form', async ({ page, app }) => {
    // The Java version never reached this branch (`!x.contains("")` is always false), so the case was silently untested.
    await app.account.addMoreEmails.click();
    await fillStable(app.account.newEmailInput, 'notAvalidEmailAtgmail.com');
    await app.account.newEmailInput.blur();
    await expect(page.getByText(texts.sv.account.invalidEmail)).toBeVisible();
    await expect(app.account.addEmailButton).toBeDisabled();
  });

  test('account-004 delete account can be aborted in the confirmation dialog', async ({ page, app }) => {
    await app.account.deleteButton.click();
    await expect(page.getByText(texts.sv.account.deleteConfirmQuestion)).toBeVisible();
    await expect(app.account.deleteConfirm).toHaveText(new RegExp(texts.sv.account.deleteConfirmButton, 'i'));
    await app.account.deleteClose.click();
    await expect(app.account.deleteConfirm).toBeHidden();
    await expect(page).toHaveTitle(texts.sv.titles.account);
  });
});

test.describe('Names and language', () => {
  test('account-005 change first and last name; the change persists after logout/login', async ({ page, app, loggedInAccount }) => {
    await app.header.goTo('identity');
    await app.identity.updateNames('Palle', 'Kuling');
    await app.header.logout();
    await app.start.loginButton.click();
    await app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(app.dashboard.welcomeHeading).toContainText('Palle Kuling');
    await app.header.goTo('identity');
    await expect(app.identity.shownGivenName).toHaveText('Palle');
    await expect(page.locator('[id="last name"]')).toHaveText('Kuling');
  });

  test('account-006 names with Swedish characters, hyphens and apostrophes are stored unchanged', async ({ app, loggedInAccount }) => {
    void loggedInAccount;
    test.info().annotations.push({ type: 'data', description: 'Åsa-Märta / Öberg-D\'Ångström' });
    await app.header.goTo('identity');
    await app.identity.updateNames('Åsa-Märta', "Öberg-D'Ångström");
    await app.header.goTo('start');
    await expect(app.dashboard.welcomeHeading).toContainText("Åsa-Märta Öberg-D'Ångström");
  });

  test('account-007 preferred language English is applied after logout/login', async ({ page, app, loggedInAccount }) => {
    await app.header.goTo('account');
    await page.locator('label', { has: app.account.languageEnglish }).or(page.locator('label[for="English"]')).first().click();
    await expect(app.account.languageEnglish).toBeChecked();
    await expect(page).toHaveTitle(texts.en.titles.account);
    await app.header.logout();
    await app.start.loginButton.click();
    await app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(page).toHaveURL(/\/start/);
    await expect(app.dashboard.welcomeHeading).toContainText(texts.en.dashboard.welcome);
  });
});

test.describe('Email addresses', () => {
  test('account-008 add an extra address, confirm it with the code, log in with it, make it primary and remove it @mobile', async ({ page, app, loggedInAccount }) => {
    const t = texts.sv.account;
    const extra = uniqueEmail('pwx');
    await app.header.goTo('account');
    await app.account.addEmail(extra);
    await expect(app.account.emailRow(extra)).toContainText(new RegExp(t.confirm, 'i'));

    await app.account.openConfirmEmail(extra);
    const code = await codes.emailConfirmation(page.context(), extra, loggedInAccount.eppn!);
    await app.account.submitEmailCode(code);
    await expect(app.account.emailRow(extra)).toContainText(new RegExp(t.makePrimary, 'i'));

    // Log in with the new, non-primary address.
    await app.header.logout();
    await app.start.loginButton.click();
    if (await app.login.notYou.isVisible()) await app.login.notYou.click();
    await app.login.loginToDashboard(extra, loggedInAccount.password);

    await app.header.goTo('account');
    await app.account.makePrimary(extra);
    await expect(app.account.emailRow(extra)).toContainText(new RegExp(t.primary, 'i'));
    await expect(app.account.emailRow(loggedInAccount.email)).toContainText(new RegExp(t.makePrimary, 'i'));
    await app.account.makePrimary(loggedInAccount.email);
    await expect(app.account.emailRow(loggedInAccount.email)).toContainText(new RegExp(`^.*${t.primary}`, 'i'));
    await app.account.removeEmail(extra);
  });

  test('account-009 a wrong email confirmation code is rejected and the address stays unconfirmed', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    const extra = uniqueEmail('pwx');
    await app.header.goTo('account');
    await app.account.addEmail(extra);
    await app.account.openConfirmEmail(extra);
    await app.account.submitEmailCode('0000000000');
    await expect(page.getByText(texts.sv.errors.emailCodeInvalid)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.account.emailRow(extra)).toContainText(new RegExp(texts.sv.account.confirm, 'i'));
    await app.account.removeEmail(extra);
  });
});

async function expectPasswordChanged(page: Page, email: string, shownPassword?: string): Promise<void> {
  await expect(page).toHaveURL(/\/chpass\/success/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.password.changedHeading);
  await expect(page.locator('#user-email')).toHaveText(email);
  if (shownPassword) await expect(page.locator('#user-password')).toHaveText(shownPassword);
  // The button is labelled "Go to eduID Dashboard" but returns to /account (observation OBS-04).
  await page.getByRole('button', { name: /dashboard/i }).click();
  await expect(page).toHaveURL(/\/(start|account)/);
}

test.describe('Change password', () => {
  test.beforeEach(async ({ app, loggedInAccount }) => {
    void loggedInAccount;
    await app.header.goTo('account');
    await app.account.changePasswordButton.click();
  });

  test('account-010 change to the suggested password and log in with it @mobile', async ({ page, app, loggedInAccount }) => {
    await expect(page).toHaveTitle(texts.sv.titles.changePassword);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.password.changeRecommendedHeading);
    const newPassword = await app.password.useSuggested();
    expect(newPassword).not.toBe(loggedInAccount.password);
    await expectPasswordChanged(page, loggedInAccount.email, newPassword);

    await app.header.logout();
    await app.start.loginButton.click();
    await app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(page.getByText(texts.sv.login.wrongCredentials)).toBeVisible();
    await app.login.login(loggedInAccount.email, newPassword);
    await expect(page).toHaveURL(/\/start/);
  });

  test('account-011 change to a custom password and log in with it', async ({ page, app, loggedInAccount }) => {
    const custom = `Custom-${Date.now()}-Pw!q7Z`;
    await app.password.useCustom(custom);
    await expectPasswordChanged(page, loggedInAccount.email);
    await app.header.logout();
    await app.start.loginButton.click();
    await app.login.login(loggedInAccount.email, custom);
    await expect(page).toHaveURL(/\/start/);
  });

  test('account-012 aborting the password change keeps the old password', async ({ page, app, loggedInAccount }) => {
    await app.password.expandIfCollapsed();
    await page.locator('#new-password-form button', { hasText: /avbryt|cancel/i }).click();
    await expect(page).not.toHaveURL(/chpass/);
    await app.header.logout();
    await app.start.loginButton.click();
    await app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(page).toHaveURL(/\/start/);
  });

  test('account-013 custom passwords that do not match cannot be saved', async ({ page, app }) => {
    await app.password.fillCustom('Test?=59(GG1234%€#\\', 'NotTheSamePassword');
    await expect(page.getByText(texts.sv.password.mismatch)).toBeVisible();
    await expect(app.password.saveCustom).toBeDisabled();
  });

  test('account-014 a too weak custom password cannot be saved', async ({ app }) => {
    await app.password.fillCustom('test');
    await expect(app.password.saveCustom).toBeDisabled();
  });
});

test.describe('Delete account', () => {
  test('account-015 delete the account; the old credentials no longer work @mobile', async ({ page, app, loggedInAccount }) => {
    await app.header.goTo('account');
    await app.account.deleteButton.click();
    await app.account.deleteConfirm.click();
    await expect(page.locator('#login-button, #login-form-button').first()).toBeVisible({ timeout: 20_000 });

    await app.start.openLogin();
    if (await app.login.notYou.isVisible()) await app.login.notYou.click();
    await app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(page.getByText(texts.sv.login.wrongCredentials)).toBeVisible();
    await expect(page).not.toHaveURL(/\/start/);
  });
});
