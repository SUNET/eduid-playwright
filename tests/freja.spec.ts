import { Page } from '@playwright/test';
import { App, freshBrowser, freshBrowserWithKey, test, expect, verifyIdentityWithFreja, verifyKeyWithFreja } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { Account, Person } from '../src/helpers/testdata';
import { addNinCookie, codes } from '../src/helpers/codes';
import { enterSixDigitCode, fillStable, setLanguage } from '../src/helpers/ui';
import { VirtualAuthenticator } from '../src/helpers/webauthn';

/*
 * Freja+ on dev goes to the Sweden Connect reference IdP, where the test types the
 * person to authenticate as. The `nin` cookie must hold the same number.
 * Real Freja eID ("Most countries", and the Freja eID key option) goes to the real
 * Freja test service, which needs the mobile app, so those tests only check the hand-over.
 */

const FREJA_EID_LOGIN = /oidc-ct\.test\.frejaeid\.com/;

/** Login page → forgot password → e-mail → CAPTCHA → code. Ends on the extra-security step (or the password step). */
async function requestPasswordReset(page: Page, app: App, account: Account): Promise<void> {
  await app.start.openLogin();
  if (await app.login.notYou.isVisible()) await app.login.notYou.click();
  await app.login.forgotPassword.click();
  await fillStable(app.resetPassword.emailInput, account.email);
  await app.resetPassword.sendEmail.click();
  await app.register.solveCaptcha();
  await enterSixDigitCode(page, await codes.resetPassword(page.context(), account.eppn!));
}

async function expectIdentityVerified(app: App, account: Person): Promise<void> {
  await app.header.goTo('start');
  await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
  await app.header.goTo('identity');
  await expect(app.identity.verifiedNin).toContainText(account.identityNumber.slice(0, 8) + '****');
  await expect(app.identity.verifyOptions).toHaveCount(0);
}

async function expectIdentityNotVerified(app: App): Promise<void> {
  await app.header.goTo('start');
  await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifyIdentity);
  await expect(app.dashboard.statusOverview).not.toContainText(texts.sv.dashboard.verifiedIdentity);
  await app.header.goTo('identity');
  await expect(app.identity.verifyOptions).toBeVisible();
  await expect(app.identity.removeVerifiedNin).toHaveCount(0);
}


test.describe('Verify identity with Freja+', () => {
  for (const lang of LANGS) {
    test(`freja-001 Freja+ information dialog texts (${lang})`, async ({ page, app, sharedAccount }) => {
      const t = texts[lang].identity;
      await app.start.openLogin();
      await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
      await setLanguage(page, lang);
      await app.header.goTo('identity');
      await page.locator('#swedish-button').click();
      await app.identity.frejaOption.click();
      await app.identity.frejaProceed.click();

      const dialog = page.getByRole('dialog').filter({ has: app.identity.frejaInfoAccept });
      await expect(dialog.getByRole('heading')).toHaveText(t.frejaInfoHeading);
      await expect(dialog.getByRole('listitem')).toHaveCount(5);
      await expect(dialog.getByRole('listitem').first()).toHaveText(t.frejaInfoFirstStep);
      await expect(app.identity.frejaInfoAccept).toHaveText(new RegExp(`^${t.frejaInfoAccept.replace('+', '\\+')}$`, 'i'));
      await app.identity.frejaInfoClose.click();
      await expect(app.identity.frejaInfoAccept).toBeHidden();
      await setLanguage(page, 'sv');
    });
  }

  test('freja-002 without the nin test cookie the Freja+ answer is rejected and the identity stays unverified', async ({ page, app, loggedInAccount }) => {
    // Same check as the Java TC_40: without the `nin` cookie dev rejects the reference IdP answer.
    await app.header.goTo('identity');
    await app.identity.startFrejaVerification();
    await app.refIdp.authenticateAs(loggedInAccount);
    await expect(page.getByText(texts.sv.errors.ninWrongFormat)).toBeVisible();
    await expectIdentityNotVerified(app);
  });

  test('freja-003 verify identity with Freja+: identity page, names and dashboard show the verified identity @smoke', async ({ page, app, loggedInAccount }) => {
    const t = texts.sv.identity;
    await verifyIdentityWithFreja(page, loggedInAccount);

    await expect(page.getByText(t.readyToUse)).toBeVisible();
    await expect(page.getByRole('heading', { name: t.connectedHeading })).toBeVisible();
    await expect(app.identity.verifiedNin).toContainText(t.swedishNin);
    await expect(app.identity.verifiedNin).toContainText(loggedInAccount.identityNumber.slice(0, 8) + '****');
    await expect(app.identity.verifiedNin).not.toContainText(loggedInAccount.identityNumber);
    await app.identity.showVerifiedNin.click();
    await expect(app.identity.verifiedNin).toContainText(loggedInAccount.identityNumber);

    await expect(app.identity.shownGivenName).toHaveText(loggedInAccount.givenName);
    await expect(app.identity.shownSurname).toHaveText(loggedInAccount.surName);
    await expectIdentityVerified(app, loggedInAccount);
  });

  test('freja-004 "Most countries" (Freja eID) hands over to the Freja eID service; going back leaves the identity unverified', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await app.header.goTo('identity');
    await app.identity.worldOption.click();
    await app.identity.worldProceed.click();
    await expect(page).toHaveURL(FREJA_EID_LOGIN, { timeout: 30_000 });
    await expect(page).toHaveTitle(/Freja eID/);
    await page.goBack();
    await expectIdentityNotVerified(app);
  });
});

