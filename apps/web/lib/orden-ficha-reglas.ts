// La ficha viva de «Nueva orden de producción» (ADR-0396, A3): lo que dice, escrito en palabras de tienda y probado sin React. La ficha NO decide nada de negocio: el formulario
// sigue siendo dueño de los números (total, costo, precio, margen) y de cuándo se puede abrir la orden; aquí solo se arman los textos que se leen a la derecha.
//
// CONTRATO
//   PROMETE: que cada dato se pueda dibujar como una pieza con su nombre (nunca una frase con puntos medios); contar lo que SE FABRICA (un color o una talla sin una sola prenda no cuenta, como no cuenta en el total); escribir el precio y los montos igual que el resto del ERP
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

/** El nombre de arriba de la ficha. Sin modelo todavía y un modelo nuevo sin nombre se dicen distinto; ambos salen tenues (`vacio`). */
export function nombreDeLaFicha(o: { esNuevo: boolean; hayModelo: boolean; nombre: string }): { texto: string; vacio: boolean } {
  const nombre = o.nombre.trim();
  if (nombre) return { texto: nombre, vacio: false };
  return { texto: o.esNuevo ? "Sin nombre todavía" : "Sin modelo todavía", vacio: true };
}

/** Una parte del costo de cada prenda: la tela o una fase que sale afuera. `porPrenda` en soles, a dos decimales. */
export type ParteDelCosto = { clave: string; nombre: string; detalle: string | null; porPrenda: number };

/**
 * El costo por prenda partido en lo que lo forma: la tela y cada servicio de afuera (lo que cuesta cada una en toda la orden ÷ las prendas). Es lo que la
 * colaboradora lee como «cada prenda me sale tanto: tanto de tela, tanto de costura». Las partes SUMAN EXACTAMENTE `porPrenda` (el mismo número que la ficha
 * dice arriba y con el que se mide el margen): se reparten los céntimos por el resto mayor, así que nunca una línea queda una moneda corrida. Una parte en 0 no
 * se lista, y sin prendas o sin nada que costar no hay desglose (`[]`).
 */
export function partesDelCostoPorPrenda(o: {
  totalPrendas: number;
  /** El costo por prenda que dice la ficha (`costoUnitario` de `produccion-reglas.ts`): las partes cuadran con él. */
  porPrenda: number;
  partes: readonly { clave: string; nombre: string; detalle: string | null; costo: number }[];
}): ParteDelCosto[] {
  const conCosto = o.partes.filter((p) => p.costo > 0);
  if (o.totalPrendas <= 0 || o.porPrenda <= 0 || conCosto.length === 0) return [];
  const crudo = conCosto.map((p) => (p.costo / o.totalPrendas) * 100);
  const centimos = crudo.map((c) => Math.floor(c));
  // Mayor fracción primero: a quien más le falta se le da la moneda que sobra (o, si hubiera que quitar, se le quita a quien menos le tocaba).
  const orden = crudo.map((_, i) => i).sort((a, b) => crudo[b] - centimos[b] - (crudo[a] - centimos[a]) || a - b);
  let resto = Math.round(o.porPrenda * 100) - centimos.reduce((s, c) => s + c, 0);
  for (let paso = 0; resto !== 0 && paso < 1000; paso++) {
    if (resto > 0) {
      centimos[orden[paso % orden.length]] += 1;
      resto -= 1;
    } else {
      const i = orden[orden.length - 1 - (paso % orden.length)];
      if (centimos[i] > 0) {
        centimos[i] -= 1;
        resto += 1;
      }
    }
  }
  return conCosto.map((p, i) => ({ clave: p.clave, nombre: p.nombre, detalle: p.detalle, porPrenda: centimos[i] / 100 }));
}

/** «Se vende a»: el precio si lo hay; una muestra nueva sin precio dice «Al aprobarla»; una orden para vender de un modelo nuevo sin precio, «Sin precio todavía»; un modelo que existe sin precio no muestra la fila (la nota de abajo explica). */
export function textoSeVendeA(o: { precio: number; esNuevo: boolean; esMuestra: boolean }): string | null {
  if (o.precio > 0) return soles(o.precio);
  if (!o.esNuevo) return null;
  return o.esMuestra ? "Al aprobarla" : "Sin precio todavía";
}

/**
 * «Ganancia por prenda», en soles (Felipe 2026-11-26: reemplaza al margen en %, que había que saber leer): el precio con que se mide menos lo que cuesta hacerla.
 * El precio es el MISMO con que se pinta el semáforo (`precioParaMargen`: el más bajo de cualquier tienda, ADR-0370), así el número y su color nunca se contradicen.
 * `null` si falta el precio o el costo: igual que el semáforo, no se inventa una ganancia.
 */
export function gananciaPorPrenda(precioDeMedir: number, costoPorPrenda: number): number | null {
  if (!(precioDeMedir > 0) || !(costoPorPrenda > 0)) return null;
  return Math.round((precioDeMedir - costoPorPrenda) * 100) / 100;
}

/** La ganancia escrita: «S/ 50.60»; si hacerla cuesta más de lo que se cobra, con su signo delante («−S/ 4.20»), nunca un monto que se lea como ganancia. */
export function textoDeGanancia(ganancia: number): string {
  return ganancia < 0 ? `−${soles(Math.abs(ganancia))}` : soles(ganancia);
}

/** Una fase que sale a un servicio y todavía no tiene un costo que listar: cuál es y quién la hace (o qué falta para saberlo). Cada una es un par de la ficha. */
export function faseDeAfuera(s: { nombre: string; proveedor: string | null; pendiente: boolean }): { fase: string; quien: string } {
  return { fase: s.nombre, quien: s.proveedor ?? (s.pendiente ? "Pendiente de registrar" : "Falta elegir a quién") };
}

/** El detalle del aviso «Orden de … abierta»: cuántas prendas y de qué tipo, en una frase (antes «Modelo nuevo · 24 prendas · producción»). */
export function detalleDeOrdenAbierta(o: { total: number; esMuestra: boolean; esNuevo: boolean }): string {
  const prendas = `${o.total} ${o.total === 1 ? "prenda" : "prendas"}`;
  return `${prendas} ${o.esMuestra ? "de muestra" : "para vender"}${o.esNuevo ? ", con un modelo nuevo" : ""}`;
}

/** Lo que dice el aviso de una orden a medias: cuándo quedó guardada y, si tenía prendas escritas, cuántas. */
export function fraseDelBorradorGuardado(haceCuanto: string, prendas: number): string {
  return `Quedó guardada ${haceCuanto}${prendas > 0 ? `, con ${prendas} ${prendas === 1 ? "prenda" : "prendas"}` : ""}.`;
}
