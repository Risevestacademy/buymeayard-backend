import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CREATOR_REPORT_REASONS, ReportCreatorDto } from './report-creator.dto';

const base = {
  reason: 'SCAM_OR_FRAUD',
  description: 'What happened',
  evidenceLink1: 'https://example.com/proof',
  reporterEmail: 'name@example.com',
};

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(ReportCreatorDto, body);
  return { dto, errors: await validate(dto) };
}

describe('ReportCreatorDto', () => {
  it('has the 8 reasons from the form', () => {
    expect(CREATOR_REPORT_REASONS).toHaveLength(8);
  });

  it.each(CREATOR_REPORT_REASONS)('accepts the %s reason', async (reason) => {
    expect((await check({ ...base, reason })).errors).toHaveLength(0);
  });

  it('rejects the old reasons', async () => {
    const { errors } = await check({ ...base, reason: 'IMPERSONATION' });
    expect(errors.map((e) => e.property)).toEqual(['reason']);
  });

  it('adds https:// to a bare address and ignores an empty second link', async () => {
    const { dto, errors } = await check({
      ...base,
      evidenceLink1: ' example.com/proof ',
      evidenceLink2: '',
    });
    expect(errors).toHaveLength(0);
    expect(dto.evidenceLink1).toBe('https://example.com/proof');
    expect(dto.evidenceLink2).toBeUndefined();
  });

  it('requires link 1 and the email', async () => {
    const { errors } = await check({
      reason: 'OTHER',
      description: 'x',
    });
    expect(errors.map((e) => e.property).sort()).toEqual([
      'evidenceLink1',
      'reporterEmail',
    ]);
  });

  it('rejects a link that is not http or https', async () => {
    const { errors } = await check({
      ...base,
      evidenceLink2: 'ftp://example.com/file',
    });
    expect(errors.map((e) => e.property)).toEqual(['evidenceLink2']);
  });
});
