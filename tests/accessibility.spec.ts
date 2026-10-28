import AxeBuilder from '@axe-core/playwright';
import { devices, Page, TestInfo } from '@playwright/test';
import { App, freshBrowser, freshBrowserWithKey, test, expect, verifyIdentityWithEidas } from '../src/fixtures';
import { Section } from '../src/pages/Header';
import { addNinCookie, codes } from '../src/helpers/codes';
import { eidasPerson, randomPerson, uniqueEmail } from '../src/helpers/testdata';
import { enterSixDigitCode, fillStable, setLanguage } from '../src/helpers/ui';
import { VirtualAuthenticator } from '../src/helpers/webauthn';
import { openOnDevice2, startOtherDeviceAnonymous, startOtherDeviceRemembered } from '../src/helpers/flows';
import { texts } from '../src/i18n';

/**
 * WCAG 2.1 A/AA scans with axe-core (replaces WCAG_1..7 of the Java suite).
 *
 * Improvement over the Java version: that version wrote an HTML report but
 * never failed — `if (violations.size() == 0) Assert.assertTrue(true)`.
 * Here critical/serious violations fail the test, everything is attached to
 * the report as JSON, and known issues are listed explicitly so that a new
 * violation is caught immediately.
 *
 * Coverage: every page, every step of the multi-step flows, the dialogs, the
 * filled-in states (verified identity, keys, several e-mail addresses), error
 * states, English, dark mode and phone width. Flows scan each step with soft
 * assertions, so one violation does not hide the steps after it. Scan names are
 * "<page>" or "<page>@<variant>"; known issues are keyed by the page part.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Known violations, keyed "<page>:<rule>:<css target>" so that the same rule failing on a
 * new element still breaks the build. "*" as page means every page (the notification banner
 * is shared). Each entry points at a defect in docs/TEST_PROTOCOL.md.
 */
const KNOWN_ISSUES: Record<string, string> = {
  '*:color-contrast:output': 'DEF-05 notification banner text contrast (red on pink), on every page that shows it',
  'start:color-contrast:span > a[aria-label="go to account page"][href$="account"][data-discover="true"]':
    'DEF-06 link contrast in the completed "Confirmed account" status box',
  'start:color-contrast:a[aria-label="go to identity page"]': 'DEF-06 the same, in the completed "Verified identity" box',
  'identity:button-name:#remove-identity-eidas': 'DEF-07 remove button of an eIDAS identity has no name',
  'login-mfa:label:#react-select-N-input': 'DEF-11 "Visa andra alternativ" combobox has no label',
  'login-reauth:label:#react-select-N-input': 'DEF-11 "Visa andra alternativ" combobox has no label',
  'reset-extra:label:#react-select-N-input': 'DEF-11 "Visa andra alternativ" combobox has no label',
  'account:button-name:.email[data-identifier="email"]:nth-child(2) > .remove-data > .remove.sm[type="button"]':
    'DEF-12 e-mail remove buttons have no name',
  'account:button-name:.email.unverified[data-identifier="email"] > .remove-data > .remove.sm[type="button"]':
    'DEF-12 e-mail remove buttons have no name',
  'security:color-contrast:#security-webauthn-button': 'DEF-10 non-modal dialog: the page under the overlay stays active',
  'identity:color-contrast:button[aria-label="Proceed with letter proofing"]': 'DEF-10 non-modal dialog: the page under the overlay stays active',
};

function isKnown(base: string, rule: string, target: string): boolean {
  // react-select numbers its inputs in render order (react-select-2-input, -3-, ...).
  const normalized = target.replace(/react-select-\d+-input/g, 'react-select-N-input');
  return !!(KNOWN_ISSUES[`${base}:${rule}:${normalized}`] ?? KNOWN_ISSUES[`*:${rule}:${normalized}`]);
}

