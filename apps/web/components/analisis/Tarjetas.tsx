"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Ayuda, COLOR_ESTADO, Cuenta, type Estado } from "@/components/analisis/piezas";

// Análisis, cara B «Una respuesta por pregunta» (ADR-0357, act. 2026-11-21): las dos piezas que comparten las pestañas, compuestas aquí
// porque no hay una pieza decidida que las cubra (ficha al milímetro `docs/milimetro/analisis-b.md`, §1: `TarjetaCifra` llega a 28 px y
// no admite controles; la tarjeta Vitrina es de Existencias). Si otra pantalla las pide, van a `/unificar`. Estilos: `analisis-b.css`.

/**
 * La respuesta de la pestaña: la cifra grande («5 modelos»), su frase («cómpralos ya: se acaban en 2 semanas o menos») y sus acciones. Con `cuenta`,
 * el número cuenta de 0 a su valor al entrar (una vez; con las animaciones apagadas sale quieto). `est` pone el color de la cifra.
 */
export function Respuesta({
  est,
  cifra,
  cuenta,
  frase,
  ayuda,
  acciones,
  i = 3,
  guia,
}: {
  est: Estado;
  /** La cifra escrita («5 modelos», «S/ 2,280»); si viene `cuenta`, el número va antes de `cifra` y cuenta. */
  cifra: string;
  cuenta?: number;
  frase: ReactNode;
  /** Lo que explica cómo se cuenta: detrás del «?» (poco texto a la vista). */
  ayuda?: string;
  acciones?: ReactNode;
  /** Su lugar en la cascada de la vista. */
  i?: number;
  guia?: string;
}) {
  return (
    <section className="an-resp entra" style={{ ["--i" as string]: i, ["--c" as string]: COLOR_ESTADO[est] }} data-guia={guia}>
      <p className="an-resp-txt">
        <b className="an-resp-cifra">
          {cuenta !== undefined && (
            <>
              <Cuenta valor={cuenta} />{" "}
            </>
          )}
          {cifra}
        </b>
        <span className="texto-bajada inline-flex items-center gap-2">
          {frase}
          {ayuda && <Ayuda texto={ayuda} />}
        </span>
      </p>
      {acciones && <div className="an-resp-acc">{acciones}</div>}
    </section>
  );
}

/** La rejilla de tarjetas: columnas de 250 px o más, 16 px entre ellas. */
export function Tarjetas({ children, guia }: { children: ReactNode; guia?: string }) {
  return (
    <div className="an-tarjetas" data-guia={guia}>
      {children}
    </div>
  );
}

/**
 * Una cifra de la tarjeta con su rótulo arriba («TIENES» 72, «VENDES» 39 /sem., «SE ACABA» 7 dic.): `agregado` va chico tras el valor y `est`
 * le pone el color de su estado (Felipe 2026-11-24, cara «A» de `docs/maquetas/analisis-pedir-sin-comprar-2026-11/tarjeta.html`).
 */
export type CifraTarjeta = { rotulo: string; valor: string; agregado?: string; est?: Estado };

/**
 * Un modelo en su tarjeta: la miniatura, su nombre, qué tiene, el número que dice por qué está aquí y su unidad, y al pie una línea de
 * detalle y sus acciones. Con `cifras` («Qué pedir»), en vez del número y el pie, una fila de cifras con su rótulo arriba, siempre en el
 * mismo lugar para comparar una tarjeta con otra de un vistazo, y `marca` (una etiqueta bajo «qué tiene»: la otra tienda o lo que viene). Toda la tarjeta abre la ficha, con la conducta de la tarjeta Vitrina (ADR-0128): `<article tabIndex={0}>` sin
 * `role` (un `role="button"` haría mudos a los botones de adentro), el clic que nace en un botón o un enlace hace lo suyo, y el que no nació
 * en su DOM (un modal abierto desde ella) se ignora.
 */
export function TarjetaPrenda({
  miniatura,
  nombre,
  que,
  marca,
  numero,
  unidad,
  cifras,
  est,
  detalle,
  acciones,
  etiqueta,
  onAbrir,
  i = 4,
}: {
  miniatura: ReactNode;
  nombre: string;
  /** Color y tallas («Rubí · S a L»), o lo que vendió y tiene un tipo. */
  que: string;
  /** Una etiqueta bajo «qué tiene» («Lima tiene 17», «Llegan 12 el 6 dic.»). */
  marca?: ReactNode;
  /** El número grande; sin él (con `cifras`), no se dibuja. */
  numero?: string;
  unidad?: string;
  /** Las cifras con su rótulo, en una fila a lo ancho que baja de renglón si no caben. */
  cifras?: readonly CifraTarjeta[];
  est: Estado;
  detalle?: string;
  acciones?: ReactNode;
  /** Lo que oye un lector de pantalla: el nombre, el número y que Enter abre la ficha. */
  etiqueta: string;
  onAbrir: () => void;
  i?: number;
}) {
  const alClic = (e: MouseEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (!e.currentTarget.contains(t) || t.closest("button, a")) return;
    onAbrir();
  };
  const alTeclear = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onAbrir();
    }
  };
  return (
    <article
      tabIndex={0}
      aria-label={etiqueta}
      onClick={alClic}
      onKeyDown={alTeclear}
      className="an-tarj entra"
      style={{ ["--i" as string]: Math.min(i, 8), ["--c" as string]: COLOR_ESTADO[est] }}
    >
      {miniatura}
      <div className="an-tarj-cuerpo">
        {/* El ancla de la guía va en el nombre (un texto, sin botones): tocarlo abre la ficha, como toda la tarjeta. */}
        <p className="an-tarj-nombre" data-guia="analisis.tarjeta">
          {nombre}
        </p>
        <p className="texto-detalle m-0">{que}</p>
        {marca && <div className="mt-2 flex">{marca}</div>}
        {numero !== undefined && (
          <p className="an-tarj-num">
            <b>{numero}</b>
            {unidad && <span>{unidad}</span>}
          </p>
        )}
      </div>
      {cifras && cifras.length > 0 && (
        // Rótulo arriba, valor abajo (sin «·» entre datos). Lo que va en una tarjeta angosta baja de renglón en vez de encimarse.
        <dl className="col-span-full m-0 flex flex-wrap justify-between gap-x-5 gap-y-3 border-t border-[color:var(--hilo-fila)] pt-3">
          {cifras.map((c) => (
            <div key={c.rotulo} className="flex min-w-0 flex-col gap-0.5">
              <dt className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.06em] text-secundario">{c.rotulo}</dt>
              <dd className="m-0 whitespace-nowrap text-lg font-semibold leading-snug tabular-nums" style={c.est ? { color: COLOR_ESTADO[c.est] } : undefined}>
                {c.valor}
                {c.agregado && <span className="text-detalle font-normal text-secundario"> {c.agregado}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(detalle || acciones) && (
        <div className="an-tarj-pie">
          {detalle && <span className="texto-detalle">{detalle}</span>}
          {acciones && <span className="an-tarj-acc">{acciones}</span>}
        </div>
      )}
    </article>
  );
}
