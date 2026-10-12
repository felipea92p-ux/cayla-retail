import { ChevronDown } from "lucide-react";
import { enteroES, solesES, type EstadoCampana, type TotalesPlan } from "@/lib/plan-compra-reglas";

// El resumen del Plan en una línea (Felipe 2026-10-12: «compactar por defecto para visualizar más rápido la tabla»). Las mismas cifras de las
// tarjetas —con plan, a comprar, inversión y lo que queda del tope, lo vendido y lo que sobra—, sin ocupar media pantalla. «Ver detalle»
// abre las tarjetas, la banda de lo que sobra y el simulador.

export function ResumenCompactoPlan({
  totales,
  estado,
  tope,
  recuperoPct,
  onAbrir,
}: {
  totales: TotalesPlan;
  estado: EstadoCampana;
  tope: number | null;
  recuperoPct: number | null;
  onAbrir: () => void;
}) {
  const queda = tope !== null ? Math.round((tope - totales.inversion) * 100) / 100 : null;
  const dato = (etiqueta: string, valor: string, extra?: string, tono = "text-tinta") => (
    <span className="whitespace-nowrap">
      <span className="text-tinta/65">{etiqueta} </span>
      <b className={`font-semibold ${tono}`}>{valor}</b>
      {extra && <span className="text-tinta/65"> {extra}</span>}
    </span>
  );
  return (
    <div className="card-cayla flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm">
      {dato("Con plan", `${enteroES.format(totales.conPlan)} de ${enteroES.format(totales.total)}`)}
      {dato("A comprar", enteroES.format(totales.aComprar))}
      {dato("Inversión", solesES(totales.inversion), queda === null ? undefined : queda >= 0 ? `· te quedan ${solesES(queda)}` : `· te pasas ${solesES(-queda)}`)}
      {estado !== "antes" && dato("Vendido", enteroES.format(totales.vendido))}
      {recuperoPct !== null && dato("Lo que sobra", `${recuperoPct} %`, "del precio")}
      <button type="button" onClick={onAbrir} aria-expanded={false} className="btn-cayla btn-sutil ml-auto inline-flex items-center gap-1.5">
        Ver detalle
        <ChevronDown aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
