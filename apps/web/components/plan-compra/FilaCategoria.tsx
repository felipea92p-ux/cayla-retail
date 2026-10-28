import { celda, fila, type Columna } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { frasesDeEnCompras, paso2PorRevisar } from "@/lib/plan-compra-envio";
import { fraseDelPedido } from "@/lib/plan-compra-pedido";
import { periodoDeVentas } from "@/lib/plan-compra-periodo";
import { BarraRango } from "@/components/plan-compra/BarraRango";
import { enteroES, esAgotada, fraseDeLoReal, margenPorPrenda, solesES, type EstadoCampana, type FilaPlan } from "@/lib/plan-compra-reglas";
import type { EstadoDelPlazo, PlazoDePedido } from "@/lib/plan-compra-plazo";
import type { TonoChip } from "@/components/ui/Chip";
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

/** El tono del chip de la fecha límite de una fila (ADR-0499): el mismo criterio que la franja de arriba. */
const TONO_DEL_PLAZO: Record<EstadoDelPlazo, TonoChip> = { a_tiempo: "verde", justo: "ambar", tarde: "rojo", empezo: "pizarra", termino: "neutro" };

export function FilaCategoria({
  f,
  forma,
  indice,
  recienGuardada = false,
  plazo = null,
  onAbrir,
}: {
  f: FilaPlan;
  forma: FormaTabla;
  indice: number;
  recienGuardada?: boolean;
  /** La fecha límite para pedir: una fila con compra pendiente la dice. */
  plazo?: PlazoDePedido | null;
  onAbrir: () => void;
}) {
  const { c, linea, stock, calculo, vendido, ventas, puesto, diasDeVentas } = f;
  const plantilla = plantillaDelPlan(forma);
  const agotada = esAgotada(f);
  // El descuento que se supuso (ADR-0499): con él, lo que se gana por prenda en la campaña; si se come el margen, la fila lo dice.
  const descuento = linea?.descuentoPct ?? 0;
  const margen = linea && descuento > 0 ? margenPorPrenda(linea.precio, linea.costo, descuento) : null;
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
        {/* «Vendiste 366 en los 26 días que lleva el ERP» es el doble de larga que «en 90 días»: la celda no envuelve y la cortaba a 980 px. */}
        <span className={`block whitespace-normal text-[13px] ${agotada ? "font-medium text-ambar-profundo" : "text-tinta/70"}`}>
          {agotada
            ? `Se agotó: vendía ${enteroES.format(ventas)} en ${periodoDeVentas(diasDeVentas)}`
            : ventas > 0
              ? `Vendiste ${enteroES.format(ventas)} en ${periodoDeVentas(diasDeVentas)}`
              : `Sin ventas en ${periodoDeVentas(diasDeVentas)}`}
        </span>
        {margen && (
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip tono="ambar" versalitas={false}>
              −{descuento.toLocaleString("es-PE", { maximumFractionDigits: 2 })} % en la campaña
            </Chip>
            <span className={`text-[12.5px] ${margen.pierde ? "font-medium text-rojo-profundo" : "text-tinta/70"}`}>
              {margen.pierde ? "no deja ganancia" : `ganas ${solesES(margen.enCampana)} por prenda`}
            </span>
          </span>
        )}
      </span>
      {forma.venta && (
        // El botón «Armar plan» sube 2 px al pasar el mouse (`.mov-boton`) y la celda recorta lo que se sale (`truncate`): le cortaba el borde de
        // arriba. Sin plan no hay nada que truncar, así que esa celda deja ver el botón entero; la barra de rango sí se queda recortada.
        <span className={celda("izq", linea && calculo ? "min-w-0" : "min-w-0 overflow-visible!")}>
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
            {f.paso2 !== undefined && calculo && calculo.comprar > 0 && (
              // El paso 2 (ADR-0526): qué modelos, colores y tallas. Si el total del paso 1 cambió después de guardarlo, lo dice: lo repartido ya no es lo que se compra.
              <span className="mt-1 block font-normal" data-guia="plan.paso2-marca">
                {f.paso2 === null ? (
                  <span className="text-xs text-taupe-profundo">Paso 2 por hacer</span>
                ) : paso2PorRevisar(f.paso2.total, calculo.comprar, f.envio?.confirmadas ?? 0) ? (
                  <Chip tono="ambar" versalitas={false} title={`El total del paso 1 cambió de ${f.paso2.total} a ${calculo.comprar + (f.envio?.confirmadas ?? 0)} desde que se guardó el paso 2`}>
                    Paso 2 por revisar
                  </Chip>
                ) : (
                  <Chip tono="verde" versalitas={false} title={`Guardado${f.paso2.por ? ` por ${f.paso2.por}` : ""}: ${f.paso2.unidades} prendas en modelos`}>
                    Paso 2 hecho
                  </Chip>
                )}
              </span>
            )}
            {f.envio && (
              // Lo que esta categoría tiene en Compras (ADR-0530): pedidos pendientes de confirmar, ya pedidos, y si el plan cambió desde que se enviaron.
              <span className="mt-1 flex flex-wrap items-center justify-end gap-1 font-normal" data-guia="plan.en-compras">
                {(() => {
                  const frases = frasesDeEnCompras(f.envio);
                  return (
                    <>
                      {frases.pendientes && (
                        <Chip tono="ambar" versalitas={false} title="Enviado desde el Plan: falta confirmarlo en Compras ▸ Órdenes. Nada se ha pedido todavía.">
                          {frases.pendientes}
                        </Chip>
                      )}
                      {frases.pedidos && (
                        <Chip tono="verde" versalitas={false} title="Ya es una orden de compra">
                          {frases.pedidos}
                        </Chip>
                      )}
                      {frases.cambio && (
                        <Chip tono="ambar" versalitas={false} title="El paso 2 se guardó otra vez después de enviar: lo que está en Compras tiene lo de antes">
                          {frases.cambio}
                        </Chip>
                      )}
                    </>
                  );
                })()}
              </span>
            )}
            {plazo && plazo.estado !== "termino" && calculo && calculo.comprar > 0 && (
              // La fecha límite para pedir (ADR-0499): solo donde hay algo por pedir.
              <span className="mt-1 block font-normal">
                <Chip tono={TONO_DEL_PLAZO[plazo.estado]} versalitas={false} title={plazo.detalle}>
                  {plazo.estado === "empezo" ? `Llega el ${plazo.llegariaEl.slice(8)}/${plazo.llegariaEl.slice(5, 7)}` : plazo.texto}
                </Chip>
              </span>
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
