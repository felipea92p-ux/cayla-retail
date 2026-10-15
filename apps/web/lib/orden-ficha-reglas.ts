// La ficha viva de «Nueva orden de producción» (ADR-0396, A3): lo que dice, escrito en palabras de tienda y probado sin React. La ficha NO decide nada de negocio: el formulario
// sigue siendo dueño de los números (total, costo, precio, margen) y de cuándo se puede abrir la orden; aquí solo se arman los textos que se leen a la derecha.
//
// CONTRATO
//   PROMETE: contar lo que SE FABRICA (un color o una talla sin una sola prenda no cuenta, como no cuenta en el total); escribir el precio y los montos igual que el resto del ERP
//            («S/ 89.90»); y no inventar un dato: lo que no se sabe (sin precio, sin fecha, sin nombre) se dice como «falta», nunca como 0.
//   ASUME:   las claves de celda y los ejes son los de `lib/orden-tabla-reglas.ts`; la fecha llega como «AAAA-MM-DD» (el `<input type="date">`).
//   NO HACE: no calcula el margen ni el costo (eso es `produccion-reglas.ts`), no mira permisos ni guarda nada.

import type { CeldaAlta } from "./alta-producto";
import { totalesCantidades } from "./tabla-alta-reglas";

/** «S/ 1,234.50»: el formato de dinero de las pantallas de Producción. */
export function soles(n: number): string {
  return `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-10-23» → «23 oct». Vacío o una fecha que no existe (el 31 de abril) → `null`: la ficha dice «sin fecha» y no inventa un día. */
export function fechaCorta(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return `${dia} ${MESES[mes - 1]}`;
}

/** Cuántos colores y cuántas tallas llevan prendas (no los que ofrece la tabla): una fila o una columna en cero no se fabrica. Sin color o sin talla ese eje no cuenta. */
export function contarQueSeFabrica(celdas: readonly CeldaAlta[], excluidas: ReadonlySet<string>, cantidades: Readonly<Record<string, string>>): { colores: number; tallas: number } {
  const t = totalesCantidades(celdas, excluidas, cantidades);
  const conPrendas = (porEje: Record<string, number>) => Object.entries(porEje).filter(([clave, n]) => clave !== "" && n > 0).length;
  return { colores: conPrendas(t.porFila), tallas: conPrendas(t.porColumna) };
}

/** «3 colores · 2 tallas» (o «1 color», «2 tallas»); `null` si no se fabrica nada todavía. */
export function textoColoresYTallas({ colores, tallas }: { colores: number; tallas: number }): string | null {
  const partes = [
    colores > 0 ? `${colores} ${colores === 1 ? "color" : "colores"}` : null,
    tallas > 0 ? `${tallas} ${tallas === 1 ? "talla" : "tallas"}` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** El nombre de arriba de la ficha. Sin modelo todavía y un modelo nuevo sin nombre se dicen distinto; ambos salen tenues (`vacio`). */
export function nombreDeLaFicha(o: { esNuevo: boolean; hayModelo: boolean; nombre: string }): { texto: string; vacio: boolean } {
  const nombre = o.nombre.trim();
  if (nombre) return { texto: nombre, vacio: false };
  return { texto: o.esNuevo ? "Sin nombre todavía" : "Sin modelo todavía", vacio: true };
}

/** «Se vende a»: el precio si lo hay; una muestra nueva sin precio dice «al aprobarla»; un lote nuevo sin precio, «—»; un modelo que existe sin precio no muestra la fila (la nota de abajo explica). */
export function textoSeVendeA(o: { precio: number; esNuevo: boolean; esMuestra: boolean }): string | null {
  if (o.precio > 0) return soles(o.precio);
  if (!o.esNuevo) return null;
  return o.esMuestra ? "al aprobarla" : "—";
}
