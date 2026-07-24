// Envío de mensajes por WhatsApp usando la Meta Cloud API (WhatsApp Business).
//
// IMPORTANTE sobre la ventana de 24h: la Cloud API solo deja mandar texto libre
// a un número que te haya escrito en las últimas 24h. Para un aviso PROACTIVO
// (ej. el reporte diario que dispara el cron) hay que usar una *plantilla*
// aprobada por Meta. Por eso soportamos las dos vías:
//   - sendWhatsAppText: texto libre (sirve dentro de la ventana de 24h / pruebas).
//   - sendWhatsAppTemplate: plantilla aprobada (sirve siempre, es lo del cron).
//
// Config por variables de entorno (todas server-only):
//   WHATSAPP_TOKEN            → token permanente de la app de WhatsApp
//   WHATSAPP_PHONE_NUMBER_ID  → ID del número emisor
//   WHATSAPP_TEMPLATE_NAME    → (opcional) nombre de la plantilla aprobada
//   WHATSAPP_TEMPLATE_LANG    → (opcional) idioma de la plantilla (default es_AR)
//   WHATSAPP_API_VERSION      → (opcional) versión del Graph API (default v21.0)
//
// Si falta configuración, las funciones NO tiran error: devuelven
// { ok:false, skipped:true } para que el reporte igual se genere y se muestre.

export type WhatsAppResult = {
  ok: boolean;
  skipped?: boolean; // true = no se intentó (falta config)
  status: string; // "sent" | "skipped:<motivo>" | "error:<detalle>"
  to?: string;
  id?: string; // message id devuelto por Meta
};

function graphUrl(): { url: string; token: string } | null {
  const token = (process.env.WHATSAPP_TOKEN || "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  if (!token || !phoneId) return null;
  const version = (process.env.WHATSAPP_API_VERSION || "v21.0").trim();
  return { url: `https://graph.facebook.com/${version}/${phoneId}/messages`, token };
}

/** Normaliza destinos: acepta coma/; y devuelve números en E.164 sin "+". */
export function parseRecipients(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.replace(/[^\d]/g, ""))
    .filter((s) => s.length >= 8);
}

async function postMessage(payload: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  const cfg = graphUrl();
  if (!cfg) return { error: "config" };
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { id: json?.messages?.[0]?.id };
  } catch (e) {
    return { error: (e as Error).message || "fallo de red" };
  }
}

/** Envía texto libre a un número (solo válido dentro de la ventana de 24h). */
export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppResult> {
  if (!graphUrl()) return { ok: false, skipped: true, status: "skipped:sin-config", to };
  const r = await postMessage({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body: body.slice(0, 4096) },
  });
  if (r.error) return { ok: false, status: `error:${r.error}`, to };
  return { ok: true, status: "sent", to, id: r.id };
}

/**
 * Envía una plantilla aprobada. `bodyParams` son los parámetros de texto que
 * rellenan los {{1}}, {{2}}, ... del cuerpo de la plantilla.
 */
export async function sendWhatsAppTemplate(
  to: string,
  bodyParams: string[],
  templateName = (process.env.WHATSAPP_TEMPLATE_NAME || "").trim(),
  lang = (process.env.WHATSAPP_TEMPLATE_LANG || "es_AR").trim(),
): Promise<WhatsAppResult> {
  if (!graphUrl()) return { ok: false, skipped: true, status: "skipped:sin-config", to };
  if (!templateName) return { ok: false, skipped: true, status: "skipped:sin-plantilla", to };
  const r = await postMessage({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t.slice(0, 1024) })) }]
        : [],
    },
  });
  if (r.error) return { ok: false, status: `error:${r.error}`, to };
  return { ok: true, status: "sent", to, id: r.id };
}

/**
 * Envía el reporte a uno o varios destinatarios. Estrategia:
 *  - Si hay plantilla configurada (WHATSAPP_TEMPLATE_NAME) → la usa (proactivo OK).
 *    El resumen del reporte va como único parámetro {{1}} del cuerpo.
 *  - Si no hay plantilla → intenta texto libre (sirve para pruebas / ventana 24h).
 * Devuelve un resultado por destinatario y un estado combinado.
 */
export async function sendReporteWhatsApp(
  recipients: string[],
  text: string,
): Promise<{ status: string; to: string | null; results: WhatsAppResult[] }> {
  const tos = recipients.filter(Boolean);
  if (tos.length === 0) return { status: "skipped:sin-destino", to: null, results: [] };
  if (!graphUrl()) return { status: "skipped:sin-config", to: tos.join(","), results: [] };

  const useTemplate = !!(process.env.WHATSAPP_TEMPLATE_NAME || "").trim();
  const results: WhatsAppResult[] = [];
  for (const to of tos) {
    const r = useTemplate ? await sendWhatsAppTemplate(to, [text]) : await sendWhatsAppText(to, text);
    results.push(r);
  }
  const anyOk = results.some((r) => r.ok);
  const allOk = results.every((r) => r.ok);
  const status = allOk ? "sent" : anyOk ? "partial" : results[0]?.status || "error:desconocido";
  return { status, to: tos.join(","), results };
}
