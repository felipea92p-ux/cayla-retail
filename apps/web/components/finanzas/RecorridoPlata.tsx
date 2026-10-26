"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent } from "react";
import { soles } from "@/lib/flujo-caja-reglas";
import { pctDelNudo, type HiloRecorrido, type Recorrido } from "@/lib/recorrido-plata-reglas";

// Finanzas ▸ Resumen, «El recorrido de la plata» (El telar, Felipe 2026-10-23). Solo DIBUJA lo que arma `recorridoPlata`: los hilos que
// entran al nudo del medio y los que salen, cada uno del grosor de su monto. En escritorio, el recorrido; bajo 640 px, dos tiras
// («de dónde vino» y «a dónde fue»), las dos en el HTML y una escondida por CSS (`app/estilos/finanzas-recorrido.css`), sin medir la
// pantalla con JavaScript. Los hilos se tejen una sola vez al entrar, de izquierda a derecha, sin rebote ni bucle (ADR-0136), y nada
// se mueve con `prefers-reduced-motion`.
//
// Tocar el hilo de una sede la elige: el enlace lo arma quien la monta (`hrefDeSede`, ya con la sede y el mes de la barra común del
// telar), porque la sede vive en la URL y esta pieza no la conoce. Los colores de sede llegan igual (`colorDeSede`): cuando la barra
// común traiga sus tokens `--color-sede-*`, se pasan aquí; mientras, cada sede toma uno del juego de respaldo, en orden.

/** Color de respaldo de las sedes, en el orden en que llegan (mientras no existan los tokens de sede de la barra común). */
const RESPALDO_SEDE = ["var(--color-tinta)", "var(--color-taupe)", "var(--color-pizarra)", "var(--color-ambar)", "var(--color-oliva)"];

/** El color de lo que no es una sede: fijo, y dice qué es (verde lo que queda, rojo lo que falta). */
const COLOR_TIPO: Partial<Record<HiloRecorrido["tipo"], string>> = {
  prendas: "color-mix(in srgb, var(--color-taupe) 60%, transparent)",
  gastos: "color-mix(in srgb, var(--color-tinta) 32%, transparent)",
  caja: "var(--color-ambar)",
  sobrante: "color-mix(in srgb, var(--color-verde) 55%, transparent)",
  ajustes: "var(--color-sand)",
  deja: "var(--color-verde)",
  falta: "var(--color-rojo-profundo)",
};

type Props = {
  recorrido: Recorrido;
  /** sedeId → color (`var(--color-sede-…)`). Lo que no esté, toma uno del respaldo. */
  colorDeSede?: Record<string, string>;
  /** sedeId → a dónde lleva tocar ese hilo (la misma pantalla con esa sede elegida). Sin enlace, el hilo no se toca. */
  hrefDeSede?: Record<string, string>;
  /** Lo que dice el lector de pantalla del dibujo entero. */
  etiqueta?: string;
};

export function RecorridoPlata({ recorrido, colorDeSede = {}, hrefDeSede = {}, etiqueta = "Por dónde pasa la plata del mes" }: Props) {
  const router = useRouter();
  const sedes = [...new Set([...recorrido.entradas, ...recorrido.salidas].map((h) => h.sedeId).filter((s): s is string => !!s))];
  const color = (h: HiloRecorrido) =>
    COLOR_TIPO[h.tipo] ?? (h.sedeId ? (colorDeSede[h.sedeId] ?? RESPALDO_SEDE[sedes.indexOf(h.sedeId) % RESPALDO_SEDE.length]!) : "var(--color-taupe)");
  const ir = (href: string) => (e: MouseEvent) => {
    e.preventDefault();
    router.push(href, { scroll: false });
  };
  const resumen = `${recorrido.nudo.nombre}: ${soles(recorrido.nudo.monto)}. Entra ${recorrido.entradas.map((h) => `${h.nombre} ${soles(h.monto)}`).join(", ")}. Sale ${recorrido.salidas.map((h) => `${h.nombre} ${soles(h.monto)}`).join(", ")}.`;

  return (
    <div className="fin-recorrido" data-modo={recorrido.modo}>
      <Hilos recorrido={recorrido} color={color} hrefDeSede={hrefDeSede} ir={ir} etiqueta={`${etiqueta}. ${resumen}`} />
      <Tiras recorrido={recorrido} color={color} hrefDeSede={hrefDeSede} ir={ir} />
    </div>
  );
}

