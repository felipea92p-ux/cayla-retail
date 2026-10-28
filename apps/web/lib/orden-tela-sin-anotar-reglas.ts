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
//            pueden usar después del corte); que una tela en varios colores es UNA sola; que una muestra (no entra al stock ni deja costo) no avisa nada; y que una orden que NO declaró ninguna tela
//            (un avío solo no es tela) avisa aparte, con `avisoSinTelaDeclarada` (ADR-0510): antes era «legítimo» porque no había cómo declararla después; ahora sí lo hay.
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

export type AvisoSinTelaDeclarada = {
  /** La frase del aviso, en lenguaje de tienda. */
  texto: string;
};

/**
 * El aviso de una orden que NO declaró qué tela lleva (ADR-0510): sin tela declarada, «Anotar lo que usaste» no tiene nada que anotar y el lote entraría al stock con el costo por prenda sin
 * tela. Solo en un lote (una muestra no entra al stock ni deja costo). Un avío no cuenta como tela. Nunca bloquea: lo dice y ofrece declararla.
 */
export function avisoSinTelaDeclarada(insumos: readonly InsumoPagina[], esMuestra: boolean): AvisoSinTelaDeclarada | null {
  if (esMuestra) return null;
  if (telasDeLaOrden(insumos).some((t) => t.tipo === "tela")) return null;
  return { texto: "Esta orden no declaró qué tela lleva: el costo por prenda saldría sin tela." };
}

/**
 * El aviso de la hoja «Terminé» cuando con lo que se anota queda cortado todo el lote y la orden no declaró ninguna tela: no hay tela que descontar del estante, y después de Corte es cuando
 * se sabe cuánta se usó de verdad. Vale también para una muestra (de ella sale el consumo del modelo). `completaElCorte` lo decide la hoja (primera fase y todo lo que falta).
 */
export function avisoCorteSinTela(insumos: readonly InsumoPagina[], completaElCorte: boolean): AvisoSinTelaDeclarada | null {
  if (!completaElCorte) return null;
  if (telasDeLaOrden(insumos).some((t) => t.tipo === "tela")) return null;
  return { texto: "Esta orden no declaró qué tela lleva, así que no se descuenta nada del estante. Antes de terminar, cierra esta hoja y usa «Declarar tela y avíos» en la sección Tela y avíos." };
}
