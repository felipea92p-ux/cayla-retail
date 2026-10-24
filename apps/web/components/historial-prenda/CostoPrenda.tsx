"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CircleHelp, Equal } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import {
  cuentaDeCompra,
  diaCorto,
  fraseDeRespuesta,
  movidaDeCompra,
  respuestaCosto,
  type CompraCosto,
  type CostoPrenda as Costo,
  type Movida,
} from "@/lib/costo-prenda-reglas";
import { soles } from "@/lib/historial-prenda-reglas";

/**
 * La pestaña «Costo» del Historial de la prenda (maqueta elegida por Felipe el 2026-10-24:
 * docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html). Primero la respuesta —cuánto cuesta hoy cada prenda y si
 * subió o bajó—, después una fila por compra: cuántas llegaron y a cuánto, cuántas ya había y a cuánto, y en cuánto quedó.
 * La cuenta, a un toque en «?». Solo la ve quien ve el dinero de compras (lo decide la base: sin permiso no llega `costo`).
 */

// La tabla decide su forma por el ancho de su tarjeta (en la vista rápida es angosta aunque la pantalla sea ancha): desde 560 px
// de tarjeta, columnas; más angosta, tres líneas por compra. Las clases van escritas enteras: Tailwind solo genera lo que lee.
const PLANTILLA = "@min-[560px]:grid-cols-[28px_64px_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)]";
const COLUMNAS: Columna[] = [
  { titulo: "" },
  { titulo: "Fecha" },
  { titulo: "Llegaron" },
  { titulo: "Ya tenías" },
  { titulo: "Costo queda en" },
  { titulo: "Documento", alinear: "der" },
];

export function CostoPrenda({ costo }: { costo: Costo }) {
  const r = respuestaCosto(costo);
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (k: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  return (
    <div className="space-y-3">
      <section data-guia="historial-prenda.costo-respuesta" className="card-cayla flex flex-wrap items-end justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[14px] text-tinta/75">Hoy cada prenda te cuesta</p>
          <p className="font-display mt-0.5 text-[44px] leading-none text-tinta tabular-nums">{soles(r.hoy)}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-tinta/75">
            {r.cambio !== 0 && (
              <Chip tono={r.cambio > 0 ? "ambar" : "verde"} versalitas={false}>
                {r.cambio > 0 ? <ArrowUp aria-hidden className="h-3 w-3" /> : <ArrowDown aria-hidden className="h-3 w-3" />}
                {soles(Math.abs(r.cambio))} {r.cambio > 0 ? "más" : "menos"} que al principio
              </Chip>
            )}
            <span>{fraseDeRespuesta(r)}</span>
          </div>
        </div>
        <p className="text-right text-[12.5px] text-tinta/65">
          En stock
          <span className="font-display block text-[28px] leading-tight text-tinta tabular-nums">{r.stock}</span>
          {r.stock === 1 ? "prenda" : "prendas"}
        </p>
      </section>

      <section data-guia="historial-prenda.costo-compras">
        <TituloSeccion nivel={3} cuenta={costo.compras.length} className="mb-2">
          Compras que movieron el costo
        </TituloSeccion>
        <Tabla className="@container">
          <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} visible="hidden @min-[560px]:grid" />
          {costo.compras.map((c, i) => {
            const k = c.fecha;
            return (
              <FilaCompra key={k} compra={c} numero={i + 1} abierta={abiertas.has(k)} onAlternar={() => alternar(k)} />
            );
          })}
        </Tabla>
      </section>
    </div>
  );
}

function FilaCompra({ compra: c, numero, abierta, onAlternar }: { compra: CompraCosto; numero: number; abierta: boolean; onAlternar: () => void }) {
  const m = movidaDeCompra(c);
  // En angosto, tres líneas: el número a la izquierda, lo que llegó al centro y el costo a la derecha.
  return (
    <div className={fila(PLANTILLA, `grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 @min-[560px]:items-center`)} role="row">
      <span className={`row-span-3 @min-[560px]:row-span-1`} role="cell">
        <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-tinta text-[11.5px] font-semibold tabular-nums text-tinta">{numero}</span>
      </span>
      <span className={celda("izq", `col-start-2 text-[12.5px] text-tinta/65 @min-[560px]:col-auto @min-[560px]:text-[13.5px]`)} role="cell">
        {diaCorto(c.fecha)}
      </span>
      <span className={celda("izq", `col-start-2 tabular-nums @min-[560px]:col-auto`)} role="cell">
        <b className="font-semibold">+{c.llegaron}</b> a {soles(c.costoLlegaron)}
        {c.origen === "produccion" && <span className="text-tinta/65"> · del Taller</span>}
      </span>
      <span className={celda("izq", `col-start-2 text-[12.5px] tabular-nums text-tinta/75 @min-[560px]:col-auto @min-[560px]:text-[13.5px]`)} role="cell">
        <span className={`@min-[560px]:hidden`}>ya tenías </span>
        {c.yaHabia > 0 && c.costoAntes !== null ? `${c.yaHabia} a ${soles(c.costoAntes)}` : "ninguna"}
      </span>
      <span
        className={`col-start-3 row-start-1 row-span-2 flex flex-col items-end gap-1 @min-[560px]:col-auto @min-[560px]:row-auto @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:gap-2`}
        role="cell"
      >
        <span className="font-display whitespace-nowrap text-[19px] leading-none text-tinta tabular-nums">{soles(c.costoDespues)}</span>
        <span className="flex items-center gap-1.5">
          <MarcaMovida movida={m} />
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierta}
            aria-label="Cómo se calcula"
            title="Cómo se calcula"
            className="grid h-6 w-6 place-items-center rounded-full text-tinta/65 transition-colors hover:text-tinta"
          >
            <CircleHelp aria-hidden className="h-4 w-4" />
          </button>
        </span>
      </span>
      <span className={celda("der", `col-start-3 text-[12px] text-tinta/65 @min-[560px]:col-auto`)} role="cell" title={[c.proveedor, c.persona].filter(Boolean).join(" · ")}>
        {c.documento ?? (c.origen === "produccion" ? "Taller" : "—")}
      </span>
      {abierta && <p className={`col-span-full @min-[560px]:col-start-2 text-[12.5px] tabular-nums text-tinta/75 anim-revelar`}>{cuentaDeCompra(c)}</p>}
    </div>
  );
}

function MarcaMovida({ movida: m }: { movida: Movida }) {
  if (m.tipo === "primera") return <Chip tono="neutro" versalitas={false}>primera</Chip>;
  if (m.tipo === "igual")
    return (
      <Chip tono="neutro" versalitas={false}>
        <Equal aria-hidden className="h-3 w-3" />
        igual
      </Chip>
    );
  return (
    <Chip tono={m.tipo === "sube" ? "ambar" : "verde"} versalitas={false}>
      {m.tipo === "sube" ? <ArrowUp aria-hidden className="h-3 w-3" /> : <ArrowDown aria-hidden className="h-3 w-3" />}
      <span className="sr-only">{m.tipo === "sube" ? "subió" : "bajó"}</span>
      {m.monto.toFixed(2)}
    </Chip>
  );
}
