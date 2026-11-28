"use client";

import { useState } from "react";

// El «¿Por qué?» a un toque de un asunto del Resumen (ADR-0400, Formidable ley 6: lo difícil, a un toque, nunca solo con el mouse). La cuenta de la que sale un asunto de tela
// (cuánto piden las órdenes, cuánto hay, qué viene en camino y de qué pedido) no va siempre abierta: se ve cuando alguien la quiere. Mismo gesto que el «¿Por qué?» de la orden
// (`orden-pagina/PideAtencion.tsx`). Sin texto no dibuja nada. `pregunta` cambia lo que dice cerrado cuando lo que guarda no es un porqué («Ver los pedidos»).

export function PorQue({ texto, guia, pregunta = "¿Por qué?" }: { texto: string | undefined; guia?: string; pregunta?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!texto) return null;
  return (
    <div className="mt-1">
      <button type="button" data-guia={guia} onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="btn-cayla btn-enlace inline-flex min-h-6 items-center text-xs leading-tight pointer-coarse:min-h-11">
        {abierto ? "Ocultar" : pregunta}
      </button>
      {abierto && <p className="mt-1 max-w-prose text-sm text-secundario">{texto}</p>}
    </div>
  );
}
