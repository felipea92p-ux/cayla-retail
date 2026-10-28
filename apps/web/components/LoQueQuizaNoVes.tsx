import type { Hallazgo } from "@/lib/proveedor-analisis-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// «Lo que quizá no ves» (2026-10-24): los avisos que el sistema saca de lo comprado y lo vendido (`proveedor-analisis-reglas.ts`).
// Cada uno dice qué pasa y qué hacer, y su «¿Por qué?» abre los números exactos y la regla que lo disparó: nada es una caja negra.
// Server Component sin estado; sin avisos no dibuja nada (una pantalla sin nada raro no necesita decirlo).

// `enColumna` (la columna derecha del ranking de la lista, 2026-10-26): una sola columna, sin su título (lo pone quien la usa) y, si el aviso es
// de un proveedor, un «Ver» que abre su vista rápida (`onVer`).
export function LoQueQuizaNoVes({ hallazgos, guia, enColumna = false, onVer }: { hallazgos: Hallazgo[]; guia: string; enColumna?: boolean; onVer?: (proveedorId: string) => void }) {
  if (hallazgos.length === 0) return null;
  return (
    <section className={enColumna ? "space-y-2.5" : "space-y-3"} data-guia={guia}>
      {!enColumna && <TituloSeccion cuenta={hallazgos.length}>Lo que quizá no ves</TituloSeccion>}
      <div className={enColumna ? "grid gap-2.5" : "grid gap-3 lg:grid-cols-2"}>
        {hallazgos.map((h) => (
          <Aviso
            key={h.id}
            tono={h.tono}
            titulo={h.titulo}
            accion={
              onVer && h.proveedorId ? (
                <button type="button" className="btn-enlace" onClick={() => onVer(h.proveedorId!)}>
                  Ver
                </button>
              ) : undefined
            }
          >
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
