import { Page } from '@playwright/test';
import { test, expect } from '../src/fixtures';
import { Lang, texts } from '../src/i18n';
import { setLanguage } from '../src/helpers/ui';

/** Main topics: the <details> that are not inside another one. */
const mainTopics = (page: Page) => page.locator('xpath=//main//details[not(ancestor::details)]');
const subTopics = (page: Page) => page.locator('main details details');
const summaryOf = (topic: ReturnType<typeof mainTopics>) => topic.locator('xpath=./summary');

/** Clicks a link to the help page. The links open it in a new tab; returns that tab. */
async function followHelpLink(page: Page, link: ReturnType<Page['locator']>): Promise<Page> {
  const [help] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await expect(help).toHaveURL(/\/help$/);
  await expect(help.getByRole('heading', { level: 1 })).toHaveText(texts.sv.help.heading);
  return help;
}

async function openHelp(page: Page, lang: Lang = 'sv'): Promise<void> {
  await page.goto('/help');
  await setLanguage(page, lang);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(texts[lang].help.heading);
}

test.describe('Help pages', () => {
  test.use({ magicCookie: false });

  test('help-001 help page: every main topic has the expected heading, opens and has content @smoke', async ({ page }) => {
    const t = texts.sv.help;
    await openHelp(page);
    await expect(page).toHaveTitle(/Hjälp \| eduID/);
    // The topic list comes from the page, so a topic that is added or removed fails here.
    await expect(mainTopics(page).locator('xpath=./summary//h3')).toHaveText(t.topics);
    for (let i = 0; i < t.topics.length; i++) {
      const topic = mainTopics(page).nth(i);
      await summaryOf(topic).click();
      await expect(topic, t.topics[i]).toHaveAttribute('open', '');
      expect((await topic.innerText()).length, `${t.topics[i]}: content`).toBeGreaterThan(80);
    }
  });

  test('help-002 help page in English: title, page heading and topic headings', async ({ page }) => {
    const t = texts.en.help;
    await openHelp(page, 'en');
    await expect(page).toHaveTitle(/Help \| eduID/);
    await expect(mainTopics(page).locator('xpath=./summary//h3')).toHaveText(t.topics);
    await mainTopics(page).evaluateAll((all) => all.forEach((d) => d.setAttribute('open', '')));
    await expect(subTopics(page).locator('xpath=./summary')).toHaveText(t.subTopics);
  });

  test('help-003 links in the help content respond', async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.goto('/help');
    await page.locator('details').evaluateAll((all) => all.forEach((d) => d.setAttribute('open', '')));
    const hrefs = await page.locator('main a[href^="http"]').evaluateAll((links) =>
      [...new Set(links.map((a) => (a as HTMLAnchorElement).href.split('#')[0]))],
    );
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) {
      // HEAD is cheaper but several sites reject it; fall back to GET.
      let status = (await request.head(href, { failOnStatusCode: false, timeout: 15_000 }).catch(() => null))?.status() ?? 0;
      if (status === 0 || status >= 400) {
        status = (await request.get(href, { failOnStatusCode: false, timeout: 15_000 }).catch(() => null))?.status() ?? 0;
      }
      expect.soft(status, href).toBeGreaterThan(0);
      expect.soft(status, href).toBeLessThan(400);
    }
  });

  test('help-004 deep links to help anchors used elsewhere in the app resolve', async ({ page }) => {
    // Anchors referenced from the login/registration/dashboard pages.
    for (const anchor of ['loginPasskeyHeading', 'help-security-key-button', 'help-assurance-levels-button']) {
      await page.goto(`/help#${anchor}`);
      await expect(page.locator(`[id="${anchor}"]`), anchor).toBeAttached();
    }
  });

  test('help-005 every sub-topic has the expected heading, opens and has content; every topic closes again', async ({ page }) => {
    const t = texts.sv.help;
    await openHelp(page);
    const count = await mainTopics(page).count();
    for (let i = 0; i < count; i++) {
      const topic = mainTopics(page).nth(i);
      await summaryOf(topic).click();
      await expect(topic).toHaveAttribute('open', '');
      // Sub-topics in page order; a sub-topic can hold another one, which comes right after it.
      const subs = topic.locator('details');
      for (let j = 0; j < (await subs.count()); j++) {
        const sub = subs.nth(j);
        await summaryOf(sub).click();
        await expect(sub, `${t.topics[i]}, sub-topic ${j + 1}`).toHaveAttribute('open', '');
        expect((await sub.innerText()).length, `${await summaryOf(sub).innerText()}: content`).toBeGreaterThan(200);
      }
      // Close them again, innermost first, and then the topic itself.
      for (let j = (await subs.count()) - 1; j >= 0; j--) {
        await summaryOf(subs.nth(j)).click();
        await expect(subs.nth(j)).not.toHaveAttribute('open');
      }
      await summaryOf(topic).click();
      await expect(topic, `${t.topics[i]} closes`).not.toHaveAttribute('open');
    }
    await expect(subTopics(page).locator('xpath=./summary')).toHaveText(t.subTopics);
  });

  test('help-006 every id on the help page is unique [known defect DEF-17]', async ({ page }) => {
    test.fail(true, 'DEF-17: "Användning av eduID" and "Hantering av eduIDs inställningar" share the id help-using-eduid');
    await openHelp(page);
    const duplicates = await page.evaluate(() => {
      const count = new Map<string, number>();
      document.querySelectorAll('[id]').forEach((e) => count.set(e.id, (count.get(e.id) ?? 0) + 1));
      return [...count].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
  });

  for (const lang of ['sv', 'en'] as const) {
    test(`help-007 the contact topic gives the support e-mail address as a mail link (${lang})`, async ({ page }) => {
      await openHelp(page, lang);
      const contact = mainTopics(page).filter({ has: page.getByRole('heading', { name: texts[lang].help.topics.at(-1) }) });
      await summaryOf(contact).click();
      const mail = contact.locator('a[href="mailto:support@eduid.se"]');
      await expect(mail).toBeVisible();
      await expect(mail).toHaveText('support@eduid.se');
    });
  }

  test('help-008 the help page opens in a new tab from the footer and from the start page text', async ({ page, app }) => {
    const t = texts.sv.help;
    await app.start.goto();
    const fromFooter = await followHelpLink(page, page.getByRole('contentinfo').getByRole('link', { name: t.footerLink, exact: true }));
    const fromText = await followHelpLink(page, page.getByRole('main').getByRole('link', { name: t.startPageLink }));
    // The start page stays open in its own tab.
    await expect(app.start.headline).toHaveText(texts.sv.startPage.headline);
    await fromFooter.close();
    await fromText.close();
  });
});

test.describe('Help page when logged in', () => {
  test('help-009 the help page opens in a new tab from the logged-in pages, and the user stays logged in', async ({ page, app, sharedAccount }) => {
    const t = texts.sv.help;
    await app.start.openLogin();
    await app.login.loginToDashboard(sharedAccount.email, sharedAccount.password);
    const help = await followHelpLink(page, page.getByRole('contentinfo').getByRole('link', { name: t.footerLink, exact: true }));
    // The help page has no logged-in header; visiting it must not end the session.
    await help.close();
    await page.reload();
    await expect(page.locator('#user-eppn')).toHaveValue(sharedAccount.eppn!);
  });
});
