"use client";

import { useEffect, type CSSProperties } from "react";
import { SCRIPT_TEMA_ANTES_DE_PINTAR } from "@/lib/tema-reglas";
import { AVISA_SOLO, avisarError } from "@/lib/errores-navegador";
import { siSigueIgual } from "@/lib/errores-reglas";
import { Aventurero } from "@/components/ui/Aventurero";
// Sin globals.css, la hoja de Aventurero se trae aquí directo (la de la app la importa globals.css).
import "./estilos/aventurero.css";

// Último recurso: se usa solo cuando revienta el layout raíz, donde ni siquiera existe
// el armazón de la app. Por eso trae su propio <html> y <body> — no hay nada arriba que
// los ponga. Es la única pantalla del sistema que no puede apoyarse en globals.css
// (no llega a cargarse), así que los colores del brandbook van a mano:
// crema #f5f0e8 de fondo, tinta #1a1a18 de texto, rojo #b8412d de acento.
//
// MODO OSCURO (ADR-0336): como no carga los tokens, lleva su propia paleta en dos juegos de variables (claro y oscuro, los mismos
// valores de `app/estilos/tema.css`) y aplica la preferencia guardada con el mismo script del layout, antes de pintar. Una pantalla
// de error clara en medio de un ERP oscuro, justo cuando algo salió mal, sería lo último que alguien necesita.
//
// «Reintentar» usa `unstable_retry` (Next 16.2, el camino que su documentación da para global-error),
// no `reset`: `reset` a secas solo vuelve a pintar con la respuesta que ya llegó —y esa trae el mismo
// error—, así que el botón parecería no hacer nada aunque el corte ya haya pasado. `unstable_retry` =
// `router.refresh()` + `reset()` dentro de una transición: vuelve a pedir los datos, y Next ya lo
// entrega hecho.
//
// Por qué no el patrón de `(app)/error.tsx` (`useRouter` + `startTransition`): SÍ funcionaría aquí —en la
// 16.2.10 Next monta esta barrera dentro del contexto del router, así que `useRouter()` responde— y es lo que
// hacen las barreras de la app. Se prefiere `unstable_retry` porque es el camino documentado para esta
// pantalla, la que casi nadie ve ni prueba a mano, y deja que Next mantenga el reintento en vez de copiarlo
// aquí. El precio es que es API inestable: `errores-reintentar.test.ts` falla si una versión nueva de Next
// la quita, y entonces la salida es el patrón de `(app)/error.tsx` (o una recarga completa).
//
// Aventurero (2026-10-15) también está aquí, sobre el título: es la pantalla de error más rara de todas, y la única que se pinta sin
// los tokens. Su texto usa los dos colores FIJOS de la paleta (iguales en claro y en oscuro: van sobre una foto), así que se
// declaran aquí con los valores de globals.css.
const ESTILOS =
  "html{color-scheme:light;--ge-fondo:#f5f0e8;--ge-texto:#1a1a18;--ge-acento:#b8412d;--color-tinta-fija:#1a1a18;--color-crema-fija:#f5f0e8}" +
  'html[data-tema="oscuro"]{color-scheme:dark;--ge-fondo:#1a1a18;--ge-texto:#f5f0e8;--ge-acento:#e8806a}' +
  ".ge-aventurero{margin:0 0 24px;border-radius:12px;overflow:hidden}";

export default function ErrorGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // Si el layout raíz reventó en el servidor, ya lo avisó el servidor (ADR-0424); si nació en el navegador, se avisa aquí.
  useEffect(() => avisarError(error, "global"), [error]);

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_ANTES_DE_PINTAR }} />
        <style dangerouslySetInnerHTML={{ __html: ESTILOS }} />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ge-fondo)",
          color: "var(--ge-texto)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        {/* La foto crece con la ventana, como en la app (`.aventurero-tarjeta`, aventurero.css). Aquí no hay cabecera: se reserva solo lo
            alto del mensaje y los márgenes. */}
        <div className="aventurero-tarjeta" style={{ textAlign: "center", "--aventurero-reservado": "19rem" } as CSSProperties}>
          <Aventurero motivo="error" className="ge-aventurero" />
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--ge-acento)",
            }}
          >
            CAYLA
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: "24px", fontWeight: 400 }}>
            El sistema no pudo arrancar
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: 1.5, color: "color-mix(in srgb, var(--ge-texto) 75%, transparent)" }}>
            Esto no es un problema de tu computadora. {siSigueIgual(AVISA_SOLO)}
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: "24px",
              background: "var(--ge-texto)",
              color: "var(--ge-fondo)",
              border: "none",
              borderRadius: "8px",
              padding: "12px 22px",
              fontSize: "11px",
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          {error.digest && (
            <p style={{ margin: "20px 0 0", fontSize: "13px", color: "color-mix(in srgb, var(--ge-texto) 65%, transparent)" }}>
              Código: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
