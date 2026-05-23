const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test-Telnet-Manager';

async function connectDB() {
  const maxRetries = 30;
  const delayMs = 5000;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log(`MongoDB connecté: ${MONGO_URI}`);
      return;
    } catch (err) {
      console.log(`MongoDB non disponible (tentative ${i}/${maxRetries}): ${err.message}`);
      if (i === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

module.exports = { connectDB };
