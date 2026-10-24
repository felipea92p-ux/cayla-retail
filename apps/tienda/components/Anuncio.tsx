"use client";

import { useEffect, useState } from "react";
import { CADA_MS, estadoDeFrase } from "@/lib/anuncio";
import { variablesDelDiseno, type DisenoDeLaTienda } from "@/lib/diseno-campana";
import "@/app/estilos/anuncio.css";
import "@/app/estilos/campana.css";
import "@/app/estilos/campana-efectos.css";

// Lo que dijo la última franja a la vista y en qué vuelta iba (2026-10-17, Felipe: «cuando cambia de vista es muy abrupto»). Las páginas
// de la bolsa y de la cuenta dibujan su propia franja: sin esto, mientras cargaban la franja quedaba vacía y, al llegar, volvía a la
// primera frase. Ahora la franja de una página que carga (`frases` vacío) dice lo mismo que la de antes, y la que llega sigue en la frase
// que se estaba viendo. Vive en la memoria de esta pestaña: al recargar, empieza por la primera como siempre.
let ultima: { frases: string[]; vuelta: number } | null = null;
const mismas = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((f, i) => f === b[i]);

/**
 * La franja oscura de arriba: cambia de frase cada 4,5 s; la que sale sube y se apaga mientras la nueva entra. Todas las frases viven
 * apiladas en el mismo lugar, así que la franja toma el alto de la más larga: en un celular angosto ninguna se corta con «…» (antes, a
 * 320 px, la de la campaña perdía su fecha) y la franja no salta al cambiar. Se queda quieta con el mouse encima (para leerla con calma),
 * mientras la pestaña no está a la vista y, con «reducir movimiento», en la primera. Un lector de pantalla lee la frase a la vista, sin
 * que se le anuncie cada cambio.
 */
export function Anuncio({ frases: propias, diseno = null }: { frases: string[]; diseno?: DisenoDeLaTienda | null }) {
  // La primera vez que se dibuja (también al hidratar una página recién abierta) no hay nada recordado: lo mismo que mandó el servidor.
  const [inicio] = useState(() => {
    const recordada = ultima;
    if (propias.length === 0 && recordada) return recordada;
    if (recordada && mismas(recordada.frases, propias)) return recordada;
    return { frases: propias, vuelta: 0 };
  });
  // El diseño de la campaña decide cómo corre la franja: «quieta» deja solo la frase de la campaña (la primera), «marquesina» las pasa de lado.
  const modo = diseno?.donde.franja ? diseno.movimiento.franja : "rota";
  const frases = modo === "quieta" ? (propias.length > 0 ? propias : inicio.frases).slice(0, 1) : propias.length > 0 ? propias : inicio.frases;
  const desde = mismas(inicio.frases, frases) ? inicio.vuelta : 0;
  const [vuelta, setVuelta] = useState(desde);
  const [quieta, setQuieta] = useState(false);
  useEffect(() => {
    if (propias.length > 0) ultima = { frases: propias, vuelta };
  }, [propias, vuelta]);
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
  if (modo === "marquesina" && frases.length > 0) {
    // Las frases corren de lado, dos veces seguidas para que el hueco de la vuelta no se note; con «reducir movimiento» queda quieta (campana-efectos.css).
    return (
      <div className="t-anuncio cmp-marquesina" data-campana={diseno?.plantilla} style={diseno ? variablesDelDiseno(diseno) : undefined}>
        <div className="cmp-pista">
          {[0, 1].map((vuelta) =>
            frases.map((frase, i) => (
              <span key={`${vuelta}-${i}`} aria-hidden={vuelta === 1 ? true : undefined}>
                {frase}
              </span>
            )),
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      className="t-anuncio t-anuncio-pila"
      // Con el diseño de una campaña (si el líder dejó la franja encendida), la franja toma sus colores; sin él, la de siempre.
      data-campana={diseno?.donde.franja ? diseno.plantilla : undefined}
      style={diseno?.donde.franja ? variablesDelDiseno(diseno) : undefined}
      // Solo el mouse la detiene: en el celular un toque no debe dejarla quieta para siempre.
      onPointerEnter={(e) => e.pointerType === "mouse" && setQuieta(true)}
      onPointerLeave={() => setQuieta(false)}
    >
      {frases.map((frase, i) => {
        const estado = estadoDeFrase(i, vuelta, frases.length, desde);
        return (
          <span key={i} className="t-anuncio-frase" data-estado={estado ?? undefined} aria-hidden={estado === "fija" || estado === "entra" ? undefined : true}>
            {frase}
          </span>
        );
      })}
    </div>
  );
}
