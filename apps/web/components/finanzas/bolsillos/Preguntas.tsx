"use client";

import Link from "next/link";
import type { ClaveHoja } from "@/lib/hojas-resumen-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: las preguntas de siempre, listas para tocar (Felipe 2026-11-09). Cada una lleva a donde se responde: un bloque
// de esta misma pantalla, su hoja de detalle o la pantalla que la responde entera. Son botones secundarios del sistema, en fila; en el celular, la fila
// se desliza.

export type Pregunta = { texto: string; href: string } | { texto: string; hoja: ClaveHoja };

export function Preguntas({ preguntas, onAbrir }: { preguntas: readonly Pregunta[]; onAbrir: (hoja: ClaveHoja) => void }) {
  if (!preguntas.length) return null;
  return (
    <nav className="preguntas-a" aria-label="Lo que más se pregunta" data-guia="fin-resumen.preguntas">
      {preguntas.map((p) =>
        "hoja" in p ? (
          <button key={p.texto} type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => onAbrir(p.hoja)}>
            {p.texto}
          </button>
        ) : p.href.startsWith("#") ? (
          <a key={p.texto} href={p.href} className="btn-cayla btn-secundario btn-chico">
            {p.texto}
          </a>
        ) : (
          <Link key={p.texto} href={p.href} className="btn-cayla btn-secundario btn-chico">
            {p.texto}
          </Link>
        ),
      )}
    </nav>
  );
}
