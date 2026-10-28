import { Page } from '@playwright/test';
import { App, freshBrowser, freshBrowserWithKey, test, expect, verifyIdentityWithEidas, verifyIdentityWithFreja } from '../src/fixtures';
import { texts } from '../src/i18n';
import { EidasPerson, eidasPerson } from '../src/helpers/testdata';
import { codes } from '../src/helpers/codes';
import { chooseOtherAuthOption, enterSixDigitCode, fillStable } from '../src/helpers/ui';
import { VirtualAuthenticator } from '../src/helpers/webauthn';

/*
 * eIDAS on dev: EU citizen → Sweden Connect country selection → test country XA, where the test
 * chooses one of the IdP's test persons and the level of assurance → consent → back to eduID.
 * An eIDAS identity can be verified on only one account at a time (eidas-004), so every test uses
 * eidasPerson(): the person reserved for its parallel slot.
 */

async function expectEidasVerified(app: App, person: EidasPerson): Promise<void> {
  await app.header.goTo('identity');
  await expect(app.identity.verifiedEidas).toContainText(texts.sv.identity.eidasIdentity);
  await expect(app.identity.verifiedEidas).toContainText(`XA ${person.birthDate}`);
  await app.header.goTo('start');
  await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
}

async function expectNotVerified(app: App): Promise<void> {
  await app.header.goTo('start');
  await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifyIdentity);
  await app.header.goTo('identity');
  await expect(app.identity.euOption).toBeVisible();
  await expect(app.identity.removeVerifiedEidas).toHaveCount(0);
}

test.describe('Verify identity with eIDAS', () => {
  test('eidas-001 verify identity with eIDAS: the eIDAS identity and its names replace the registered ones', async ({ page, app, loggedInAccount }) => {
    const person = eidasPerson();
    await verifyIdentityWithEidas(page, person);

    await expect(page.getByText(texts.sv.identity.readyToUse)).toBeVisible();
    await expect(app.identity.verifiedEidas).toContainText(texts.sv.identity.eidasIdentity);
    await expect(app.identity.verifiedEidas).toContainText(`XA ${person.birthDate}`);
    await expect(app.identity.shownGivenName).toHaveText(person.givenName);
    await expect(app.identity.shownSurname).toHaveText(person.surName);
    expect(`${person.givenName} ${person.surName}`).not.toBe(`${loggedInAccount.givenName} ${loggedInAccount.surName}`);
    // A Swedish identity can still be added on top of the eIDAS one.
    await expect(page.getByText(texts.sv.identity.alsoSwedish)).toBeVisible();
    await expect(app.identity.verifyOptions).toBeVisible();

    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
    await expect(app.dashboard.welcomeHeading).toContainText(`${person.givenName} ${person.surName}`);
  });

  test('eidas-002 eIDAS level of assurance "Low" is not accepted', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await app.header.goTo('identity');
    await app.identity.startEidasVerification();
    await app.eidas.authenticateAs(eidasPerson(), 'low');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.errors.accessErrorHeading);
    await expect(page.getByText(texts.sv.errors.accessErrorText)).toBeVisible();
    await page.locator('#dashboard-button').click();
    await expectNotVerified(app);
  });

  test('eidas-003 an account can hold both an eIDAS identity and a Swedish identity (Freja+)', async ({ page, app, loggedInAccount }) => {
    const person = eidasPerson();
    await verifyIdentityWithEidas(page, person);
    await verifyIdentityWithFreja(page, loggedInAccount);

    await expect(app.identity.verifiedEidas).toContainText(`XA ${person.birthDate}`);
    await expect(app.identity.verifiedNin).toContainText(loggedInAccount.identityNumber.slice(0, 8) + '****');
    // The Swedish identity takes precedence for the names.
    await expect(app.identity.shownGivenName).toHaveText(loggedInAccount.givenName);
    await expect(app.identity.shownSurname).toHaveText(loggedInAccount.surName);
    await expect(app.identity.verifyOptions).toHaveCount(0);
    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
  });

  test('eidas-004 verifying the same eIDAS identity on a second account removes it from the first', async ({ page, app, browser, loggedInAccount }) => {
    void loggedInAccount;
    const person = eidasPerson();
    await verifyIdentityWithEidas(page, person);

    const second = await freshBrowser(browser);
    const secondAccount = await second.app.register.registerWithEmail();
    await second.app.login.loginToDashboard(secondAccount.email, secondAccount.password);
    await verifyIdentityWithEidas(second.page, person);
    await expectEidasVerified(second.app, person);
    await second.context.close();

    await page.reload();
    await expectNotVerified(app);
  });

  test('eidas-005 the eIDAS identity can be removed', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await verifyIdentityWithEidas(page, eidasPerson());
    await app.identity.removeVerifiedEidas.click();
    await expect(app.identity.removeIdentityDialog.getByRole('heading')).toHaveText(texts.sv.identity.removeHeading);
    await app.identity.removeIdentityConfirm.click();
    await expectNotVerified(app);
  });

  test('eidas-006 the remove button of the eIDAS identity has an accessible name [known defect DEF-07]', async ({ page, app, loggedInAccount }) => {
    test.fail(true, 'DEF-07: the eIDAS remove button is an icon without a name (WCAG 4.1.2)');
    void loggedInAccount;
    await verifyIdentityWithEidas(page, eidasPerson());
    // Same name as the button for a Swedish identity.
    await expect(app.identity.removeVerifiedEidas).toHaveAccessibleName('Ta bort den här verifierade identiteten');
  });
});

