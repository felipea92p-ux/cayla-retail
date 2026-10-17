"use client";

import { useRef, useState } from "react";
import {
  achicar,
  cajaDe,
  cajaVecina,
  CAPA,
  colorDeLaPieza,
  colorPara,
  enAlto,
  enAncho,
  escalaDe,
  GIRO,
  NOMBRE_ZONA,
  presentes,
  puntoDe,
  vecinaDe,
  vecinasDe,
  ESCENA,
  type Caja,
  type Look,
  type PrendaDelProbador,
  type Zona,
} from "@/lib/probador";
import { Icono } from "../Icono";
import { Recorte } from "./Recorte";

export type TipoDeEntrada = "der" | "izq" | "asoma" | "tinte";
/** Cómo entró la última prenda de una zona; `vuelta` cambia en cada cambio para que la animación vuelva a empezar. */
export type Entrada = { tipo: TipoDeEntrada; vuelta: number };

/** Cuánto espera cada zona cuando asoman varias a la vez (Sorpréndeme): de arriba abajo, como se viste una persona. */
const ESPERA: Record<Zona, number> = { vestido: 0, arriba: 0, abajo: 70, encima: 140, bolso: 210 };
/** Lo que hay que deslizar para que cambie la prenda (px), y lo que se mueve antes de que cuente como deslizar. */
const UMBRAL_DEL_GESTO = 48;
const UMBRAL_DEL_ARRASTRE = 8;

/** Qué tan ancha se ve una caja del lienzo en la pantalla (el `sizes` del recorte). */
const tamanoDe = (c: Caja) => `(min-width: 440px) ${Math.round((c.w / ESCENA.ancho) * 440)}px, ${Math.round((c.w / ESCENA.ancho) * 100)}vw`;

/**
 * La figura del probador (lienzo v3, `V3Probador`): cada prenda puesta a escala desde su línea, la elegida un poco más grande y con su
 * sombra, las que siguen asomando a los lados, el número de cada una (con su candado si está fija), las flechas y «Sorpréndeme». Se
 * desliza con el dedo (o el mouse) sobre la prenda que se quiere cambiar; con el teclado, las flechas ← → sobre la prenda.
 */
