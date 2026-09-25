"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BotonCompacto } from "@/components/ui/BotonCompacto";

// Barrera de error de UNA vista de Facturación. Vive dentro del layout, así que la
// cabecera y las pestañas siguen ahí y las otras vistas siguen funcionando. Con `exigir()`
// lanzando (lib/resultado.ts), esto es lo que ve la Encargada cuando una consulta de plata
// falla: dice qué hacer, no qué pasó, y no muestra ningún número — preferimos no enseñar
// uno equivocado.
export default function ErrorDeVista({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error("Vista de Facturación caída:", error);
  }, [error]);

  return (
    <div className="card-cayla anim-entrada mx-auto max-w-md p-8 text-center">
      <p className="label-cayla text-[11px] text-rojo">No se pudo cargar</p>
      <h2 className="font-display mt-2 text-xl text-tinta">Esta vista no está mostrando datos</h2>
      <p className="mt-3 text-sm text-tinta/75">
        Algo falló al traer la información y no mostramos nada a propósito: preferimos no enseñarte un número equivocado.
        Las otras vistas siguen funcionando.
      </p>
      <p className="mt-2 text-sm text-tinta/75">Suele ser un corte momentáneo de conexión. Reintenta; si sigue igual, avisa a Felipe.</p>
      <div className="mt-6 flex justify-center">
        {/* `reset` a secas no basta: en Next 16 solo vuelve a pintar esta barrera con la respuesta que
            ya llegó, y esa trae el mismo error — la tarjeta reaparecería sola y el botón parecería no
            hacer nada. `router.refresh()` vuelve a pedir los datos al servidor; van juntos en
            `startTransition` (lo mismo que hace `unstable_retry`, sin depender de una API inestable). */}
        <BotonCompacto
          variante="primario"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Reintentar
        </BotonCompacto>
      </div>
      {error.digest && (
        <p className="mt-5 text-xs text-tinta/65">
          Código: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
