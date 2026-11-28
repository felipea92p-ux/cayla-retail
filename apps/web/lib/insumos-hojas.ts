// Las palabras de las cuatro hojas de Insumos: «Nueva tela», «Nuevo avío», «Lo que ya tenías» y «Llegó una compra» (Felipe 2026-11-26, «Producción más clara»;
// maqueta docs/maquetas/produccion-resumen-2026-11/). Sin React ni red.
//
// EL PROBLEMA. Las hojas pedían sus datos con palabras de sistema («Composición», «Merma al cortar (%)», «¿Qué llegó?» para algo que nunca llegó: ya estaba en el estante) y mostraban un código que
// nadie escribe. Las reglas de cada hoja no cambian (`tela-nueva-reglas.ts`, `avio-nuevo-reglas.ts`, `insumos-guia.ts`): aquí solo se dice lo mismo con las palabras de quien lo llena.
//
// CONTRATO
//   PROMETE: los mismos campos de la guía de foco, en el mismo orden y con el mismo «hecho» y «requerido»; solo cambian el nombre y la frase de lo que falta. Un mensaje de «no se entiende lo escrito»
//            se conserva tal cual: dice cómo escribirlo.
//   NO HACE: no agrega ni quita una regla, no decide qué se puede guardar.

import type { CampoDeGuia } from "./guia-campos";
import { camposDeIngresoDeInsumo, type EntradaIngresoDeInsumo } from "./insumos-guia";
import { CANTIDAD_ILEGIBLE } from "./insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE } from "./monto-plata-reglas";

/** Las columnas de la tabla de colores de «Nueva tela» y «Nuevo avío» cuando la hoja es ancha: Color, [Ya tengo, (Son en metros), Me costó] (solo el líder), Avísame si baja de, ×.
 *  El código ya no es una columna: lo arma la base y nadie lo escribe. Angosta, la fila se apila (el color arriba, sus campos debajo) y la plantilla no se usa; `campos` dice cuántos van en esa fila. */
export function columnasDeColores(e: { puedeSaldo: boolean; conMetros: boolean }): { plantilla: string; campos: number } {
  const conMetros = e.puedeSaldo && e.conMetros;
  const cols = ["minmax(7rem,1.3fr)", ...(e.puedeSaldo ? ["minmax(0,1fr)"] : []), ...(conMetros ? ["5.5rem"] : []), ...(e.puedeSaldo ? ["minmax(0,1fr)"] : []), "minmax(0,1fr)", "2rem"];
  return { plantilla: cols.join(" "), campos: cols.length - 2 };
}

type Palabras = Record<string, Partial<Pick<CampoDeGuia, "nombre" | "pendiente">>>;

/** Los mismos campos de la guía, con el nombre (y la frase de lo que falta) que la hoja usa a la vista. Lo que no está en `palabras` queda igual. */
export function conPalabrasDeLaHoja(campos: readonly CampoDeGuia[], palabras: Palabras): CampoDeGuia[] {
  return campos.map((c) => ({ ...c, ...palabras[c.id] }));
}

/** «Nueva tela»: la composición se pregunta «De qué está hecha» y la merma, «Se pierde al cortar». */
export const PALABRAS_DE_TELA: Palabras = { composicion: { nombre: "De qué está hecha" }, merma: { nombre: "Lo que se pierde al cortar" } };

/** «Nuevo avío»: la merma de lo que se mide en metros, con las mismas palabras que en una tela. */
export const PALABRAS_DE_AVIO: Palabras = { merma: { nombre: "Lo que se pierde al cortar" } };

/** «Lo que ya tenías» (el saldo inicial): nada «llegó», ya estaba en el estante. Los campos son los de `camposDeIngresoDeInsumo`, con las palabras de esta hoja. */
export function camposDeLoQueYaTenias(e: EntradaIngresoDeInsumo): CampoDeGuia[] {
  return camposDeIngresoDeInsumo(e).map((c) => {
    if (c.id === "insumo") return { ...c, nombre: "Qué tela o avío", pendiente: "Elige la tela o el avío que ya tenías." };
    if (c.id === "cantidad") return { ...c, nombre: "Cuánto había", pendiente: c.pendiente === CANTIDAD_ILEGIBLE ? c.pendiente : "Escribe cuánto había (más de cero)." };
    if (c.id === "costo") return { ...c, nombre: "Cuánto costó", pendiente: c.pendiente === COSTO_UNITARIO_ILEGIBLE ? c.pendiente : "Escribe cuánto costó, sin IGV (0 si fue un regalo)." };
    return { ...c, pendiente: "Elige quién lo anota." };
  });
}
