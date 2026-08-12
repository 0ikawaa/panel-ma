import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// El cliente lee BASE/KEY del entorno al importarse, así que hay que dejarlos
// puestos antes del import dinámico de cada caso.
process.env.MUNDOSHOP_BASE_URL = "http://api.test/api/ext";
process.env.MUNDOSHOP_API_KEY = "test-key";

async function loadClient() {
  vi.resetModules();
  return import("@/lib/mundoshop");
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("msQuery: formas de respuesta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // La regresión que dejó todos los paneles en blanco: la API v3 devuelve el
  // array pelado y el cliente sólo leía `.rows`, así que veía cero filas.
  it("lee un array pelado (API v3)", async () => {
    const filas = [{ id: 1, sku: "16214-BLA" }, { id: 2, sku: "53019" }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(filas));
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).resolves.toEqual(filas);
  });

  it("sigue leyendo el envoltorio { rows } (API v1/v2)", async () => {
    const filas = [{ n: 15886 }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ rows: filas }));
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).resolves.toEqual(filas);
  });

  it("lee el envoltorio { data }", async () => {
    const filas = [{ n: 1 }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: filas }));
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).resolves.toEqual(filas);
  });

  it("devuelve vacío si la respuesta no tiene filas", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).resolves.toEqual([]);
  });

  it("propaga el error que informa la API", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "solo SELECT" }));
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).rejects.toThrow("solo SELECT");
  });

  it("informa el HTTP y el cuerpo cuando la API falla", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: "Request failed with status code 401" }, 500),
    );
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).rejects.toThrow(/HTTP 500/);
  });

  it("avisa cuando no hay conexión", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));
    const { msQuery } = await loadClient();
    await expect(msQuery("SELECT 1")).rejects.toThrow("No hay conexión con la API MUNDO SHOP");
  });
});

describe("msListAllItems: formas de respuesta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lee el envoltorio { paging, items } y pagina", async () => {
    const pagina = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `MLU${i}` }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ paging: { total: 150 }, items: pagina(100) }))
      .mockResolvedValueOnce(jsonResponse({ paging: { total: 150 }, items: pagina(50) }));
    const { msListAllItems } = await loadClient();
    const { items, total } = await msListAllItems("active");
    expect(total).toBe(150);
    expect(items).toHaveLength(150);
  });

  it("lee un array pelado (sin paging) sin romperse", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([{ id: "MLU1" }, { id: "MLU2" }]));
    const { msListAllItems } = await loadClient();
    const { items, total } = await msListAllItems("active");
    expect(items.map((i) => i.id)).toEqual(["MLU1", "MLU2"]);
    expect(total).toBe(2);
  });
});
