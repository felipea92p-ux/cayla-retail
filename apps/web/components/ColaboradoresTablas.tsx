"use client";

import type { EventoAcceso } from "@/lib/colaboradores";
import { fechaLima, fraseEvento, plural } from "@/lib/colaboradores-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { Chip } from "@/components/ui/Chip";

// El registro de actividad de /colaboradores. Solo dibuja lo que recibe; las decisiones viven en `ColaboradoresPanel`. Las tablas
// de personas por estado y la de terminales se fueron el 2026-10-05: las reemplazan la lista de Equipo y sus fichas
// (`components/colaboradores/`).

export function ListaActividad({ eventos }: { eventos: EventoAcceso[] }) {
  const total = eventos[0]?.total ?? 0;
  return (
    <div className="card-cayla p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-tinta/10 pb-3">
        <div>
          <h2 className="font-display text-lg text-tinta">Registro de accesos</h2>
          <p className="text-xs text-tinta/65">Cada alta, baja, suspensión, reactivación y cambio de ubicación queda escrito una vez. No se edita ni se borra.</p>
        </div>
        <span className="text-xs tabular-nums text-tinta/65">
          {total > eventos.length ? `Los ${eventos.length} más recientes de ${total}` : plural(total, "evento", "eventos")}
        </span>
      </div>
      <ol className="space-y-2.5">
        {eventos.map((e) => {
          const f = fraseEvento(e);
          return (
            <li key={e.id} className="flex items-start justify-between gap-4 rounded-md border border-tinta/10 bg-tinta/[0.02] px-3.5 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Chip tono={f.tono} className="mt-0.5 shrink-0">
                  {f.etiqueta}
                </Chip>
                <div className="min-w-0">
                  <p className="text-sm text-tinta">
                    {f.partes.map((p, i) => (p.fuerte ? <strong key={i} className="font-semibold">{p.texto}</strong> : <span key={i}>{p.texto}</span>))}
                  </p>
                  {f.detalle && <p className="mt-0.5 text-xs text-tinta/65">{f.detalle}</p>}
                </div>
              </div>
              <time dateTime={e.created_at} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-tinta/65">
                {fechaLima(e.created_at)} · {diaYHoraLima(e.created_at).hora}
              </time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
