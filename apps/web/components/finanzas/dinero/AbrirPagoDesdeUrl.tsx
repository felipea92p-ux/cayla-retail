"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";

// «Pagar a CLAURE» desde el cierre de caja (ADR-0560, actividad 3): el cierre lleva a `/finanzas/dinero/claure?pagar=1` y aquí la hoja de pago se abre
// sola, con el saldo escrito, como si se hubiera tocado el botón. El parámetro sale de la dirección (recargar no la vuelve a abrir), igual que
// `?registrar=1` de Cuentas y dinero. Solo se monta para el líder: lo que sale de un banco es suyo.
export function AbrirPagoDesdeUrl({ montoSugerido }: { montoSugerido: string }) {
  const abrir = useAbrirMovimiento();
  const params = useSearchParams();
  const ruta = usePathname();
  const pide = params.get("pagar") === "1";
  const yaAbrio = useRef(false);
  useEffect(() => {
    if (!pide || yaAbrio.current) return;
    yaAbrio.current = true;
    const p = new URLSearchParams(window.location.search);
    p.delete("pagar");
    window.history.replaceState(null, "", p.size ? `${ruta}?${p}` : ruta);
    abrir("pago_claure", undefined, montoSugerido || undefined);
  }, [pide, ruta, abrir, montoSugerido]);
  return null;
}
