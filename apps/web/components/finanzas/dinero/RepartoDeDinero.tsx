"use client";

import { useState, type CSSProperties } from "react";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { montoConSigno } from "@/lib/dinero-telar-reglas";
import { trazoDeArco, type RepartoDeDinero as Reparto } from "@/lib/dinero-reparto-reglas";

// Cuentas y dinero ▸ Dónde está, el resumen de arriba (Felipe 2026-10-28): un círculo que es TODA la plata de CAYLA (o de la sede que se mira), partido en los lugares
// donde está (cada banco, el efectivo de cada tienda, lo que está en camino), con lo que hay en total al centro, y al lado la leyenda con
// cada monto y su porcentaje. Los verdes son CAYLA entera (los bancos), los terracotas las tiendas y la pizarra lo que viene en camino.
// Pasar el mouse por una fila de la leyenda apaga las demás porciones y el centro dice la suya. Qué porción le toca a cada grupo lo decide `lib/dinero-reparto-reglas.ts`; aquí solo se
// dibuja. El estado es solo cuál porción se mira: sin ella, todo se lee igual (la leyenda trae los mismos números en texto).
// Movimiento: las porciones se trazan una vez al llegar, en cascada, sin rebote ni bucle (ADR-0136, excepción de Finanzas, D7), y no
// se mueven con `prefers-reduced-motion` (`app/estilos/finanzas-dinero.css`).

const RADIO = 78;

export function RepartoDeDinero({ reparto }: { reparto: Reparto }) {
  const [activa, setActiva] = useState<string | null>(null);
  const mirada = reparto.porciones.find((p) => p.id === activa) ?? null;
  return (
    <section className="anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties} aria-label="Cómo se reparte la plata">
      <Superficie pad guia="fin-dinero.reparto">
        <CabeceraBloque titulo="Cómo se reparte" bajada={`Toda la plata de ${reparto.alcance ?? "CAYLA"}, repartida por el lugar donde está.`} />
        <div className="din-reparto">
          <div className="din-anillo" onMouseLeave={() => setActiva(null)}>
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle className="din-anillo-pista" cx="100" cy="100" r={RADIO} />
              {reparto.porciones.map((p, i) => (
                <path
                  key={p.id}
                  className="din-anillo-arco"
                  d={trazoDeArco(p.desde, p.hasta, RADIO)}
                  pathLength={1}
                  data-atenuada={activa !== null && activa !== p.id ? "" : undefined}
                  style={{ ["--c" as string]: p.color, ["--i" as string]: i } as CSSProperties}
                />
              ))}
            </svg>
            <div className="din-anillo-centro">
              <span className="din-anillo-rotulo">{mirada ? mirada.titulo : (reparto.alcance ?? "CAYLA entera")}</span>
              <b className="din-anillo-cifra">{montoConSigno(mirada ? mirada.monto : reparto.enCuentas)}</b>
              <span className="din-anillo-pie">{mirada ? [mirada.lugar, mirada.pctEntero === 0 ? "menos de 1 %" : `${mirada.pctEntero} %`].filter(Boolean).join(" · ") : "hoy"}</span>
            </div>
          </div>
          <div className="din-leyenda-caja">
            <ul className="din-leyenda" role="list" data-hay-activa={activa !== null ? "" : undefined} onMouseLeave={() => setActiva(null)}>
              {reparto.porciones.map((p) => (
                <li
                  key={p.id}
                  data-activa={activa === p.id ? "" : undefined}
                  style={{ ["--c" as string]: p.color } as CSSProperties}
                  onMouseEnter={() => setActiva(p.id)}
                >
                  <i aria-hidden="true" />
                  <span className="din-leyenda-nombre">
                    {p.titulo}
                    {p.lugar && <small>{p.lugar}</small>}
                  </span>
                  <b className="din-leyenda-monto">{montoConSigno(p.monto)}</b>
                  <span className="din-leyenda-pct">{p.pctEntero === 0 ? "<1 %" : `${p.pctEntero} %`}</span>
                </li>
              ))}
              {reparto.porciones.length === 0 && (
                <li className="din-leyenda-vacia">
                  <span>Ninguna cuenta tiene saldo hoy.</span>
                </li>
              )}
              {reparto.aparte.map((a) => (
                <li key={a.id} className="din-leyenda-aparte">
                  <i aria-hidden="true" />
                  <span className="din-leyenda-nombre">
                    {a.titulo}
                    <small>{a.lugar ? `${a.lugar} · ` : ""}Tiene saldo negativo: no entra al círculo</small>
                  </span>
                  <b className="din-leyenda-monto">{montoConSigno(a.monto)}</b>
                  <span className="din-leyenda-pct" aria-hidden="true" />
                </li>
              ))}
              {reparto.aparte.length > 0 && (
                <li className="din-leyenda-total">
                  <span className="din-leyenda-nombre">Tienes hoy</span>
                  <b className="din-leyenda-monto">{montoConSigno(reparto.neto)}</b>
                </li>
              )}
            </ul>
            {reparto.ocultos && <p className="din-reparto-nota">No cuenta el cajón abierto: lo ve quien cierra la caja.</p>}
          </div>
        </div>
      </Superficie>
    </section>
  );
}
