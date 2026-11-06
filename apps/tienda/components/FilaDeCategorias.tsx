"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { hrefLista } from "@/lib/catalogo";
import type { CategoriaConFoto } from "@/lib/portada-l";
import { urlDeRecorte } from "@/lib/recorte";
import "@/app/estilos/fila-categorias.css";

/**
 * La fila de categorías bajo la portada (ADR-0615): una prenda real de cada una, en un círculo con su color. Se desliza si no cabe, y con mouse
 * lleva una flecha a cada lado (Felipe 2026-11-05), que solo se ve si hay más hacia ese lado.
 */
export function FilaDeCategorias({ categorias, sede }: { categorias: CategoriaConFoto[]; sede: string | null }) {
  const fila = useRef<HTMLElement>(null);
  const [hay, setHay] = useState({ izquierda: false, derecha: false });

  useEffect(() => {
    const caja = fila.current;
    if (!caja) return;
    const medir = () => {
      const izquierda = caja.scrollLeft > 2;
      const derecha = caja.scrollLeft + caja.clientWidth < caja.scrollWidth - 2;
      setHay((h) => (h.izquierda === izquierda && h.derecha === derecha ? h : { izquierda, derecha }));
    };
    medir();
    caja.addEventListener("scroll", medir, { passive: true });
    const vigia = new ResizeObserver(medir);
    vigia.observe(caja);
    return () => {
      caja.removeEventListener("scroll", medir);
      vigia.disconnect();
    };
  }, []);

  const mover = (hacia: -1 | 1) => {
    const caja = fila.current;
    if (!caja) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    caja.scrollBy({ left: hacia * caja.clientWidth * 0.8, behavior: quieto ? "auto" : "smooth" });
  };

  if (categorias.length === 0) return null;
  return (
    <div className="pl-cats-marco t-ancho">
      <button className="pl-cats-flecha" data-lado="izquierda" type="button" aria-label="Ver las categorías anteriores" hidden={!hay.izquierda} onClick={() => mover(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <nav className="pl-cats" ref={fila} aria-label="Categorías">
        {categorias.map((c) => (
          <Link className="pl-cat" key={c.clave} href={hrefLista({ sede, categoria: c.clave, orden: "destacado" })} style={{ "--c": c.fondo } as React.CSSProperties}>
            <span>
              <FotoDeCategoria categoria={c} />
            </span>
            {c.nombre}
          </Link>
        ))}
      </nav>
      <button className="pl-cats-flecha" data-lado="derecha" type="button" aria-label="Ver más categorías" hidden={!hay.derecha} onClick={() => mover(1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

/** La prenda recortada de la categoría. Si esa prenda no se puede recortar, prueba con la siguiente, para no dibujar un recuadro; si ninguna se puede, su foto. */
function FotoDeCategoria({ categoria: c }: { categoria: CategoriaConFoto }) {
  const recortes = [c.foto, ...c.alternativas].flatMap((f) => urlDeRecorte(f, 640) ?? []);
  const [intento, setIntento] = useState(0);
  return (
    <Image
      src={recortes[intento] ?? c.foto}
      alt=""
      width={320}
      height={320}
      sizes="(max-width: 639px) 33vw, 180px"
      unoptimized
      onError={() => setIntento((i) => (i < recortes.length ? i + 1 : i))}
    />
  );
}
