import { expect, Page } from '@playwright/test';
import { chooseOtherAuthOption, fillStable } from '../helpers/ui';

export class DashboardPage {
  get welcomeHeading() { return this.page.locator('#eduid-splash-and-children h1'); }
  get eppn() { return this.page.locator('#user-eppn'); }
  get copyEppn() { return this.page.locator('#uniqueId-container button'); }
  get statusOverview() { return this.page.locator('#status-overview'); }

  constructor(private readonly page: Page) {}
}

export class AccountPage {
  get emailSection() { return this.page.locator('#add-email-addresses'); }
  get addMoreEmails() { return this.page.locator('#emails-add-more-button'); }
  get newEmailInput() { return this.page.locator('#add-email-addresses #email'); }
  get addEmailButton() { return this.page.locator('#add-email'); }
  get cancelAddEmail() { return this.page.locator('#cancel-adding-email'); }
  get emailCodeInput() { return this.page.locator('#email-confirm-modal'); }
  get emailCodeSubmit() { return this.page.locator('#email-confirm-modal-form button.primary'); }
  get languageSwedish() { return this.page.locator('#Svenska'); }
  get languageEnglish() { return this.page.locator('#English'); }
  get changePasswordButton() { return this.page.locator('#security-change-button'); }
  get deleteButton() { return this.page.locator('#delete-button'); }
  get deleteConfirm() { return this.page.locator('#delete-account-modal-accept-button'); }
  get deleteClose() { return this.page.locator('#delete-account-modal-close-button'); }

  constructor(private readonly page: Page) {}

  emailRow(email: string) {
    return this.emailSection.locator('tr', { hasText: email });
  }

  async addEmail(email: string): Promise<void> {
    await this.addMoreEmails.click();
    await fillStable(this.newEmailInput, email);
    await this.addEmailButton.click();
  }

  async openConfirmEmail(email: string): Promise<void> {
    await this.emailRow(email).getByRole('button', { name: /bekräfta|confirm/i }).click();
    await expect(this.emailCodeInput).toBeVisible();
  }

  async submitEmailCode(code: string): Promise<void> {
    await fillStable(this.emailCodeInput, code);
    await this.emailCodeSubmit.click();
  }

  async removeEmail(email: string): Promise<void> {
    await this.emailRow(email).locator('button.remove').click();
    await expect(this.emailRow(email)).toHaveCount(0);
  }

  async makePrimary(email: string): Promise<void> {
    await this.emailRow(email).getByRole('button', { name: /gör primär|make primary/i }).click();
  }
}

export class IdentityPage {
  get changeNames() { return this.page.locator('#personal-data .heading button, #personal-data button').first(); }
  get givenNameInput() { return this.page.locator('#personal-data #given_name'); }
  get surnameInput() { return this.page.locator('#personal-data #surname'); }
  get saveNames() { return this.page.locator('#personal-data-button'); }
  get shownGivenName() { return this.page.locator('[id="first name"]'); }
  get shownSurname() { return this.page.locator('[id="last name"]'); }
  get swedishOption() { return this.page.locator('#swedish-button'); }
  get letterOption() { return this.page.locator('#se-letter-button'); }
  get ninInput() { return this.page.locator('#nin'); }
  get addNin() { return this.page.locator('#add-nin-button'); }
  get letterProceed() { return this.page.locator('#se-letter button.primary, #se-letter div > button').first(); }
  get letterCodeInput() { return this.page.locator('input#letter-confirm-modal'); } // the id is duplicated in the DOM (OBS-05)
  get letterCodeSubmit() { return this.page.locator('#letter-confirm-modal-form button.primary'); }
  get frejaOption() { return this.page.locator('#se-freja-button'); }
  get frejaProceed() { return this.page.locator('#se-freja button.primary'); }
  get frejaInfoModal() { return this.page.locator('#eidas-info-modal'); }
  get frejaInfoAccept() { return this.page.locator('#eidas-info-modal-accept-button'); }
  get frejaInfoClose() { return this.page.locator('#eidas-info-modal-close-button'); }
  get euOption() { return this.page.locator('#eu-button'); }
  get euProceed() { return this.page.locator('#eu button.primary'); }
  get worldOption() { return this.page.locator('#world-button'); }
  get worldProceed() { return this.page.locator('#world button.primary'); }
  /** First of the ways to verify an identity; only offered while the account has no verified identity. */
  get verifyOptions() { return this.page.locator('#swedish-button'); }
  /** The verified national ID (masked) with its "show" and "remove" buttons. */
  get verifiedNin() { return this.page.locator('figure', { has: this.page.locator('#remove-identity-nin') }); }
  get showVerifiedNin() { return this.verifiedNin.locator('#show-hide-button'); }
  get removeVerifiedNin() { return this.page.locator('#remove-identity-nin'); }
  /** The verified eIDAS identity ("XA <date of birth>") with its remove button. */
  get verifiedEidas() { return this.page.locator('figure', { has: this.page.locator('#remove-identity-eidas') }); }
  get removeVerifiedEidas() { return this.page.locator('#remove-identity-eidas'); }
  get removeIdentityDialog() { return this.page.locator('#remove-identity-verification'); }
  get removeIdentityConfirm() { return this.page.locator('#remove-identity-verification-accept-button'); }
  get removeIdentityClose() { return this.page.locator('#remove-identity-verification-close-button'); }

