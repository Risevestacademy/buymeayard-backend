import { buildPagination } from './pagination.util';

describe('buildPagination', () => {
  it('returns page, limit, total and totalPages', () => {
    expect(buildPagination(2, 10, 67)).toEqual({
      page: 2,
      limit: 10,
      total: 67,
      totalPages: 7,
    });
  });

  it('reports one page when there are no results', () => {
    expect(buildPagination(1, 20, 0).totalPages).toBe(1);
  });
});
