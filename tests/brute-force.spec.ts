import { Page } from '@playwright/test';
import { test, expect, freshBrowser, App } from '../src/fixtures';
import { texts } from '../src/i18n';
import { codes, addNinCookie } from '../src/helpers/codes';
import { enterSixDigitCode, errorNotification, fillStable } from '../src/helpers/ui';
import { Account, randomPerson, uniqueEmail } from '../src/helpers/testdata';

/*
 * Limits on guessing passwords and codes. Every test uses its own throw-away account, because the limits
 * lock real accounts on dev: a locked login stays locked until the next calendar month.
 * The other-device code limit is other-device-005 in other-device.spec.ts.
 */

const e = texts.sv.errors;

async function startReset(app: App, email: string): Promise<void> {
  await app.start.openLogin();
  await app.login.forgotPassword.click();
  await fillStable(app.resetPassword.emailInput, email);
  await app.resetPassword.sendEmail.click();
  await app.register.solveCaptcha();
}

/** Types wrong passwords until dev locks the account. Returns the number of the attempt that got the lock message. */
async function lockAccount(page: Page, app: App, account: Account, maxAttempts = 70): Promise<number> {
  await app.start.openLogin();
  const answer = errorNotification(page).filter({ hasText: new RegExp(`${texts.sv.login.wrongCredentials}|${e.accountLocked}`) });
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await app.login.login(account.email, `wrong-password-${attempt}`);
    await expect(answer).toBeVisible();
    const text = await answer.innerText();
    if (text.includes(e.accountLocked)) return attempt;
    // Close the message, so that the next attempt waits for a new answer instead of seeing this one.
    await page.locator('#close-error').click();
    await expect(answer).toHaveCount(0);
  }
  throw new Error(`the account was not locked after ${maxAttempts} wrong passwords`);
}

