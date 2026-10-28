import { Page } from '@playwright/test';

export class StartPage {
  get signUpButton() { return this.page.locator('#sign-up-button'); }
  get loginButton() { return this.page.locator('#login-button'); }
  get headline() { return this.page.locator('#eduid-splash-and-children h1'); }
  get footer() { return this.page.locator('#footer'); }
  get helpLink() { return this.page.locator('#footer a[href*="help"]'); }
  get appearanceToggle() { return this.page.locator('#color-mode'); }

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.loginButton.waitFor();
  }

  async openLogin(): Promise<void> {
    await this.goto();
    await this.loginButton.click();
    await this.page.locator('#login-form-button').waitFor();
  }

  async openRegister(): Promise<void> {
    await this.goto();
    await this.signUpButton.click();
    await this.page.locator('#register-with-name button').waitFor();
  }
}
