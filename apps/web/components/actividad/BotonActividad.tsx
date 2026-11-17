"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TRAZOS_MENU } from "@/lib/menu-iconos";
import { moduloDeRuta, moduloInicialDelPanel, nombreDeModulo } from "@/lib/actividad-reglas";

// El botón «Actividad» de la cabecera (ADR-0207, Felipe 2026-09-25): junto a la sede, no en el lateral —no es una
// pantalla más, es el historial de la pantalla donde uno está—. Al abrirlo muestra la actividad del módulo de esa
// ruta, en la sede activa del selector. Solo lo pinta quien lo ve (`veActividad`); el alcance lo pone la base.

// El reloj con la flecha que vuelve: el mismo trazo del «Historial» del menú (`TRAZOS_MENU.historial`) y el de «Actividad» en Roles y accesos.
const RUTA_HISTORIAL = TRAZOS_MENU.historial;

// El panel se descarga aparte (ADR-0674): al acercar el mouse o el foco al botón ya empieza a bajar, así que abrirlo no espera.
const cargarPanel = () => import("@/components/actividad/PanelActividad");
const PanelActividad = dynamic(() => cargarPanel().then((m) => m.PanelActividad), { ssr: false });

export function BotonActividad({ ubicacionId, ubicacionEtiqueta, esLider }: { ubicacionId: string | null; ubicacionEtiqueta: string; esLider: boolean }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const modulo = moduloDeRuta(pathname);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        onPointerEnter={() => void cargarPanel()}
        onFocus={() => void cargarPanel()}
        aria-label={`Actividad${modulo ? ` de ${nombreDeModulo(modulo)}` : ""}`}
        title="Quién hizo qué en este módulo"
        className="area-dedo flex h-9 items-center gap-1.5 rounded-lg px-2 text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo sm:px-2.5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[18px] w-[18px]">
          <path d={RUTA_HISTORIAL} />
        </svg>
        <span className="label-cayla hidden text-[11px] sm:inline">Actividad</span>
      </button>
      {abierto ? (
        <PanelActividad
          moduloInicial={moduloInicialDelPanel(modulo)}
          ubicacionId={ubicacionId}
          ubicacionEtiqueta={ubicacionEtiqueta}
          esLider={esLider}
          onClose={() => setAbierto(false)}
        />
      ) : null}
    </>
  );
}
