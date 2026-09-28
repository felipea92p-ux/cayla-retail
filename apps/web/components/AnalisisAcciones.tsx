"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Boxes, Factory, History, PackagePlus, Tag } from "lucide-react";
import type { AccionAnalisis, GrupoQueHacer, PrendaAnalisis } from "@/lib/analisis-que-hacer";
import { INFO_GRUPO } from "@/lib/analisis-que-hacer";
import { Chip, type TonoChip } from "@/components/ui/Chip";

// Piezas chicas del Análisis conectado (ADR-0245) que comparten la lista por prenda, la tabla por talla y el detalle:
// el botón de una acción (un enlace a la pantalla que hace el trabajo, o «Pedir a otra sede», que abre su hoja), el chip
// del grupo y la curva de tallas.

const ICONO: Record<AccionAnalisis["clave"], typeof ArrowRight> = {
  bajar: ArrowDownToLine,
  trasladar: ArrowRight,
  pedir: PackagePlus,
  reponer: Factory,
  rebajar: Tag,
  historial: History,
  existencias: Boxes,
};

export type PedidoAbierto = Extract<AccionAnalisis, { clave: "pedir" }>;

/** El botón de una acción. `forma`: `fila` (chico, en la tabla), `tarjeta` (celular, más alto para el pulgar) o `detalle`. */
export function BotonAccion({ accion, forma = "fila", onPedir }: { accion: AccionAnalisis; forma?: "fila" | "tarjeta" | "detalle"; onPedir: (a: PedidoAbierto) => void }) {
  const Icono = ICONO[accion.clave];
  const clase =
    forma === "detalle"
      ? "flex w-full items-center gap-2.5 rounded-xl border border-sand bg-papel px-3 py-2.5 text-left text-sm font-medium text-tinta transition-colors hover:border-taupe"
      : `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-tinta bg-papel font-semibold text-tinta transition-colors hover:bg-tinta hover:text-crema ${
          forma === "tarjeta" ? "px-3 py-2 text-[13px]" : "px-2.5 py-1 text-xs"
        }`;
  const contenido =
    forma === "detalle" ? (
      <>
        <Icono aria-hidden className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          {accion.texto}
          <span className="block text-[11px] font-normal text-taupe">{accion.sub}</span>
        </span>
      </>
    ) : (
      <>
        <Icono aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {accion.texto}
      </>
    );
  if (accion.clave === "pedir") {
    return (
      <button
        type="button"
        onClick={(e) => {
          // La fila abre el detalle: el botón no debe abrirlo también.
          e.stopPropagation();
          onPedir(accion);
        }}
        className={clase}
        title={accion.sub}
      >
        {contenido}
      </button>
    );
  }
  return (
    <Link href={accion.href} onClick={(e) => e.stopPropagation()} className={clase} title={accion.sub}>
      {contenido}
    </Link>
  );
}

const TONO_CHIP: Record<GrupoQueHacer, TonoChip> = { agotada: "rojo", duerme: "ambar", estancada: "ambar", top: "verde", sinbase: "neutro", otras: "neutro" };

export function ChipGrupo({ grupo }: { grupo: GrupoQueHacer }) {
  return <Chip tono={TONO_CHIP[grupo]}>{INFO_GRUPO[grupo].chip}</Chip>;
}

/** Color del punto de cada grupo (tarjetas de «Qué hacer» y píldoras de filtro). */
export const PUNTO_GRUPO: Record<GrupoQueHacer, string> = {
  agotada: "bg-rojo",
  duerme: "bg-ambar",
  estancada: "bg-ambar",
  top: "bg-verde",
  sinbase: "bg-taupe/50",
  otras: "bg-taupe/30",
};

/**
 * La curva de tallas de la prenda: arriba la talla, al medio lo que VENDIÓ en el período y abajo lo que hay HOY
 * (piso · almacén). Borde rojo = vendió y el piso quedó vacío; apagada = no vendió nada. Los tonos salen de las
 * cifras, no de un umbral propio. Cada pastilla es un botón: abre el detalle de la prenda con esa talla resaltada.
 */
export function CurvaTallas({ prenda, conHoy = true, onAbrirTalla }: { prenda: PrendaAnalisis; conHoy?: boolean; onAbrirTalla: (varianteId: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {prenda.tallas.map((t) => {
        const f = t.x.fila;
        const hoy = f.stockActualPisoAlmacen;
        const vendio = t.x.periodo.ventasNetas;
        const vacio = hoy !== null && hoy.piso === 0 && vendio > 0;
        return (
          <button
            type="button"
            key={f.varianteId}
            onClick={(e) => {
              // La fila o tarjeta entera también abre el detalle (sin talla): este clic es más específico y no debe llegar a ella.
              e.stopPropagation();
              onAbrirTalla(f.varianteId);
            }}
            aria-label={`Ver la talla ${f.talla ?? "Única"} de ${prenda.referencia}${prenda.color ? ` ${prenda.color}` : ""}`}
            title={`${f.talla ?? "Única"}: vendió ${vendio}${hoy ? ` · hoy ${hoy.piso} en piso y ${hoy.almacen} en almacén` : ""}`}
            className={`inline-flex min-w-[2.4rem] cursor-pointer flex-col items-center rounded-md px-1 py-0.5 text-[11px] leading-tight transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta/60 ${
              vendio === 0 ? "text-tinta/40 ring-1 ring-inset ring-sand" : "bg-hueso text-tinta"
            } ${vacio ? "ring-[1.5px] ring-inset ring-rojo" : ""}`}
          >
            <span className="text-[10px] font-semibold text-taupe">{f.talla ?? "Única"}</span>
            <span className="font-semibold tabular-nums">{vendio}</span>
            {conHoy && hoy && (
              <span className={`text-[9.5px] tabular-nums ${vacio ? "text-rojo-profundo" : "text-tinta/50"}`}>
                {hoy.piso} · {hoy.almacen}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