test.describe('Account with a verified identity', () => {
  test('freja-005 the verified identity can be removed; the confirmation dialog is shown in both languages', async ({ page, app, verifiedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await app.header.goTo('identity');

    for (const lang of ['en', 'sv'] as const) {
      const t = texts[lang].identity;
      await setLanguage(page, lang);
      await app.identity.removeVerifiedNin.click();
      await expect(app.identity.removeIdentityDialog.getByRole('heading')).toHaveText(t.removeHeading);
      await expect(app.identity.removeIdentityDialog).toContainText(t.removeQuestion);
      await expect(app.identity.removeIdentityConfirm).toHaveText(new RegExp(`^${t.removeConfirm}$`, 'i'));
      if (lang === 'en') await app.identity.removeIdentityClose.click();
    }
    await app.identity.removeIdentityConfirm.click();
    await expect(app.identity.verifyOptions).toBeVisible();
    await expectIdentityNotVerified(app);
  });

  test('freja-006 reset password without extra security removes the verified identity', async ({ page, app, verifiedAccount }) => {
    await requestPasswordReset(page, app, verifiedAccount);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.extraSecurityHeading);
    await app.resetPassword.continueWithoutSecurity.click();
    const newPassword = await app.password.useSuggested();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.completedHeading);
    await app.resetPassword.finished.click();

    await app.login.loginToDashboard(verifiedAccount.email, newPassword);
    await expectIdentityNotVerified(app);
  });

  test('freja-007 a deleted account is restored by reset password with Freja+ and keeps its verified identity', async ({ page, app, verifiedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await app.header.goTo('account');
    await app.account.deleteButton.click();
    await app.account.deleteConfirm.click();
    await expect(page.locator('#login-button, #login-form-button').first()).toBeVisible({ timeout: 20_000 });

    await addNinCookie(page.context(), verifiedAccount.identityNumber);
    await requestPasswordReset(page, app, verifiedAccount);
    await app.resetPassword.chooseOtherOption('Freja+');
    await app.refIdp.authenticateAs(verifiedAccount);
    const newPassword = await app.password.useCustom(`Pw-${Date.now()}-Strong!x9Q`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.completedHeading);
    await app.resetPassword.finished.click();

    await app.login.loginToDashboard(verifiedAccount.email, newPassword);
    await expectIdentityVerified(app, verifiedAccount);
  });

  test('freja-008 verifying the same national ID on a second account removes it from the first', async ({ page, app, browser, verifiedAccount, loggedInAccount }) => {
    // loggedInAccount (the second account) proves the identity that verifiedAccount already holds.
    await verifyIdentityWithFreja(page, { ...loggedInAccount, identityNumber: verifiedAccount.identityNumber });
    await expectIdentityVerified(app, { ...loggedInAccount, identityNumber: verifiedAccount.identityNumber });

    const first = await freshBrowser(browser);
    await first.app.start.openLogin();
    await first.app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await expectIdentityNotVerified(first.app);
    await first.context.close();
  });
});

