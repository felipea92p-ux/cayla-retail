"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { dondeDelGrupo, fraseDelGrupo, type GrupoDePortada, type PrendaDePortada } from "@/lib/portada-l";
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
      {/* Un <img> común: ya viene liviana y guardada, y el optimizador no la necesita. */}
      <img src={urlDeRecorte(prenda.foto, ancho) ?? prenda.foto} alt="" loading={primera ? "eager" : "lazy"} fetchPriority={primera ? "high" : "auto"} onError={alFallar} />
    </picture>
  );
}

/**
 * La portada de la tienda (ADR-0613). En el celular, una prenda grande por pantalla que se desliza con el dedo y no cambia sola (una prenda que
 * cambia justo al tocarla lleva a otra). En la computadora, tres paneles que cambian de grupo cada 6 segundos: se detienen con el mouse o el
 * foco encima, para siempre al elegir un grupo o con la pausa, y no empiezan si la persona pidió menos movimiento. «Lo nuevo» cruza los tres
 * paneles y se queda quieto aunque uno crezca: cada panel solo muestra su tramo, con su color.
 */
export function PortadaTresPaneles({ grupos, hrefArmar, hrefNuevo }: { grupos: GrupoDePortada[]; hrefArmar: string; hrefNuevo: string }) {
  const [actual, setActual] = useState(0);
  const fila = useRef<HTMLDivElement>(null);
  const todas = grupos.flatMap((g) => g.prendas);
  const porGrupo = grupos[0]?.prendas.length ?? 3;
  const grupoActual = grupos[Math.floor(actual / porGrupo)] ?? grupos[0];

  const [grupo, setGrupo] = useState(0);
  const [parado, setParado] = useState(false);
  const [encima, setEncima] = useState(false);
  const paneles = useRef<HTMLDivElement>(null);
  const delPanel = grupos[grupo] ?? grupos[0];

  // Cambia de grupo solo en la computadora, y nunca con la persona encima.
  useEffect(() => {
    if (parado || encima || grupos.length < 2) return;
    if (!window.matchMedia("(min-width: 960px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const reloj = setTimeout(() => setGrupo((g) => (g + 1) % grupos.length), 6000);
    return () => clearTimeout(reloj);
  }, [grupo, parado, encima, grupos.length]);

  // El título se mide contra los tres paneles juntos: así no se mueve cuando uno crece.
  useEffect(() => {
    const caja = paneles.current;
    if (!caja) return;
    const lista = [...caja.querySelectorAll<HTMLElement>(".pl-p")];
    const ajustar = () => {
      const r = caja.getBoundingClientRect();
      for (const p of lista) {
        const t = p.querySelector<HTMLElement>(".pl-t");
        if (!t) continue;
        t.style.left = `${r.left - p.getBoundingClientRect().left}px`;
        t.style.width = `${r.width}px`;
      }
    };
    ajustar();
    const vigia = new ResizeObserver(ajustar);
    lista.forEach((p) => vigia.observe(p));
    vigia.observe(caja);
    return () => vigia.disconnect();
  }, []);

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
      <div className="pl-pc" onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)} onFocus={() => setEncima(true)} onBlur={() => setEncima(false)}>
        <div className="pl-tri" ref={paneles}>
          {delPanel.prendas.map((p, n) => (
            <Link className="pl-p" key={n} href={p.href} aria-label={p.nombre} style={{ "--n": n, "--f": p.fondo, "--t": p.texto } as React.CSSProperties}>
              <span className="pl-t" aria-hidden="true">
                Lo nuevo
              </span>
              {grupos.map((g, k) => (
                <span className="pl-im" key={k} data-on={k === grupo || undefined}>
                  <Prenda prenda={g.prendas[n]} ancho={1000} ocultaEn="(max-width: 959.98px)" primera={k === 0} />
                </span>
              ))}
              <span className="pl-p-tx">
                <b>{p.nombre}</b>
                <small>{p.precio}</small>
              </span>
            </Link>
          ))}
        </div>
        <div className="pl-bar-pc">
          <div className="pl-bar-iz">
            {grupos.length > 1 && (
              <div className="pl-rayas">
                {grupos.map((_, k) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={`Ver el grupo ${k + 1} de ${grupos.length}`}
                    aria-current={k === grupo || undefined}
                    onClick={() => {
                      setParado(true);
                      setGrupo(k);
                    }}
                  />
                ))}
                <button className="pl-pausa" type="button" aria-label={parado ? "Reanudar el cambio de prendas" : "Pausar el cambio de prendas"} onClick={() => setParado((v) => !v)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={parado ? "M7 5l12 7-12 7z" : "M8 5v14M16 5v14"} />
                  </svg>
                </button>
              </div>
            )}
            <span className="pl-frase">
              {fraseDelGrupo(delPanel)}
              {delPanel.total && (
                <>
                  {" "}
                  <b>{delPanel.total}</b> el outfit.
                </>
              )}
            </span>
          </div>
          <div className="pl-bar-de">
            <Link className="pl-ver" href={hrefNuevo}>
              Ver todo lo nuevo
            </Link>
            <Link className="pl-btn" href={hrefArmar}>
              <Icono nombre="percha" />
              Arma tu outfit
            </Link>
          </div>
        </div>
      </div>
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
