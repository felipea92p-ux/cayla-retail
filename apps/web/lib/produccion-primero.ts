// «¿Qué fabrico primero?» del Resumen de Producción (Formidable, 2026-10-27). Puro: sin Supabase ni React.
//
// El Resumen decía lo mismo dos veces —un aviso de «81 modelos por producir» y una tabla con esos mismos 81— con cifras que una persona nueva no sabe leer («8,6 por semana» al
// lado de «6 en 30 d», una barra con dos rayitas). Esto lo junta en UNA lista con UNA pregunta: a cada modelo le pone una frase en palabras de tienda y UNA cantidad. No hay
// ninguna regla nueva: los modelos son los de `producir_ya` de `filasPorModelo`, y la cantidad es la de `sugerenciaDeOrden` —la misma que precarga «Nueva orden»—, que con poca base
// (ADR-0346: 2 ventas o menos) no dice cantidad. El ritmo y la cobertura no desaparecen: viven bajo «¿Por qué?» (ley 6) y en la hoja «Ver el modelo».

import { DIAS_RITMO_RECIENTE } from "./inventario-reglas";
import { DIAS_OBJETIVO_PRODUCCION } from "./produccion-decision-reglas";
import { baseDelRitmo, sugerenciaDeOrden, textoDiasDeStock, type FilaModelo } from "./produccion-decisiones";

/** Cuántos modelos con ventas firmes se ven de entrada; el resto baja en su lugar con «Ver N más». */
export const PRIMEROS_QUE_SE_VEN = 6;

export type FilaPrimero = {
  productoId: string;
  referencia: string;
  /** «Se agotó en las tiendas · vendió 12 en el último mes». Sin ritmo ni barras: solo lo que pasó. */
  frase: string;
  /** Prendas que conviene fabricar. `null` con poca base: una cantidad con tan pocas ventas es ruido (ADR-0346). */
  cantidad: number | null;
  /** La cuenta, para quien la quiera ver (bajo «¿Por qué?»). */
  porque: string;
  /** El modelo ya tiene una orden abierta (que no alcanza): el texto de arriba no puede decir «ninguno tiene orden». */
  conOrden: boolean;
};

export type QueFabricarPrimero = {
  /** Con 3 o más ventas en el mes: en estos sí se sugiere cuánto fabricar. En el orden de la tabla (el más urgente primero). */
  firmes: FilaPrimero[];
  /** Con 1 o 2 ventas: se miran, pero todavía no se corta tela por ellos. */
  vigilar: FilaPrimero[];
  /** La frase de arriba: «Estos modelos se están agotando y sí se venden. Hoy ninguno tiene una orden abierta.» */
  presentacion: string;
};

const prendasTexto = (n: number) => (n === 1 ? "1 prenda" : `${n} prendas`);

/** «Se agotó en las tiendas · vendió 12 en el último mes» / «Quedan 4 en tiendas · vendió 18 en el último mes». */
export function fraseDeModelo(m: Pick<FilaModelo, "stockRed" | "ventasBase">): string {
  const donde = m.stockRed <= 0 ? "Se agotó en las tiendas" : `Quedan ${m.stockRed} en tiendas`;
  return `${donde} · vendió ${m.ventasBase} en el último mes`;
}

/** La cuenta de un modelo en palabras de tienda. Habla de las mismas cifras que la tabla, pero sin «ritmo» ni «cobertura». */
export function porqueDeModelo(m: FilaModelo): string {
  const sugerida = sugerenciaDeOrden(m);
  const hay = m.stockRed <= 0 ? "hoy no queda ninguna en las tiendas" : `hoy quedan ${m.stockRed} en las tiendas, que alcanzan para ${textoDiasDeStock(m.stockRed, m.diasRed ?? 0)}`;
  const partes = [`Vendió ${m.ventasBase} en los últimos ${DIAS_RITMO_RECIENTE} días y ${hay}.`];
  if (sugerida) {
    const porTalla = sugerida.porTalla.length > 1 ? ` (${sugerida.porTalla.map((t) => `${t.talla} ${t.cantidad}`).join(" · ")})` : "";
    partes.push(`Para tener ${DIAS_OBJETIVO_PRODUCCION} días de venta hacen falta unas ${prendasTexto(sugerida.total)}${porTalla}.`);
  } else partes.push(`Con tan pocas ventas todavía no sabemos cuánto se vende de verdad: no sugerimos una cantidad.`);
  if (m.stockTaller > 0) partes.push(`En el Taller ya hay ${m.stockTaller} terminadas.`);
  if (m.enCamino > 0) partes.push(`Vienen ${m.enCamino} en camino.`);
  if (m.enProduccion > 0) partes.push(`Ya hay una orden abierta de ${prendasTexto(m.enProduccion)}, pero no alcanza.`);
  return partes.join(" ");
}

/** Los modelos de «Producir ya», partidos por cuántas ventas los respaldan. Mantiene el orden de `filasPorModelo` (días de stock, luego lo que más se vende). */
export function queFabricarPrimero(modelos: readonly FilaModelo[]): QueFabricarPrimero {
  const filas = modelos
    .filter((m) => m.estado === "producir_ya")
    .map((m) => ({ firme: !baseDelRitmo(m.ventasBase).pocaBase, fila: { productoId: m.productoId, referencia: m.referencia, frase: fraseDeModelo(m), cantidad: sugerenciaDeOrden(m)?.total ?? null, porque: porqueDeModelo(m), conOrden: m.enProduccion > 0 } satisfies FilaPrimero }));
  const firmes = filas.filter((f) => f.firme).map((f) => f.fila);
  const vigilar = filas.filter((f) => !f.firme).map((f) => f.fila);
  const conOrden = [...firmes, ...vigilar].filter((f) => f.conOrden).length;
  const total = firmes.length + vigilar.length;
  const presentacion =
    conOrden === 0
      ? "Estos modelos se están agotando y sí se venden. Hoy ninguno tiene una orden abierta."
      : conOrden === total
        ? "Estos modelos se están agotando y sí se venden. Ya tienen una orden abierta, pero no alcanza."
        : `Estos modelos se están agotando y sí se venden. ${conOrden === 1 ? "Uno ya tiene una orden abierta" : `${conOrden} ya tienen una orden abierta`}, pero no alcanza.`;
  return { firmes, vigilar, presentacion };
}
