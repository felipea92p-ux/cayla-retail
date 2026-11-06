"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { estadoDeFrase, fraseVecina } from "@/lib/anuncio";
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
 * La franja de arriba (ADR-0615): un mensaje a la vez, con una flecha a cada lado. Es manual: nada se mueve mientras se lee. Todos viven apilados en el
 * mismo lugar, así que la franja toma el alto del más largo y las flechas no se corren al cambiar. El lector de pantalla oye el mensaje nuevo porque
 * la persona lo pidió. Con el diseño de una campaña se viste con sus colores, y sus modos «quieta» y «marquesina» siguen como los programó el líder.
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
  const [turno, setTurno] = useState({ actual: mismas(inicio.frases, frases) ? inicio.actual : 0, previa: null as number | null, paso: 1 as 1 | -1 });
  const actual = frases.length > 0 ? turno.actual % frases.length : 0;

  useEffect(() => {
    if (propias.length > 0) ultima = { frases: propias, actual };
  }, [propias, actual]);

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

  const mover = (paso: 1 | -1) => setTurno({ actual: fraseVecina(actual, paso, frases.length), previa: actual, paso });
  const varias = frases.length > 1;
  return (
    <section
      className="t-anuncio t-anuncio-pila"
      aria-label="Lo que te ofrece CAYLA"
      data-campana={diseno?.donde.franja ? diseno.plantilla : undefined}
      style={diseno?.donde.franja ? variablesDelDiseno(diseno) : undefined}
    >
      {varias && (
        <button type="button" className="t-anuncio-flecha" aria-label="Mensaje anterior" onClick={() => mover(-1)}>
          <Icono nombre="izquierda" />
        </button>
      )}
      <div className="t-anuncio-frases" data-paso={turno.paso} aria-live="polite">
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
      {varias && (
        <button type="button" className="t-anuncio-flecha" aria-label="Mensaje siguiente" onClick={() => mover(1)}>
          <Icono nombre="derecha" />
        </button>
      )}
    </section>
  );
}
