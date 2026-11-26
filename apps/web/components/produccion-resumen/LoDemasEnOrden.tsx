"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Eye, Minus, TriangleAlert } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { FilasDeMas } from "@/components/ui/VerMas";
import type { ClaveDeRecuadro, Recuadro } from "@/lib/produccion-en-orden";

// «Lo demás está en orden» (versión C de la maqueta, Felipe 2026-11-26): lo que antes eran secciones enteras del Resumen, en una fila de recuadros de dos líneas. Un recuadro lleva a su
// pantalla (órdenes, pagos) o DESPLIEGA su detalle en el lugar (telas, modelos, para vigilar): nada se pierde, pero no se lee si no se pide. Qué dice cada uno lo decide
// `lib/produccion-en-orden.ts`; los detalles los dibuja el servidor y llegan hechos (`paneles`): esto solo guarda cuál está abierto (uno a la vez).

const LENTE: Record<Recuadro["tono"], string> = { bien: "bg-verde/15 text-verde", atencion: "bg-ambar/15 text-ambar", neutro: "vd-lente text-tenue" };

function Marca({ r }: { r: Recuadro }) {
  const Icono = r.clave === "vigilar" ? Eye : r.tono === "bien" ? Check : r.tono === "atencion" ? TriangleAlert : Minus;
  return (
    <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full ${LENTE[r.tono]}`}>
      <Icono className="h-4 w-4" />
    </span>
  );
}

function Texto({ r }: { r: Recuadro }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold leading-snug text-tinta">{r.titulo}</span>
      <span className="block text-detalle leading-snug text-tenue">{r.linea}</span>
    </span>
  );
}

const CARA = "card-cayla flex w-full items-center gap-3 px-4 py-3.5 text-left";

/** El ancla de la guía de cada recuadro (ADR-0389). Órdenes y telas conservan la de la sección que resumen («Lo que ya se está fabricando», «¿Alcanza la tela?»). */
const ANCLA: Record<ClaveDeRecuadro, { guia: string }> = {
  ordenes: { guia: "prod-resumen.hoy" },
  telas: { guia: "prod-resumen.tela" },
  modelos: { guia: "prod-resumen.modelos" },
  pagos: { guia: "prod-resumen.pagos" },
  vigilar: { guia: "prod-resumen.vigilar" },
};

export function LoDemasEnOrden({ id, titulo, recuadros, paneles }: { /** El `id` del bloque: a él baja un «y N más» de modelos de «Por resolver». */ id: string; titulo: string; recuadros: readonly Recuadro[]; /** El detalle que despliega cada recuadro, ya dibujado por el servidor. */ paneles: Partial<Record<ClaveDeRecuadro, ReactNode>> }) {
  const [abierto, setAbierto] = useState<ClaveDeRecuadro | null>(null);
  const base = useId();
  const idDe = (clave: ClaveDeRecuadro) => `${base}-${clave}`;
  const queDespliegan = recuadros.filter((r) => r.despliega && paneles[r.clave]);

  return (
    <section id={id} data-guia="prod-resumen.lo-demas" aria-label={titulo} className="scroll-mt-24 space-y-3">
      <TituloSeccion>{titulo}</TituloSeccion>
      {/* Tantos por fila como quepan con 15 rem cada uno: cuatro o cinco a lo ancho, de a dos en una pantalla mediana y de a uno en el celular. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(15rem, 100%), 1fr))" } as CSSProperties}>
        {recuadros.map((r) =>
          r.href ? (
            <Link key={r.clave} href={r.href} data-guia={ANCLA[r.clave].guia} className={`${CARA} mov-boton`}>
              <Marca r={r} />
              <Texto r={r} />
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-tenue" />
            </Link>
          ) : r.despliega && paneles[r.clave] ? (
            <button
              key={r.clave}
              type="button"
              data-guia={ANCLA[r.clave].guia}
              aria-expanded={abierto === r.clave}
              aria-controls={idDe(r.clave)}
              onClick={() => setAbierto((a) => (a === r.clave ? null : r.clave))}
              className={`${CARA} mov-boton cursor-pointer`}
            >
              <Marca r={r} />
              <Texto r={r} />
              <ChevronDown aria-hidden className="ver-mas-flecha text-tenue" />
            </button>
          ) : (
            <div key={r.clave} data-guia={ANCLA[r.clave].guia} className={CARA}>
              <Marca r={r} />
              <Texto r={r} />
            </div>
          ),
        )}
      </div>
      {/* Cada detalle baja en su lugar (la pieza de «Ver más», que además deja que el buscador del navegador lo encuentre plegado y lo abra). Sin separación entre los plegados. */}
      <div>
        {queDespliegan.map((r) => (
          <FilasDeMas key={r.clave} abierto={abierto === r.clave} id={idDe(r.clave)}>
            <div className="pt-2 pb-1">{paneles[r.clave]}</div>
          </FilasDeMas>
        ))}
      </div>
    </section>
  );
}