test.describe('Brute-force limits @security', () => {
  test('brute-force-001 three wrong e-mail codes in registration stop the verification and start the registration over', async ({ page, app }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();

    for (const code of ['987651', '987652']) {
      await enterSixDigitCode(page, code);
      await expect(page.getByText(texts.sv.register.emailVerificationFailed)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.register.verifyEmailHeading);
    }
    await enterSixDigitCode(page, '987653');
    await expect(page.getByText(e.signupTooManyAttempts)).toBeVisible();
    // Back at the first step: the code boxes are gone, and the registration methods are offered again.
    await expect(page.locator('[id="v[0]"]')).toHaveCount(0);
    await expect(page.locator('#signup-freja')).toBeVisible();
    await expect(app.register.expandForm).toBeVisible();
  });

  test('brute-force-002 four wrong reset codes lock the password reset for the account, also in another browser; login still works', async ({ page, app, account, browser }) => {
    await startReset(app, account.email);
    for (const code of ['000001', '000002', '000003']) {
      await enterSixDigitCode(page, code);
      await expect(page.getByText(e.resetCodeFailed)).toBeVisible();
    }
    await enterSixDigitCode(page, '000004');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(e.resetLockedHeading);
    await expect(page.getByText(e.resetLocked)).toBeVisible();
    await expect(page.locator('[id="v[0]"]')).toHaveCount(0);

    // The lock belongs to the account, not to the browser session.
    const { context, page: other } = await freshBrowser(browser);
    try {
      await startReset(new App(other), account.email).catch(() => undefined); // the CAPTCHA step may already be skipped
      await expect(other.getByRole('heading', { level: 1 })).toHaveText(e.resetLockedHeading);
      await expect(other.locator('[id="v[0]"]')).toHaveCount(0);
    } finally {
      await context.close();
    }

    // "Gå till inloggning", and the password still works: the reset lock does not lock the login.
    await page.locator('#reset-password-locked-exit').click();
    await app.login.loginToDashboard(account.email, account.password);
  });

  test('brute-force-003 a wrong CAPTCHA answer is rejected and replaced by a new CAPTCHA', async ({ page, app }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    // The image's src is set once the CAPTCHA has been fetched.
    await expect(app.register.captchaImage).toHaveAttribute('src', /.+/);
    const first = (await app.register.captchaImage.getAttribute('src'))!;
    await app.register.solveCaptcha('000000');
    await expect(page.getByText(e.captchaFailed)).toBeVisible();
    // A new image means that one challenge cannot be guessed over and over.
    await expect(app.register.captchaImage).not.toHaveAttribute('src', first);
  });

  test('brute-force-004 repeated wrong e-mail confirmation codes are rejected; the right code still confirms the address', async ({ page, app, loggedInAccount }) => {
    // No lock was seen here (observation OBS-22). The code has 10 characters, so guessing it is not realistic.
    const extra = uniqueEmail('pwx');
    await app.header.goTo('account');
    await app.account.addEmail(extra);
    for (let i = 1; i <= 5; i++) {
      await app.account.openConfirmEmail(extra);
      await app.account.submitEmailCode(`000000000${i}`);
      await expect(page.getByText(e.emailCodeInvalid)).toBeVisible();
      await page.keyboard.press('Escape');
      await page.locator('#close-error').click();
    }
    await app.account.openConfirmEmail(extra);
    await app.account.submitEmailCode(await codes.emailConfirmation(page.context(), extra, loggedInAccount.eppn!));
    await expect(app.account.emailRow(extra).getByRole('button', { name: /gör primär|make primary/i })).toBeVisible();
  });

  test('brute-force-005 repeated wrong letter codes are rejected; the right code still verifies the identity', async ({ page, app, loggedInAccount }) => {
    // No lock was seen here (observation OBS-22). The code has 10 characters, so guessing it is not realistic.
    await app.header.goTo('identity');
    await page.locator('#swedish-button').click();
    await page.locator('#se-letter-button').click();
    await app.identity.ninInput.pressSequentially(loggedInAccount.identityNumber);
    await addNinCookie(page.context(), loggedInAccount.identityNumber);
    await app.identity.addNin.click();
    await page.locator('#se-letter button', { hasText: /fortsätt|proceed|continue/i }).click();
    const accept = page.locator('#letter-confirm-modal-accept-button');
    if (await accept.waitFor({ timeout: 5_000 }).then(() => true, () => false)) await accept.click();

    const proceed = page.locator('#se-letter button', { hasText: /fortsätt|proceed/i });
    const openCodeDialog = async () => {
      if (!(await app.identity.letterCodeInput.isVisible())) await proceed.click();
      await expect(app.identity.letterCodeInput).toBeVisible();
    };
    for (let i = 1; i <= 5; i++) {
      await openCodeDialog();
      await fillStable(app.identity.letterCodeInput, `1qvw3fw2q${i}`);
      await app.identity.letterCodeSubmit.click();
      await expect(page.getByText(e.letterCodeWrong)).toBeVisible();
      await page.locator('#close-error').click();
    }
    const code = await codes.letter(page.context());
    await openCodeDialog();
    await fillStable(app.identity.letterCodeInput, code);
    await app.identity.letterCodeSubmit.click();
    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
  });

  test('brute-force-006 the account is locked after about 50 wrong passwords; the right password is then refused @slow', async ({ page, app, account }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const lockedAt = await lockAccount(page, app, account);
    testInfo.annotations.push({ type: 'locked-at-attempt', description: String(lockedAt) });
    // dev locked at the 52nd attempt in every exploration. Allow some room, but a few typos must never lock.
    expect(lockedAt).toBeGreaterThanOrEqual(20);
    expect(lockedAt).toBeLessThanOrEqual(60);

    await page.locator('#close-error').click();
    await app.login.login(account.email, account.password);
    await expect(page.getByText(e.accountLocked)).toBeVisible();
    await expect(page).not.toHaveURL(/\/start/);
  });

  test('brute-force-007 a locked account can be unlocked by its owner with a password reset [known defect DEF-15] @slow', async ({ page, app, account }) => {
    test.fail(true, 'DEF-15: a password reset does not lift the login lock; the owner stays locked out until the next month');
    test.setTimeout(6 * 60_000);
    await lockAccount(page, app, account);

    await page.goto('/');
    await startReset(app, account.email);
    await enterSixDigitCode(page, await codes.resetPassword(page.context(), account.eppn!));
    const newPassword = await app.password.useSuggested();
    await app.resetPassword.finished.click();
    await app.login.login(account.email, newPassword);
    // Fail on the lock message itself, so that another problem cannot hide behind the expected failure.
    const locked = page.getByText(e.accountLocked);
    await expect(page.locator('#user-eppn').or(locked)).toBeVisible({ timeout: 30_000 });
    await expect(locked).toHaveCount(0);
  });
});
