import { prisma } from "@/lib/prisma";

/**
 * Recalcula el precio guardado del contenedor sumando el lote de sus ítems.
 *
 * `Container.totalPrice` es una columna que hasta la edición manual sólo
 * escribía la importación del Excel, y la leen el detalle, el tablero, la home
 * y el dashboard. Cualquier alta, baja o edición de un producto tiene que
 * pasar por acá o esas cuatro pantallas quedan con un número viejo.
 */
export async function recalcularPrecioContenedor(containerId: string): Promise<void> {
  const suma = await prisma.product.aggregate({
    where: { containerId },
    _sum: { montoTotal: true },
  });
  await prisma.container.update({
    where: { id: containerId },
    data: { totalPrice: suma._sum.montoTotal ?? null },
  });
}
