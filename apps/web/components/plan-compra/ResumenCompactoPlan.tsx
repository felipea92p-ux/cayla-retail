import { ChevronDown } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { enteroES, solesES, type EstadoCampana, type TotalesPlan } from "@/lib/plan-compra-reglas";

// El resumen del Plan, compacto (Felipe 2026-10-12: «compactar por defecto para visualizar más rápido la tabla»; la primera versión, una frase
// corrida, «no quedaba bien», y la segunda se partía en tres columnas en un laptop). Una barra de cifras: cada una con su nombre chico arriba y su número abajo, separadas por una línea fina, y
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
      bajo: queda === null ? "al costo" : queda >= 0 ? `quedan ${solesES(queda)}` : `te pasas ${solesES(-queda)}`,
      tono: queda !== null && queda < 0 ? "text-rojo-profundo" : undefined,
    },
    ...(estado !== "antes" ? [{ etiqueta: "Vendido", valor: enteroES.format(totales.vendido), bajo: "en la campaña" }] : []),
    ...(recuperoPct !== null ? [{ etiqueta: "Lo que sobra", valor: `${recuperoPct} %`, bajo: "del precio" }] : []),
  ];
  return (
    // Una sola fila según el ancho de la TARJETA, no de la ventana (Felipe 2026-10-12: a ~940 px de tarjeta se partía en una grilla de
    // tres columnas «que no queda bien»). Solo en una tarjeta angosta (celular) pasa a dos columnas, sin líneas sueltas al borde.
    // Con el «!» abierto, la tarjeta sube sobre la tabla: `@container` encierra el globo y la búsqueda de abajo lo tapaba (Felipe 2026-10-12).
    <div data-guia="plan.cifras" className="card-cayla @container has-[.anim-globo]:relative has-[.anim-globo]:z-30">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-3 @3xl:flex @3xl:flex-wrap @3xl:items-center @3xl:gap-x-0 @3xl:px-1">
        <div className="col-span-2 flex flex-col justify-center @3xl:px-3">
          <span className="flex items-center gap-1.5">
            <b className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] text-tinta">Toda CAYLA</b>
            <Ayuda titulo="Toda CAYLA">
              <span className="block">
                El plan es uno solo para todas las tiendas: lo vendido, lo que hay y lo que conviene comprar suman{" "}
                {sedes.length > 0 ? `${sedes.slice(0, -1).join(", ")}${sedes.length > 1 ? " y " : ""}${sedes.at(-1)}` : "todas las tiendas y el Taller"}.
              </span>
              <span className="mt-2 block">La sede elegida arriba (la de Vender y Caja) no filtra esta pantalla.</span>
              <span className="mt-2 block">Cuánto le toca a cada tienda está en la hoja de cada categoría; en Resultados, toca la tarjeta de una tienda.</span>
            </Ayuda>
          </span>
          <span className="mt-0.5 whitespace-nowrap text-xs text-taupe">todas las tiendas</span>
        </div>
        {cifras.map((x) => (
          <div key={x.etiqueta} className="flex min-w-0 flex-col justify-center @3xl:border-l @3xl:border-sand @3xl:px-3">
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{x.etiqueta}</span>
            <span className={`whitespace-nowrap font-display text-lg leading-tight tabular-nums ${x.tono ?? "text-tinta"}`}>{x.valor}</span>
            {x.bajo && <span className="whitespace-nowrap text-xs text-tinta/65">{x.bajo}</span>}
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-end @3xl:ml-auto @3xl:pl-2 @3xl:pr-1">
          <button type="button" data-guia="plan.detalle" onClick={onAbrir} aria-expanded={false} className="btn-cayla btn-sutil inline-flex items-center gap-1.5 whitespace-nowrap">
            {/* En una tarjeta angosta dice solo «Detalle», para que todo quepa en una fila. */}
            <span className="@5xl:hidden">Detalle</span>
            <span className="hidden @5xl:inline">Ver detalle</span>
            <ChevronDown aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
