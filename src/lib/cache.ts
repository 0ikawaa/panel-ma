// Cache en memoria con vencimiento, para los reportes que salen caros.
//
// Los reportes de MercadoLibre no se arman con una consulta: enumeran las
// publicaciones y después piden el detalle de cada una, una por una. Eso son
// cientos de llamadas HTTP y más de un minuto de espera. Como los datos cambian
// de a poco (ML sincroniza cada un par de minutos), no tiene sentido rehacer
// todo cada vez que alguien abre la pantalla.
//
// Es el mismo patrón que ya usaba `mlPhotoMap` en lib/mundoshop.ts, sacado acá
// para poder reusarlo y testearlo.
//
// **Qué no es.** El cache vive en la memoria de la instancia: en Vercel cada
// instancia tiene la suya y se pierde cuando la reciclan. No es un cache
// compartido ni sobrevive a un deploy — es un amortiguador para que abrir la
// misma pantalla dos veces seguidas no cueste dos veces. Alcanza de sobra para
// un panel interno con pocos usuarios; si algún día hace falta que sea
// compartido, el reemplazo es el Runtime Cache de Vercel.

export interface OpcionesCache {
  /** Cuánto vale el resultado antes de tener que rehacerlo. */
  ttlMs: number;
  /** Reloj inyectable; sólo lo usan los tests. */
  ahora?: () => number;
}

export interface Cacheado<T> {
  /** Devuelve el valor, rehaciéndolo si venció. Con `forzar` lo rehace igual. */
  (opts?: { forzar?: boolean }): Promise<T>;
  /** Tira lo guardado: el próximo llamado lo rehace. */
  invalidar(): void;
  /** Antigüedad de lo guardado, o null si no hay nada. */
  edadMs(): number | null;
}

/**
 * Envuelve una función cara para que su resultado se reuse durante `ttlMs`.
 *
 * Tres detalles que importan:
 *
 * - **Dedupe**: si llegan varios pedidos juntos y no hay nada guardado, se
 *   ejecuta una sola vez y todos esperan el mismo resultado. Sin esto, un cold
 *   start con tres pestañas abiertas dispara tres barridos completos de ML.
 * - **Lo viejo antes que un error**: si la función falla pero hay un resultado
 *   guardado —aunque esté vencido—, se devuelve ese. Un reporte de hace veinte
 *   minutos es mucho mejor que una pantalla de error. Si no hay nada guardado,
 *   el error se propaga.
 * - **Un fallo no envenena el cache**: si falla, no se guarda nada, así el
 *   próximo pedido reintenta.
 */
export function cachearConTtl<T>(fn: () => Promise<T>, opts: OpcionesCache): Cacheado<T> {
  const ahora = opts.ahora ?? Date.now;
  let guardado: { at: number; valor: T } | null = null;
  let enVuelo: Promise<T> | null = null;

  const rehacer = (): Promise<T> => {
    if (enVuelo) return enVuelo;
    enVuelo = fn()
      .then((valor) => {
        guardado = { at: ahora(), valor };
        return valor;
      })
      .catch((e) => {
        if (guardado) return guardado.valor; // lo viejo antes que un error
        throw e;
      })
      .finally(() => {
        enVuelo = null;
      });
    return enVuelo;
  };

  const cacheado = ((o?: { forzar?: boolean }) => {
    if (!o?.forzar && guardado && ahora() - guardado.at < opts.ttlMs) {
      return Promise.resolve(guardado.valor);
    }
    return rehacer();
  }) as Cacheado<T>;

  cacheado.invalidar = () => {
    guardado = null;
  };
  cacheado.edadMs = () => (guardado ? ahora() - guardado.at : null);

  return cacheado;
}

/** Cuántas claves distintas se guardan antes de empezar a tirar las más viejas. */
const MAX_CLAVES = 8;

/**
 * Igual que `cachearConTtl` pero con una entrada por clave.
 *
 * Los reportes se arman con la configuración guardada (umbrales, ventanas de
 * días), así que el resultado depende de esos parámetros: si alguien los cambia,
 * lo cacheado con los viejos no sirve más. La clave es esa configuración
 * serializada, y como cambia muy de vez en cuando alcanza con guardar unas pocas.
 */
export function cachearPorClave<T>(
  fn: (clave: string) => Promise<T>,
  opts: OpcionesCache,
): (clave: string, o?: { forzar?: boolean }) => Promise<T> {
  const porClave = new Map<string, Cacheado<T>>();

  return (clave, o) => {
    let c = porClave.get(clave);
    if (!c) {
      c = cachearConTtl(() => fn(clave), opts);
      // Los Map recorren en orden de inserción: la primera es la más vieja.
      if (porClave.size >= MAX_CLAVES) {
        const vieja = porClave.keys().next().value;
        if (vieja !== undefined) porClave.delete(vieja);
      }
      porClave.set(clave, c);
    }
    return c(o);
  };
}
