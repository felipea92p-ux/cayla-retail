"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { Sparkline } from "@/components/ui/Sparkline";
import { etiquetaCambio, type FilaHilo } from "@/lib/gastos-hilos-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import type { ClaveSede, ColorSede } from "@/lib/finanzas-telar-reglas";

// El color de cada hilo de sede, el mismo del orillo del telar. La empresa va rayada: no es una tienda, es lo que no es de ninguna.
const COLOR: Record<ColorSede, string> = {
  tru: "var(--color-sede-tru)",
  aqp: "var(--color-sede-aqp)",
  lim: "var(--color-sede-lim)",
  tal: "var(--color-sede-tal)",
  emp: "repeating-linear-gradient(45deg, var(--color-sede-emp) 0 3px, color-mix(in srgb, var(--color-sede-emp) 45%, transparent) 3px 6px)",
  otra: "var(--color-taupe)",
};

/**
 * «En qué se va» en Gastos (Felipe 2026-10-30, maqueta `docs/maquetas/gastos-grafico-2026-10/`, reemplaza al retazo de ADR-0493): un
 * ranking que se lee de arriba abajo. Cada categoría es una fila con su hilo partido por sede (a la escala de la más grande), la rayita
 * de dónde estaba el mes anterior, cuánto subió o bajó y su línea de los últimos meses. Tocar la fila o un color del hilo la elige.
 * Al cambiar de sede las filas se reordenan deslizándose y los hilos se reacomodan desde donde estaban; una vez, sin rebote (ADR-0136,
 * el gráfico propio del telar).
 */
export function HilosGastos({
  filas,
  nombreMesAnterior,
  elegida,
  onElegir,
}: {
  filas: FilaHilo[];
  /** «septiembre»: para la rayita y su leyenda. */
  nombreMesAnterior: string;
  /** La categoría elegida (su fila queda marcada). */
  elegida: string;
  /** Se tocó una fila (`sede` = `null`) o un color de su hilo (`sede` = esa sede). */
  onElegir: (categoria: string, sede: ClaveSede | null) => void;
}) {
  const lista = useRef<HTMLOListElement>(null);
  const antes = useRef(new Map<string, number>());
  // Las filas que cambian de puesto se deslizan desde donde estaban (FLIP): se mide contra la lista, no contra la ventana, para que
  // bajar la página no cuente como un movimiento.
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    const quieta = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ahora = new Map<string, number>();
    el.querySelectorAll<HTMLElement>(":scope > [data-categoria]").forEach((f) => {
      const k = f.dataset.categoria!;
      ahora.set(k, f.offsetTop);
      const previo = antes.current.get(k);
      if (!quieta && previo !== undefined && Math.abs(previo - f.offsetTop) > 1) {
        f.animate([{ transform: `translateY(${previo - f.offsetTop}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    });
    antes.current = ahora;
  });

  const max = Math.max(...filas.map((f) => Math.max(f.total, f.anterior ?? 0)), 0);
  const sedes = new Map(filas.flatMap((f) => f.tramos).map((t) => [t.clave, t]));
  const conAntes = filas.some((f) => (f.anterior ?? 0) > 0);

  return (
    <div className="hilos-gastos" data-guia="fin-gastos.hilos">
      <div className="hilos-leyenda" aria-hidden>
        {[...sedes.values()].map((s) => (
          <span key={s.clave}>
            <MuestraTramo color={COLOR[s.color]} />
            {s.nombre}
          </span>
        ))}
        {conAntes && (
          <span>
            <i className="hilo-antes-muestra" />
            dónde estaba en {nombreMesAnterior}
          </span>
        )}
      </div>
      <ol ref={lista} className="hilos-filas">
        {filas.map((f, i) => {
          const cambio = f.cambio ? etiquetaCambio(f.cambio) : null;
          return (
            <li key={f.categoria} data-categoria={f.categoria} data-elegida={elegida === f.categoria || undefined} className="hilo-fila" style={{ "--i": i } as CSSProperties}>
              {/* Toda la fila se toca; los botones de adentro (el nombre, cada color del hilo) hacen lo suyo y no la tocan dos veces. */}
              <div
                className="hilo-cabeza"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  onElegir(f.categoria, null);
                }}
              >
                <span className="hilo-rango">{i + 1}</span>
                <button type="button" className="hilo-nombre" aria-pressed={elegida === f.categoria} onClick={() => onElegir(f.categoria, null)}>
                  <b>{f.nombre}</b>
                  <small>{f.pct} % de lo gastado</small>
                </button>
                <span className="hilo-barra">
                  <BarraApilada
                    segmentos={f.tramos.map((t) => ({
                      clave: t.clave,
                      nombre: t.nombre,
                      valor: t.monto,
                      color: COLOR[t.color],
                      titulo: `${t.nombre}: ${solesRedondo(t.monto)}, el ${t.pct} % · tócalo para ver en qué se fue`,
                    }))}
                    total={max}
                    unidad="soles"
                    formato={solesRedondo}
                    retraso={i}
                    etiqueta={`${f.nombre}: ${f.tramos.map((t) => `${t.nombre} ${solesRedondo(t.monto)}`).join(", ")}`}
                    respuesta={{ onElegir: (clave) => onElegir(f.categoria, clave), accion: "Ver lo que se gastó en esa sede" }}
                  />
                  {(f.anterior ?? 0) > 0 && (
                    <i aria-hidden className="hilo-antes" style={{ left: `${((f.anterior ?? 0) / max) * 100}%` }} title={`En ${nombreMesAnterior}: ${solesRedondo(f.anterior ?? 0)}`} />
                  )}
                </span>
                <span className="hilo-cambio">
                  {cambio && (
                    <Chip tono={cambio.tono} versalitas={false} title={f.anterior ? `En ${nombreMesAnterior}: ${solesRedondo(f.anterior)}` : `En ${nombreMesAnterior} no hubo gastos de esto`}>
                      {cambio.texto}
                    </Chip>
                  )}
                </span>
                <span className="hilo-monto">{solesRedondo(f.total)}</span>
                <span className="hilo-linea">{f.historia && <Sparkline serie={f.historia} indice={i} />}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
