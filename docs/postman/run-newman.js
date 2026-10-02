/*
 * Runs the whole collection from the CLI in one pass, applying the creator
 * fixtures SQL at the guide's single pause point (after folder 02).
 *
 *   npm i -g newman@6
 *   NODE_PATH=$(npm root -g) node docs/postman/run-newman.js
 *
 * Environment overrides (defaults match the local setup):
 *   BASE_URL      http://localhost:3000/api/v1
 *   HOST_URL      http://localhost:3000
 *   PG_CONTAINER  buymeayard-postgres
 *   PG_DB         buymeayard
 *
 * Local development only.
 */
const path = require('path');
const { execSync } = require('child_process');
const newman = require('newman');

const dir = __dirname;
const baseUrl = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const hostUrl = process.env.HOST_URL || 'http://localhost:3000';
const container = process.env.PG_CONTAINER || 'buymeayard-postgres';
const db = process.env.PG_DB || 'buymeayard';

const psql = (args) => `docker exec -i ${container} psql -U postgres -d ${db} ${args}`;
const failures = [];
let fixturesApplied = false;

newman
  .run({
    collection: require(path.join(dir, 'BuyMeAYard.postman_collection.json')),
    environment: require(path.join(dir, 'BuyMeAYard.local.postman_environment.json')),
    envVar: [
      { key: 'baseUrl', value: baseUrl },
      { key: 'hostUrl', value: hostUrl },
    ],
    reporters: ['cli'],
    reporter: { cli: { noConsole: true } },
  })
  .on('beforeItem', (err, args) => {
    if (fixturesApplied || args.item.name !== 'Public creator profile (after SQL fixtures)') return;
    // The creator onboarded in folder 02 is the newest profile.
    const slug = execSync(
      psql(`-At -c 'SELECT slug FROM creator_profiles ORDER BY "createdAt" DESC LIMIT 1'`),
    )
      .toString()
      .trim();
    execSync(
      `${psql(`-v ON_ERROR_STOP=1 -q -v creator=${slug}`)} < ${path.join(dir, 'sql/02-seed-creator-fixtures.sql')}`,
      { stdio: 'ignore', shell: '/bin/bash' },
    );
    console.log(`\nFixtures applied for ${slug}\n`);
    fixturesApplied = true;
  })
  .on('assertion', (err, args) => {
    if (err) failures.push(`${args.item.name} :: ${args.assertion}`);
  })
  .on('done', (err, summary) => {
    if (err) {
      console.error(err);
      process.exit(2);
    }
    const s = summary.run.stats;
    console.log(
      `\nRequests ${s.requests.total} (failed ${s.requests.failed}), assertions ${s.assertions.total} (failed ${s.assertions.failed})`,
    );
    failures.forEach((f) => console.log(`FAIL ${f}`));
    process.exit(s.assertions.failed || s.requests.failed ? 1 : 0);
  });
