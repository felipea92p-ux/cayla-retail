"use client";

import { useState, type CSSProperties } from "react";
import { montoConSigno } from "@/lib/dinero-telar-reglas";
import { TEXTO_ETAPA, type EtapaDinero } from "@/lib/dinero-estados-reglas";
import { trazoDeArco, type Reparto } from "@/lib/dinero-reparto-reglas";

// Cuentas y dinero ▸ Dónde está, el círculo de la franja (Felipe 2026-10-31: vuelve el círculo del 28-oct, en lugar de la barra partida). Toda la
// plata de lo que se mira, una porción por cuenta con el color de su etapa, y al centro lo que se tiene. Al pasar el mouse por una porción, el centro
// dice esa cuenta; con una etapa tocada en la franja, las demás se apagan; con una cuenta abierta en «Mis cuentas», el centro la dice. Nada vive
// solo aquí: cada cuenta y su saldo están escritos en «Mis cuentas», así que el círculo es para mirar, no para leer (sin foco, oculto al lector).
// Qué porción le toca a cada cuenta lo decide `lib/dinero-reparto-reglas.ts`. Movimiento: las porciones se trazan una vez al llegar, en cascada,
// sin rebote ni bucle (ADR-0136, el gráfico propio del telar de Finanzas), y quietas con `prefers-reduced-motion`.

const RADIO = 80;

export function CirculoDinero({
  reparto,
  titulo,
  total,
  etapa,
  elegida,
}: {
  reparto: Reparto;
  /** «Tienes en total», o «Tiene Trujillo» con una sede elegida. */
  titulo: string;
  /** La cifra de la cabecera (con lo negativo restado); nula si no se pudo leer. */
  total: number | null;
  /** La etapa tocada en la franja: las porciones de las demás se apagan. */
  etapa: EtapaDinero | null;
  /** La cuenta abierta en «Mis cuentas»: el centro la dice mientras el mouse no mire otra. */
  elegida: string | null;
}) {
  const [encima, setEncima] = useState<string | null>(null);
  const mirada = reparto.porciones.find((p) => p.id === (encima ?? elegida)) ?? null;
  return (
    <div className="dp-circulo" onMouseLeave={() => setEncima(null)}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="dp-circulo-pista" cx="100" cy="100" r={RADIO} />
        {reparto.porciones.map((p, i) => (
          <path
            key={p.id}
            className="dp-circulo-arco"
            d={trazoDeArco(p.desde, p.hasta, RADIO)}
            pathLength={1}
            data-apagada={(mirada && mirada.id !== p.id) || (!mirada && etapa && etapa !== p.etapa) ? "" : undefined}
            style={{ ["--c" as string]: p.color, ["--i" as string]: i } as CSSProperties}
            onMouseEnter={() => setEncima(p.id)}
          />
        ))}
      </svg>
      <div className="dp-circulo-centro">
        <span className="dp-versalita">{mirada ? mirada.nombre : titulo}</span>
        {mirada ? (
          <b className="dp-circulo-cifra">{montoConSigno(mirada.monto)}</b>
        ) : total === null ? (
          <span className="dp-tenue">No se pudo leer</span>
        ) : (
          <b className="dp-circulo-cifra">
            <small>S/</small>
            {Math.round(total).toLocaleString("en-US")}
          </b>
        )}
        <span className="dp-circulo-pie">
          {mirada
            ? `${mirada.pctEntero === 0 ? "Menos de 1 %" : `${mirada.pctEntero} %`} · ${mirada.lugar ?? TEXTO_ETAPA[mirada.etapa]}`
            : reparto.negativo < 0
              ? `${montoConSigno(reparto.negativo)} en negativo, fuera del círculo`
              : reparto.porciones.length === 0
                ? "Ninguna cuenta tiene saldo"
                : "hoy"}
        </span>
      </div>
    </div>
  );
}
