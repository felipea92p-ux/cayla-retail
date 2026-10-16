"use client";

import { useState } from "react";

// El «¿Por qué?» a un toque de un asunto del Resumen (ADR-0400, Formidable ley 6: lo difícil, a un toque, nunca solo con el mouse). La cuenta de la que sale un asunto de tela
// (cuánto piden las órdenes, cuánto hay, qué viene en camino y de qué pedido) no va siempre abierta: se ve cuando alguien la quiere. Mismo gesto que el «¿Por qué?» de la orden
// (`orden-pagina/PideAtencion.tsx`). Sin texto no dibuja nada.

export function PorQue({ texto, guia }: { texto: string | undefined; guia?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!texto) return null;
  return (
    <div className="mt-1">
      <button type="button" data-guia={guia} onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="btn-cayla btn-enlace text-[12.5px]">
        {abierto ? "Ocultar" : "¿Por qué?"}
      </button>
      {abierto && <p className="mt-1 text-[12.5px] text-tinta/70">{texto}</p>}
    </div>
  );
}
