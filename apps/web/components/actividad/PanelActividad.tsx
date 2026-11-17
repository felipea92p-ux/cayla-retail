"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DesplegablePildora } from "@/components/ui/FiltrosPildora";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { LayoutGrid } from "lucide-react";
import { ListaActividad, useActividad } from "@/components/actividad/ListaActividad";
import { MODULOS_CON_ACTIVIDAD, PERIODOS, anotaActividad, nombreDeModulo, opcionesDeModulo, type Periodo } from "@/lib/actividad-reglas";
import type { ClaveModulo } from "@/lib/modulos";

// El panel de «Actividad» (ADR-0207): la hoja que se abre desde el botón de la cabecera. Vive aparte del botón y se descarga recién al
// acercarse a él o al abrirlo (ADR-0674): el botón está en toda pantalla y el panel, con su lista y sus filtros, casi nunca se abre.

export function PanelActividad({
  moduloInicial,
  ubicacionId,
  ubicacionEtiqueta,
  esLider,
  onClose,
}: {
  moduloInicial: ClaveModulo | null;
  ubicacionId: string | null;
  ubicacionEtiqueta: string;
  esLider: boolean;
  onClose: () => void;
}) {
  const [modulo, setModulo] = useState<ClaveModulo | null>(moduloInicial);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const pendiente = modulo !== null && !anotaActividad(modulo);
  const actividad = useActividad({ modulo, ubicacionId, personaId: null, periodo }, !pendiente);
  const titulo = modulo ? nombreDeModulo(modulo) : "Todos los módulos";
  // El panel mira UNA sede (la del selector). La líder de tienda solo tiene la suya: la base la fuerza igual.
  const verTodo = `/actividad${modulo ? `?modulo=${modulo}` : ""}`;

  return (
    <Modal
      titulo={`Actividad · ${titulo}`}
      subtitulo={`${ubicacionEtiqueta} · quién hizo qué y cuándo`}
      onClose={onClose}
      tamano="mediana"
      variante="papel"
    >
      {(cerrar) => (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* La píldora de filtro del sistema (ADR-0358, ronda 6): dice su nombre y, puesta, lo elegido con su ✕. */}
            <DesplegablePildora
              icono={LayoutGrid}
              etiqueta="Módulo"
              valor={modulo ?? ""}
              valorPorDefecto=""
              onValor={(v) => setModulo((v || null) as ClaveModulo | null)}
              opciones={opcionesDeModulo(modulo)}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodo">
              {PERIODOS.map((p) => (
                <button key={p.clave} type="button" className="pildora-cayla" aria-pressed={periodo === p.clave} onClick={() => setPeriodo(p.clave)}>
                  {p.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {pendiente ? (
            <p className="nota-cayla">
              <b>{nombreDeModulo(modulo)}</b> todavía no anota su actividad. Hoy la anotan{" "}
              {MODULOS_CON_ACTIVIDAD.map(nombreDeModulo).join(", ").replace(/, ([^,]*)$/, " y $1")}; los demás módulos se suman por
              etapas.
            </p>
          ) : (
            <ListaActividad {...actividad} conSede={false} conModulo={modulo === null} />
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-sand/70 pt-4">
            <p className="text-sm text-taupe">{esLider ? "Ves la sede elegida arriba." : "Ves solo la actividad de tu tienda."}</p>
            <EnlaceVer href={verTodo} alNavegar={cerrar}>
              Ver todo el historial
            </EnlaceVer>
          </div>
        </div>
      )}
    </Modal>
  );
}
