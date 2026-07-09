const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

async function initialize() {
  const p = getPool();
  await p.query('SELECT 1'); // valida conexão
  console.log('[PostgreSQL] Conectado com sucesso.');
  return p;
}

async function ensureSheetsExist() {
  const p = getPool();
  // Migração incremental: adiciona colunas que faltam sem recriar tabelas
  const migrations = [
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Nr_OS_OPP" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Data_OS_Externa" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Travado" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Travado_Em" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Travado_Por" TEXT`,
  ];
  for (const sql of migrations) {
    try { await p.query(sql); } catch (e) { console.warn('[Migration]', e.message); }
  }
}

// Serializa valores para garantir compatibilidade com o comportamento do Sheets (tudo string)
function serialize(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

// Converte objeto do PG (pode ter números/datas) para objeto com valores string (igual Sheets)
function rowToStrings(row) {
  if (!row) return null;
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    obj[k] = serialize(v);
  }
  return obj;
}

// Converte valor para null se for string vazia (para INSERT/UPDATE no PG)
function toDb(val) {
  if (val === '' || val === undefined) return null;
  return val;
}

async function readSheet(tableName) {
  const res = await getPool().query(`SELECT * FROM "${tableName}" ORDER BY ctid`);
  return res.rows.map(rowToStrings);
}

async function findRows(tableName, condition) {
  const rows = await readSheet(tableName);
  return rows.filter(condition);
}

async function findOne(tableName, condition) {
  const rows = await readSheet(tableName);
  return rows.find(condition) || null;
}

async function insertRow(tableName, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) return data;

  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map(k => toDb(data[k]));

  await getPool().query(
    `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    values
  );
  return data;
}

async function insertManyRows(tableName, dataArray) {
  if (!dataArray || dataArray.length === 0) return;

  const keys = Object.keys(dataArray[0]);
  const cols = keys.map(k => `"${k}"`).join(', ');

  // Insere em lotes de 100 para evitar queries enormes
  const BATCH = 100;
  for (let start = 0; start < dataArray.length; start += BATCH) {
    const batch = dataArray.slice(start, start + BATCH);
    const valueSets = [];
    const allValues = [];
    let idx = 1;
    for (const row of batch) {
      const placeholders = keys.map(() => `$${idx++}`).join(', ');
      valueSets.push(`(${placeholders})`);
      keys.forEach(k => allValues.push(toDb(row[k])));
    }
    await getPool().query(
      `INSERT INTO "${tableName}" (${cols}) VALUES ${valueSets.join(', ')} ON CONFLICT DO NOTHING`,
      allValues
    );
  }
}

async function updateRowById(tableName, idField, idValue, newData) {
  const keys = Object.keys(newData).filter(k => k !== idField);
  if (keys.length === 0) return newData;

  const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const values = [...keys.map(k => toDb(newData[k])), idValue];

  await getPool().query(
    `UPDATE "${tableName}" SET ${sets} WHERE "${idField}" = $${keys.length + 1}`,
    values
  );
  return newData;
}

async function updateManyRowsWhere(tableName, filterFn, newData) {
  const rows = await readSheet(tableName);
  const toUpdate = rows.filter(filterFn);
  for (const row of toUpdate) {
    // Precisamos do campo PK — tenta detectar pelo nome convencional
    const pkField = Object.keys(row).find(k => k.startsWith('ID_') || k === 'ID' || k === 'Chave') || Object.keys(row)[0];
    await updateRowById(tableName, pkField, row[pkField], { ...row, ...newData });
  }
  return toUpdate.length;
}

async function deleteRowById(tableName, idField, idValue) {
  const res = await getPool().query(
    `DELETE FROM "${tableName}" WHERE "${idField}" = $1`,
    [idValue]
  );
  return (res.rowCount || 0) > 0;
}

async function clearSheetData(tableName) {
  await getPool().query(`DELETE FROM "${tableName}"`);
}

module.exports = {
  initialize,
  ensureSheetsExist,
  readSheet,
  findRows,
  findOne,
  insertRow,
  insertManyRows,
  updateRowById,
  updateManyRowsWhere,
  deleteRowById,
  clearSheetData,
};