type Dibujo = { recorrido: Recorrido; color: (h: HiloRecorrido) => string; hrefDeSede: Record<string, string>; ir: (href: string) => (e: MouseEvent) => void };

// ---- Escritorio: los hilos ------------------------------------------------------------------------------------------------------

const W = 1000;
const H = 400;
const ARRIBA = 30;
const ABAJO = 12;
const ESPACIO = 12;
const NUDO = 12;
const X_IZQ = 170;
const X_MEDIO = 480;
const X_DER = 760;
/** Las etiquetas de un lado no se pisan: cada una a esta distancia de la anterior, como mínimo. */
const ENTRE_ETIQUETAS = 38;

type Ubicado = HiloRecorrido & { y: number; h: number; ly: number };

function Hilos({ recorrido: r, color, hrefDeSede, ir, etiqueta }: Dibujo & { etiqueta: string }) {
  const alto = H - ARRIBA - ABAJO;
  const n = Math.max(r.entradas.length, r.salidas.length);
  const k = r.nudo.total > 0 ? (alto - ESPACIO * (n - 1)) / r.nudo.total : 0;
  const apilar = (lista: HiloRecorrido[]): Ubicado[] => {
    const total = lista.reduce((a, x) => a + x.monto * k, 0) + ESPACIO * (lista.length - 1);
    let y = ARRIBA + (alto - total) / 2;
    return lista.map((x) => {
      const o = { ...x, y, h: Math.max(2, x.monto * k), ly: 0 };
      y += o.h + ESPACIO;
      return o;
    });
  };
  const separar = (lista: Ubicado[]) => {
    let previo = -Infinity;
    for (const x of lista) previo = x.ly = Math.max(x.y + x.h / 2, previo + ENTRE_ETIQUETAS);
    const exceso = previo - (H - ABAJO);
    if (exceso > 0) {
      let siguiente = Infinity;
      for (let i = lista.length - 1; i >= 0; i--) siguiente = lista[i]!.ly = Math.min(lista[i]!.ly - exceso, siguiente - ENTRE_ETIQUETAS);
    }
  };
  const izq = apilar(r.entradas);
  const der = apilar(r.salidas);
  separar(izq);
  separar(der);
  const altoNudo = Math.max(2, r.nudo.total * k);
  const yNudo = ARRIBA + (alto - altoNudo) / 2;
  const curva = (x0: number, y0: number, x1: number, y1: number) => {
    const xm = (x0 + x1) / 2;
    return `M${x0} ${y0.toFixed(1)} C${xm} ${y0.toFixed(1)}, ${xm} ${y1.toFixed(1)}, ${x1} ${y1.toFixed(1)}`;
  };

  // Dónde toca cada hilo el nudo del medio: uno debajo del otro, en el orden en que llegan (o salen).
  const enNudo = (lista: Ubicado[]) => {
    let y = yNudo;
    return lista.map((x) => {
      const centro = y + x.h / 2;
      y += x.h;
      return centro;
    });
  };
  const yEntra = enNudo(izq);
  const ySale = enNudo(der);
  const hilo = (x: Ubicado, d: string, i: number) => {
    const href = x.sedeId ? hrefDeSede[x.sedeId] : undefined;
    const trazo = (
      <path
        className="fin-recorrido-hilo"
        d={d}
        stroke={color(x)}
        strokeWidth={x.h.toFixed(1)}
        pathLength={1}
        data-tenue={x.tenue || undefined}
        style={{ ["--i" as string]: i } as CSSProperties}
      >
        <title>{`${x.nombre}: ${soles(x.monto)} · ${pctDelNudo(x, r)} %`}</title>
      </path>
    );
    return href ? (
      <a key={x.clave} href={href} onClick={ir(href)} aria-label={`Ver solo ${x.nombre}`} className="fin-recorrido-enlace">
        {trazo}
      </a>
    ) : (
      <g key={x.clave}>{trazo}</g>
    );
  };
  const etiquetaDe = (x: Ubicado, lado: "izq" | "der", i: number) => (
    <g key={`e-${x.clave}`} className="fin-recorrido-etiqueta" data-tenue={x.tenue || undefined} style={{ ["--i" as string]: i } as CSSProperties}>
      <text className="fin-recorrido-nombre" x={lado === "izq" ? X_IZQ - 12 : X_DER + NUDO + 12} y={x.ly - 4} textAnchor={lado === "izq" ? "end" : "start"}>
        {x.nombre}
      </text>
      <text
        className="fin-recorrido-monto"
        data-tipo={x.tipo}
        x={lado === "izq" ? X_IZQ - 12 : X_DER + NUDO + 12}
        y={x.ly + 16}
        textAnchor={lado === "izq" ? "end" : "start"}
      >
        {soles(x.monto)}
        {lado === "der" && (
          <tspan className="fin-recorrido-pct" dx={8}>
            {pctDelNudo(x, r)} %
          </tspan>
        )}
      </text>
    </g>
  );

  return (
    <svg className="fin-recorrido-hilos" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={etiqueta}>
      {izq.map((x, i) => hilo(x, curva(X_IZQ + NUDO, x.y + x.h / 2, X_MEDIO, yEntra[i]!), i))}
      {der.map((x, i) => hilo(x, curva(X_MEDIO + NUDO, ySale[i]!, X_DER, x.y + x.h / 2), i + izq.length + 1))}
      {izq.map((x, i) => (
        <rect key={`n-${x.clave}`} className="fin-recorrido-nudo" x={X_IZQ} y={x.y} width={NUDO} height={x.h} fill={color(x)} rx={3} style={{ ["--i" as string]: i } as CSSProperties} />
      ))}
      <rect className="fin-recorrido-nudo fin-recorrido-centro" x={X_MEDIO} y={yNudo} width={NUDO} height={altoNudo} rx={3} style={{ ["--i" as string]: izq.length } as CSSProperties} />
      {der.map((x, i) => (
        <rect
          key={`n-${x.clave}`}
          className="fin-recorrido-nudo"
          x={X_DER}
          y={x.y}
          width={NUDO}
          height={x.h}
          fill={color(x)}
          rx={3}
          data-tenue={x.tenue || undefined}
          style={{ ["--i" as string]: i + izq.length + 1 } as CSSProperties}
        />
      ))}
      {izq.map((x, i) => etiquetaDe(x, "izq", i))}
      <g className="fin-recorrido-etiqueta" style={{ ["--i" as string]: izq.length } as CSSProperties}>
        <text className="fin-recorrido-nombre" x={X_MEDIO + NUDO / 2} y={yNudo - 26} textAnchor="middle">
          {r.nudo.nombre}
        </text>
        <text className="fin-recorrido-monto" x={X_MEDIO + NUDO / 2} y={yNudo - 8} textAnchor="middle">
          {soles(r.nudo.monto)}
        </text>
      </g>
      {der.map((x, i) => etiquetaDe(x, "der", i + izq.length + 1))}
    </svg>
  );
}

