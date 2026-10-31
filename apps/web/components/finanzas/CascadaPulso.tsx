"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { soles } from "@/lib/flujo-caja-reglas";
import { DESVIO_QUE_IMPORTA } from "@/lib/ganamos-reglas";
import type { TramoCascada } from "@/lib/pulso-reglas";

// La cascada del camino A: vendiste → costó → sueldos → gastos → queda, cada tramo con su barra proporcional al mayor.
// Una sola pieza para Resumen y Estados financieros (ADR-0358). Sin estado propio salvo qué tramo está abierto: quien la dibuja decide
// cuándo mostrarla. En ¿Ganamos? (ADR-0585) cada tramo puede traer, además:
//   - `plan`: lo planeado en el presupuesto, una raya sobre su barra (a la misma escala);
//   - `desvio`: desde ±10 %, una píldora que dice cuánto se pasa o queda bajo lo planeado;
//   - `lineas`: sus cuentas, por su nombre, con lo real y lo planeado (el tramo se toca y se abre debajo);
//   - `href`: el tramo lleva a otra pantalla (la sede, en «Lo que dejó cada sede»).

const conPlan = (t: TramoCascada) => !!t.lineas?.some((l) => l.plan !== null);

export function CascadaPulso({ id, tramos, etiqueta, guia }: { id: string; tramos: TramoCascada[]; etiqueta: string; guia?: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const mayor = Math.max(1, ...tramos.map((t) => Math.max(t.monto, t.plan ?? 0)));
  const pct = (v: number) => `${Math.round((v / mayor) * 100)}%`;
  return (
    <ol id={id} className="fin-pulso-cascada" aria-label={etiqueta} data-guia={guia}>
      {tramos.map((t, i) => {
        const abre = !!t.lineas?.length;
        const estaAbierto = abierto === t.clave;
        const pasa = t.desvio !== undefined && Math.abs(t.desvio) >= DESVIO_QUE_IMPORTA ? t.desvio : null;
        const nombre = (
          <>
            {t.nombre}
            {t.detalle && <small>{t.detalle}</small>}
          </>
        );
        return (
          <li key={t.clave} className="fin-pulso-tramo anim-entra" data-tipo={t.tipo} data-negativo={t.negativo || undefined} style={{ ["--i" as string]: i } as CSSProperties}>
            <span className="fin-pulso-tramo-nombre">
              {t.href ? (
                <Link href={t.href} className="fin-pulso-tramo-enlace">
                  {nombre}
                </Link>
              ) : abre ? (
                <button type="button" className="fin-pulso-tramo-abre" aria-expanded={estaAbierto} aria-controls={`${id}-${t.clave}`} onClick={() => setAbierto(estaAbierto ? null : t.clave)}>
                  <ChevronRight aria-hidden className="h-3.5 w-3.5 fin-pulso-tramo-flecha" />
                  <span>{nombre}</span>
                </button>
              ) : (
                nombre
              )}
            </span>
            <span className="fin-pulso-tramo-monto num">
              {t.tipo === "sale" ? "−" : ""}
              {soles(t.monto)}
            </span>
            <span className="fin-pulso-tramo-barra" aria-hidden="true">
              <i style={{ ["--w" as string]: pct(t.monto) } as CSSProperties} />
              {t.plan !== undefined && <b className="fin-pulso-tramo-plan" style={{ ["--p" as string]: pct(t.plan) } as CSSProperties} />}
            </span>
            {pasa !== null && (
              <span className="fin-pulso-tramo-chip">
                <Chip tono={pasa > 0 ? "ambar" : "verde"}>{`${Math.round(Math.abs(pasa) * 100)} % ${pasa > 0 ? "sobre" : "bajo"} lo planeado`}</Chip>
              </span>
            )}
            {abre && estaAbierto && (
              <ul id={`${id}-${t.clave}`} className="fin-pulso-tramo-lineas" data-con-plan={conPlan(t) || undefined}>
                <li className="fin-pulso-tramo-lineas-cab" aria-hidden="true">
                  <span />
                  <span>Real</span>
                  {conPlan(t) && <span>Planeado</span>}
                </li>
                {t.lineas!.map((l) => (
                  <li key={l.nombre} data-pasa={l.plan !== null && l.real > l.plan * (1 + DESVIO_QUE_IMPORTA) ? "" : undefined}>
                    <span>{l.nombre}</span>
                    <span className="num">
                      <span className="sr-only">Real: </span>
                      {soles(l.real)}
                    </span>
                    {conPlan(t) && (
                      <span className="num">
                        <span className="sr-only">Planeado: </span>
                        {l.plan === null ? "—" : soles(l.plan)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
