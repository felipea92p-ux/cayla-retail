"use client";

import { Boton } from "@/components/ui/campos";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";

// «Pagar a CLAURE» (ADR-0560, actividad 2): abre el mismo «Registrar movimiento» de Cuentas y dinero con el pago ya elegido y, si se le
// debe algo, el monto escrito (la persona lo puede bajar: un pago parcial es válido). Solo lo ve el líder: lo que sale de un banco es suyo.
export function BotonPagarClaure({
  montoSugerido,
  peso = "primario",
  conGuia = true,
  nombre = "CLAURE",
}: {
  montoSugerido: string;
  peso?: "primario" | "fantasma";
  /** `false` si ya hay otro «Pagar a CLAURE» en la pantalla con el ancla de la guía (la cabecera). */
  conGuia?: boolean;
  /** ADR-0683: a qué aliada (el pago lleva su `x-aliada` desde la hoja de la pantalla, que sabe cuál es). */
  nombre?: string;
}) {
  const abrir = useAbrirMovimiento();
  return (
    <Boton type="button" peso={peso} onClick={() => abrir("pago_claure", undefined, montoSugerido || undefined)} aria-haspopup="dialog" data-guia={conGuia ? "fin-claure.pagar" : undefined}>
      Pagar a {nombre}
    </Boton>
  );
}
