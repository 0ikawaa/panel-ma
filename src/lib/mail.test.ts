import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseEmails, panelBaseUrl, sendMail } from "./mail";

describe("parseEmails", () => {
  it("acepta coma, punto y coma y espacios como separadores", () => {
    expect(parseEmails("a@b.com, c@d.com;e@f.com g@h.com")).toEqual([
      "a@b.com",
      "c@d.com",
      "e@f.com",
      "g@h.com",
    ]);
  });

  it("normaliza a minúsculas y saca los repetidos", () => {
    expect(parseEmails("Matias@Gmail.com, matias@gmail.com")).toEqual(["matias@gmail.com"]);
  });

  it("descarta lo que no parece un mail", () => {
    expect(parseEmails("hola, @nada, sin-arroba.com, a@b")).toEqual([]);
    expect(parseEmails("basura, real@dominio.uy")).toEqual(["real@dominio.uy"]);
  });

  it("vacío o nulo dan lista vacía", () => {
    expect(parseEmails(null)).toEqual([]);
    expect(parseEmails("")).toEqual([]);
    expect(parseEmails("   ")).toEqual([]);
  });
});

describe("panelBaseUrl", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("prefiere PANEL_BASE_URL y le saca la barra final", () => {
    process.env.PANEL_BASE_URL = "https://panel.test/";
    expect(panelBaseUrl()).toBe("https://panel.test");
  });

  it("cae al dominio que inyecta Vercel", () => {
    delete process.env.PANEL_BASE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "mi-panel.vercel.app";
    expect(panelBaseUrl()).toBe("https://mi-panel.vercel.app");
  });

  it("sin ninguna de las dos devuelve null en vez de un link roto", () => {
    delete process.env.PANEL_BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(panelBaseUrl()).toBeNull();
  });
});

describe("sendMail", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.REPORT_EMAIL_FROM = "MA <alertas@ma.test>";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  const mail = { subject: "Asunto", text: "Cuerpo", html: "<p>Cuerpo</p>" };

  it("sin destinatarios no intenta nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendMail({ to: [], ...mail });
    expect(r).toMatchObject({ ok: false, skipped: true, status: "skipped:sin-destino" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin RESEND_API_KEY no intenta nada y no tira error", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendMail({ to: ["a@b.com"], ...mail });
    expect(r).toMatchObject({ ok: false, skipped: true, status: "skipped:sin-config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manda un solo request con todos los destinatarios", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendMail({ to: ["a@b.com", "c@d.com"], ...mail });
    expect(r).toMatchObject({ ok: true, status: "sent", id: "abc-123", to: "a@b.com,c@d.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      from: "MA <alertas@ma.test>",
      to: ["a@b.com", "c@d.com"],
      subject: "Asunto",
      html: "<p>Cuerpo</p>",
    });
  });

  it("un error de Resend vuelve en el status, no como excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 })),
    );
    const r = await sendMail({ to: ["a@b.com"], ...mail });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("error:Domain not verified");
  });

  it("una caída de red vuelve en el status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );
    const r = await sendMail({ to: ["a@b.com"], ...mail });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("error:fetch failed");
  });

  it("un timeout se informa como tal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("timed out");
        e.name = "TimeoutError";
        throw e;
      }),
    );
    const r = await sendMail({ to: ["a@b.com"], ...mail });
    expect(r.status).toBe("error:timeout");
  });
});
