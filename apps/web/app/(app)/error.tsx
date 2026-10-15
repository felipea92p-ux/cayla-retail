"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { PantallaAventurero } from "@/components/ui/Aventurero";
import { AVISA_SOLO, avisarError } from "@/lib/errores-navegador";
import { siSigueIgual } from "@/lib/errores-reglas";

// Barrera de error de todo el mundo (app). Antes no existía ninguna: si una pantalla
// reventaba, salía la página de error por defecto de Next —en inglés, con jerga de
// framework— o, peor, no reventaba nada y la pantalla se dibujaba vacía como si el
// negocio no tuviera datos (ver lib/resultado.ts).
//
// Con `exigir()` lanzando, esta pantalla es lo que ve la Encargada cuando una consulta
// falla. Por eso dice qué hacer, no qué pasó: "reintentar" resuelve el 90% de los casos
// reales (un parpadeo de red), y "volver al inicio" la saca del callejón sin cerrar sesión.
export default function ErrorDeSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // El detalle va a la consola del navegador y, si nació aquí, a Sentry (ADR-0424); si nació en el servidor ya lo avisó el
    // servidor. En producción Next reemplaza el mensaje por un digest, así que no se filtra el error de Postgres a la pantalla —
    // pero el digest sí permite encontrarlo en Sentry y en los logs.
    avisarError(error, "app");
  }, [error]);

  return (
    // Aventurero (2026-10-15) abre la pantalla con su meme y el texto de siempre dice qué hacer; la tarjeta crece con la ventana
    // (`PantallaAventurero`). El meme dice que alguien lo está resolviendo: desde el ADR-0424 es cierto en producción (Sentry le
    // escribe a Felipe), y el texto lo dice; el código sigue.
    <PantallaAventurero motivo="error">
      <p className="label-cayla text-[11px] text-rojo">No se pudo cargar</p>
      <h1 className="font-display mt-2 text-2xl text-tinta sm:text-3xl">Esta pantalla no está mostrando datos</h1>
      <p className="mt-3 text-sm text-tinta/75 sm:text-base">
        Algo falló al traer la información. No se muestra nada a propósito: preferimos no enseñarte
        un número equivocado.
      </p>
      <p className="mt-2 text-sm text-tinta/75 sm:text-base">Suele ser un corte momentáneo de conexión. {siSigueIgual(AVISA_SOLO)}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {/* `reset` a secas no basta: en Next 16 solo vuelve a pintar esta barrera con la respuesta que
            ya llegó, y esa trae el mismo error — la tarjeta reaparece aunque la causa (un corte de red)
            ya se haya ido, y la persona en el mostrador ve que «Reintentar» no hace nada.
            `router.refresh()` vuelve a pedir los datos al servidor; van juntos en `startTransition`
            (lo mismo que hace `unstable_retry`, sin depender de una API inestable). Mismo patrón que
            `vender/comprobantes/error.tsx`. */}
        <button
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
          className="btn-cayla btn-primario"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="btn-cayla btn-secundario"
        >
          Volver al inicio
        </Link>
      </div>

      {error.digest && (
        // Le sirve a quien lea los logs para encontrar ESTE fallo entre todos.
        <p className="mt-5 text-xs text-tinta/65">
          Código: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </PantallaAventurero>
  );
}
