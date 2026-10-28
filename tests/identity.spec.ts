import { test, expect } from '../src/fixtures';
import { LANGS, texts } from '../src/i18n';
import { addNinCookie, codes } from '../src/helpers/codes';
import { errorNotification, fillStable, setLanguage } from '../src/helpers/ui';

test.describe('Identity page', () => {
  for (const lang of LANGS) {
    test(`identity-001 identity page lists the verification methods and names (${lang})`, async ({ page, app, sharedAccount }) => {
      const t = texts[lang];
      await app.start.openLogin();
      await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
      await setLanguage(page, lang);
      await app.header.goTo('identity');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.identity.heading);
      await expect(page.locator('#verify-identity')).toContainText(t.identity.swedish);
      await expect(page.locator('#verify-identity')).toContainText(t.identity.eu);
      await expect(page.locator('#verify-identity')).toContainText(t.identity.world);
      await expect(page.locator('#personal-data')).toContainText(t.identity.names);
      await expect(app.identity.shownGivenName).toHaveText(sharedAccount.givenName);
      await expect(app.identity.shownSurname).toHaveText(sharedAccount.surName);
      await setLanguage(page, 'sv');
    });
  }
});

test.describe('Verify identity', () => {
  test('identity-002 verify identity by letter (code fetched from the test endpoint); dashboard then shows a verified identity', async ({ page, app, loggedInAccount }) => {
    await app.header.goTo('identity');
    await page.locator('#swedish-button').click();
    await page.locator('#se-letter-button').click();

    // The national ID field masks its value (••••), so it cannot be read back — type it once.
    await expect(app.identity.ninInput).toHaveAttribute('placeholder', /12|åååå|yyyy/i);
    await app.identity.ninInput.pressSequentially(loggedInAccount.identityNumber);
    await addNinCookie(page.context(), loggedInAccount.identityNumber);
    await app.identity.addNin.click();
    await expect(page.locator('#se-letter')).toContainText(loggedInAccount.identityNumber.slice(0, 8) + '****');

    // Order the letter.
    await page.locator('#se-letter button', { hasText: /fortsätt|proceed|continue/i }).click();
    const accept = page.locator('#letter-confirm-modal-accept-button');
    if (await accept.waitFor({ timeout: 5_000 }).then(() => true, () => false)) await accept.click();

    // "Receive" it.
    const code = await codes.letter(page.context());
    const proceed = page.locator('#se-letter button', { hasText: /fortsätt|proceed/i });
    if (!(await app.identity.letterCodeInput.isVisible())) await proceed.click();
    await fillStable(app.identity.letterCodeInput, code);
    await app.identity.letterCodeSubmit.click();

    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifiedIdentity);
  });

  test('identity-003 a wrong letter code is rejected', async ({ page, app, loggedInAccount }) => {
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
    if (!(await app.identity.letterCodeInput.isVisible())) await proceed.click();
    await fillStable(app.identity.letterCodeInput, '1qvw3fw2q3');
    await app.identity.letterCodeSubmit.click();
    await expect(errorNotification(page)).toBeVisible();
    await app.header.goTo('start');
    await expect(app.dashboard.statusOverview).toContainText(texts.sv.dashboard.verifyIdentity);
  });

  test('identity-004 an invalid Swedish national ID number is rejected client-side', async ({ page, app, loggedInAccount }) => {
    void loggedInAccount;
    await app.header.goTo('identity');
    await page.locator('#swedish-button').click();
    await page.locator('#se-letter-button').click();
    await app.identity.ninInput.pressSequentially('190001011234'); // fails the Luhn check
    await app.identity.ninInput.blur();
    await expect(app.identity.addNin).toBeDisabled();
  });
});
