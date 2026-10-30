"use client";

import { useState, type CSSProperties } from "react";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { pctDelNudo, type HiloRecorrido, type Recorrido } from "@/lib/recorrido-plata-reglas";

// Finanzas ▸ Resumen, «A dónde va la plata» (Felipe 2026-10-29, spike «Resumen pulido»: reemplaza al recorrido en hilos y a «¿Y de cada S/ 100?»).
// Un anillo con lo que SALE del recorrido de la plata (`recorridoPlata`: lo que costaron las prendas, los gastos, el Taller, la Empresa…) y, al
// lado, la leyenda con cada monto y su porcentaje. El centro dice el total (en cifra grande) y, al pasar el mouse por un renglón o por su tramo,
// el de ese renglón. Solo DIBUJA lo que arma `recorridoPlata`: no suma nada que ya no esté ahí. La barra de sedes que lo acompañaba se fue a
// «Vendido por sede». Movimiento de ADR-0136: los tramos entran una vez, en cascada, sin rebote ni bucle.

/** Los colores de cada hilo que sale: los de siempre del recorrido (prendas y gastos en azul pizarra, la caja en ámbar, lo que te deja en verde) y, para
 *  el Taller y la Empresa, los de su sede en el telar. */
const COLOR_HILO: Partial<Record<HiloRecorrido["tipo"], string>> = {
  // Prendas y gastos son azul pizarra (oscuro y claro): el taupe y el gris de antes se confundían con la Empresa (beige).
  prendas: "color-mix(in srgb, var(--color-pizarra) 85%, transparent)",
  gastos: "color-mix(in srgb, var(--color-rojo) 78%, transparent)",
  caja: "var(--color-ambar)",
  deja: "var(--color-verde)",
  ajustes: "var(--color-sand)",
  taller: "var(--color-sede-tal)",
  empresa: "var(--color-sede-emp)",
  pierde: "var(--color-rojo-profundo)",
};
const colorDe = (h: HiloRecorrido) => COLOR_HILO[h.tipo] ?? "var(--color-taupe)";

const R = 76;
const ANCHO_TRAMO = 30;
const CIRCUNFERENCIA = 2 * Math.PI * R;

export function AdondeVaLaPlata({ recorrido, bajada }: { recorrido: Recorrido; bajada: string }) {
  const [foco, setFoco] = useState<string | null>(null);
  const partes = recorrido.salidas.filter((h) => h.monto > 0);
  const total = partes.reduce((a, h) => a + h.monto, 0);
  if (partes.length === 0 || total <= 0) return null;
  const pierde = recorrido.modo === "vende" && recorrido.resultado < 0;
  const enFoco = partes.find((h) => h.clave === foco) ?? null;
  const pct = (h: HiloRecorrido) => pctDelNudo(h, recorrido);
  let acumulado = 0;
  const tramos = partes.map((h, i) => {
    const largo = (h.monto / total) * CIRCUNFERENCIA;
    const pintado = Math.max(largo - Math.min(3, largo * 0.3), 0.5);
    const t = { h, i, pintado, desfase: -acumulado };
    acumulado += largo;
    return t;
  });
  const etiqueta = `${bajada} A dónde va: ${partes.map((h) => `${h.nombre} ${soles(h.monto)}, ${pct(h)} %`).join("; ")}.`;
  return (
    <Superficie pad guia="fin-resumen.recorrido">
      <CabeceraBloque titulo="A dónde va la plata" bajada={bajada} />
      <div className="fin-donut" data-hay={foco ? "" : undefined}>
        <div className="fin-donut-dibujo">
          <svg viewBox="0 0 200 200" role="img" aria-label={etiqueta}>
            {tramos.map(({ h, i, pintado, desfase }) => (
              <circle // unificar-fijo: anillo de REPARTO en varios tramos; <Anillo> es de un solo avance
                key={h.clave}
                className="fin-donut-tramo"
                data-en={h.clave === foco ? "" : undefined}
                cx={100}
                cy={100}
                r={R}
                fill="none"
                strokeWidth={ANCHO_TRAMO}
                strokeDasharray={`${pintado} ${CIRCUNFERENCIA - pintado}`}
                strokeDashoffset={desfase}
                transform="rotate(-90 100 100)"
                style={{ stroke: colorDe(h), ["--i" as string]: i } as CSSProperties}
                onMouseEnter={() => setFoco(h.clave)}
                onMouseLeave={() => setFoco(null)}
              />
            ))}
          </svg>
          <div className="fin-donut-centro" aria-hidden="true">
            <span>{enFoco ? enFoco.nombre : pierde ? "Salió" : recorrido.nudo.nombre}</span>
            <b className="num">{soles(enFoco ? enFoco.monto : pierde ? total : recorrido.nudo.monto)}</b>
            {enFoco && <span>{pct(enFoco)} % de lo que salió</span>}
          </div>
        </div>
        <ul className="fin-donut-ley" aria-label="A dónde va cada sol">
          {partes.map((h) => (
            <li key={h.clave}>
              <button type="button" data-en={h.clave === foco ? "" : undefined} onMouseEnter={() => setFoco(h.clave)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(h.clave)} onBlur={() => setFoco(null)}>
                <i style={{ background: colorDe(h) }} aria-hidden />
                <span>{h.nombre}</span>
                <b className="num">{soles(h.monto)}</b>
                <span className="num text-xs text-taupe">{pct(h)} %</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Superficie>
  );
}
