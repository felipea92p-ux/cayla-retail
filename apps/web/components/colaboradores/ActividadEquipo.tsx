"use client";

import { useState } from "react";
import type { EventoAcceso } from "@/lib/colaboradores";
import { PERIODOS, type Periodo } from "@/lib/actividad-reglas";
import { Modal } from "@/components/ui/Modal";
import { ListaActividad, useActividad } from "@/components/actividad/ListaActividad";
import { ListaActividad as ListaAccesos } from "@/components/ColaboradoresTablas";

// «Actividad del equipo» (ADR-0343): quién le dio qué a quién, en una línea por cambio. Lee lo que el módulo Actividad ya anota
// (ADR-0207, act. 2026-10-03: `colaboradores_historial` y `roles_historial` entran a `retail.actividad`), así que suma los cambios
// de roles que antes no salían aquí, sin una función nueva en la base. El alcance lo pone `fn_actividad`: el líder ve todas las
// sedes; quien no es líder, la suya. Sin el módulo Actividad, `fn_actividad` no responde: se muestra el registro de accesos de
// siempre (`fn_colaboradores_actividad`), para no quitarle a nadie lo que ya veía.

type Tema = "colaboradores" | "roles";
const TEMAS: { clave: Tema; etiqueta: string }[] = [
  { clave: "colaboradores", etiqueta: "Accesos" },
  { clave: "roles", etiqueta: "Roles" },
];

function ConActividad({ esLider }: { esLider: boolean }) {
  const [tema, setTema] = useState<Tema>("colaboradores");
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const actividad = useActividad({ modulo: tema, ubicacionId: null, personaId: null, periodo });
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Qué cambios" className="flex flex-wrap gap-1.5">
          {TEMAS.map((t) => (
            <button key={t.clave} type="button" className="pildora-cayla" aria-pressed={tema === t.clave} onClick={() => setTema(t.clave)}>
              {t.etiqueta}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button key={p.clave} type="button" className="pildora-cayla" aria-pressed={periodo === p.clave} onClick={() => setPeriodo(p.clave)}>
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <ListaActividad {...actividad} conSede={esLider} conModulo={false} />
      </div>
    </div>
  );
}

export function ActividadEquipo({
  veActividad,
  esLider,
  accesos,
  onClose,
}: {
  /** ¿La cuenta ve el módulo Actividad? Sin él, `fn_actividad` no responde y se muestra el registro de accesos. */
  veActividad: boolean;
  esLider: boolean;
  /** El registro de accesos de siempre (`fn_colaboradores_actividad`), para quien no tiene el módulo Actividad. */
  accesos: EventoAcceso[];
  onClose: () => void;
}) {
  return (
    <Modal titulo="Actividad del equipo" subtitulo={esLider ? "Todas las sedes." : "Tu sede."} ancho="max-w-2xl" variante="hoja" onClose={onClose}>
      {veActividad ? (
        <ConActividad esLider={esLider} />
      ) : (
        <div className="mt-4 max-h-[65vh] overflow-y-auto pr-1">
          {accesos.length === 0 ? <p className="nota-cayla">Todavía no hay movimientos de acceso.</p> : <ListaAccesos eventos={accesos} />}
        </div>
      )}
    </Modal>
  );
}
