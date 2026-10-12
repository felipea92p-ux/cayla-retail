import { ChevronDown } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { enteroES, solesES, type EstadoCampana, type TotalesPlan } from "@/lib/plan-compra-reglas";

// El resumen del Plan, compacto (Felipe 2026-10-12: «compactar por defecto para visualizar más rápido la tabla»; la primera versión, una frase
// corrida, «no quedaba bien»). Una barra de cifras: cada una con su nombre chico arriba y su número abajo, separadas por una línea fina, y
// «Ver detalle» en la misma fila. «Toda CAYLA» con su «!» dice que el plan suma todas las tiendas y que el selector de sede no lo filtra.

export function ResumenCompactoPlan({
  totales,
  estado,
  tope,
  recuperoPct,
  sedes,
  onAbrir,
}: {
  totales: TotalesPlan;
  estado: EstadoCampana;
  tope: number | null;
  recuperoPct: number | null;
  /** Las sedes que suma el plan (las que tienen stock de alguna categoría), para decirlo en el «!». */
  sedes: readonly string[];
  onAbrir: () => void;
}) {
  const queda = tope !== null ? Math.round((tope - totales.inversion) * 100) / 100 : null;
  const cifras: { etiqueta: string; valor: string; bajo?: string; tono?: string }[] = [
    { etiqueta: "Con plan", valor: `${enteroES.format(totales.conPlan)} de ${enteroES.format(totales.total)}`, bajo: "categorías" },
    { etiqueta: "A comprar", valor: enteroES.format(totales.aComprar), bajo: "prendas" },
    {
      etiqueta: "Inversión",
      valor: solesES(totales.inversion),
      bajo: queda === null ? "al costo" : queda >= 0 ? `te quedan ${solesES(queda)}` : `te pasas ${solesES(-queda)}`,
      tono: queda !== null && queda < 0 ? "text-rojo-profundo" : undefined,
    },
    ...(estado !== "antes" ? [{ etiqueta: "Vendido", valor: enteroES.format(totales.vendido), bajo: "en la campaña" }] : []),
    ...(recuperoPct !== null ? [{ etiqueta: "Lo que sobra", valor: `${recuperoPct} %`, bajo: "del precio" }] : []),
  ];
  return (
    // Ancho: una fila con separadores finos. Angosto: una grilla limpia (sin líneas que queden sueltas al borde al partirse la fila).
    <div className="card-cayla grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-3 md:grid-cols-3 xl:flex xl:items-stretch xl:gap-0 xl:px-2">
      <div className="col-span-2 flex flex-col justify-center md:col-span-3 xl:col-span-1 xl:px-4">
        <span className="flex items-center gap-1.5">
          <b className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.13em] text-tinta">Toda CAYLA</b>
          <Ayuda titulo="Toda CAYLA">
            <span className="block">
              El plan es uno solo para todas las tiendas: lo vendido, lo que hay y lo que conviene comprar suman{" "}
              {sedes.length > 0 ? `${sedes.slice(0, -1).join(", ")}${sedes.length > 1 ? " y " : ""}${sedes.at(-1)}` : "todas las tiendas y el Taller"}.
            </span>
            <span className="mt-2 block">La sede elegida arriba (la de Vender y Caja) no filtra esta pantalla.</span>
            <span className="mt-2 block">Cuánto le toca a cada tienda está en la hoja de cada categoría; Resultados tiene una píldora por tienda.</span>
          </Ayuda>
        </span>
        <span className="mt-0.5 text-xs text-taupe">todas las tiendas</span>
      </div>
      {cifras.map((x) => (
        <div key={x.etiqueta} className="flex min-w-0 flex-col justify-center xl:min-w-32 xl:border-l xl:border-sand xl:px-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{x.etiqueta}</span>
          <span className={`font-display text-xl leading-tight tabular-nums ${x.tono ?? "text-tinta"}`}>{x.valor}</span>
          {x.bajo && <span className="whitespace-nowrap text-xs text-tinta/65">{x.bajo}</span>}
        </div>
      ))}
      <div className="col-span-2 flex items-center justify-end md:col-span-3 xl:col-span-1 xl:ml-auto xl:px-3">
        <button type="button" onClick={onAbrir} aria-expanded={false} className="btn-cayla btn-sutil inline-flex items-center gap-1.5 whitespace-nowrap">
          Ver detalle
          <ChevronDown aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
