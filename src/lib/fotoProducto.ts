// Qué foto se muestra de un ítem de embarque, en la tabla del panel y en la
// planilla de Google Sheets.
//
// Hay hasta tres candidatas y este es el orden:
//
//   1. La foto manual: la que una persona subió o corrigió desde el panel.
//      Manda sobre todo lo demás — si alguien se tomó el trabajo de arreglarla,
//      es porque las otras estaban mal.
//   2. La de MercadoLibre, buscada por código. Suele ser mejor que la del Excel
//      del proveedor (recortada, con fondo blanco) y cubre casi todo el catálogo.
//   3. La que vino en el Excel.
//
// La planilla tiene que resolver igual que el panel: hasta ahora mandaba sólo
// `photo`, así que los ítems que en pantalla se veían con la foto de ML salían
// con la celda vacía en la hoja.

import { resolveMlPhoto, type MlPhotoMaps } from "./mundoshop";

export interface ProductoConFoto {
  codigo: string | null;
  photo: string | null;
  fotoManual?: boolean;
}

export function mapasVacios(): MlPhotoMaps {
  return { bySku: new Map<string, string>(), byBase: new Map<string, string>() };
}

/** Candidatas de un ítem, en orden de prioridad. */
function candidatas(p: ProductoConFoto, ml: MlPhotoMaps): (string | null)[] {
  return [
    p.fotoManual && p.photo ? p.photo : null,
    resolveMlPhoto(ml, p.codigo),
    p.photo,
  ];
}

/** Foto a mostrar de un ítem: manual > MercadoLibre > la del Excel. */
export function fotoMostrada(p: ProductoConFoto, ml: MlPhotoMaps): string | null {
  return candidatas(p, ml).find((c) => c) ?? null;
}

/**
 * Igual que `fotoMostrada` pero para la planilla: saltea las candidatas que
 * =IMAGE() no sabe mostrar. Una foto subida a mano en .webp se ve perfecto en
 * el panel y dejaría la celda vacía en la hoja; en ese caso baja a la de
 * MercadoLibre, que es .jpg y suele ser la misma imagen.
 */
export function fotoParaSheets(p: ProductoConFoto, ml: MlPhotoMaps): string | null {
  return candidatas(p, ml).find(renderizableEnSheets) ?? null;
}

/**
 * Formatos que la función =IMAGE() de Google Sheets sabe renderizar: gif, jpg,
 * png y bmp. Un .webp deja la celda en error, así que a la planilla no viaja.
 * (Las fotos de MercadoLibre son .jpg y las del Excel se guardan con la
 * extensión de su MIME, así que en la práctica sólo caen algunas subidas a mano.)
 */
export function renderizableEnSheets(url: string | null | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const sinQuery = url.split(/[?#]/)[0];
  const ext = /\.([a-z0-9]+)$/i.exec(sinQuery)?.[1]?.toLowerCase();
  // Sin extensión no se puede saber; se manda igual (ML sirve varias así).
  if (!ext) return true;
  return ["jpg", "jpeg", "png", "gif", "bmp"].includes(ext);
}
