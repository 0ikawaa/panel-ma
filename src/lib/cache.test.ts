import { describe, it, expect, vi } from "vitest";
import { cachearConTtl, cachearPorClave } from "./cache";

/** Reloj manejable a mano, para no depender del tiempo real. */
function reloj(inicio = 0) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
}

describe("cachearConTtl", () => {
  it("ejecuta una sola vez mientras el resultado siga vigente", async () => {
    const fn = vi.fn(async () => "ok");
    const c = cachearConTtl(fn, { ttlMs: 1000, ahora: reloj().ahora });

    expect(await c()).toBe("ok");
    expect(await c()).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rehace el trabajo cuando vence el TTL", async () => {
    const r = reloj();
    let n = 0;
    const c = cachearConTtl(async () => ++n, { ttlMs: 1000, ahora: r.ahora });

    expect(await c()).toBe(1);
    r.avanzar(999);
    expect(await c()).toBe(1);
    r.avanzar(2);
    expect(await c()).toBe(2);
  });

  it("junta los pedidos simultáneos en una sola ejecución", async () => {
    // Sin dedupe, tres pestañas abiertas en un cold start disparan tres barridos.
    let ejecuciones = 0;
    let liberar: (v: string) => void = () => {};
    const c = cachearConTtl(
      () => {
        ejecuciones++;
        return new Promise<string>((res) => (liberar = res));
      },
      { ttlMs: 1000, ahora: reloj().ahora },
    );

    const pedidos = Promise.all([c(), c(), c()]);
    liberar("uno solo");

    expect(await pedidos).toEqual(["uno solo", "uno solo", "uno solo"]);
    expect(ejecuciones).toBe(1);
  });

  it("devuelve lo viejo si la función falla", async () => {
    const r = reloj();
    let falla = false;
    const c = cachearConTtl(
      async () => {
        if (falla) throw new Error("MUNDO SHOP caída");
        return "bueno";
      },
      { ttlMs: 100, ahora: r.ahora },
    );

    expect(await c()).toBe("bueno");
    falla = true;
    r.avanzar(200); // ya venció, así que reintenta y falla
    expect(await c()).toBe("bueno"); // pero devuelve lo que tenía
  });

  it("propaga el error si nunca hubo un resultado bueno", async () => {
    const c = cachearConTtl(
      async () => {
        throw new Error("MUNDO SHOP caída");
      },
      { ttlMs: 100, ahora: reloj().ahora },
    );
    await expect(c()).rejects.toThrow("MUNDO SHOP caída");
  });

  it("un fallo no deja el cache envenenado: el próximo pedido reintenta", async () => {
    let intentos = 0;
    const c = cachearConTtl(
      async () => {
        intentos++;
        if (intentos === 1) throw new Error("timeout");
        return "ok";
      },
      { ttlMs: 1000, ahora: reloj().ahora },
    );

    await expect(c()).rejects.toThrow("timeout");
    expect(await c()).toBe("ok");
    expect(intentos).toBe(2);
  });

  it("con forzar rehace aunque siga vigente", async () => {
    let n = 0;
    const c = cachearConTtl(async () => ++n, { ttlMs: 10_000, ahora: reloj().ahora });

    expect(await c()).toBe(1);
    expect(await c()).toBe(1);
    expect(await c({ forzar: true })).toBe(2);
    expect(await c()).toBe(2);
  });

  it("invalidar tira lo guardado", async () => {
    let n = 0;
    const c = cachearConTtl(async () => ++n, { ttlMs: 10_000, ahora: reloj().ahora });

    expect(await c()).toBe(1);
    c.invalidar();
    expect(await c()).toBe(2);
  });

  it("edadMs informa la antigüedad de lo guardado", async () => {
    const r = reloj();
    const c = cachearConTtl(async () => "x", { ttlMs: 10_000, ahora: r.ahora });

    expect(c.edadMs()).toBeNull();
    await c();
    expect(c.edadMs()).toBe(0);
    r.avanzar(3000);
    expect(c.edadMs()).toBe(3000);
    c.invalidar();
    expect(c.edadMs()).toBeNull();
  });
});

describe("cachearPorClave", () => {
  it("cachea cada configuración por separado", async () => {
    const fn = vi.fn(async (clave: string) => `resultado de ${clave}`);
    const c = cachearPorClave(fn, { ttlMs: 10_000, ahora: reloj().ahora });

    expect(await c("a")).toBe("resultado de a");
    expect(await c("b")).toBe("resultado de b");
    expect(await c("a")).toBe("resultado de a");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cambiar la config invalida de hecho lo cacheado con la anterior", async () => {
    let version = 1;
    const c = cachearPorClave(async (clave) => `${clave}-v${version}`, {
      ttlMs: 10_000,
      ahora: reloj().ahora,
    });

    expect(await c("ventana=30")).toBe("ventana=30-v1");
    version = 2;
    expect(await c("ventana=60")).toBe("ventana=60-v2");
  });

  it("forzar rehace sólo la clave pedida", async () => {
    let n = 0;
    const c = cachearPorClave(async (clave) => `${clave}${++n}`, {
      ttlMs: 10_000,
      ahora: reloj().ahora,
    });

    expect(await c("a")).toBe("a1");
    expect(await c("b")).toBe("b2");
    expect(await c("a", { forzar: true })).toBe("a3");
    expect(await c("b")).toBe("b2");
  });

  it("no crece sin límite: tira las claves más viejas", async () => {
    const fn = vi.fn(async (clave: string) => clave);
    const c = cachearPorClave(fn, { ttlMs: 10_000, ahora: reloj().ahora });

    for (let i = 0; i < 12; i++) await c(`clave-${i}`);
    expect(fn).toHaveBeenCalledTimes(12);

    // La primera ya se tiró, así que se recalcula; la última sigue guardada.
    await c("clave-0");
    expect(fn).toHaveBeenCalledTimes(13);
    await c("clave-11");
    expect(fn).toHaveBeenCalledTimes(13);
  });
});
