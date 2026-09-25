"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SelectNativo } from "@/components/ui/campos";
import { ListaActividad, useActividad } from "@/components/actividad/ListaActividad";
import { MODULOS_CON_ACTIVIDAD, PERIODOS, anotaActividad, moduloDeRuta, nombreDeModulo, type Periodo } from "@/lib/actividad-reglas";
import type { ClaveModulo } from "@/lib/modulos";

// El botón «Actividad» de la cabecera (ADR-0207, Felipe 2026-09-25): junto a la sede, no en el lateral —no es una
// pantalla más, es el historial de la pantalla donde uno está—. Al abrirlo muestra la actividad del módulo de esa
// ruta, en la sede activa del selector. Solo lo pinta quien lo ve (`veActividad`); el alcance lo pone la base.

const RUTA_HISTORIAL = "M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2";

export function BotonActividad({ ubicacionId, ubicacionEtiqueta, esLider }: { ubicacionId: string | null; ubicacionEtiqueta: string; esLider: boolean }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const modulo = moduloDeRuta(pathname);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Actividad${modulo ? ` de ${nombreDeModulo(modulo)}` : ""}`}
        title="Quién hizo qué en este módulo"
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo sm:px-2.5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[18px] w-[18px]">
          <path d={RUTA_HISTORIAL} />
        </svg>
        <span className="label-cayla hidden text-[11px] sm:inline">Actividad</span>
      </button>
      {abierto ? (
        <PanelActividad
          moduloInicial={modulo}
          ubicacionId={ubicacionId}
          ubicacionEtiqueta={ubicacionEtiqueta}
          esLider={esLider}
          onClose={() => setAbierto(false)}
        />
      ) : null}
    </>
  );
}

function PanelActividad({
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
      ancho="sm:max-w-xl"
      variante="papel"
    >
      {(cerrar) => (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="caja-cayla w-full px-3 sm:w-56">
              <SelectNativo
                aria-label="Módulo"
                value={modulo ?? ""}
                onChange={(e) => setModulo((e.target.value || null) as ClaveModulo | null)}
              >
                <option value="">Todos los módulos</option>
                {MODULOS_CON_ACTIVIDAD.map((m) => (
                  <option key={m} value={m}>
                    {nombreDeModulo(m)}
                  </option>
                ))}
                {modulo && !anotaActividad(modulo) ? <option value={modulo}>{nombreDeModulo(modulo)}</option> : null}
              </SelectNativo>
            </div>
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
            <p className="text-xs text-taupe">{esLider ? "Ves la sede elegida arriba." : "Ves solo la actividad de tu tienda."}</p>
            <Link href={verTodo} onClick={cerrar} className="btn-cayla btn-enlace">
              Ver todo el historial →
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
