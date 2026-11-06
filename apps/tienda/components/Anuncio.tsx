"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { estadoDeFrase, fraseSiguiente, MILISEGUNDOS_POR_FRASE } from "@/lib/anuncio";
import { variablesDelDiseno, type DisenoDeLaTienda } from "@/lib/diseno-campana";
import type { FraseAnuncio } from "@/lib/portada";
import { Icono } from "./Icono";
import "@/app/estilos/anuncio.css";
import "@/app/estilos/campana.css";
import "@/app/estilos/campana-efectos.css";

// El mensaje a la vista: las páginas de la bolsa y de la cuenta dibujan su propia franja, y sin esto volvería al primero al cambiar de página
// (Felipe 2026-10-17: «es muy abrupto»). Una página que carga (`frases` vacío) dice lo mismo que la de antes. Vive en la memoria de la pestaña.
let ultima: { frases: FraseAnuncio[]; actual: number } | null = null;
const mismas = (a: readonly FraseAnuncio[], b: readonly FraseAnuncio[]) => a.length === b.length && a.every((f, i) => f.texto === b[i].texto);

/**
 * La franja de arriba (ADR-0615): un mensaje a la vez, que pasan solos (Felipe 2026-11-06). Se detienen con el mouse encima o con el foco en el enlace,
 * para poder leerlo y tocarlo; con «reducir movimiento» se queda el primero. Todos viven apilados en el mismo lugar, así que la franja toma el alto del
 * más largo y nada salta al cambiar. El lector de pantalla no lo anuncia: una voz que interrumpe cada 4 segundos no ayuda a nadie. Con el diseño de una
 * campaña se viste con sus colores, y sus modos «quieta» y «marquesina» siguen como los programó el líder.
 */
export function Anuncio({ frases: propias, diseno = null }: { frases: FraseAnuncio[]; diseno?: DisenoDeLaTienda | null }) {
  const [inicio] = useState(() => {
    const recordada = ultima;
    if (recordada && (propias.length === 0 || mismas(recordada.frases, propias))) return recordada;
    return { frases: propias, actual: 0 };
  });
  const modo = diseno?.donde.franja ? diseno.movimiento.franja : "rota";
  const todas = propias.length > 0 ? propias : inicio.frases;
  const frases = modo === "quieta" ? todas.slice(0, 1) : todas;
  const [turno, setTurno] = useState({ actual: mismas(inicio.frases, frases) ? inicio.actual : 0, previa: null as number | null });
  const actual = frases.length > 0 ? turno.actual % frases.length : 0;
  const cantidad = frases.length;
  const rota = modo === "rota" && cantidad > 1;
  const quieta = useRef({ mouse: false, foco: false });

  useEffect(() => {
    if (propias.length > 0) ultima = { frases: propias, actual };
  }, [propias, actual]);

  useEffect(() => {
    if (!rota || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const reloj = setInterval(() => {
      if (document.hidden || quieta.current.mouse || quieta.current.foco) return;
      setTurno((t) => {
        const ahora = t.actual % cantidad;
        return { actual: fraseSiguiente(ahora, cantidad), previa: ahora };
      });
    }, MILISEGUNDOS_POR_FRASE);
    return () => clearInterval(reloj);
  }, [rota, cantidad]);

  if (modo === "marquesina" && frases.length > 0) {
    // Corren de lado, dos veces seguidas para que el hueco de la vuelta no se note; con «reducir movimiento» queda quieta (campana-efectos.css).
    return (
      <div className="t-anuncio cmp-marquesina" data-campana={diseno?.plantilla} style={diseno ? variablesDelDiseno(diseno) : undefined}>
        <div className="cmp-pista">
          {[0, 1].map((vuelta) =>
            frases.map((frase, i) => (
              <span key={`${vuelta}-${i}`} aria-hidden={vuelta === 1 ? true : undefined}>
                {frase.texto}
              </span>
            )),
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      className="t-anuncio t-anuncio-pila"
      aria-label="Lo que te ofrece CAYLA"
      data-campana={diseno?.donde.franja ? diseno.plantilla : undefined}
      style={diseno?.donde.franja ? variablesDelDiseno(diseno) : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") quieta.current.mouse = true;
      }}
      onPointerLeave={() => {
        quieta.current.mouse = false;
      }}
      onFocus={() => {
        quieta.current.foco = true;
      }}
      onBlur={() => {
        quieta.current.foco = false;
      }}
    >
      <div className="t-anuncio-frases">
        {frases.map((frase, i) => {
          const estado = estadoDeFrase(i, actual, turno.previa);
          const aLaVista = estado === "fija" || estado === "entra";
          const contenido = (
            <>
              <Icono nombre={frase.icono} />
              <span>{frase.texto}</span>
            </>
          );
          return (
            <span key={frase.texto} className="t-anuncio-frase" data-estado={estado ?? undefined} aria-hidden={aLaVista ? undefined : true}>
              {frase.href ? (
                <Link href={frase.href} tabIndex={aLaVista ? undefined : -1}>
                  {contenido}
                </Link>
              ) : (
                <span className="t-anuncio-sin-enlace">{contenido}</span>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}