// ---- Celular: dos tiras ---------------------------------------------------------------------------------------------------------

function Tiras({ recorrido: r, color, hrefDeSede, ir }: Dibujo) {
  const tira = (titulo: string, lista: HiloRecorrido[]) => (
    <div className="fin-recorrido-tira">
      <span className="fin-recorrido-tira-titulo">{titulo}</span>
      <div className="fin-recorrido-tira-barra" aria-hidden="true">
        {lista.map((h, i) => (
          <i key={h.clave} data-tenue={h.tenue || undefined} style={{ ["--f" as string]: h.monto, ["--c" as string]: color(h), ["--i" as string]: i } as CSSProperties} />
        ))}
      </div>
      <ul className="fin-recorrido-tira-ley">
        {lista.map((h) => {
          const href = h.sedeId ? hrefDeSede[h.sedeId] : undefined;
          const cuerpo = (
            <>
              <span className="fin-recorrido-punto" style={{ ["--c" as string]: color(h) } as CSSProperties} aria-hidden="true" />
              {h.nombre} · <b data-tipo={h.tipo}>{soles(h.monto)}</b>
            </>
          );
          return (
            <li key={h.clave} data-tenue={h.tenue || undefined}>
              {href ? (
                <a href={href} onClick={ir(href)} className="fin-recorrido-tira-enlace">
                  {cuerpo}
                </a>
              ) : (
                cuerpo
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <div className="fin-recorrido-tiras">
      {tira(`${r.nudo.nombre}: ${soles(r.nudo.monto)}`, r.entradas)}
      {tira("A dónde fue", r.salidas)}
    </div>
  );
}