  constructor(private readonly page: Page) {}

  /** Opens EU citizen → Fortsätt; the browser then goes to the eIDAS country selection. */
  async startEidasVerification(): Promise<void> {
    await this.euOption.click();
    await this.euProceed.click();
  }

  /** Opens Swedish ID → Freja+ and accepts the info dialog; the browser then goes to the reference IdP. */
  async startFrejaVerification(): Promise<void> {
    await this.page.locator('#swedish-button').click();
    await this.frejaOption.click();
    await this.frejaProceed.click();
    await this.frejaInfoAccept.click();
  }

  async updateNames(givenName: string, surName: string): Promise<void> {
    await this.changeNames.click();
    await fillStable(this.givenNameInput, givenName);
    await fillStable(this.surnameInput, surName);
    await this.saveNames.click();
    await expect(this.shownGivenName).toHaveText(givenName);
    await expect(this.shownSurname).toHaveText(surName);
  }
}

export class SecurityPage {
  get addSecurityKey() { return this.page.locator('#security-webauthn-button'); }
  get addThisDevice() { return this.page.locator('#security-webauthn-platform-button'); }
  get keyNameInput() { return this.page.locator('#describe-webauthn-token-modal'); }
  get keyNameSubmit() { return this.page.locator('#describe-webauthn-token-modal-form button'); }
  get verifyModalNotNow() { return this.page.locator('#verify-webauthn-token-modal-close-link'); }
  get removeKey() { return this.page.locator('#remove-webauthn'); }
  get alwaysUseKeyToggle() { return this.page.locator('#security-key-mfa'); }
  get keysSection() { return this.page.locator('#manage-security-keys'); }
  get verifyWithFrejaInDialog() { return this.page.locator('#verify-webauthn-token-modal-continue-frejaID-button'); }
  get verifyWithFrejaEidInDialog() { return this.page.locator('#verify-webauthn-token-modal-continue-frejaeid-button'); }
  get verifyWithEidasInDialog() { return this.page.locator('#verify-webauthn-token-modal-continue-eidas-button'); }
  get securityConfirmAccept() { return this.page.locator('#security-confirm-modal-accept-button'); }

  constructor(private readonly page: Page) {}

  /** The listed key with this name: its status and "verify with" buttons. */
  keyRow(name: string) {
    return this.keysSection.locator('figure', { hasText: name });
  }

  /** Registers a security key (needs a VirtualAuthenticator on the page) and dismisses the "verify now" dialog. */
  async addKey(name: string, options: { dialogAlreadyOpen?: boolean } = {}): Promise<void> {
    if (!options.dialogAlreadyOpen) await this.addSecurityKey.click();
    await fillStable(this.keyNameInput, name);
    await this.keyNameSubmit.click();
    // The <dialog> itself has zero height (content is in a fixed child), so anchor on its button.
    await expect(this.verifyModalNotNow).toBeVisible();
    await this.verifyModalNotNow.click();
    await expect(this.verifyModalNotNow).toBeHidden();
    await expect(this.keysSection).toContainText(name);
  }
}

export class ResetPasswordPage {
  get emailInput() { return this.page.locator('#reset-password-form #email'); }
  get sendEmail() { return this.page.locator('#reset-password-button'); }
  get cancel() { return this.page.locator('#reset-password-form #cancel-button'); }
  get enterCodeLink() { return this.page.locator('#reset-password-enter-code'); }
  get continueWithoutSecurity() { return this.page.locator('#continue-without-security'); }
  get finished() { return this.page.locator('#reset-password-finished'); }
  get useSecurityKey() { return this.page.locator('#mfa-security-key'); }

  constructor(private readonly page: Page) {}

  /** Picks an extra-security method from "Show other options", e.g. 'Freja+' or 'eIDAS'. */
  async chooseOtherOption(name: string): Promise<void> {
    await chooseOtherAuthOption(this.page, name);
  }
}
