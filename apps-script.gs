/**
 * Sales Dashboard 2026 - Refractarios Iunge
 * Backend Apps Script - VERSIÓN BLINDADA v4
 * - Columnas 14=Mercado, 15=Resultado escritas EXPLÍCITAMENTE
 * - Logs en Apps Script para diagnóstico
 */

const SPREADSHEET_ID = '11AAq3BZvZ6o5RRnrD-j_4MWYZWKn1kcfsk3XXH5DDbY';

const SHEETS = ['RC', 'MC', 'FF'];
const VENDOR_NAMES = { RC: 'Ricardo Cepeda', MC: 'Mónica Castillo', FF: 'Franco Fernández' };

const HEADER_ROW = 3;
const DATA_START_ROW = 4;
const NUM_COLS = 15;

// Columnas 1..13 (campos clásicos)
const COLUMNS = [
  'cliente', 'objetivo', 'contacto', 'etapa', 'estimacion',
  'avance', 'precio', 'cantidad', 'avanceParcial', 'cumplimiento',
  'fecha', 'siguientes', 'comentarios', 'mercado', 'resultado'
];
const COL_INDEX = {};
COLUMNS.forEach((k, i) => COL_INDEX[k] = i + 1);

// COLUMNAS FIJAS PARA MERCADO Y RESULTADO (no dependen de COLUMNS)
const COL_MERCADO = 14;
const COL_RESULTADO = 15;

const MARKETS = ['Acería','Retail','Cobre','Instalador','Distribuidor','Fundición','Energía','Cemento y Cal','Otros Minerales','Otros'];

const CLIENT_TO_MARKET = {
  'magotteaux':'Acería','sodimac':'Retail','ventanas':'Cobre','refex':'Instalador',
  'maigas':'Retail','amesti':'Retail','imperial':'Retail','angloamerican':'Cobre',
  'altonorte':'Cobre','esco':'Acería','proteco':'Distribuidor','talleres':'Acería',
  'vulco':'Fundición','enap':'Energía','chuquicamata':'Cobre','inacal ant':'Cemento y Cal',
  'inacal cpp':'Cemento y Cal','molymet':'Otros Minerales','molynor':'Otros Minerales',
  'cbb':'Cemento y Cal','fundiciones':'Fundición'
};

function lookupMarket(client) {
  if (!client) return null;
  const norm = String(client).trim().toLowerCase();
  if (CLIENT_TO_MARKET[norm]) return CLIENT_TO_MARKET[norm];
  for (const key of Object.keys(CLIENT_TO_MARKET)) {
    if (norm.startsWith(key + ' ') || norm.startsWith(key + '-')) return CLIENT_TO_MARKET[key];
  }
  return null;
}

function ensureExtraColumns(sheet) {
  if (!String(sheet.getRange(HEADER_ROW, COL_MERCADO).getValue() || '').trim())
    sheet.getRange(HEADER_ROW, COL_MERCADO).setValue('Mercado').setFontWeight('bold');
  if (!String(sheet.getRange(HEADER_ROW, COL_RESULTADO).getValue() || '').trim())
    sheet.getRange(HEADER_ROW, COL_RESULTADO).setValue('Resultado').setFontWeight('bold');
}

