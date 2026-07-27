/**
 * Sincroniza la planilla con los embarques del panel.
 *
 * Arma una pestaña "Resumen" con todos los embarques y una pestaña por
 * embarque con su detalle de ítems (incluida la foto). Cuando un embarque se
 * marca como arribado en la plataforma (entra a depósito), su pestaña se
 * oculta automáticamente: no se borra, así queda el histórico disponible
 * desde Ver > Hojas ocultas.
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
var ALTO_FILA_FOTO = 66;

var COLUMNAS = [
  { titulo: 'Foto', ancho: 80, formato: null },
  { titulo: '#', ancho: 40, formato: '0' },
  { titulo: 'Código', ancho: 120, formato: null },
  { titulo: 'Unidades', ancho: 90, formato: '#,##0' },
  { titulo: 'Unidad', ancho: 70, formato: null },
  { titulo: 'Precio FOB (USD)', ancho: 130, formato: '#,##0.0000' },
  { titulo: 'CBM x unidad', ancho: 110, formato: '#,##0.000000' },
  { titulo: 'CBM total', ancho: 100, formato: '#,##0.0000' },
  { titulo: 'Precio lote (USD)', ancho: 130, formato: '#,##0.00' },
  { titulo: 'Costo final /u (USD, IVA inc.)', ancho: 200, formato: '#,##0.0000' },
  { titulo: 'Observaciones', ancho: 300, formato: null }
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

// ---------------------------------------------------------------- helpers

/** Fecha ISO -> Date que Sheets entienda, o '' si no hay. */
function aFecha_(iso) {
  return iso ? new Date(iso) : '';
}

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

/** Renombra si hace falta y si el nombre está libre. */
function renombrarSiPuede_(ss, hoja, nombre) {
  if (hoja.getName() === nombre) return;
  var otra = ss.getSheetByName(nombre);
  if (otra && otra.getSheetId() !== hoja.getSheetId()) return; // lo toma otra pestaña
  hoja.setName(nombre);
}

function obtenerOCrearHoja_(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

// ---------------------------------------------------------------- resumen

function escribirResumen_(ss, data) {
  var hoja = obtenerOCrearHoja_(ss, PESTANA_RESUMEN);
  hoja.clear();

  var encabezado = [
    'Embarque', 'Estado', 'Proveedor', 'Origen', 'ETA', 'Recibido',
    'Ítems', 'Unidades', 'CBM', 'Monto (USD)', 'Flete (USD)', 'Notas'
  ];

  var filas = data.embarques.map(function (e) {
    return [
      e.nombre,
      e.estadoLabel,
      e.proveedor,
      e.origen,
      aFecha_(e.eta),
      aFecha_(e.receivedAt),
      e.totales.items,
      e.totales.unidades,
      e.totales.cbm,
      e.totales.monto,
      e.flete === null ? '' : e.flete,
      e.notas
    ];
  });

  hoja.getRange(1, 1, 1, encabezado.length).setValues([encabezado])
    .setFontWeight('bold').setBackground('#f1f3f4');
  if (filas.length) {
    hoja.getRange(2, 1, filas.length, encabezado.length).setValues(filas);
    hoja.getRange(2, 5, filas.length, 2).setNumberFormat('dd/mm/yyyy');
    hoja.getRange(2, 7, filas.length, 2).setNumberFormat('#,##0');
    hoja.getRange(2, 9, filas.length, 1).setNumberFormat('#,##0.0000');
    hoja.getRange(2, 10, filas.length, 2).setNumberFormat('#,##0.00');

    // Los arribados en gris, para distinguirlos de un vistazo.
    for (var i = 0; i < data.embarques.length; i++) {
      if (data.embarques[i].arribado) {
        hoja.getRange(i + 2, 1, 1, encabezado.length)
          .setFontColor('#9aa0a6').setFontStyle('italic');
      }
    }
  }

  var pie = filas.length + 3;
  hoja.getRange(pie, 1).setValue(
    'Actualizado: ' + Utilities.formatDate(new Date(data.generadoEn), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') +
    '  ·  ' + data.enCamino + ' en camino, ' + data.arribados + ' arribados (pestañas ocultas)'
  ).setFontColor('#5f6368').setFontStyle('italic');

  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, 4);
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

  hoja.clear();
  // Las fotos son imágenes dentro de celda (=IMAGE), no objetos flotantes, así
  // que clear() alcanza; no hace falta limpiar nada más.

  var cabecera = [
    [emb.nombre, '', '', '', '', '', '', '', '', '', ''],
    ['Estado', emb.estadoLabel, 'Proveedor', emb.proveedor, 'Origen', emb.origen, '', '', '', '', ''],
    ['ETA', aFecha_(emb.eta), 'Recibido', aFecha_(emb.receivedAt), 'Flete (USD)', emb.flete === null ? '' : emb.flete, '', '', '', '', ''],
    ['Ítems', emb.totales.items, 'Unidades', emb.totales.unidades, 'CBM', emb.totales.cbm, 'Monto (USD)', emb.totales.monto, '', '', ''],
    [emb.notas ? 'Notas: ' + emb.notas : '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '']
  ];
  hoja.getRange(1, 1, cabecera.length, COLUMNAS.length).setValues(cabecera);
  hoja.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  hoja.getRange(2, 1, 3, 1).setFontWeight('bold');
  hoja.getRange(2, 3, 3, 1).setFontWeight('bold');
  hoja.getRange(2, 5, 3, 1).setFontWeight('bold');
  hoja.getRange(4, 7).setFontWeight('bold');
  hoja.getRange(3, 2, 1, 3).setNumberFormat('dd/mm/yyyy');

  var filaEncabezado = cabecera.length + 1;
  var titulos = COLUMNAS.map(function (c) { return c.titulo; });
  hoja.getRange(filaEncabezado, 1, 1, titulos.length).setValues([titulos])
    .setFontWeight('bold').setBackground('#f1f3f4').setWrap(true);

  var filas = emb.items.map(function (it) {
    return [
      it.foto ? '=IMAGE("' + it.foto + '", 4, 60, 60)' : '',
      it.fila,
      it.codigo,
      it.unidades === null ? '' : it.unidades,
      it.unidad,
      it.precioFob === null ? '' : it.precioFob,
      it.cbmUnitario === null ? '' : it.cbmUnitario,
      it.cbmTotal === null ? '' : it.cbmTotal,
      it.montoTotal === null ? '' : it.montoTotal,
      it.costoFinal === null ? '' : it.costoFinal,
      it.observaciones
    ];
  });

  if (filas.length) {
    var inicio = filaEncabezado + 1;
    hoja.getRange(inicio, 1, filas.length, COLUMNAS.length).setValues(filas);
    for (var c = 0; c < COLUMNAS.length; c++) {
      if (COLUMNAS[c].formato) {
        hoja.getRange(inicio, c + 1, filas.length, 1).setNumberFormat(COLUMNAS[c].formato);
      }
    }
    hoja.setRowHeights(inicio, filas.length, ALTO_FILA_FOTO);
    hoja.getRange(inicio, 11, filas.length, 1).setWrap(true);
  }

  for (var w = 0; w < COLUMNAS.length; w++) {
    hoja.setColumnWidth(w + 1, COLUMNAS[w].ancho);
  }
  hoja.setFrozenRows(filaEncabezado);

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
    data.enCamino + ' en camino · ' + data.arribados + ' arribados',
    'Embarques actualizados'
  );
}
