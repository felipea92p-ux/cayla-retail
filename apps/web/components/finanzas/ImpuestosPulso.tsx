"use client";

import { useState, type CSSProperties } from "react";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { Vacio } from "@/components/ui/Vacio";
import { soles } from "@/lib/flujo-caja-reglas";
import type { PulsoImpuestos } from "@/lib/impuestos-pulso-reglas";
import { FileX } from "lucide-react";

// Impuestos en camino A (Felipe 2026-10-15): «¿Cuánto le debo a SUNAT?» con la cifra grande, la cuenta que la explica a un
// toque («¿Por qué?»). Lo decide `lib/impuestos-pulso-reglas.ts`. Lo que falta antes de declarar es `AntesDeDeclarar`.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function ImpuestosPulso({ pulso }: { pulso: PulsoImpuestos }) {
  const [porque, setPorque] = useState(false);
  if (pulso.estado === "sin_mes") {
    return (
      <section className="fin-pulso-hero">
        <p {...entra("fin-pulso-pregunta", 1)}>¿Cuánto le debo a SUNAT?</p>
        <Vacio tamano="chico" icono={<FileX />}>
          {pulso.frase}
        </Vacio>
      </section>
    );
  }
  const mayor = Math.max(1, ...pulso.cuenta.map((t) => t.monto));
  return (
    <>
      <section className="fin-pulso-hero" aria-labelledby="fin-impuestos-pregunta">
        <p id="fin-impuestos-pregunta" {...entra("fin-pulso-pregunta", 1)}>
          ¿Cuánto le debo a SUNAT?
        </p>
        <p {...entra("fin-pulso-respuesta", 2)}>
          <span className="fin-pulso-verbo">{pulso.verbo}</span>
          <span className="fin-pulso-monto" data-estado={pulso.estado === "a_favor" ? "gana" : undefined}>
            <CifraAnimada valor={Math.round(pulso.estado === "a_pagar" ? pulso.total : pulso.aFavor)} formato="soles" />
          </span>
        </p>
        <p {...entra("fin-pulso-explica", 3)}>{pulso.frase}</p>
        <p {...entra("fin-pulso-explica", 4)}>{pulso.deCada}</p>
        <div {...entra("fin-pulso-porque", 5)}>
          <button type="button" className="btn-cayla btn-enlace" aria-expanded={porque} aria-controls="fin-impuestos-cuenta" onClick={() => setPorque((v) => !v)}>
            {porque ? "Cerrar" : "¿Por qué?"}
          </button>
          {porque && (
            <ol id="fin-impuestos-cuenta" className="fin-pulso-cascada" aria-label="De dónde sale lo que le debes a SUNAT">
              {pulso.cuenta.map((t, i) => (
                <li key={t.clave} className="fin-pulso-tramo anim-entra" data-tipo={t.tipo === "suma" ? "sale" : t.tipo} style={{ ["--i" as string]: i } as CSSProperties}>
                  <span className="fin-pulso-tramo-nombre">
                    {t.nombre}
                    {t.detalle && <small>{t.detalle}</small>}
                  </span>
                  <span className="fin-pulso-tramo-monto num">
                    {t.tipo === "sale" ? "−" : t.tipo === "suma" ? "+" : ""}
                    {soles(t.monto)}
                  </span>
                  <span className="fin-pulso-tramo-barra" aria-hidden="true">
                    <i style={{ ["--w" as string]: `${Math.round((t.monto / mayor) * 100)}%` } as CSSProperties} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
