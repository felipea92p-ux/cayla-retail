"use client";

import { useEffect, useState } from "react";
import { soles } from "@/lib/compras-reglas";
import { soles as solesRedondo } from "@/lib/flujo-caja-reglas";

/** Un número que sube desde 0 hasta su valor al aparecer (900 ms, frena al final). Es la
 *  única pieza con estado de `ResumenSede`, que por lo demás es de servidor: por eso vive
 *  aparte. El servidor y quien pidió menos movimiento ven el valor final de una vez; el
 *  lector de pantalla lee siempre el valor final, nunca los números intermedios. */
// `soles-redondo`: sin céntimos, como el resto de una pantalla que habla en soles enteros (el Resumen de Finanzas): la cifra
// grande no puede decir «S/ 396.00» si la frase de al lado dice «S/ 396».
export function CifraAnimada({ valor, formato = "entero" }: { valor: number; formato?: "entero" | "soles" | "soles-redondo" }) {
  const [mostrado, setMostrado] = useState(valor);

  useEffect(() => {
    if (valor === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const inicio = performance.now();
    let cuadro = 0;
    const paso = (ahora: number) => {
      const avance = Math.min((ahora - inicio) / 900, 1);
      setMostrado(valor * (1 - (1 - avance) ** 3));
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);

  const texto = (n: number) => (formato === "soles" ? soles(n) : formato === "soles-redondo" ? solesRedondo(n) : String(Math.round(n)));
  return (
    <>
      <span aria-hidden>{texto(mostrado)}</span>
      <span className="sr-only">{texto(valor)}</span>
    </>
  );
}
