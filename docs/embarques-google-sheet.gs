/**
 * Sincroniza la planilla con los embarques del panel.
 *
 * Arma una pestaña "Resumen" con todos los embarques y una pestaña por
 * embarque con su detalle: foto, código, cantidad y observaciones. Cuando un
 * embarque se marca como arribado en la plataforma (entra a depósito), su
 * pestaña se oculta automáticamente: no se borra, así queda el histórico
 * disponible desde Ver > Hojas ocultas.
 *
 * La planilla es de sólo lectura en la práctica: cada actualización reescribe
 * las pestañas de embarque, así que no conviene anotar nada dentro de ellas.
 *
 * INSTALACIÓN
 *   1. En la planilla: Extensiones > Apps Script, y pegar este archivo.
 *   2. Configuración del proyecto > Propiedades del script, agregar:
 *        API_URL = https://TU-DOMINIO/api/sheets/embarques
 *        TOKEN   = el mismo valor que SHEETS_TOKEN en el panel
 *      (Van acá y no en el código para que el token no viaje si compartís la
 *      planilla o el script.)
 *   3. Recargar la planilla y usar el menú "Embarques" > "Actualizar ahora".
 *      La primera vez Google pide autorizar el acceso a la hoja y a la red.
 *   4. "Embarques" > "Actualizar cada 15 minutos" para dejarlo automático.
 */

var PESTANA_RESUMEN = 'Resumen';
var META_KEY = 'embarqueId';

// Paleta. Un solo azul de marca, grises para el cuerpo y tres colores de
// semáforo reservados exclusivamente para la fecha de llegada, que es el dato
// que la planilla tiene que gritar.
var AZUL = '#12395c';
var AZUL_CLARO = '#e8eef4';
var GRIS_BORDE = '#d5dce3';
var GRIS_TEXTO = '#5f6b76';
var BANDA = '#f7f9fb';
var BLANCO = '#ffffff';

var URGENTE_BG = '#fde8e6';  var URGENTE_FG = '#a4271c'; // llega en <= 3 días o se pasó
var PRONTO_BG  = '#fef3d7';  var PRONTO_FG  = '#8a5300'; // llega en <= 14 días
var LEJOS_BG   = '#e3f4e9';  var LEJOS_FG   = '#1c6b3f'; // más lejos
var NEUTRO_BG  = '#eef1f4';  var NEUTRO_FG  = GRIS_TEXTO; // sin ETA / recibido

var ALTO_FILA_ITEM = 92;
var LADO_FOTO = 82;

var COLUMNAS = [
  { titulo: 'Foto', ancho: 105 },
  { titulo: 'Código', ancho: 165 },
  { titulo: 'Cantidad', ancho: 105 },
  { titulo: 'Observaciones', ancho: 560 }
];

// ---------------------------------------------------------------- menú

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Embarques')
    .addItem('Actualizar ahora', 'actualizar')
    .addSeparator()
    .addItem('Actualizar cada 15 minutos', 'crearTrigger')
    .addItem('Detener actualización automática', 'borrarTriggers')
    .addToUi();
}

function crearTrigger() {
  borrarTriggers();
  ScriptApp.newTrigger('actualizar').timeBased().everyMinutes(15).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Se actualizará cada 15 minutos.', 'Embarques');
}

function borrarTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'actualizar') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// ---------------------------------------------------------------- datos

function traerDatos_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('API_URL');
  var token = props.getProperty('TOKEN');
  if (!url || !token) {
    throw new Error(
      'Faltan API_URL y/o TOKEN en Configuración del proyecto > Propiedades del script.'
    );
  }

  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var codigo = res.getResponseCode();
  if (codigo === 401) {
    throw new Error('El panel rechazó el token. Revisá que TOKEN == SHEETS_TOKEN.');
  }
  if (codigo !== 200) {
    throw new Error('El panel respondió ' + codigo + ': ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText());
}

// ---------------------------------------------------------------- fechas

function aFecha_(iso) {
  return iso ? new Date(iso) : '';
}

/** Instantes (recibido, generado): se leen en la zona horaria de la planilla. */
function formatearFecha_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

/**
 * La ETA es una fecha de calendario, no un instante: viaja como medianoche UTC.
 * Formatearla en la zona de la planilla (Uruguay, UTC-3) la corría un día para
 * atrás, así que se lee en UTC y se muestra el día que se cargó en el panel.
 */
function formatearFechaUTC_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), 'UTC', 'dd/MM/yyyy');
}

