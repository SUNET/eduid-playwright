# eduID — Playwright end-to-end tests

Automated browser tests for the eduID web application on **dev.eduid.se**, written in TypeScript with [Playwright](https://playwright.dev).
This suite replaces the Selenium/Java suite in [SUNET/eduid-automated-tests](https://github.com/SUNET/eduid-automated-tests), area by area.

* 207 tests in 16 spec files, run on desktop Chrome, Firefox and Safari (WebKit) and on two phones (Pixel 7/Chromium, iPhone 14/WebKit): functional (including identity verification with Freja+ and eIDAS), Swedish/English UI, WCAG 2.1 AA (axe), security including brute-force limits, redirects and output escaping, mobile
* Every test creates its own account, so there are no shared passwords, no fixed run order and tests run in parallel
* About 28 minutes for the full suite (all six projects) with 4 workers

| Document | Content |
|---|---|
| [docs/TEST_SPECIFICATION.md](docs/TEST_SPECIFICATION.md) | Scope, approach, every test case, traceability to the Java TCs, backlog |
| [docs/TEST_PROTOCOL.md](docs/TEST_PROTOCOL.md) | Latest execution record, defects and observations |
| [CLAUDE.md](CLAUDE.md) | Conventions for anyone (human or AI) changing the suite |

## Prerequisites

* Node.js ≥ 20
* Network access to `dev.eduid.se`
* The value of the **`autotests` magic cookie** for dev. It enables the test-only `get-code` endpoints and the fixed CAPTCHA. Ask the eduID team for it; it is the same value as `autotests_cookie_value` in the Java suite's `src/main/resources/staging.properties`.

## Setup

```bash
npm ci                         # or: npm install
npx playwright install chromium firefox webkit
cp .env.example .env           # then fill in EDUID_AUTOTESTS_COOKIE
```

If you already have the Java suite checked out and configured, you can point at its properties file instead of copying the secret (adjust the path to where your checkout is):

```bash
echo 'EDUID_PROPERTIES_FILE=../eduid-automated-tests/src/main/resources/staging.properties' > .env
```

All settings (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `EDUID_BASE_URL` | `https://dev.eduid.se` | Environment under test |
| `EDUID_AUTOTESTS_COOKIE` | none, **required** | Magic cookie value |
| `EDUID_PROPERTIES_FILE` | none | Read the values above from a Java `.properties` file |
| `EDUID_COOKIE_DOMAIN` | `.<host>` | Domain for the magic cookie |
| `EDUID_*_CODE_URL` | derived from the host | Override the code endpoints |
| `EDUID_TEST_EMAIL_DOMAIN` | `dev.eduid.sunet.se` | Domain for generated accounts |

## Running

```bash
npm test                       # everything: projects chromium + firefox + webkit + mobile + mobile-safari + a11y
npm run test:smoke             # @smoke subset (about 1 min)
npm run test:a11y              # WCAG scans only
npx playwright test tests/login.spec.ts            # one file
npx playwright test -g "reset-password-002"        # by test ID
npx playwright test --project=chromium --headed --workers=1   # watch it run
npm run test:ui                # Playwright UI mode
npm run report                 # open the last HTML report
npm run lint                   # type check and spell check of the expected UI texts
npm run spell                  # spell check only (cspell, src/i18n.ts, Swedish + English)
```

Projects (`playwright.config.ts`):

| Project | What | Device |
|---|---|---|
| `chromium` | All functional tests | Desktop Chrome, 1280×900, `sv-SE` |
| `firefox` | `@smoke` plus all tests in start-page, login, registration, reset-password, account, dashboard, identity and help | Desktop Firefox, 1280×900 |
| `webkit` | Same selection as `firefox` | Desktop Safari (WebKit), 1280×900 |
| `mobile` | Tests tagged `@mobile` and `@smoke` | Pixel 7 emulation (Chromium) |
| `mobile-safari` | Tests tagged `@mobile` and `@smoke` | iPhone 14 emulation (WebKit) |
| `a11y` | `accessibility.spec.ts` | Desktop Chrome |

Tags: `@smoke` (release-blocking subset), `@security`, `@mobile`, `@mobile-only`, `@slow` (other-device-015 waits 3.5 minutes in real time, brute-force-006/brute-force-007 type about 50 wrong passwords; skip them with `--grep-invert @slow`). Every title starts with a test ID named after its spec file (`start-page-001`, `registration-004`, `accessibility-017`, …), so `-g` works for them too. The IDs used before, from the Java suite, are listed in §8 of the specification.

Results are written to:

* `playwright-report/`: HTML report with steps, screenshots, video and trace for failures
* `test-results/junit.xml`: for CI

> Traces and HTML reports record network traffic, including the magic cookie and the passwords of the generated test accounts. Treat them as internal: they are git-ignored, so keep CI artifacts private.

## Project layout

```
eduid-playwright/
├── playwright.config.ts      projects, timeouts, reporters
├── src/
│   ├── config.ts             env/.env/properties → typed config
│   ├── fixtures.ts           test fixtures: app, account, loggedInAccount, sharedAccount, magicCookie
│   ├── i18n.ts               expected UI texts, sv + en
│   ├── helpers/
│   │   ├── codes.ts          magic/nin cookies, get-code endpoints (polling)
│   │   ├── testdata.ts       unique e-mails, random names and test personal-ID numbers
│   │   ├── ui.ts             fillStable, enterSixDigitCode, setLanguage, errorNotification
│   │   └── webauthn.ts       CDP virtual authenticator (security key / passkey)
│   └── pages/                page objects (Start, Login, Register, PasswordForm, Header, Profile pages, RefIdp, Eidas)
├── tests/                    *.spec.ts, one file per functional area
├── test-data/                names and Skatteverket test personal-ID numbers (from the Java suite)
└── docs/                     specification, protocol
```

## How the tests get accounts

| Fixture | Use for | Cost |
|---|---|---|
| `account` | A brand-new account (registered in a separate browser context). The test page is still on the start page. | ~8 s |
| `loggedInAccount` | Same as `account`, already logged in on `page`, with `eppn` filled in | ~12 s |
| `verifiedAccount` | A new account whose identity is verified with Freja+ (reference IdP). Not logged in on `page` | ~25 s |
| `sharedAccount` | One account per worker, for read-only tests. **Never change its state.** | once per worker |

Registration goes through the real UI (name + e-mail → CAPTCHA → terms → code from `get-code` → suggested password), so every run also exercises the main registration flow. The accounts stay on dev; this is the same as with the Java suite.

### Freja+ and the reference IdP

With the magic cookie, dev sends Freja+ to the Sweden Connect reference IdP instead of the real Freja. There the test types the personal ID number and names of the person to authenticate as (`RefIdpPage`), and the `nin` cookie must carry the same number. `verifyIdentityWithFreja(page, person)` in `src/fixtures.ts` does the whole flow. A personal ID number can be verified on only one account at a time, so `randomPerson()` gives concurrently running workers separate numbers. Real Freja eID needs the phone app; those tests only check that the browser reaches the Freja eID service.

### eIDAS

eIDAS goes through the Sweden Connect country selection to test country XA, where the test chooses one of the IdP's fixed test persons and the level of assurance (`EidasPage`). An eIDAS identity can be on only one account at a time, so `eidasPerson()` reserves one person per parallel slot; 9 persons are available, so **do not run the eIDAS tests with more than 9 workers**. `verifyIdentityWithEidas(page, eidasPerson())` does the whole verification.

## Known product defects

Defects are written as `test.fail()` tests. They pass while the defect exists and turn red ("expected to fail, but passed") once it is fixed. Then remove the `test.fail(...)` line.

| ID | Test | Summary |
|---|---|---|
| DEF-01 | login-007 | A username with a trailing or leading space is rejected |
| DEF-03 | registration-009 | A second registration in the same session shows no form fields |
| DEF-07 | eidas-006 | The remove button of a verified eIDAS identity has no accessible name |
| DEF-08 | other-device-007 | Cancel on device 1 does not stop a login with another device once device 2 has logged in |
| DEF-10 | accessibility-029, accessibility-032 | Dialogs are not modal: no focus handling, Escape does not close them |
| DEF-13 | mobile-011 | Registration name fields have no autocomplete purpose |
| DEF-15 | brute-force-007 | A locked login (after about 50 wrong passwords) is not lifted by a password reset |
| DEF-16 | accessibility-033 | The page language (`<html lang>`) does not follow the language switch |
| DEF-17 | help-006 | Two help topics share the same `id` |

The full list, including accessibility and observations, is in [docs/TEST_PROTOCOL.md](docs/TEST_PROTOCOL.md).

## CI example (GitHub Actions)

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run lint
      - run: npx playwright install --with-deps chromium firefox webkit
      - run: npx playwright test
        env:
          CI: 'true'
          EDUID_AUTOTESTS_COOKIE: ${{ secrets.EDUID_AUTOTESTS_COOKIE }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: playwright-report }
```

With `CI=true` the suite uses 2 workers, 1 retry (retried tests are reported as *flaky*) and forbids `test.only`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `EDUID_AUTOTESTS_COOKIE … is not set` | Create `.env` (see Setup) |
| Every test fails while setting up the `account` fixture | dev is down, or the cookie value has changed. Try `npm run test:smoke` and look at the trace |
| A "NotSupportedError: Resident credentials…" banner in screenshots | Expected in headless Chromium (DEF-04). It does not affect the tests |
| WCAG test fails on a new element | A new serious or critical violation. Fix it, or add it to `KNOWN_ISSUES` with a defect id |
| Texts changed in the product | Update `src/i18n.ts`, which is the only place where texts live |
| `Freja+ verification failed: …` from the `verifiedAccount` fixture | dev rejected the reference IdP answer; the message is dev's own. "Felaktigt format av identitetsnumret" means the `nin` cookie was missing or held another number |
| An "HTTP 500" banner in a failure screenshot | A dev server error (OBS-18), not a test problem. The test's `server-errors.txt` attachment in the HTML report names the failing request |
| `eIDAS tests support at most 9 parallel workers` | Lower `--workers`; see the eIDAS section above |
| eIDAS tests time out on `con.sandbox.swedenconnect.se` or `cef20hub.eidastest.se` | The external eIDAS test services are slow or down. Check them in a browser |
| Freja tests time out on `ref-idp.sandbox.swedenconnect.se` | The external reference IdP is slow or down. Check it in a browser; the rest of the suite does not depend on it |
