"use client";

import { useEffect, useState } from "react";
import { fraccion, type TonoAvance } from "@/lib/comprobante-linea-tiempo";

// El relleno de los conectores de la línea de tiempo de un comprobante (ADR-0136). Las barras de Recepción, Pago y
// las miniaturas de cada línea son, desde la ronda 13 de /unificar (2026-10-15), la pieza única <BarraAvance>
// (components/ui/BarraAvance.tsx). Los conectores se LLENAN:
// al abrir parten de cero y crecen hasta el avance real; tras registrar un pago (`router.refresh()`) el
// componente sigue montado, así que la barra continúa desde el ancho que tenía en vez de repetir la entrada.
//
// Cómo se logra: `useLlenado` devuelve 0 en el primer pintado y, dos cuadros después, el valor real. Ese
// salto de 0 a X es lo que el navegador anima con la transición de `.cd-llena` (comprobantes-detalle.css).
// Los siguientes cambios de valor (un pago nuevo) son cambios normales y también se animan, desde donde estaban.
// El estilo y la curva viven en el CSS; con movimiento reducido todo llega de una vez.

/** El valor que se pinta: 0 al montarse y, dos cuadros después, `objetivo` — más «¿es la primera vez?». */
export function useLlenado(objetivo: number): { valor: number; primera: boolean } {
  const [listo, setListo] = useState(false);
  const [primera, setPrimera] = useState(true);
  useEffect(() => {
    let segundo = 0;
    const primero = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setListo(true));
    });
    return () => {
      cancelAnimationFrame(primero);
      cancelAnimationFrame(segundo);
    };
  }, []);
  // Pasada la entrada, las actualizaciones dejan de esperar los 650 ms iniciales.
  useEffect(() => {
    const t = window.setTimeout(() => setPrimera(false), 2000);
    return () => window.clearTimeout(t);
  }, []);
  return { valor: listo ? fraccion(objetivo, 1) : 0, primera };
}

/** El relleno de una barra. El contenedor lo pone quien lo usa (la altura y el fondo de la pista cambian de sitio en sitio). */
export function RellenoAvance({ avance, tono }: { avance: number; tono: TonoAvance }) {
  const { valor, primera } = useLlenado(avance);
  return <i className="cd-llena" data-tono={tono} data-primera={primera} style={{ "--p": valor } as React.CSSProperties} />;
}

// Las dos tarjetas del detalle («Recepción» y «Pago», con su barra) eran `TarjetaAvance`, una copia a mano de la
// tarjeta de cifra; desde el 2026-10-06 son la pieza única `TarjetaCifra` con `BarraAvance` en su contexto (ADR-0358).
