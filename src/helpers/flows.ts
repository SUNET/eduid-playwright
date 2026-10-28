import { Browser, expect } from '@playwright/test';
import { App, freshBrowser } from '../fixtures';
import { Account } from './testdata';

/** "Log in with another device", device 1 without a remembered user: opens "Annan enhet". */
export async function startOtherDeviceAnonymous(app: App): Promise<void> {
  await app.start.openLogin();
  await app.login.setRememberMe(false);
  await app.login.otherDevice.click();
  await expect(app.otherDevice.qrUrl).toBeVisible();
}

/** Device 1 with a remembered user (logged in once with "remember me", then out): opens "Annan enhet". */
export async function startOtherDeviceRemembered(app: App, account: Account): Promise<void> {
  await app.start.openLogin();
  await app.login.setRememberMe(true);
  await app.login.loginToDashboard(account.email, account.password);
  await app.header.logout();
  await app.start.loginButton.click();
  await app.login.otherDevice.click();
  await expect(app.otherDevice.continue).toBeVisible();
}

/** Device 2: a separate browser that opens device 1's QR target. Close its `context` when done. */
export async function openOnDevice2(browser: Browser, device1: App) {
  const url = await device1.otherDevice.qrTarget();
  const device2 = await freshBrowser(browser);
  await device2.page.goto(url);
  await expect(device2.app.otherDevice.proceed).toBeVisible();
  return device2;
}
