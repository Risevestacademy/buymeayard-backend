import {
  CreatorStatus as C,
  KycStatus as K,
  KycSubmissionStatus as S,
} from '@buymeayard/types';
import {
  checkSubmissionTransition,
  creatorStatusForKyc,
  kycStatusForSubmission,
  kycStatusFromPriorOutcome,
  missingRequiredChecks,
} from './kyc-state';
import { rejectionReasonFromWarnings } from './kyc-reasons';
import { validateDateOfBirth } from './kyc-validation';

describe('KYC state rules', () => {
  describe('checkSubmissionTransition', () => {
    const t = (from: S, to: S) => checkSubmissionTransition({ from, to });

    it('treats same status as a no-op', () => {
      expect(t(S.VERIFIED, S.VERIFIED)).toEqual({
        allowed: false,
        reason: 'same_status',
      });
    });

    it.each([
      [S.CREATED, S.IN_PROGRESS],
      [S.CREATED, S.VERIFIED],
      [S.IN_PROGRESS, S.NEEDS_REVIEW],
      [S.IN_PROGRESS, S.VERIFIED],
      [S.IN_PROGRESS, S.REJECTED],
      [S.RESUBMISSION_REQUIRED, S.IN_PROGRESS],
      [S.NEEDS_REVIEW, S.VERIFIED],
      [S.NEEDS_REVIEW, S.REJECTED],
      [S.VERIFIED, S.REJECTED], // revocation
      [S.VERIFIED, S.KYC_EXPIRED],
      [S.REJECTED, S.VERIFIED], // reviewer override
      [S.CREATED, S.CANCELLED],
    ])('allows %s -> %s', (from, to) => {
      expect(t(from, to)).toEqual({ allowed: true });
    });

    it.each([
      // Out-of-order regressions
      [S.VERIFIED, S.IN_PROGRESS],
      [S.VERIFIED, S.CREATED],
      [S.VERIFIED, S.NEEDS_REVIEW],
      [S.VERIFIED, S.ABANDONED],
      [S.REJECTED, S.IN_PROGRESS],
      [S.NEEDS_REVIEW, S.IN_PROGRESS],
      [S.IN_PROGRESS, S.CREATED],
      // Frozen states
      [S.CANCELLED, S.VERIFIED],
      [S.EXPIRED, S.VERIFIED],
      [S.KYC_EXPIRED, S.VERIFIED],
      [S.CANCELLED, S.IN_PROGRESS],
    ])('blocks %s -> %s', (from, to) => {
      expect(t(from, to)).toEqual({ allowed: false, reason: 'not_allowed' });
    });

    it('ignores events older than the last applied provider update', () => {
      expect(
        checkSubmissionTransition({
          from: S.IN_PROGRESS,
          to: S.REJECTED,
          occurredAt: new Date('2026-01-01T10:00:00Z'),
          lastProviderUpdateAt: new Date('2026-01-01T10:00:01Z'),
        }),
      ).toEqual({ allowed: false, reason: 'stale_event' });
    });

    it('allows events with the same timestamp (table still guards regressions)', () => {
      const at = new Date('2026-01-01T10:00:00Z');
      expect(
        checkSubmissionTransition({
          from: S.IN_PROGRESS,
          to: S.VERIFIED,
          occurredAt: at,
          lastProviderUpdateAt: at,
        }),
      ).toEqual({ allowed: true });
    });
  });

  describe('kycStatusForSubmission', () => {
    it.each([
      [S.CREATED, K.PENDING],
      [S.IN_PROGRESS, K.PENDING],
      [S.RESUBMISSION_REQUIRED, K.PENDING],
      [S.NEEDS_REVIEW, K.NEEDS_REVIEW],
      [S.VERIFIED, K.VERIFIED],
      [S.REJECTED, K.REJECTED],
      [S.KYC_EXPIRED, K.EXPIRED],
    ])('%s -> %s', (status, expected) => {
      expect(kycStatusForSubmission(status, K.NOT_SUBMITTED)).toBe(expected);
    });

    it.each([[S.ABANDONED], [S.EXPIRED], [S.CANCELLED]])(
      '%s falls back to the prior outcome',
      (status) => {
        expect(kycStatusForSubmission(status, K.REJECTED)).toBe(K.REJECTED);
        expect(kycStatusForSubmission(status, K.NOT_SUBMITTED)).toBe(
          K.NOT_SUBMITTED,
        );
      },
    );

    it('derives prior outcomes', () => {
      expect(kycStatusFromPriorOutcome(S.REJECTED)).toBe(K.REJECTED);
      expect(kycStatusFromPriorOutcome(S.KYC_EXPIRED)).toBe(K.EXPIRED);
      expect(kycStatusFromPriorOutcome(undefined)).toBe(K.NOT_SUBMITTED);
    });
  });

  describe('creatorStatusForKyc (invariant: ACTIVE => VERIFIED)', () => {
    it('activates on verification', () => {
      expect(creatorStatusForKyc(C.PROFILE_CREATED, K.VERIFIED)).toBe(C.ACTIVE);
      expect(creatorStatusForKyc(C.KYC_PENDING, K.VERIFIED)).toBe(C.ACTIVE);
    });

    it('moves to KYC_PENDING while pending or in review', () => {
      expect(creatorStatusForKyc(C.PROFILE_CREATED, K.PENDING)).toBe(
        C.KYC_PENDING,
      );
      expect(creatorStatusForKyc(C.PROFILE_CREATED, K.NEEDS_REVIEW)).toBe(
        C.KYC_PENDING,
      );
    });

    it.each([
      [K.REJECTED],
      [K.EXPIRED],
      [K.NOT_SUBMITTED],
      [K.PENDING],
      [K.NEEDS_REVIEW],
    ])('never leaves an ACTIVE creator active when kyc is %s', (kyc) => {
      expect(creatorStatusForKyc(C.ACTIVE, kyc)).not.toBe(C.ACTIVE);
    });

    it('delists on rejection or expiry', () => {
      expect(creatorStatusForKyc(C.ACTIVE, K.REJECTED)).toBe(C.PROFILE_CREATED);
      expect(creatorStatusForKyc(C.ACTIVE, K.EXPIRED)).toBe(C.PROFILE_CREATED);
      expect(creatorStatusForKyc(C.KYC_PENDING, K.NOT_SUBMITTED)).toBe(
        C.PROFILE_CREATED,
      );
    });

    it.each([[C.SUSPENDED], [C.BANNED], [C.DEACTIVATED]])(
      'never changes a %s creator, even on verification',
      (status) => {
        for (const kyc of Object.values(K)) {
          expect(creatorStatusForKyc(status, kyc)).toBe(status);
        }
      },
    );
  });
});

