import { soles } from "@/lib/compras-reglas";

/**
 * Doce barras, una por mes (ADR-0128): lo facturado a un proveedor mes a mes. La última (el mes en curso)
 * va en tinta y las demás apagadas. Crecen desde su base con `.anim-crece-y`, escalonadas — pero este
 * componente solo se monta cuando la persona abre la vista rápida, así que el movimiento responde a un clic.
 * Cada barra dice su monto al pasar el mouse; para el lector de pantalla hay un resumen.
 */
export function BarrasMensuales({ serie, iniciales }: { serie: number[]; iniciales: string[] }) {
  const max = Math.max(...serie, 1);
  const total = serie.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div aria-hidden className="flex h-[74px] items-end gap-[5px] border-b border-tinta/10">
        {serie.map((v, i) => (
          <span key={i} className="group/barra relative flex h-full flex-1 items-end">
            <span
              className={`anim-crece-y block w-full rounded-t-[3px] transition-colors duration-200 group-hover/barra:bg-tinta ${i === serie.length - 1 ? "bg-tinta" : "bg-tinta/15"}`}
              style={{ height: `${Math.max(4, (v / max) * 100)}%`, ["--i" as string]: i }}
            />
            <span className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-tinta px-2 py-0.5 text-[11px] tabular-nums text-crema group-hover/barra:block">
              {soles(v)}
            </span>
          </span>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-[5px]">
        {iniciales.map((m, i) => (
          <span key={i} className="flex-1 text-center text-[10px] tracking-wider text-tinta/45">
            {m}
          </span>
        ))}
      </div>
      <p className="sr-only">Facturado en los últimos 12 meses: {soles(total)}. El mes en curso: {soles(serie[serie.length - 1] ?? 0)}.</p>
    </div>
  );
}
