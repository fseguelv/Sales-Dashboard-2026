/**
 * Sales Dashboard 2026 - Refractarios Iunge
 * Backend Apps Script - Columna 14=Mercado, 15=Resultado
 */

const SPREADSHEET_ID = '11AAq3BZvZ6o5RRnrD-j_4MWYZWKn1kcfsk3XXH5DDbY';

const SHEETS = ['RC', 'MC', 'FF'];
const VENDOR_NAMES = { RC: 'Ricardo Cepeda', MC: 'Mónica Castillo', FF: 'Franco Fernández' };

const HEADER_ROW = 3;
const DATA_START_ROW = 4;
const NUM_COLS = 15;
const COLUMNS = [
  'cliente', 'objetivo', 'contacto', 'etapa', 'estimacion',
  'avance', 'precio', 'cantidad', 'avanceParcial', 'cumplimiento',
  'fecha', 'siguientes', 'comentarios', 'mercado', 'resultado'
];
const COL_INDEX = {};
COLUMNS.forEach((k, i) => COL_INDEX[k] = i + 1);

const MARKETS = ['Acería','Retail','Cobre','Instalador','Distribuidor','Fundición','Energía','Cemento y Cal','Otros Minerales','Otros'];

const CLIENT_TO_MARKET = {
  'magotteaux': 'Acería', 'sodimac': 'Retail', 'ventanas': 'Cobre',
  'refex': 'Instalador', 'maigas': 'Retail', 'amesti': 'Retail',
  'imperial': 'Retail', 'angloamerican': 'Cobre', 'altonorte': 'Cobre',
  'esco': 'Acería', 'proteco': 'Distribuidor', 'talleres': 'Acería',
  'vulco': 'Fundición', 'enap': 'Energía', 'chuquicamata': 'Cobre',
  'inacal ant': 'Cemento y Cal', 'inacal cpp': 'Cemento y Cal',
  'molymet': 'Otros Minerales', 'molynor': 'Otros Minerales',
  'cbb': 'Cemento y Cal', 'fundiciones': 'Fundición'
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
  if (!String(sheet.getRange(HEADER_ROW, COL_INDEX.mercado).getValue() || '').trim())
    sheet.getRange(HEADER_ROW, COL_INDEX.mercado).setValue('Mercado').setFontWeight('bold');
  if (!String(sheet.getRange(HEADER_ROW, COL_INDEX.resultado).getValue() || '').trim())
    sheet.getRange(HEADER_ROW, COL_INDEX.resultado).setValue('Resultado').setFontWeight('bold');
}

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
          COLUMNS.forEach((key, i) => {
            let v = r[i];
            if (v instanceof Date) v = v.toISOString();
            obj[key] = v === '' ? null : v;
          });
          if (!obj.mercado || String(obj.mercado).trim() === '') obj.mercado = lookupMarket(obj.cliente);
          return obj;
        });
      result[name] = rows;
    });
    return jsonResponse({ status: 'ok', generatedAt: new Date().toISOString(), vendors: VENDOR_NAMES, markets: MARKETS, clientToMarket: CLIENT_TO_MARKET, data: result });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error('Body vacío');
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'add';
    if (action === 'add') return addRow(body);
    if (action === 'update') return updateRow(body);
    if (action === 'ping') return jsonResponse({ status: 'ok', pong: true });
    throw new Error('Acción desconocida: ' + action);
  } catch (err) {
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
  sheet.getRange(insertRow, COL_INDEX.avance).setNumberFormat('0%');
  sheet.getRange(insertRow, COL_INDEX.fecha).setNumberFormat('dd-mm-yyyy');
  return jsonResponse({ status: 'ok', action: 'add', vendor: vendor, insertedRow: insertRow });
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
    const current = String(sheet.getRange(rowNum, COL_INDEX.cliente).getValue() || '').trim();
    const expected = String(body._expectedClient || '').trim();
    if (current !== expected) {
      throw new Error('La fila ' + rowNum + ' cambió en el sheet (' + current + ' vs ' + expected + '). Refresca y vuelve a intentar.');
    }
  }
  const updatedFields = [];
  COLUMNS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      sheet.getRange(rowNum, COL_INDEX[key]).setValue(normalizeValue(key, body[key]));
      updatedFields.push(key);
    }
  });
  sheet.getRange(rowNum, COL_INDEX.avance).setNumberFormat('0%');
  sheet.getRange(rowNum, COL_INDEX.fecha).setNumberFormat('dd-mm-yyyy');
  return jsonResponse({ status: 'ok', action: 'update', vendor: vendor, updatedRow: rowNum, updatedFields: updatedFields });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function testRead() {
  Logger.log(doGet({}).getContent());
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
      const cliente = String(sheet.getRange(r, COL_INDEX.cliente).getValue() || '').trim();
      if (!cliente || cliente.toUpperCase() === 'GRAN TOTAL US$') continue;
      const currentMercado = String(sheet.getRange(r, COL_INDEX.mercado).getValue() || '').trim();
      if (currentMercado) continue;
      const market = lookupMarket(cliente);
      if (market) { sheet.getRange(r, COL_INDEX.mercado).setValue(market); totalUpdated++; }
      else unknownList.push(name + ' fila ' + r + ': "' + cliente + '"');
    }
  });
  Logger.log('Migracion: ' + totalUpdated + ' actualizadas, ' + unknownList.length + ' sin clasificar');
  unknownList.forEach(s => Logger.log('  - ' + s));
  return { updated: totalUpdated, unknown: unknownList };
}