describe('rejectionReasonFromWarnings', () => {
  it('explains a details mismatch', () => {
    expect(
      rejectionReasonFromWarnings([
        { risk: 'FULL_NAME_MISMATCH_WITH_PROVIDED' },
      ]),
    ).toMatch(/didn't match your document/);
    expect(
      rejectionReasonFromWarnings([{ risk: 'DATE_OF_BIRTH_MISMATCH' }]),
    ).toMatch(/didn't match your document/);
  });

  it('explains expired documents and face mismatches', () => {
    expect(rejectionReasonFromWarnings([{ risk: 'DOCUMENT_EXPIRED' }])).toMatch(
      /expired/,
    );
    expect(
      rejectionReasonFromWarnings([{ risk: 'LOW_FACE_MATCH_SIMILARITY' }]),
    ).toMatch(/selfie/);
    expect(
      rejectionReasonFromWarnings([{ risk: 'LOW_LIVENESS_SCORE' }]),
    ).toMatch(/selfie/);
  });

  it('never reveals fraud signals, even alongside other warnings', () => {
    const reason = rejectionReasonFromWarnings([
      { risk: 'DOCUMENT_EXPIRED' },
      { risk: 'DUPLICATED_DOCUMENT' },
    ]);
    expect(reason).not.toMatch(/expired|duplicate/i);
    expect(reason).toMatch(/couldn't verify your identity/);
  });

  it('falls back to a generic message', () => {
    expect(rejectionReasonFromWarnings([])).toMatch(
      /couldn't verify your identity/,
    );
    expect(rejectionReasonFromWarnings([{ risk: 'SOMETHING_NEW' }])).toMatch(
      /couldn't verify your identity/,
    );
  });
});

describe('validateDateOfBirth', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('accepts an adult', () => {
    expect(validateDateOfBirth('1995-10-12', now)).toBeNull();
  });

  it('accepts someone turning 18 today and rejects the day before', () => {
    expect(validateDateOfBirth('2008-09-27', now)).toBeNull();
    expect(validateDateOfBirth('2008-09-28', now)).toMatch(/at least 18/);
  });

  it.each([['2026-09-27'], ['2030-01-01']])(
    'rejects today/future %s',
    (dob) => {
      expect(validateDateOfBirth(dob, now)).toMatch(/in the past/);
    },
  );

  it.each([['2001-02-30'], ['2001-13-01'], ['12/10/1995'], ['1995-1-1']])(
    'rejects invalid date %s',
    (dob) => {
      expect(validateDateOfBirth(dob, now)).not.toBeNull();
    },
  );

  it('rejects implausible ages', () => {
    expect(validateDateOfBirth('1850-01-01', now)).toMatch(/not valid/);
  });
});

describe('missingRequiredChecks', () => {
  const all = ['ID_VERIFICATION', 'LIVENESS', 'FACE_MATCH'];
  const approved = {
    idStatus: 'Approved',
    livenessStatus: 'APPROVED',
    faceMatchStatus: ' approved ',
  };

  it('is empty when every required check is approved (any casing)', () => {
    expect(missingRequiredChecks(approved, all)).toEqual([]);
  });

  it('lists checks that are absent, declined or in review', () => {
    expect(
      missingRequiredChecks(
        { ...approved, faceMatchStatus: null, livenessStatus: 'In Review' },
        all,
      ),
    ).toEqual(['LIVENESS', 'FACE_MATCH']);
  });

  it('treats a missing summary as nothing approved', () => {
    expect(missingRequiredChecks(null, all)).toEqual(all);
  });

  it('treats unknown check names as missing (fails closed)', () => {
    expect(missingRequiredChecks(approved, ['NFC'])).toEqual(['NFC']);
  });
});
