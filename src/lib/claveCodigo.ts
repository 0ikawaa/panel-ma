// Clave con la que se identifica un producto entre embarques distintos.
//
// Vive aparte de lib/fotoCodigo.ts (que habla con la base) para poder testearla
// sola, sin Prisma de por medio.

/** Códigos que no identifican un producto: no vale guardarles nada. */
const NO_ES_CODIGO = new Set([
  "-", "--", "—", "?", "x", "xx", "xxx", "na", "n/a", "s/c", "sc", "sin codigo",
]);

/**
 * Clave normalizada de un código, o null si el texto no sirve como código.
 *
 *   "48108-BEI-39" -> "48108"   (las variantes de talle/color son el mismo producto)
 *   "16214-NEG"    -> "16214"
 *   "48108 +2"     -> "48108"   (el " +N" lo pone el parser cuando un ítem agrupa
 *                                varios códigos; se guarda contra el primero)
 *   "pz-espejo"    -> "PZ-ESPEJO"
 *
 * El recorte hasta el primer guion es el mismo criterio con el que el parser del
 * Excel agrupa las líneas en ítems (lib/excel.ts), pero sólo se aplica cuando esa
 * parte tiene algún dígito: en códigos como "pz-espejo" la raíz ("pz") es un
 * prefijo genérico y quedarse con ella cruzaría productos que no tienen nada que
 * ver. Los ítems sin código propio —el parser los identifica con la descripción,
 * que lleva espacios— quedan afuera por la misma razón.
 */
export function claveCodigo(codigo: string | null | undefined): string | null {
  if (typeof codigo !== "string") return null;
  const limpio = codigo.trim();
  if (!limpio) return null;

  // "48108 +2" -> "48108"
  const sinAgrupado = limpio.replace(/\s*\+\d+\s*$/, "").trim();
  // Un código no lleva espacios adentro; si los tiene, es una descripción.
  if (!sinAgrupado || /\s/.test(sinAgrupado)) return null;
  if (NO_ES_CODIGO.has(sinAgrupado.toLowerCase())) return null;

  const base = sinAgrupado.split("-")[0].trim();
  const clave = /\d/.test(base) ? base : sinAgrupado;
  // Tiene que quedar algo alfanumérico: descarta "***", "//" y demás.
  if (!/[a-z0-9]/i.test(clave)) return null;
  return clave.toUpperCase();
}
