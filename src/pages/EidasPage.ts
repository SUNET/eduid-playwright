import { expect, Page } from '@playwright/test';
import { config } from '../config';
import { EidasPerson } from '../helpers/testdata';

/** eIDAS levels of assurance as the XA test IdP names its options. eduID requires Substantial or higher. */
export const LOA = { low: 'A', substantial: 'C', high: 'E' } as const;

/**
 * The eIDAS chain on dev: Sweden Connect country selection (con.sandbox.swedenconnect.se) →
 * XA test-country IdP, where the person and level of assurance are chosen → consent page.
 */
export class EidasPage {
  get testCountryXA() { return this.page.locator('#countryFlag_XA'); }
  // Native <select>s hidden behind bootstrap-select widgets.
  get personSelect() { return this.page.locator('#userSelect'); }
  get loaSelect() { return this.page.locator('#loaSelect'); }
  get submit() { return this.page.locator('#idpSubmitbutton'); }
  get consent() { return this.page.locator('#buttonNext'); }

  constructor(private readonly page: Page) {}

  /** Authenticates as the given XA person and returns once the browser is back on eduID. */
  async authenticateAs(person: EidasPerson, loa: keyof typeof LOA = 'substantial'): Promise<void> {
    // Three external services in a row; each hop can take a while.
    await expect(this.testCountryXA).toBeVisible({ timeout: 30_000 });
    await this.testCountryXA.click();
    await expect(this.submit).toBeVisible({ timeout: 30_000 });
    await this.personSelect.selectOption(person.id, { force: true });
    await this.loaSelect.selectOption(LOA[loa], { force: true });
    await this.submit.click();
    await expect(this.consent).toBeVisible({ timeout: 30_000 });
    await this.consent.click();
    // Wait for the app itself: the SAML endpoints on other eduID hosts (dashboard.…/services/…) are only hops.
    await this.page.waitForURL((url) => url.origin === new URL(config.baseUrl).origin, { timeout: 30_000 });
  }
}
