import { ChevronDown } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { enteroES, solesES, type EstadoCampana, type TotalesPlan } from "@/lib/plan-compra-reglas";

// El resumen del Plan en una línea (Felipe 2026-10-12: «compactar por defecto para visualizar más rápido la tabla»). Las mismas cifras de las
// tarjetas —con plan, a comprar, inversión y lo que queda del tope, lo vendido y lo que sobra—, sin ocupar media pantalla. «Ver detalle»
// abre las tarjetas, la banda de lo que sobra y el simulador.

export function ResumenCompactoPlan({
  totales,
  estado,
  tope,
  recuperoPct,
  sedes,
  onAbrir,
}: {
  /** Las sedes que suma el plan (las que tienen stock de alguna categoría), para decirlo en el «!». */
  sedes: readonly string[];
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
      {/* El plan es uno solo para toda CAYLA (Felipe 2026-10-12: «¿cómo sé que esto es de una sola tienda?»): se dice aquí, porque el
          selector de sede de la cabecera dice una tienda y no filtra esta pantalla. */}
      <span className="inline-flex items-center gap-1.5">
        <b className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.13em] text-tinta">Toda CAYLA</b>
        <Ayuda titulo="Toda CAYLA">
          <span className="block">
            El plan es uno solo para todas las tiendas: lo vendido, lo que hay y lo que conviene comprar suman{" "}
            {sedes.length > 0 ? `${sedes.slice(0, -1).join(", ")}${sedes.length > 1 ? " y " : ""}${sedes.at(-1)}` : "todas las tiendas y el Taller"}.
          </span>
          <span className="mt-2 block">La sede elegida arriba (la de Vender y Caja) no filtra esta pantalla.</span>
          <span className="mt-2 block">Por tienda: la hoja de cada categoría dice cuánto hay en cada una, y Resultados tiene una píldora por tienda.</span>
        </Ayuda>
      </span>
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
