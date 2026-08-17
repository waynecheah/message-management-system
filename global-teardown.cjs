/**
 * Drops the `messages_test_*` Mongo databases and Elasticsearch indices the
 * integration suite creates, once the whole run has finished.
 *
 * This is disk hygiene, not test isolation: isolation comes from the per-run
 * namespacing in `test/app.ts`, which is what lets the suite pass against a
 * dirty stack. A teardown hook cannot be relied on for correctness — it does
 * not run when the process crashes, when a run is interrupted, or when a
 * worker is killed. It only stops leftovers accumulating forever.
 *
 * Scoped to the `integration` project so a unit-only run never reaches for
 * infrastructure. Sweeps by prefix rather than by this process's pid: jest
 * runs specs in a worker whose pid differs from this hook's, so the exact
 * per-run name is not knowable here.
 */
const { MongoClient } = require('mongodb');

const MONGO_URL = 'mongodb://localhost:27017';
const ES_NODE = 'http://localhost:9200';
const PREFIX = 'messages_test_';

module.exports = async function globalTeardown() {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const { databases } = await client.db().admin().listDatabases();
    await Promise.all(
      databases
        .filter((db) => db.name.startsWith(PREFIX))
        .map((db) => client.db(db.name).dropDatabase()),
    );
  } finally {
    await client.close();
  }

  // Elasticsearch refuses wildcard deletes (action.destructive_requires_name
  // defaults to true on 8.x), so resolve the names first and delete each.
  const response = await fetch(`${ES_NODE}/_cat/indices/${PREFIX}*?h=index&format=json`);
  for (const { index } of await response.json()) {
    await fetch(`${ES_NODE}/${index}`, { method: 'DELETE' });
  }
};
