import { expect, Locator, Page } from '@playwright/test';

export type Section = 'start' | 'identity' | 'security' | 'account';

/** Logged-in header: main menu (desktop layout) and logout. */
export class Header {
  get logoutButton() { return this.page.locator('#logout'); }
  get logo() { return this.page.locator('#header a.eduid-logo'); }
  get mobileMenuButton() { return this.page.locator('#header nav > button'); }

  constructor(private readonly page: Page) {}

  menuLink(section: Section) {
    return this.page.locator(`#header a.menu-item[href="/${section}"], #header a.menu[href="/${section}"]`).first();
  }

  /**
   * Navigates through the menu (not page.goto) so the SPA keeps its state,
   * and waits for the matching page title instead of a fixed sleep.
   */
  async goTo(section: Section): Promise<void> {
    const titles: Record<Section, RegExp> = {
      start: /^Start \|/,
      identity: /^(Identitet|Identity) \|/,
      security: /^(Säkerhet|Security) \|/,
      account: /^(Konto|Account) \|/,
    };
    await this.revealInMenu(this.menuLink(section));
    await this.menuLink(section).click();
    await expect(this.page).toHaveTitle(titles[section]);
  }

  /**
   * At phone width the items sit in a collapsible menu. Open it only when the item is hidden (the
   * button toggles), and tap again if a tap during a re-render was lost.
   */
  private async revealInMenu(item: Locator): Promise<void> {
    await expect(async () => {
      if (!(await item.isVisible()) && (await this.mobileMenuButton.isVisible())) {
        await this.mobileMenuButton.click();
      }
      await expect(item).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  }

  async logout(): Promise<void> {
    await this.revealInMenu(this.logoutButton);
    await this.logoutButton.click();
    await expect(this.page.locator('#login-button')).toBeVisible();
  }
}