test.describe('Verify a security key with Freja', () => {
  // WebAuthn emulation uses the Chrome DevTools Protocol.
  test.skip(({ browserName }) => browserName !== 'chromium', 'virtual authenticator needs Chromium');

  test('freja-009 a key on a verified account is verified later from the key list with Freja+', async ({ page, app, verifiedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-later');
    await expect(app.security.keyRow('pw-key-later')).not.toContainText(texts.sv.security.keyVerified);

    await verifyKeyWithFreja(page, verifiedAccount, () =>
      app.security.keyRow('pw-key-later').getByRole('button', { name: 'Freja+', exact: true }).click(),
    );
    await expect(app.security.keyRow('pw-key-later')).toContainText(texts.sv.security.keyVerified);
    await expect(app.security.keyRow('pw-key-later').getByRole('button', { name: 'Freja+', exact: true })).toHaveCount(0);
  });

  test('freja-010 a verified key can be removed; afterwards login only needs the password', async ({ page, app, browser, verifiedAccount }) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-remove-verified');
    await verifyKeyWithFreja(page, verifiedAccount, () =>
      app.security.keyRow('pw-key-remove-verified').getByRole('button', { name: 'Freja+', exact: true }).click(),
    );
    await expect(app.security.keyRow('pw-key-remove-verified')).toContainText(texts.sv.security.keyVerified);

    await app.security.removeKey.click();
    // As in security-key-006: depending on how recent the last authentication is, removal may need a step-up first.
    const reauth = await app.security.securityConfirmAccept.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    if (reauth) {
      await app.security.securityConfirmAccept.click();
      await app.login.mfaSecurityKey.click();
    }
    await expect(app.security.keysSection).toContainText(texts.sv.security.noKeys, { timeout: 20_000 });

    const other = await freshBrowser(browser);
    await other.app.start.openLogin();
    await other.app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await other.context.close();
  });

  test('freja-011 verifying a new key with Freja+ also verifies the identity; reset password with the key keeps both', async ({ page, app, browser, loggedInAccount }) => {
    const key = await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addSecurityKey.click();
    await fillStable(app.security.keyNameInput, 'pw-key-now');
    await app.security.keyNameSubmit.click();
    await verifyKeyWithFreja(page, loggedInAccount, () => app.security.verifyWithFrejaInDialog.click());
    await expect(app.security.keyRow('pw-key-now')).toContainText(texts.sv.security.keyVerified);
    await expectIdentityVerified(app, loggedInAccount);

    // Reset the password on "another computer" with the same key as extra security.
    const other = await freshBrowserWithKey(browser, key);
    await requestPasswordReset(other.page, other.app, loggedInAccount);
    await other.app.resetPassword.useSecurityKey.click();
    const newPassword = await other.app.password.useSuggested();
    await expect(other.page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.completedHeading);
    await other.app.resetPassword.finished.click();

    await other.app.login.login(loggedInAccount.email, newPassword);
    await other.app.login.mfaSecurityKey.click();
    await expect(other.page).toHaveURL(/\/start/);
    await expectIdentityVerified(other.app, loggedInAccount);
    await other.app.header.goTo('security');
    await expect(other.app.security.keyRow('pw-key-now')).toContainText(texts.sv.security.keyVerified);
    await other.context.close();
  });

  test('freja-012 verifying a key with Freja eID hands over to Freja eID; going back leaves the key unverified', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-frejaeid');
    await app.security.keyRow('pw-key-frejaeid').getByRole('button', { name: 'Freja eID', exact: true }).click();
    await app.security.securityConfirmAccept.click();
    await app.login.mfaSecurityKey.click();
    await expect(page).toHaveURL(FREJA_EID_LOGIN, { timeout: 30_000 });

    await page.goBack();
    await expect(page).toHaveTitle(texts.sv.titles.security);
    await expect(app.security.keyRow('pw-key-frejaeid')).not.toContainText(texts.sv.security.keyVerified);
    await expect(app.security.keyRow('pw-key-frejaeid').getByRole('button', { name: 'Freja eID', exact: true })).toBeVisible();
  });
});
