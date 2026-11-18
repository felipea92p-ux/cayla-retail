import { calcularCoberturaPiso, type CoberturaPiso, type RitmoReciente } from "./existencias-ritmo";

/* ====================================================================
   El Ritmo reciente llega DESPUÉS que la lista (2026-11-13, sigue a «Existencias en dos tiempos», ADR-0662).

   EL PROBLEMA. La lista de Existencias esperaba al Ritmo reciente: esa lectura arranca recién cuando llegan las prendas (le pasa
   a la base las ~2.000 tallas de la sede) y en producción tardaba 0,9–1,5 s más. Medido con `existencias_tramos` en TRU el
   2026-11-13: las prendas a los 0,6–1,1 s y la lista a los 1,5–2,4 s, todo ese tramo esperando al ritmo. Y el ritmo solo alimenta
   dos columnas de la tabla («Cobertura piso» y «Ritmo reciente») y la línea «¿Cómo se vende?» del panel de la talla. Ahora la lista se
   dibuja sin él y el ritmo llega por una promesa, como el plan del piso. Mientras llega, esas piezas dicen «calculando», que NO es el
   «N/D» del ritmo caído.

   La cobertura (cuánto dura el piso de hoy a ese ritmo) se calcula AQUÍ, con el piso de la fila que la pantalla tiene ahora, y no en
   el servidor: tras colgar o vender, la lista llega con el piso nuevo y la cobertura lo sigue sin esperar otro ritmo.
   ==================================================================== */

/** Lo que viaja al navegador: el ritmo de cada talla, en un objeto (no un `Map`). `null` = no se pudo calcular. */
export type RitmoDelPanel = { porTalla: Readonly<Record<string, RitmoReciente>> };

/** El aviso de la pantalla cuando el ritmo no respondió: las dos columnas dicen N/D. */
export const TEXTO_RITMO_FALLO = "No se pudo calcular el ritmo reciente. Lo demás de esta pantalla sí está al día.";

/** Del `Map` del servidor a lo que viaja. `null` (no respondió) sigue siendo `null`. */
export function ritmoDelPanel(ritmo: ReadonlyMap<string, RitmoReciente> | null): RitmoDelPanel | null {
  if (!ritmo) return null;
  const porTalla: Record<string, RitmoReciente> = {};
  for (const [varianteId, r] of ritmo) porTalla[varianteId] = r;
  return { porTalla };
}

/** Lo que una fila necesita para llevar su ritmo: su talla y lo que hay en el piso (para la cobertura). */
export type FilaConRitmo = { varianteId: string; piso: number | null; ritmoReciente?: RitmoReciente | null; coberturaPiso?: CoberturaPiso | null };

/** Lo que respondió la promesa del ritmo. `vigente`: es la respuesta a la promesa que trajo ESTE stock (no la de antes de un refresco). */
export type RitmoRecibido = { ritmo: RitmoDelPanel | null; vigente: boolean };

/**
 * En qué va el ritmo:
 *   · `no_aplica`  — la sede no lo pide (el Taller): las columnas no existen, como siempre.
 *   · `calculando` — viene en camino.
 *   · `listo`      — llegó. Tras un refresco, una talla nueva que el ritmo anterior no traía puede seguir calculando.
 *   · `fallo`      — no respondió: N/D y el aviso.
 */
export type EstadoRitmo = "no_aplica" | "calculando" | "listo" | "fallo";

export type RitmoAplicado<F> = {
  estado: EstadoRitmo;
  /** El stock con `ritmoReciente` y `coberturaPiso` puestos; `null` donde no se sabe todavía o no se supo. */
  filas: F[];
  /** Las tallas cuyo ritmo viene en camino: dicen «calculando», no «N/D». */
  calculando: ReadonlySet<string>;
};

const NADA: ReadonlySet<string> = new Set();

/**
 * Junta el stock de la pantalla con el ritmo.
 *
 * El ritmo es de 7 días: una venta o una prenda colgada casi no lo mueve. Por eso, tras un refresco (stock nuevo, promesa nueva), el
 * ritmo anterior sigue valiendo mientras llega el nuevo —y la cobertura se recalcula con el piso nuevo—: un refresco no pone a calcular
 * toda la tabla. Solo una talla que el ritmo anterior no traía (llegó con el refresco) dice «calculando» hasta el nuevo.
 */
export function aplicarRitmo<F extends FilaConRitmo>(stock: readonly F[], o: { pedido: boolean; recibido: RitmoRecibido | null }): RitmoAplicado<F> {
  const sinRitmo = (f: F): F => ({ ...f, ritmoReciente: null, coberturaPiso: null });
  if (!o.pedido) return { estado: "no_aplica", filas: stock.map(sinRitmo), calculando: NADA };

  const todoCalculando = (): RitmoAplicado<F> => ({ estado: "calculando", filas: stock.map(sinRitmo), calculando: new Set(stock.map((f) => f.varianteId)) });
  if (!o.recibido) return todoCalculando();

  const { ritmo, vigente } = o.recibido;
  // Un ritmo caído solo es «fallo» si es la respuesta de ahora; si el que falló fue el anterior, el nuevo todavía puede llegar.
  if (!ritmo) return vigente ? { estado: "fallo", filas: stock.map(sinRitmo), calculando: NADA } : todoCalculando();

  const calculando = new Set<string>();
  const filas = stock.map((f) => {
    const r = ritmo.porTalla[f.varianteId];
    if (r) return { ...f, ritmoReciente: r, coberturaPiso: calcularCoberturaPiso(f.piso ?? 0, r) };
    // La respuesta de ahora no la trae: no se pudo medir (N/D). Una anterior no la trae: llegó con el refresco y su ritmo viene en camino.
    if (!vigente) calculando.add(f.varianteId);
    return sinRitmo(f);
  });
  return { estado: "listo", filas, calculando: calculando.size > 0 ? calculando : NADA };
}
