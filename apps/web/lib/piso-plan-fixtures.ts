// Soporte de pruebas del motor del piso (ADR-0328 act. 7). Solo lo importan los `*.test.ts`; no entra a la app.
//
// Arma, desde unas filas de Existencias, la lectura que devolvería la base (`fn_piso_plan_lectura`) y pasa esa lectura por el
// motor, como hace la web de verdad: la página de Existencias le pone a cada fila la decisión del motor (`planPiso`) y la lista
// del día; el Inicio de Almacén cuenta sobre la misma lectura (`filasDelPiso`). Así una prueba puede exigir que las cifras de
// «Hoy», «Para hoy» y el Inicio salgan iguales de UNA sola escena, sin escribir a mano la decisión de cada talla.

import type { FilaPrenda } from "./existencias-prendas";
import { DIAS_VENTANA, planDelPiso, type LecturaDelPiso, type PlanDelPiso, type TallaEnSede } from "./piso-plan";

/** La curva de la categoría de prueba: ropa con letras y pantalones con números. Centrales: S · M · L y 28 · 30 · 32. */
export const CURVA_DE_PRUEBA = ["XS", "S", "M", "L", "XL", "26", "28", "30", "32", "34"];

/** La categoría de la escena, con lo que la base trae en su curva para dibujar la prenda sin foto (ADR-0333). */
export const CATEGORIA_DE_PRUEBA = { categoria: "Camisas y Blusas", prefijo: "CMS", familia: "indumentaria" } as const;

/** Una fecha de cuadre del piso cualquiera: con ella el motor manda a colgar; con `null`, todo lo que mandaría queda en pausa. */
export const CUADRADO_EN = "2026-10-01T15:00:00+00:00";

export type Ventas = Partial<Pick<TallaEnSede, "vendidasHoy" | "vendidasAyer" | "vendidas14">>;

/** La lectura de la base para esas filas: lo libre en piso y almacén de cada talla, lo que viene en camino y lo vendido. */
export function lecturaDeFilas(
  filas: readonly FilaPrenda[],
  opciones: { cuadradoEn?: string | null; ventas?: Readonly<Record<string, Ventas>> } = {}
): LecturaDelPiso {
  return {
    ubicacionId: "sede-de-prueba",
    separaPiso: filas.some((f) => f.pisoDisponible !== null),
    cuadradoEn: opciones.cuadradoEn === undefined ? CUADRADO_EN : opciones.cuadradoEn,
    hoy: "2026-10-04",
    dias: DIAS_VENTANA,
    tallas: filas.map((f) => ({
      varianteId: f.varianteId,
      productoId: f.productoId,
      referencia: f.referencia,
      categoriaId: "cat-prueba",
      tallaId: f.talla,
      talla: f.talla,
      colorCodigo: f.color,
      color: f.color,
      colorHex: f.colorHex,
      familiaColor: null,
      retirada: false,
      fotoUrl: f.fotoUrl,
      pisoLibre: f.pisoDisponible ?? 0,
      almacenLibre: f.almacenDisponible ?? 0,
      enCamino: f.enTransito,
      vendidasHoy: 0,
      vendidasAyer: 0,
      vendidas14: 0,
      ...opciones.ventas?.[f.varianteId],
    })),
    ventas: [],
    anotadasRecientes: [],
    curvas: [{ categoriaId: "cat-prueba", ...CATEGORIA_DE_PRUEBA, tallas: CURVA_DE_PRUEBA }],
  };
}

/** Lo que hace la página de Existencias: la lectura pasa por el motor y cada fila recibe su decisión (`planPiso`). */
export function conMotor<F extends FilaPrenda>(
  filas: readonly F[],
  opciones: Parameters<typeof lecturaDeFilas>[1] = {}
): { filas: F[]; plan: PlanDelPiso; lectura: LecturaDelPiso } {
  const lectura = lecturaDeFilas(filas, opciones);
  const plan = planDelPiso(lectura);
  return { lectura, plan, filas: filas.map((f) => ({ ...f, planPiso: plan.porTalla.get(f.varianteId) ?? null })) };
}
