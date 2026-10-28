import { Page } from '@playwright/test';
import { App, freshBrowser, test, expect } from '../src/fixtures';
import { openOnDevice2, startOtherDeviceAnonymous, startOtherDeviceRemembered } from '../src/helpers/flows';
import { enterSixDigitCode, setLanguage } from '../src/helpers/ui';
import { LANGS, texts } from '../src/i18n';

/**
 * "Log in with another device": device 1 shows a QR code, the user logs in on device 2, and
 * device 1 continues. With a remembered user device 1 just presses "Fortsätt"; otherwise it types
 * the code that device 2 shows. The Java suite did this with two windows in one session; here each
 * device is its own browser context, which is what the feature is really about.
 *
 * Both devices show a 3-minute timer. The timeout tests use Playwright's fake clock, which only
 * runs the browser-side timer; other-device-015 waits in real time to check that the server expires it too.
 */

const t = texts.sv.otherDevice;

async function expectBackOnLogin(page: Page, app: App): Promise<void> {
  await expect(app.login.otherDevice).toBeVisible();
  await expect(page).not.toHaveURL(/\/start/);
}

test.describe('Login with other device: without a remembered user', () => {
  test('other-device-001 cancel on the QR-code page returns to the login page', async ({ page, app }) => {
    await startOtherDeviceAnonymous(app);
    await app.otherDevice.cancel.click();
    await expectBackOnLogin(page, app);
  });

  test('other-device-002 an incorrect code on device 1 is rejected', async ({ page, app }) => {
    await startOtherDeviceAnonymous(app);
    await enterSixDigitCode(page, '000000');
    await expect(page.getByText(texts.sv.errors.otherDeviceWrongCode)).toBeVisible();
    await expect(page).not.toHaveURL(/\/start/);
  });

  test('other-device-003 log in on device 2 and finish on device 1 with the displayed code @smoke', async ({ page, app, browser, sharedAccount }) => {
    await startOtherDeviceAnonymous(app);
    await expect(page.getByText(t.codeStep)).toBeVisible();
    const device2 = await openOnDevice2(browser, app);
    await device2.app.otherDevice.proceed.click();
    await device2.app.login.login(sharedAccount.email, sharedAccount.password);
    await expect(device2.app.otherDevice.responseCode).toBeVisible();
    const code = (await device2.app.otherDevice.responseCode.innerText()).replace(/\D/g, '').slice(0, 6);
    await device2.context.close();

    await enterSixDigitCode(page, code);
    await expect(page).toHaveURL(/\/start/);
    await expect(page.locator('#header')).toContainText(sharedAccount.email);
  });

  test('other-device-004 device 2 shows where the request comes from: IP address, device and the same ID as device 1 @security', async ({ app, browser }) => {
    await startOtherDeviceAnonymous(app);
    const id = await app.otherDevice.requestIdNumber();
    expect(id).toMatch(/^\d{6}$/);
    const device2 = await openOnDevice2(browser, app);
    const confirm = device2.page.getByRole('main');
    await expect(confirm.getByRole('heading', { level: 1 })).toHaveText(t.otherHeading);
    await expect(confirm).toContainText(t.noteThisDevice);
    await expect(confirm.getByRole('row', { name: new RegExp(t.ipAddress) })).toContainText(/\d+\.\d+\.\d+\.\d+|[0-9a-f:]{3,}/i);
    await expect(confirm.getByRole('row', { name: new RegExp(t.description) })).toContainText(/Chrome/);
    await expect(confirm).toContainText(`ID# ${id}`);
    await device2.context.close();
  });

  for (const lang of LANGS) {
    test(`other-device-005 three wrong codes make the request invalid (${lang})`, async ({ page, app }) => {
      await startOtherDeviceAnonymous(app);
      await setLanguage(page, lang);
      for (const code of ['111111', '222222', '333333']) {
        await expect(page.locator('[id="v[0]"]')).toBeVisible();
        await enterSixDigitCode(page, code);
      }
      await expect(page.getByText(texts[lang].otherDevice.notValid)).toBeVisible();
      await app.otherDevice.cancel.click();
      await expectBackOnLogin(page, app);
    });
  }
});

