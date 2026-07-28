// Biblioteca de fotos por código.
//
// Cuando alguien corrige a mano la foto de un ítem en un embarque, esa foto
// queda guardada contra el código del ítem (tabla `CodigoFoto`). Los embarques
// que vengan después con ese mismo código nacen con la foto buena en vez de la
// que traiga el Excel del proveedor, que es la que suele estar mal o faltar.
//
// La clave es el código BASE, igual que agrupa el parser del Excel
// (lib/excel.ts): "48108-BEI-39" y "48108-NEG" son el mismo producto en dos
// variantes y comparten foto. Así una corrección sirve para toda la familia.

import { prisma } from "@/lib/prisma";
import { deleteBlobUrls, isBlobPhoto } from "@/lib/photos";
import { claveCodigo } from "@/lib/claveCodigo";

export { claveCodigo };

/** Guarda (o pisa) la foto buena de un código. Silencioso: nunca rompe el guardado del producto. */
export async function recordarFotoDeCodigo(
  codigo: string | null | undefined,
  url: string | null | undefined,
  usuario?: string | null,
): Promise<void> {
  const clave = claveCodigo(codigo);
  // Sólo URLs de nuestro Blob: son las únicas que van a seguir estando cuando
  // el código aparezca en un embarque dentro de seis meses.
  if (!clave || !isBlobPhoto(url)) return;
  await prisma.codigoFoto
    .upsert({
      where: { codigo: clave },
      create: { codigo: clave, url, updatedBy: usuario ?? null },
      update: { url, updatedBy: usuario ?? null },
    })
    .catch(() => {});
}

/** Olvida la foto de un código (cuando alguien la quita a mano). */
export async function olvidarFotoDeCodigo(codigo: string | null | undefined): Promise<void> {
  const clave = claveCodigo(codigo);
  if (!clave) return;
  await prisma.codigoFoto.deleteMany({ where: { codigo: clave } }).catch(() => {});
}

/**
 * Fotos guardadas para una lista de códigos, indexadas por clave. Devuelve un
 * mapa vacío ante cualquier error: que falte una foto no puede impedir cargar
 * un embarque.
 */
export async function fotosDeCodigos(
  codigos: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const claves = Array.from(
    new Set(codigos.map(claveCodigo).filter((c): c is string => c !== null)),
  );
  if (claves.length === 0) return new Map();
  const filas = await prisma.codigoFoto
    .findMany({ where: { codigo: { in: claves } }, select: { codigo: true, url: true } })
    .catch(() => [] as { codigo: string; url: string }[]);
  return new Map(filas.map((f) => [f.codigo, f.url]));
}

/** Foto guardada para un código puntual, o null. */
export async function fotoDeCodigo(codigo: string | null | undefined): Promise<string | null> {
  const clave = claveCodigo(codigo);
  if (!clave) return null;
  const fila = await prisma.codigoFoto
    .findUnique({ where: { codigo: clave }, select: { url: true } })
    .catch(() => null);
  return fila?.url ?? null;
}

/**
 * Borra de Blob las fotos que ya no usa nadie.
 *
 * Desde que existe la biblioteca, una misma URL puede estar en varios productos
 * (todos los embarques que heredaron la foto del código) y además en
 * `CodigoFoto`. Borrar a ciegas al editar o eliminar un producto dejaría a los
 * demás con la imagen rota, así que primero se comprueba que no quede ninguna
 * referencia. Llamar SIEMPRE después de haber guardado el cambio: la consulta
 * cuenta el estado ya actualizado.
 */
export async function borrarFotosSinUso(urls: (string | null | undefined)[]): Promise<void> {
  const candidatas = Array.from(new Set(urls.filter(isBlobPhoto)));
  if (candidatas.length === 0) return;

  const huerfanas: string[] = [];
  for (const url of candidatas) {
    const [enProductos, enBiblioteca] = await Promise.all([
      prisma.product.count({ where: { photo: url } }).catch(() => 1),
      prisma.codigoFoto.count({ where: { url } }).catch(() => 1),
    ]);
    if (enProductos === 0 && enBiblioteca === 0) huerfanas.push(url);
  }

  if (huerfanas.length === 0) return;
  await deleteBlobUrls(huerfanas).catch(() => {});
}
