"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { dondeDelGrupo, type GrupoDePortada, type PrendaDePortada } from "@/lib/portada-l";
import { urlDeRecorte } from "@/lib/recorte";
import { Icono } from "./Icono";
import "@/app/estilos/portada-l.css";

/** Una foto vacía: en el tamaño que no le toca, el navegador no descarga la de verdad. */
const VACIO = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** La prenda sin fondo; si el recorte no está (una prenda blanca, una falla), la foto tal cual. */
function Prenda({ prenda, ancho, ocultaEn, primera }: { prenda: PrendaDePortada; ancho: 640 | 1000; ocultaEn: string; primera: boolean }) {
  const alFallar = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.original) return;
    img.dataset.original = "1";
    img.parentElement?.querySelector("source")?.remove();
    img.src = prenda.foto;
  };
  return (
    <picture>
      <source media={ocultaEn} srcSet={VACIO} />
      {/* eslint-disable-next-line @next/next/no-img-element -- ya viene liviana y guardada: pasarla por el optimizador le quitaría la transparencia que importa */}
      <img src={urlDeRecorte(prenda.foto, ancho) ?? prenda.foto} alt="" loading={primera ? "eager" : "lazy"} fetchPriority={primera ? "high" : "auto"} onError={alFallar} />
    </picture>
  );
}

/**
 * La portada de la tienda (ADR-0613). En el celular, una prenda grande por pantalla que se desliza con el dedo y no cambia sola (una prenda que
 * cambia justo al tocarla lleva a otra). La parte de la computadora llega en la siguiente actividad.
 */
export function PortadaTresPaneles({ grupos, hrefArmar }: { grupos: GrupoDePortada[]; hrefArmar: string }) {
  const [actual, setActual] = useState(0);
  const fila = useRef<HTMLDivElement>(null);
  const todas = grupos.flatMap((g) => g.prendas);
  const porGrupo = grupos[0]?.prendas.length ?? 3;
  const grupoActual = grupos[Math.floor(actual / porGrupo)] ?? grupos[0];

  useEffect(() => {
    const caja = fila.current;
    if (!caja) return;
    let cuadro = 0;
    const leer = () => {
      const ancho = caja.firstElementChild?.getBoundingClientRect().width ?? 0;
      if (ancho > 0) setActual(Math.min(caja.children.length - 1, Math.round(caja.scrollLeft / ancho)));
    };
    const alMover = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(leer);
    };
    caja.addEventListener("scroll", alMover, { passive: true });
    return () => {
      caja.removeEventListener("scroll", alMover);
      cancelAnimationFrame(cuadro);
    };
  }, []);

  const irAlGrupo = (i: number) => {
    const caja = fila.current;
    const ancho = caja?.firstElementChild?.getBoundingClientRect().width ?? 0;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    caja?.scrollTo({ left: i * porGrupo * ancho, behavior: quieto ? "auto" : "smooth" });
  };

  return (
    <section className="pl" aria-label="Lo nuevo">
      <h1 className="pl-oculto">Lo nuevo</h1>
      <div className="pl-cel">
        <div className="pl-fila" ref={fila} tabIndex={0} aria-label="Prendas nuevas: desliza para ver más">
          {todas.map((p, i) => (
            <Link className="pl-s" key={`${p.id}-${i}`} href={p.href} style={{ "--f": p.fondo, "--t": p.texto } as React.CSSProperties}>
              <span className="pl-s-t" aria-hidden="true">
                Lo nuevo
              </span>
              <span className="pl-s-g">
                <Prenda prenda={p} ancho={640} ocultaEn="(min-width: 960px)" primera={i < 2} />
              </span>
              <span className="pl-s-tx">
                <b>{p.nombre}</b>
                <small>{p.precio}</small>
              </span>
            </Link>
          ))}
        </div>
        <div className="pl-bar">
          {grupos.length > 1 && (
            <div className="pl-marcas">
              {grupos.map((g, a) => (
                <button key={a} type="button" aria-label={`Ver el grupo ${a + 1} de ${grupos.length}`} onClick={() => irAlGrupo(a)}>
                  {g.prendas.map((_, b) => (
                    <i key={b} data-on={a * porGrupo + b === actual || undefined} />
                  ))}
                </button>
              ))}
            </div>
          )}
          <div className="pl-tot">
            {grupoActual?.total ? (
              <>
                <b>{grupoActual.total}</b>
                <small>{dondeDelGrupo(grupoActual)}</small>
              </>
            ) : (
              <small>Lo último que llegó</small>
            )}
          </div>
          <Link className="pl-btn" href={hrefArmar}>
            <Icono nombre="percha" />
            Arma tu outfit
          </Link>
        </div>
      </div>
    </section>
  );
}
