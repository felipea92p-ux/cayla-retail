import type { Hallazgo } from "@/lib/proveedor-analisis-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// «Lo que quizá no ves» (2026-10-24): los avisos que el sistema saca de lo comprado y lo vendido (`proveedor-analisis-reglas.ts`).
// Cada uno dice qué pasa y qué hacer, y su «¿Por qué?» abre los números exactos y la regla que lo disparó: nada es una caja negra.
// Server Component sin estado; sin avisos no dibuja nada (una pantalla sin nada raro no necesita decirlo).

export function LoQueQuizaNoVes({ hallazgos, guia }: { hallazgos: Hallazgo[]; guia: string }) {
  if (hallazgos.length === 0) return null;
  return (
    <section className="space-y-3" data-guia={guia}>
      <TituloSeccion cuenta={hallazgos.length}>Lo que quizá no ves</TituloSeccion>
      <div className="grid gap-3 lg:grid-cols-2">
        {hallazgos.map((h) => (
          <Aviso key={h.id} tono={h.tono} titulo={h.titulo}>
            <p>{h.texto}</p>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-taupe">¿Por qué?</summary>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-tinta">
                {h.numeros.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-taupe">Regla: {h.regla}</p>
            </details>
          </Aviso>
        ))}
      </div>
    </section>
  );
}
