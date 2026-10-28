import { CDPSession, Page } from '@playwright/test';

/**
 * A CDP virtual authenticator (Chromium only). Replaces the Selenium
 * VirtualAuthenticator/executeCdpCommand code of the Java suite. Presence and
 * user verification are auto-approved, so WebAuthn ceremonies complete without UI.
 */
export class VirtualAuthenticator {
  private constructor(
    private readonly cdp: CDPSession,
    readonly authenticatorId: string,
  ) {}

  /**
   * @param residentKey true = discoverable credential (a passkey, usable without username/password);
   *                    false = classic second-factor security key.
   */
  static async attach(
    page: Page,
    transport: 'usb' | 'internal' = 'usb',
    residentKey = transport === 'internal',
  ): Promise<VirtualAuthenticator> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport,
        hasResidentKey: residentKey,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    return new VirtualAuthenticator(cdp, authenticatorId);
  }

  async credentialCount(): Promise<number> {
    const { credentials } = await this.cdp.send('WebAuthn.getCredentials', { authenticatorId: this.authenticatorId });
    return credentials.length;
  }

  /** Exports the stored credentials, e.g. to "carry the same key" into another browser context. */
  async credentials(): Promise<Array<Record<string, unknown>>> {
    const { credentials } = await this.cdp.send('WebAuthn.getCredentials', { authenticatorId: this.authenticatorId });
    return credentials as unknown as Array<Record<string, unknown>>;
  }

  async importCredentials(credentials: Array<Record<string, unknown>>): Promise<void> {
    for (const credential of credentials) {
      await this.cdp.send('WebAuthn.addCredential', {
        authenticatorId: this.authenticatorId,
        credential: credential as never,
      });
    }
  }

  async remove(): Promise<void> {
    await this.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: this.authenticatorId });
  }
}
