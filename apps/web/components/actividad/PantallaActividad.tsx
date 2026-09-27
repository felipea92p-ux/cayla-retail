"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Desplegable } from "@/components/ui/campos";
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
      {/* Los combos de las barras de filtros del sistema (`Desplegable` en caja, ADR-0169/0209), no el <select> del
          navegador: misma caja, misma flecha y la misma lista que el resto del ERP, con buscador si pasan de 8. */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Filtro etiqueta="Módulo">
          <Desplegable
            forma="caja"
            etiquetaAccesible="Módulo"
            valor={modulo ?? ""}
            onValor={(v) => setModulo(v || null)}
            opciones={opcionesDeModulo(modulo)}
          />
        </Filtro>
        {esLider ? (
          <Filtro etiqueta="Sede">
            <Desplegable
              forma="caja"
              etiquetaAccesible="Sede"
              valor={ubicacionId ?? ""}
              onValor={(v) => setUbicacionId(v || null)}
              opciones={[{ valor: "", texto: "Todas las sedes" }, ...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))]}
            />
          </Filtro>
        ) : (
          <Filtro etiqueta="Sede">
            {/* Fija (la base solo le da su sede): la misma caja y el mismo alto que sus vecinos, sin flecha porque no se abre. */}
            <p className="caja-cayla flex h-10 items-center px-3 text-sm text-tinta">{ubicacionEtiqueta}</p>
          </Filtro>
        )}
        <Filtro etiqueta="Persona">
          <Desplegable
            forma="caja"
            etiquetaAccesible="Persona"
            valor={persona?.persona_id ?? ""}
            // La única que puede no estar en `personas` es la ya elegida (`opcionesDePersona` la conserva).
            onValor={(id) => setPersona(id ? (personas.find((p) => p.persona_id === id) ?? persona) : null)}
            opciones={opcionesDePersona(personas, persona)}
          />
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
      {children}
    </div>
  );
}
