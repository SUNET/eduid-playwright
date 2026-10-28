import { Browser, BrowserContextOptions, Page, test as base, expect } from '@playwright/test';
import { config } from './config';
import { texts } from './i18n';
import { addMagicCookie, addNinCookie } from './helpers/codes';
import { errorNotification, setLanguage } from './helpers/ui';
import { VirtualAuthenticator } from './helpers/webauthn';
import { Account, EidasPerson, Person } from './helpers/testdata';
import { Header } from './pages/Header';
import { LoginPage } from './pages/LoginPage';
import { PasswordForm } from './pages/PasswordForm';
import { AccountPage, DashboardPage, IdentityPage, ResetPasswordPage, SecurityPage } from './pages/ProfilePages';
import { EidasPage } from './pages/EidasPage';
import { OtherDevicePage } from './pages/OtherDevicePage';
import { RefIdpPage } from './pages/RefIdpPage';
import { RegisterPage } from './pages/RegisterPage';
import { StartPage } from './pages/StartPage';

export class App {
  readonly start: StartPage;
  readonly login: LoginPage;
  readonly register: RegisterPage;
  readonly header: Header;
  readonly dashboard: DashboardPage;
  readonly account: AccountPage;
  readonly identity: IdentityPage;
  readonly security: SecurityPage;
  readonly password: PasswordForm;
  readonly resetPassword: ResetPasswordPage;
  readonly refIdp: RefIdpPage;
  readonly eidas: EidasPage;
  readonly otherDevice: OtherDevicePage;

  constructor(page: Page) {
    this.start = new StartPage(page);
    this.login = new LoginPage(page);
    this.register = new RegisterPage(page);
    this.header = new Header(page);
    this.dashboard = new DashboardPage(page);
    this.account = new AccountPage(page);
    this.identity = new IdentityPage(page);
    this.security = new SecurityPage(page);
    this.password = new PasswordForm(page);
    this.resetPassword = new ResetPasswordPage(page);
    this.refIdp = new RefIdpPage(page);
    this.eidas = new EidasPage(page);
    this.otherDevice = new OtherDevicePage(page);
  }
}

/**
 * Registers a new e-mail/password account in a throw-away context, so the
 * test's own page starts clean, then logs in once to learn its EPPN.
 */
async function registerInIsolation(browser: Browser, options: { verifyIdentity?: boolean } = {}): Promise<Account> {
  const context = await browser.newContext({ baseURL: config.baseUrl, locale: 'sv-SE' });
  try {
    await addMagicCookie(context);
    const page = await context.newPage();
    const account = await new RegisterPage(page).registerWithEmail();
    account.eppn = await new LoginPage(page).loginToDashboard(account.email, account.password);
    if (options.verifyIdentity) await verifyIdentityWithFreja(page, account);
    return account;
  } finally {
    await context.close();
  }
}

/**
 * Verifies the logged-in account's identity with Freja+ through the reference IdP.
 * The `nin` cookie must name the same number that is typed at the IdP; without it
 * dev answers "Felaktigt format av identitetsnumret" (freja-007).
 */
export async function verifyIdentityWithFreja(page: Page, person: Person): Promise<void> {
  const app = new App(page);
  await addNinCookie(page.context(), person.identityNumber);
  await page.goto('/identity');
  await app.identity.startFrejaVerification();
  await app.refIdp.authenticateAs(person);
  // This often runs inside a fixture's own context, which leaves no screenshot: surface dev's message instead.
  await expect(app.identity.removeVerifiedNin.or(errorNotification(page))).toBeVisible({ timeout: 30_000 });
  if (!(await app.identity.removeVerifiedNin.isVisible())) {
    throw new Error(`Freja+ verification failed: ${await errorNotification(page).first().innerText()}`);
  }
}

/**
 * Opens a fresh browser context (no remembered user) carrying a copy of the given key,
 * the way a user would log in on another computer with the same USB key.
 */
export async function freshBrowserWithKey(browser: Browser, key: VirtualAuthenticator | null, transport: 'usb' | 'internal' = 'usb') {
  const { context, page, app } = await freshBrowser(browser);
  const authenticator = await VirtualAuthenticator.attach(page, transport);
  if (key) await authenticator.importCredentials(await key.credentials());
  return { context, page, app, authenticator };
}

