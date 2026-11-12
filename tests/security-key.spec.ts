import { freshBrowser, freshBrowserWithKey, test, expect, verifyKeyWithFreja } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { VirtualAuthenticator } from '../src/helpers/webauthn';
import { fillStable, setLanguage } from '../src/helpers/ui';
import { randomPerson, uniqueEmail } from '../src/helpers/testdata';

// WebAuthn emulation uses the Chrome DevTools Protocol.
test.skip(({ browserName }) => browserName !== 'chromium', 'virtual authenticator needs Chromium');

test.describe('Security page', () => {
  for (const lang of LANGS) {
    test(`security-key-001 security page texts for an account without keys (${lang})`, async ({ page, app, sharedAccount }) => {
      const t = texts[lang];
      await app.start.openLogin();
      await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
      await setLanguage(page, lang);
      await app.header.goTo('security');
      await expect(page.getByRole('heading', { name: t.security.addMfa })).toBeVisible();
      await expect(page.getByRole('heading', { name: t.security.manageKeys })).toBeVisible();
      await expect(app.security.addSecurityKey).toHaveText(new RegExp(t.security.securityKey, 'i'));
      await expect(app.security.addThisDevice).toHaveText(new RegExp(t.security.thisDevice, 'i'));
      await expect(app.security.keysSection).toContainText(t.security.noKeys);
      await setLanguage(page, 'sv');
    });
  }
});

test.describe('Security keys and MFA', () => {
  test('security-key-002 add a security key; it is listed with verify options and the dashboard shows enhanced security', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    const authenticator = await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');

    await app.security.addSecurityKey.click();
    await expect(page.getByText(texts.sv.security.nameKeyHeading)).toBeVisible();
    await expect(page.getByText(/max 50 tecken/)).toBeVisible();
    await app.security.addKey('pw-key-1', { dialogAlreadyOpen: true });
    expect(await authenticator.credentialCount()).toBe(1);
    await expect(app.security.keysSection).toContainText(/BankID/i);
    await expect(app.security.alwaysUseKeyToggle).toBeChecked();

    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.enhancedSecurity);
  });

  test('security-key-003 after adding a key, login requires the second factor and succeeds with the key @smoke', async ({ page, app, browser, loggedInAccount }) => {
    const key = await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-mfa');

    const other = await freshBrowserWithKey(browser, key);
    await other.app.start.openLogin();
    await other.app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(other.page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.mfaHeading);
    await expect(other.page).not.toHaveURL(/\/start/);
    await other.app.login.mfaSecurityKey.click();
    await expect(other.page).toHaveURL(/\/start/);
    await other.context.close();
  });

  test('security-key-004 MFA cannot be completed without the registered authenticator @security', async ({ page, app, browser, loggedInAccount }) => {
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-lost');

    // Another computer with a different (empty) authenticator — i.e. the key is lost.
    const other = await freshBrowserWithKey(browser, null);
    await other.app.start.openLogin();
    await other.app.login.login(loggedInAccount.email, loggedInAccount.password);
    await other.app.login.mfaSecurityKey.click();
    await other.page.waitForTimeout(3_000); // give a (wrongly) successful assertion time to redirect
    await expect(other.page).not.toHaveURL(/\/start/);
    await other.context.close();
  });

  test('security-key-005 with "always use security key" off, login only needs the password', async ({ page, app, browser, loggedInAccount }) => {
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-optional');

    // Changing the preference is a step-up action: confirm, re-authenticate with the key, come back.
    await page.locator('label[for="security-key-mfa"] .toggle-switch').click();
    await page.locator('#security-confirm-modal-accept-button').click();
    await app.login.mfaSecurityKey.click();
    await expect(page).toHaveTitle(texts.sv.titles.security);
    if (await app.security.alwaysUseKeyToggle.isChecked()) {
      await page.locator('label[for="security-key-mfa"] .toggle-switch').click();
    }
    await expect(app.security.alwaysUseKeyToggle).not.toBeChecked();
    await page.reload();
    await expect(app.security.alwaysUseKeyToggle).not.toBeChecked();

    const other = await freshBrowserWithKey(browser, null);
    await other.app.start.openLogin();
    await other.app.login.login(loggedInAccount.email, loggedInAccount.password);
    await expect(other.page).toHaveURL(/\/start/);
    await other.context.close();
  });

  test('security-key-006 a security key can be removed (re-authentication with the key)', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await VirtualAuthenticator.attach(page);
    await app.header.goTo('security');
    await app.security.addKey('pw-key-remove');
    await app.security.removeKey.click();

    // Removing a credential is a sensitive action: either it happens directly (fresh login)
    // or a "security check" dialog sends the user to re-authenticate with the key.
    const accept = page.locator('#security-confirm-modal-accept-button');
    const reauth = await accept.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    if (reauth) {
      await accept.click();
      await app.login.mfaSecurityKey.click();
    }
    await expect(app.security.keysSection).toContainText(texts.sv.security.noKeys, { timeout: 20_000 });
  });
});

