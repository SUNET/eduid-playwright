import { expect, Page } from '@playwright/test';
import { fillStable } from '../helpers/ui';

/**
 * The "suggested / custom password" form. The same component is used in
 * registration, change password (/chpass) and reset password.
 */
export class PasswordForm {
  get showForm() { return this.page.locator('#register-password button').first(); }
  get suggestedRadio() { return this.page.locator('#suggested-pw'); }
  get customRadio() { return this.page.locator('#custom-pw'); }
  get suggestedValue() { return this.page.locator('#copy-new-password'); }
  get repeatSuggested() { return this.page.locator('#newPassword'); }
  get saveSuggested() { return this.page.locator('#new-password-button'); }
  get customInput() { return this.page.locator('#custom'); }
  get repeatCustom() { return this.page.locator('#repeat'); }
  get saveCustom() { return this.page.locator('#chpass-button'); }
  get mismatchError() { return this.page.locator('#repeat-wrapper').getByRole('alert').or(this.page.locator('#repeat-wrapper span')); }

  constructor(private readonly page: Page) {}

  /** Registration hides the password form behind a "show form" toggle. */
  async expandIfCollapsed(): Promise<void> {
    await expect(this.suggestedRadio.or(this.showForm).first()).toBeVisible({ timeout: 20_000 });
    if ((await this.showForm.isVisible()) && /visa formulär|show form/i.test(await this.showForm.innerText())) {
      await this.showForm.click();
    }
    await expect(this.suggestedRadio).toBeVisible();
  }

  /** Accepts the generated password. Returns it. */
  async useSuggested(): Promise<string> {
    await this.expandIfCollapsed();
    await expect(this.suggestedValue).not.toHaveValue('');
    let password = await this.suggestedValue.inputValue();
    await fillStable(this.repeatSuggested, password);
    // About 1 save in 50 is lost while the form initialises again (OBS-07): the page stays on the
    // form with "Spara" enabled. Retry until the form is gone, re-reading the suggestion in case it changed.
    await expect(async () => {
      if (await this.saveSuggested.isVisible()) {
        password = await this.suggestedValue.inputValue();
        if ((await this.repeatSuggested.inputValue()).replace(/\s/g, '') !== password.replace(/\s/g, '')) {
          await this.repeatSuggested.fill(password);
        }
        await this.saveSuggested.click({ timeout: 2_000 });
      }
      await expect(this.saveSuggested).toBeHidden({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    return password;
  }

  async selectCustom(): Promise<void> {
    await this.expandIfCollapsed();
    // The radio input itself is visually hidden; click its label container.
    await this.customRadio.locator('xpath=..').click();
    await expect(this.customRadio).toBeChecked();
    await expect(this.customInput).toBeVisible();
  }

  async fillCustom(password: string, repeat = password): Promise<void> {
    await this.selectCustom();
    await fillStable(this.customInput, password);
    await fillStable(this.repeatCustom, repeat);
  }

  async useCustom(password: string): Promise<string> {
    await this.fillCustom(password);
    await expect(this.saveCustom).toBeEnabled();
    await this.saveCustom.click();
    return password;
  }
}
