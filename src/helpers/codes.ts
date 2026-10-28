import { APIRequestContext, BrowserContext, expect } from '@playwright/test';
import { config } from '../config';

/**
 * Adds the "autotests" magic cookie that turns on the test-only backdoors in
 * dev: fixed CAPTCHA (123456), get-code endpoints and the reference IdPs.
 */
export async function addMagicCookie(context: BrowserContext): Promise<void> {
  if (!config.autotestsCookie) {
    throw new Error('EDUID_AUTOTESTS_COOKIE (or EDUID_PROPERTIES_FILE) is not set — see .env.example');
  }
  await context.addCookies([
    {
      name: 'autotests',
      value: config.autotestsCookie,
      domain: config.cookieDomain,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
    },
  ]);
}

/** Sets the "nin" cookie that the reference IdPs answer with (Freja/eIDAS simulations). */
export async function addNinCookie(context: BrowserContext, identityNumber: string): Promise<void> {
  await context.addCookies([
    { name: 'nin', value: identityNumber, domain: config.cookieDomain, path: '/', secure: true, httpOnly: true, sameSite: 'None' },
  ]);
}

/**
 * Fetches a code from a get-code endpoint. The code is written to the backend
 * asynchronously, so poll until it has the expected length instead of the
 * fixed sleeps and single refresh the Java suite used.
 */
async function fetchCode(request: APIRequestContext, url: string, length: number): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(url, { failOnStatusCode: false });
        code = response.ok() ? (await response.text()).trim() : '';
        return code.length;
      },
      { message: `code from ${new URL(url).pathname}`, timeout: 20_000, intervals: [500, 1000, 2000] },
    )
    .toBe(length);
  return code;
}

/** All requests go through the browser context so they carry its cookies (magic cookie + session). */
export const codes = {
  signup: (context: BrowserContext, email: string) =>
    fetchCode(context.request, config.signupCodeUrl + encodeURIComponent(email.toLowerCase()), 6),

  resetPassword: (context: BrowserContext, eppn: string) =>
    fetchCode(context.request, config.resetPwCodeUrl + encodeURIComponent(eppn), 6),

  emailConfirmation: (context: BrowserContext, email: string, eppn: string) =>
    fetchCode(
      context.request,
      `${config.emailCodeUrl}?email=${encodeURIComponent(email.toLowerCase())}&eppn=${encodeURIComponent(eppn)}`,
      10,
    ),

  letter: (context: BrowserContext) => fetchCode(context.request, config.letterCodeUrl, 10),
};
