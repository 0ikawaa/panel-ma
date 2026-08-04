// Feed de embarques para la planilla de Google Sheets.
//
// El Apps Script de la planilla (ver docs/embarques-google-sheet.gs) pega cada
// pocos minutos contra /api/sheets/embarques y con este payload arma una
// pestaña por embarque más una de resumen. Todo el armado vive acá —y no en la
// route— para poder testearlo sin levantar la app ni tocar la base.
//
// IMPORTANTE: este feed es deliberadamente NO comercial. No expone precios FOB,
// montos, CBM, flete ni costo nacionalizado. La planilla se comparte con gente
// que sólo necesita saber qué viene y cuándo llega, y cualquiera con permiso de
// edición sobre la hoja puede leer el token en las propiedades del Apps Script
// y pegarle al endpoint a mano. Sacar las columnas de la vista no alcanzaría:
// los datos no tienen que salir de acá. Si en algún momento hace falta un feed
// con números, va como endpoint aparte y con su propio token.

import { estadoEfectivo, estadoLabel, type Estado } from "./embarques";
import { hoyUy } from "./fecha";
import { renderizableEnSheets } from "./fotoProducto";

/** Nombre de la pestaña de resumen. Queda reservado: ningún embarque puede usarlo. */
export const PESTANA_RESUMEN = "Resumen";

/**
 * Google Sheets rechaza estos caracteres en el nombre de una pestaña y corta a
 * 100. Dejamos margen para el sufijo que desambigua nombres repetidos.
 */
const CARACTERES_INVALIDOS = /[[\]*?:/\\]/g;
const LARGO_MAX_PESTANA = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// ---------- Entrada (el subconjunto de Prisma que realmente usamos) ----------

export interface ProductoInput {
  codigo: string | null;
  photo: string | null;
  unidades: number | null;
  remark: string | null;
}

export interface ContainerInput {
  id: string;
  name: string;
  eta: Date | string | null;
  notes: string | null;
  status: string | null;
  receivedAt: Date | string | null;
  /** "china" | "brasil". Cualquier otra cosa se toma como China. */
  origin?: string | null;
  products: ProductoInput[];
}

export type Origen = "china" | "brasil";

/**
 * Origen con su bandera, para la columna "Origen" del resumen. El emoji sale
 * bien en el celular y en Mac; en Chrome sobre Windows las banderas se ven como
 * las dos letras del país ("BR"), que igual se entiende.
 */
export const ORIGEN_LABEL: Record<Origen, string> = {
  china: "🇨🇳 China",
  brasil: "🇧🇷 Brasil",
};

// ---------- Salida (lo que consume el Apps Script) ----------

export interface ItemSheet {
  codigo: string;
  foto: string;
  cantidad: number | null;
  observaciones: string;
}

export interface TotalesSheet {
  items: number;
  unidades: number;
}

export interface EmbarqueSheet {
  id: string;
  pestana: string;
  /** Nombre del embarque; los de Brasil llevan " - BR" al final. */
  nombre: string;
  origen: Origen;
  /** Origen con bandera, ej. "🇧🇷 Brasil". */
  origenLabel: string;
  estado: Estado;
  estadoLabel: string;
  eta: string | null;
  receivedAt: string | null;
  /**
   * true cuando ya ingresó a depósito. La pestaña sigue visible; el script lo
   * usa para el estado del Resumen, los colores y el orden (los recibidos van
   * al final).
   */
  arribado: boolean;
  /**
   * Días que faltan para la ETA (negativo = la fecha ya pasó y no llegó,
   * null = sin ETA cargada). El script pinta la fecha según esto.
   */
  diasParaLlegar: number | null;
  notas: string;
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

/** Origen del embarque, tolerando mayúsculas o un valor viejo/vacío. */
export function origenDe(origin: string | null | undefined): Origen {
  return String(origin ?? "").trim().toLowerCase() === "brasil" ? "brasil" : "china";
}

/**
 * Nombre del embarque para la planilla. Los de Brasil se marcan con " - BR" al
 * final: en la pestaña —que es lo único que se ve al recorrer la hoja— no hay
 * columna de origen que lo aclare. Si el nombre ya lo trae escrito a mano no se
 * repite.
 */
export function nombreParaPlanilla(
  nombre: string,
  origin: string | null | undefined,
): string {
  const base = nombre.trim();
  if (origenDe(origin) !== "brasil") return base;
  if (/[-(\s]\s*br\s*\)?$/i.test(base)) return base;
  return `${base} - BR`;
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Medianoche UTC de una fecha, para comparar días de calendario sin arrastrar la hora. */
function diaUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Días de calendario que faltan hasta la ETA. 0 = llega hoy, negativo = la
 * fecha ya pasó. null si no hay ETA cargada. "Hoy" es el día uruguayo: de
 * noche, en UTC ya es mañana y la cuenta quedaría un día corta.
 */
export function diasHasta(
  eta: Date | string | null | undefined,
  hoy: Date,
): number | null {
  if (!eta) return null;
  const d = eta instanceof Date ? eta : new Date(eta);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((diaUtc(d) - hoyUy(hoy).getTime()) / MS_POR_DIA);
}

/**
 * Solo mandamos fotos que =IMAGE() sepa mostrar: servidas por http(s) —un data
 * URL base64 no lo renderiza— y en un formato soportado (el .webp no lo es).
 */
function fotoUsable(photo: string | null): string {
  return renderizableEnSheets(photo) ? (photo as string) : "";
}

// ---------- Armado ----------

function armarItems(c: ContainerInput): ItemSheet[] {
  return c.products.map((p) => ({
    codigo: p.codigo ?? "",
    foto: fotoUsable(p.photo),
    cantidad: p.unidades,
    observaciones: p.remark ?? "",
  }));
}

function armarTotales(items: ItemSheet[]): TotalesSheet {
  return {
    items: items.length,
    unidades: items.reduce((a, i) => a + (i.cantidad ?? 0), 0),
  };
}

/**
 * Orden de las pestañas: primero lo que está en camino (por ETA más próxima,
 * los sin ETA al final), después lo ya arribado (lo más reciente primero). Así
 * la planilla abre mostrando lo que todavía importa.
 */
function ordenar(cs: ContainerInput[]): ContainerInput[] {
  return [...cs].sort((a, b) => {
    const aArr = !!a.receivedAt;
    const bArr = !!b.receivedAt;
    if (aArr !== bArr) return aArr ? 1 : -1;
    if (aArr) {
      // Recibidos: más reciente primero.
      return (iso(b.receivedAt) ?? "").localeCompare(iso(a.receivedAt) ?? "");
    }
    // En camino: ETA más próxima primero, sin ETA al fondo.
    const aEta = iso(a.eta);
    const bEta = iso(b.eta);
    if (!aEta && !bEta) return a.name.localeCompare(b.name);
    if (!aEta) return 1;
    if (!bEta) return -1;
    return aEta.localeCompare(bEta);
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
    const arribado = estado === "deposito";
    const origen = origenDe(c.origin);
    const nombre = nombreParaPlanilla(c.name, c.origin);
    return {
      id: c.id,
      pestana: nombrePestanaUnico(nombre, tomados),
      nombre,
      origen,
      origenLabel: ORIGEN_LABEL[origen],
      estado,
      estadoLabel: estadoLabel(estado),
      eta: iso(c.eta),
      receivedAt: iso(c.receivedAt),
      arribado,
      // Un embarque ya recibido no "falta"; la cuenta regresiva no aplica.
      diasParaLlegar: arribado ? null : diasHasta(c.eta, generadoEn),
      notas: c.notes ?? "",
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
