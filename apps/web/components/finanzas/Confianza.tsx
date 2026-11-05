"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { textoEstado, tonoPieza, type Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";

// «¿Puedo fiarme de este número?» (ADR-0417, Fase 1; Felipe 2026-10-24: spike 5-A; 2026-10-29: dentro de «Vendido por sede»). Ya no es una franja
// aparte: el chip «Seguro al 86 %» va arriba a la derecha de la tarjeta, y debajo la frase y, a un toque, lo que falta para que lo sea (cada pieza
// con su insignia, su frase en lenguaje de tienda y el enlace a donde se arregla). No calcula nada: la calificación viene de
// `lib/finanzas-confianza.ts` (pura, con prueba); aquí solo se dibuja.

const TONO_NIVEL: Record<ConfianzaDatos["nivel"], TonoChip> = { alto: "verde", medio: "ambar", bajo: "rojo" };

/** El chip de arriba a la derecha: «Seguro al 86 %». */
export function ConfianzaChip({ confianza }: { confianza: ConfianzaDatos }) {
  return (
    <Chip tono={TONO_NIVEL[confianza.nivel]} title="Qué tan seguro es este número" data-guia="fin-resumen.confianza">
      Seguro al {confianza.pct} %
    </Chip>
  );
}

/** Lo que falta, en una línea con su «N cosas por revisar», y la lista que se abre a un toque. */
export function ConfianzaDetalle({ confianza: c }: { confianza: ConfianzaDatos }) {
  const [abierto, setAbierto] = useState(false);
  const faltan = c.piezas.filter((p) => p.estado === "falta" || p.estado === "parcial").length;
  return (
    <div data-nivel={c.nivel}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="m-0 min-w-0 text-sm text-taupe">{c.frase}</p>
        <BotonVerMas
          forma="enlace"
          abierto={abierto}
          onCambiar={setAbierto}
          controla="fin-confianza-piezas"
          texto={faltan > 0 ? `${faltan === 1 ? "1 cosa por revisar" : `${faltan} cosas por revisar`}` : "Ver el detalle"}
        />
      </div>
      <FilasDeMas abierto={abierto}>
        <ul id="fin-confianza-piezas" className="fin-confianza-piezas mt-3" aria-label="Lo que hace confiable el número">
          {c.piezas.map((p) => (
            <li key={p.clave} data-estado={p.estado}>
              <Chip tono={tonoPieza(p.estado)}>{textoEstado(p.estado)}</Chip>
              <div className="min-w-0">
                <b>{p.titulo}</b>
                <p>
                  {p.detalle}
                  {p.href && p.accion && (
                    <>
                      {" "}
                      <Link href={p.href} className="btn-cayla btn-enlace">
                        {p.accion}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </FilasDeMas>
    </div>
  );
}
