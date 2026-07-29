// Envío de mails de alerta usando la API HTTP de Resend.
//
// Se eligió Resend por HTTP y no SMTP para no sumar dependencias (nodemailer
// abre sockets, que en serverless es justo lo que conviene evitar): es un POST
// con fetch, igual que `lib/whatsapp.ts`.
//
// Config por variables de entorno (todas server-only):
//   RESEND_API_KEY     → clave de la cuenta de Resend (re_...)
//   REPORT_EMAIL_FROM  → remitente, tiene que ser de un dominio VERIFICADO en
//                        Resend (ej. "MA Importaciones <alertas@maimportaciones.com.uy>").
//                        Sin dominio propio verificado, Resend solo deja mandar
//                        desde onboarding@resend.dev y a la casilla de la cuenta.
//   REPORT_EMAIL_TO    → destino(s) por defecto, separados por coma. Lo que se
//                        configure en la pantalla del reporte le gana a esto.
//   PANEL_BASE_URL     → (opcional) base para el link al panel dentro del mail.
//
// Si falta configuración las funciones NO tiran error: devuelven
// { ok:false, skipped:true } para que el reporte igual se genere y se muestre.
// Un reporte sin mail es mucho mejor que un reporte que no corre.

const RESEND_URL = "https://api.resend.com/emails";

export type MailResult = {
  ok: boolean;
  skipped?: boolean; // true = no se intentó (falta config o no hay destino)
  status: string; // "sent" | "skipped:<motivo>" | "error:<detalle>"
  to: string | null;
  id?: string; // id que devuelve Resend
};

/** Remitente por defecto. El dominio tiene que estar verificado en Resend. */
const FROM_FALLBACK = "MA Importaciones <onboarding@resend.dev>";

function config(): { key: string; from: string } | null {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return { key, from: (process.env.REPORT_EMAIL_FROM || "").trim() || FROM_FALLBACK };
}

/** Normaliza destinos: acepta coma, punto y coma o espacios, y filtra lo que no parezca mail. */
export function parseEmails(raw?: string | null): string[] {
  if (!raw) return [];
  const vistos = new Set<string>();
  for (const parte of raw.split(/[,;\s]+/)) {
    const mail = parte.trim().toLowerCase();
    // Validación deliberadamente laxa: alcanza para descartar basura sin
    // rechazar direcciones válidas raras.
    if (/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(mail)) vistos.add(mail);
  }
  return [...vistos];
}

/** Base del panel para armar links dentro del mail (sin barra final). */
export function panelBaseUrl(): string | null {
  const explicit = (process.env.PANEL_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // En Vercel esta variable la inyecta la plataforma con el dominio del deploy.
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return null;
}

/**
 * Manda un mail a uno o varios destinatarios (un solo envío con todos en `to`).
 * Nunca tira: los problemas vuelven en `status`.
 */
export async function sendMail(opts: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const tos = opts.to.filter(Boolean);
  if (tos.length === 0) return { ok: false, skipped: true, status: "skipped:sin-destino", to: null };
  const cfg = config();
  if (!cfg) return { ok: false, skipped: true, status: "skipped:sin-config", to: tos.join(",") };

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.from,
        to: tos,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      return {
        ok: false,
        status: `error:${json?.message || json?.name || `HTTP ${res.status}`}`,
        to: tos.join(","),
      };
    }
    return { ok: true, status: "sent", to: tos.join(","), id: json?.id };
  } catch (e) {
    const err = e as Error;
    const motivo = err.name === "TimeoutError" || err.name === "AbortError" ? "timeout" : err.message;
    return { ok: false, status: `error:${motivo}`, to: tos.join(",") };
  }
}