test.describe('Login with other device: with a remembered user', () => {
  test('other-device-006 device 2 confirms who is logging in; after the login there, "Fortsätt" logs in device 1 @smoke', async ({ page, app, browser, account }) => {
    await startOtherDeviceRemembered(app, account);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.heading);
    await expect(page.getByText(t.continueStep)).toBeVisible();
    const id = await app.otherDevice.requestIdNumber();

    const device2 = await openOnDevice2(browser, app);
    const confirm = device2.page.getByRole('main');
    await expect(confirm).toContainText(`${t.loggingInAs} ${account.givenName} ${account.surName} (${account.email})`);
    await expect(confirm).toContainText(`ID# ${id}`);
    await device2.app.otherDevice.proceed.click();
    // Device 2 may only log in as the remembered user.
    await expect(device2.app.login.username).toHaveValue(account.email);
    await expect(device2.app.login.username).toBeDisabled();
    await device2.app.login.login(account.email, account.password);
    await expect(device2.page.getByText(t.doneOnOther)).toBeVisible();
    await device2.context.close();

    await app.otherDevice.continue.click();
    await expect(page).toHaveURL(/\/start/, { timeout: 30_000 });
    await expect(page.locator('#header')).toContainText(account.email);
  });

  test('other-device-007 cancel on device 1 after the login on device 2 ends the request [known defect DEF-08]', async ({ page, app, browser, account }) => {
    test.fail(true, 'DEF-08: "Avbryt" on device 1 has no effect once device 2 has logged in; "Fortsätt" still logs in');
    await startOtherDeviceRemembered(app, account);
    const device2 = await openOnDevice2(browser, app);
    await device2.app.otherDevice.proceed.click();
    await device2.app.login.login(account.email, account.password);
    await expect(device2.page.getByText(t.doneOnOther)).toBeVisible();
    await device2.context.close();

    await app.otherDevice.cancel.click();
    await expectBackOnLogin(page, app);
    await expect(app.otherDevice.continue).toHaveCount(0);
  });

  test('other-device-008 cancel on the QR-code page returns to the login page', async ({ page, app, account }) => {
    await startOtherDeviceRemembered(app, account);
    await app.otherDevice.cancel.click();
    await expectBackOnLogin(page, app);
  });

  for (const lang of LANGS) {
    test(`other-device-009 cancel on device 2's confirmation page (${lang}); device 1 then falls back to the password login`, async ({ page, app, browser, account }) => {
      await startOtherDeviceRemembered(app, account);
      const device2 = await openOnDevice2(browser, app);
      await device2.app.otherDevice.cancelOnOtherDevice.click();
      await setLanguage(device2.page, lang);
      await expect(device2.page.getByRole('heading', { level: 1 })).toHaveText(texts[lang].otherDevice.otherHeading);
      await expect(device2.page.getByText(texts[lang].otherDevice.cancelled)).toBeVisible();
      await device2.context.close();

      await app.otherDevice.continue.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.reLoginHeading);
      await expect(page.locator('#logout')).toHaveCount(0);
    });
  }

  test('other-device-010 cancel at the password step on device 2 cancels the request', async ({ page, app, browser, account }) => {
    await startOtherDeviceRemembered(app, account);
    const device2 = await openOnDevice2(browser, app);
    await device2.app.otherDevice.proceed.click();
    await device2.app.login.cancel.click();
    await expect(device2.page.getByText(t.cancelled)).toBeVisible();
    await device2.context.close();

    await app.otherDevice.continue.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.login.reLoginHeading);
    await expect(page.locator('#logout')).toHaveCount(0);
  });

  for (const lang of LANGS) {
    test(`other-device-011 pressing "Fortsätt" three times without logging in on device 2 makes the request invalid (${lang})`, async ({ page, app, account }) => {
      await startOtherDeviceRemembered(app, account);
      await setLanguage(page, lang);
      for (let i = 0; i < 3; i++) {
        // Wait for each attempt to reach the server; quick double clicks are not counted.
        await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST' && /use_other/.test(r.url())),
          app.otherDevice.continue.click(),
        ]);
      }
      await expect(page.getByText(texts[lang].otherDevice.notValid)).toBeVisible();
      await expect(page.locator('#logout')).toHaveCount(0);
      await app.otherDevice.cancel.click();
      await expectBackOnLogin(page, app);
    });
  }
});

test.describe('Login with other device: time limit', () => {
  for (const lang of LANGS) {
    test(`other-device-012 device 1 shows a timeout after 3 minutes with Cancel and Retry (${lang}, fake clock)`, async ({ page, app }) => {
      await page.clock.install();
      await startOtherDeviceAnonymous(app);
      await setLanguage(page, lang);
      await page.clock.fastForward('03:05');
      await expect(page.getByText(texts[lang].otherDevice.timedOut)).toBeVisible();
      await expect(app.otherDevice.retry).toHaveText(new RegExp(texts[lang].otherDevice.retry, 'i'));
      await expect(app.otherDevice.cancel).toBeVisible();
      // What Cancel does after a timeout needs the server to have expired the request too: see other-device-015.
    });
  }

  test('other-device-013 after a timeout, "Försök igen" starts a new request with a new ID (fake clock)', async ({ page, app }) => {
    await page.clock.install();
    await startOtherDeviceAnonymous(app);
    const firstId = await app.otherDevice.requestIdNumber();
    await page.clock.fastForward('03:05');
    await app.otherDevice.retry.click();
    await expect(page.getByText(t.codeStep)).toBeVisible();
    await expect.poll(() => app.otherDevice.requestIdNumber()).not.toBe(firstId);
    await expect(app.otherDevice.requestId).toContainText(/ID# \d{6}/);
  });

  for (const lang of LANGS) {
    test(`other-device-014 device 2's confirmation page expires after 3 minutes (${lang}, fake clock)`, async ({ app, browser }) => {
      await startOtherDeviceAnonymous(app);
      const url = await app.otherDevice.qrTarget();
      const device2 = await freshBrowser(browser);
      await device2.page.clock.install();
      await device2.page.goto(url);
      await setLanguage(device2.page, lang);
      await expect(device2.app.otherDevice.proceed).toBeVisible();
      await device2.page.clock.fastForward('03:05');
      await expect(device2.page.getByText(texts[lang].otherDevice.expired)).toBeVisible();
      await expect(device2.app.otherDevice.proceed).toHaveCount(0);
      await device2.context.close();
    });
  }

  test('other-device-015 after 3 real minutes the server rejects the QR link, and Cancel on device 1 returns to login (other-device-012) @slow', async ({ page, app, browser }) => {
    test.slow();
    await startOtherDeviceAnonymous(app);
    const url = await app.otherDevice.qrTarget();
    // The one deliberate real-time wait in the suite: it checks the server, which a fake clock cannot.
    await expect(page.getByText(t.timedOut)).toBeVisible({ timeout: 3 * 60_000 + 30_000 });

    const device2 = await freshBrowser(browser);
    await device2.page.goto(url);
    await expect(device2.page.getByRole('main')).toBeVisible();
    await expect(device2.app.otherDevice.proceed).toHaveCount(0);
    await expect(device2.page.getByRole('main')).not.toContainText(t.noteThisDevice);
    await device2.context.close();

    await app.otherDevice.cancel.click();
    await expectBackOnLogin(page, app);
  });
});
