import { expect, Locator, Page } from '@playwright/test';
import { Lang, texts } from '../i18n';

/**
 * Fills a React-controlled input and verifies the value stuck.
 *
 * The eduID forms are (re)initialised shortly after they mount, which can wipe
 * a value typed too early (seen on /register and the add-email form). The Java
 * suite papered over this with Thread.sleep; here we retry until the value holds.
 */
export async function fillStable(input: Locator, value: string): Promise<void> {
  // Some fields (e.g. the re-login password field) drop spaces as you type, so compare without whitespace.
  const squash = (s: string) => s.replace(/\s+/g, '');
  await expect(async () => {
    await input.fill('');
    await input.pressSequentially(value);
    expect(squash(await input.inputValue())).toBe(squash(value));
  }).toPass({ timeout: 15_000 });
}

/** Types a six-digit code into the v[0]..v[5] boxes and submits if the form did not auto-submit. */
export async function enterSixDigitCode(page: Page, code: string): Promise<void> {
  // The form submits by itself on the last digit. Clicking "Fortsätt" as well sends the code twice,
  // and the other-device endpoint answers two simultaneous submissions with HTTP 500 (DEF-09).
  // So click only if no submission was seen.
  // Device 1 of "other device" also polls with POSTs, so look for one that carries this code.
  const autoSubmitted = page
    .waitForRequest((r) => r.method() === 'POST' && (r.postData() ?? '').includes(code), { timeout: 3_000 })
    .then(() => true, () => false);
  for (let i = 0; i < code.length; i++) {
    await page.locator(`[id="v[${i}]"]`).fill(code[i]);
  }
  const ok = page.locator('#response-code-ok-button');
  if (!(await autoSubmitted) && (await ok.isVisible()) && (await ok.isEnabled())) {
    await ok.click().catch(() => undefined);
  }
}

export async function currentLanguage(page: Page): Promise<Lang> {
  const label = (await page.locator('#language-selector button').innerText()).trim();
  return label === texts.sv.otherLanguageButton ? 'sv' : 'en';
}

/** Switches UI language with the footer toggle. No-op if already active. */
export async function setLanguage(page: Page, lang: Lang): Promise<void> {
  const toggle = page.locator('#language-selector button');
  await expect(toggle).toBeVisible();
  // A click during a re-render is occasionally lost, so click again if nothing happened. Wait long
  // enough before that: a second click on a slow but working switch would toggle the language back.
  await expect(async () => {
    if ((await currentLanguage(page)) !== lang) await toggle.click();
    await expect(toggle).toHaveText(texts[lang].otherLanguageButton, { timeout: 10_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Checks the footer language switch against the page it is on. The switch names the other language:
 * "English" on a Swedish page, "Svenska" on an English page. `check` asserts page texts in the given
 * language. The page is switched twice, so it ends in the language it started in.
 * The `lang` attribute of the page does not follow the switch (DEF-16, accessibility-033), so it is not checked here.
 */
export async function expectLanguageSwitchMatchesPage(page: Page, check: (lang: Lang) => Promise<void>): Promise<void> {
  const toggle = page.locator('#language-selector button');
  await expect(toggle).toHaveText(new RegExp(`^(${texts.sv.otherLanguageButton}|${texts.en.otherLanguageButton})$`));
  const first = await currentLanguage(page);
  for (const lang of [first, first === 'sv' ? 'en' : 'sv', first] as Lang[]) {
    await setLanguage(page, lang); // waits until the switch names the other language
    await check(lang);
  }
}

/**
 * Picks a method from "Visa andra alternativ" on the MFA steps of login, re-authentication and
 * reset password, e.g. 'Freja+', 'eIDAS', 'BankID'. The combobox is react-select's zero-size
 * input, so the menu is opened from the keyboard.
 */
export async function chooseOtherAuthOption(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name, exact: true }).click();
}

/**
 * The error notification shown by the app, ignoring the WebAuthn "NotSupportedError"
 * banner that browsers without conditional-UI support get on every login page (DEF-04).
 */
export function errorNotification(page: Page): Locator {
  return page.getByRole('alert').filter({ hasNotText: 'NotSupportedError' });
}
