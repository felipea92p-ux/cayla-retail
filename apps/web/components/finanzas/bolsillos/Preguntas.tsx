import Link from "next/link";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: las preguntas de siempre, listas para tocar (Felipe 2026-11-09). Cada una lleva a donde se responde: un bloque
// de esta misma pantalla o la pantalla que la responde entera. Son botones secundarios del sistema, en fila; en el celular, la fila se desliza.

export type Pregunta = { texto: string; href: string };

export function Preguntas({ preguntas }: { preguntas: readonly Pregunta[] }) {
  if (!preguntas.length) return null;
  return (
    <nav className="preguntas-a" aria-label="Lo que más se pregunta" data-guia="fin-resumen.preguntas">
      {preguntas.map((p) =>
        p.href.startsWith("#") ? (
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
