"use client";

import "./globals.css";

/**
 * Si falla hasta el marco de la tienda (la raíz), esta página lo reemplaza entero: por eso trae su propio `<html>`. Sin la cabecera
 * ni las letras de la marca (viven en el marco que falló); solo la frase y «Volver a intentar», nunca el detalle del error.
 */
export default function ErrorGeneral({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <main className="t-pagina">
          <div className="t-ancho">
            <div className="t-vacio" role="alert">
              <h3>No pudimos mostrar la tienda</h3>
              <p>Fue un problema nuestro, no tuyo. Vuelve a intentarlo en un momento.</p>
              <button type="button" className="t-btn" onClick={reset}>
                Volver a intentar
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