async function scan(page: Page, testInfo: TestInfo, name: string, options: { soft?: boolean } = {}): Promise<void> {
  // Colours fade (e.g. after switching theme); measuring contrast mid-transition gives random results.
  // Only colour transitions matter: the other-device countdown restarts a width transition every second.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter(
      (a) => a instanceof CSSTransition && a.playState === 'running' && /color|background|opacity/.test(a.transitionProperty),
    ).length), {
      message: 'CSS transitions finished before the scan',
      timeout: 5_000,
    })
    .toBe(0);
  // @axe-core/playwright is typed against its own playwright-core; the runtime object is the same.
  const results = await new AxeBuilder({ page: page as never }).withTags(TAGS).analyze();
  await testInfo.attach(`axe-${name}.json`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });

  const base = name.split('@')[0];
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ ...v, nodes: v.nodes.filter((n) => !isKnown(base, v.id, n.target.join(' '))) }))
    .filter((v) => v.nodes.length > 0);
  const summary = results.violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`);
  testInfo.annotations.push({ type: 'axe', description: `${name}: ${summary.join('; ') || 'no violations'}` });

  (options.soft ? expect.soft : expect)(
    blocking.map((v) => `${v.id} — ${v.help}\n   ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n   ')}`),
    `serious/critical WCAG violations on ${name}`,
  ).toEqual([]);
}

/** Flows scan several states; soft assertions keep going after a violation. */
const step = (page: Page, testInfo: TestInfo, name: string) => scan(page, testInfo, name, { soft: true });

async function loginShared(app: App, page: Page, account: { email: string; password: string }): Promise<void> {
  await app.start.openLogin();
  await app.login.loginToDashboard(account.email, account.password);
  await setLanguage(page, 'sv'); // the shared account's language is server-side state; pin it
}

const LOGGED_IN: Array<[string, Section]> = [
  ['accessibility-006 dashboard', 'start'],
  ['accessibility-007 identity', 'identity'],
  ['accessibility-008 security', 'security'],
  ['accessibility-009 account', 'account'],
];

test.describe('WCAG 2.1 AA: pages', () => {
  test.describe('anonymous pages', () => {
    test.use({ magicCookie: false });

    test('accessibility-001 start page', async ({ page, app }, testInfo) => {
      await app.start.goto();
      await scan(page, testInfo, 'start');
    });

    test('accessibility-002 login page', async ({ page, app }, testInfo) => {
      await app.start.openLogin();
      await scan(page, testInfo, 'login');
    });

    test('accessibility-003 registration page (form expanded)', async ({ page, app }, testInfo) => {
      await app.register.open();
      await app.register.showNameAndEmailForm();
      await scan(page, testInfo, 'register');
    });

    test('accessibility-004 help page (all sections expanded)', async ({ page }, testInfo) => {
      await page.goto('/help');
      await page.locator('details').evaluateAll((all) => all.forEach((d) => d.setAttribute('open', '')));
      await scan(page, testInfo, 'help');
    });

    test('accessibility-005 not-found page and the error page', async ({ page }, testInfo) => {
      await page.goto('/this-page-does-not-exist');
      await expect(page.getByRole('heading', { name: texts.sv.notFound.heading })).toBeVisible();
      await step(page, testInfo, 'notfound');
      // The page dev shows after a failed SAML response (e.g. eIDAS level Low, eidas-002).
      await page.goto('/errors?code=EDUID_ERROR&ts=1793029286&rp=samleid&tid=ERRORURL_TID&ctx=saml_response_fail');
      await expect(page.getByRole('heading', { name: texts.sv.errors.accessErrorHeading })).toBeVisible();
      await step(page, testInfo, 'errorpage');
    });
  });

  test.describe('logged-in pages (fresh account)', () => {
    for (const [title, section] of LOGGED_IN) {
      test(title, async ({ page, app, sharedAccount }, testInfo) => {
        await loginShared(app, page, sharedAccount);
        await app.header.goTo(section);
        await scan(page, testInfo, section);
      });
    }
  });
});

