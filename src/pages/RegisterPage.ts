import { expect, Page } from '@playwright/test';
import { codes } from '../helpers/codes';
import { Account, Person, randomPerson, uniqueEmail } from '../helpers/testdata';
import { enterSixDigitCode, fillStable } from '../helpers/ui';
import { PasswordForm } from './PasswordForm';
import { StartPage } from './StartPage';

/** The CAPTCHA value the backend accepts when the magic cookie is set. */
export const MAGIC_CAPTCHA = '123456';

export class RegisterPage {
  get expandForm() { return this.page.locator('#register-with-name button').first(); }
  get givenName() { return this.page.locator('#given_name'); }
  get surname() { return this.page.locator('#surname'); }
  get email() { return this.page.locator('#email'); }
  get submit() { return this.page.locator('#register-button'); }
  get captchaInput() { return this.page.locator('#value'); }
  get captchaContinue() { return this.page.locator('#captcha-continue-button'); }
  get captchaCancel() { return this.page.locator('#cancel-captcha-button'); }
  get captchaImage() { return this.page.getByRole('img', { name: 'captcha' }); }
  get acceptTerms() { return this.page.locator('#accept-button'); }
  get cancelTerms() { return this.page.locator('#cancel-button'); }
  get codeAbort() { return this.page.locator('#response-code-abort-button'); }
  get finished() { return this.page.locator('#finished-button'); }
  /** Sign-in method step: add a passkey on this device, or an external (USB) security key. */
  get addPasskey() { return this.page.locator('#security-webauthn-platform-button'); }
  get addSecurityKey() { return this.page.locator('#security-webauthn-button'); }
  /** "Slutför skapandet av eduID": only offered when the registered key works without a password (a passkey). */
  get finishSignup() { return this.page.locator('#finish-signup'); }
  get shownEmail() { return this.page.locator('#user-email'); }
  get shownPassword() { return this.page.locator('#user-password'); }
  get stepIndicator() { return this.page.locator('section.step-indicator > div'); }
  readonly password: PasswordForm;

  constructor(private readonly page: Page) {
    this.password = new PasswordForm(page);
  }

  async open(): Promise<void> {
    await new StartPage(this.page).openRegister();
  }

  /** The toggle remembers its state within a session, so decide from its label, not from field visibility. */
  async showNameAndEmailForm(): Promise<void> {
    await expect(this.expandForm).toBeVisible();
    if (/visa formulär|show form/i.test(await this.expandForm.innerText())) {
      await this.expandForm.click();
    }
    await expect(this.givenName).toBeVisible();
  }

  async fillNameAndEmail(person: Pick<Person, 'givenName' | 'surName'>, email: string): Promise<void> {
    await this.showNameAndEmailForm();
    await fillStable(this.givenName, person.givenName);
    await fillStable(this.surname, person.surName);
    await fillStable(this.email, email);
  }

  async submitNameAndEmail(person: Pick<Person, 'givenName' | 'surName'>, email: string): Promise<void> {
    await this.fillNameAndEmail(person, email);
    await expect(this.submit).toBeEnabled();
    await this.submit.click();
  }

  async solveCaptcha(code = MAGIC_CAPTCHA): Promise<void> {
    // An answer sent before the CAPTCHA has been fetched is refused with "CAPTCHA har inte begärts",
    // so wait until the image has loaded.
    await expect
      .poll(() => this.captchaImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 15_000 })
      .toBe(true);
    await fillStable(this.captchaInput, code);
    await this.captchaContinue.click();
  }

  async verifyEmailCode(email: string): Promise<void> {
    await expect(this.page.locator('[id="v[0]"]')).toBeVisible();
    const code = await codes.signup(this.page.context(), email);
    await enterSixDigitCode(this.page, code);
  }

  /** Name + e-mail → CAPTCHA → terms → e-mail code. Ends on the "add sign-in method" step. */
  async startEmailRegistration(person: Person = randomPerson(), email: string = uniqueEmail()): Promise<{ person: Person; email: string }> {
    await this.open();
    await this.submitNameAndEmail(person, email);
    await this.solveCaptcha();
    await this.acceptTerms.click();
    await this.verifyEmailCode(email);
    return { person, email };
  }

  /**
   * Full e-mail based registration: name+email → CAPTCHA → terms → email code
   * → password → completed page. Requires the magic cookie on the context.
   * Ends on the login page.
   */
  async registerWithEmail(options: { person?: Person; email?: string; customPassword?: string } = {}): Promise<Account> {
    const person = options.person ?? randomPerson();
    const email = options.email ?? uniqueEmail();

    await this.startEmailRegistration(person, email);
    const password = options.customPassword
      ? await this.password.useCustom(options.customPassword)
      : await this.password.useSuggested();

    await expect(this.finished).toBeVisible();
    await expect(this.shownEmail).toHaveText(email);
    await this.finished.click();
    await expect(this.page.locator('#login-form-button')).toBeVisible();

    return { ...person, email, password };
  }
}