/** A second, independent browser (own cookies and session) with the magic cookie, e.g. for a second account. */
export async function freshBrowser(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ baseURL: config.baseUrl, locale: 'sv-SE', ...options });
  await addMagicCookie(context);
  const page = await context.newPage();
  return { context, page, app: new App(page) };
}

/** Verifies the logged-in account's identity with eIDAS (test country XA, level Substantial). */
export async function verifyIdentityWithEidas(page: Page, person: EidasPerson): Promise<void> {
  const app = new App(page);
  await page.goto('/identity');
  await app.identity.startEidasVerification();
  await app.eidas.authenticateAs(person);
  await expect(app.identity.removeVerifiedEidas.or(errorNotification(page))).toBeVisible({ timeout: 30_000 });
  if (!(await app.identity.removeVerifiedEidas.isVisible())) {
    throw new Error(`eIDAS verification failed: ${await errorNotification(page).first().innerText()}`);
  }
}

/** Clicks Freja+ for a security key, passes the step-up (re-login with the key) and authenticates at the reference IdP. */
export async function verifyKeyWithFreja(page: Page, person: Person, startVerification: () => Promise<void>): Promise<void> {
  const app = new App(page);
  await addNinCookie(page.context(), person.identityNumber);
  await startVerification();
  // Right after a login with the key dev goes straight to the IdP; otherwise it asks for a step-up first.
  await expect(app.security.securityConfirmAccept.or(app.refIdp.advanced)).toBeVisible({ timeout: 30_000 });
  if (await app.security.securityConfirmAccept.isVisible()) {
    await app.security.securityConfirmAccept.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.security.reauthHeading);
    await app.login.mfaSecurityKey.click();
  }
  await app.refIdp.authenticateAs(person);
  await expect(page).toHaveTitle(texts.sv.titles.security);
}

type TestFixtures = {
  /** Set the "autotests" magic cookie on the test context (default true). Turn off with test.use({ magicCookie: false }). */
  magicCookie: boolean;
  app: App;
  /** A brand-new account owned by this test only. Use it for anything that changes account state. */
  account: Account;
  /** Like `account`, but already logged in on `page` (dashboard shown) and with `eppn` filled in. */
  loggedInAccount: Account;
  /**
   * A brand-new account whose identity is verified with Freja+ (reference IdP), with `eppn`.
   * Like `account`, the test page is not logged in; call `app.login.loginToDashboard()`.
   */
  verifiedAccount: Account;
};

type WorkerFixtures = {
  /** One account per worker for read-only tests (labels, navigation). Never change its state. */
  sharedAccount: Account;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  magicCookie: [true, { option: true }],

  context: async ({ context, magicCookie }, use, testInfo) => {
    if (magicCookie) await addMagicCookie(context);
    // dev sometimes answers HTTP 500 (OBS-18). Record which request failed, so a red test says why.
    const serverErrors: string[] = [];
    context.on('response', (response) => {
      if (response.status() >= 500 && /eduid\.se/.test(response.url())) {
        serverErrors.push(`${new Date().toISOString()} ${response.status()} ${response.request().method()} ${response.url().split('?')[0]}`);
      }
    });
    await use(context);
    if (serverErrors.length) {
      testInfo.annotations.push({ type: 'server-error', description: serverErrors.join('\n') });
      await testInfo.attach('server-errors.txt', { body: serverErrors.join('\n'), contentType: 'text/plain' });
    }
  },

  app: async ({ page }, use) => {
    await use(new App(page));
  },

  account: async ({ browser }, use) => {
    await use(await registerInIsolation(browser));
  },

  verifiedAccount: async ({ browser }, use) => {
    await use(await registerInIsolation(browser, { verifyIdentity: true }));
  },

  loggedInAccount: async ({ account, app, page }, use) => {
    await app.start.openLogin();
    account.eppn = await app.login.loginToDashboard(account.email, account.password);
    await setLanguage(page, 'sv');
    await use(account);
  },

  sharedAccount: [
    async ({ browser }, use) => {
      await use(await registerInIsolation(browser));
    },
    { scope: 'worker', timeout: 120_000 },
  ],
});

export { expect };
