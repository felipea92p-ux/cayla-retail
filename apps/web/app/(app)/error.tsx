"use client";

import Link from "next/link";
import { useEffect } from "react";

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
  useEffect(() => {
    // El detalle va a la consola del servidor/navegador para poder diagnosticarlo; en
    // producción Next reemplaza el mensaje por un digest, así que no se filtra el error
    // de Postgres a la pantalla — pero el digest sí permite encontrarlo en los logs.
    console.error("Pantalla caída:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="card-cayla anim-entrada max-w-md p-8 text-center">
        <p className="label-cayla text-[11px] text-rojo">No se pudo cargar</p>
        <h1 className="font-display mt-2 text-2xl text-tinta">Esta pantalla no está mostrando datos</h1>
        <p className="mt-3 text-sm text-tinta/75">
          Algo falló al traer la información. No se muestra nada a propósito: preferimos no enseñarte
          un número equivocado.
        </p>
        <p className="mt-2 text-sm text-tinta/75">
          Suele ser un corte momentáneo de conexión. Reintenta; si sigue igual, avisa a Felipe.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="label-cayla alza-cayla rounded-md bg-tinta px-5 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="label-cayla rounded-md border border-tinta/25 px-5 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
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
      </div>
    </div>
  );
}
