"use client";

import { useLayoutEffect, useRef } from "react";
import { columnasDeCifra } from "@/lib/cifra-rueda";
import { soles } from "@/lib/compras-reglas";
import { soles as solesRedondo } from "@/lib/flujo-caja-reglas";

/** La cifra que rueda (ADR-0136, act. 2026-10-31): al aparecer, cada dígito gira desde 0 hasta su valor; al cambiar (otra sede, otro mes),
 *  gira del valor viejo al nuevo, sin volver a contar desde cero. Una vez, 700 ms con `--ease-cayla`, sin rebote. Las columnas y sus claves
 *  salen de `columnasDeCifra` (lógica pura, con su prueba). Es la única pieza con estado de `ResumenSede`, que por lo demás es de
 *  servidor: por eso vive aparte. El servidor y quien pidió menos movimiento ven el valor final de una vez; el lector de pantalla lee
 *  siempre el valor final, nunca los dígitos que giran. */
// `soles-redondo`: sin céntimos, como el resto de una pantalla que habla en soles enteros (el Resumen de Finanzas): la cifra
// grande no puede decir «S/ 396.00» si la frase de al lado dice «S/ 396».
type Props = { valor: number; formato?: "entero" | "soles" | "soles-redondo" };

export function CifraAnimada({ valor, formato = "entero" }: Props) {
  const texto = formato === "soles" ? soles(valor) : formato === "soles-redondo" ? solesRedondo(valor) : String(Math.round(valor));
  return (
    <>
      <span aria-hidden className="cifra-rueda">
        {columnasDeCifra(texto).map((c) => (c.digito === null ? <span key={c.clave}>{c.texto}</span> : <Digito key={c.clave} digito={c.digito} />))}
      </span>
      <span className="sr-only">{texto}</span>
    </>
  );
}

/** Una columna: la tira del 0 al 9 (escrita en el CSS, `.cifra-rueda-tira::before`), corrida hasta su dígito. El dígito que se ve sale
 *  SIEMPRE del valor de ahora: la columna no guarda ningún número (antes la cifra lo guardaba en un estado y una vez mostró la plata de
 *  otra sede). Al aparecer gira desde 0: su primer cuadro se pinta en 0 sin transición y enseguida vuelve a su dígito, ya con ella. */
function Digito({ digito }: { digito: number }) {
  const tira = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const t = tira.current;
    if (!t || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const destino = t.style.transform;
    t.style.transition = "none";
    t.style.transform = "translateY(0%)";
    void t.offsetHeight; // pinta el cuadro en 0 antes de volver
    t.style.transition = "";
    t.style.transform = destino;
  }, []);
  return (
    <span className="cifra-rueda-col">
      <span ref={tira} className="cifra-rueda-tira" style={{ transform: `translateY(-${digito * 10}%)` }} />
    </span>
  );
}
