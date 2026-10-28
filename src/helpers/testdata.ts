import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

const dataDir = path.resolve(__dirname, '..', '..', 'test-data');

function lines(file: string): string[] {
  return fs
    .readFileSync(path.join(dataDir, file), 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

const givenNames = lines('given_name.txt');
const surNames = lines('sur_name.txt');
const identityNumbers = lines('identity_numbers.txt');

const pick = <T>(list: T[]): T => list[crypto.randomInt(list.length)];

/** Unique, lower-case mailbox on the test domain. Lower case avoids the case-folding the backend does. */
export function uniqueEmail(prefix = 'pw'): string {
  return `${prefix}${crypto.randomBytes(5).toString('hex')}@${config.testEmailDomain}`;
}

export interface Person {
  givenName: string;
  surName: string;
  /** Test personnummer from the Skatteverket test-person list (same file as the Java suite). */
  identityNumber: string;
}

/**
 * A national ID number can be verified on one account only: verifying it on a second
 * account removes it from the first (freja-008). So workers that run at the same time must
 * never pick the same number. Each parallel slot (Playwright's TEST_PARALLEL_INDEX) gets its own
 * share of the list, and a worker never hands out a number twice.
 */
const ID_SLOTS = 16;
const usedIdentityNumbers = new Set<string>();

function pickIdentityNumber(): string {
  const slot = Number(process.env.TEST_PARALLEL_INDEX ?? 0) % ID_SLOTS;
  const candidates = identityNumbers.filter(
    (n, i) => i % ID_SLOTS === slot && !usedIdentityNumbers.has(n) && !eidasNumbers.has(n),
  );
  const number = pick(candidates);
  usedIdentityNumbers.add(number);
  return number;
}

/** A person offered by the eIDAS test country XA (cef20hub.eidastest.se/test/idp/XA). */
export interface EidasPerson {
  /** Value in the IdP's person list: a Swedish personal ID number or an opaque ID. */
  id: string;
  givenName: string;
  surName: string;
  /** Date of birth, shown by eduID as "XA <date>". */
  birthDate: string;
}

/**
 * The XA persons whose date of birth is known (the IdP offers 12). An eIDAS identity, like a
 * national ID number, can be verified on only one account at a time, so every parallel slot
 * uses its own person, and the suite must not run with more than this many workers.
 */
const eidasPersons: EidasPerson[] = [
  { id: '193911137077', givenName: 'Bernt Olof', surName: 'Larsson', birthDate: '1939-11-13' },
  { id: '197705232382', givenName: 'Frida', surName: 'Kranstege', birthDate: '1977-05-23' },
  { id: '192011189228', givenName: 'Gunbritt', surName: 'Bodén', birthDate: '1920-11-18' },
  { id: '198502044087', givenName: 'Johanna', surName: 'Östling', birthDate: '1985-02-04' },
  { id: '200604252387', givenName: 'Malin', surName: 'Urbansson', birthDate: '2006-04-25' },
  { id: '197908252385', givenName: 'Mona Lisa', surName: 'Urbansson', birthDate: '1979-08-25' },
  { id: '197103063967', givenName: 'Pia', surName: 'Nilsson', birthDate: '1971-03-06' },
  { id: '191704109279', givenName: 'Åke', surName: 'Jansson', birthDate: '1917-04-10' },
  { id: '01af7584-b385-11ed-aeb7', givenName: 'Nina', surName: 'Greger', birthDate: '1973-09-06' },
];
// Kept out of the Freja pool so a Freja test never touches an identity an eIDAS test is using.
const eidasNumbers = new Set(['193911137077', '197705232382', '192011189228', '194401832391', '198502044087',
  '200604252387', '197908252385', '197103063967', '191704109279']);

/** The eIDAS person reserved for this parallel slot. */
export function eidasPerson(): EidasPerson {
  const slot = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
  if (slot >= eidasPersons.length) {
    throw new Error(`eIDAS tests support at most ${eidasPersons.length} parallel workers (slot ${slot})`);
  }
  return eidasPersons[slot];
}

export function randomPerson(): Person {
  return { givenName: pick(givenNames), surName: pick(surNames), identityNumber: pickIdentityNumber() };
}

export interface Account extends Person {
  email: string;
  password: string;
  /** Unique ID (EPPN), filled in after the first login. */
  eppn?: string;
}
