"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CancelarConteoModal } from "@/components/conteo/CancelarConteoModal";

/* ====================================================================
   AccionesEnCurso · «Seguir contando» y «Cancelar conteo» de la tarjeta «Conteo N en curso» del inicio

   Es la única parte de esa tarjeta que necesita del navegador (abrir el modal de cancelar), así que vive aparte y el
   resto de la tarjeta —el resumen— se dibuja en el servidor. «Seguir contando» es el camino principal; «Cancelar
   conteo» es discreto (`btn-sutil`) porque tira lo contado y no se aprieta por costumbre.
   ==================================================================== */
export function AccionesEnCurso({ conteoId, numero }: { conteoId: string; numero: number }) {
  const [cancelando, setCancelando] = useState(false);
  // Al cerrar el modal, el foco vuelve a «Cancelar conteo»: sin esto caía al principio de la página (/chaos 2026-10-14, TEC-01).
  const botonCancelar = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Link href={`/inventario/conteo/${conteoId}`} className="btn-cayla btn-primario h-11">
          Seguir contando
        </Link>
        <button ref={botonCancelar} type="button" onClick={() => setCancelando(true)} className="btn-cayla btn-peligro h-11">
          Cancelar conteo
        </button>
      </div>
      {cancelando && <CancelarConteoModal conteoId={conteoId} numero={numero} onClose={() => setCancelando(false)} alCerrarEnfocar={botonCancelar} />}
    </>
  );
}
