"use client";

import { useState } from "react";
import ContainerDocs, { type Doc } from "@/components/ContainerDocs";
import { estadoLabel, type Estado } from "@/lib/embarques";

/**
 * Envoltorio con estado para usar `ContainerDocs` desde una página de servidor
 * (el detalle del embarque). El tablero maneja su propio estado y lo usa directo.
 */
export default function ContainerDocsPanel({
  containerId,
  estado,
  initial,
}: {
  containerId: string;
  estado: Estado;
  initial: Doc[];
}) {
  const [docs, setDocs] = useState<Doc[]>(initial);

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-white">Documentación</h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
          {estadoLabel(estado)}
        </span>
      </div>
      <ContainerDocs
        containerId={containerId}
        estado={estado}
        docs={docs}
        onChange={setDocs}
      />
    </section>
  );
}
