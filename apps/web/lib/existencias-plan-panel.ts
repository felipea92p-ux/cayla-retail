import type { PisoDeTalla, PlanDelPiso } from "./piso-plan";

/* ====================================================================
   Existencias en dos tiempos (2026-11-13): la lista primero, «Hoy» un momento después.

   EL PROBLEMA. La página esperaba TODAS sus lecturas antes de dibujar, y la más lenta es el plan del piso (`fn_piso_plan_lectura`,
   0,77 s de media en producción): las prendas, que ya estaban, esperaban a la decisión de «Hoy». Ahora la lista se dibuja con lo
   demás y el plan llega aparte, por una promesa que la página le pasa al panel. Mientras llega, lo que depende de él («Hoy», los
   atajos «Por colgar» y «Sin stock atrás», «Para hoy», el orden de la lista del día y el aviso del cuadre) dice «calculando», que NO
   es el «N/D» del plan caído: «calculando» = viene en camino; «N/D» = no respondió.

   Este archivo es la regla pura: qué viaja al navegador (`planDelPanel`) y cómo se junta con el stock de la pantalla (`aplicarPlan`),
   también cuando un refresco trae stock nuevo antes que su plan nuevo.
   ==================================================================== */

/** Lo que el panel necesita del plan, en una forma que viaja al navegador (un objeto, no un `Map`): la decisión de cada talla que la
 *  sede muestra, la lista del día y si el piso está en pausa. Lo demás del plan (atributos, categorías) no lo lee Existencias. */
export type PlanDelPanel = {
  porTalla: Readonly<Record<string, PisoDeTalla>>;
  listaDelDia: readonly string[];
  enPausa: boolean;
};

/** El aviso de la pantalla cuando el plan no respondió (el que antes armaba la página). */
export const TEXTO_PLAN_FALLO = "«Hoy» no se pudo calcular ahora: la columna dice N/D. Lo demás de esta pantalla sí está al día.";

/** El plan, recortado a las tallas que la pantalla muestra. `null` si el plan no respondió (y el panel dice N/D). */
export function planDelPanel(plan: PlanDelPiso | null, filas: readonly { varianteId: string }[]): PlanDelPanel | null {
  if (!plan) return null;
  const porTalla: Record<string, PisoDeTalla> = {};
  for (const f of filas) {
    const d = plan.porTalla.get(f.varianteId);
    if (d) porTalla[f.varianteId] = d;
  }
  return { porTalla, listaDelDia: plan.listaDelDia, enPausa: plan.enPausa };
}

/** Lo que una fila aporta para saber si su decisión sigue valiendo: lo libre en piso y en almacén, lo que el motor mira. */
export type FilaConPlan = { varianteId: string; pisoDisponible: number | null; almacenDisponible: number | null; planPiso?: PisoDeTalla | null };

const firma = (f: Pick<FilaConPlan, "pisoDisponible" | "almacenDisponible">) => `${f.pisoDisponible ?? "∅"}|${f.almacenDisponible ?? "∅"}`;

/** Lo que respondió una promesa del plan, junto al stock que llegó CON ella (las dos vienen en la misma respuesta de la página). */
export type PlanRecibido = { plan: PlanDelPanel | null; stock: readonly Pick<FilaConPlan, "varianteId" | "pisoDisponible" | "almacenDisponible">[] };

/**
 * En qué va el plan:
 *   · `no_aplica`  — la sede no lo pide (el Taller no separa piso y almacén): «Hoy» no existe, como siempre.
 *   · `calculando` — viene en camino: lo que depende de él lo dice.
 *   · `listo`      — llegó. Tras un refresco puede haber tallas sueltas aún calculando (`calculando`).
 *   · `fallo`      — no respondió: «Hoy» dice N/D y el aviso lo explica.
 */
export type EstadoPlan = "no_aplica" | "calculando" | "listo" | "fallo";

