"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { partirTituloLegal, seccionQueSeLee, type SeccionLegal } from "@/lib/ayuda";
import { Icono } from "../Icono";

/** La línea de lectura: un punto se enciende cuando su título sube hasta el primer tercio de la ventana. */
const LINEA_DE_LECTURA = 0.3;

function Lista({ secciones, actual }: { secciones: readonly SeccionLegal[]; actual?: string | null }) {
  return (
    <ol className="ay-indice-lista">
      {secciones.map((s) => {
        const { numero, texto } = partirTituloLegal(s.titulo);
        return (
          <li key={s.id}>
            <a href={`#${s.id}`} aria-current={actual === s.id ? "location" : undefined}>
              <span className="ay-indice-n" aria-hidden="true">
                {numero}
              </span>
              <span>{texto}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * El índice de una lectura larga (Privacidad, Términos del Club; revisión «a nivel mundial», 2026-10-16). En el celular, «En esta
 * página» se abre arriba y lleva a cada punto. En la computadora va fijo al costado y enciende el punto que se está leyendo
 * (`seccionQueSeLee`), así se sabe dónde se está en un texto largo. Sin JavaScript, son enlaces y funcionan igual. Los títulos son los
 * del texto, letra por letra (`partirTituloLegal` solo separa el número). `otra`: la otra lectura (de la privacidad a los términos y al
 * revés).
 */
export function IndiceLegal({ secciones, otra }: { secciones: readonly SeccionLegal[]; otra?: { href: string; texto: string } }) {
  const [actual, setActual] = useState<string | null>(secciones[0]?.id ?? null);

  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const bordes = secciones.flatMap((s) => {
        const el = document.getElementById(s.id);
        return el ? [{ id: s.id, arriba: el.getBoundingClientRect().top }] : [];
      });
      const raiz = document.documentElement;
      const alFinal = window.scrollY > 0 && window.innerHeight + window.scrollY >= raiz.scrollHeight - 4;
      setActual(seccionQueSeLee(bordes, window.innerHeight * LINEA_DE_LECTURA, alFinal));
    };
    // Una medida por cuadro, aunque el scroll avise muchas veces.
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, [secciones]);

  return (
    <aside className="ay-indice">
      <details className="ay-indice-movil">
        <summary>
          En esta página <span className="ay-indice-cuantos">{secciones.length} puntos</span>
          <Icono nombre="chevron" />
        </summary>
        <Lista secciones={secciones} />
      </details>
      <nav className="ay-indice-fijo" aria-label="En esta página">
        <p className="ay-indice-t">En esta página</p>
        <Lista secciones={secciones} actual={actual} />
        {otra && (
          <Link className="ay-enlace ay-indice-otra" href={otra.href}>
            {otra.texto} <Icono nombre="flecha" />
          </Link>
        )}
      </nav>
    </aside>
  );
}
