import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycDocumentType, KycSubmissionStatus as S } from '@buymeayard/types';
import { DiditProvider } from './didit.provider';

describe('DiditProvider HTTP behaviour', () => {
  const config: Record<string, string> = {
    DIDIT_API_KEY: 'live-key',
    DIDIT_WORKFLOW_ID: 'wf-1',
    DIDIT_BASE_URL: 'https://verification.didit.me/',
  };
  const provider = () =>
    new DiditProvider({ get: (k: string) => config[k] } as never);

  const params = {
    vendorData: 'creator-1',
    callbackUrl: 'https://creator.example.com/kyc/complete',
    email: 'c@example.com',
    expectedDetails: {
      firstName: 'Mariam',
      lastName: 'Omiteru',
      dateOfBirth: '1995-10-12',
      country: 'NGA',
      documentType: KycDocumentType.NATIONAL_ID,
    },
  };

  let fetchMock: jest.SpyInstance;
  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
      }),
    );

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('creates a session with the API key, workflow and expected details', async () => {
    respond(201, {
      session_id: 's-1',
      session_token: 'tok',
      url: 'https://verify.didit.me/session/s-1',
      status: 'Not Started',
      workflow_id: 'wf-1',
    });

    await expect(provider().createSession(params)).resolves.toMatchObject({
      sessionId: 's-1',
      sessionToken: 'tok',
      status: S.CREATED,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://verification.didit.me/v3/session/');
    expect(init.headers['x-api-key']).toBe('live-key');
    expect(JSON.parse(init.body)).toMatchObject({
      workflow_id: 'wf-1',
      vendor_data: 'creator-1',
      expected_details: {
        first_name: 'Mariam',
        id_country: 'NGA',
        expected_document_types: ['ID'],
      },
    });
  });

  it('reports exhausted credits as a distinct 503 KYC_UNAVAILABLE', async () => {
    respond(400, {
      detail:
        "You don't have enough credits to perform this request. Please top up at https://business.didit.me",
    });
    const err = await provider()
      .createSession(params)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'KYC_UNAVAILABLE',
    });
  });

  it('maps other provider errors to 502 without leaking the body', async () => {
    respond(400, { workflow_id: ['Invalid workflow'] });
    const err = await provider()
      .createSession(params)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(
      JSON.stringify((err as BadGatewayException).getResponse()),
    ).not.toContain('Invalid workflow');
  });

  it('treats a 404 decision as "no status" instead of an error', async () => {
    respond(404, { detail: 'Not found.' });
    await expect(provider().getDecision('gone')).resolves.toMatchObject({
      status: null,
    });
  });

  it('refuses to call Didit when not configured', async () => {
    const unconfigured = new DiditProvider({ get: () => undefined } as never);
    await expect(unconfigured.createSession(params)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
