import { isDeployedEnvironment } from './environment';

describe('isDeployedEnvironment', () => {
  it.each([
    ['production', true],
    ['staging', true],
    ['development', false],
    ['test', false],
    [undefined, false],
  ])('%s -> %s', (env, expected) => {
    expect(isDeployedEnvironment(env)).toBe(expected);
  });
});
