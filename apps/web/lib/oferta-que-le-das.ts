// «Qué le das» de la hoja de ofertas (ADR-0677, actividad 7a de la maqueta `docs/maquetas/campanas-simple-2026-11/`): las cinco formas de oferta
// como opciones, y el ejemplo ES la opción (Felipe 2026-11-17: «un 3x2 o un descuento se entienden a simple vista»). La elegida dice sus
// números de ahora; las demás, los de fábrica (`FORMA_DE_FABRICA`). Lógica pura: la hoja solo la dibuja.

import { FORMA_DE_FABRICA, type FormaDeOferta, type TipoOferta } from "./campana-reglas";

export type OpcionDeQueLeDas = { tipo: TipoOferta; glifo: string; linea: string; elegida: boolean };

/** El orden de la maqueta: lo más común primero. */
export const TIPOS_DE_OFERTA: readonly TipoOferta[] = ["pct", "nxm", "n_por_monto", "nesima_pct", "monto"];

const num = (n: number) => String(n).replace(".", ",");
const soles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

type FormaVista = Pick<FormaDeOferta, "tipo" | "porcentaje" | "lleva" | "paga" | "monto" | "escalones" | "ahorroEn">;

/**
 * Las cinco opciones con su ejemplo en grande y una línea corta. `o` es la oferta que se arma; `elegido` dice si la persona ya eligió una
 * (antes de elegir, ninguna se marca y el «llevar varias» muestra sus dos ejemplos de tienda: la prueba ciega buscaba «2 x 1» y no lo veía).
 */
export function opcionesDeQueLeDas(o: FormaVista, elegido: boolean): OpcionDeQueLeDas[] {
  return TIPOS_DE_OFERTA.map((tipo) => {
    const esta = elegido && o.tipo === tipo;
    const f: FormaVista = esta ? o : { ...FORMA_DE_FABRICA[tipo], tipo };
    return { tipo, elegida: esta, ...ejemplo(f, esta) };
  });
}

function ejemplo(f: FormaVista, esta: boolean): { glifo: string; linea: string } {
  switch (f.tipo) {
    case "nxm":
      return esta ? { glifo: `${f.lleva} x ${f.paga}`, linea: `Lleva ${f.lleva}, paga ${f.paga}` } : { glifo: "3 x 2 · 2 x 1", linea: "Lleva más, paga menos" };
    case "n_por_monto":
      return { glifo: `${f.lleva} por ${soles(f.monto)}`, linea: "Precio por varias" };
    case "nesima_pct":
      return { glifo: `${f.lleva}.ª −${num(f.porcentaje)} %`, linea: f.lleva === 2 ? "La segunda" : `La ${f.lleva}.ª` };
    case "monto": {
      const primero = f.escalones?.[0] ?? { desde: 300, ahorra: 30 };
      const ahorro = f.ahorroEn === "pct" ? `−${num(primero.ahorra)} %` : `−${soles(primero.ahorra)}`;
      return { glifo: ahorro, linea: `Desde ${soles(primero.desde)}` };
    }
    default:
      return { glifo: `−${num(f.porcentaje)} %`, linea: "Descuento" };
  }
}
