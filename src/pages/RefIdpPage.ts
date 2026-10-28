import { expect, Page } from '@playwright/test';
import { config } from '../config';
import { Person } from '../helpers/testdata';

/**
 * Sweden Connect reference IdP (ref-idp.sandbox.swedenconnect.se). With the magic
 * cookie, dev sends "Freja+" (and the Freja+ option in MFA / reset password) here
 * instead of the real Freja, so any test person can be authenticated.
 */
export class RefIdpPage {
  get advanced() { return this.page.locator('#advancedButton'); }
  get personalIdNumber() { return this.page.locator('#personalIdNumber'); }
  get givenName() { return this.page.locator('#givenName'); }
  get surname() { return this.page.locator('#surname'); }
  get submit() { return this.page.locator('#submitButton'); }

  constructor(private readonly page: Page) {}

  /** Authenticates as the given person and returns once the browser is back on eduID. */
  async authenticateAs(person: Person): Promise<void> {
    // The SAML redirect chain to the external IdP can take a while.
    await expect(this.advanced).toBeVisible({ timeout: 30_000 });
    await this.advanced.click();
    // The IdP enables its submit button from key events, so type instead of fill().
    await this.personalIdNumber.pressSequentially(person.identityNumber);
    await this.givenName.pressSequentially(person.givenName);
    await this.surname.pressSequentially(person.surName);
    await this.submit.click();
    // Wait for the app itself: the SAML endpoints on other eduID hosts (dashboard.…/services/…) are only hops.
    await this.page.waitForURL((url) => url.origin === new URL(config.baseUrl).origin, { timeout: 30_000 });
  }
}