test.describe('Security keys and MFA with eIDAS', () => {
  // WebAuthn emulation uses the Chrome DevTools Protocol.
  test.skip(({ browserName }) => browserName !== 'chromium', 'virtual authenticator needs Chromium');

  /** eIDAS-verified account with a security key that is verified with eIDAS from the "verify now" dialog. */
  async function accountWithEidasVerifiedKey(page: Page, app: App, keyName: string) {
    const person = eidasPerson();
    await verifyIdentityWithEidas(page, person);
    const key = await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addSecurityKey.click();
    await fillStable(app.security.keyNameInput, keyName);
    await app.security.keyNameSubmit.click();
    await app.security.verifyWithEidasInDialog.click();
    await app.security.securityConfirmAccept.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.security.reauthHeading);
    await app.login.mfaSecurityKey.click();
    await app.eidas.authenticateAs(person);
    await expect(page).toHaveTitle(texts.sv.titles.security);
    await expect(app.security.keyRow(keyName)).toContainText(texts.sv.security.keyVerified);
    return { person, key };
  }

  test('eidas-007 without the key at hand, eIDAS can be used as the second factor at login', async ({ page, app, browser, loggedInAccount }) => {
    await accountWithEidasVerifiedKey(page, app, 'pw-key-eidas-mfa');

    const other = await freshBrowserWithKey(browser, null); // another computer, without the key
    await other.app.start.openLogin();
    await other.app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(other.page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.mfaHeading);
    await chooseOtherAuthOption(other.page, 'eIDAS');
    await other.app.eidas.authenticateAs(eidasPerson());
    await expect(other.page).toHaveURL(/\/start/, { timeout: 30_000 });
    await expect(other.page.locator('#header')).toContainText(loggedInAccount.email);
    await other.context.close();
  });

  test('eidas-008 a deleted account is restored from the "deleted account" page by reset password with eIDAS; identity and key stay verified', async ({ page, app, browser, loggedInAccount }) => {
    const { person, key } = await accountWithEidasVerifiedKey(page, app, 'pw-key-eidas-restore');
    await app.header.goTo('account');
    await app.account.deleteButton.click();
    await app.account.deleteConfirm.click();
    // An account with MFA must re-authenticate first; after that dev deletes the account and logs out.
    await app.security.securityConfirmAccept.click();
    await app.login.mfaSecurityKey.click();
    await expect(app.start.loginButton).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#logout')).toHaveCount(0);

    // Logging in again in the same browser shows the "deleted account" page with a way to restore it.
    // (From another browser dev only says "wrong e-mail or password", see account-015 and OBS-13.)
    await app.start.loginButton.click();
    await app.login.mfaSecurityKey.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.deletedAccountHeading);
    await expect(page.getByText(texts.sv.login.accountTerminated)).toBeVisible();
    await expect(page.locator('#logout')).toHaveCount(0);

    // Restore: reset password with eIDAS as extra security.
    await page.getByRole('button', { name: texts.sv.login.toResetPassword }).click();
    await fillStable(app.resetPassword.emailInput, loggedInAccount.email);
    await app.resetPassword.sendEmail.click();
    await app.register.solveCaptcha();
    await enterSixDigitCode(page, await codes.resetPassword(page.context(), loggedInAccount.eppn!));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.extraSecurityHeading);
    await app.resetPassword.chooseOtherOption('eIDAS');
    await app.eidas.authenticateAs(person);
    const newPassword = await app.password.useSuggested();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.resetPassword.completedHeading);
    await app.resetPassword.finished.click();

    // Log in on another computer with the same key: the account is back with its identity and key.
    const other = await freshBrowserWithKey(browser, key);
    await other.app.start.openLogin();
    await other.app.login.login(loggedInAccount.email, newPassword);
    await other.app.login.mfaSecurityKey.click();
    await expect(other.page).toHaveURL(/\/start/, { timeout: 30_000 });
    await expectEidasVerified(other.app, person);
    await other.app.header.goTo('security');
    await expect(other.app.security.keyRow('pw-key-eidas-restore')).toContainText(texts.sv.security.keyVerified);
    await other.context.close();
  });
});
