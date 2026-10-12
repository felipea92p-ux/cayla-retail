"use client";

import type { CSSProperties } from "react";
import { puntosDeAvance, type PasoDeAvance } from "@/lib/puntos-avance";

// Los 4 puntos de avance de Nuevo producto (Felipe, 2026-10-06; ADR-0260, actualización del 2026-10-06). Van arriba de los pasos,
// pegados bajo la cabecera mientras se baja, y de borde a borde del formulario: el primero alineado a la izquierda, el último a la
// derecha. Debajo de cada punto, su nombre y su estado. El punto del paso abierto late todo el tiempo: es una excepción a
// «nunca en bucle» (ADR-0136, actualización del 2026-10-06), y con movimiento reducido se queda quieto. Los estilos, en
// `app/estilos/puntos-avance.css`; qué es cada punto, en `lib/puntos-avance.ts`.

export type PasoConNombre = PasoDeAvance & {
  /** «Tallas y colores». */
  nombre: string;
  /** El nombre en el celular, donde los cuatro tienen que caber: «Tallas». */
  nombreCorto: string;
  /** Lo contestado en ese paso («Indumentaria › Camisas y Blusas»), o lo que le falta: sale al dejar el mouse encima. */
  detalle: string;
};

export function PuntosAvance({ pasos, onAbrir }: { pasos: PasoConNombre[]; onAbrir: (numero: number) => void }) {
  const { puntos, lleno } = puntosDeAvance(pasos);
  return (
    <nav aria-label="Avance del producto" data-puntos-avance className="puntos-avance">
      <div className="puntos-linea">
        <span aria-hidden className="puntos-pista" />
        <span aria-hidden className="puntos-relleno" style={{ "--lleno": lleno } as CSSProperties}>
          <span className="puntos-chispa" data-visible={lleno > 0 && lleno < 1} />
        </span>
        <ol className="puntos-lista">
          {puntos.map((p, i) => {
            const paso = pasos[i];
            const extremo = i === 0 ? "inicio" : i === puntos.length - 1 ? "fin" : "medio";
            const contenido = (
              <>
                <span aria-hidden className="puntos-marca">
                  {p.tipo === "aqui" && (
                    <>
                      <span className="puntos-halo" />
                      <span className="puntos-halo puntos-halo-2" />
                    </>
                  )}
                  <span className="puntos-punto" data-tipo={p.tipo}>
                    {p.tipo === "hecho" && (
                      <svg className="puntos-tilde" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                    {p.tipo === "aqui" && <span className="puntos-nucleo" />}
                  </span>
                </span>
                <span className="puntos-nombre">
                  <span className="sm:hidden">{paso.nombreCorto}</span>
                  <span className="hidden sm:inline">{paso.nombre}</span>
                </span>
                <span className="puntos-rotulo">{p.rotulo}</span>
              </>
            );
            return (
              <li key={p.numero} className="puntos-paso" data-tipo={p.tipo} data-extremo={extremo} style={{ "--pos": p.posicion } as CSSProperties}>
                {p.tocable ? (
                  <button
                    type="button"
                    onClick={() => onAbrir(p.numero)}
                    title={paso.detalle || undefined}
                    aria-label={`${paso.nombre}: ${p.rotulo ? p.rotulo.toLocaleLowerCase("es") : "por hacer"}. ${paso.detalle ? `${paso.detalle}. ` : ""}Toca para ir a ese paso.`}
                    className="puntos-cuerpo puntos-tocable"
                  >
                    {contenido}
                  </button>
                ) : (
                  <span className="puntos-cuerpo" aria-current={p.tipo === "aqui" ? "step" : undefined} title={paso.detalle || undefined}>
                    {contenido}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
