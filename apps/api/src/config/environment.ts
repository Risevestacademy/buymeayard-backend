/**
 * NODE_ENV is one of development, test, staging or production. Staging runs
 * like production (production build, JSON logs, strict checks) but against
 * sandbox keys, so it is a "deployed" environment, not a production one.
 */
export type AppEnvironment = 'development' | 'production' | 'test' | 'staging';

/** Production or staging: a deployed environment reachable by real clients. */
export function isDeployedEnvironment(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production' || nodeEnv === 'staging';
}
