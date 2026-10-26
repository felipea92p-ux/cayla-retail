"use client";

import { useState } from "react";
import { BarraAvance, type TonoBarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import Link from "next/link";
import { textoEstado, tonoPieza, type Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";

// «¿Puedo fiarme de este número?» (ADR-0417, Fase 1; Felipe 2026-10-24: spike 5-A). Va JUSTO bajo la respuesta del mes: «Seguro al 54 %»
// con su barra y, a un toque, lo que falta para que lo sea (cada pieza con su insignia, su frase en lenguaje de tienda y el enlace a donde
// se arregla). Antes era una tarjeta al fondo de la pantalla, lejos de la cifra que califica. No calcula nada: la calificación viene de
// `lib/finanzas-confianza.ts` (pura, con prueba); aquí solo se dibuja.

const TONO_NIVEL: Record<ConfianzaDatos["nivel"], TonoBarraAvance> = { alto: "verde", medio: "ambar", bajo: "rojo" };

export function Confianza({ confianza, guia }: { confianza: ConfianzaDatos; guia?: string }) {
  const [abierto, setAbierto] = useState(false);
  const c = confianza;
  const faltan = c.piezas.filter((p) => p.estado === "falta" || p.estado === "parcial").length;
  return (
    <section className="card-cayla px-4 py-3 sm:px-5" data-guia={guia} data-nivel={c.nivel} aria-label="Qué tan seguro es este número">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="m-0 min-w-0 flex-1 basis-64 text-sm">
          <b className="num">Seguro al {c.pct} %</b> <span className="text-taupe">· {c.frase}</span>
        </p>
        <div className="w-32 shrink-0" aria-hidden="true">
          <BarraAvance pct={c.pct} tono={TONO_NIVEL[c.nivel]} decorativa />
        </div>
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
    </section>
  );
}
