import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/** Reads a Java-style .properties file (the legacy suite stores them as ISO-8859-1). */
function readProperties(file: string): Record<string, string> {
  const content = fs.readFileSync(path.resolve(__dirname, '..', file), 'latin1');
  const result: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    result[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return result;
}

const props = process.env.EDUID_PROPERTIES_FILE ? readProperties(process.env.EDUID_PROPERTIES_FILE) : {};

const baseUrl = (process.env.EDUID_BASE_URL ?? props.base_url ?? 'https://dev.eduid.se').replace(/\/$/, '');
const host = new URL(baseUrl).hostname;

export const config = {
  baseUrl,
  host,
  cookieDomain: process.env.EDUID_COOKIE_DOMAIN ?? props.domain ?? `.${host}`,
  autotestsCookie: process.env.EDUID_AUTOTESTS_COOKIE ?? props.autotests_cookie_value ?? '',
  signupCodeUrl:
    process.env.EDUID_SIGNUP_CODE_URL ?? props.email_verification_code_url ??
    `https://signup.${host}/services/signup/get-code/?email=`,
  resetPwCodeUrl:
    process.env.EDUID_RESET_PW_CODE_URL ?? props.email_reset_pw_code_url ??
    `https://idp.${host}/services/reset-password/get-email-code?eppn=`,
  emailCodeUrl: process.env.EDUID_EMAIL_CODE_URL ?? `https://dashboard.${host}/services/email/get-code`,
  letterCodeUrl:
    process.env.EDUID_LETTER_CODE_URL ?? props.letter_proofing_code_url ??
    `https://dashboard.${host}/services/letter-proofing/get-code`,
  testEmailDomain: process.env.EDUID_TEST_EMAIL_DOMAIN ?? 'dev.eduid.sunet.se',
};

export const hasMagicCookie = config.autotestsCookie.length > 0;
