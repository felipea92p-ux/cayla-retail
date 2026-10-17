import type { InsumoPagina } from "./orden-pagina-reglas";
import { telasDeLaOrden, type TelaDeLaOrden } from "./orden-tela-usada-reglas";

// El aviso de «Pasar al stock» cuando la tela del lote todavía no se anotó (ADR-0400, «Tela y costo honestos» parte b; OK de Felipe, 2026-10-16). Sin React ni Supabase.
//
// EL PROBLEMA: `cerrar_produccion` toma el costo de la tela del libro de insumos (lo realmente descontado del estante). Si nadie anotó «lo que usaste», el lote entra al stock con un costo por
// prenda SIN tela (la OP-343 entró a S/ 4.50 en vez de S/ 22.38) y ese costo alimenta el promedio de la prenda en todas las sedes. La base no lo frena (es el primer lote del modelo, o el costo
// no se sale de la banda); la hoja avisa, y la persona decide.
//
// CONTRATO
//   PROMETE: que una tela cuenta como «sin anotar» solo si el plan le pide algo (plan > 0) y la orden no tiene NADA descontado (usado = 0); que un avío nunca cuenta (los botones y los cierres se
//            pueden usar después del corte); que una tela en varios colores es UNA sola; y que una orden sin tela declarada, o una muestra (no entra al stock ni deja costo), no avisa nada.
//   ASUME:   `telasDeLaOrden` junta los colores de un mismo insumo y toma como «usado» lo que dice el libro, que no sabe de colores.
//   NO HACE: no bloquea (es un aviso, nunca un candado: «Pasar al stock» sigue disponible), no calcula el costo ni toca la base, y no decide si la tela «debería» estar anotada por completo.

/** Las telas del plan (no los avíos) que piden algo y todavía no tienen nada descontado de esta orden. */
export function telasSinAnotar(insumos: readonly InsumoPagina[]): TelaDeLaOrden[] {
  return telasDeLaOrden(insumos).filter((t) => t.tipo === "tela" && t.plan > 0 && t.usado === 0);
}

export type AvisoTelaSinAnotar = {
  /** La primera tela sin anotar: es la que abre «Anotar lo que usaste» (si hay más, ahí mismo se cambia de tela). */
  insumoId: string;
  /** La frase del aviso, en lenguaje de tienda. */
  texto: string;
};

const nombres = (lista: readonly string[]) => (lista.length < 2 ? (lista[0] ?? "") : `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`);

/** El aviso de la hoja «Pasar al stock», o `null` si no corresponde (nada sin anotar, o una muestra). */
export function avisoTelaSinAnotar(insumos: readonly InsumoPagina[], esMuestra: boolean): AvisoTelaSinAnotar | null {
  if (esMuestra) return null;
  const telas = telasSinAnotar(insumos);
  if (telas.length === 0) return null;
  const quienes = nombres([...new Set(telas.map((t) => t.nombre))]);
  const texto = telas.length === 1 ? `Todavía no anotaste la tela de este lote (${quienes}): el costo por prenda saldría sin tela.` : `Todavía no anotaste las telas de este lote (${quienes}): el costo por prenda saldría sin ellas.`;
  return { insumoId: telas[0].insumoId, texto };
}
