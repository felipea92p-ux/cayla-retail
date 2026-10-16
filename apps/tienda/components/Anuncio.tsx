"use client";

import { useEffect, useState } from "react";
import { CADA_MS, estadoDeFrase } from "@/lib/anuncio";
import "@/app/estilos/anuncio.css";

/**
 * La franja oscura de arriba: cambia de frase cada 4,5 s; la que sale sube y se apaga mientras la nueva entra. Todas las frases viven
 * apiladas en el mismo lugar, así que la franja toma el alto de la más larga: en un celular angosto ninguna se corta con «…» (antes, a
 * 320 px, la de la campaña perdía su fecha) y la franja no salta al cambiar. Se queda quieta con el mouse encima (para leerla con calma),
 * mientras la pestaña no está a la vista y, con «reducir movimiento», en la primera. Un lector de pantalla lee la frase a la vista, sin
 * que se le anuncie cada cambio.
 */
export function Anuncio({ frases }: { frases: string[] }) {
  const [vuelta, setVuelta] = useState(0);
  const [quieta, setQuieta] = useState(false);
  useEffect(() => {
    if (frases.length < 2 || quieta || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let reloj: ReturnType<typeof setInterval> | undefined;
    // Con la pestaña escondida no corre: al volver, sigue desde donde se quedó (y no gasta batería mientras tanto).
    const andar = () => {
      clearInterval(reloj);
      reloj = document.hidden ? undefined : setInterval(() => setVuelta((n) => n + 1), CADA_MS);
    };
    andar();
    document.addEventListener("visibilitychange", andar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", andar);
    };
  }, [frases.length, quieta]);
  return (
    <div
      className="t-anuncio t-anuncio-pila"
      // Solo el mouse la detiene: en el celular un toque no debe dejarla quieta para siempre.
      onPointerEnter={(e) => e.pointerType === "mouse" && setQuieta(true)}
      onPointerLeave={() => setQuieta(false)}
    >
      {frases.map((frase, i) => {
        const estado = estadoDeFrase(i, vuelta, frases.length);
        return (
          <span key={i} className="t-anuncio-frase" data-estado={estado ?? undefined} aria-hidden={estado === "fija" || estado === "entra" ? undefined : true}>
            {frase}
          </span>
        );
      })}
    </div>
  );
}
