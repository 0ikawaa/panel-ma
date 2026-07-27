// Asesorías agendadas desde la web (maimportaciones.com.uy).
//
// La fuente de verdad es Google Calendar, no la base de datos: la web crea el
// evento ahí y este módulo lo lee. La ventaja es que no hay nada que
// sincronizar — si movés o cancelás una asesoría desde Google Calendar, el
// panel lo refleja en la próxima carga.
//
// Cada evento creado por la web lleva extendedProperties.private con el tag
// AGENDA_TAG y los datos del cliente ya estructurados, así que:
//   1) filtramos por ese tag y NUNCA leemos el resto de tus eventos personales;
//   2) no hace falta parsear la descripción para sacar nombre, mail o teléfono.
//
// Las credenciales son las mismas que usa la web (mismo refresh token).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Debe coincidir con AGENDA_TAG en la web (api/_lib/agenda-config.js). */
const AGENDA_TAG = "web-agenda";

export const AGENDA_TZ = "America/Montevideo";

export type AgendaMode = "meet" | "office";

export interface Agenda {
  id: string;
  start: string; // ISO
  end: string; // ISO
  mode: AgendaMode;
  name: string;
  email: string;
  phone: string;
  notes: string;
  meetLink: string | null;
  location: string | null;
  htmlLink: string | null;
  createdAt: string | null;
  /** El invitado respondió la invitación: accepted / declined / tentative / needsAction. */
  guestStatus: string | null;
  cancelled: boolean;
}

// ---------------------------------------------------------------- credenciales

let cachedToken: string | null = null;
let cachedTokenExpiry = 0;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Cargala en Vercel (Settings → Environment Variables) con el mismo valor que usa la web.`,
    );
  }
  return value;
}

/** Canjea el refresh token por un access token de corta duración. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60_000) return cachedToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: requiredEnv("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = el permiso se revocó o venció. Suele pasar si la app
    // OAuth quedó en modo "Prueba" en Google Cloud (el token dura 7 días).
    throw new Error(
      `No se pudo acceder a Google Calendar: ${data.error_description || data.error || res.statusText}`,
    );
  }

  cachedToken = data.access_token as string;
  cachedTokenExpiry = now + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

// -------------------------------------------------------------------- lectura

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  created?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; responseStatus?: string; self?: boolean }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  extendedProperties?: { private?: Record<string, string> };
}

function toAgenda(ev: GoogleEvent): Agenda | null {
  const props = ev.extendedProperties?.private ?? {};
  const start = ev.start?.dateTime;
  const end = ev.end?.dateTime;
  // Sin horario concreto no es una asesoría reservable (sería un evento de día completo).
  if (!start || !end) return null;

  const meetLink =
    ev.hangoutLink ||
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
    null;

  // El invitado es el cliente: el dueño del calendario se marca con self.
  const guest = ev.attendees?.find((a) => !a.self);

  return {
    id: ev.id,
    start,
    end,
    mode: props.mode === "office" ? "office" : "meet",
    name: props.name || ev.summary?.replace(/^Asesoría\s*·\s*/, "") || "Sin nombre",
    email: props.email || guest?.email || "",
    phone: props.phone || "",
    notes: props.notes || "",
    meetLink,
    location: ev.location || null,
    htmlLink: ev.htmlLink || null,
    createdAt: ev.created || null,
    guestStatus: guest?.responseStatus ?? null,
    cancelled: ev.status === "cancelled",
  };
}

/**
 * Lista las asesorías agendadas entre dos fechas.
 * Sólo devuelve eventos marcados con el tag de la web: el resto del calendario
 * no se lee ni se expone.
 */
export async function listAgendas({
  from,
  to,
}: {
  from: Date;
  to: Date;
}): Promise<Agenda[]> {
  const token = await getAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  const agendas: Agenda[] = [];
  let pageToken: string | undefined;

  // El calendario pagina de a 250 eventos; se recorren todas las páginas.
  do {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      privateExtendedProperty: `source=${AGENDA_TAG}`,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `Google Calendar respondió ${res.status}: ${data.error?.message || res.statusText}`,
      );
    }

    for (const ev of (data.items ?? []) as GoogleEvent[]) {
      const agenda = toAgenda(ev);
      if (agenda && !agenda.cancelled) agendas.push(agenda);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return agendas;
}

// ------------------------------------------------------------------ resúmenes

export interface AgendaStats {
  proximas: number;
  hoy: number;
  semana: number;
  mes: number;
  porModalidad: { meet: number; office: number };
}

/** Métricas rápidas para las tarjetas de arriba. */
export function buildStats(agendas: Agenda[], now = new Date()): AgendaStats {
  const hoyKey = dateKey(now);
  const en7 = new Date(now.getTime() + 7 * 864e5);
  const finDeMes = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const futuras = agendas.filter((a) => new Date(a.start) >= now);

  return {
    proximas: futuras.length,
    hoy: agendas.filter((a) => dateKey(new Date(a.start)) === hoyKey).length,
    semana: futuras.filter((a) => new Date(a.start) <= en7).length,
    mes: futuras.filter((a) => new Date(a.start) < finDeMes).length,
    porModalidad: {
      meet: futuras.filter((a) => a.mode === "meet").length,
      office: futuras.filter((a) => a.mode === "office").length,
    },
  };
}

/** YYYY-MM-DD de un instante, leído en hora de Montevideo. */
export function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENDA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