test.describe('WCAG 2.1 AA: every step of the flows', () => {
  test('accessibility-010 registration: CAPTCHA, terms, e-mail code, sign-in method, completed', async ({ page, app }, testInfo) => {
    const email = uniqueEmail();
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), email);
    await expect(app.register.captchaImage).toBeVisible();
    await step(page, testInfo, 'register-captcha');
    await app.register.solveCaptcha();
    await expect(app.register.acceptTerms).toBeVisible();
    await step(page, testInfo, 'register-terms');
    await app.register.acceptTerms.click();
    await expect(page.locator('[id="v[0]"]')).toBeVisible();
    await step(page, testInfo, 'register-code');
    await app.register.verifyEmailCode(email);
    await expect(app.register.addSecurityKey).toBeVisible();
    await step(page, testInfo, 'register-method');
    await app.password.useSuggested();
    await expect(app.register.finished).toBeVisible();
    await step(page, testInfo, 'register-done');
  });

  test('accessibility-011 registration form with validation errors', async ({ page, app }, testInfo) => {
    await app.register.open();
    await app.register.fillNameAndEmail({ givenName: 'Test', surName: 'Person' }, 'not-an-email');
    await app.register.givenName.fill('');
    await app.register.givenName.blur();
    await expect(page.getByText(texts.sv.register.emptyField).first()).toBeVisible();
    await scan(page, testInfo, 'register@errors');
  });

  test('accessibility-012 login page with an error message', async ({ page, app, sharedAccount }, testInfo) => {
    await app.start.openLogin();
    await app.login.login(sharedAccount.email, 'notTheCorrectPassword');
    await expect(page.getByText(texts.sv.login.wrongCredentials)).toBeVisible();
    await scan(page, testInfo, 'login@error');
  });

  test('accessibility-013 MFA login, re-authentication and the "deleted account" page', async ({ page, app, browser, loggedInAccount }, testInfo) => {
    const key = await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-a11y-key');

    const other = await freshBrowserWithKey(browser, key);
    await other.app.start.openLogin();
    await other.app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(other.app.login.mfaSecurityKey).toBeVisible();
    await step(other.page, testInfo, 'login-mfa');
    await other.context.close();

    // Deleting an account with MFA asks to re-authenticate; afterwards "Logga in" shows the deleted-account page.
    await app.header.goTo('account');
    await app.account.deleteButton.click();
    await app.account.deleteConfirm.click();
    await app.security.securityConfirmAccept.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.security.reauthHeading);
    await step(page, testInfo, 'login-reauth');
    await app.login.mfaSecurityKey.click();
    await expect(app.start.loginButton).toBeVisible({ timeout: 30_000 });
    await app.start.loginButton.click();
    await app.login.mfaSecurityKey.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.deletedAccountHeading);
    await step(page, testInfo, 'deleted-account');
  });

  test('accessibility-014 reset password: e-mail, CAPTCHA, code, extra security, new password, completed', async ({ page, app, verifiedAccount }, testInfo) => {
    await app.start.openLogin();
    await app.login.forgotPassword.click();
    await expect(app.resetPassword.emailInput).toBeVisible();
    await step(page, testInfo, 'reset');
    await fillStable(app.resetPassword.emailInput, verifiedAccount.email);
    await app.resetPassword.sendEmail.click();
    await expect(app.register.captchaImage).toBeVisible();
    await step(page, testInfo, 'reset-captcha');
    await app.register.solveCaptcha();
    await expect(page.locator('[id="v[0]"]')).toBeVisible();
    await step(page, testInfo, 'reset-code');
    await enterSixDigitCode(page, await codes.resetPassword(page.context(), verifiedAccount.eppn!));
    // A verified identity makes dev offer extra security (Freja+/BankID or continue without).
    await expect(app.resetPassword.continueWithoutSecurity).toBeVisible();
    await step(page, testInfo, 'reset-extra');
    await app.resetPassword.continueWithoutSecurity.click();
    await app.password.expandIfCollapsed();
    await step(page, testInfo, 'reset-password');
    await app.password.useSuggested();
    await expect(app.resetPassword.finished).toBeVisible();
    await step(page, testInfo, 'reset-done');
  });

  test('accessibility-015 change password: suggested, custom with mismatch, completed', async ({ page, app, loggedInAccount }, testInfo) => {
    void loggedInAccount;
    await app.header.goTo('account');
    await app.account.changePasswordButton.click();
    await app.password.expandIfCollapsed();
    await step(page, testInfo, 'chpass');
    await app.password.fillCustom('Test?=59(GG1234%€#', 'NotTheSamePassword');
    await expect(page.getByText(texts.sv.password.mismatch)).toBeVisible();
    await step(page, testInfo, 'chpass@mismatch');
    await app.password.useCustom(`Pw-${Date.now()}-Strong!x9Q`);
    await expect(page).toHaveURL(/\/chpass\/success/);
    await step(page, testInfo, 'chpass-done');
  });
});

