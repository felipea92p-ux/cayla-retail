import { celda, fila, type Columna } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { fraseDelPedido } from "@/lib/plan-compra-pedido";
import { BarraRango } from "@/components/plan-compra/BarraRango";
import { enteroES, esAgotada, fraseDeLoReal, solesES, type EstadoCampana, type FilaPlan } from "@/lib/plan-compra-reglas";
import type { FormaTabla } from "@/lib/plan-compra-momento";

// Una fila de la tabla del plan de campaña (ADR-0349): la categoría (con su puesto si es de las que más venden), su barra de rango, lo
// que ya hay en las tiendas y el Taller, cuánto comprar y cuánto cuesta; durante y después de la campaña, lo que se vendió de verdad al
// lado. Toda ella es un botón que abre su hoja. Las columnas que no tienen nada que decir no se dibujan (`formaDeLaTabla`, prompt maestro
// 2026-10-13): con 0 planes, «Comprar» e «Inversión» eran 42 rayas; con la campaña empezada y sin plan, tampoco hay venta esperada.

// Una plantilla por cada forma posible (son 4, lo vigila lib/plan-compra-momento.test.ts). Escritas enteras: Tailwind solo genera la clase
// que ve escrita.
const PLANTILLAS: Record<string, string> = {
  "venta+compra+real": "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1.3fr)]",
  "venta+compra": "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,2.2fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]",
  venta: "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]",
  real: "sm:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)]",
};
const claveDe = (forma: FormaTabla) => [forma.venta && "venta", forma.compra && "compra", forma.real && "real"].filter(Boolean).join("+");

export const plantillaDelPlan = (forma: FormaTabla) => PLANTILLAS[claveDe(forma)] ?? PLANTILLAS["venta+compra+real"];

export function columnasDelPlan(estado: EstadoCampana, forma: FormaTabla): Columna[] {
  return [
    { titulo: "Categoría" },
    ...(forma.venta ? [{ titulo: "Venta esperada", subtitulo: "flojo · normal · bueno" } as Columna] : []),
    { titulo: "Hay hoy", subtitulo: "tiendas y Taller", alinear: "der" },
    ...(forma.compra ? [{ titulo: "Comprar", alinear: "der" } as Columna, { titulo: "Inversión", subtitulo: "al costo", alinear: "der" } as Columna] : []),
    ...(forma.real ? [{ titulo: estado === "durante" ? "Vendido hasta hoy" : "Lo que pasó", alinear: forma.compra ? "izq" : "der" } as Columna] : []),
  ];
}

export function FilaCategoria({
  f,
  forma,
  indice,
  recienGuardada = false,
  onAbrir,
}: {
  f: FilaPlan;
  forma: FormaTabla;
  indice: number;
  recienGuardada?: boolean;
  onAbrir: () => void;
}) {
  const { c, linea, stock, calculo, vendido, ventas, puesto } = f;
  const plantilla = plantillaDelPlan(forma);
  const agotada = esAgotada(f);
  const paso = Math.min(indice, 8);
  return (
    <button
      type="button"
      onClick={onAbrir}
      data-guia="plan.categoria"
      style={{ ["--i" as string]: paso }}
      // La fila que se acaba de guardar se enciende en verde una vez y se apaga sola (la confirmación de Por pagar, `anim-destello-ok`).
      className={`${fila(plantilla)} ${recienGuardada ? "anim-destello-ok" : "anim-sube"} w-full text-left transition-colors hover:bg-sand/30`}
      aria-label={`${linea ? "Corregir" : "Armar"} el plan de ${c.nombre}`}
    >
      <span className={celda("izq", "min-w-0")}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-[19px] leading-tight text-tinta">
          {puesto !== null && <Chip tono="pizarra">N.º {puesto}</Chip>}
          {c.nombre}
        </span>
        <span className={`block text-[13px] ${agotada ? "font-medium text-ambar-profundo" : "text-tinta/70"}`}>
          {agotada ? `Se agotó: vendía ${enteroES.format(ventas)} en 90 días` : ventas > 0 ? `Vendiste ${enteroES.format(ventas)} en 90 días` : "Sin ventas en 90 días"}
        </span>
      </span>
      {forma.venta && (
        <span className={celda("izq", "min-w-0")}>
          {linea && calculo ? (
            <BarraRango linea={linea} calculo={calculo} vendido={forma.real ? vendido : 0} retraso={paso} enCamino={f.enCamino} />
          ) : (
            // Solo el botón: el «Sin plan» de al lado decía lo mismo 42 veces. Secundario siempre: la acción principal de la pantalla es UNA,
            // arriba («Empezar por …»), no una por fila (Formidable 2026-10-10).
            <span className="btn-cayla btn-secundario">Armar plan</span>
          )}
        </span>
      )}
      <span className={celda("der", "tabular-nums")}>
        <span className="text-taupe-profundo sm:hidden">Hay hoy: </span>
        {enteroES.format(stock)}
      </span>
      {forma.compra && (
        <>
          <span className={celda("der", "tabular-nums font-semibold text-tinta")}>
            <span className="font-normal text-taupe-profundo sm:hidden">Comprar: </span>
            {calculo ? enteroES.format(calculo.comprar) : "—"}
            {fraseDelPedido(f.pedido, calculo ?? null) && (
              <span className="block text-xs font-normal text-taupe-profundo">{fraseDelPedido(f.pedido, calculo ?? null)}</span>
            )}
          </span>
          <span className={celda("der", "tabular-nums")}>
            <span className="text-taupe-profundo sm:hidden">Inversión: </span>
            {calculo ? solesES(calculo.inversion) : "—"}
          </span>
        </>
      )}
      {forma.real &&
        (linea ? (
          <span className={celda("izq", "text-sm text-tinta/75")}>{fraseDeLoReal(vendido, linea)}</span>
        ) : (
          // Sin plan, una cifra (antes una frase con punto, «Se vendieron 172.», que no se lee en columna).
          <span className={celda(forma.compra ? "izq" : "der", "tabular-nums")}>
            <span className="text-taupe-profundo sm:hidden">Vendido: </span>
            <b className="font-semibold text-tinta">{enteroES.format(vendido)}</b>
          </span>
        ))}
    </button>
  );
}
