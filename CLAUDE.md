# CLAUDE.md: eduID Playwright suite

Guidance for Claude Code (and humans) working in this repository. The legacy Selenium/Java suite that these tests replace lives in a separate repository, [SUNET/eduid-automated-tests](https://github.com/SUNET/eduid-automated-tests).

## Commands

```bash
npm run lint                                   # tsc --noEmit + cspell on src/i18n.ts; run after every change
npx playwright test tests/<file>.spec.ts --project=chromium --reporter=list
npx playwright test -g "reset-password-002" --project=chromium
npm run test:smoke
npm test                                       # full: all projects, ~28 min
```

* The suite runs against the **shared dev environment** (`dev.eduid.se`) and creates real accounts there. Prefer running single files while iterating.
* Configuration comes from `.env` (git-ignored). The magic cookie is a secret: never print it, log it, commit it, or copy it into another file.
* Never start two Playwright runs in this folder at the same time: each run deletes `test-results/` when it starts, which breaks the other run's traces (`ENOENT … .playwright-artifacts`) and destroys its failure artifacts.
* When a test fails, read `test-results/<test>/error-context.md` (page snapshot) and the screenshots before changing anything. For flows with two browser contexts, `test-failed-2.png` is the second page.

## Architecture rules

* **Tests own their data.**
  * Use `loggedInAccount` or `account` for anything that changes state: names, e-mail, password, keys, language, delete.
  * Use `verifiedAccount` when the test needs an identity that is already verified (Freja+ through the reference IdP). Like `account`, it is not logged in on `page`. To verify inside a test, call `verifyIdentityWithFreja(page, person)` from `src/fixtures.ts`.
  * Personal ID numbers come from `randomPerson()`, which keeps concurrently running workers on separate numbers. Do not pick numbers yourself: verifying a number on one account removes it from any other account (freja-008).
  * Use `sharedAccount` only for read-only checks, and call `setLanguage(page, 'sv')` after logging in. The account's language is stored on the server, and another test in the same worker may have changed it.
  * Never hard-code credentials or account names.
* **No fixed sleeps.** Use web-first assertions (`await expect(locator)…`), `expect.poll` (codes) or `toPass` (`fillStable`). The only allowed `waitForTimeout` is a deliberate "nothing must happen" window in a negative test, with a comment.
* **Type into React forms with `fillStable()`.** Some forms initialise again after mounting and wipe early input. Exception: the national ID input masks its value (`••••`), so use `pressSequentially` there.
* **Locators:** prefer ids that exist in the app (`#login-form-button`), then roles and text. No absolute XPath. Put page-specific locators in `src/pages/*` as getters (not class fields, which would run before the constructor sets `page`).
* **Page objects do not assert on texts and never branch on which test is calling them.** That was the main design problem of the Java suite. Text checks belong in the spec and use `src/i18n.ts`.
* **Texts:** add to both `sv` and `en` in `src/i18n.ts` only after you have seen the text on dev. Button labels are upper-cased by CSS, so compare them with a case-insensitive regex.
* **Spell check:** `npm run spell` checks `src/i18n.ts` with cspell (English, British English and Swedish). The texts must match the product, so never correct a word in `i18n.ts` to please the checker: a real misspelling is a product defect (record it in `docs/TEST_PROTOCOL.md`), and a correct word the dictionaries lack (a name or a compound) goes in `words` in `cspell.json`.
* **Error messages:** assert the specific text, or use `errorNotification(page)`. Do not assert "some `[role=alert]` is visible": headless Chromium always shows a WebAuthn `NotSupportedError` banner on login pages (DEF-04).
* **WebAuthn** (Chromium only):
  * `VirtualAuthenticator.attach(page)` creates a non-discoverable USB key, i.e. a classic second factor.
  * `attach(page, 'internal')` creates a passkey.
  * To log in "on another computer" with the same key, copy its credentials with `credentials()` / `importCredentials()` into a fresh context.
* **Step-up actions** (removing a key, changing the MFA preference, verifying a key) open a security-check dialog (`#security-confirm-modal-accept-button`) and then MFA login. Handle that path.
* **Freja+ / reference IdP:** set the `nin` cookie to the same number you type at the IdP (`addNinCookie`), otherwise dev answers "Felaktigt format av identitetsnumret". `RefIdpPage.authenticateAs()` types (the IdP only enables its button on key events) and waits until the browser is back on eduID. Real Freja eID (`oidc-ct.test.frejaeid.com`) needs the phone app: only test the hand-over.
* **eIDAS:** use `eidasPerson()` (the XA person reserved for the worker's parallel slot) and `verifyIdentityWithEidas(page, person)`. Never hard-code another XA person: one identity can be on one account only, and a parallel test would lose it. `EidasPage.authenticateAs()` picks person and level (`'substantial'` by default; `'low'` is rejected by dev) and clicks through consent.
* **Back on eduID** means the app's own origin (`config.baseUrl`). The SAML endpoints on `dashboard.`/`idp.` are hops; the IdP page objects already wait for the right origin. After that, wait for the page you expect, not just the URL, because the app may still be redirecting.
* **Desktop Firefox and WebKit** (`firefox`, `webkit`) run `@smoke` plus every test in the files listed in `CROSS_BROWSER` (`playwright.config.ts`; the grep matches file names). A new spec file for a page rendered in the browser belongs in that list. Don't add `browserName` branches to work around an engine; if a flow differs between engines, find out why.
* **Phones:** the `mobile` (Pixel 7, Chromium) and `mobile-safari` (iPhone 14, WebKit) projects run `@mobile` and `@smoke`. Tag a new flow `@mobile` if people use it on phones. Use `app.header.goTo()`/`logout()` for navigation: they handle the collapsible menu. Use `tap()` only in tests about touch; CDP features (virtual authenticator) need `test.skip` on non-Chromium.
* **Timers:** use `page.clock.install()` + `fastForward()` for the 3-minute other-device timers. It only moves the browser: anything that depends on the server having expired the request needs real time (other-device-015, tagged `@slow`).
* **Brute-force tests** (`brute-force.spec.ts`) lock real accounts: a login lock lasts until the next calendar month, a reset lock until the code expires. Only ever run them on throw-away accounts (`account`, `loggedInAccount`), never on `sharedAccount`, and keep them out of the Firefox/WebKit and phone selections.
* **Server errors:** the `context` fixture attaches every 5xx response from eduID hosts to the test (`server-errors.txt`). Check it first when a test fails with an "HTTP 500" banner; that is a dev problem, not a test problem.
* **Flows that leave eduID** (reference IdP, Freja eID) and logins can take more than 10 s on dev under load. Use the 30 s waits that are already in `RefIdpPage` and `loginToDashboard` instead of adding new timeouts.

## Test IDs and tags

* Titles start with an ID `<spec file>-nnn`, for example `login-003` in `login.spec.ts` or `accessibility-017` in `accessibility.spec.ts`. Three digits, numbered per spec file.
  * A new test takes the next free number of its file, wherever it is placed in the file. Never renumber or reuse an ID: the protocol and defects refer to them.
  * A test that moves to another spec file gets a new ID there; note the old one in §8 of `docs/TEST_SPECIFICATION.md`.
  * Where a test comes from in the Java suite (`TC_n`) is recorded in §6 and §8 of the specification, not in the title.
* Tags: `@smoke` for release-blocking tests, `@security`, `@mobile` (also runs in the mobile project), `@mobile-only` (excluded from desktop).
* When you add or change a test, update `docs/TEST_SPECIFICATION.md` (§5 table, §6/§7 traceability, and §8 for a moved test).
* A product bug found by a test: write the test for the correct behaviour, add `test.fail(true, 'DEF-nn: …')`, put `[known defect DEF-nn]` in the title, and record the defect in `docs/TEST_PROTOCOL.md` §3.
* Accessibility: known violations go into `KNOWN_ISSUES` in `tests/accessibility.spec.ts`, keyed `page:rule:target`, with a DEF id. Never add a whole rule id. `*` as page is only for shared components (the notification banner). Scan names are `page` or `page@variant` (`@en`, `@dark`, `@mobile`, `@error`); known issues match the page part. A new page, step or dialog in the app needs a scan; use `step()` (soft) inside flows.

## Environment facts (dev)

* Logged-in routes: `/start`, `/identity`, `/security`, `/account`, `/chpass`. `/profile/*` is the old structure and shows a 404.
* Magic CAPTCHA: `123456` (only with the `autotests` cookie).
* Code endpoints: see `src/config.ts`.
  * signup: 6 digits, by e-mail
  * reset password: 6 digits, by EPPN
  * e-mail confirmation: 10 characters, by e-mail + EPPN
  * letter: 10 characters, uses the session
* The MFA step of login, re-authentication and reset password lists alternatives (Freja+, eIDAS, BankID) under "Visa andra alternativ"; use `chooseOtherAuthOption()`. Which ones appear depends on the identities the account has.
* Accounts without a verified identity or MFA skip the "extra security" step in reset password. With a verified identity the step offers "Visa andra alternativ" (react-select: BankID, Freja+) and "continue without", which removes the verified identity (freja-006). With a key it also offers `#mfa-security-key`.
* A deleted account stays for a few days and is restored by a password reset (freja-007). Deleting an account with MFA needs a step-up; afterwards, "Logga in" in the same browser leads to a "Raderat konto" page with "Till återställ lösenord" (eidas-008). From another browser the login only says "wrong e-mail or password".
* Verifying a security key with Freja+ also verifies the identity of an unverified account (freja-011).
* A passkey registration ends logged in. A password registration ends on the login page.
