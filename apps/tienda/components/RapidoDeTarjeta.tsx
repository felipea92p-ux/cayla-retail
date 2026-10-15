"use client";

import { useEffect, useRef, useState } from "react";
import { tallasParaAgregar, type Rapido } from "@/app/acciones/tarjeta";
import { AgregarRapido } from "./bolsa/AgregarALaBolsa";

/**
 * «Agregar» con la talla sobre la foto de la tarjeta (maqueta v4, `rapidoHTML`; la pieza es `AgregarRapido`, de la bolsa). Solo con
 * mouse y desde 960 px (en el celular no hay «pasar el mouse»: se agrega desde la ficha). Las tallas se piden la primera vez que el
 * mouse se queda sobre la tarjeta (o que el teclado entra en ella), una sola vez por tarjeta: una grilla de 40 prendas no le hace 40
 * preguntas a la base al abrirse.
 */
export function RapidoDeTarjeta({ productoId, sede }: { productoId: string; sede: string | null }) {
  const ancla = useRef<HTMLDivElement>(null);
  const [rapido, setRapido] = useState<Rapido | null>(null);

  useEffect(() => {
    const tarjeta = ancla.current?.closest(".t-card");
    if (!tarjeta) return;
    let vivo = true;
    let pedido = false;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    // El «Agregar» solo se ve desde 960 px de tienda (bolsa.css): más angosta, no hay nada que pedir.
    const seVe = () => (tarjeta.closest(".tienda")?.clientWidth ?? 0) >= 960;
    const cargar = () => {
      if (pedido || !seVe()) return;
      pedido = true;
      tallasParaAgregar(productoId, sede)
        .then((r) => {
          if (!vivo) return;
          if (r) setRapido(r);
          else pedido = false; // sin respuesta: la próxima pasada del mouse vuelve a intentar
        })
        .catch(() => {
          pedido = false;
        });
    };
    // Pasar de largo con el mouse no pregunta nada: solo si se queda un momento.
    const entrar = (e: Event) => {
      if ((e as PointerEvent).pointerType === "mouse") reloj = setTimeout(cargar, 120);
    };
    const salir = () => clearTimeout(reloj);
    tarjeta.addEventListener("pointerenter", entrar);
    tarjeta.addEventListener("pointerleave", salir);
    tarjeta.addEventListener("focusin", cargar);
    return () => {
      vivo = false;
      clearTimeout(reloj);
      tarjeta.removeEventListener("pointerenter", entrar);
      tarjeta.removeEventListener("pointerleave", salir);
      tarjeta.removeEventListener("focusin", cargar);
    };
  }, [productoId, sede]);

  return (
    <div ref={ancla} className="t-rapido-ancla">
      {rapido && <AgregarRapido tallas={rapido.tallas} sedeId={rapido.sedeId} />}
    </div>
  );
}
