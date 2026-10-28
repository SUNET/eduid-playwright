import { expect, Page } from '@playwright/test';
import { fillStable } from '../helpers/ui';

export class LoginPage {
  get username() { return this.page.locator('#username'); }
  get password() { return this.page.locator('#currentPassword'); }
  get submit() { return this.page.locator('#login-form-button'); }
  get showHidePassword() { return this.page.locator('#currentPassword-wrapper button'); }
  get forgotPassword() { return this.page.locator('#link-forgot-password'); }
  get otherDevice() { return this.page.locator('#login-other-device-button'); }
  get cancel() { return this.page.locator('#login-abort-button'); }
  get passkey() { return this.page.locator('#pass-key'); }
  get rememberMe() { return this.page.locator('#remember-me'); }
  get notYou() { return this.page.locator('#wrong-person-button'); }
  get mfaSecurityKey() { return this.page.locator('#mfa-security-key'); }

  constructor(private readonly page: Page) {}

  /** Login with username and password. If the username is pre-filled ("remember me") only the password is typed. */
  async login(username: string, password: string): Promise<void> {
    await this.submit.waitFor();
    if (await this.username.isEditable()) {
      await fillStable(this.username, username);
    }
    await fillStable(this.password, password);
    await this.submit.click();
  }

  /** Logs in and waits for the dashboard. Returns the unique ID (EPPN). */
  async loginToDashboard(username: string, password: string): Promise<string> {
    await this.login(username, password);
    // Login is a chain of backend redirects; under load dev sometimes needs more than the default 10 s.
    await expect(this.page).toHaveURL(/\/start/, { timeout: 30_000 });
    const eppn = this.page.locator('#user-eppn');
    await expect(eppn).not.toHaveValue('');
    return eppn.inputValue();
  }

  async setRememberMe(enabled: boolean): Promise<void> {
    // The toggle can be re-rendered just after the page loads (OBS-07); repeat until the state sticks.
    await expect(async () => {
      await this.rememberMe.setChecked(enabled, { force: true, timeout: 5_000 });
      await expect(this.rememberMe).toBeChecked({ checked: enabled, timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }
}
