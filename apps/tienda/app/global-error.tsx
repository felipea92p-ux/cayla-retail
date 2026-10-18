"use client";

import { CabeceraNeutra, PorDondeSeguir } from "@/components/ayuda/PorDondeSeguir";
import { TEMAS_DE_AYUDA } from "@/components/ayuda/temas";
import { Icono } from "@/components/Icono";
import "./globals.css";

/**
 * Si falla hasta el marco de la tienda (la raíz), esta página lo reemplaza entero: por eso trae su propio `<html>`. Nunca el detalle del
 * error. Revisión «a nivel mundial» (2026-10-16): la misma cara que la página de error de siempre (el logo, la frase, «Volver a
 * intentar» y las páginas de ayuda), con enlaces de siempre (una carga nueva). Las letras de la marca viven en el marco que falló: aquí
 * se nombran sus familias para que el título salga en una letra con serifa del aparato (sin ellas, `--serif` quedaba vacía y todo salía
 * en Times) y nada se cae si no están.
 */
export default function ErrorGeneral({ retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  return (
    <html lang="es" style={{ "--font-eb-garamond": '"EB Garamond"', "--font-archivo": '"Archivo"', "--font-newsreader": '"Newsreader"' } as React.CSSProperties}>
      <body>
        <title>CAYLA · Tienda online</title>
        <div className="tienda">
          <CabeceraNeutra recargar />
          <main className="t-pagina ay-pagina-sola">
            <PorDondeSeguir
              alerta
              recargar
              ceja="Algo falló de nuestro lado"
              titulo={
                <>
                  No pudimos mostrar <em>la tienda.</em>
                </>
              }
              texto="Fue un problema nuestro, no tuyo. Vuelve a intentarlo en un momento."
              acciones={
                <>
                  <button type="button" className="t-btn" onClick={() => (retry ?? reset)()}>
                    Volver a intentar
                  </button>
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
      </body>
    </html>
  );
}
