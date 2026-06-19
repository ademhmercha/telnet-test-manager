const { MongoClient } = require('mongodb');

const SOURCE_URI = 'mongodb://localhost:27017/test-Telnet-Manager';
const TARGET_URI = 'mongodb://admin%20:admin123%20@localhost:27018/telnet-db?authSource=admin';

async function migrate() {
  const source = new MongoClient(SOURCE_URI);
  const target = new MongoClient(TARGET_URI);

  await source.connect();
  await target.connect();
  console.log('Connected to both MongoDB instances');

  const sourceDb = source.db('test-Telnet-Manager');
  const targetDb = target.db('telnet-db');

  const collections = await sourceDb.listCollections().toArray();
  console.log(`Found ${collections.length} collections: ${collections.map(c => c.name).join(', ')}`);

  for (const col of collections) {
    const name = col.name;
    const docs = await sourceDb.collection(name).find({}).toArray();
    if (docs.length === 0) {
      console.log(`${name}: empty, skipping`);
      continue;
    }
    await targetDb.collection(name).deleteMany({});
    await targetDb.collection(name).insertMany(docs);
    console.log(`${name}: ${docs.length} documents migrated`);
  }

  await source.close();
  await target.close();
  console.log('Migration complete!');
}

migrate().catch(e => { console.error('Error:', e.message); process.exit(1); });