test.describe('WCAG 2.1 AA: login with other device', () => {
  test('accessibility-016 code variant, device 1: code entry, wrong code, invalid request', async ({ page, app }, testInfo) => {
    await startOtherDeviceAnonymous(app);
    await step(page, testInfo, 'otherdevice-code');
    await enterSixDigitCode(page, '111111');
    await expect(page.getByText(texts.sv.errors.otherDeviceWrongCode)).toBeVisible();
    await step(page, testInfo, 'otherdevice-code@error');
    for (const code of ['222222', '333333']) await enterSixDigitCode(page, code);
    await expect(page.getByText(texts.sv.otherDevice.notValid)).toBeVisible();
    await step(page, testInfo, 'otherdevice-invalid');
  });

  test('accessibility-017 code variant, device 2: confirmation and cancelled pages', async ({ app, browser }, testInfo) => {
    await startOtherDeviceAnonymous(app);
    const device2 = await openOnDevice2(browser, app);
    await step(device2.page, testInfo, 'otherdevice-confirm');
    await device2.app.otherDevice.cancelOnOtherDevice.click();
    await expect(device2.page.getByText(texts.sv.otherDevice.cancelled)).toBeVisible();
    await step(device2.page, testInfo, 'otherdevice-cancelled');
    await device2.context.close();
  });

  test('accessibility-018 remembered-user variant: device 1 "continue" and device 2 confirm and done', async ({ page, app, browser, account }, testInfo) => {
    await startOtherDeviceRemembered(app, account);
    await step(page, testInfo, 'otherdevice-continue');
    const device2 = await openOnDevice2(browser, app);
    await step(device2.page, testInfo, 'otherdevice-confirm@remembered');
    await device2.app.otherDevice.proceed.click();
    await device2.app.login.login(account.email, account.password);
    await expect(device2.page.getByText(texts.sv.otherDevice.doneOnOther)).toBeVisible();
    await step(device2.page, testInfo, 'otherdevice-done');
    await device2.context.close();
  });

  test('accessibility-019 timeouts on both devices (fake clock)', async ({ page, app, browser }, testInfo) => {
    await page.clock.install();
    await startOtherDeviceAnonymous(app);
    const url = await app.otherDevice.qrTarget();
    await page.clock.fastForward('03:05');
    await expect(page.getByText(texts.sv.otherDevice.timedOut)).toBeVisible();
    await step(page, testInfo, 'otherdevice-timeout');

    const device2 = await freshBrowser(browser);
    await device2.page.clock.install();
    await device2.page.goto(url);
    await expect(device2.app.otherDevice.proceed).toBeVisible();
    await device2.page.clock.fastForward('03:05');
    await expect(device2.page.getByText(texts.sv.otherDevice.expired)).toBeVisible();
    await step(device2.page, testInfo, 'otherdevice-expired');
    await device2.context.close();
  });
});

