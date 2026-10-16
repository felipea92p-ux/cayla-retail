"use client";

import { useEffect } from "react";
import { CabeceraNeutra, PorDondeSeguir } from "@/components/ayuda/PorDondeSeguir";
import { TEMAS_DE_AYUDA } from "@/components/ayuda/temas";
import { Icono } from "@/components/Icono";

/**
 * Lo que se ve si una página falla al armarse (2026-10-15): en palabras de tienda, «Volver a intentar» y por dónde seguir, nunca la
 * pantalla de error de Next ni el detalle del fallo (que puede decir cómo está hecha la tienda). El detalle queda en el registro del
 * servidor; aquí solo su huella (`digest`), para buscarlo. Revisión «a nivel mundial» (2026-10-16): con la marca, la cabecera neutra (la
 * página no sabe si hay sesión: antes decía «Entrar» también a quien ya había entrado) y, en vez de un callejón, las páginas de ayuda.
 * «Volver a intentar» vuelve a pedir la página al servidor (`retry`, Next 16): `reset` solo la redibujaba con lo mismo que falló.
 */
export default function ErrorDePagina({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ evento: "tienda_pagina_fallo", digest: error.digest ?? null }));
  }, [error]);
  return (
    <div className="tienda">
      <CabeceraNeutra recargar />
      <main className="t-pagina ay-pagina-sola">
        <PorDondeSeguir
          alerta
          recargar
          ceja="Algo falló de nuestro lado"
          titulo={
            <>
              No pudimos mostrar <em>esta página.</em>
            </>
          }
          texto="Fue un problema nuestro, no tuyo. Vuelve a intentarlo en un momento."
          acciones={
            <>
              <button type="button" className="t-btn" onClick={() => (retry ?? reset)()}>
                Volver a intentar
              </button>
              {/* Una carga nueva a propósito: lo que falló puede seguir en la memoria de la página. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="ay-enlace" href="/">
                Ir a la tienda <Icono nombre="flecha" />
              </a>
            </>
          }
          caminos={TEMAS_DE_AYUDA}
        />
      </main>
    </div>
  );
}