export type PlanAplicado<F> = {
  estado: EstadoPlan;
  /** El stock con la decisión de cada talla puesta (`planPiso`); `null` donde no se sabe todavía o no se supo. */
  filas: F[];
  /** Las tallas cuya decisión viene en camino: su «Hoy» dice «calculando», no «N/D». */
  calculando: ReadonlySet<string>;
  /** La lista del día (vacía mientras no hay plan). */
  listaDelDia: readonly string[];
  /** El piso en pausa según el plan; `null` mientras no se sabe por él. */
  enPausa: boolean | null;
};

const SIN_LISTA: readonly string[] = [];

/**
 * Junta el stock de la pantalla con el plan.
 *
 * `vigente`: lo recibido es la respuesta a la promesa que trajo ESTE stock. Si no (un refresco trajo stock nuevo y su plan todavía
 * no llega), el plan anterior sigue valiendo para las tallas que no cambiaron —el motor decide con lo libre en piso y almacén— y
 * solo las que cambiaron dicen «calculando» hasta que llegue el nuevo. Así una venta en otra caja no pone a calcular toda la
 * pantalla, y una talla recién colgada no dice «Por colgar · 0 uds» con la decisión de antes.
 */
export function aplicarPlan<F extends FilaConPlan>(stock: readonly F[], o: { pedido: boolean; recibido: PlanRecibido | null; vigente: boolean }): PlanAplicado<F> {
  const sinDecision = (f: F): F => ({ ...f, planPiso: null });
  if (!o.pedido) return { estado: "no_aplica", filas: stock.map(sinDecision), calculando: new Set(), listaDelDia: SIN_LISTA, enPausa: null };

  const todoCalculando = (): PlanAplicado<F> => ({
    estado: "calculando",
    filas: stock.map(sinDecision),
    calculando: new Set(stock.map((f) => f.varianteId)),
    listaDelDia: SIN_LISTA,
    enPausa: null,
  });
  if (!o.recibido) return todoCalculando();

  const { plan } = o.recibido;
  if (!plan) {
    // Un plan caído solo es «fallo» si es la respuesta de ahora; si el que falló fue el anterior, el nuevo todavía puede llegar.
    return o.vigente ? { estado: "fallo", filas: stock.map(sinDecision), calculando: new Set(), listaDelDia: SIN_LISTA, enPausa: null } : todoCalculando();
  }

  const conDecision = (f: F): F => ({ ...f, planPiso: plan.porTalla[f.varianteId] ?? null });
  if (o.vigente) return { estado: "listo", filas: stock.map(conDecision), calculando: new Set(), listaDelDia: plan.listaDelDia, enPausa: plan.enPausa };

  const antes = new Map(o.recibido.stock.map((f) => [f.varianteId, firma(f)]));
  const calculando = new Set<string>();
  const filas = stock.map((f) => {
    if (antes.get(f.varianteId) === firma(f)) return conDecision(f);
    calculando.add(f.varianteId);
    return sinDecision(f);
  });
  return { estado: "listo", filas, calculando, listaDelDia: plan.listaDelDia, enPausa: plan.enPausa };
}

/**
 * La lista del día que ORDENA las tarjetas.
 *
 * El orden es del plan (lo vendido ayer primero) y el plan llega después que la lista: si la persona ya empezó a usarla (tocó,
 * desplazó o escribió) cuando llega, reordenar le movería la tarjeta bajo el dedo (ADR-0185). Esa PRIMERA lista se aplica sola solo
 * si nadie tocó todavía, o cuando la persona cambia de vista (un filtro, una página): ahí la lista se rehace igual. Las siguientes
 * (un refresco tras colgar o vender) se aplican como siempre.
 *
 * `aplicada`: la que ordena ahora; `null` = ninguna todavía.
 */
export function listaQueOrdena(o: { aplicada: readonly string[] | null; delPlan: readonly string[] | null; tocada: boolean; cambiaLaVista: boolean }): readonly string[] | null {
  if (o.delPlan === null) return o.aplicada;
  if (o.aplicada !== null) return o.delPlan;
  return !o.tocada || o.cambiaLaVista ? o.delPlan : null;
}
