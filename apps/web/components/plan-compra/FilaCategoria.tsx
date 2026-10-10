import { celda, fila, type Columna } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { BarraRango } from "@/components/plan-compra/BarraRango";
import { enteroES, esAgotada, fraseDeLoReal, solesES, type EstadoCampana, type FilaPlan } from "@/lib/plan-compra-reglas";

// Una fila de la tabla del plan de campaña (ADR-0349): la categoría (con su puesto si es de las que más venden), su barra de rango, lo
// que ya hay en la red, cuánto comprar y cuánto cuesta; durante y después de la campaña, lo que se vendió de verdad al lado. Toda ella
// es un botón que abre su hoja. Una categoría sin plan no muestra barra: dice «Sin plan» y ofrece armarlo.

export const plantillaDelPlan = (verReal: boolean) =>
  verReal
    ? "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1.3fr)]"
    : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,2.2fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]";

export function columnasDelPlan(estado: EstadoCampana): Columna[] {
  return [
    { titulo: "Categoría" },
    { titulo: "Venta esperada", subtitulo: "flojo · normal · bueno" },
    { titulo: "Hay hoy", subtitulo: "en la red", alinear: "der" },
    { titulo: "Comprar", alinear: "der" },
    { titulo: "Inversión", subtitulo: "al costo", alinear: "der" },
    ...(estado !== "antes" ? [{ titulo: estado === "durante" ? "Vendido hasta hoy" : "Lo que pasó" } as Columna] : []),
  ];
}

export function FilaCategoria({ f, estado, indice, onAbrir }: { f: FilaPlan; estado: EstadoCampana; indice: number; onAbrir: () => void }) {
  const { c, linea, stock, calculo, vendido, ventas, puesto } = f;
  const verReal = estado !== "antes";
  const plantilla = plantillaDelPlan(verReal);
  const agotada = esAgotada(f);
  const paso = Math.min(indice, 8);
  return (
    <button
      type="button"
      onClick={onAbrir}
      style={{ ["--i" as string]: paso }}
      className={`${fila(plantilla)} anim-sube w-full text-left transition-colors hover:bg-sand/30`}
      aria-label={`${linea ? "Corregir" : "Armar"} el plan de ${c.nombre}`}
    >
      <span className={celda("izq", "min-w-0")}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-[19px] leading-tight text-tinta">
          {puesto !== null && <Chip tono="verde">N.º {puesto}</Chip>}
          {c.nombre}
        </span>
        <span className={`block text-[13px] ${agotada ? "font-medium text-ambar-profundo" : "text-tinta/70"}`}>
          {agotada ? `Se agotó: vendía ${enteroES.format(ventas)} en 90 días` : ventas > 0 ? `Vendiste ${enteroES.format(ventas)} en 90 días` : "Sin ventas en 90 días"}
        </span>
      </span>
      <span className={celda("izq", "min-w-0")}>
        {linea && calculo ? (
          <BarraRango linea={linea} calculo={calculo} vendido={verReal ? vendido : 0} retraso={paso} />
        ) : (
          <span className="flex flex-wrap items-center gap-3">
            <Chip tono="pizarra">Sin plan</Chip>
            <span className={`btn-cayla ${puesto !== null ? "btn-primario" : "btn-secundario"}`}>Armar plan</span>
          </span>
        )}
      </span>
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Hay hoy: </span>
        {enteroES.format(stock)}
      </span>
      <span className={celda("der", "tabular-nums font-semibold text-tinta")}>
        <span className="font-normal text-taupe-profundo sm:hidden">Comprar: </span>
        {calculo ? enteroES.format(calculo.comprar) : "—"}
      </span>
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Inversión: </span>
        {calculo ? solesES(calculo.inversion) : "—"}
      </span>
      {verReal && (
        <span className={celda("izq", "text-sm text-tinta/75")}>{linea ? fraseDeLoReal(vendido, linea) : `Se vendieron ${enteroES.format(vendido)}.`}</span>
      )}
    </button>
  );
}
