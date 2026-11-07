"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { DIAS_CALENDARIO, diaMas, type Carril } from "@/lib/que-debes-reglas";

// Finanzas ▸ Cuentas y dinero ▸ Qué debes: «Lo que vence en 30 días» como carriles (Felipe 2026-10-31, maqueta
// docs/maquetas/finanzas-que-debes-rediseno-2026-10/). Una fila por sede (y una para lo de la empresa) sobre una línea de días; cada factura
// es un punto del tamaño de su saldo y del color de su sede. Lo vencido va a la izquierda con borde rojo; la franja ámbar es «esta semana».
// Solo dibuja: qué carriles y qué puntos los decide `carrilesDeDeudas`, y tocar un punto abre el pago de siempre (`?pagar=`).

const ANCHO = 720;
const ETIQUETA = 132;
const FILA = 46;
const xDe = (columna: number) => (columna < 0 ? ETIQUETA + 14 : columna > DIAS_CALENDARIO ? ANCHO - 30 : ETIQUETA + 78 + (columna * (ANCHO - ETIQUETA - 150)) / DIAS_CALENDARIO);

export function PorPagarCarriles({
  carriles,
  hoy,
  nombreDe,
  colorDe,
  tituloDe,
  puedePagarId,
  irAPagar,
}: {
  carriles: Carril[];
  hoy: string;
  /** «Trujillo», «De la empresa»: el nombre corto del carril. */
  nombreDe: (clave: string | null) => string;
  /** El token de color de la sede (`var(--color-sede-…)`). */
  colorDe: (clave: string | null) => string;
  /** «Proveedor · S/ 6,800 · vencida hace 9 días»: lo que dice un punto al pasar el mouse. */
  tituloDe: (id: string) => string;
  /** ¿Esta cuenta puede pagar esa factura desde aquí? Si no, el punto solo se lee. */
  puedePagarId: (id: string) => boolean;
  irAPagar: (id: string) => void;
}) {
  const alto = carriles.length * FILA + 40;
  const eje = [0, 7, 14, 21, DIAS_CALENDARIO];
  return (
    <div className="qd-carriles">
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={`Facturas por sede y por día, ${carriles.reduce((a, c) => a + c.puntos.length, 0)} en total`}>
        <rect className="qd-semana" x={xDe(0)} y={4} width={xDe(7) - xDe(0)} height={carriles.length * FILA} rx={8} />
        {carriles.map((c, i) => {
          const cy = i * FILA + FILA / 2 + 4;
          const color = colorDe(c.clave);
          return (
            <g key={c.clave ?? "empresa"} style={{ ["--c" as string]: color } as CSSProperties}>
              <line className="qd-linea" x1={ETIQUETA} x2={ANCHO - 6} y1={cy} y2={cy} />
              <circle className="qd-sede-punto" cx={14} cy={cy} r={5} />
              <text className="qd-sede-nombre" x={28} y={cy - 3}>
                {nombreDe(c.clave)}
              </text>
              <text className="qd-sede-total" x={28} y={cy + 12}>
                S/&nbsp;{Math.round(c.total).toLocaleString("en-US")}
              </text>
              {c.puntos.map((p, k) => {
                const pagable = puedePagarId(p.id);
                const ir = () => irAPagar(p.id);
                return (
                  <g
                    key={p.id}
                    className="qd-punto"
                    data-vencida={p.vencida ? "" : undefined}
                    style={{ ["--i" as string]: k } as CSSProperties}
                    {...(pagable
                      ? {
                          role: "link",
                          tabIndex: 0,
                          "aria-label": `Pagar ${tituloDe(p.id)}`,
                          onClick: ir,
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              ir();
                            }
                          },
                        }
                      : {})}
                  >
                    <title>{tituloDe(p.id)}</title>
                    <circle cx={xDe(p.columna)} cy={cy} r={p.r} />
                  </g>
                );
              })}
            </g>
          );
        })}
        <text className="qd-eje" x={xDe(-1)} y={alto - 12} textAnchor="middle">
          vencidas
        </text>
        {eje.map((d) => (
          <text key={d} className="qd-eje" x={xDe(d)} y={alto - 12} textAnchor="middle">
            {d === 0 ? "hoy" : diaMas(hoy, d)}
          </text>
        ))}
        <text className="qd-eje" x={xDe(DIAS_CALENDARIO + 1)} y={alto - 12} textAnchor="middle">
          después
        </text>
      </svg>
    </div>
  );
}
