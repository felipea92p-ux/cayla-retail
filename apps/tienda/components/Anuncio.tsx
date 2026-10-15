"use client";

import { useEffect, useState } from "react";

/** La franja oscura de arriba: cambia de frase cada 4,5 s. Con «reducir movimiento» se queda en la primera. */
export function Anuncio({ frases }: { frases: string[] }) {
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (frases.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const reloj = setInterval(() => setVuelta((n) => n + 1), 4500);
    return () => clearInterval(reloj);
  }, [frases.length]);
  return (
    <div className="t-anuncio">
      {/* La clave nueva vuelve a montar la frase y su entrada se repite. */}
      <span key={vuelta} className={vuelta > 0 ? "entra" : undefined}>
        {frases[vuelta % frases.length]}
      </span>
    </div>
  );
}
