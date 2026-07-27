// Feed de embarques para la planilla de Google Sheets.
//
// El Apps Script de la planilla (ver docs/embarques-google-sheet.gs) pega cada
// pocos minutos contra /api/sheets/embarques y con este payload arma una
// pestaña por embarque más una de resumen. Todo el armado vive acá —y no en la
// route— para poder testearlo sin levantar la app ni tocar la base.

import { estadoEfectivo, estadoLabel, type Estado } from "./embarques";
import { cbmPorUnidad, landedCost, type Origin } from "./cost";

/** Nombre de la pestaña de resumen. Queda reservado: ningún embarque puede usarlo. */
export const PESTANA_RESUMEN = "Resumen";

/**
 * Google Sheets rechaza estos caracteres en el nombre de una pestaña y corta a
 * 100. Dejamos margen para el sufijo que desambigua nombres repetidos.
 */
const CARACTERES_INVALIDOS = /[[\]*?:/\\]/g;
const LARGO_MAX_PESTANA = 90;

// ---------- Entrada (lo que devuelve Prisma) ----------

export interface ProductoInput {
  rowIndex: number;
  codigo: string | null;
  photo: string | null;
  unidades: number | null;
  unidad: string | null;
  precioChina: number | null;
  cantidadPorCaja: number | null;
  cbmUnitario: number | null;
  cbmTotal: number | null;
  montoTotal: number | null;
  remark: string | null;
}

export interface ContainerInput {
  id: string;
  name: string;
  supplier: string | null;
  eta: Date | string | null;
  notes: string | null;
  totalPrice: number | null;
  freightCost: number | null;
  origin: string;
  status: string | null;
  receivedAt: Date | string | null;
  products: ProductoInput[];
}

// ---------- Salida (lo que consume el Apps Script) ----------

export interface ItemSheet {
  fila: number;
  codigo: string;
  foto: string;
  unidades: number | null;
  unidad: string;
  precioFob: number | null;
  cbmUnitario: number | null;
  cbmTotal: number | null;
  montoTotal: number | null;
  costoFinal: number | null;
  observaciones: string;
}

export interface TotalesSheet {
  items: number;
  unidades: number;
  cbm: number;
  monto: number;
}

export interface EmbarqueSheet {
  id: string;
  pestana: string;
  nombre: string;
  proveedor: string;
  origen: string;
  estado: Estado;
  estadoLabel: string;
  eta: string | null;
  receivedAt: string | null;
  /** true cuando ya ingresó a depósito: el script oculta la pestaña. */
  arribado: boolean;
  notas: string;
  flete: number | null;
  totalDeclarado: number | null;
  totales: TotalesSheet;
  items: ItemSheet[];
}

export interface PayloadSheet {
  generadoEn: string;
  totalEmbarques: number;
  enCamino: number;
  arribados: number;
  embarques: EmbarqueSheet[];
}

// ---------- Helpers ----------

/** Deja un nombre de pestaña que Google Sheets acepte, sin garantizar unicidad. */
export function sanitizarNombrePestana(nombre: string): string {
  const limpio = nombre
    .replace(CARACTERES_INVALIDOS, " ")
    .replace(/\s+/g, " ")
    // Sheets tampoco tolera comillas simples al principio o al final.
    .replace(/^'+|'+$/g, "")
    .trim();
  return limpio.slice(0, LARGO_MAX_PESTANA).trim() || "Embarque";
}

/**
 * Nombre único de pestaña. Dos contenedores pueden llamarse igual (y "Resumen"
 * está reservado), así que ante choque se agrega " (2)", " (3)"…
 */
