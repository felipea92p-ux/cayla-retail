"use client";

import { useEffect, useState } from "react";
import { cargarHistoriaPermisos } from "@/lib/club-ficha-acciones";
import { eventoLegible, type EventoLegible, type PuntoEvento } from "@/lib/historia-permisos-reglas";

// «Historia de los permisos» de la ficha (CL-26, ADR-0288 «Actualización 2026-09-30 (f)»; spike del club, `modalFicha`): cada
// paso de los dos permisos —el club y la publicidad— con qué fue, cuándo, cómo, en qué tienda, quién lo registró y la versión
// del texto. Sale de `fn_clienta_permisos` (`club_permisos`, de solo agregar): aquí no se edita nada.
//
// Vive aparte de `ClientaFichaModal.tsx` a propósito (la ficha la cambian otras tandas del club). Vuelve a leer cuando cambia
// `clave` (la versión de la ficha): cada permiso nuevo cambia la ficha, así la historia no se queda atrás.

const PUNTO: Record<PuntoEvento, string> = { taupe: "bg-taupe", verde: "bg-verde", ambar: "bg-ambar" };
const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" });

export function HistoriaPermisos({ clientaId, clave }: { clientaId: string; clave: number }) {
  const [eventos, setEventos] = useState<EventoLegible[] | null>(null);

  useEffect(() => {
    let vigente = true;
    void cargarHistoriaPermisos(clientaId).then(({ eventos: filas, error }) => {
      // Sin la tanda 1f en la base, o sin eventos: no se dibuja (una ficha que nunca fue socia no tiene historia).
      if (vigente) setEventos(error ? [] : filas.map((f) => eventoLegible(f, (iso) => FORMATO_FECHA.format(new Date(iso)))));
    });
    return () => {
      vigente = false;
    };
  }, [clientaId, clave]);

  if (!eventos || eventos.length === 0) return null;

  return (
    <div className="card-cayla p-4">
      <p className="label-cayla text-[11px] text-tinta/65">Historia de los permisos</p>
      <ul className="relative mt-3 border-l border-sand pl-0 [&>li]:ml-[3px]">
        {eventos.map((e) => (
          <li key={e.id} className="relative pb-3 pl-5 text-sm last:pb-0">
            <span aria-hidden className={`absolute left-0 top-[7px] h-2 w-2 rounded-full ${PUNTO[e.punto]}`} />
            <b className="font-medium text-tinta">{e.titulo}</b>
            <span className="block text-xs text-tinta/60">{e.detalle}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-tinta/55">No se edita: cada paso queda con el medio, la hora, la tienda y la versión del texto que ella vio.</p>
    </div>
  );
}