test.describe('Registration with a passkey', () => {
  test('security-key-007 register with a built-in passkey instead of a password and log in with the passkey @mobile', async ({ page, app }) => {
    const authenticator = await VirtualAuthenticator.attach(page, 'internal');
    const email = uniqueEmail();
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), email);
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();
    await app.register.verifyEmailCode(email);

    await page.locator('#security-webauthn-platform-button').click();
    await app.security.keyNameInput.fill('pw-passkey');
    await app.security.keyNameSubmit.click();
    await page.locator('#finish-signup').click();
    await expect(app.register.finished).toBeVisible();
    await expect(app.register.shownEmail).toHaveText(email);
    expect(await authenticator.credentialCount()).toBe(1);
    await app.register.finished.click();
    // Unlike password registration, a passkey registration lands the user logged in on the dashboard.
    await expect(page).toHaveURL(/\/start/);

    // Log in on "another visit" with only the passkey (discoverable credential, no username typed).
    const other = await freshBrowserWithKey(page.context().browser()!, authenticator, 'internal');
    await other.app.start.goto();
    await other.app.start.loginButton.click();
    // The login page starts a conditional-UI (autofill) passkey request; the virtual authenticator
    // approves it at once, so the user may be logged in before the button can be clicked.
    await expect(other.page.locator('#pass-key').or(other.page.locator('#user-eppn')).first()).toBeAttached();
    if (await other.app.login.passkey.isVisible()) {
      // The autofill may still finish first and navigate away while we click; that is a success too.
      await other.app.login.passkey.click({ timeout: 5_000 }).catch(() => undefined);
    }
    await expect(other.page).toHaveURL(/\/start/, { timeout: 30_000 }); // same login budget as loginToDashboard
    await expect(other.page.locator('#header')).toContainText(email);
    await other.context.close();
  });
});

test.describe('Security key in registration', () => {
  for (const lang of LANGS) {
    test(`security-key-008 sign-in method step offers passkey, security key and password (${lang})`, async ({ page, app }) => {
      const t = texts[lang];
      await app.register.startEmailRegistration();
      await setLanguage(page, lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.register.methodHeading);
      await expect(page.getByText(t.register.methodIntro)).toBeVisible();
      await expect(app.register.addPasskey).toContainText(new RegExp(t.security.thisDevice, 'i'));
      await expect(app.register.addSecurityKey).toContainText(new RegExp(t.security.securityKey, 'i'));
      await expect(app.password.showForm).toBeVisible();
      await expect(app.register.finishSignup).toHaveCount(0);
      await setLanguage(page, 'sv');
    });
  }

  test('security-key-009 register with a USB security key: a password is required too; login needs the key; the key is verified with Freja+ afterwards', async ({ page, app }) => {
    const key = await VirtualAuthenticator.attach(page);
    const { person, email } = await app.register.startEmailRegistration();
    await app.register.addSecurityKey.click();
    await fillStable(app.security.keyNameInput, 'pw-reg-usb');
    await app.security.keyNameSubmit.click();

    const t = texts.sv.register;
    await expect(page.getByText(t.keyNeedsPassword)).toBeVisible();
    await expect(page.locator('figure', { hasText: t.registeredKey })).toContainText('pw-reg-usb');
    await expect(page.getByText(t.passwordRequired)).toBeVisible();
    await expect(app.register.finishSignup).toHaveCount(0); // cannot finish without a password
    expect(await key.credentialCount()).toBe(1);

    const password = await app.password.useSuggested();
    await expect(app.register.finished).toBeVisible();
    await expect(app.register.shownEmail).toHaveText(email);
    await app.register.finished.click();

    await app.login.login(email, password);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.mfaHeading);
    await app.login.mfaSecurityKey.click();
    await expect(page).toHaveURL(/\/start/, { timeout: 30_000 });
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.enhancedSecurity);

    await app.header.goTo('security');
    await verifyKeyWithFreja(page, person, () =>
      app.security.keyRow('pw-reg-usb').getByRole('button', { name: 'Freja+', exact: true }).click(),
    );
    await expect(app.security.keyRow('pw-reg-usb')).toContainText(texts.sv.security.keyVerified);
    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
  });

  test('security-key-010 register with only a passkey (no password); the passkey is verified with Freja+ afterwards', async ({ page, app }) => {
    const passkey = await VirtualAuthenticator.attach(page, 'internal');
    const { person, email } = await app.register.startEmailRegistration();
    await app.register.addPasskey.click();
    await fillStable(app.security.keyNameInput, 'pw-reg-passkey');
    await app.security.keyNameSubmit.click();

    const t = texts.sv.register;
    await expect(page.locator('figure', { hasText: t.registeredKey })).toContainText('pw-reg-passkey');
    await expect(page.getByText(t.passwordOptional)).toBeVisible();
    await expect(app.register.finishSignup).toHaveText(new RegExp(t.finishSignup, 'i'));
    expect(await passkey.credentialCount()).toBe(1);
    await app.register.finishSignup.click();
    await expect(app.register.finished).toBeVisible();
    await expect(app.register.shownEmail).toHaveText(email);
    await expect(app.register.shownPassword).toHaveCount(0); // no password was created
    await app.register.finished.click();
    await expect(page).toHaveURL(/\/start/, { timeout: 30_000 });

    await app.header.goTo('security');
    await verifyKeyWithFreja(page, person, () =>
      app.security.keyRow('pw-reg-passkey').getByRole('button', { name: 'Freja+', exact: true }).click(),
    );
    await expect(app.security.keyRow('pw-reg-passkey')).toContainText(texts.sv.security.keyVerified);
    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
  });

  test('security-key-011 register with a passkey and a password: the password works, and the passkey stays the second factor', async ({ page, app, browser }) => {
    await VirtualAuthenticator.attach(page, 'internal');
    const { email } = await app.register.startEmailRegistration();
    await app.register.addPasskey.click();
    await fillStable(app.security.keyNameInput, 'pw-reg-passkey-pw');
    await app.security.keyNameSubmit.click();
    await expect(page.locator('figure', { hasText: texts.sv.register.registeredKey })).toContainText('pw-reg-passkey-pw');

    const password = await app.password.useSuggested();
    await expect(app.register.finished).toBeVisible();
    await expect(app.register.shownEmail).toHaveText(email);
    // Unlike a password-only registration, this page does not repeat the password (OBS-15).
    await app.register.finished.click();

    // Another computer without the passkey: the password is accepted, then the second factor is required.
    const other = await freshBrowser(browser);
    await other.app.start.openLogin();
    await other.app.login.login(email, password);
    await expect(other.page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.mfaHeading);
    await expect(other.page).not.toHaveURL(/\/start/);
    await other.context.close();
  });
});

