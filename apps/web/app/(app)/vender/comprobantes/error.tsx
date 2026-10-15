"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Aventurero } from "@/components/ui/Aventurero";
import { AVISA_SOLO, avisarError } from "@/lib/errores-navegador";
import { siSigueIgual } from "@/lib/errores-reglas";

// Barrera de error de UNA vista de Facturación. Vive dentro del layout, así que la
// cabecera y las pestañas siguen ahí y las otras vistas siguen funcionando. Con `exigir()`
// lanzando (lib/resultado.ts), esto es lo que ve la Encargada cuando una consulta de plata
// falla: dice qué hacer, no qué pasó, y no muestra ningún número — preferimos no enseñar
// uno equivocado.
export default function ErrorDeVista({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    avisarError(error, "facturacion");
  }, [error]);

  return (
    // Aventurero (2026-10-15) abre la tarjeta, como en la barrera de toda la app (`app/(app)/error.tsx`).
    <div className="card-cayla anim-entrada mx-auto w-full max-w-md overflow-hidden text-center">
      <Aventurero motivo="error" />
      <div className="p-8 pt-6">
        <p className="label-cayla text-[11px] text-rojo">No se pudo cargar</p>
        <h2 className="font-display mt-2 text-xl text-tinta">Esta vista no está mostrando datos</h2>
        <p className="mt-3 text-sm text-tinta/75">
          Algo falló al traer la información y no mostramos nada a propósito: preferimos no enseñarte un número equivocado.
          Las otras vistas siguen funcionando.
        </p>
        <p className="mt-2 text-sm text-tinta/75">Suele ser un corte momentáneo de conexión. {siSigueIgual(AVISA_SOLO)}</p>
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
    </div>
  );
}
