import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { codes } from '../src/helpers/codes';
import { randomPerson, uniqueEmail } from '../src/helpers/testdata';
import { enterSixDigitCode, errorNotification, setLanguage } from '../src/helpers/ui';

test.describe('Registration — page content', () => {
  for (const lang of LANGS) {
    test(`registration-001 registration method page texts, labels and placeholders (${lang}) @smoke`, async ({ page, app }) => {
      const t = texts[lang].register;
      await app.register.open();
      await setLanguage(page, lang);

      await expect(page).toHaveTitle(texts[lang].titles.register);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.heading);
      await expect(page.getByText(t.intro)).toBeVisible();
      await expect(page.getByText(t.withDigitalId, { exact: true })).toBeVisible();
      for (const [id, label] of [['bankid', 'BankID'], ['freja', 'Freja+'], ['eidas', 'eIDAS'], ['freja-eid', 'Freja eID']]) {
        await expect(page.locator(`#signup-${id}`)).toHaveText(new RegExp(`^${label.replace('+', '\\+')}$`, 'i'));
      }

      await expect(app.register.expandForm).toHaveText(new RegExp(t.showForm, 'i'));
      await app.register.showNameAndEmailForm();
      await expect(app.register.expandForm).toHaveText(new RegExp(t.hideForm, 'i'));
      await expect(app.register.givenName).toHaveAttribute('placeholder', t.givenNamePlaceholder);
      await expect(app.register.surname).toHaveAttribute('placeholder', t.surnamePlaceholder);
      await expect(app.register.email).toHaveAttribute('placeholder', t.emailPlaceholder);
      await expect(page.locator('#given_name-wrapper label')).toContainText(t.givenName);
      await expect(page.locator('#surname-wrapper label')).toContainText(t.surname);
      await expect(page.locator('#email-wrapper label')).toContainText(t.email);

      await expect(app.register.stepIndicator).toHaveCount(5);
      await expect(app.register.stepIndicator.first()).toHaveClass(/active/);
      await expect(app.register.stepIndicator.first()).toContainText(t.step1);
    });
  }

  test('registration-002 the form cannot be submitted with empty or invalid fields', async ({ page, app }) => {
    await app.register.open();
    await app.register.showNameAndEmailForm();
    await expect(app.register.submit).toBeDisabled();

    await app.register.fillNameAndEmail({ givenName: 'Test', surName: 'Person' }, 'not-an-email');
    await expect(app.register.submit).toBeDisabled();

    await app.register.givenName.fill('');
    await app.register.givenName.blur();
    await expect(page.getByText(texts.sv.register.emptyField).first()).toBeVisible();

    await app.register.fillNameAndEmail({ givenName: 'Test', surName: 'Person' }, uniqueEmail());
    await expect(app.register.submit).toBeEnabled();
  });
});

test.describe('Registration — full flows', () => {
  test('registration-003 register with suggested password, log in and see an unverified account on the dashboard @smoke', async ({ page, app }) => {
    const account = await app.register.registerWithEmail();
    await app.login.loginToDashboard(account.email, account.password);

    const t = texts.sv.dashboard;
    await expect(app.dashboard.welcomeHeading).toContainText(`${t.welcome}${account.givenName} ${account.surName}!`);
    await expect(app.dashboard.statusOverview).toContainText(t.confirmedAccount);
    await expect(app.dashboard.statusOverview).toContainText(t.verifyIdentity);
    await expect(app.dashboard.statusOverview).toContainText(t.enhanceSecurity);
    await expect(page.locator('#header')).toContainText(account.email);
  });

  test('registration-004 register with a custom password and log in with it', async ({ app }) => {
    const customPassword = `Pw-${Date.now()}-Strong!x9Q`;
    const account = await app.register.registerWithEmail({ customPassword });
    expect(account.password).toBe(customPassword);
    await app.login.loginToDashboard(account.email, customPassword);
  });

  test('registration-005 cancel at the terms of use goes back to the start of registration', async ({ page, app }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await app.register.solveCaptcha();
    await expect(page.getByText(texts.sv.register.termsIntro)).toBeVisible();
    await app.register.cancelTerms.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.register.heading);
  });

  test('registration-006 cancel at email verification goes back to the registration method page', async ({ page, app }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.register.verifyEmailHeading);
    await app.register.codeAbort.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts.sv.register.heading);
  });

  test('registration-007 an incorrect email code is rejected and the correct one then works', async ({ page, app }) => {
    const email = uniqueEmail();
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), email);
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();

    const t = texts.sv.register;
    await expect(page.getByText(`${t.verifyEmailText} ${email}`)).toBeVisible();
    const correct = await codes.signup(page.context(), email);
    const wrong = correct === '987654' ? '123123' : '987654';
    await enterSixDigitCode(page, wrong);
    await expect(page.getByText(t.emailVerificationFailed)).toBeVisible();

    await enterSixDigitCode(page, correct);
    await expect(app.register.password.suggestedRadio.or(app.register.password.showForm).first()).toBeVisible();
  });

  test('registration-008 registering an already registered email address is refused', async ({ page, app, sharedAccount }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), sharedAccount.email);
    await app.register.solveCaptcha();
    await app.register.acceptTerms.click();
    await expect(page.getByText(texts.sv.register.alreadyRegistered)).toBeVisible();
  });

  test('registration-009 two accounts can be registered after each other in the same browser session [known defect DEF-03]', async ({ app }) => {
    // After a completed registration, the next "Show form" click never renders the name/email fields.
    test.fail(true, 'DEF-03: registration form does not render for a second registration in the same session');
    test.setTimeout(60_000);
    await app.register.registerWithEmail();
    await app.register.open();
    await app.register.showNameAndEmailForm();
  });

  test('registration-010 a second account can be registered in the same session after a page reload', async ({ page, app }) => {
    const first = await app.register.registerWithEmail();
    await app.register.open();
    // Reload only once the register page has rendered: an early reload (seen in Firefox) leaves the broken DEF-03 state.
    await expect(app.register.expandForm).toBeVisible();
    await page.reload();
    await expect(app.register.expandForm).toBeVisible();
    const second = await app.register.registerWithEmail();
    expect(second.email).not.toBe(first.email);
    await app.login.loginToDashboard(second.email, second.password);
  });

  test('registration-011 a wrong CAPTCHA answer is rejected', async ({ page, app }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await app.register.solveCaptcha('000000');
    await expect(page.getByText(texts.sv.errors.captchaFailed)).toBeVisible();
    await expect(app.register.acceptTerms).toHaveCount(0);
  });

  test('registration-012 HTML in the name is shown as text, not rendered @security', async ({ page, app }) => {
    const givenName = '<b>Bold</b><img src=x onerror="window.__xss=1">';
    const account = await app.register.registerWithEmail({ person: { ...randomPerson(), givenName } });
    await app.login.loginToDashboard(account.email, account.password);
    await expect(app.dashboard.welcomeHeading).toContainText(givenName);
    await expect(app.dashboard.welcomeHeading.locator('b, img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe('Registration — without the magic cookie', () => {
  test.use({ magicCookie: false });

  test('registration-013 the test CAPTCHA backdoor is closed when the autotests cookie is absent @security', async ({ page, app }) => {
    await app.register.open();
    await app.register.submitNameAndEmail(randomPerson(), uniqueEmail());
    await app.register.solveCaptcha();
    await expect(errorNotification(page)).toBeVisible();
    await expect(app.register.acceptTerms).toHaveCount(0);
  });
});
