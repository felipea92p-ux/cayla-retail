import { aCentimos, leerDinero, type LecturaDinero } from "./modelo-nuevo-reglas";
import { FIJO_MAXIMO, TARIFA_MAXIMA } from "./orden-fases-reglas";
import { soles } from "./orden-ficha-reglas";

// El costo de un paso que hace el Taller (ADR-0597): «Poner costo» en Habilitado, Costura o Planchado. Es lo que `poner_costo_a_fase` aceptaría —los mismos topes que la tarifa y el
// fijo de un servicio— dicho antes de enviar, para que el botón se apague con su porqué en vez de rebotar contra la base. Aquí no hay reglas de dinero propias: el devengado, el estimado y el
// reparto entre las prendas viven en la base (`fn_fases_de_orden`, `fn_orden_produccion`, `cerrar_produccion`).

export type CostoDelPasoLeido = {
  /** Lo que la base rechazaría (`fase_tarifa_invalida`), en una frase; null si lo aceptaría. */
  problema: string | null;
  /** La tarifa por prenda a céntimos, o null si la caja va vacía. */
  tarifaPrenda: number | null;
  /** El fijo por toda la orden a céntimos (0 si va vacío). */
  fijoOrden: number;
  /** Cuánto sale con las prendas de la orden (tarifa × prendas + fijo); null mientras no haya nada escrito que sumar. */
  total: number | null;
  /** Las dos cajas vacías: no hay nada que guardar (quitar un costo es otro botón, a propósito). */
  vacio: boolean;
  /** En cuál de las dos cajas está lo que se rechazaría (para marcar solo esa); null si no hay problema. */
  donde: "tarifa" | "fijo" | null;
};

function motivoDe(l: LecturaDinero, que: string): string | null {
  if (l.tipo === "coma") return `Escribe ${que} con punto, no con coma: 0.40.`;
  if (l.tipo === "negativo") return `${que[0].toLocaleUpperCase("es") + que.slice(1)} no puede ser negativo.`;
  if (l.tipo === "invalido") return `Escribe ${que} solo con números: 0.40.`;
  return null;
}

/** Lo que dicen las dos cajas, como lo leería la base (`poner_costo_a_fase`): tarifa mayor que 0 y hasta 9999.99, fijo desde 0 y hasta 99999.99, ambos a dos decimales. */
export function leerCostoDelPaso(tarifa: string, fijo: string, prendas: number): CostoDelPasoLeido {
  const t = leerDinero(tarifa);
  const f = leerDinero(fijo);
  const vacio = t.tipo === "vacio" && f.tipo === "vacio";
  let problema = motivoDe(t, "la tarifa por prenda");
  let donde: CostoDelPasoLeido["donde"] = problema ? "tarifa" : null;
  if (!problema) {
    problema = motivoDe(f, "el fijo");
    if (problema) donde = "fijo";
  }
  const tarifaPrenda = t.tipo === "ok" ? aCentimos(t.valor) : null;
  const fijoOrden = f.tipo === "ok" ? aCentimos(f.valor) : 0;
  if (!problema && tarifaPrenda !== null && (tarifaPrenda <= 0 || tarifaPrenda > TARIFA_MAXIMA)) {
    problema = tarifaPrenda <= 0 ? "La tarifa por prenda tiene que ser mayor que cero." : `La tarifa por prenda no puede pasar de ${soles(TARIFA_MAXIMA)}.`;
    donde = "tarifa";
  }
  if (!problema && fijoOrden > FIJO_MAXIMO) {
    problema = `El fijo no puede pasar de ${soles(FIJO_MAXIMO)}.`;
    donde = "fijo";
  }
  const total = !problema && !vacio ? aCentimos((tarifaPrenda ?? 0) * Math.max(prendas, 0) + fijoOrden) : null;
  return { problema, tarifaPrenda, fijoOrden, total, vacio, donde };
}

/** ¿Lo escrito es distinto de lo que el paso ya lleva? Sin cambio no hay nada que guardar (la base tampoco deja rastro en Actividad). */
export function cambiaElCostoDelPaso(actual: { tarifaPrenda: number | null; fijoOrden: number }, leido: Pick<CostoDelPasoLeido, "tarifaPrenda" | "fijoOrden">): boolean {
  return (actual.tarifaPrenda ?? null) !== leido.tarifaPrenda || actual.fijoOrden !== leido.fijoOrden;
}

/** Las cajas como texto, tal como las muestra la hoja al abrir un paso que ya lleva costo. */
export function cajasDelCosto(f: { tarifaPrenda: number | null; fijoOrden: number }): { tarifa: string; fijo: string } {
  return { tarifa: f.tarifaPrenda !== null && f.tarifaPrenda > 0 ? f.tarifaPrenda.toFixed(2) : "", fijo: f.fijoOrden > 0 ? f.fijoOrden.toFixed(2) : "" };
}

/** La línea viva bajo las cajas: lo que sale con las prendas de esta orden. Lo que está mal o falta lo dice la guía («Falta: …») y la caja marcada, no esta línea (no se repite). */
export function lineaDelCostoDelPaso(l: CostoDelPasoLeido, prendas: number): string | null {
  if (l.problema || l.total === null) return null;
  const sobre = prendas === 1 ? "la prenda" : `las ${prendas} prendas`;
  return `Con ${sobre} de esta orden sale ${soles(l.total)}.`;
}
