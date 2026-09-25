"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SelectNativo } from "@/components/ui/campos";
import { ListaActividad, useActividad } from "@/components/actividad/ListaActividad";
import { MODULOS_CON_ACTIVIDAD, PERIODOS, nombreDeModulo, type Periodo } from "@/lib/actividad-reglas";
import type { ClaveModulo } from "@/lib/modulos";

// La pantalla completa de la actividad (ADR-0207): filtros y lista en UNA tarjeta (ADR-0169). El líder elige la sede
// (o todas); la líder de tienda ve la suya, y la base se lo asegura aunque la pantalla pidiera otra.

type Persona = { persona_id: string; nombre: string };

export function PantallaActividad({
  esLider,
  moduloInicial,
  ubicacionEtiqueta,
  ubicaciones,
}: {
  esLider: boolean;
  moduloInicial: ClaveModulo | null;
  ubicacionEtiqueta: string;
  ubicaciones: { id: string; nombre: string }[];
}) {
  const [modulo, setModulo] = useState<ClaveModulo | null>(moduloInicial);
  const [ubicacionId, setUbicacionId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const actividad = useActividad({ modulo, ubicacionId, personaId, periodo });

  // Quiénes tienen actividad en lo que se mira, para el filtro «Persona».
  useEffect(() => {
    let vigente = true;
    void createClient()
      .rpc("fn_actividad_personas" as never, { p_ubicacion_id: ubicacionId, p_modulo: modulo } as never)
      .then(({ data }) => {
        if (vigente) setPersonas(((data ?? []) as Persona[]).filter((p) => p.persona_id));
      });
    return () => {
      vigente = false;
    };
  }, [ubicacionId, modulo]);

  return (
    <div className="card-cayla p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Filtro etiqueta="Módulo">
          <SelectNativo aria-label="Módulo" value={modulo ?? ""} onChange={(e) => setModulo((e.target.value || null) as ClaveModulo | null)}>
            <option value="">Todos los módulos</option>
            {MODULOS_CON_ACTIVIDAD.map((m) => (
              <option key={m} value={m}>
                {nombreDeModulo(m)}
              </option>
            ))}
          </SelectNativo>
        </Filtro>
        {esLider ? (
          <Filtro etiqueta="Sede">
            <SelectNativo aria-label="Sede" value={ubicacionId ?? ""} onChange={(e) => setUbicacionId(e.target.value || null)}>
              <option value="">Todas las sedes</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </SelectNativo>
          </Filtro>
        ) : (
          <Filtro etiqueta="Sede">
            <p className="flex h-9 items-center text-sm text-tinta">{ubicacionEtiqueta}</p>
          </Filtro>
        )}
        <Filtro etiqueta="Persona">
          <SelectNativo aria-label="Persona" value={personaId ?? ""} onChange={(e) => setPersonaId(e.target.value || null)}>
            <option value="">Todas las personas</option>
            {personas.map((p) => (
              <option key={p.persona_id} value={p.persona_id}>
                {p.nombre}
              </option>
            ))}
          </SelectNativo>
        </Filtro>
        <div className="flex flex-wrap gap-1.5 pb-1" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button key={p.clave} type="button" className="pildora-cayla" aria-pressed={periodo === p.clave} onClick={() => setPeriodo(p.clave)}>
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <ListaActividad {...actividad} conSede={esLider && ubicacionId === null} conModulo={modulo === null} />

      <p className="nota-cayla mt-6">
        Hoy anotan su actividad <b>{MODULOS_CON_ACTIVIDAD.map(nombreDeModulo).join(", ").replace(/, ([^,]*)$/, " y $1")}</b>; los demás
        módulos se suman por etapas. Lo anterior al 26 de setiembre se reconstruyó de las firmas que ya existían: las ediciones de
        antes de esa fecha no quedaron registradas.
      </p>
    </div>
  );
}

function Filtro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="w-full sm:w-52">
      <p className="label-cayla mb-1 text-[11px] text-taupe">{etiqueta}</p>
      <div className="caja-cayla px-3">{children}</div>
    </div>
  );
}
