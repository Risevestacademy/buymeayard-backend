export const KYC_MIN_AGE = 18;
const MAX_AGE = 120;

/** Returns an error message, or null when the date of birth is acceptable. */
export function validateDateOfBirth(
  dob: string,
  now: Date = new Date(),
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return 'Date of birth must be in YYYY-MM-DD format';

  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return 'Date of birth is not a valid date';
  }

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (date.getTime() >= today.getTime()) {
    return 'Date of birth must be in the past';
  }

  let age = today.getUTCFullYear() - year;
  const hadBirthday =
    today.getUTCMonth() > month - 1 ||
    (today.getUTCMonth() === month - 1 && today.getUTCDate() >= day);
  if (!hadBirthday) age -= 1;

  if (age < KYC_MIN_AGE) {
    return `You must be at least ${KYC_MIN_AGE} years old to verify your identity`;
  }
  if (age > MAX_AGE) return 'Date of birth is not valid';
  return null;
}
