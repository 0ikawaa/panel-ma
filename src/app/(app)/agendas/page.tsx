import AgendasPanel from "@/components/AgendasPanel";

export const dynamic = "force-dynamic";

export default function AgendasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Agendas</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Asesorías reservadas desde la web. Se leen en vivo de Google Calendar, así que si movés o
          cancelás una desde el calendario, acá se actualiza sola.
        </p>
      </div>

      <AgendasPanel />
    </div>
  );
}
