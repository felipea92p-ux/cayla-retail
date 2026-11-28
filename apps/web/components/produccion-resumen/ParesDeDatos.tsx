import { ParDato, Pares } from "@/components/ui/ParDato";
import type { ParDeDato } from "@/lib/produccion-decisiones";

/** Los datos de un asunto, una fila o una tela, cada uno en su pieza (rótulo arriba, valor abajo): nunca «dato · dato · dato» (Felipe 2026-11-26). Los pares llegan hechos de `lib/`. */
export function ParesDeDatos({ pares, className = "" }: { pares: readonly ParDeDato[]; className?: string }) {
  return (
    <Pares className={className}>
      {pares.map((p) => (
        <ParDato key={p.rotulo} rotulo={p.rotulo} tono={p.tono ?? "tinta"}>
          {p.valor}
        </ParDato>
      ))}
    </Pares>
  );
}
