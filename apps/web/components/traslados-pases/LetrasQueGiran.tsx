"use client";

import { useEffect, useState } from "react";

// Las letras del código de la sede giran una vez, como en un tablero de aeropuerto, y se quedan quietas (ADR-0354). El HTML del
// servidor ya trae el texto final: el giro solo corre en el navegador, y con «reducir movimiento» no corre.
const MAYUS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MINUS = "abcdefghijklmnopqrstuvwxyz";

export function LetrasQueGiran({ texto, demora = 0 }: { texto: string; demora?: number }) {
  const [mostradas, setMostradas] = useState<string[] | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const letras = [...texto];
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inicio = performance.now() + demora;
    const paso = () => {
      if (!vivo) return;
      const t = performance.now() - inicio;
      let girando = false;
      const ahora = letras.map((ch, i) => {
        if (t < 0 || t < 420 + i * 120) {
          if (!/[a-záéíóúñ]/i.test(ch)) return ch;
          girando = true;
          const abc = ch === ch.toLowerCase() ? MINUS : MAYUS;
          return abc[Math.floor(Math.random() * abc.length)];
        }
        return ch;
      });
      if (girando) {
        setMostradas(ahora);
        timer = setTimeout(paso, 60);
      } else setMostradas(null);
    };
    timer = setTimeout(paso, 0);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [texto, demora]);

  const letras = [...texto];
  return (
    <span aria-label={texto}>
      {letras.map((ch, i) => {
        const vista = mostradas?.[i] ?? ch;
        return (
          <span key={i} aria-hidden className="tp-letra" data-gira={vista !== ch ? "" : undefined}>
            {vista}
          </span>
        );
      })}
    </span>
  );
}
