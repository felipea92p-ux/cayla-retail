"use client";

import { Fragment, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { ESTADO_ENVIO, cuandoSalio, notaDeEnvio, type EnvioMio } from "@/lib/mis-envios-reglas";
import { HojaEnvio } from "./HojaEnvio";

// Mis envíos en PC (Felipe 2026-10-26, «A · tabla ancha con el detalle en un cajón»): una fila por envío con sus columnas y, en las rondas
// anteriores, una franja por ronda con cómo quedó. Solo desde `lg`: en el celular y la tablet sigue la lista de siempre. Al tocar una fila
// se abre su detalle en el cajón de la derecha (`HojaEnvio`) y la lista sigue viva detrás.

export type GrupoDeEnvios = {
  clave: string;
  /** La franja de la ronda («Ronda RC-000612»). Sin ella, las filas van sueltas (los resultados de una búsqueda). */
  titulo?: string;
  /** «22/10 al 24/10 · cerrada · 2 envíos · 36 prendas». */
  detalle?: string;
  chip?: { texto: string; tono: Parameters<typeof Chip>[0]["tono"] } | null;
  envios: EnvioMio[];
};

const COLUMNAS = (conRonda: boolean): Columna[] => [
  { titulo: "Código" },
  { titulo: "Tienda" },
  { titulo: "Salió" },
  { titulo: "Prendas", alinear: "der" },
  { titulo: "Fardos", alinear: "der" },
  ...(conRonda ? [{ titulo: "Ronda" }] : []),
  { titulo: "Estado" },
];
const PLANTILLA = (conRonda: boolean) =>
  conRonda
    ? "lg:grid-cols-[9.5rem_minmax(0,1fr)_8.5rem_5rem_5rem_8rem_minmax(0,15rem)]"
    : "lg:grid-cols-[9.5rem_minmax(0,1fr)_8.5rem_5rem_5rem_minmax(0,15rem)]";

function FilaTabla({ e, hoy, conRonda, plantilla }: { e: EnvioMio; hoy?: string; conRonda: boolean; plantilla: string }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLButtonElement>(null);
  const estado = ESTADO_ENVIO[e.estado];
  const nota = notaDeEnvio(e, hoy);
  return (
    <>
      <button
        ref={origen}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierta(true)}
        className={`${fila(plantilla, "w-full items-center text-left")} text-sm text-tinta`}
      >
        <span className={celda("izq", "envio-codigo-fila")}>{e.numero}</span>
        <span className={celda()}>{e.destino.replace(/^Tienda /, "")}</span>
        <span className={celda("izq", "text-taupe")}>{cuandoSalio(e, hoy)}</span>
        <span className={celda("der")}>{e.prendas}</span>
        <span className={celda("der")}>{e.fardos}</span>
        {conRonda && <span className={celda("izq", "text-taupe")}>{e.ronda ?? "—"}</span>}
        <span className={celda("izq", "flex items-center gap-2 overflow-visible")}>
          <Chip tono={estado.tono}>{estado.texto}</Chip>
          {nota && <span className="text-xs text-ambar">{nota}</span>}
        </span>
      </button>
      {abierta && <HojaEnvio e={e} hoy={hoy} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

export function TablaEnvios({ grupos, hoy, conRonda = false, guia }: { grupos: GrupoDeEnvios[]; hoy?: string; conRonda?: boolean; guia?: string }) {
  const plantilla = PLANTILLA(conRonda);
  return (
    <Tabla guia={guia} className="max-lg:hidden">
      <Encabezado columnas={COLUMNAS(conRonda)} plantilla={plantilla} visible="hidden lg:grid" />
      {grupos.map((g) => (
        <Fragment key={g.clave}>
          {g.titulo && (
            <div className="flex items-center justify-between gap-3 bg-hueso px-5 py-2">
              <span className="min-w-0 truncate text-sm">
                <b className="font-display text-base font-medium text-tinta">{g.titulo}</b>
                {g.detalle && <span className="ml-2 text-xs text-taupe">{g.detalle}</span>}
              </span>
              {g.chip && <Chip tono={g.chip.tono}>{g.chip.texto}</Chip>}
            </div>
          )}
          {g.envios.map((e) => (
            <FilaTabla key={e.id} e={e} hoy={hoy} conRonda={conRonda} plantilla={plantilla} />
          ))}
        </Fragment>
      ))}
    </Tabla>
  );
}