/** 12345 -> "12.345". Utilities.formatString no maneja separador de miles. */
function miles_(n) {
  return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Texto de la cuenta regresiva: lo primero que se lee de un embarque. */
function textoLlegada_(emb) {
  if (emb.arribado) return 'Recibido ' + formatearFecha_(emb.receivedAt);
  var d = emb.diasParaLlegar;
  if (d === null) return 'Sin fecha estimada';
  if (d < 0) return 'Demorado · ' + Math.abs(d) + (Math.abs(d) === 1 ? ' día' : ' días');
  if (d === 0) return '¡Llega hoy!';
  if (d === 1) return 'Llega mañana';
  return 'Faltan ' + d + ' días';
}

/** Colores del semáforo según qué tan cerca está la llegada. */
function coloresLlegada_(emb) {
  if (emb.arribado) return { bg: NEUTRO_BG, fg: NEUTRO_FG };
  var d = emb.diasParaLlegar;
  if (d === null) return { bg: NEUTRO_BG, fg: NEUTRO_FG };
  if (d <= 3) return { bg: URGENTE_BG, fg: URGENTE_FG };
  if (d <= 14) return { bg: PRONTO_BG, fg: PRONTO_FG };
  return { bg: LEJOS_BG, fg: LEJOS_FG };
}

// ---------------------------------------------------------------- pestañas

/**
 * Ubica la pestaña de un embarque por su metadata, que sobrevive a que el
 * embarque se renombre en la plataforma (buscar por nombre no).
 */
function buscarPestana_(ss, id) {
  var encontrados = ss.createDeveloperMetadataFinder().withKey(META_KEY).withValue(id).find();
  for (var i = 0; i < encontrados.length; i++) {
    var hoja = encontrados[i].getLocation().getSheet();
    if (hoja) return hoja;
  }
  return null;
}

function renombrarSiPuede_(ss, hoja, nombre) {
  if (hoja.getName() === nombre) return;
  var otra = ss.getSheetByName(nombre);
  if (otra && otra.getSheetId() !== hoja.getSheetId()) return; // lo toma otra pestaña
  hoja.setName(nombre);
}

function obtenerOCrearHoja_(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

/**
 * Deja la hoja en blanco de verdad. `clear()` borra contenido y formato pero NO
 * las celdas combinadas, y volver a combinar encima de un merge viejo más ancho
 * falla. Pasa cada vez que cambia la cantidad de columnas de una pestaña.
 */
function limpiarHoja_(hoja) {
  hoja.clear();
  hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).breakApart();
}

/**
 * Garantiza que la hoja tenga lugar para lo que se va a escribir. Hace falta
 * porque `limpiarSobrantes_` recorta la hoja a lo justo al terminar: si en la
 * corrida siguiente hay una columna más (pasó al agregar "Origen") o más
 * embarques que la vez pasada, escribir fuera de rango tira error.
 */
function asegurarTamano_(hoja, filas, columnas) {
  var faltanC = columnas - hoja.getMaxColumns();
  if (faltanC > 0) hoja.insertColumnsAfter(hoja.getMaxColumns(), faltanC);
  var faltanF = filas - hoja.getMaxRows();
  if (faltanF > 0) hoja.insertRowsAfter(hoja.getMaxRows(), faltanF);
}

/** Deja la hoja sin sobrantes de una corrida anterior con más filas o columnas. */
function limpiarSobrantes_(hoja, filasUsadas, columnasUsadas) {
  var maxF = hoja.getMaxRows();
  var maxC = hoja.getMaxColumns();
  if (maxF > filasUsadas + 2) hoja.deleteRows(filasUsadas + 3, maxF - filasUsadas - 2);
  if (maxC > columnasUsadas) hoja.deleteColumns(columnasUsadas + 1, maxC - columnasUsadas);
}

// ---------------------------------------------------------------- resumen

function escribirResumen_(ss, data) {
  var hoja = obtenerOCrearHoja_(ss, PESTANA_RESUMEN);
  limpiarHoja_(hoja);
  hoja.setHiddenGridlines(true);

  // Sin columna de ítems: el Resumen contesta qué viene y cuándo llega, y la
  // cantidad de ítems de cada embarque está en su propia pestaña.
  var COLS = 5;
  var anchos = [120, 280, 160, 200, 220];
  // 4 filas de cabecera + una por embarque.
  asegurarTamano_(hoja, data.embarques.length + 5, COLS);
  for (var a = 0; a < anchos.length; a++) hoja.setColumnWidth(a + 1, anchos[a]);

  // Encabezado de la planilla.
  hoja.getRange(1, 1, 1, COLS).merge()
    .setValue('Embarques en curso')
    .setFontSize(18).setFontWeight('bold')
    .setFontColor(BLANCO).setBackground(AZUL)
    .setVerticalAlignment('middle').setHorizontalAlignment('left');
  hoja.setRowHeight(1, 46);

  hoja.getRange(2, 1, 1, COLS).merge()
    .setValue(
      data.enCamino + ' en camino · ' + data.arribados + ' ya recibidos   ·   Actualizado ' +
      Utilities.formatDate(new Date(data.generadoEn), Session.getScriptTimeZone(), "dd/MM/yyyy 'a las' HH:mm")
    )
    .setFontSize(10).setFontColor(GRIS_TEXTO).setBackground(AZUL_CLARO)
    .setVerticalAlignment('middle');
  hoja.setRowHeight(2, 24);
  hoja.setRowHeight(3, 10);

  var filaEnc = 4;
  var titulos = ['Origen', 'Embarque', 'Estado', 'Fecha de llegada', 'Cuánto falta'];
  hoja.getRange(filaEnc, 1, 1, COLS).setValues([titulos])
    .setFontWeight('bold').setFontColor(AZUL).setBackground(AZUL_CLARO)
    .setVerticalAlignment('middle');
  hoja.setRowHeight(filaEnc, 30);

  var embarques = data.embarques;
  if (embarques.length) {
    var filas = [];
    for (var i = 0; i < embarques.length; i++) {
      var e = embarques[i];
      filas.push([
        // Bandera + país. Lo manda el panel según el origen del embarque.
        e.origenLabel || '',
        e.nombre,
        e.estadoLabel,
        e.arribado ? formatearFecha_(e.receivedAt) : formatearFechaUTC_(e.eta),
        textoLlegada_(e)
      ]);
    }

    var inicio = filaEnc + 1;
    var rango = hoja.getRange(inicio, 1, filas.length, COLS);
    rango.setValues(filas).setVerticalAlignment('middle');
    hoja.setRowHeights(inicio, filas.length, 30);

    hoja.getRange(inicio, 1, filas.length, 1).setHorizontalAlignment('center');
    hoja.getRange(inicio, 2, filas.length, 1).setFontWeight('bold');

    // Bandas y semáforo de llegada, fila por fila.
    for (var j = 0; j < embarques.length; j++) {
      var emb = embarques[j];
      var fila = inicio + j;
      if (j % 2 === 1) hoja.getRange(fila, 1, 1, COLS).setBackground(BANDA);

      var col = coloresLlegada_(emb);
      hoja.getRange(fila, 4, 1, 2)
        .setBackground(col.bg).setFontColor(col.fg).setFontWeight('bold')
        .setHorizontalAlignment('center');

      if (emb.arribado) {
        hoja.getRange(fila, 1, 1, 3).setFontColor(GRIS_TEXTO).setFontStyle('italic');
      }
    }

    rango.setBorder(true, true, true, true, true, true, GRIS_BORDE, SpreadsheetApp.BorderStyle.SOLID);
    limpiarSobrantes_(hoja, inicio + filas.length - 1, COLS);
  }

  hoja.setFrozenRows(filaEnc);
  ss.setActiveSheet(hoja);
  return hoja;
}

// ---------------------------------------------------------------- embarque

function escribirEmbarque_(ss, emb) {
  var hoja = buscarPestana_(ss, emb.id);
  if (!hoja) {
    hoja = ss.insertSheet(emb.pestana);
    hoja.addDeveloperMetadata(META_KEY, emb.id);
  } else {
    renombrarSiPuede_(ss, hoja, emb.pestana);
  }

  limpiarHoja_(hoja);
  hoja.setHiddenGridlines(true);
  var COLS = COLUMNAS.length;
  // 6 filas de cabecera (5 sin notas) + una por ítem.
  asegurarTamano_(hoja, emb.items.length + 7, COLS);
  for (var w = 0; w < COLS; w++) hoja.setColumnWidth(w + 1, COLUMNAS[w].ancho);

  // 1 · Nombre del embarque.
  hoja.getRange(1, 1, 1, COLS).merge()
    .setValue(emb.nombre)
    .setFontSize(18).setFontWeight('bold')
    .setFontColor(BLANCO).setBackground(AZUL)
    .setVerticalAlignment('middle');
  hoja.setRowHeight(1, 46);

  // 2 · La fecha de llegada, en grande y con color. Es el dato principal.
  var col = coloresLlegada_(emb);
  var fecha = emb.arribado ? formatearFecha_(emb.receivedAt) : formatearFechaUTC_(emb.eta);
  hoja.getRange(2, 1, 1, COLS).merge()
    .setValue(
      (emb.arribado ? 'RECIBIDO' : 'LLEGADA ESTIMADA') +
      (fecha ? '   ' + fecha : '') + '   ·   ' + textoLlegada_(emb)
    )
    .setFontSize(13).setFontWeight('bold')
    .setBackground(col.bg).setFontColor(col.fg)
    .setVerticalAlignment('middle').setHorizontalAlignment('center');
  hoja.setRowHeight(2, 38);

  // 3 · Estado y volumen.
  hoja.getRange(3, 1, 1, COLS).merge()
    .setValue(
      emb.estadoLabel + '   ·   ' + emb.totales.items + ' ítems   ·   ' +
      miles_(emb.totales.unidades) + ' unidades'
    )
    .setFontSize(10).setFontColor(GRIS_TEXTO).setBackground(AZUL_CLARO)
    .setVerticalAlignment('middle').setHorizontalAlignment('center');
  hoja.setRowHeight(3, 24);

  // 4 · Notas del embarque, sólo si hay.
  var filaEnc = 5;
  if (emb.notas) {
    hoja.getRange(4, 1, 1, COLS).merge()
      .setValue(emb.notas)
      .setFontSize(10).setFontStyle('italic').setFontColor(GRIS_TEXTO)
      .setVerticalAlignment('middle').setWrap(true);
    hoja.setRowHeight(4, 28);
    filaEnc = 6;
    hoja.setRowHeight(5, 10);
  } else {
    hoja.setRowHeight(4, 10);
  }

  // Encabezado de la tabla.
  var titulos = COLUMNAS.map(function (c) { return c.titulo; });
  hoja.getRange(filaEnc, 1, 1, COLS).setValues([titulos])
    .setFontWeight('bold').setFontColor(AZUL).setBackground(AZUL_CLARO)
    .setVerticalAlignment('middle');
  hoja.setRowHeight(filaEnc, 30);

  var filas = emb.items.map(function (it) {
    return [
      it.foto ? '=IMAGE("' + it.foto + '", 4, ' + LADO_FOTO + ', ' + LADO_FOTO + ')' : '',
      it.codigo,
      it.cantidad === null ? '' : it.cantidad,
      it.observaciones
    ];
  });

  if (filas.length) {
    var inicio = filaEnc + 1;
    var rango = hoja.getRange(inicio, 1, filas.length, COLS);
    rango.setValues(filas).setVerticalAlignment('middle');
    hoja.setRowHeights(inicio, filas.length, ALTO_FILA_ITEM);

    hoja.getRange(inicio, 1, filas.length, 1).setHorizontalAlignment('center');
    hoja.getRange(inicio, 2, filas.length, 1).setFontWeight('bold').setFontSize(11);
    hoja.getRange(inicio, 3, filas.length, 1)
      .setHorizontalAlignment('center').setNumberFormat('#,##0').setFontSize(11);
    hoja.getRange(inicio, 4, filas.length, 1)
      .setWrap(true).setFontColor(GRIS_TEXTO).setFontSize(10);

    for (var b = 1; b < filas.length; b += 2) {
      hoja.getRange(inicio + b, 1, 1, COLS).setBackground(BANDA);
    }

    rango.setBorder(true, true, true, true, true, true, GRIS_BORDE, SpreadsheetApp.BorderStyle.SOLID);
    limpiarSobrantes_(hoja, inicio + filas.length - 1, COLS);
  }

  hoja.setFrozenRows(filaEnc);
  return hoja;
}

// ---------------------------------------------------------------- principal

function actualizar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = traerDatos_();

  // El resumen se escribe y se activa primero: Sheets no deja ocultar todas
  // las pestañas, así que siempre tiene que quedar una visible.
  escribirResumen_(ss, data);

  // Se escribe y se ordena TODO visible, y recién al final se oculta: Sheets no
  // permite activar una pestaña oculta, y mover una pestaña de lugar exige
  // activarla antes.
  var vistos = {};
  var hojas = [];
  for (var i = 0; i < data.embarques.length; i++) {
    var emb = data.embarques[i];
    vistos[emb.id] = true;
    var hoja = escribirEmbarque_(ss, emb);
    hoja.showSheet();
    hojas.push(hoja);
  }

  // Las pestañas quedan en el mismo orden que manda el panel: primero lo que
  // está por llegar (ETA más próxima), después lo ya arribado.
  for (var k = 0; k < hojas.length; k++) {
    ss.setActiveSheet(hojas[k]);
    ss.moveActiveSheet(k + 2);
  }
  ss.setActiveSheet(ss.getSheetByName(PESTANA_RESUMEN));

  // Ya arribados: se ocultan. Siguen accesibles desde Ver > Hojas ocultas.
  for (var m = 0; m < data.embarques.length; m++) {
    if (data.embarques[m].arribado) hojas[m].hideSheet();
  }

  // Embarques borrados en la plataforma: se ocultan, nunca se borran, para no
  // perder nada que alguien haya anotado al costado.
  var todas = ss.getSheets();
  for (var j = 0; j < todas.length; j++) {
    var h = todas[j];
    if (h.getName() === PESTANA_RESUMEN) continue;
    var meta = h.createDeveloperMetadataFinder().withKey(META_KEY).find();
    if (meta.length && !vistos[meta[0].getValue()]) {
      h.hideSheet();
    }
  }

  ss.toast(
    data.enCamino + ' en camino · ' + data.arribados + ' recibidos',
    'Embarques actualizados'
  );
}
