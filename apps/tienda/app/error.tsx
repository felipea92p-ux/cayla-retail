"use client";

import { useEffect } from "react";
import { Cabecera } from "@/components/Cabecera";
import { Icono } from "@/components/Icono";

/**
 * Lo que se ve si una página falla al armarse (2026-10-15): una línea en palabras de tienda y «Volver a intentar», nunca la pantalla de
 * error de Next ni el detalle del fallo (que puede decir cómo está hecha la tienda). El detalle queda en el registro del servidor; aquí
 * solo su huella (`digest`), para buscarlo.
 */
export default function ErrorDePagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ evento: "tienda_pagina_fallo", digest: error.digest ?? null }));
  }, [error]);
  return (
    <div className="tienda">
      <Cabecera />
      <main className="t-pagina">
        <div className="t-ancho">
          <div className="t-vacio" role="alert">
            <Icono nombre="tienda" />
            <h3>No pudimos mostrar esta página</h3>
            <p>Fue un problema nuestro, no tuyo. Vuelve a intentarlo en un momento.</p>
            <button type="button" className="t-btn" onClick={reset}>
              Volver a intentar
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