export function nombrePestanaUnico(nombre: string, tomados: Set<string>): string {
  const base = sanitizarNombrePestana(nombre);
  if (!tomados.has(base)) {
    tomados.add(base);
    return base;
  }
  for (let i = 2; i < 1000; i += 1) {
    const candidato = `${base} (${i})`;
    if (!tomados.has(candidato)) {
      tomados.add(candidato);
      return candidato;
    }
  }
  return base;
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function redondear(n: number, decimales: number): number {
  return +n.toFixed(decimales);
}

/** Solo mandamos fotos servidas por http(s); un data URL base64 no lo renderiza =IMAGE(). */
function fotoUsable(photo: string | null): string {
  return photo && /^https?:\/\//i.test(photo) ? photo : "";
}

// ---------- Armado ----------

function armarItems(c: ContainerInput): ItemSheet[] {
  const origin = c.origin as Origin;
  return c.products.map((p) => {
    const cbmU = cbmPorUnidad(p.cbmUnitario, p.cantidadPorCaja);
    const lc = landedCost(origin, p.precioChina, cbmU, c.freightCost);
    return {
      fila: p.rowIndex,
      codigo: p.codigo ?? "",
      foto: fotoUsable(p.photo),
      unidades: p.unidades,
      unidad: p.unidad ?? "",
      precioFob: p.precioChina,
      cbmUnitario: cbmU == null ? null : redondear(cbmU, 6),
      cbmTotal: p.cbmTotal,
      montoTotal: p.montoTotal,
      costoFinal: lc ? redondear(lc.final, 4) : null,
      observaciones: p.remark ?? "",
    };
  });
}

function armarTotales(items: ItemSheet[]): TotalesSheet {
  const suma = (get: (i: ItemSheet) => number | null) =>
    items.reduce((a, i) => a + (get(i) ?? 0), 0);
  return {
    items: items.length,
    unidades: suma((i) => i.unidades),
    cbm: redondear(suma((i) => i.cbmTotal), 4),
    monto: redondear(suma((i) => i.montoTotal), 2),
  };
}

/**
 * Orden de las pestañas: primero lo que está en camino (por ETA más próxima,
 * los sin ETA al final), después lo ya arribado (lo más reciente primero). Así
 * la planilla abre mostrando lo que todavía importa.
 */
function ordenar(cs: ContainerInput[]): ContainerInput[] {
  const clave = (c: ContainerInput) => {
    const arribado = !!c.receivedAt;
    const eta = iso(c.eta);
    const rec = iso(c.receivedAt);
    return { arribado, eta, rec };
  };
  return [...cs].sort((a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    if (ka.arribado !== kb.arribado) return ka.arribado ? 1 : -1;
    if (ka.arribado) {
      // Recibidos: más reciente primero.
      return (kb.rec ?? "").localeCompare(ka.rec ?? "");
    }
    // En camino: ETA más próxima primero, sin ETA al fondo.
    if (!ka.eta && !kb.eta) return a.name.localeCompare(b.name);
    if (!ka.eta) return 1;
    if (!kb.eta) return -1;
    return ka.eta.localeCompare(kb.eta);
  });
}

/** Arma el payload completo que consume el Apps Script. */
export function buildSheetPayload(
  containers: ContainerInput[],
  generadoEn: Date = new Date(),
): PayloadSheet {
  const tomados = new Set<string>([PESTANA_RESUMEN]);
  const embarques = ordenar(containers).map((c) => {
    const estado = estadoEfectivo(c);
    const items = armarItems(c);
    return {
      id: c.id,
      pestana: nombrePestanaUnico(c.name, tomados),
      nombre: c.name,
      proveedor: c.supplier ?? "",
      origen: c.origin,
      estado,
      estadoLabel: estadoLabel(estado),
      eta: iso(c.eta),
      receivedAt: iso(c.receivedAt),
      arribado: estado === "deposito",
      notas: c.notes ?? "",
      flete: c.freightCost,
      totalDeclarado: c.totalPrice,
      totales: armarTotales(items),
      items,
    };
  });

  const arribados = embarques.filter((e) => e.arribado).length;
  return {
    generadoEn: generadoEn.toISOString(),
    totalEmbarques: embarques.length,
    enCamino: embarques.length - arribados,
    arribados,
    embarques,
  };
}
