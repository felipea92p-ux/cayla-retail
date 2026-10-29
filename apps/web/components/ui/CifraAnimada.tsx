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
type Props = { valor: number; formato?: "entero" | "soles" | "soles-redondo" };

/** Con un valor nuevo se vuelve a armar desde cero (`key={valor}`). La cifra guarda el número que muestra en su estado y, al cambiar
 *  la página de sede, React conserva ese estado: cuando el valor nuevo era 0 (o se pidió menos movimiento) el efecto de abajo no
 *  anima y nadie actualizaba `mostrado`, así que Cuentas y dinero decía «Taller: S/ 209» con la plata de Lima (2026-10-28). Armarla
 *  de nuevo lo resuelve para todo valor y para todas las pantallas que la usan, sin una excepción más dentro del efecto. */
export function CifraAnimada(props: Props) {
  return <CifraAnimadaDe key={props.valor} {...props} />;
}

function CifraAnimadaDe({ valor, formato = "entero" }: Props) {
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
