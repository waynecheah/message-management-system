import { MongoClient } from 'mongodb';

const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB ?? 'messages';

const client = await new MongoClient(url).connect();
const plan = await client
  .db(dbName)
  .collection('messages')
  .find({ tenantId: 'tenant-a', conversationId: 'demo' })
  .sort({ timestamp: -1, _id: -1 })
  .limit(21)
  .explain('queryPlanner');

process.stdout.write(`${JSON.stringify(plan.queryPlanner ?? plan, null, 2)}\n`);
await client.close();
