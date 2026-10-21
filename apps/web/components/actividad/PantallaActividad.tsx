"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DesplegablePildora } from "@/components/ui/FiltrosPildora";
import { LayoutGrid, Store, UserRound } from "lucide-react";
import { ListaActividad, useActividad } from "@/components/actividad/ListaActividad";
import {
  MODULOS_CON_ACTIVIDAD,
  PERIODOS,
  nombreDeModulo,
  opcionesDeModulo,
  opcionesDePersona,
  type Periodo,
  type PersonaConActividad,
} from "@/lib/actividad-reglas";
import type { ClaveModulo } from "@/lib/modulos";

// La pantalla completa de la actividad (ADR-0207): filtros y lista en UNA tarjeta (ADR-0169). El líder elige la sede
// (o todas); la líder de tienda ve la suya, y la base se lo asegura aunque la pantalla pidiera otra.

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
  // La persona entera, no solo su id: si deja de tener actividad en lo que se mira, el combo igual tiene que decir su nombre.
  const [persona, setPersona] = useState<PersonaConActividad | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [personas, setPersonas] = useState<PersonaConActividad[]>([]);
  const actividad = useActividad({ modulo, ubicacionId, personaId: persona?.persona_id ?? null, periodo });

  // Quiénes tienen actividad en lo que se mira, para el filtro «Persona».
  useEffect(() => {
    let vigente = true;
    void createClient()
      .rpc("fn_actividad_personas" as never, { p_ubicacion_id: ubicacionId, p_modulo: modulo } as never)
      .then(({ data }) => {
        if (vigente) setPersonas(((data ?? []) as PersonaConActividad[]).filter((p) => p.persona_id));
      });
    return () => {
      vigente = false;
    };
  }, [ubicacionId, modulo]);

  return (
    <div className="card-cayla p-4 sm:p-5">
      {/* Las píldoras de filtro del sistema (ADR-0358, ronda 6): dicen su nombre y, puestas, lo elegido con su ✕; con más de 8
          opciones, su lista trae buscador. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div data-guia="actividad.modulo">
          <DesplegablePildora
            icono={LayoutGrid}
            etiqueta="Módulo"
            valor={modulo ?? ""}
            valorPorDefecto=""
            onValor={(v) => setModulo((v || null) as ClaveModulo | null)}
            opciones={opcionesDeModulo(modulo)}
          />
        </div>
        <div data-guia="actividad.sede">
          {esLider ? (
            <DesplegablePildora
              icono={Store}
              etiqueta="Sede"
              valor={ubicacionId ?? ""}
              valorPorDefecto=""
              onValor={(v) => setUbicacionId(v || null)}
              opciones={[{ valor: "", texto: "Todas las sedes" }, ...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))]}
            />
          ) : (
            // Fija (la base solo le da su sede): la cara de la píldora, sin flecha porque no se abre.
            <p className="pildora-filtro" data-puesta>
              <span className="pildora-filtro-boton cursor-default">
                <Store aria-hidden className="pildora-filtro-icono" />
                <span className="pildora-filtro-nombre">Sede:</span>
                <span className="pildora-filtro-valor">
                  <span className="truncate">{ubicacionEtiqueta}</span>
                </span>
              </span>
            </p>
          )}
        </div>
        <div data-guia="actividad.persona">
          <DesplegablePildora
            icono={UserRound}
            etiqueta="Persona"
            valor={persona?.persona_id ?? ""}
            valorPorDefecto=""
            // La única que puede no estar en `personas` es la ya elegida (`opcionesDePersona` la conserva).
            onValor={(id) => setPersona(id ? (personas.find((p) => p.persona_id === id) ?? persona) : null)}
            opciones={opcionesDePersona(personas, persona)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pb-1" role="group" aria-label="Periodo" data-guia="actividad.periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.clave}
              type="button"
              className="pildora-cayla"
              aria-pressed={periodo === p.clave}
              onClick={() => setPeriodo(p.clave)}
              data-guia={p.clave === "30d" ? "actividad.periodo-30" : p.clave === "7d" ? "actividad.periodo-7" : undefined}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div data-guia="actividad.lista">
        <ListaActividad {...actividad} conSede={esLider && ubicacionId === null} conModulo={modulo === null} />
      </div>

      <p className="nota-cayla mt-6" data-guia="actividad.nota">
        Hoy anotan su actividad <b>{MODULOS_CON_ACTIVIDAD.map(nombreDeModulo).join(", ").replace(/, ([^,]*)$/, " y $1")}</b>; los demás
        módulos se suman por etapas. Lo anterior al 26 de setiembre se reconstruyó de las firmas que ya existían: las ediciones de
        antes de esa fecha no quedaron registradas.
      </p>
    </div>
  );
}
