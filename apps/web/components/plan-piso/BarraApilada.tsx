import { fondoDeGrupo } from "@/lib/mix-piso-visual";

/**
 * Una barra apilada de la mezcla de un conjunto: cada parte ocupa lo que vale. Es de SERVIDOR (sin estado): la usa la pestaña Historia para
 * mostrar, fila por fila, cómo se repartía el riel cada semana. Los colores son los de los grupos (`lib/mix-piso-visual.ts`: solo tokens, sin rojo).
 * Sin nada que repartir dice «sin datos» en vez de dibujar una barra vacía que parezca un cero.
 */
export type ParteDeBarra = { clave: string; nombre: string; valor: number; /** La posición del grupo en la lista del riel: decide su color. */ indice: number };

export function BarraApilada({ partes, titulo, alto = "h-3", apagada = false }: { partes: readonly ParteDeBarra[]; titulo: string; alto?: string; apagada?: boolean }) {
  const visibles = partes.filter((p) => p.valor > 0);
  const total = visibles.reduce((s, p) => s + p.valor, 0);
  if (total === 0) return <span className="text-xs text-taupe">sin datos</span>;
  return (
    <span
      role="img"
      aria-label={`${titulo}: ${visibles.map((p) => `${p.nombre} ${p.valor}`).join(", ")}`}
      className={`flex ${alto} w-full gap-px overflow-hidden rounded-full bg-sand ${apagada ? "opacity-55" : ""}`}
    >
      {visibles.map((p) => (
        <span key={p.clave} title={`${p.nombre}: ${p.valor}`} style={{ flexGrow: p.valor, flexBasis: 0 }} className={`block min-w-px ${fondoDeGrupo(p.indice).split(" ")[0]}`} />
      ))}
    </span>
  );
}
