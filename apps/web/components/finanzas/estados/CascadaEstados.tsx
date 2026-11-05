"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import { DESVIO_QUE_IMPORTA } from "@/lib/ganamos-reglas";
import { geometriaCascada, type FilaCascada } from "@/lib/cascada-estados-reglas";

// La cascada de Estados financieros, tal como la maqueta aprobada (ADR-0585, `docs/maquetas/finanzas-eeff-2026-10/`): cada fila es el
// nombre a la izquierda, la pista con su barra en el medio y el monto a la derecha. Cada paso FLOTA: empieza donde terminó el anterior,
// así se ve a dónde se va la venta. Lo planeado es una raya sobre la barra; desde ±10 %, una píldora lo dice. Una fila con partes se toca
// y las abre debajo (real contra planeado); una con `href` lleva a otra pantalla (la sede). La geometría es `lib/cascada-estados-reglas.ts`.
// Movimiento de ADR-0136: cada barra crece una vez, en cascada, y nada con `prefers-reduced-motion`.

const conPlan = (f: FilaCascada) => !!f.lineas?.some((l) => l.plan !== null);

export function CascadaEstados({ id, filas, etiqueta, guia, sedes = false }: { id: string; filas: FilaCascada[]; etiqueta: string; guia?: string; sedes?: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const g = geometriaCascada(filas);
  return (
    <div id={id} className="fin-casc" data-sedes={sedes || undefined} role="list" aria-label={etiqueta} data-guia={guia}>
      {filas.map((f, i) => {
        const geo = g.filas[i]!;
        const abre = !f.href && !!f.lineas?.length;
        const estaAbierta = abierta === f.clave;
        const pasa = f.desvio !== undefined && Math.abs(f.desvio) >= DESVIO_QUE_IMPORTA ? f.desvio : null;
        const contenido: ReactNode = (
          <>
            <span className="fin-casc-nombre">
              <b>
                {f.color && <i className="fin-casc-punto" style={{ ["--c" as string]: f.color } as CSSProperties} aria-hidden />}
                {f.nombre}
                {(abre || f.href) && <ChevronRight aria-hidden className="fin-casc-flecha h-3.5 w-3.5" />}
              </b>
              {f.detalle && <small>{f.detalle}</small>}
            </span>
            <span className="fin-casc-pista" aria-hidden>
              {g.eje !== null && <span className="fin-casc-eje" style={{ left: `${g.eje}%` }} />}
              <span
                className="fin-casc-barra"
                data-clase={geo.clase}
                style={{ left: `${geo.izq}%`, width: `${geo.ancho}%`, ["--i" as string]: i, ...(f.color ? { ["--c" as string]: f.color } : {}) } as CSSProperties}
              />
              {geo.plan !== null && <span className="fin-casc-plan" style={{ left: `${geo.plan}%` }} title={f.plan !== undefined ? `Lo planeado: ${soles(f.plan)}` : undefined} />}
            </span>
            <span className="fin-casc-monto num">{f.tipo === "paso" ? solesConSigno(f.valor) : soles(f.valor)}</span>
            {pasa !== null && (
              <span className="fin-casc-chip">
                <Chip tono={pasa > 0 ? "ambar" : "verde"}>{`${Math.round(Math.abs(pasa) * 100)} % ${pasa > 0 ? "sobre" : "bajo"} lo planeado`}</Chip>
              </span>
            )}
          </>
        );
        return (
          <div key={f.clave} role="listitem" className="fin-casc-item">
            {f.href ? (
              <Link href={f.href} className="fin-casc-fila" data-tipo={f.tipo}>
                {contenido}
              </Link>
            ) : abre ? (
              <button type="button" className="fin-casc-fila" data-tipo={f.tipo} aria-expanded={estaAbierta} aria-controls={`${id}-${f.clave}`} onClick={() => setAbierta(estaAbierta ? null : f.clave)}>
                {contenido}
              </button>
            ) : (
              <div className="fin-casc-fila" data-tipo={f.tipo}>
                {contenido}
              </div>
            )}
            {abre && estaAbierta && (
              <div id={`${id}-${f.clave}`} className="fin-casc-detalle">
                <ul data-con-plan={conPlan(f) || undefined}>
                  {conPlan(f) && (
                    <li className="fin-casc-detalle-cab" aria-hidden>
                      <span />
                      <span>Real</span>
                      <span>Planeado</span>
                    </li>
                  )}
                  {f.lineas!.map((l) => (
                    <li key={l.nombre} data-pasa={l.plan !== null && l.real > l.plan * (1 + DESVIO_QUE_IMPORTA) ? "" : undefined}>
                      <span>{l.nombre}</span>
                      <span className="num">
                        <span className="sr-only">Real: </span>
                        {soles(l.real)}
                      </span>
                      {conPlan(f) && (
                        <span className="num">
                          <span className="sr-only">Planeado: </span>
                          {l.plan === null ? "—" : soles(l.plan)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** La leyenda de la cascada: «Suma · Resta · Lo planeado» (lo planeado, solo si alguna fila lo trae). */
export function LeyendaCascada({ plan = false, suma = "Suma", resta = "Resta" }: { plan?: boolean; suma?: string; resta?: string }) {
  return (
    <span className="fin-casc-leyenda">
      <span>
        <i data-clase="suma" aria-hidden />
        {suma}
      </span>
      <span>
        <i data-clase="resta" aria-hidden />
        {resta}
      </span>
      {plan && (
        <span>
          <i data-clase="plan" aria-hidden />
          Lo planeado
        </span>
      )}
    </span>
  );
}
