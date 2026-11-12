# Test specification: eduID web (Playwright)

| | |
|---|---|
| Document | TEST_SPECIFICATION.md |
| Version | 1.12, 2026-10-27 (1.1: Freja+ identity verification, `verifiedAccount` fixture; 1.2: eIDAS; 1.3: security keys in registration; 1.4: login with other device, all variants; 1.5: WCAG scans of every page, step, dialog and variant; 1.6: mobile devices; 1.7: desktop Firefox and Safari; 1.8: brute-force limits; 1.9: redirects and output escaping; 1.10: test IDs named after the spec file, e.g. `login-003`, see §8; 1.11: the language switch and the page language; 1.12: help page, all topics, contact and links to it) |
| System under test | eduID web front end and back end on **dev.eduid.se** (staging), front-end build `index.staging.js?15111f1a2c06cc09fd32` |
| Test code | `tests/*.spec.ts` |
| Related | [TEST_PROTOCOL.md](TEST_PROTOCOL.md) (results); the Java suite is in [SUNET/eduid-automated-tests](https://github.com/SUNET/eduid-automated-tests) |

## 1. Purpose and scope

The goal is to verify, end to end and automatically, that an eduID user can create, use, secure and delete an account. The suite should give a release-readiness signal for each dev deployment.

**In scope**

* Start page, login (password, passkey, MFA with a security key, other device, remember me)
* Registration with e-mail
* Dashboard and navigation
* Identity (letter proofing, Freja+ through the reference IdP, eIDAS through test country XA, removing a verified identity, names)
* Verifying security keys with Freja+ and eIDAS; eIDAS as second factor at login and in reset password
* Security keys
* Account settings: e-mail addresses, language, password change, delete account
* Reset password
* Help pages
* Swedish and English UI
* WCAG 2.1 AA (automated part)
* Basic web security: access control, session handling, cookies, headers, output encoding, test back-doors
* Mobile layout

**Out of scope for this version** (see §7 Backlog)

* BankID: it cannot be completed automatically, so only "reaching the IdP" can be tested.
* Real Freja eID ("Most countries" and the Freja eID key option): it needs the mobile app, so only the hand-over to the Freja eID service is tested.
* SWAMID, DNP and other external service providers
* The support tool
* ORCID and Ladok linking
* Native mobile apps (Appium)
* Load tests (`loadtests/` stays JMeter/Locust)

## 2. Test environment

| Item | Value |
|---|---|
| Web | `https://dev.eduid.se` with `idp.`, `signup.` and `dashboard.` sub-domains |
| Browsers | Chromium (Desktop Chrome profile 1280×900, `sv-SE`); phones: Pixel 7 (Chromium, Android) and iPhone 14 (WebKit, the engine of every iOS browser) for `@mobile` and `@smoke`; desktop Firefox and Safari (WebKit), 1280×900, for the browser-sensitive pages (start page, login, registration, reset password, account, dashboard, identity, help) and every `@smoke` flow; tablet (iPad Mini viewport), landscape and 320 px inside the mobile tests |
| Test back-doors | `autotests` cookie, which enables `get-code` endpoints and the fixed CAPTCHA `123456`; `nin` cookie for the reference IdPs |
| eIDAS | EU citizen → Sweden Connect country selection (`con.sandbox.swedenconnect.se`) → test country XA (`cef20hub.eidastest.se/test/idp/XA`), where the test picks one of 12 test persons and the level of assurance → consent page (`xa.testnode.eidastest.se`) → eduID |
| Reference IdP | With the cookie, Freja+ goes to the Sweden Connect reference IdP (`ref-idp.sandbox.swedenconnect.se`), where the test types the personal ID number and names to authenticate as. The `nin` cookie must hold the same number. |
| Code endpoints | signup `signup.<env>/services/signup/get-code/?email=`, reset `idp.<env>/services/reset-password/get-email-code?eppn=`, e-mail `dashboard.<env>/services/email/get-code?email=&eppn=`, letter `dashboard.<env>/services/letter-proofing/get-code` |
| WebAuthn | Chrome DevTools Protocol virtual authenticator, both USB (non-discoverable security key) and internal (passkey) |
| Tooling | Node ≥ 20, `@playwright/test` 1.59.1, `@axe-core/playwright` 4.11.0, TypeScript 5.8 |

## 3. Approach

* **Levels:** system tests through the browser, plus API-level checks against the same back-ends (headers, back-doors).
* **Types:** functional (positive and negative), UI text and i18n, accessibility, security, responsive layout.
* **Techniques:**
  * Equivalence classes and error guessing for inputs: names with Swedish characters and HTML, invalid e-mail, weak, mismatched, whitespace and upper-case input.
  * State-transition testing for the registration, reset and MFA flows.
  * Two-browser scenarios for "other device" and "same key on another computer".
* **Independence:** each test that changes state registers its own account (`account` / `loggedInAccount` fixtures, or `verifiedAccount` for an account whose identity is already verified with Freja+). Read-only tests share one account per worker (`sharedAccount`). Tests can run in any order and in parallel.
* **Language:** label tests run once per language from `src/i18n.ts`. Negative tests check the Swedish message.
* **Known product defects** are written as `test.fail()` tests tagged with a DEF id. They pass while the defect exists and are flagged as soon as it is fixed.
* **Priorities:** P1 = release blocker; P2 = important; P3 = nice to have. `@smoke` marks the P1 subset that gives a fast signal.

### Entry criteria
* dev.eduid.se answers HTTP 200 and the magic cookie value is configured.
* `npx tsc --noEmit` passes.

### Exit criteria
* All P1 tests pass.
* No unexpected failures. Expected failures (`test.fail`) must have an open defect.
* No new serious or critical axe violations.
* Flaky tests (passed on retry) are listed in the protocol.

### Suspension
Suspend the run when dev is down, the magic cookie is rejected, or registration fails for every worker. In those cases every test that depends on an account fails for an environment reason.

## 4. Test data

* E-mail addresses are generated per test: `pw<10 hex>@dev.eduid.sunet.se` (`src/helpers/testdata.ts`).
* Names and test personal-ID numbers are picked at random from `test-data/*.txt`, which are copied from the Java suite. They are Skatteverket test identities, not real people.
* eIDAS identities come from the XA test IdP's fixed list. An eIDAS identity can also be on only one account at a time (eidas-004), so `eidasPerson()` gives each parallel slot its own person; 9 persons are used, so **at most 9 workers** may run the eIDAS tests at once. Their Swedish numbers are excluded from the Freja pool.
* A personal ID number can be verified on only one account at a time (freja-008). The list is therefore split into 16 slots by `TEST_PARALLEL_INDEX`, and a worker never uses a number twice, so tests running at the same time never take a verified identity from each other.
* Passwords come from the "suggested password" function, or a custom strong password per test.
* No credentials are stored in the repository.

## 5. Test cases

Columns: **ID** (`<spec file>-nnn`, numbered in the order of the spec file; §6 and §8 show where a test comes from in the Java suite) · **P** priority · **Tags**. Steps and expected results are summarised; the spec file is the executable detail.

### 5.1 Start page (`start-page.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| start-page-001 (sv/en) | Start page texts and buttons | 1 | Open `/`, select the language | Title, headline, 2 paragraphs, 4 steps, Sign up / Log in buttons, footer ©2013-<current year> |
| start-page-002 | Start page links respond | 2 | Collect every link in main and footer, then GET each | Every status < 400 |
| start-page-003 | Unknown route | 2 | Open `/this-page-does-not-exist`, click "Gå till eduID" | Not-found page; the link returns to the start page |
| start-page-004 | Browser language is respected | 3 | Context locale en-GB, open `/` | English UI |
| start-page-005 | Dark mode toggle | 3 | Toggle "Utseende", reload | Theme changes and persists after reload (desktop and mobile) |
| start-page-006 | Language switch names the other language | 2 | On the start, login, reset-password and registration pages: read the footer switch, then switch twice | The switch says "English" while the page is Swedish and "Svenska" while it is English; the headline or page title follows each switch |

### 5.2 Login (`login.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| login-001 (sv/en) | Login page texts | 1 | Open login, select the language | Heading, placeholders, forgot link, Log in / Other device / Cancel / Passkey buttons, remember-me text |
| login-002 | Wrong password | 1 | Valid user, wrong password | "E-postadressen eller lösenordet är felaktigt." and its English version; not logged in |
| login-003 | Unknown user | 2 | Non-existent user | Same message as for a wrong password (no account enumeration) |
| login-004 | Login, logout, Back | 1 | Log in, log out, browser Back, open `/start` | Dashboard after login; after logout no user data via Back and `/start` needs login |
| login-005 | Log in with EPPN | 2 | Unique ID as username | Logged in as the same EPPN |
| login-006 | Upper-case username | 2 | Username in upper case | Logged in |
| login-007 | Username with trailing space | 2 | `"user@x "` | Logged in. **Known defect DEF-01** (`test.fail`) |
| login-008 | Show/hide password | 3 | Type a password, press Show twice | Input type password → text → password |
| login-009 | Keyboard-only login | 2 | Tab and Enter only | Logged in (focus order noted as DEF-02) |
| login-010 | Remember me on | 2 | Log in with remember me on, log out, open login | "Välkommen tillbaka, <name>", "Inte du?", only the password is asked |
| login-011 | Remember me off | 2 | Log in with remember me off, log out | Empty username field |
| login-012 | "Not you?" | 2 | Remembered user → Not you → log in as another user | Second user is logged in |
| login-013 | Password needed after logout | 1 | Log in, log out, log in again | The password field is empty and required |
| login-014 | No passkey autofill support | 2 | Remove conditional-UI support before the app starts (`isConditionalMediationAvailable` → false), open the login page | The passkey button is shown, the app makes no conditional passkey request, and no "NotSupportedError" banner appears (DEF-04; needs the eduid-front change that gates the request, PR #2528) |

### 5.3 Registration (`registration.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| registration-001 (sv/en) | Registration page texts | 1 | Open registration, show the form | Heading, intro, BankID / Freja+ / eIDAS / Freja eID buttons, show/hide toggle, labels, placeholders, step 1 of 5 active |
| registration-002 | Form validation | 2 | Empty fields → invalid e-mail → cleared first name → valid data | Button disabled, then "Fältet kan inte vara tomt", then enabled |
| registration-003 | Register with suggested password | 1 | Name + e-mail → CAPTCHA → terms → e-mail code → suggested password → done → log in | Dashboard: welcome with name, "Bekräftat konto", "Verifiera din identitet", "Öka säkerheten" |
| registration-004 | Register with custom password | 1 | As registration-003 but with a custom password | Login with the custom password works |
| registration-005 | Cancel at terms | 2 | Up to the terms, Cancel | Back to the registration-method page |
| registration-006 | Cancel at e-mail code | 2 | Up to the code page, Cancel | Back to the registration-method page |
| registration-007 | Wrong e-mail code | 1 | Wrong code, then the correct code | "E-postverifieringen misslyckades…", then the password step |
| registration-008 | E-mail already registered | 1 | Register an existing e-mail | "E-postadressen är redan registrerad." |
| registration-009 | Second registration without reload | 3 | Register, then open registration again | Form fields shown. **Known defect DEF-03** |
| registration-010 | Second registration after reload | 2 | As registration-009 with a reload | Second account registered and can log in |
| registration-011 | Wrong CAPTCHA | 2 | CAPTCHA `000000` | "Det uppstod ett problem med verifieringen av att du är människa…"; terms not shown |
| registration-013 | CAPTCHA back-door closed | 1 | Without the magic cookie, CAPTCHA `123456` | Error; terms not shown |
| registration-012 | HTML/script in name | 1 | First name `<b>…<img onerror>` | Shown as literal text; no element injected; no script run |

### 5.4 Dashboard, navigation, access control (`dashboard.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| dashboard-001 (sv/en) | Dashboard texts | 1 | Log in, select the language | Title, welcome with name, unique ID = EPPN, status overview with 4 items, menu labels |
| dashboard-002 | Menu and anchors | 2 | Visit Identity / Security / Account / Start through the menu | Each page loads; each sub-menu anchor (`#…`) exists |
| dashboard-003 | Copy unique ID | 3 | Click Copy | Clipboard = EPPN |
| dashboard-004 | Logo link | 3 | Click the eduID logo | No 404 (logo still points at `/profile/`, see OBS-01) |
| dashboard-005 ×5 | Protected routes | 1 | Open `/start`, `/identity`, `/security`, `/account`, `/chpass` without a session | Login is shown; no user data |
| dashboard-006 | Server-side logout | 1 | Save cookies, log out, replay the cookies in a new browser | No access |
| dashboard-007 | Cookie flags | 2 | Inspect cookies after login | All session cookies are Secure and HttpOnly |
| dashboard-008 ×3 | Security headers | 2 | GET `dev.`, `idp.`, `dashboard.` | HSTS, `nosniff`, frame protection |
| dashboard-009 | Language switch on the logged-in pages | 2 | On start, identity, security and account: read the footer switch, then switch twice | The switch names the other language; the page title and the menu follow each switch |

### 5.5 Account settings (`account.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| account-001 (sv/en) | Account page | 2 | Open Account | Intro, 7 section headings, EPPN, primary e-mail, "+ Lägg till fler" |
| account-002 | Duplicate e-mail | 2 | Add the primary address again | "E-postadressen finns redan i listan."; Add is disabled |
| account-003 | Invalid e-mail | 2 | `notAvalidEmailAtgmail.com` | "Ogiltig e-postadress"; Add is disabled (this check never ran in the Java version) |
| account-004 | Abort delete | 1 | Delete eduID → Close | Dialog text shown, then closed; still on Account |
| account-005 | Change names | 1 | Identity → Change → new names → log out / log in | New names on the dashboard and identity page |
| account-006 | Unicode names | 2 | `Åsa-Märta` / `Öberg-D'Ångström` | Stored and shown unchanged |
| account-007 | Preferred language | 2 | Account → English → log out / log in | Logged-in UI in English |
| account-008 | Extra e-mail | 1 | Add → confirm with code → log in with it → make primary → back → remove | All state changes are visible; login with the new address works |
| account-009 | Wrong e-mail code | 2 | Wrong 10-character code | "Ogiltig kod eller en kod som har gått ut…"; the address stays unconfirmed |
| account-010 | Suggested new password | 1 | Change password → suggested → done → log out | Old password rejected, new password works |
| account-011 | Custom new password | 1 | Custom strong password | New password works |
| account-012 | Abort password change | 2 | Cancel | Old password still works |
| account-013 | Mismatched passwords | 2 | Two different values | "Det nya och repeterade lösenordet är olika."; Save is disabled |
| account-014 | Weak password | 2 | `test` | Save is disabled |
| account-015 | Delete account | 1 | Delete eduID → confirm → log in again | Login rejected |

### 5.6 Reset password (`reset-password.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| reset-password-001 (sv/en) | Reset start page | 2 | Login → Forgot | Heading, placeholder, Send e-mail button |
| reset-password-002 | Reset without extra security | 1 | E-mail → CAPTCHA → code → suggested password → done | Old password rejected, new password works |
| reset-password-003 | Wrong reset code | 1 | Code `000000` | "Det gick inte att fortsätta återställningen…"; no password form |
| reset-password-004 | Cancel reset | 3 | Cancel | Back on the login page |
| reset-password-005 | Unknown e-mail | 2 | Non-existent e-mail | "Användaren hittades inte…" (OBS-02: reveals whether an account exists) |
| reset-password-006 | Back-doors closed | 1 | Call all 4 `get-code` endpoints without the cookie | No 2xx response and no code |

### 5.7 Security keys and passkeys (`security-key.spec.ts`, Chromium only)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| security-key-001 (sv/en) | Security page texts | 2 | Open Security | MFA and manage-keys headings, buttons, "Ingen säkerhetsnyckel har lagts till" |
| security-key-002 | Add a security key | 1 | Security key → name (max 50) → OK → Not now | Key listed with verify options; "Always use" is on; dashboard shows "Ökad säkerhet" |
| security-key-003 | MFA login | 1 | Key added → new browser with the same key → password | MFA page, then the key → dashboard |
| security-key-004 | Lost key | 1 | New browser with an empty authenticator | MFA cannot be completed |
| security-key-005 | MFA preference off | 2 | Toggle off → step-up with the key → new browser login | Logged in with the password only |
| security-key-006 | Remove a key | 1 | Remove → security check → re-authenticate with the key | "Ingen säkerhetsnyckel har lagts till" |
| security-key-007 | Register with a passkey | 1 | Registration → "This device" (passkey) → done → new browser → passkey login | Account created without a password; login with the passkey only |
| security-key-008 (sv/en) | Sign-in method step | 2 | Registration up to the sign-in method step | Heading, intro, "This device" and "Security key" buttons, password form toggle; no "finish" yet |
| security-key-009 | Register with a USB security key | 1 | Security key → name → (password required) → suggested password → login → key → verify the key with Freja+ | "Den här typen av nyckel kräver även ett lösenord"; no "Slutför" without a password; login needs the key; key "verifierad" and identity verified |
| security-key-010 | Register with only a passkey, then verify it | 1 | This device → name → "Slutför skapandet av eduID" → verify with Freja+ | No password on the completed page; logged in; passkey "verifierad"; identity verified |
| security-key-011 | Register with a passkey and a password | 2 | This device → name → suggested password → done; log in from another browser with the password | Password accepted, then the MFA step is required |
| security-key-012 | Leave the page during the key prompt | 2 | A key that never answers; Security → Säkerhetsnyckel → name; open Start while the prompt is open | `navigator.credentials.create()` was called with an abort signal that is aborted after leaving the page; no key is listed or stored (needs the eduid-front change in PR #2528) |

### 5.8 Identity (`identity.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| identity-001 (sv/en) | Identity page | 2 | Open Identity | Method headings, names section, current names |
| identity-002 | Verify by letter | 1 | Personal ID number → order letter → code from endpoint → OK | Dashboard shows "Verifierad identitet" |
| identity-003 | Wrong letter code | 2 | Wrong code | Error; identity not verified |
| identity-004 | Invalid personal ID number | 3 | `190001011234` (fails Luhn) | Add is disabled |

### 5.8.1 Identity with Freja+ (`freja.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| freja-001 (sv/en) | Freja+ information dialog | 2 | Identity → Swedish ID → Freja+ → Fortsätt | Heading, 5 steps, "Använd mitt Freja+" / "Use my Freja+"; the dialog closes |
| freja-002 | Freja+ without the `nin` cookie | 2 | Verify with Freja+ without the cookie | "Felaktigt format av identitetsnumret. Var god försök igen."; identity not verified |
| freja-003 @smoke | Verify identity with Freja+ | 1 | Freja+ → reference IdP as the account's person | Identity page: "Ditt eduID är redo att användas", masked number `yyyymmdd****`, "VISA" shows the full number, names; dashboard "Verifierad identitet" |
| freja-004 | Freja eID ("Most countries") | 3 | Most countries → Fortsätt, then Back | Freja eID login page (`oidc-ct.test.frejaeid.com`); identity still not verified |
| freja-005 | Remove a verified identity | 2 | Remove → dialog (en, then sv) → Bekräfta | Dialog texts in both languages; the verification methods are offered again; dashboard "Verifiera din identitet" |
| freja-006 | Reset password without extra security | 1 | Verified account → reset → "Fortsätt återställa lösenordet" → new password | Login works; the identity is no longer verified |
| freja-007 | Restore a deleted account with Freja+ | 1 | Delete account → reset → other options → Freja+ → custom password | Login with the new password; identity still verified |
| freja-008 | Same identity on a second account | 2 | Second account verifies the first account's personal ID number | Second account verified; the first is not verified any more |
| freja-009 | Verify a key later with Freja+ | 2 | Verified account adds a key → Freja+ in the key list → step-up with the key → reference IdP | Key status "verifierad"; the Freja+ button is gone |
| freja-010 | Remove a verified key | 2 | Verified account: add a key, verify it with Freja+, remove it (step-up if asked) | "Ingen säkerhetsnyckel har lagts till"; login from a fresh browser needs only the password |
| freja-011 | Verify a new key with Freja+; reset with the key | 1 | Unverified account adds a key → "verify now" with Freja+ → step-up → IdP; then reset password on another computer with the key as extra security | Key verified and identity verified (TC_27); after the reset both are still verified |
| freja-012 | Verify a key with Freja eID | 3 | Freja eID in the key list → step-up → Back | Freja eID login page; key still not verified |

### 5.8.2 Identity and MFA with eIDAS (`eidas.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| eidas-001 | Verify identity with eIDAS | 1 | EU citizen → XA → slot person, level Substantial → consent | "Europeisk eIDAS-identitet", "XA <date of birth>"; names replaced by the eIDAS names; a Swedish identity can still be added; dashboard "Verifierad identitet" |
| eidas-002 | Level of assurance Low | 2 | As above with "eIDAS Low" | "Åtkomstfel" page; back to the dashboard; identity not verified |
| eidas-003 | eIDAS and Freja+ on one account | 2 | eIDAS, then Freja+ | Both identities listed; names from the Swedish identity; no more verification options |
| eidas-004 | Same eIDAS identity on a second account | 2 | Second account verifies the same XA person | Second account verified; the first is not verified any more |
| eidas-005 | Remove the eIDAS identity | 2 | Remove → Bekräfta | Verification options offered again; dashboard "Verifiera din identitet" |
| eidas-006 | Remove button has an accessible name | 3 | Read the accessible name of `#remove-identity-eidas` | Same name as for a Swedish identity. **Fails: DEF-07** |
| eidas-007 | eIDAS as second factor at login | 1 | eIDAS account with a key verified via eIDAS; log in on another computer without the key → other options → eIDAS | Dashboard |
| eidas-008 | Restore a deleted MFA account with eIDAS | 1 | eIDAS account with a key verified via eIDAS → delete (step-up with the key) → Logga in in the same browser → "Raderat konto" → "Till återställ lösenord" → reset with eIDAS | Login on another computer with the key: identity and key still verified |

### 5.9 Login with other device (`other-device.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
Device 1 wants to log in and shows a QR code; device 2 (its own browser context) opens the QR target and logs in. Without a remembered user, device 1 types the code device 2 shows; with a remembered user, device 1 presses "Fortsätt". Both devices have a 3-minute timer: the fake-clock tests (Playwright `page.clock`) check the browser side quickly, and other-device-015 waits in real time for the server side.

| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| other-device-001 | Cancel at QR (no remembered user) | 2 | Other device → Cancel | Login page |
| other-device-002 | Wrong code | 2 | Code `000000` | "Felaktig kod, försök igen" |
| other-device-003 @smoke | Full flow with code | 1 | Device 1 shows QR → device 2 logs in → code shown → typed on device 1 | Device 1 logged in |
| other-device-004 @security | Device 2 shows the origin of the request | 2 | Open the QR target on device 2 | "Notera att du använder den här enheten…", device 1's IP address and browser, and the same ID# as device 1 |
| other-device-005 (sv/en) | Three wrong codes | 2 | Three wrong codes on device 1 → Cancel | "Inloggningen är inte giltig längre"; back to login |
| other-device-006 @smoke | Full flow with a remembered user | 1 | Device 1 remembers the user → device 2 confirms "Du loggar in som <name> (<e-mail>)" → logs in (username fixed) → device 1 "Fortsätt" | Device 2: "Stäng det här fönstret…"; device 1 logged in |
| other-device-007 | Cancel on device 1 after device 2 logged in | 2 | As other-device-006, but device 1 presses Avbryt | Back to login; the request cannot be completed. **Fails: DEF-08** |
| other-device-008 | Cancel at QR (remembered user) | 3 | Other device → Cancel | Login page |
| other-device-009 (sv/en) | Cancel on device 2's confirmation page | 2 | Device 2 → Avbryt; device 1 → Fortsätt | Device 2: "Avbrutet. Du kan stänga det här fönstret."; device 1 falls back to the password login, not logged in |
| other-device-010 | Cancel at device 2's password step | 3 | Device 2 → Logga in → Avbryt; device 1 → Fortsätt | As other-device-009 |
| other-device-011 (sv/en) | "Fortsätt" three times without device 2 | 2 | Device 1 presses Fortsätt 3 times → Cancel | "Inloggningen är inte giltig längre"; back to login |
| other-device-012 (sv/en) | Device 1 timeout (fake clock) | 3 | Wait 3 min | "Inloggningsförsöket avbröts eller tog för lång tid…", Avbryt and Försök igen |
| other-device-013 | Retry after timeout (fake clock) | 3 | Timeout → Försök igen | New request with a new ID# |
| other-device-014 (sv/en) | Device 2 timeout (fake clock) | 3 | Device 2 waits 3 min on the confirmation page | "Koden har gått ut och du bör stänga det här fönstret"; no Logga in button |
| other-device-015 @slow | Server-side expiry (real time, ~3.5 min) | 2 | Wait for the real timeout on device 1, open the old QR link on device 2, then Cancel on device 1 | Device 2 cannot proceed; device 1 back to login |

### 5.10 Help (`help.spec.ts`)
| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| help-001 | Help topics | 2 | Read the main topics from the page, open each | The 11 headings (12 topics, see DEF-17) equal `help.topics` in `i18n.ts`, in order; each opens and has content |
| help-002 | Help in English | 3 | Switch to English | Title "Help \| eduID"; page heading, main topic and sub-topic headings in English |
| help-003 | Help links | 2 | Request every external link | Status < 400 |
| help-004 | Help anchors | 3 | `/help#<anchor>` for anchors linked from the app | Each anchor exists |
| help-005 | Sub-topics | 2 | Open every main topic and every sub-topic inside it (three levels), then close them again | The 14 sub-topic headings equal `help.subTopics`; each has content; every topic closes again |
| help-006 | Unique ids | 3 | Count the `id` values on the help page | No `id` occurs twice. **Fails: DEF-17** |
| help-007 (sv/en) | Contact | 2 | Open "Kontakt med eduID support" | `support@eduid.se` is shown as a `mailto:` link |
| help-008 | Links to help | 2 | Click "Hjälp" in the footer and "hjälpinnehåll" on the start page | Each opens the help page in a new tab; the start page stays open |
| help-009 | Help when logged in | 2 | Log in, click "Hjälp" in the footer, close the help tab, reload the dashboard | The help page opens in a new tab; the user is still logged in |

### 5.11 Accessibility (`accessibility.spec.ts`, project `a11y`)
Every scan: axe-core with the WCAG 2.0/2.1 A and AA rules. *Serious* and *critical* violations fail, except the documented known issues (`KNOWN_ISSUES`, each with a DEF id); all violations, including moderate and minor, are listed in the report with the full axe JSON. Multi-step flows scan every step with soft assertions, so one violation does not hide later steps. Before each scan the test waits for colour transitions to finish (otherwise contrast is measured mid-fade).

| ID | What is scanned | P |
|---|---|---|
| accessibility-001, accessibility-002, accessibility-003, accessibility-004 | Start, login, registration (form open), help (all sections open) | 2 |
| accessibility-006–accessibility-009 | Dashboard, identity, security, account of a fresh account | 2 |
| accessibility-005 | 404 page; SAML error page ("Åtkomstfel") | 3 |
| accessibility-010 | Registration: CAPTCHA, terms, e-mail code, sign-in method step, completed | 2 |
| accessibility-011 | Registration form with validation errors | 2 |
| accessibility-012 | Login with the "wrong e-mail or password" error | 2 |
| accessibility-013 | MFA login step, re-authentication page, "Raderat konto" page | 2 |
| accessibility-014 | Reset password: e-mail, CAPTCHA, code, extra security, new password, completed | 2 |
| accessibility-015 | Change password: suggested, custom with mismatch error, completed | 2 |
| accessibility-016, accessibility-017 | Other device, code variant: device 1 code entry, wrong code, invalid request; device 2 confirmation, cancelled | 3 |
| accessibility-018 | Other device, remembered user: device 1 "continue", device 2 confirmation and done | 3 |
| accessibility-019 | Other device timeouts on both devices (fake clock) | 3 |
| accessibility-020 | Account: two e-mail addresses, e-mail code dialog, delete dialog | 2 |
| accessibility-021 | Security: name-key dialog, verify-key dialog, a listed key, security-check dialog | 2 |
| accessibility-022 | Identity: Freja+ information dialog, letter order and letter code dialogs | 2 |
| accessibility-023 | Identity with a verified Swedish identity, remove dialog; dashboard of a verified account | 2 |
| accessibility-024 | Identity with a verified eIDAS identity | 2 |
| accessibility-025, accessibility-026 | English: start, login, registration, help; dashboard, identity, security, account | 2 |
| accessibility-027 | Dark mode: the four logged-in pages, start, login | 2 |
| accessibility-028 | Phone width (Pixel 7): the four logged-in pages, the open menu, start, login | 2 |
| accessibility-029 | Keyboard: a dialog takes focus, closes with Escape and returns focus (2.4.3). **Fails: DEF-10** | 2 |
| accessibility-030 | Error messages are in a live region (4.1.3) | 2 |
| accessibility-031 | Registration step 1 with the keyboard only (2.1.1) | 2 |
| accessibility-032 | The key-name dialog focuses its input (2.4.3). **Fails: DEF-10** | 3 |
| accessibility-033 | `<html lang>` follows the language switch (3.1.1): `sv…` on Swedish pages, `en…` on English pages. **Fails: DEF-16** | 2 |

Not automated (manual review needed): 200% zoom and text spacing, screen-reader reading order and announcements beyond K2, meaningful alt texts and link texts, and the remaining WCAG criteria that tools cannot judge.

### 5.12 Mobile (`mobile.spec.ts`, projects `mobile` and `mobile-safari`)

Both phone projects run every test tagged `@mobile` and every `@smoke` flow (registration, login and logout, wrong password, reset password, Freja+ verification, both "other device" variants, help, start page), plus account-008 (add and confirm e-mail), account-010 (change password), account-015 (delete account) and security-key-007 (passkey registration, Chromium only). Tests that need the Chromium virtual authenticator skip themselves on WebKit.

| ID | Title | P | Expected |
|---|---|---|---|
| mobile-001 ×4 | No horizontal scroll on `/`, `/help`, `/register`, the 404 page | 2 | scrollWidth ≤ viewport width |
| mobile-002 | Login usable on a phone | 2 | Fields and button in the viewport; input font ≥ 16 px |
| mobile-004 | Logged-in pages fit the phone | 2 | No horizontal scroll on start, identity, security, account |
| mobile-003 | Pinch-zoom allowed (WCAG 1.4.4) | 2 | Viewport meta has no `user-scalable=no` and no `maximum-scale` below 2 |
| mobile-005 | No zoom-on-focus | 2 | Every input on login, reset password, registration, CAPTCHA and code pages is ≥ 16 px (iOS zooms into smaller inputs) |
| mobile-006 | Tap targets (WCAG 2.2 2.5.8) | 2 | axe `target-size` on start, login, registration; only known issues (DEF-14) |
| mobile-007 | Landscape (WCAG 1.3.4) | 2 | Login and dashboard work and fit when the phone is turned |
| mobile-008 | Reflow at 320 px (WCAG 1.4.10) | 2 | Start, login and the four logged-in pages without horizontal scrolling |
| mobile-009 | Dialogs on a phone | 2 | The delete-account dialog fits the width; its buttons can be reached |
| mobile-010 | Autofill and keyboards (WCAG 1.3.5) | 2 | Login `autocomplete` username/current-password; e-mail field `type=email`; code boxes bring up a numeric keypad |
| mobile-011 | Name fields' autofill purpose (WCAG 1.3.5) | 2 | `autocomplete="given-name"`/`"family-name"`. **Fails: DEF-13** |
| mobile-012 | Mobile menu | 2 | Collapsed menu reaches every section and can log out |
| mobile-013 | Menu button semantics (4.1.2) | 2 | Has a name; `aria-expanded` false → true → false; the menu closes after a choice (uses `tap()`) |
| mobile-014 | Phone as "other device" | 1 | The phone opens the QR target from a desktop browser, logs in and shows the code (reachable by scrolling); the code logs in the desktop |
| mobile-015 | Tablet portrait | 2 | Start and the four logged-in pages fit; the menu reaches every section |

Not covered: real devices and real mobile browsers (Chrome on Android, Safari on iOS run as emulation of viewport, touch and user agent in desktop engines), native apps, OS-level text size, screen readers (TalkBack/VoiceOver), slow mobile networks, and the copy-to-clipboard buttons.

### 5.13 Brute-force limits (`brute-force.spec.ts`, Chromium only, `@security`)

Each test uses its own throw-away account: the limits lock real accounts on dev, and a login lock lasts until the next calendar month. The file is deliberately not in the Firefox/WebKit selection, to keep the number of locked accounts down. The limit on other-device codes is other-device-005 (§5.9).

| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| brute-force-001 | Wrong e-mail codes in registration | 1 | Registration → three wrong six-digit codes | Codes 1–2: "E-postverifieringen misslyckades…"; code 3: "För många ogiltiga verifieringsförsök…", and the registration starts over at the method choice |
| brute-force-002 | Wrong reset codes | 1 | Reset password → four wrong codes; then start a reset in a fresh browser; then log in | Codes 1–3: "Det gick inte att fortsätta…"; code 4: page "För många försök", no code boxes. The fresh browser gets the same lock (the lock belongs to the account). Login with the old password still works |
| brute-force-003 | Wrong CAPTCHA | 2 | Registration → wrong CAPTCHA answer | Error message, and a **new** CAPTCHA image |
| brute-force-004 | Wrong e-mail confirmation codes | 3 | Account → add an address → five wrong 10-character codes → the right code | Each wrong code rejected; the right one confirms. No lock exists (OBS-22) |
| brute-force-005 | Wrong letter codes | 3 | Identity → letter → five wrong 10-character codes → the right code | Each wrong code rejected ("Den kod du angett stämmer inte…"); the right one verifies the identity. No lock exists (OBS-22) |
| brute-force-006 | Login lock (`@slow`, about 2.5 min) | 1 | Wrong passwords until dev answers differently; then the right password | Every attempt before the lock gets the neutral "E-postadressen eller lösenordet är felaktigt."; the lock comes between attempt 20 and 60 (52 on dev); then "Detta konto har nått gränsen … Försök igen nästa kalendermånad." also for the right password. The attempt number is recorded as the annotation `locked-at-attempt` |
| brute-force-007 | Unlock by password reset (`@slow`) | 2 | Lock the account → reset password → log in with the new password | Logged in. **Fails: DEF-15** |

### 5.14 Redirects and output escaping (`web-security.spec.ts`, Chromium, `@security`)

Tested only through eduID's normal pages and its logout endpoint. Outside addresses use the reserved `.invalid` domain. registration-012 (§5.3) covers HTML in the name on the dashboard after registration.

| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| web-security-001 (×3) | Logout with an outside `next` | 1 | `GET dashboard.…/services/authn/logout?next=` with `https://redirect-test.invalid/`, `//redirect-test.invalid/`, `/\redirect-test.invalid/` (no redirects followed) | 302 to `https://dev.eduid.se/`; the parameter is ignored |
| web-security-002 | Login from a deep link | 2 | Open `/account` logged out → log in | Ends on eduID's own `/start`. The target is chosen on the server, not from the URL. The deep link is not kept (OBS-23) |
| web-security-003 | HTML in names | 1 | Identity → names `<b>Bold</b><img src=x onerror=…>` → identity, dashboard, account, security; then log out and open "other device" with the remembered user on device 2 | The name is shown as literal text everywhere, including device 2's page; no element is injected and no script runs |
| web-security-004 | HTML in a security key name | 2 | Add a key named `<i>k</i><img src=x onerror=…>` (50-character limit); reload | Shown as text; nothing injected; no script runs |

Not covered: the e-mail list, because the add-e-mail form only accepts valid addresses (account-003), so no HTML can reach it from the UI.

### 5.15 Browser support notice (`browser-support.spec.ts`, Chromium)

The app shows a notice in its notification bar when the browser lacks features it needs (`BrowserSupportCheck` in eduid-front). Current browsers have every feature, so the tests remove them before the app starts (`addInitScript`). This shows that the check reacts to a missing feature, not that a real old browser lacks it. The tests run with an English browser locale: the Swedish text exists only after Transifex has translated it. String.replaceAll is not tested: a library in the bundle calls it while the app starts, so without it nothing renders.

| ID | Title | P | Steps | Expected |
|---|---|---|---|---|
| browser-support-001 | A browser with every feature gets no notice | 2 | Open `/` | No notification bar |
| browser-support-002 (×4) | A missing feature shows the browser notice | 2 | Remove CSS nesting, `:has()`, `Array.at` or `Intl.DisplayNames`, open `/` | "Your browser may not work well with eduID", without the security key text |
| browser-support-003 | Missing WebAuthn shows only the security key notice | 2 | Remove `PublicKeyCredential`, open `/` | "Security keys and passkeys are not supported by this browser", without the browser text |
| browser-support-004 | Both in one notice | 3 | Remove `Array.at` and `PublicKeyCredential` | One notice with both texts |
| browser-support-005 | Shown once per session, can be closed | 3 | Remove `Array.at`, close the notice, reload | Closed notice gone; after the reload no notice (kept in `sessionStorage`) |

## 6. Traceability: Java suite → Playwright

| Java TC | Playwright | Note |
|---|---|---|
| TC_1 | account-001, dashboard-001–dashboard-003, identity-001, login-001, login-004, start-page-001, start-page-002 | Split into independent tests; menu checks fixed for the new routes |
| TC_2, TC_4, TC_6, TC_9, TC_10, TC_12, TC_18–TC_23, TC_26, TC_32, TC_33, TC_36–TC_39, TC_48, TC_60–TC_65, TC_66–TC_68, TC_70–TC_76, TC_99 | account-002, account-004, account-005, account-007, account-009–account-015, help-001, login-002, login-005, login-010–login-013, other-device-001–other-device-003, other-device-005–other-device-014, registration-004, registration-006–registration-008, reset-password-002, reset-password-005 | Ported; each runs on its own fresh account |
| TC_3 | registration-003 (+ deletion in account-015) | |
| TC_7 | account-008 | Gmail IMAP replaced by the `get-code` endpoint |
| TC_14 | account-003 | The Java check never ran: `addNewEmail()` tests `!x.contains("")`, which is always false |
| TC_15, TC_17, TC_46 | security-key-006, security-key-005, security-key-002 | Step-up re-authentication handled; TC_17 checked from a fresh browser |
| TC_25 | reset-password-006 | Extended from 1 to 4 endpoints |
| TC_35 | registration-005, registration-001 | |
| TC_41 | identity-002, identity-003 | |
| TC_50 | security-key-007 | Passkey login from a second browser |
| TC_91 | registration-009 (DEF-03), registration-010 | |
| TC_82 | brute-force-001 (`brute-force.spec.ts`), plus brute-force-002–brute-force-007 | The Java test only checked the signup code; the port also covers reset, CAPTCHA, e-mail and letter codes, and the login lock |
| TC_16, TC_28, TC_30, TC_42, TC_47, TC_49, TC_51, TC_79 | freja-004–freja-006, freja-008–freja-012 (`freja.spec.ts`) | Freja+ through the reference IdP; Freja eID only up to the hand-over |
| TC_40 | freja-007, freja-001–freja-003 | Split: dialog texts, missing `nin` cookie, verification, restore after delete |
| TC_5, TC_8, TC_80 | security-key-009–security-key-011, security-key-008 (`security-key.spec.ts`) | TC_8 and TC_50 overlap; TC_8 adds the Freja+ verification of the passkey |
| TC_11, TC_31, TC_52, TC_78 | eidas-002, eidas-003, eidas-007, eidas-008, eidas-001 (`eidas.spec.ts`) | TC_31: the Java test used Freja+ for re-authentication and eIDAS for the key; the port checks eIDAS as the second factor at login. TC_52: the 5-minute delete wait is replaced by the step-up |
| TC_69 | login-010 + login-011 | Remember me on and off; already covered by the two tests |
| TC_77 | other-device-011 | With a remembered user there is no code field, so "submit without a code" is the same as pressing Fortsätt (other-device-011) |
| TC_27 | freja-011 | freja-011 checks that verifying the key also verifies the identity |
| TC_53 | freja-009, freja-011 | Same key verification. TC_53 verifies the identity by letter first (covered by identity-002); its "delete 5 minutes after login" step is TC_56 in the backlog |
| WCAG_1–7 | accessibility-001–accessibility-009, plus accessibility-010–accessibility-032 | Can now fail; every page, step, dialog and state, English, dark mode, phone width, keyboard checks |

## 7. Backlog (not yet ported)

| Java TC | Reason / plan | P |
|---|---|---|
| TC_29 (verify a key with BankID, delete with Freja+ as MFA) | BankID part can only reach the IdP | 3 |
| TC_56 (re-auth dialog when deleting 5 minutes after login) | Needs a long wait, or a server-side session-age control | 3 |
| TC_81, TC_83, TC_84 | Listed in the Java suite XML but have no test class | n/a |
| TC_24, TC_59, TC_86, TC_89 (BankID) | Can only check that the BankID IdP is reached | 3 |
| TC_13, TC_44, TC_45, TC_54, TC_55, TC_57, TC_58 (SWAMID release check); TC_85, TC_87–TC_90, TC_92 (Skolverket DNP); TC_477 | External service providers; separate integration suite | 3 |
| TC_43 (support tool) | Needs a support account in a secret store | 2 |
| TC_34, TC_98 (restore helpers) | Not needed: no shared state | n/a |
| Antagning_Se, Jira_Sunet_Se, Ladok_Se, Mobile_1, APP_1/2 | Production third parties or native apps; out of scope | n/a |

## 8. Former test IDs

Until v1.10 the tests had IDs from the Java suite (`TC_n`, `TC_n.m`, `TC_nb`), `NEW-n` for new tests and `WCAG_n` for accessibility tests. Runs recorded before v1.10 in an older copy of [TEST_PROTOCOL.md](TEST_PROTOCOL.md), and the original `playwright/` folder in the Java repository, use those IDs. The Java origin column gives the Java test a ported test comes from; §6 has the full traceability, including the Java WCAG tests.

| ID | Former ID | Java origin |
|---|---|---|
| accessibility-001 | WCAG_1 | — |
| accessibility-002 | WCAG_2 | — |
| accessibility-003 | WCAG_8 | — |
| accessibility-004 | WCAG_7 | — |
| accessibility-005 | WCAG_18 | — |
| accessibility-006 | WCAG_3 | — |
| accessibility-007 | WCAG_5 | — |
| accessibility-008 | WCAG_4 | — |
| accessibility-009 | WCAG_6 | — |
| accessibility-010 | WCAG_9 | — |
| accessibility-011 | WCAG_10 | — |
| accessibility-012 | WCAG_11 | — |
| accessibility-013 | WCAG_12 | — |
| accessibility-014 | WCAG_13 | — |
| accessibility-015 | WCAG_14 | — |
| accessibility-016 | WCAG_15 | — |
| accessibility-017 | WCAG_15b | — |
| accessibility-018 | WCAG_16 | — |
| accessibility-019 | WCAG_17 | — |
| accessibility-020 | WCAG_19 | — |
| accessibility-021 | WCAG_20 | — |
| accessibility-022 | WCAG_21 | — |
| accessibility-023 | WCAG_22 | — |
| accessibility-024 | WCAG_23 | — |
| accessibility-025 | WCAG_24 | — |
| accessibility-026 | WCAG_25 | — |
| accessibility-027 | WCAG_26 | — |
| accessibility-028 | WCAG_27 | — |
| accessibility-029 | WCAG_K1 | — |
| accessibility-030 | WCAG_K2 | — |
| accessibility-031 | WCAG_K3 | — |
| accessibility-032 | WCAG_K4 | — |
| accessibility-033 | — (new in v1.11) | — |
| account-001 | TC_1.8 | TC_1 |
| account-002 | TC_9 | TC_9 |
| account-003 | TC_14 | TC_14 |
| account-004 | TC_32 | TC_32 |
| account-005 | TC_2 | TC_2 |
| account-006 | NEW-17 | — |
| account-007 | TC_4 | TC_4 |
| account-008 | TC_7 | TC_7 |
| account-009 | TC_12 | TC_12 |
| account-010 | TC_19 | TC_19 |
| account-011 | TC_20 | TC_20 |
| account-012 | TC_18 | TC_18 |
| account-013 | TC_21 | TC_21 |
| account-014 | TC_22 | TC_22 |
| account-015 | TC_33 | TC_33 |
| brute-force-001 | TC_82 | TC_82 |
| brute-force-002 | NEW-46 | — |
| brute-force-003 | NEW-47 | — |
| brute-force-004 | NEW-48 | — |
| brute-force-005 | NEW-49 | — |
| brute-force-006 | NEW-50 | — |
| brute-force-007 | NEW-51 | — |
| dashboard-001 | TC_1.5 | TC_1 |
| dashboard-002 | TC_1.6 | TC_1 |
| dashboard-003 | TC_1.7 | TC_1 |
| dashboard-004 | NEW-12 | — |
| dashboard-005 | NEW-13 | — |
| dashboard-006 | NEW-14 | — |
| dashboard-007 | NEW-15 | — |
| dashboard-008 | NEW-16 | — |
| dashboard-009 | — (new in v1.11) | — |
| eidas-001 | TC_52.1 | TC_52 |
| eidas-002 | TC_11 | TC_11 |
| eidas-003 | TC_78 | TC_78 |
| eidas-004 | NEW-27 | — |
| eidas-005 | NEW-28 | — |
| eidas-006 | NEW-29 | — |
| eidas-007 | TC_31 | TC_31 |
| eidas-008 | TC_52 | TC_52 |
| freja-001 | TC_40.1 | TC_40 |
| freja-002 | TC_40.2 | TC_40 |
| freja-003 | TC_40.3 | TC_40 |
| freja-004 | TC_79 | TC_79 |
| freja-005 | TC_47 | TC_47 |
| freja-006 | TC_28 | TC_28 |
| freja-007 | TC_40 | TC_40 |
| freja-008 | TC_49 | TC_49 |
| freja-009 | TC_30 | TC_30 |
| freja-010 | TC_16 | TC_16 |
| freja-011 | TC_42 | TC_42 |
| freja-012 | TC_51 | TC_51 |
| help-001 | TC_99 | TC_99 |
| help-002 | TC_99.1 | TC_99 |
| help-003 | TC_99.2 | TC_99 |
| help-004 | NEW-23 | — |
| help-005 | — (new in v1.12) | — |
| help-006 | — (new in v1.12) | — |
| help-007 | — (new in v1.12) | — |
| help-008 | — (new in v1.12) | — |
| help-009 | — (new in v1.12) | — |
| identity-001 | TC_1.9 | TC_1 |
| identity-002 | TC_41 | TC_41 |
| identity-003 | TC_41b | TC_41 |
| identity-004 | NEW-22 | — |
| login-001 | TC_1.3 | TC_1 |
| login-002 | TC_10 | TC_10 |
| login-003 | NEW-04 | — |
| login-004 | TC_1.4 | TC_1 |
| login-005 | TC_6 | TC_6 |
| login-006 | NEW-05a | — |
| login-007 | NEW-05b | — |
| login-008 | NEW-06 | — |
| login-009 | NEW-07 | — |
| login-010 | TC_66 | TC_66 |
| login-011 | TC_68 | TC_68 |
| login-012 | TC_67 | TC_67 |
| login-013 | TC_48 | TC_48 |
| mobile-001 | NEW-24 | — |
| mobile-002 | NEW-25 | — |
| mobile-003 | NEW-33 | — |
| mobile-004 | NEW-32 | — |
| mobile-005 | NEW-34 | — |
| mobile-006 | NEW-37 | — |
| mobile-007 | NEW-38 | — |
| mobile-008 | NEW-39 | — |
| mobile-009 | NEW-40 | — |
| mobile-010 | NEW-41 | — |
| mobile-011 | NEW-42 | — |
| mobile-012 | NEW-26 | — |
| mobile-013 | NEW-43 | — |
| mobile-014 | NEW-44 | — |
| mobile-015 | NEW-45 | — |
| other-device-001 | TC_61 | TC_61 |
| other-device-002 | TC_62 | TC_62 |
| other-device-003 | TC_60 | TC_60 |
| other-device-004 | NEW-31 | — |
| other-device-005 | TC_70 | TC_70 |
| other-device-006 | TC_71 | TC_71 |
| other-device-007 | TC_72 | TC_72 |
| other-device-008 | TC_73 | TC_73 |
| other-device-009 | TC_74 | TC_74 |
| other-device-010 | TC_75 | TC_75 |
| other-device-011 | TC_76 | TC_76 |
| other-device-012 | TC_63 | TC_63 |
| other-device-013 | TC_64 | TC_64 |
| other-device-014 | TC_65 | TC_65 |
| other-device-015 | NEW-30 | — |
| registration-001 | TC_35.1 | TC_35 |
| registration-002 | NEW-08 | — |
| registration-003 | TC_3 | TC_3 |
| registration-004 | TC_38 | TC_38 |
| registration-005 | TC_35 | TC_35 |
| registration-006 | TC_36 | TC_36 |
| registration-007 | TC_37 | TC_37 |
| registration-008 | TC_39 | TC_39 |
| registration-009 | TC_91 | TC_91 |
| registration-010 | TC_91b | TC_91 |
| registration-011 | NEW-09 | — |
| registration-012 | NEW-11 | — |
| registration-013 | NEW-10 | — |
| reset-password-001 | TC_23.1 | TC_23 |
| reset-password-002 | TC_23 | TC_23 |
| reset-password-003 | NEW-18 | — |
| reset-password-004 | NEW-19 | — |
| reset-password-005 | TC_26 | TC_26 |
| reset-password-006 | TC_25 | TC_25 |
| security-key-001 | TC_46.1 | TC_46 |
| security-key-002 | TC_46 | TC_46 |
| security-key-003 | NEW-20 | — |
| security-key-004 | NEW-21 | — |
| security-key-005 | TC_17 | TC_17 |
| security-key-006 | TC_15 | TC_15 |
| security-key-007 | TC_50 | TC_50 |
| security-key-008 | TC_5.1 | TC_5 |
| security-key-009 | TC_5 | TC_5 |
| security-key-010 | TC_8 | TC_8 |
| security-key-011 | TC_80 | TC_80 |
| start-page-001 | TC_1.1 | TC_1 |
| start-page-002 | TC_1.2 | TC_1 |
| start-page-003 | NEW-01 | — |
| start-page-004 | NEW-02 | — |
| start-page-005 | NEW-03 | — |
| start-page-006 | — (new in v1.11) | — |
| web-security-001 | NEW-52 | — |
| web-security-002 | NEW-53 | — |
| web-security-003 | NEW-54 | — |
| web-security-004 | NEW-55 | — |
