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

import { claveCodigo } from "./claveCodigo";
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

// ---------------------------------------------------------------------------
// Resolución por SKU de venta
//
// Las pantallas de ventas (Órdenes ML, Rentabilidad, Reposición) no tienen el
// ítem del embarque a mano: tienen un SKU de MercadoLibre / Odoo. Para que la
// foto que muestran sea la misma que la de Embarques hay que indexar los
// productos por código y buscar por ahí, pero respetando la misma prioridad:
// manual > MercadoLibre > Excel.
// ---------------------------------------------------------------------------

/** Fotos de los embarques indexadas por código, listas para buscar por SKU. */
export interface FotosPorCodigo {
  manual: Map<string, string>;
  excel: Map<string, string>;
}

/** Guarda `url` bajo `clave` si la clave sirve y todavía no estaba tomada. */
function agregar(map: Map<string, string>, clave: string | null | undefined, url: string): void {
  if (clave && !map.has(clave)) map.set(clave, url);
}

/** Código tal cual vino, normalizado para comparar sin sorpresas de mayúsculas. */
function exacto(codigo: string | null | undefined): string | null {
  const t = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
  return t || null;
}

/**
 * Indexa las fotos de los embarques por código, en dos mapas separados (las
 * manuales pesan más que las del Excel y no se pueden mezclar).
 *
 * Cada foto se guarda dos veces: bajo el código tal cual ("48108-BEI-39") y bajo
 * su clave base ("48108"), así un SKU con otra variante igual la encuentra.
 *
 * **`productos` tiene que venir ordenado del más nuevo al más viejo**: gana el
 * primero que reclama cada clave, o sea la foto del embarque más reciente.
 */
export function indexarFotosPorCodigo(productos: ProductoConFoto[]): FotosPorCodigo {
  const manual = new Map<string, string>();
  const excel = new Map<string, string>();
  for (const p of productos) {
    if (!p.photo) continue;
    // `claveCodigo` es el juez de qué texto identifica un producto: si dice que
    // no ("s/c", "-", una descripción con espacios), tampoco vale indexarlo por
    // su forma literal — sólo generaría cruces con SKUs que no tienen que ver.
    const clave = claveCodigo(p.codigo);
    if (!clave) continue;
    const destino = p.fotoManual ? manual : excel;
    agregar(destino, exacto(p.codigo), p.photo);
    agregar(destino, clave, p.photo);
  }
  return { manual, excel };
}

/** Busca un SKU en un mapa: primero tal cual, después por su clave base. */
function buscar(map: Map<string, string>, sku: string): string | null {
  return map.get(exacto(sku) ?? "") ?? map.get(claveCodigo(sku) ?? "") ?? null;
}

/**
 * Foto a mostrar para un SKU de venta, con la misma prioridad que `fotoMostrada`:
 * la corregida a mano primero, después la de MercadoLibre, y por último la que
 * vino en el Excel del proveedor.
 */
export function fotoPorSku(
  idx: FotosPorCodigo,
  ml: MlPhotoMaps,
  sku: string | null | undefined,
): string | null {
  if (!sku) return null;
  return buscar(idx.manual, sku) ?? resolveMlPhoto(ml, sku) ?? buscar(idx.excel, sku) ?? null;
}
