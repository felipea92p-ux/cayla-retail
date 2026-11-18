// La guía de foco de «Agregar color» y «Agregar talla» (CLAUDE.md «Guía de foco», ADR-0284; ADR-0494, actividad 3).
// Sin React ni red.
//
// CONTRATO
//   PROMETE: dada la foto de lo que el modal ya tiene (qué se eligió, las tallas, el precio, las unidades), la lista de campos con su
//            «hecho» para `useGuiaCampos`: cuál sigue y qué falta antes del botón.
//   ASUME:   `hecho` sale de la MISMA regla que apaga el botón del modal (`puede`): una prueba recorre los casos contra ella. Las
//            unidades de partida son SUGERIDAS, nunca un candado: una variante puede nacer en 0 (se carga después en Existencias).
//   NO HACE: no decide nada del negocio (precio, tallas habilitadas, carga inicial cerrada): eso es de las reglas de siempre.

import type { CampoDeGuia } from "./guia-campos";

export type FotoDelModalDeAgregar = {
  /** Agregar color: de qué color son las que la prenda ya tenía como «Sin color» (solo si lo eran). `eraSinColor` los distingue. */
  eraSinColor?: boolean;
  colorDeLasQueTiene?: string;
  /** Lo que se está agregando: colores elegidos (color) o tallas elegidas (talla). */
  elegidos: number;
  /** Hay tallas entre las que elegir (una prenda de talla única no pide elegir) y cuántas hay marcadas. */
  pideTallas?: boolean;
  tallasMarcadas?: number;
  /** Cuántas variantes nacen de verdad (no solo se reactivan) y si el precio escrito vale. */
  nacen: number;
  precioOk: boolean;
  /** ¿Puede poner unidades? (tiene «Ajustar stock») y cuántas puso. */
  puedeCargar: boolean;
  unidades: number;
  /** Lo que se agrega, para las frases: «color» o «talla». */
  que: "color" | "talla";
};

export function camposDeAgregarVariante(f: FotoDelModalDeAgregar): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (f.eraSinColor) {
    campos.push({ id: "color-previo", nombre: "Color de las que ya tienes", requerido: true, hecho: !!f.colorDeLasQueTiene, pendiente: "Di de qué color son las que ya tienes." });
  }
  campos.push({
    id: "elegidos",
    nombre: f.que === "color" ? "Color" : "Talla",
    requerido: true,
    hecho: f.elegidos > 0,
    pendiente: f.que === "color" ? "Elige el color que llegó." : "Elige la talla que llegó.",
  });
  if (f.que === "color" && f.pideTallas) {
    campos.push({ id: "tallas", nombre: "Tallas", requerido: true, hecho: (f.tallasMarcadas ?? 0) > 0, pendiente: "Marca en qué tallas viene." });
  }
  if (f.nacen > 0) {
    campos.push({ id: "precio", nombre: "Precio", requerido: true, hecho: f.precioOk, pendiente: "Pon el precio de venta de las nuevas." });
  }
  if (f.puedeCargar && f.nacen > 0) {
    // Sugerido y nunca un candado: «nacen en 0» es válido (la mercadería se carga después).
    campos.push({ id: "unidades", nombre: "Unidades de partida", requerido: false, sugerido: true, hecho: f.unidades > 0, pendiente: "Pon con cuántas unidades nace cada una (o déjalas en 0)." });
  }
  return campos;
}
