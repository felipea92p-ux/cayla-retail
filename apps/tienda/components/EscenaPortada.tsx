"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Icono } from "@/components/Icono";
import { escalaDePrenda, ordenDeLaEscena, topeDeCategoria } from "@/lib/escena-portada";
import type { GrupoDePortada } from "@/lib/portada-l";
import { urlDeRecorte } from "@/lib/recorte";

const SEGUNDOS_POR_GRUPO = 6;

/** Si el recorte no está, la foto original: nunca un hueco. */
function alFallar(e: SyntheticEvent<HTMLImageElement>) {
  const i = e.currentTarget;
  if (i.dataset.original && i.src !== i.dataset.original) i.src = i.dataset.original;
}

/** Con la foto cargada se conoce su forma: la prenda toma su tamaño, sin deformarse. */
function alCargar(e: SyntheticEvent<HTMLImageElement>) {
  const i = e.currentTarget;
  if (i.naturalWidth > 0) i.style.setProperty("--esc", String(escalaDePrenda(i.dataset.categoria ?? null, i.naturalWidth / i.naturalHeight)));
}

/**
 * La portada del rediseño (ADR-0615): el título y el botón, y tres prendas reales recién llegadas sobre sus pedestales, que rotan por grupos.
 * Para quien no tiene el rediseño encendido no se ve (`dn-solo`) y no rota: sus fotos son perezosas y dentro de un `display: none` no se piden.
 */
export function EscenaPortada({ grupos, hrefNuevo }: { grupos: GrupoDePortada[]; hrefNuevo: string }) {
  const [grupo, setGrupo] = useState(0);
  const [cambiando, setCambiando] = useState(false);
  const pausa = useRef(false);

  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (grupos.length < 2 || quieto || document.documentElement.dataset.diseno !== "nuevo") return;
    let espera = 0;
    const reloj = window.setInterval(() => {
      if (document.hidden || pausa.current) return;
      setCambiando(true);
      espera = window.setTimeout(() => {
        setGrupo((g) => (g + 1) % grupos.length);
        setCambiando(false);
      }, 420);
    }, SEGUNDOS_POR_GRUPO * 1000);
    return () => {
      window.clearInterval(reloj);
      window.clearTimeout(espera);
    };
  }, [grupos.length]);

  const actual = grupos[grupo % grupos.length];
  if (!actual) return null;
  return (
    <section className="dn-heroe dn-solo" aria-labelledby="dn-lo-nuevo">
      <div className="dn-heroe-rejilla">
        <div className="dn-heroe-texto">
          <span className="dn-ceja">New in · CAYLA</span>
          <h1 id="dn-lo-nuevo">Lo nuevo</h1>
          <p className="dn-heroe-bajada">Prendas que inspiran tu estilo.</p>
          <Link className="t-btn" href={hrefNuevo}>
            Descubrir novedades <Icono nombre="flecha" />
          </Link>
          {grupos.length > 1 && (
            <div className="dn-puntos">
              {grupos.map((_, i) => (
                <button key={i} type="button" aria-label={`Ver el grupo ${i + 1}`} aria-current={i === grupo ? "true" : undefined} onClick={() => setGrupo(i)} />
              ))}
            </div>
          )}
        </div>
        <div className="dn-escena" data-cambiando={cambiando ? "" : undefined} onMouseEnter={() => (pausa.current = true)} onMouseLeave={() => (pausa.current = false)}>
          <div className="dn-arco" />
          <div className="dn-podios">
            {ordenDeLaEscena(actual.prendas).map((p, i) => (
              <Link key={p.id} className={`dn-podio${i === 1 ? " alto" : ""}`} href={p.href} aria-label={`${p.nombre}, ${p.precio}`}>
                <img className="dn-base" src={`/escenario/pedestal-${i === 1 ? "alto" : "bajo"}.webp`} alt="" width={760} height={i === 1 ? 351 : 268} loading="lazy" />
                <span className="dn-contacto" />
                {i !== 1 && (
                  <img className="dn-flor" data-lado={i === 0 ? "izq" : "der"} src={`/escenario/flor-${i === 0 ? "izquierda" : "derecha"}.webp`} alt="" width={420} height={420} loading="lazy" />
                )}
                <img
                  className="dn-prenda"
                  src={urlDeRecorte(p.foto, 640) ?? p.foto}
                  data-original={p.foto}
                  data-categoria={p.categoria ?? undefined}
                  alt={p.nombre}
                  loading="lazy"
                  style={{ "--esc": topeDeCategoria(p.categoria) } as React.CSSProperties}
                  onError={alFallar}
                  onLoad={alCargar}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
