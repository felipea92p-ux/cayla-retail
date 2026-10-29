import { Chip } from "@/components/ui/Chip";
import type { ClaveModulo } from "@/lib/modulos";
import { modulosPorGrupo } from "@/lib/roles-reglas";

// Lo que ve una cuenta, en una tabla de filas por grupo (maqueta del 2026-10-27): el nombre del grupo a la izquierda y sus módulos en
// su propia columna, para que al envolver queden alineados. Antes era el árbol del menú, ~40 líneas.
export function ModulosPorGrupo({ modulos }: { modulos: readonly ClaveModulo[] }) {
  const filas = modulosPorGrupo()
    .map((g) => ({ grupo: g.grupo, ms: g.modulos.filter((m) => modulos.includes(m.clave)) }))
    .filter((f) => f.ms.length > 0);
  return (
    <div className="overflow-hidden rounded-xl border border-sand">
      {filas.map((f, i) => (
        <div key={f.grupo} className={`grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2 max-sm:grid-cols-1 ${i > 0 ? "border-t border-sand" : ""} ${i % 2 === 0 ? "bg-hueso/35" : ""}`}>
          <span className="pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-tinta/60">{f.grupo}</span>
          <span className="flex flex-wrap gap-1.5">
            {f.ms.map((m) => (
              <Chip key={m.clave} versalitas={false}>
                {m.nombre}
              </Chip>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
