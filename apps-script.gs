/**
 * Sales Dashboard 2026 - Refractarios Iunge
 * Backend: Google Apps Script Web App
 *
 * Endpoints (POST acción):
 *   add    -> agrega nueva oportunidad (incluye mercado)
 *   update -> modifica fila existente
 *   ping   -> healthcheck
 *
 * Columna 14 NUEVA: Mercado
 * Función auxiliar:
 *   migrateMarkets()  -> ejecutar UNA vez para llenar la columna Mercado
 *                        de las filas existentes según el mapeo conocido.
 */

const SPREADSHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_SHEET'; // <-- IMPORTANTE: pega el ID de tu Sheet

const SHEETS = ['RC', 'MC', 'FF'];
const VENDOR_NAMES = {
  RC: 'Ricardo Cepeda',
  MC: 'Mónica Castillo',
  FF: 'Franco Fernández'
};

const HEADER_ROW    = 3;
const DATA_START_ROW = 4;
const NUM_COLS = 14;
const COLUMNS = [
  'cliente', 'objetivo', 'contacto', 'etapa', 'estimacion',
  'avance', 'precio', 'cantidad', 'avanceParcial', 'cumplimiento',
  'fecha', 'siguientes', 'comentarios', 'mercado'
];
const COL_INDEX = {};
COLUMNS.forEach((k, i) => COL_INDEX[k] = i + 1);

const MARKETS = [
  'Acería', 'Retail', 'Cobre', 'Instalador', 'Distribuidor',
  'Fundición', 'Energía', 'Cemento y Cal', 'Otros Minerales', 'Otros'
];

// Mapeo cliente -> mercado (claves en minúsculas para comparación)
const CLIENT_TO_MARKET = {
  'magotteaux':    'Acería',
  'sodimac':       'Retail',
  'ventanas':      'Cobre',
  'refex':         'Instalador',
  'maigas':        'Retail',
  'amesti':        'Retail',
  'imperial':      'Retail',
  'angloamerican': 'Cobre',
  'altonorte':     'Cobre',
  'esco':          'Acería',
  'proteco':       'Distribuidor',
  'talleres':      'Acería',
  'vulco':         'Fundición',
  'enap':          'Energía',
  'chuquicamata':  'Cobre',
  'inacal ant':    'Cemento y Cal',
  'inacal cpp':    'Cemento y Cal',
  'molymet':       'Otros Minerales',
  'molynor':       'Otros Minerales',
  'cbb':           'Cemento y Cal',
  'fundiciones':   'Fundición'
};

function lookupMarket(client) {
  if (!client) return null;
  const norm = String(client).trim().toLowerCase();
  if (CLIENT_TO_MARKET[norm]) return CLIENT_TO_MARKET[norm];
  // Match parcial al inicio (CBB Teno -> CBB, Cementos Transex no matchea CBB)
  for (const key of Object.keys(CLIENT_TO_MARKET)) {
    if (norm.startsWith(key + ' ') || norm.startsWith(key + '-')) return CLIENT_TO_MARKET[key];
  }
  return null;
}

function ensureMercadoColumn(sheet) {
  const header = sheet.getRange(HEADER_ROW, COL_INDEX.mercado).getValue();
  if (!header || String(header).trim() === '') {
    sheet.getRange(HEADER_ROW, COL_INDEX.mercado).setValue('Mercado').setFontWeight('bold');
  }
}

