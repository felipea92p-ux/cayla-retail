"use client";

import { useEffect, useState } from "react";
import { fraccion, type TonoAvance } from "@/lib/comprobante-linea-tiempo";

// Barras de avance del detalle de un comprobante (ADR-0136): la de Recepción (recibido / facturado), la de
// Pago (pagado / total), las miniaturas de cada línea y los conectores de la línea de tiempo. Todas se LLENAN:
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

/** Barra con su pista y su rol de accesibilidad. `fina` es la miniatura de las líneas del comprobante. */
export function BarraAvance({ avance, tono, etiqueta, fina = false }: { avance: number; tono: TonoAvance; etiqueta: string; fina?: boolean }) {
  const pct = Math.round(fraccion(avance, 1) * 100);
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-sand ${fina ? "mt-1 h-1" : "mt-2 h-1.5"}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={etiqueta}
    >
      <RellenoAvance avance={avance} tono={tono} />
    </div>
  );
}

/**
 * Una de las dos tarjetas del detalle (prototipo: «Recepción» a la izquierda, «Pago» a la derecha): la etiqueta, la cifra
 * grande con su «de X» chico («210 de 600 u.», «S/ 2,000.00 de S/ 5,923.60») y la barra que se llena.
 * `nota` es una línea chica opcional para lo que el prototipo no tiene pero la app necesita (unidades cerradas por
 * faltante, notas de crédito): solo sale cuando hay algo que decir.
 */
export function TarjetaAvance({
  etiqueta,
  valor,
  de,
  nota,
  avance,
  tono,
}: {
  etiqueta: string;
  valor: string;
  /** Lo que sigue a la cifra, en chico: «de 600 u.». */
  de?: string;
  nota?: string;
  /** 0–1: cuánto del total ya está cubierto. */
  avance: number;
  tono: TonoAvance;
}) {
  return (
    <div className="card-cayla px-4 py-3.5">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-0.5 text-[22px] tabular-nums text-tinta">
        {valor}
        {de && <small className="font-sans text-xs text-tinta/55"> {de}</small>}
      </p>
      <BarraAvance avance={avance} tono={tono} etiqueta={`${etiqueta}: ${Math.round(fraccion(avance, 1) * 100)}%`} />
      {nota && <p className="mt-2 text-xs text-tinta/65">{nota}</p>}
    </div>
  );
}