test.describe('WCAG 2.1 AA: dialogs and filled-in states', () => {
  test('accessibility-020 account: delete dialog, e-mail code dialog, several e-mail addresses', async ({ page, app, loggedInAccount }, testInfo) => {
    await app.header.goTo('account');
    const extra = uniqueEmail();
    await app.account.addEmail(extra);
    await expect(app.account.emailRow(extra)).toBeVisible();
    await step(page, testInfo, 'account@two-emails');
    await app.account.openConfirmEmail(extra);
    await step(page, testInfo, 'account@email-code-dialog');
    await page.reload(); // Escape does not close this dialog (DEF-10)
    await expect(app.account.deleteButton).toBeVisible();
    await app.account.deleteButton.click();
    await expect(app.account.deleteConfirm).toBeVisible();
    await step(page, testInfo, 'account@delete-dialog');
    await app.account.deleteClose.click();
    void loggedInAccount;
  });

  test('accessibility-021 security: name-key dialog, verify-key dialog, a listed key, security-check dialog', async ({ page, app, loggedInAccount }, testInfo) => {
    void loggedInAccount;
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addSecurityKey.click();
    await expect(app.security.keyNameInput).toBeVisible();
    await step(page, testInfo, 'security@name-dialog');
    await fillStable(app.security.keyNameInput, 'pw-a11y-key');
    await app.security.keyNameSubmit.click();
    await expect(app.security.verifyModalNotNow).toBeVisible();
    await step(page, testInfo, 'security@verify-dialog');
    await app.security.verifyModalNotNow.click();
    await expect(app.security.keysSection).toContainText('pw-a11y-key');
    await step(page, testInfo, 'security@with-key');
    await app.security.removeKey.click();
    // Right after adding a key dev may remove it at once; the security check only appears otherwise.
    if (await app.security.securityConfirmAccept.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await step(page, testInfo, 'security@confirm-dialog');
    }
  });

  test('accessibility-022 identity: Freja+ information dialog and the letter-code dialog', async ({ page, app, loggedInAccount }, testInfo) => {
    await app.header.goTo('identity');
    await page.locator('#swedish-button').click();
    await app.identity.frejaOption.click();
    await app.identity.frejaProceed.click();
    await expect(app.identity.frejaInfoAccept).toBeVisible();
    await step(page, testInfo, 'identity@freja-dialog');
    await app.identity.frejaInfoClose.click();

    await app.identity.letterOption.click();
    await app.identity.ninInput.pressSequentially(loggedInAccount.identityNumber);
    await addNinCookie(page.context(), loggedInAccount.identityNumber);
    await app.identity.addNin.click();
    await page.locator('#se-letter button', { hasText: /fortsätt|proceed|continue/i }).click();
    const accept = page.locator('#letter-confirm-modal-accept-button');
    if (await accept.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await step(page, testInfo, 'identity@letter-order-dialog');
      await accept.click();
    }
    const proceed = page.locator('#se-letter button', { hasText: /fortsätt|proceed/i });
    if (!(await app.identity.letterCodeInput.isVisible())) await proceed.click();
    await expect(app.identity.letterCodeInput).toBeVisible();
    await step(page, testInfo, 'identity@letter-code-dialog');
  });

  test('accessibility-023 identity with a verified Swedish identity, and the remove dialog', async ({ page, app, verifiedAccount }, testInfo) => {
    await app.start.openLogin();
    await app.login.loginToDashboard(verifiedAccount.email, verifiedAccount.password);
    await app.header.goTo('identity');
    await expect(app.identity.verifiedNin).toBeVisible();
    await step(page, testInfo, 'identity@verified');
    await app.identity.removeVerifiedNin.click();
    await expect(app.identity.removeIdentityConfirm).toBeVisible();
    await step(page, testInfo, 'identity@remove-dialog');
    await app.identity.removeIdentityClose.click();
    await app.header.goTo('start');
    await step(page, testInfo, 'start@verified');
  });

  test('accessibility-024 identity with a verified eIDAS identity', async ({ page, app, loggedInAccount }, testInfo) => {
    void loggedInAccount;
    await verifyIdentityWithEidas(page, eidasPerson());
    await step(page, testInfo, 'identity@eidas');
  });
});

test.describe('WCAG 2.1 AA: English', () => {
  test('accessibility-025 anonymous pages in English', async ({ page, app }, testInfo) => {
    await app.start.goto();
    await setLanguage(page, 'en');
    await step(page, testInfo, 'start@en');
    await app.start.loginButton.click();
    await expect(app.login.submit).toBeVisible();
    await step(page, testInfo, 'login@en');
    await app.register.open();
    await setLanguage(page, 'en');
    await app.register.showNameAndEmailForm();
    await step(page, testInfo, 'register@en');
    await page.goto('/help');
    await setLanguage(page, 'en');
    await page.locator('details').evaluateAll((all) => all.forEach((d) => d.setAttribute('open', '')));
    await step(page, testInfo, 'help@en');
  });

  test('accessibility-026 logged-in pages in English', async ({ page, app, loggedInAccount }, testInfo) => {
    void loggedInAccount;
    await setLanguage(page, 'en');
    for (const [, section] of LOGGED_IN) {
      await app.header.goTo(section);
      await step(page, testInfo, `${section}@en`);
    }
  });
});

test.describe('WCAG 2.1 AA: dark mode', () => {
  test('accessibility-027 pages in dark mode', async ({ page, app, loggedInAccount }, testInfo) => {
    void loggedInAccount;
    await page.locator('label[for="color-mode"], #color-mode').first().click();
    await expect(page.locator('#color-mode')).toBeChecked();
    for (const [, section] of LOGGED_IN) {
      await app.header.goTo(section);
      await step(page, testInfo, `${section}@dark`);
    }
    await app.header.logout();
    await expect(app.start.loginButton).toBeVisible();
    await step(page, testInfo, 'start@dark');
    await app.start.loginButton.click();
    await expect(app.login.submit).toBeVisible();
    await step(page, testInfo, 'login@dark');
  });
});

