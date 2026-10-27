"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { soles } from "@/lib/catalogo";

// El número que cuenta (ADR-0524, «G · Pasarela»; la maqueta, `M.contar`): el total de la bolsa y el número del pedido «ruedan» hasta su valor, una vez, al
// llegar a la pantalla; y si el total cambia (quitaron una prenda, cambiaron la cantidad), ruedan de lo que decía a lo que dice ahora. El servidor ya dibuja el valor
// final (sin JavaScript, o con «reducir movimiento», se ve de una vez); lo que rueda es solo lo que se ve, y el lector de pantalla oye siempre el valor de verdad.

/** Qué tan rápido rueda: lo de la primera vez (de cero) tarda más que un cambio de una prenda. */
const DURACION = { primera: 1300, cambio: 600 } as const;

/** El valor que se ve ahora: va de donde estaba (o de cero, la primera vez) hasta `destino`. */
function useValorQueCuenta(destino: number): number {
  const [visto, setVisto] = useState(destino);
  const mostrado = useRef(destino);
  const primera = useRef(true);
  useLayoutEffect(() => {
    const desde = primera.current ? 0 : mostrado.current;
    const dura = primera.current ? DURACION.primera : DURACION.cambio;
    primera.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || desde === destino) {
      mostrado.current = destino;
      setVisto(destino);
      return;
    }
    // Antes de pintar ya dice de dónde sale: si no, un cuadro mostraría el valor final y saltaría a cero.
    mostrado.current = desde;
    setVisto(desde);
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const k = Math.min(1, (ahora - inicio) / dura);
      const ritmo = 1 - Math.pow(1 - k, 3);
      mostrado.current = k === 1 ? destino : desde + (destino - desde) * ritmo;
      setVisto(mostrado.current);
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [destino]);
  return visto;
}

/** El total en soles («S/ 259.80»), que rueda hasta su valor. */
export function TotalQueCuenta({ valor }: { valor: number }) {
  const visto = useValorQueCuenta(valor);
  return (
    <>
      <span aria-hidden="true">{soles(visto)}</span>
      <span className="t-sr">{soles(valor)}</span>
    </>
  );
}

/** El número de un pedido («W-0141»): sus cifras ruedan desde cero hasta su valor, con los mismos ceros a la izquierda. Un código que no termina en cifras se ve tal cual. */
export function CodigoQueCuenta({ codigo }: { codigo: string }) {
  const partes = /^(\D*)(\d+)$/.exec(codigo);
  const destino = partes ? Number(partes[2]) : 0;
  const visto = useValorQueCuenta(destino);
  if (!partes) return <>{codigo}</>;
  return (
    <>
      <span aria-hidden="true">
        {partes[1]}
        {String(Math.round(visto)).padStart(partes[2].length, "0")}
      </span>
      <span className="t-sr">{codigo}</span>
    </>
  );
}