/* ----------------------------- LECTURA ----------------------------- */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = {};

    SHEETS.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) { result[name] = []; return; }
      ensureMercadoColumn(sheet);

      const lastRow = sheet.getLastRow();
      if (lastRow < DATA_START_ROW) { result[name] = []; return; }
      const range = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, NUM_COLS);
      const values = range.getValues();

      const rows = values
        .map((r, idx) => ({ r, _row: DATA_START_ROW + idx }))
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
          // Auto-clasificar mercado si está vacío y el cliente es conocido
          if (!obj.mercado || String(obj.mercado).trim() === '') {
            obj.mercado = lookupMarket(obj.cliente);
          }
          return obj;
        });
      result[name] = rows;
    });

    return jsonResponse({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      vendors: VENDOR_NAMES,
      markets: MARKETS,
      clientToMarket: CLIENT_TO_MARKET,
      data: result
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/* ----------------------------- ESCRITURA ----------------------------- */
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error('Body vacío');
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'add';

    if (action === 'add')    return addRow(body);
    if (action === 'update') return updateRow(body);
    if (action === 'ping')   return jsonResponse({ status: 'ok', pong: true });

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
  ensureMercadoColumn(sheet);

  // Si no nos pasaron mercado, intentamos auto-clasificar
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

  return jsonResponse({
    status: 'ok',
    action: 'add',
    vendor: vendor,
    insertedRow: insertRow,
    mercado: body.mercado,
    timestamp: new Date().toISOString()
  });
}

function updateRow(body) {
  const vendor = body.vendor;
  if (!SHEETS.includes(vendor)) throw new Error('Vendedor inválido: ' + vendor);
  const rowNum = Number(body._row);
  if (!rowNum || rowNum < DATA_START_ROW) throw new Error('Fila inválida: ' + body._row);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(vendor);
  if (!sheet) throw new Error('Hoja no encontrada: ' + vendor);
  ensureMercadoColumn(sheet);

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
      const cell = sheet.getRange(rowNum, COL_INDEX[key]);
      const val  = normalizeValue(key, body[key]);
      cell.setValue(val);
      updatedFields.push(key);
    }
  });

  sheet.getRange(rowNum, COL_INDEX.avance).setNumberFormat('0%');
  sheet.getRange(rowNum, COL_INDEX.fecha).setNumberFormat('dd-mm-yyyy');

  return jsonResponse({
    status: 'ok',
    action: 'update',
    vendor: vendor,
    updatedRow: rowNum,
    updatedFields: updatedFields,
    timestamp: new Date().toISOString()
  });
}

/* ----------------------- HELPERS / MIGRACIÓN ----------------------- */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testRead() {
  const out = doGet({});
  Logger.log(out.getContent());
}

/**
 * Llena la columna Mercado para todas las filas existentes según el mapeo.
 * EJECUTAR UNA SOLA VEZ desde el editor de Apps Script: seleccionar
 * 'migrateMarkets' arriba y presionar Ejecutar.
 * Las filas con cliente desconocido se listan en el log y deben clasificarse
 * manualmente (o desde el dashboard al editarlas).
 */
function migrateMarkets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let totalUpdated = 0;
  const unknownList = [];

  SHEETS.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    ensureMercadoColumn(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow < DATA_START_ROW) return;

    for (let r = DATA_START_ROW; r <= lastRow; r++) {
      const cliente = String(sheet.getRange(r, COL_INDEX.cliente).getValue() || '').trim();
      if (!cliente || cliente.toUpperCase() === 'GRAN TOTAL US$') continue;

      const currentMercado = String(sheet.getRange(r, COL_INDEX.mercado).getValue() || '').trim();
      if (currentMercado) continue;

      const market = lookupMarket(cliente);
      if (market) {
        sheet.getRange(r, COL_INDEX.mercado).setValue(market);
        totalUpdated++;
      } else {
        unknownList.push(name + ' fila ' + r + ': "' + cliente + '"');
      }
    }
  });

  Logger.log('Migracion completada. ' + totalUpdated + ' filas actualizadas.');
  if (unknownList.length) {
    Logger.log(unknownList.length + ' clientes sin clasificar (clasifica desde el dashboard al editarlos):');
    unknownList.forEach(s => Logger.log('  - ' + s));
  }
  return { updated: totalUpdated, unknownCount: unknownList.length, unknown: unknownList };
}