test.describe('WCAG 2.1 AA: phone width', () => {
  const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];
  void _ignored;
  test.use(pixel);

  test('accessibility-028 pages at phone width, including the open menu', async ({ page, app, loggedInAccount }, testInfo) => {
    void loggedInAccount;
    for (const [, section] of LOGGED_IN) {
      await app.header.goTo(section);
      await step(page, testInfo, `${section}@mobile`);
    }
    await app.header.mobileMenuButton.click();
    await step(page, testInfo, 'start@mobile-menu');
    await app.header.mobileMenuButton.click(); // close it again; logout() opens it itself
    await app.header.logout();
    await expect(app.start.loginButton).toBeVisible();
    await step(page, testInfo, 'start@mobile');
    await app.start.loginButton.click();
    await expect(app.login.submit).toBeVisible();
    await step(page, testInfo, 'login@mobile');
  });
});

test.describe('Keyboard and assistive technology (beyond axe)', () => {
  test('accessibility-029 a dialog takes focus when opened, closes with Escape and returns focus (2.4.3) [known defect DEF-10]', async ({ page, app, loggedInAccount }) => {
    test.fail(true, 'DEF-10: dialogs are opened non-modally; focus stays on the trigger');
    void loggedInAccount;
    await app.header.goTo('account');
    await app.account.deleteButton.focus();
    await page.keyboard.press('Enter');
    await expect(app.account.deleteConfirm).toBeVisible();
    const focusInDialog = () =>
      page.evaluate(() => !!document.activeElement?.closest('dialog, [role="dialog"], [aria-modal="true"]'));
    await expect.poll(focusInDialog, { message: 'focus moved into the dialog' }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(app.account.deleteConfirm).toBeHidden();
    await expect(app.account.deleteButton).toBeFocused();
  });

  test('accessibility-030 error messages are announced to screen readers (4.1.3)', async ({ page, app, sharedAccount }) => {
    await app.start.openLogin();
    await app.login.login(sharedAccount.email, 'notTheCorrectPassword');
    const message = page.getByText(texts.sv.login.wrongCredentials);
    await expect(message).toBeVisible();
    const announced = await message.evaluate((el) => !!el.closest('[role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]'));
    expect(announced, 'wrong-password message inside a live region').toBe(true);
  });

  test('accessibility-031 registration can be started with the keyboard only (2.1.1)', async ({ page, app }) => {
    await app.register.open();
    await app.register.showNameAndEmailForm();
    const email = uniqueEmail();
    // The form can initialise again right after loading and wipe what was typed (OBS-07): retype until it sticks.
    await expect(async () => {
      await app.register.givenName.fill('');
      await app.register.givenName.focus();
      await page.keyboard.type('Test');
      await page.keyboard.press('Tab');
      await expect(app.register.surname).toBeFocused();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('Person');
      await page.keyboard.press('Tab');
      await expect(app.register.email).toBeFocused();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type(email);
      await expect(app.register.givenName).toHaveValue('Test', { timeout: 1_000 });
      await expect(app.register.email).toHaveValue(email, { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.keyboard.press('Enter');
    await expect(app.register.captchaImage).toBeVisible();
  });

  test('accessibility-032 the security-key name dialog puts focus on its input (2.4.3) [known defect DEF-10]', async ({ page, app, loggedInAccount }) => {
    test.fail(true, 'DEF-10: focus stays on the page body when the dialog opens');
    void loggedInAccount;
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addSecurityKey.focus();
    await page.keyboard.press('Enter');
    await expect(app.security.keyNameInput).toBeFocused();
  });

  test('accessibility-033 the page language (html lang) follows the language switch (3.1.1) [known defect DEF-16]', async ({ page, app }) => {
    test.fail(true, 'DEF-16: html lang is set from the browser language at load and does not change with the language switch');
    const pageLang = page.locator('html');
    await app.start.goto();
    await setLanguage(page, 'sv');
    await expect(pageLang).toHaveAttribute('lang', /^sv(-|$)/);
    await setLanguage(page, 'en');
    await expect(app.start.headline).toHaveText(texts.en.startPage.headline);
    await expect(pageLang).toHaveAttribute('lang', /^en(-|$)/);
  });
});
