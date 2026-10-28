import { expect, Page } from '@playwright/test';

/**
 * "Log in using another device". Device 1 wants to log in and shows a QR code; device 2
 * opens the QR target, logs in, and device 1 then continues: with a remembered user it
 * just presses "Fortsätt", otherwise it types the six-digit code device 2 shows.
 */
export class OtherDevicePage {
  // Device 1
  get qrUrl() { return this.page.locator('#qr_url'); }
  /** "ID# 123456": the same number is shown on both devices so the user can match them. */
  get requestId() { return this.page.getByRole('figure').filter({ hasText: /ID# \d+/ }).first(); }
  get continue() { return this.page.locator('#response-code-continue-button'); }
  /** Cancel: "abort" while a code is expected, "cancel" otherwise. */
  get cancel() { return this.page.locator('#response-code-cancel-button, #response-code-abort-button').first(); }
  get retry() { return this.page.locator('#refresh-get-new-code'); }
  // Device 2
  get proceed() { return this.page.locator('#proceed-other-device-button'); }
  get cancelOnOtherDevice() { return this.page.locator('#cancel-other-device-button'); }
  get responseCode() { return this.page.locator('#response_code, [id^="response-code"]').filter({ hasText: /\d{6}/ }).first(); }

  constructor(private readonly page: Page) {}

  /** The QR target. dev prints it as a link ("developer information, not shown in production"). */
  async qrTarget(): Promise<string> {
    await expect(this.qrUrl).toBeVisible();
    const url = (await this.qrUrl.innerText()).match(/https?:\/\/\S+/)?.[0];
    expect(url, 'QR target URL').toBeTruthy();
    return url!;
  }

  async requestIdNumber(): Promise<string> {
    return ((await this.requestId.innerText()).match(/ID# (\d+)/) ?? [])[1] ?? '';
  }
}
