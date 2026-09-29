"use client";

import { useState } from "react";
import { CancelarConteoModal } from "@/components/conteo/CancelarConteoModal";

/**
 * «Cancelar conteo» en la cabecera de Contar. Es un botón discreto (`btn-sutil`) y no el principal: cancelar tira lo
 * contado, así que no debe quedar a la mano de quien va a apretar «Revisar conteo». Solo abre el modal de confirmación
 * (`CancelarConteoModal`, que lleva su propio responsable y su propia navegación); la cabecera es de servidor y por eso
 * este botón es su propia pieza de cliente.
 */
export function BotonCancelarConteo({ conteoId, numero }: { conteoId: string; numero: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-cayla btn-sutil">
        Cancelar conteo
      </button>
      {abierto && <CancelarConteoModal conteoId={conteoId} numero={numero} onClose={() => setAbierto(false)} />}
    </>
  );
}
