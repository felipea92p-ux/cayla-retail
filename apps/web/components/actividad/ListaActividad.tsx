"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import {
  TAMANO_PAGINA,
  agruparPorDia,
  desdeDe,
  nombreDeModulo,
  pieDeFila,
  quien,
  type FilaActividad,
  type Periodo,
} from "@/lib/actividad-reglas";

// La lista de la actividad (ADR-0207), la misma en el panel de la cabecera y en la pantalla completa. El alcance lo pone
// la base (`fn_actividad`): aunque se le pida otra sede, una cuenta que no es líder recibe solo la suya.

export type FiltrosActividad = {
  modulo: string | null;
  ubicacionId: string | null;
  personaId: string | null;
  periodo: Periodo;
};

type Estado = { filas: FilaActividad[]; cargando: boolean; error: string | null; hayMas: boolean };
/** Lo guardado: `clave` dice de qué filtros son estas filas. Mientras no coincida con los filtros de ahora, se está leyendo
 *  (así el efecto no tiene que marcar «cargando» a mano antes de pedir). */
type Guardado = { clave: string | null; filas: FilaActividad[]; error: string | null; hayMas: boolean; masEnCurso: boolean };

/** `activo = false`: no pide nada (el módulo elegido todavía no anota su actividad). */
export function useActividad(filtros: FiltrosActividad, activo = true) {
  const clave = JSON.stringify(filtros);
  const [guardado, setGuardado] = useState<Guardado>({ clave: null, filas: [], error: null, hayMas: false, masEnCurso: false });
  // Cada pedido lleva su número: si el filtro cambia mientras responde el anterior, esa respuesta vieja se descarta.
  const pedido = useRef(0);

  const traer = useCallback(
    async (antes: FilaActividad | null) => {
      const n = ++pedido.current;
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "fn_actividad" as never,
        {
          p_modulo: filtros.modulo,
          p_ubicacion_id: filtros.ubicacionId,
          p_persona_id: filtros.personaId,
          p_desde: desdeDe(filtros.periodo, new Date()),
          p_antes_at: antes?.ocurrio_at ?? null,
          p_antes_id: antes?.id ?? null,
          p_limite: TAMANO_PAGINA,
        } as never,
      );
      if (n !== pedido.current) return;
      if (error) {
        setGuardado((g) => ({ ...g, clave, error: error.message, masEnCurso: false }));
        return;
      }
      const nuevas = (data ?? []) as FilaActividad[];
      setGuardado((g) => ({
        clave,
        filas: antes ? [...g.filas, ...nuevas] : nuevas,
        error: null,
        hayMas: nuevas.length === TAMANO_PAGINA,
        masEnCurso: false,
      }));
    },
    // `clave` resume los cuatro filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `traer` escribe recién al responder la base (tras el await), no en el cuerpo del efecto.
    if (activo) void traer(null);
  }, [traer, activo]);

  const cargarMas = useCallback(() => {
    const ultima = guardado.filas.at(-1);
    if (!ultima) return;
    setGuardado((g) => ({ ...g, masEnCurso: true }));
    void traer(ultima);
  }, [guardado.filas, traer]);

  const vigente = guardado.clave === clave;
  const estado: Estado = {
    filas: vigente ? guardado.filas : [],
    cargando: activo && (!vigente || guardado.masEnCurso),
    error: vigente ? guardado.error : null,
    hayMas: vigente && guardado.hayMas,
  };
  return { ...estado, cargarMas };
}

export function ListaActividad({
  filas,
  cargando,
  error,
  hayMas,
  cargarMas,
  conSede,
  conModulo,
}: Estado & { cargarMas: () => void; conSede: boolean; conModulo: boolean }) {
  const ahora = new Date();

  if (error) {
    return <p className="nota-cayla">No se pudo leer la actividad: {error}</p>;
  }
  if (!cargando && filas.length === 0) {
    return <p className="nota-cayla">No hay actividad en este periodo.</p>;
  }

  return (
    <div>
      {agruparPorDia(filas, ahora).map((g) => (
        <section key={g.dia} className="mb-4 last:mb-0">
          <h3 className="label-cayla mb-1 text-[11px] text-taupe">{g.dia}</h3>
          <ul className="divide-y divide-sand/70 border-t border-sand/70">
            {g.filas.map((f) => (
              <li key={f.id} className="flex items-start gap-3 py-2.5">
                <AvatarPersona personaId={f.persona_id} nombre={quien(f)} className="mt-0.5 h-8 w-8 shrink-0 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-tinta">
                    <span className="font-semibold">{quien(f)}</span> {f.descripcion}
                  </p>
                  <p className="mt-0.5 text-xs text-taupe">
                    {pieDeFila(f, { conSede })}
                    {conModulo ? ` · ${nombreDeModulo(f.modulo)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {cargando ? (
        <div className="space-y-3 py-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-sand/60" />
              <div className="h-3 flex-1 rounded bg-sand/60" />
            </div>
          ))}
        </div>
      ) : hayMas ? (
        <button type="button" onClick={cargarMas} className="btn-cayla btn-sutil mt-2 w-full">
          Ver más
        </button>
      ) : null}
    </div>
  );
}
