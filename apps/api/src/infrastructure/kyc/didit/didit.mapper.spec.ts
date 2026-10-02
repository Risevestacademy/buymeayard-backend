import { KycDocumentType, KycSubmissionStatus as S } from '@buymeayard/types';
import {
  mapDiditStatus,
  redactDiditWebhook,
  summarizeDiditDecision,
  toAdminDecisionView,
  toDiditDocumentTypes,
} from './didit.mapper';

describe('Didit mapper', () => {
  describe('mapDiditStatus', () => {
    it.each([
      ['Not Started', S.CREATED],
      ['In Progress', S.IN_PROGRESS],
      ['Awaiting User', S.IN_PROGRESS],
      ['In Review', S.NEEDS_REVIEW],
      ['Approved', S.VERIFIED],
      ['Declined', S.REJECTED],
      ['Resubmitted', S.RESUBMISSION_REQUIRED],
      ['Abandoned', S.ABANDONED],
      ['Expired', S.EXPIRED],
      ['Kyc Expired', S.KYC_EXPIRED],
      // Case and separator variants seen in Didit payloads
      ['APPROVED', S.VERIFIED],
      ['IN_REVIEW', S.NEEDS_REVIEW],
      ['KYC_EXPIRED', S.KYC_EXPIRED],
      ['  in review ', S.NEEDS_REVIEW],
    ])('maps %p to %p', (label, expected) => {
      expect(mapDiditStatus(label)).toBe(expected);
    });

    it.each([['Approvedd'], ['VERIFIED'], [''], [null], [undefined], [42]])(
      'maps unknown value %p to null (never a positive status)',
      (label) => {
        expect(mapDiditStatus(label)).toBeNull();
      },
    );
  });

  it('maps document types to Didit codes', () => {
    expect(toDiditDocumentTypes(KycDocumentType.NATIONAL_ID)).toEqual(['ID']);
    expect(toDiditDocumentTypes(KycDocumentType.VOTERS_CARD)).toEqual(['ID']);
    expect(toDiditDocumentTypes(KycDocumentType.PASSPORT)).toEqual(['P']);
    expect(toDiditDocumentTypes(KycDocumentType.DRIVERS_LICENCE)).toEqual([
      'DL',
    ]);
  });

  const decision = {
    status: 'Declined',
    id_verifications: [
      {
        node_id: 'feature_ocr_1',
        status: 'Declined',
        document_type: 'Identity Card',
        document_number: 'AB-12 3456',
        issuing_state: 'NGA',
        first_name: 'Mariam',
        last_name: 'Omiteru',
        date_of_birth: '1995-10-12',
        portrait_image: 'https://media/portrait.jpg?sig=secret',
        front_image: 'https://media/front.jpg?sig=secret',
        warnings: [
          {
            feature: 'ID_VERIFICATION',
            risk: 'DOCUMENT_EXPIRED',
            short_description: 'Document expired',
          },
        ],
      },
    ],
    liveness_checks: [{ node_id: 'l1', status: 'Approved', score: 97.5 }],
    face_matches: [
      {
        node_id: 'f1',
        status: 'Declined',
        score: 30,
        warnings: [{ risk: 'LOW_FACE_MATCH_SIMILARITY' }],
      },
    ],
  };

  describe('summarizeDiditDecision', () => {
    it('extracts a minimized summary from the plural arrays', () => {
      expect(summarizeDiditDecision(decision)).toEqual({
        documentType: 'Identity Card',
        issuingState: 'NGA',
        documentNumberLast4: '3456',
        firstName: 'Mariam',
        lastName: 'Omiteru',
        dateOfBirth: '1995-10-12',
        idStatus: 'Declined',
        livenessStatus: 'Approved',
        livenessScore: 97.5,
        faceMatchStatus: 'Declined',
        faceMatchScore: 30,
        warnings: [
          {
            risk: 'DOCUMENT_EXPIRED',
            feature: 'ID_VERIFICATION',
            shortDescription: 'Document expired',
          },
          {
            risk: 'LOW_FACE_MATCH_SIMILARITY',
            feature: undefined,
            shortDescription: undefined,
          },
        ],
      });
    });

    it('never includes media URLs or the full document number', () => {
      const text = JSON.stringify(summarizeDiditDecision(decision));
      expect(text).not.toContain('https://');
      expect(text).not.toContain('AB-12');
    });

    it('tolerates empty and malformed input', () => {
      const empty = summarizeDiditDecision(null);
      expect(empty.documentType).toBeNull();
      expect(empty.warnings).toEqual([]);
      expect(
        summarizeDiditDecision({ id_verifications: 'nope' }).idStatus,
      ).toBeNull();
    });
  });

  describe('redactDiditWebhook', () => {
    it('keeps the envelope and statuses, drops PII and media', () => {
      const redacted = redactDiditWebhook({
        event_id: 'e1',
        webhook_type: 'status.updated',
        session_id: 's1',
        status: 'Declined',
        vendor_data: 'creator-1',
        metadata: { anything: 'x' },
        decision,
      });
      const text = JSON.stringify(redacted);
      expect(redacted.event_id).toBe('e1');
      expect(redacted.status).toBe('Declined');
      expect(text).not.toContain('Mariam');
      expect(text).not.toContain('1995-10-12');
      expect(text).not.toContain('https://');
      expect(text).not.toContain('metadata');
      expect(redacted.decision).toEqual({
        status: 'Declined',
        id_verifications: [{ node_id: 'feature_ocr_1', status: 'Declined' }],
        liveness_checks: [{ node_id: 'l1', status: 'Approved' }],
        face_matches: [{ node_id: 'f1', status: 'Declined' }],
        warnings: ['DOCUMENT_EXPIRED', 'LOW_FACE_MATCH_SIMILARITY'],
      });
    });
  });

  describe('toAdminDecisionView', () => {
    const full = {
      status: 'In Review',
      session_url: 'https://verify.didit.me/session/x',
      contact_details: { email: 'secret@example.com' },
      id_verifications: [
        {
          ...decision.id_verifications[0],
          expiration_date: '2031-06-02',
          nationality: 'NGA',
          back_image: 'https://media/back.jpg',
          address: '12 Secret Street, Lagos',
          formatted_address: '12 Secret Street, Lagos 100001',
          parsed_address: { street_1: '12 Secret Street' },
          mrz: { mrz_string: 'IDNGA<<<SECRET' },
          barcodes: [{ data: 'SECRET-BARCODE' }],
          place_of_birth: 'Lagos',
        },
      ],
      liveness_checks: [
        {
          status: 'Approved',
          method: 'PASSIVE',
          score: 97.5,
          reference_image: 'https://media/ref.jpg',
          video_url: 'https://media/video.webm',
          matches: [{ vendor_data: 'other-creator' }],
        },
      ],
      face_matches: [
        {
          status: 'Approved',
          score: 91,
          source_image: 'https://media/src.jpg',
          target_image: 'https://media/tgt.jpg',
        },
      ],
    };

    it('copies only allowlisted fields', () => {
      const view = toAdminDecisionView(full);
      expect(view.status).toBe('In Review');
      expect(view.idVerification).toMatchObject({
        documentNumberLast4: '3456',
        firstName: 'Mariam',
        expirationDate: '2031-06-02',
        images: {
          front: 'https://media/front.jpg?sig=secret',
          back: 'https://media/back.jpg',
        },
      });
      expect(view.liveness).toEqual({
        status: 'Approved',
        method: 'PASSIVE',
        score: 97.5,
        referenceImage: 'https://media/ref.jpg',
      });
      expect(view.faceMatch?.targetImage).toBe('https://media/tgt.jpg');
    });

    it('drops addresses, MRZ, barcodes, full ID numbers and cross-session data', () => {
      const text = JSON.stringify(toAdminDecisionView(full));
      for (const secret of [
        'Secret Street',
        'IDNGA',
        'SECRET-BARCODE',
        'AB-12',
        'secret@example.com',
        'video.webm',
        'other-creator',
        'session_url',
        'place_of_birth',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('tolerates missing sections', () => {
      expect(toAdminDecisionView({})).toEqual({
        status: null,
        idVerification: null,
        liveness: null,
        faceMatch: null,
        warnings: [],
      });
    });
  });
});
