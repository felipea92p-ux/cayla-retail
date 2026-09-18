"use client";

// Último recurso: se usa solo cuando revienta el layout raíz, donde ni siquiera existe
// el armazón de la app. Por eso trae su propio <html> y <body> — no hay nada arriba que
// los ponga. Es la única pantalla del sistema que no puede apoyarse en globals.css
// (no llega a cargarse), así que los colores del brandbook van a mano:
// crema #f5f0e8 de fondo, tinta #1a1a18 de texto, rojo #b8412d de acento.
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
            onClick={reset}
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
