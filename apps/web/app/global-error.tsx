"use client";

// Último recurso: se usa solo cuando revienta el layout raíz, donde ni siquiera existe
// el armazón de la app. Por eso trae su propio <html> y <body> — no hay nada arriba que
// los ponga. Es la única pantalla del sistema que no puede apoyarse en globals.css
// (no llega a cargarse), así que los colores del brandbook van a mano:
// crema #f5f0e8 de fondo, tinta #1a1a18 de texto, rojo #b8412d de acento.
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
export default function ErrorGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f0e8",
          color: "#1a1a18",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "#b8412d",
            }}
          >
            CAYLA
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: "24px", fontWeight: 400 }}>
            El sistema no pudo arrancar
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: 1.5, color: "rgba(26,26,24,0.75)" }}>
            Esto no es un problema de tu computadora. Reintenta; si sigue igual, avisa a Felipe.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: "24px",
              background: "#1a1a18",
              color: "#f5f0e8",
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
            <p style={{ margin: "20px 0 0", fontSize: "13px", color: "rgba(26,26,24,0.65)" }}>
              Código: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