test.describe('Security key registration prompt', () => {
  test('security-key-012 leaving the security page while the key prompt is open cancels the registration', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    // Record the abort signal that the app passes to navigator.credentials.create(). The fixture has already
    // loaded the dashboard, so install the recorder in the current page as well as in later ones.
    const recordCreateSignals = () => {
      const w = window as unknown as { __createSignals: Array<AbortSignal | undefined> };
      w.__createSignals = [];
      const create = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = (options) => {
        w.__createSignals.push(options?.signal ?? undefined);
        return create(options);
      };
    };
    await page.addInitScript(recordCreateSignals);
    await page.evaluate(recordCreateSignals);
    const aborted = () =>
      page.evaluate(() =>
        (window as unknown as { __createSignals: Array<AbortSignal | undefined> }).__createSignals.map((s) => s?.aborted),
      );

    // A key that never answers: the browser prompt stays open until the app cancels it.
    const authenticator = await VirtualAuthenticator.attach(page, 'usb', false, false);
    await app.header.goTo('security');
    await app.security.addSecurityKey.click();
    await fillStable(app.security.keyNameInput, 'pw-key-cancel');
    await app.security.keyNameSubmit.click();
    await expect.poll(aborted).toEqual([false]);

    await app.header.goTo('start');
    await expect.poll(aborted).toEqual([true]);

    await app.header.goTo('security');
    await expect(app.security.keysSection).toContainText(texts.sv.security.noKeys);
    expect(await authenticator.credentialCount()).toBe(0);
  });

  test('security-key-013 leaving the security page while the challenge is requested does not open the key prompt', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    // Record calls to navigator.credentials.create(); the fixture has already loaded the dashboard.
    const recordCreateCalls = () => {
      const w = window as unknown as { __createCalls: number };
      w.__createCalls = 0;
      const create = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = (options) => {
        w.__createCalls++;
        return create(options);
      };
    };
    await page.addInitScript(recordCreateCalls);
    await page.evaluate(recordCreateCalls);
    const createCalls = () => page.evaluate(() => (window as unknown as { __createCalls: number }).__createCalls);

    // Hold back the answer to the registration challenge request until the page has been left.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/webauthn/register/begin', async (route) => {
      await gate;
      await route.continue();
    });

    await VirtualAuthenticator.attach(page, 'usb', false, false);
    await app.header.goTo('security');
    await app.security.addSecurityKey.click();
    await fillStable(app.security.keyNameInput, 'pw-key-early-exit');
    await app.security.keyNameSubmit.click();
    await app.header.goTo('start');

    const answered = page.waitForResponse(/\/webauthn\/register\/begin/);
    release();
    await answered;
    // Deliberate wait window for a negative check: a prompt would be started right after the answer arrives.
    await page.waitForTimeout(1_000);
    expect(await createCalls()).toBe(0);
  });
});
