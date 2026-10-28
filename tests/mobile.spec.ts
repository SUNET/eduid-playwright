import AxeBuilder from '@axe-core/playwright';
import { devices, Page } from '@playwright/test';
import { App, freshBrowser, test, expect } from '../src/fixtures';
import { Section } from '../src/pages/Header';
import { randomPerson, uniqueEmail } from '../src/helpers/testdata';
import { enterSixDigitCode } from '../src/helpers/ui';
import { startOtherDeviceAnonymous } from '../src/helpers/flows';

/**
 * Phones and tablets. Runs in the "mobile" (Pixel 7, Chromium) and "mobile-safari"
 * (iPhone 14, WebKit) projects via the @mobile tag; @mobile-only keeps these out of the
 * desktop project. The phone projects also run every @smoke flow.
 */

const SECTIONS: Section[] = ['start', 'identity', 'security', 'account'];

async function expectNoHorizontalScroll(page: Page, what: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${what} (px)`).toBeLessThanOrEqual(1);
}

/** iOS Safari zooms into any input whose font is smaller than 16px, and does not zoom back. */
async function expectNoInputZoom(page: Page, what: string): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select')]
      .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.id || el.name}: ${getComputedStyle(el).fontSize}`),
  );
  expect.soft(small, `inputs with font-size < 16px on ${what}`).toEqual([]);
}

/** Known undersized targets, keyed "<page>: <css target>", each with a defect in docs/TEST_PROTOCOL.md. */
const KNOWN_SMALL_TARGETS: Record<string, string> = {
  'login: #show-hide-button': 'DEF-14 the "VISA" button next to the password field is 34×15 px and too close to other targets',
};

/** WCAG 2.2 2.5.8 Target Size (Minimum): axe's target-size rule, including its spacing exception. */
async function undersizedTargets(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page: page as never }).withRules(['target-size']).analyze();
  return results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
}

async function login(app: App, account: { email: string; password: string }): Promise<void> {
  await app.start.openLogin();
  await app.login.loginToDashboard(account.email, account.password);
}

test.describe('Mobile layout @mobile @mobile-only', () => {
  test.describe('anonymous pages', () => {
    test.use({ magicCookie: false });

    for (const path of ['/', '/help', '/register', '/this-page-does-not-exist']) {
      test(`mobile-001 ${path} has no horizontal scrolling on a phone`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page, path);
      });
    }

    test('mobile-002 login page is usable on a phone (fields and button in the viewport, no zoom needed)', async ({ page, app }) => {
      await app.start.openLogin();
      for (const locator of [app.login.username, app.login.password, app.login.submit]) {
        await expect(locator).toBeInViewport();
      }
      await expectNoInputZoom(page, 'login');
    });

    test('mobile-003 pinch-zoom is not disabled (WCAG 1.4.4)', async ({ page, app }) => {
      await app.start.goto();
      const viewport = (await page.locator('meta[name="viewport"]').getAttribute('content')) ?? '';
      expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
      const maxScale = viewport.match(/maximum-scale\s*=\s*([\d.]+)/i)?.[1];
      if (maxScale) expect(Number(maxScale)).toBeGreaterThanOrEqual(2);
    });
  });

  test('mobile-004 every logged-in page fits the phone width', async ({ page, app, sharedAccount }) => {
    await login(app, sharedAccount);
    for (const section of SECTIONS) {
      await app.header.goTo(section);
      await expectNoHorizontalScroll(page, section);
    }
  });

  test('mobile-005 no form zooms the page on focus: every input is at least 16px', async ({ page, app }) => {
    await app.start.openLogin();
    await expectNoInputZoom(page, 'login');
    await app.login.forgotPassword.click();
    await expect(app.resetPassword.emailInput).toBeVisible();
    await expectNoInputZoom(page, 'reset password');
    await app.register.open();
    await app.register.showNameAndEmailForm();
    await expectNoInputZoom(page, 'registration');
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await expect(app.register.captchaImage).toBeVisible();
    await expectNoInputZoom(page, 'CAPTCHA');
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();
    await expect(page.locator('[id="v[0]"]')).toBeVisible();
    await expectNoInputZoom(page, 'e-mail code');
  });

  test('mobile-006 tap targets are large enough or far enough apart (WCAG 2.2 2.5.8)', async ({ page, app }) => {
    const failures: string[] = [];
    await app.start.goto();
    failures.push(...(await undersizedTargets(page)).map((t) => `start: ${t}`));
    await app.start.openLogin();
    failures.push(...(await undersizedTargets(page)).map((t) => `login: ${t}`));
    await app.register.open();
    await app.register.showNameAndEmailForm();
    failures.push(...(await undersizedTargets(page)).map((t) => `register: ${t}`));
    expect(failures.filter((f) => !KNOWN_SMALL_TARGETS[f])).toEqual([]);
  });

  test('mobile-007 landscape orientation works: login and dashboard (WCAG 1.3.4)', async ({ page, app, sharedAccount }) => {
    const portrait = page.viewportSize()!;
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await app.start.openLogin();
    await expectNoHorizontalScroll(page, 'login (landscape)');
    for (const locator of [app.login.username, app.login.password, app.login.submit]) {
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeInViewport();
    }
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    await expectNoHorizontalScroll(page, 'dashboard (landscape)');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('mobile-008 at 320 CSS px (small phones, 400% zoom) content reflows without horizontal scrolling (WCAG 1.4.10)', async ({ page, app, sharedAccount }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await app.start.goto();
    await expectNoHorizontalScroll(page, 'start @320');
    await app.start.openLogin();
    await expectNoHorizontalScroll(page, 'login @320');
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    for (const section of SECTIONS) {
      await app.header.goTo(section);
      await expectNoHorizontalScroll(page, `${section} @320`);
    }
  });

  test('mobile-009 dialogs fit the phone screen and their buttons can be reached', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await app.header.goTo('account');
    await app.account.deleteButton.scrollIntoViewIfNeeded();
    await app.account.deleteButton.click();
    for (const button of [app.account.deleteConfirm, app.account.deleteClose]) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
    }
    const dialogWidth = await app.account.deleteConfirm.evaluate((el) => {
      const dialog = el.closest('dialog, [role="dialog"]') ?? el.parentElement!;
      return dialog.getBoundingClientRect().right;
    });
    expect(dialogWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await app.account.deleteClose.click();
    await expect(app.account.deleteConfirm).toBeHidden();
  });

  test('mobile-010 input purpose for autofill and the right phone keyboard (WCAG 1.3.5)', async ({ page, app }) => {
    await app.start.openLogin();
    await expect(app.login.username).toHaveAttribute('autocomplete', /\busername\b/);
    await expect(app.login.password).toHaveAttribute('autocomplete', 'current-password');
    await app.register.open();
    await app.register.showNameAndEmailForm();
    await expect(app.register.email).toHaveAttribute('type', 'email');
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();
    // The six code boxes must bring up a numeric keypad.
    const code = page.locator('[id="v[0]"]');
    await expect(code).toBeVisible();
    const numeric = await code.evaluate((el) => (el as HTMLInputElement).type === 'number' || /numeric|decimal/.test(el.getAttribute('inputmode') ?? ''));
    expect(numeric, 'numeric keypad for the code').toBe(true);
  });

  test('mobile-011 registration name fields declare their purpose for autofill (WCAG 1.3.5) [known defect DEF-13]', async ({ app }) => {
    test.fail(true, 'DEF-13: given_name and surname have no autocomplete attribute');
    await app.register.open();
    await app.register.showNameAndEmailForm();
    await expect(app.register.givenName).toHaveAttribute('autocomplete', 'given-name');
    await expect(app.register.surname).toHaveAttribute('autocomplete', 'family-name');
  });
});

