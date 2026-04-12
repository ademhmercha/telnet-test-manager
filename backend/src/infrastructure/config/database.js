const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test-Telnet-Manager';

async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log(`MongoDB connecté: ${MONGO_URI}`);
}

module.exports = { connectDB };
