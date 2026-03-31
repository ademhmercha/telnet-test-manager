/**
 * seed.js — Migration des données JSON vers MongoDB
 * Usage: node seed.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const {
  connectDB,
  User, Poste, Produit, Reference, Slot,
  TestResult, AuditLog, TelnetCommand, Report
} = require('./db');

async function seed() {
  await connectDB();

  // ── Lecture des fichiers JSON existants ───────────────────────────────────
  const database    = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.json'), 'utf8'));
  const telnetData  = JSON.parse(fs.readFileSync(path.join(__dirname, 'telnetCommands.json'), 'utf8'));

  // ── Users (hachage des mots de passe) ────────────────────────────────────
  await User.deleteMany({});
  for (const user of database.users) {
    const hashed = await bcrypt.hash(user.password, 10);
    await User.create({ ...user, password: hashed });
  }
  console.log(`✓ ${database.users.length} utilisateurs migrés (mots de passe hachés)`);

  // ── Postes ────────────────────────────────────────────────────────────────
  await Poste.deleteMany({});
  await Poste.insertMany(database.postes);
  console.log(`✓ ${database.postes.length} postes migrés`);

  // ── Produits ──────────────────────────────────────────────────────────────
  await Produit.deleteMany({});
  await Produit.insertMany(database.produits);
  console.log(`✓ ${database.produits.length} produits migrés`);

  // ── Références ────────────────────────────────────────────────────────────
  if (Array.isArray(database.references) && database.references.length) {
    await Reference.deleteMany({});
    await Reference.insertMany(database.references);
    console.log(`✓ ${database.references.length} références migrées`);
  }

  // ── Slots ─────────────────────────────────────────────────────────────────
  await Slot.deleteMany({});
  await Slot.insertMany(database.slots);
  console.log(`✓ ${database.slots.length} slots migrés`);

  // ── Résultats de tests ────────────────────────────────────────────────────
  if (Array.isArray(database.testResults) && database.testResults.length) {
    await TestResult.deleteMany({});
    await TestResult.insertMany(database.testResults, { ordered: false }).catch(() => {});
    const count = await TestResult.countDocuments();
    console.log(`✓ ${count} résultats de tests migrés`);
  }

  // ── Logs d'audit ─────────────────────────────────────────────────────────
  if (Array.isArray(database.auditLogs) && database.auditLogs.length) {
    await AuditLog.deleteMany({});
    await AuditLog.insertMany(database.auditLogs, { ordered: false }).catch(() => {});
    const count = await AuditLog.countDocuments();
    console.log(`✓ ${count} logs d'audit migrés`);
  }

  // ── Commandes Telnet ─────────────────────────────────────────────────────
  await TelnetCommand.deleteMany({});
  await TelnetCommand.insertMany(telnetData.commands);
  console.log(`✓ ${telnetData.commands.length} commandes Telnet migrées`);

  // ── Rapports (depuis les fichiers JSON) ───────────────────────────────────
  const reportsDir = path.join(__dirname, 'reports');
  if (fs.existsSync(reportsDir)) {
    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
    if (files.length > 0) {
      await Report.deleteMany({});
      let imported = 0;
      for (const file of files) {
        try {
          const report = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
          await Report.create(report);
          imported++;
        } catch (e) {
          console.error(`  ⚠ Échec import rapport ${file}: ${e.message}`);
        }
      }
      console.log(`✓ ${imported}/${files.length} rapports migrés`);
    }
  }

  console.log('\n Migration terminée avec succès!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Échec de la migration:', err);
  process.exit(1);
});