test.describe('Mobile navigation @mobile @mobile-only', () => {
  test('mobile-012 the collapsed user menu navigates to every section and logs out', async ({ page, app, sharedAccount }) => {
    await login(app, sharedAccount);
    await expect(app.header.mobileMenuButton).toBeVisible();
    for (const section of ['identity', 'security', 'account', 'start'] as Section[]) {
      await app.header.goTo(section);
    }
    await expectNoHorizontalScroll(page, 'dashboard');
    await app.header.logout();
  });

  test('mobile-013 the menu button has a name, reports open/closed and the menu closes after a choice (4.1.2)', async ({ app, sharedAccount }) => {
    await login(app, sharedAccount);
    const button = app.header.mobileMenuButton;
    await expect(button).toHaveAccessibleName(/.+/);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.tap();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(app.header.menuLink('identity')).toBeVisible();
    await app.header.menuLink('identity').tap();
    await expect(app.header.menuLink('identity')).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Phone as the "other device" @mobile @mobile-only', () => {
  test('mobile-014 the phone scans the QR code, logs in, and its code finishes the login on the computer', async ({ page, app, browser, sharedAccount }) => {
    // Device 1 is a desktop browser; the test's own page is the phone.
    const computer = await freshBrowser(browser, { viewport: { width: 1280, height: 900 } });
    await startOtherDeviceAnonymous(computer.app);
    const url = await computer.app.otherDevice.qrTarget();

    await page.goto(url);
    await expect(app.otherDevice.proceed).toBeInViewport();
    await expectNoHorizontalScroll(page, 'other device: confirmation');
    await app.otherDevice.proceed.tap();
    await app.login.login(sharedAccount.email, sharedAccount.password);
    await expect(app.otherDevice.responseCode).toBeVisible();
    // On a short screen (iPhone) the code is below the fold; the user scrolls to it.
    await app.otherDevice.responseCode.scrollIntoViewIfNeeded();
    await expect(app.otherDevice.responseCode).toBeInViewport();
    await expectNoHorizontalScroll(page, 'other device: code');
    const code = (await app.otherDevice.responseCode.innerText()).replace(/\D/g, '').slice(0, 6);

    await enterSixDigitCode(computer.page, code);
    await expect(computer.page).toHaveURL(/\/start/, { timeout: 30_000 });
    await computer.context.close();
  });
});

test.describe('Tablet @mobile @mobile-only', () => {
  test.use({ viewport: devices['iPad Mini'].viewport });

  test('mobile-015 tablet portrait: pages fit and the menu reaches every section', async ({ page, app, sharedAccount }) => {
    await app.start.goto();
    await expectNoHorizontalScroll(page, 'start (tablet)');
    await login(app, sharedAccount);
    for (const section of SECTIONS) {
      await app.header.goTo(section);
      await expectNoHorizontalScroll(page, `${section} (tablet)`);
    }
  });
});

