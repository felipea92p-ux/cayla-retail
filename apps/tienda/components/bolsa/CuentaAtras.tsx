"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hhmmss } from "@/lib/pedidos";

/**
 * Cuánto falta para que un pedido sin confirmar se cierre solo («23:59:12», maqueta `data-vence`). La hora la da la base (`vence_en`,
 * con el plazo de Configuración ▸ Tienda web). Al llegar a cero vuelve a pedir la página una vez: la base ya lo lee cerrado. La hora
 * del servidor y la del aparato difieren un instante al cargar: las cifras no avisan esa diferencia.
 */
export function CuentaAtras({ hasta }: { hasta: string }) {
  const router = useRouter();
  const fin = new Date(hasta).getTime();
  const [ahora, setAhora] = useState(() => Date.now());
  const pedida = useRef(false);
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => {
    if (ahora >= fin && !pedida.current) {
      pedida.current = true;
      router.refresh();
    }
  }, [ahora, fin, router]);
  return (
    <b className="num" role="timer" suppressHydrationWarning>
      {hhmmss(fin - ahora)}
    </b>
  );
}
