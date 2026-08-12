// Escribe imágenes DENTRO de un .xlsx, ancladas a una celda.
//
// SheetJS (el paquete `xlsx` que ya usa el panel) sabe leer y escribir celdas
// pero NO escribe imágenes, así que la planilla se genera con SheetJS y después
// se le inyectan las partes que faltan del zip con JSZip: `xl/media/*`, el
// `drawing1.xml` con un ancla por foto, sus rels y las entradas nuevas en
// `[Content_Types].xml`.
//
// Se genera el formato estándar (`xdr:oneCellAnchor` + `a:blip r:embed`), que es
// justo el que `lib/excel.ts` ya sabe LEER cuando importa una planilla con
// fotos: lo que sale de acá se puede volver a subir al panel.

import JSZip from "jszip";

const EMU_POR_PX = 9525;

export type FotoCelda = {
  row: number; // fila 0-based de la hoja (0 = primera fila del Excel)
  col: number; // columna 0-based
  data: Uint8Array; // bytes de la imagen
  ext: "jpeg" | "png"; // formato (el resto se descarta antes de llegar acá)
};

/** Ancho/alto en px de un JPEG o PNG leyendo su cabecera. null si no se puede. */
export function medirImagen(data: Uint8Array): { w: number; h: number } | null {
  // PNG: la cabecera IHDR trae ancho y alto en los bytes 16..24.
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // JPEG: hay que recorrer los segmentos hasta un SOF (0xC0..0xCF, salteando
  // los que no describen el frame), que trae alto y ancho.
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    // El SOF ocupa desde `i` hasta `i+8` (marcador, largo, precisión, alto, ancho).
    while (i + 9 <= data.length) {
      if (data[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = data[i + 1];
      // Marcadores sin payload (RSTn, SOI, EOI, TEM): no traen largo.
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (data[i + 2] << 8) | data[i + 3];
      const esSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (esSOF) {
        const h = (data[i + 5] << 8) | data[i + 6];
        const w = (data[i + 7] << 8) | data[i + 8];
        if (w > 0 && h > 0) return { w, h };
        return null;
      }
      if (len <= 0) return null;
      i += 2 + len;
    }
  }
  return null;
}

const xmlEsc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Escala una imagen para que entre en una caja sin deformarla. Las imágenes que
 * no se pueden medir se ponen cuadradas en la caja: es mejor que estirarlas.
 */
function encajar(data: Uint8Array, caja: { w: number; h: number }): { w: number; h: number } {
  const med = medirImagen(data);
  if (!med) return { w: caja.h, h: caja.h };
  const escala = Math.min(caja.w / med.w, caja.h / med.h, 1);
  return { w: Math.max(1, Math.round(med.w * escala)), h: Math.max(1, Math.round(med.h * escala)) };
}

/** Resuelve la ruta de la hoja `indice` leyendo workbook.xml y sus rels. */
async function rutaDeHoja(zip: JSZip, indice: number): Promise<string> {
  const fallback = `xl/worksheets/sheet${indice + 1}.xml`;
  const wb = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!wb || !relsFile) return fallback;
  const wbXml = await wb.async("string");
  const relsXml = await relsFile.async("string");
  const ids = [...wbXml.matchAll(/<sheet\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const id = ids[indice];
  if (!id) return fallback;
  const rel = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(relsXml);
  if (!rel) return fallback;
  const target = rel[1].replace(/^\/?xl\//, "").replace(/^\.\//, "");
  return `xl/${target}`;
}

/**
 * Inyecta las fotos en un .xlsx ya armado y devuelve el archivo nuevo.
 *
 * `caja` es el espacio (en px) que se le da a cada foto dentro de su celda; hay
 * que dejar la fila y la columna de la hoja con al menos ese tamaño (con
 * `!rows[].hpx` y `!cols[].wpx` de SheetJS) o la imagen va a tapar las vecinas.
 */
export async function inyectarFotos(
  xlsx: Uint8Array,
  fotos: FotoCelda[],
  opts: { hoja?: number; caja?: { w: number; h: number } } = {},
): Promise<Uint8Array> {
  if (fotos.length === 0) return xlsx;
  const caja = opts.caja ?? { w: 96, h: 96 };
  const zip = await JSZip.loadAsync(xlsx);
  const hojaPath = await rutaDeHoja(zip, opts.hoja ?? 0);
  const hojaFile = zip.file(hojaPath);
  if (!hojaFile) return xlsx; // sin hoja no hay dónde anclar; mejor el original

  // 1) Los bytes de cada imagen, más una relación que la apunte.
  const anclas: string[] = [];
  const rels: string[] = [];
  fotos.forEach((f, i) => {
    const n = i + 1;
    const nombre = `image_semanal_${n}.${f.ext}`;
    zip.file(`xl/media/${nombre}`, f.data);
    rels.push(
      `<Relationship Id="rIdImg${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${nombre}"/>`,
    );

    const { w, h } = encajar(f.data, caja);
    // Centrada en la caja, con un margen mínimo para que no toque los bordes.
    const offX = Math.round((caja.w - w) / 2) + 2;
    const offY = Math.round((caja.h - h) / 2) + 2;
    anclas.push(
      `<xdr:oneCellAnchor>` +
        `<xdr:from><xdr:col>${f.col}</xdr:col><xdr:colOff>${offX * EMU_POR_PX}</xdr:colOff>` +
        `<xdr:row>${f.row}</xdr:row><xdr:rowOff>${offY * EMU_POR_PX}</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${w * EMU_POR_PX}" cy="${h * EMU_POR_PX}"/>` +
        `<xdr:pic>` +
        `<xdr:nvPicPr><xdr:cNvPr id="${n + 1}" name="${xmlEsc(`Foto ${n}`)}"/>` +
        `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * EMU_POR_PX}" cy="${h * EMU_POR_PX}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
        `</xdr:pic>` +
        `<xdr:clientData/>` +
        `</xdr:oneCellAnchor>`,
    );
  });

  // 2) El drawing con todas las anclas y sus relaciones a las imágenes.
  zip.file(
    "xl/drawings/drawing_semanal.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"` +
      ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
      ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      anclas.join("") +
      `</xdr:wsDr>`,
  );
  zip.file(
    "xl/drawings/_rels/drawing_semanal.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rels.join("") +
      `</Relationships>`,
  );

  // 3) La hoja tiene que apuntar al drawing (rel + elemento <drawing/>).
  const hojaRelsPath = hojaPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const hojaRelsPrev = zip.file(hojaRelsPath);
  const relDrawing = `<Relationship Id="rIdDrawingSemanal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing_semanal.xml"/>`;
  if (hojaRelsPrev) {
    const prev = await hojaRelsPrev.async("string");
    zip.file(hojaRelsPath, prev.replace("</Relationships>", `${relDrawing}</Relationships>`));
  } else {
    zip.file(
      hojaRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        relDrawing +
        `</Relationships>`,
    );
  }

  // `<drawing/>` va al final del <worksheet>: en el esquema va después de
  // sheetData y de pageSetup, así que pegarlo antes del cierre siempre ordena.
  const hojaXml = await hojaFile.async("string");
  zip.file(hojaPath, hojaXml.replace("</worksheet>", `<drawing r:id="rIdDrawingSemanal"/></worksheet>`));

  // 4) Content types: el tipo de cada imagen y el del drawing.
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    const defaults: string[] = [];
    for (const ext of new Set(fotos.map((f) => f.ext))) {
      if (!new RegExp(`Extension="${ext}"`, "i").test(ct)) {
        defaults.push(`<Default Extension="${ext}" ContentType="image/${ext}"/>`);
      }
    }
    const override =
      `<Override PartName="/xl/drawings/drawing_semanal.xml"` +
      ` ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
    ct = ct.replace("</Types>", `${defaults.join("")}${override}</Types>`);
    zip.file("[Content_Types].xml", ct);
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
