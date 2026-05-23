const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test-Telnet-Manager';

async function connectDB() {
  for (let i = 1; i <= 30; i++) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log(`MongoDB connecté: ${MONGO_URI}`);
      return;
    } catch (err) {
      console.log(`MongoDB indisponible (${i}/30): ${err.message}`);
      if (i === 30) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

module.exports = { connectDB };