/* ===== LECTURA ===== */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = {};
    SHEETS.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) { result[name] = []; return; }
      ensureExtraColumns(sheet);
      const lastRow = sheet.getLastRow();
      if (lastRow < DATA_START_ROW) { result[name] = []; return; }
      const range = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, NUM_COLS);
      const values = range.getValues();
      const rows = values.map((r, idx) => ({ r, _row: DATA_START_ROW + idx }))
        .filter(({r}) => {
          const c = String(r[0] || '').trim();
          return c !== '' && c.toUpperCase() !== 'GRAN TOTAL US$';
        })
        .map(({r, _row}) => {
          const obj = { _row, _vendor: name };
          // Leemos las 15 columnas explícitamente
          obj.cliente       = r[0];
          obj.objetivo      = r[1];
          obj.contacto      = r[2];
          obj.etapa         = r[3];
          obj.estimacion    = r[4];
          obj.avance        = r[5];
          obj.precio        = r[6];
          obj.cantidad      = r[7];
          obj.avanceParcial = r[8];
          obj.cumplimiento  = r[9];
          obj.fecha         = r[10] instanceof Date ? r[10].toISOString() : r[10];
          obj.siguientes    = r[11];
          obj.comentarios   = r[12];
          obj.mercado       = r[13];     // col 14
          obj.resultado     = r[14];     // col 15
          if (!obj.mercado || String(obj.mercado).trim() === '') {
            obj.mercado = lookupMarket(obj.cliente);
          }
          // Limpiar nulls
          Object.keys(obj).forEach(k => { if (obj[k] === '') obj[k] = null; });
          return obj;
        });
      result[name] = rows;
    });
    return jsonResponse({ status: 'ok', generatedAt: new Date().toISOString(), vendors: VENDOR_NAMES, markets: MARKETS, clientToMarket: CLIENT_TO_MARKET, data: result });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/* ===== ESCRITURA ===== */
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error('Body vacío');
    const body = JSON.parse(e.postData.contents);
    Logger.log('doPost recibido: ' + JSON.stringify(body));   // DEBUG
    const action = body.action || 'add';
    if (action === 'add') return addRow(body);
    if (action === 'update') return updateRow(body);
    if (action === 'ping') return jsonResponse({ status: 'ok', pong: true });
    throw new Error('Acción desconocida: ' + action);
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function normalizeValue(key, value) {
  if (value === undefined || value === null || value === '') return '';
  if (key === 'fecha') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  if (key === 'avance') {
    const n = Number(value);
    if (!isNaN(n)) return n > 1 ? n / 100 : n;
  }
  if (['estimacion','precio','cantidad','avanceParcial','cumplimiento'].includes(key)) {
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return value;
}

function addRow(body) {
  const vendor = body.vendor;
  if (!SHEETS.includes(vendor)) throw new Error('Vendedor inválido: ' + vendor);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(vendor);
  if (!sheet) throw new Error('Hoja no encontrada: ' + vendor);
  ensureExtraColumns(sheet);

  if (!body.mercado || String(body.mercado).trim() === '') {
    body.mercado = lookupMarket(body.cliente) || 'Otros';
  }
  const newRow = COLUMNS.map(key => normalizeValue(key, body[key]));

  const lastRow = sheet.getLastRow();
  let insertRow = -1;
  for (let r = DATA_START_ROW; r <= lastRow; r++) {
    const v = String(sheet.getRange(r, 1).getValue() || '').trim();
    if (v === '') { insertRow = r; break; }
    if (v.toUpperCase() === 'GRAN TOTAL US$') {
      sheet.insertRowBefore(r);
      insertRow = r;
      break;
    }
  }
  if (insertRow === -1) insertRow = lastRow + 1;

  sheet.getRange(insertRow, 1, 1, NUM_COLS).setValues([newRow]);
  // Aseguramos mercado y resultado por si COLUMNS estaba mal
  if (body.mercado) sheet.getRange(insertRow, COL_MERCADO).setValue(body.mercado);
  if (body.resultado) sheet.getRange(insertRow, COL_RESULTADO).setValue(body.resultado);
  sheet.getRange(insertRow, COL_INDEX.avance).setNumberFormat('0%');
  sheet.getRange(insertRow, COL_INDEX.fecha).setNumberFormat('dd-mm-yyyy');
  return jsonResponse({ status:'ok', action:'add', vendor, insertedRow:insertRow });
}

function updateRow(body) {
  const vendor = body.vendor;
  if (!SHEETS.includes(vendor)) throw new Error('Vendedor inválido: ' + vendor);
  const rowNum = Number(body._row);
  if (!rowNum || rowNum < DATA_START_ROW) throw new Error('Fila inválida: ' + body._row);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(vendor);
  if (!sheet) throw new Error('Hoja no encontrada: ' + vendor);
  ensureExtraColumns(sheet);

  if (body._expectedClient !== undefined && body._expectedClient !== null) {
    const current = String(sheet.getRange(rowNum, 1).getValue() || '').trim();
    const expected = String(body._expectedClient || '').trim();
    if (current !== expected) {
      throw new Error('La fila ' + rowNum + ' cambió en el sheet (' + current + ' vs ' + expected + ').');
    }
  }

  const updatedFields = [];

  // Update por COLUMNS (campos 1-13 estándar)
  COLUMNS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(body, key) && key !== 'mercado' && key !== 'resultado') {
      sheet.getRange(rowNum, COL_INDEX[key]).setValue(normalizeValue(key, body[key]));
      updatedFields.push(key);
    }
  });

  // ESCRITURA EXPLÍCITA Y BLINDADA de mercado y resultado
  if (Object.prototype.hasOwnProperty.call(body, 'mercado')) {
    sheet.getRange(rowNum, COL_MERCADO).setValue(body.mercado || '');
    updatedFields.push('mercado');
    Logger.log('updateRow: mercado escrito en fila ' + rowNum + ' col ' + COL_MERCADO + ' = ' + body.mercado);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'resultado')) {
    sheet.getRange(rowNum, COL_RESULTADO).setValue(body.resultado || '');
    updatedFields.push('resultado');
    Logger.log('updateRow: resultado escrito en fila ' + rowNum + ' col ' + COL_RESULTADO + ' = ' + body.resultado);
  }

  sheet.getRange(rowNum, COL_INDEX.avance).setNumberFormat('0%');
  sheet.getRange(rowNum, COL_INDEX.fecha).setNumberFormat('dd-mm-yyyy');
  return jsonResponse({ status:'ok', action:'update', vendor, updatedRow:rowNum, updatedFields });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function testRead() { Logger.log(doGet({}).getContent()); }

// Test directo de escritura - úsalo para verificar
function testWriteResultado() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('FF');
  ensureExtraColumns(sheet);
  sheet.getRange(4, COL_RESULTADO).setValue('Ganada');
  Logger.log('Test: escribi "Ganada" en FF fila 4 col 15');
}

function migrateMarkets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let totalUpdated = 0;
  const unknownList = [];
  SHEETS.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    ensureExtraColumns(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < DATA_START_ROW) return;
    for (let r = DATA_START_ROW; r <= lastRow; r++) {
      const cliente = String(sheet.getRange(r, 1).getValue() || '').trim();
      if (!cliente || cliente.toUpperCase() === 'GRAN TOTAL US$') continue;
      const currentMercado = String(sheet.getRange(r, COL_MERCADO).getValue() || '').trim();
      if (currentMercado) continue;
      const market = lookupMarket(cliente);
      if (market) { sheet.getRange(r, COL_MERCADO).setValue(market); totalUpdated++; }
      else unknownList.push(name + ' fila ' + r + ': "' + cliente + '"');
    }
  });
  Logger.log('Migracion: ' + totalUpdated + ' actualizadas, ' + unknownList.length + ' sin clasificar');
  return { updated: totalUpdated, unknown: unknownList };
}