export function Figura({
  look,
  indice,
  prendas,
  recordados,
  zona,
  fijos,
  entradas,
  numero,
  onElegir,
  onMover,
  onSorprender,
}: {
  look: Look;
  indice: ReadonlyMap<string, PrendaDelProbador>;
  prendas: readonly PrendaDelProbador[];
  recordados: Readonly<Record<string, string>>;
  zona: Zona;
  fijos: Readonly<Partial<Record<Zona, boolean>>>;
  entradas: Readonly<Partial<Record<Zona, Entrada>>>;
  numero: Readonly<Partial<Record<Zona, number>>>;
  onElegir: (zona: Zona) => void;
  onMover: (zona: Zona, d: 1 | -1) => void;
  onSorprender: () => void;
}) {
  const gesto = useRef<{ x0: number; zona: Zona; movio: boolean; puntero: number } | null>(null);
  const tocada = useRef<Zona | null>(null);
  const ignorarClic = useRef(false);
  const [arrastre, setArrastre] = useState<{ zona: Zona; dx: number } | null>(null);

  const piezas = presentes(look).flatMap((z) => {
    const pieza = look[z]!;
    const p = indice.get(pieza.id);
    if (!p) return [];
    const c = colorDeLaPieza(p, pieza);
    return [{ z, p, c, caja: cajaDe(z, p.largo, c.foto.proporcion) }];
  });
  // Si lo más largo no cabe, toda la figura se achica igual (las prendas siguen a escala entre ellas).
  const k = escalaDe(piezas.map((x) => x.caja));
  const dibujadas = piezas.map((x) => ({ ...x, caja: achicar(x.caja, k) }));
  const elegida = dibujadas.find((x) => x.z === zona) ?? null;
  const vecinas =
    elegida && zona !== "bolso"
      ? vecinasDe(prendas, zona, elegida.p.id).map(({ lado, prenda }) => {
          const c = colorPara(prenda, recordados);
          return { lado, prenda, c, caja: achicar(cajaVecina(cajaDe(zona, prenda.largo, c.foto.proporcion), lado), k) };
        })
      : [];
  const hayFlechas = elegida !== null && vecinaDe(prendas, zona, elegida.p.id, 1) !== null;
  const piso = Math.max(0, ...dibujadas.map((x) => x.caja.y + x.caja.h)) - 10;

  function inicio(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const z = tocada.current ?? zona;
    tocada.current = null;
    gesto.current = { x0: e.clientX, zona: z, movio: false, puntero: e.pointerId };
  }
  function mueve(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    if (!g || e.pointerId !== g.puntero) return;
    const dx = e.clientX - g.x0;
    if (!g.movio) {
      if (Math.abs(dx) < UMBRAL_DEL_ARRASTRE) return;
      g.movio = true;
      // Recién al arrastrar se captura el puntero: un toque corto sigue siendo el clic de la prenda.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura, el gesto igual se suelta con pointerup o pointercancel.
      }
    }
    setArrastre({ zona: g.zona, dx });
  }
  function fin(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    gesto.current = null;
    if (!g || !g.movio) return;
    // El clic que llega después de soltar no cuenta: fue un deslizar.
    ignorarClic.current = true;
    window.setTimeout(() => (ignorarClic.current = false), 0);
    const dx = e.clientX - g.x0;
    setArrastre(null);
    onElegir(g.zona);
    if (Math.abs(dx) > UMBRAL_DEL_GESTO) onMover(g.zona, dx < 0 ? 1 : -1);
  }
  function cancela() {
    gesto.current = null;
    setArrastre(null);
  }
  function clic(z: Zona) {
    if (ignorarClic.current) {
      ignorarClic.current = false;
      return;
    }
    onElegir(z);
  }

  return (
    <div
      className="pb-escena"
      role="group"
      aria-label="Tu probador: toca una prenda y desliza para cambiarla"
      onPointerDown={inicio}
      onPointerMove={mueve}
      onPointerUp={fin}
      onPointerCancel={cancela}
    >
      <div className="pb-arco" aria-hidden="true">
        <span className="pb-arco-filo" />
        <span className="pb-piso" style={{ top: enAlto(piso) }} />
      </div>

      {vecinas.map((v) => (
        <span
          key={`${v.lado}-${v.prenda.id}`}
          className="pb-vecina"
          aria-hidden="true"
          style={{ left: enAncho(v.caja.x), top: enAlto(v.caja.y), width: enAncho(v.caja.w), height: enAlto(v.caja.h) }}
        >
          <Recorte foto={v.c.foto} tamanos={tamanoDe(v.caja)} />
        </span>
      ))}

      {dibujadas.map(({ z, p, c, caja }) => {
        const activa = z === zona;
        const dx = arrastre?.zona === z ? arrastre.dx : 0;
        const entrada = entradas[z];
        const clase = entrada ? `pb-entra-${entrada.tipo}-${entrada.vuelta % 2 ? "a" : "b"}` : "";
        return (
          <button
            key={z}
            type="button"
            className="pb-pieza"
            data-activa={activa ? "" : undefined}
            aria-pressed={activa}
            aria-label={`${numero[z]}. ${NOMBRE_ZONA[z]}: ${p.nombre}, ${c.nombre}. ${activa ? "Desliza para cambiarla" : "Tócala para cambiarla"}`}
            style={{
              left: enAncho(caja.x),
              top: enAlto(caja.y),
              width: enAncho(caja.w),
              height: enAlto(caja.h),
              zIndex: z === "arriba" && p.metida ? 1 : CAPA[z],
            }}
            onPointerDown={() => (tocada.current = z)}
            onClick={() => clic(z)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                onMover(z, e.key === "ArrowRight" ? 1 : -1);
              }
            }}
          >
            <span
              className="pb-pieza-arrastre"
              data-arrastrando={dx !== 0 ? "" : undefined}
              style={dx !== 0 ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.45, 1 - Math.abs(dx) / 320) } : undefined}
            >
              <span className="pb-pieza-giro" style={{ transform: `rotate(${GIRO[z]}deg) scale(${activa ? 1.03 : 1})` }}>
                <span className={`pb-pieza-foto ${clase}`} style={entrada?.tipo === "asoma" ? { animationDelay: `${ESPERA[z]}ms` } : undefined}>
                  <Recorte foto={c.foto} tamanos={tamanoDe(caja)} pronto />
                </span>
              </span>
            </span>
          </button>
        );
      })}

      {dibujadas.map(({ z, caja }) => {
        const punto = puntoDe(z, caja);
        return (
          <span key={`punto-${z}`} className="pb-punto" data-activo={z === zona ? "" : undefined} aria-hidden="true" style={{ left: enAncho(punto.x), top: enAlto(punto.y) }}>
            {fijos[z] ? <Icono nombre="candado" /> : numero[z]}
          </span>
        );
      })}

      {hayFlechas && elegida && (
        <>
          <button
            type="button"
            className="pb-flecha pb-flecha-antes"
            aria-label={`Anterior en ${NOMBRE_ZONA[zona]} (ahora: ${elegida.p.nombre})`}
            style={{ top: enAlto(elegida.caja.y + elegida.caja.h / 2 - 20) }}
            onClick={() => onMover(zona, -1)}
          >
            <Icono nombre="izquierda" />
          </button>
          <button
            type="button"
            className="pb-flecha pb-flecha-despues"
            aria-label={`Siguiente en ${NOMBRE_ZONA[zona]} (ahora: ${elegida.p.nombre})`}
            style={{ top: enAlto(elegida.caja.y + elegida.caja.h / 2 - 20) }}
            onClick={() => onMover(zona, 1)}
          >
            <Icono nombre="derecha" />
          </button>
        </>
      )}

      <button type="button" className="pb-sorpresa" aria-label="Sorpréndeme: cambia las prendas y los colores que no fijaste" onClick={onSorprender}>
        <Icono nombre="chispas" />
        Sorpréndeme
      </button>
    </div>
  );
}
