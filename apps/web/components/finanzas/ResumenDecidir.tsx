"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import type { Aviso } from "@/lib/resumen-finanzas-reglas";

// «Para decidir hoy» (ADR-0195 F10; spike `vista-resumen.js`): cada aviso con su punto de color, lo que pasa, cuánto está
// en juego, de qué pantalla sale y el botón que lleva a donde se actúa. Se ven los 5 primeros («primero lo que más cuesta
// si se deja pasar»); el resto, con «Ver N más». Es la única pieza con estado de la pantalla.

const VISIBLES = 5;

/** `parcial`: hay partes que esta cuenta no ve (se listan debajo); «nada urgente» vale para lo que sí ve. */
export function ResumenDecidir({ avisos, parcial = false }: { avisos: Aviso[]; parcial?: boolean }) {
  const [todos, setTodos] = useState(false);
  const vistos = todos ? avisos : avisos.slice(0, VISIBLES);
  return (
    <>
      <ul className="fin-decidir">
        {vistos.length ? (
          vistos.map((a) => (
            <li key={a.clave}>
              <span className="fin-punto" data-tono={a.tono} aria-hidden />
              <div className="fin-aviso min-w-0">
                <b>{a.titulo}</b>
                {a.raro && (
                  <Chip tono="pizarra" versalitas={false} className="fin-raro">
                    fuera de lo normal
                  </Chip>
                )}
                <p>{a.detalle}</p>
                <p className="fin-impacto">
                  {a.impacto && <>{a.impacto} · </>}
                  <span className="fin-origen">sale de {a.origen}</span>
                </p>
              </div>
              {a.href ? (
                <Link href={a.href} className="btn-cayla btn-sutil btn-chico">
                  {a.boton}
                </Link>
              ) : (
                <span />
              )}
            </li>
          ))
        ) : (
          <li>
            <span className="fin-punto" data-tono="verde" aria-hidden />
            <div>
              <b>Nada urgente</b>
              <p>{parcial ? "En lo que ves, no hay nada vencido ni fuera de lo normal." : "No hay vencidas, faltantes ni nada fuera de lo normal."}</p>
            </div>
            <span />
          </li>
        )}
      </ul>
      {avisos.length > VISIBLES && (
        <button type="button" className="btn-cayla btn-enlace mt-2" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
          {todos ? "Ver menos" : `Ver ${avisos.length - VISIBLES} más`}
        </button>
      )}
    </>
  );
}
