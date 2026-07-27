import { NextResponse } from "next/server";
import { listAgendas, buildStats } from "@/lib/agendas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/agendas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Lee las asesorías agendadas desde la web directo de Google Calendar.
// El acceso está protegido por el middleware (módulo "agendas").
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Por defecto: desde hace 30 días hasta dentro de 90.
    // Así la vista de historial tiene contexto sin traer el calendario entero.
    const desde = parseDate(searchParams.get("desde")) ?? daysFromNow(-30);
    const hasta = parseDate(searchParams.get("hasta")) ?? daysFromNow(90);

    const agendas = await listAgendas({ from: desde, to: hasta });

    return NextResponse.json({
      agendas,
      stats: buildStats(agendas),
      rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudieron leer las asesorías." },
      { status: 502 },
    );
  }
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 864e5);
}
