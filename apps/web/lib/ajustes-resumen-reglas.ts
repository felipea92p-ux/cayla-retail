import type { CampanaInversion } from "./inversion-mercaderia-reglas";

// «Qué se ve» en el Resumen de Finanzas (Felipe 2026-10-26): el ícono bajo el selector de mes, solo en esta pantalla. Decide qué parte de la
// inversión en mercadería se ve aquí. Ocultar NO borra nada: la campaña sigue en el Plan de campaña y en Compras, y lo ya pedido sigue en Por pagar.
//
// Mientras el Plan no guarde en la base «se ve en el Resumen» (una sola columna sí/no por campaña, decidido por Felipe el 2026-10-26) y el
// interruptor general, estas elecciones viven en ESTE navegador (localStorage): son una preferencia de quien mira, no un dato del negocio. Cuando
// la base las tenga, esta capa se cambia por esa lectura y la regla de abajo no se toca.

export type AjustesResumen = {
  /** El interruptor general de «Inversión en mercadería». */
  global: boolean;
  /** Las campañas que esta persona esconde (por id). */
  ocultas: string[];
  /** Contar la compra en «Tu caja» (una proyección, no un pago). */
  enCaja: boolean;
  /** Contar el IGV en lo que sale de caja. */
  conIgv: boolean;
};

export const AJUSTES_DE_FABRICA: AjustesResumen = { global: true, ocultas: [], enCaja: true, conIgv: true };
export const CLAVE_AJUSTES_RESUMEN = "cayla-resumen-ajustes";

/** Lee lo guardado; lo que no entiende vuelve a la fábrica (por defecto, todo se ve). Nunca lanza. */
export function leerAjustes(texto: string | null): AjustesResumen {
  if (!texto) return { ...AJUSTES_DE_FABRICA, ocultas: [] };
  try {
    const x = JSON.parse(texto) as Record<string, unknown>;
    return {
      global: x.global !== false,
      ocultas: Array.isArray(x.ocultas) ? x.ocultas.filter((v): v is string => typeof v === "string") : [],
      enCaja: x.enCaja !== false,
      conIgv: x.conIgv !== false,
    };
  } catch {
    return { ...AJUSTES_DE_FABRICA, ocultas: [] };
  }
}

/** Las campañas que se ven: las que el Plan deja ver, con el interruptor general prendido y sin esconderlas aquí. */
export function campanasQueSeVen(campanas: readonly CampanaInversion[], a: AjustesResumen): CampanaInversion[] {
  if (!a.global) return [];
  return campanas.filter((c) => c.visible && !a.ocultas.includes(c.id));
}

/** ¿Algo está distinto de la fábrica? El ícono lo avisa con un punto, para que nadie crea que «no hay campañas» cuando las escondió. */
export function cambiaAlgo(a: AjustesResumen): boolean {
  return !a.global || a.ocultas.length > 0 || !a.enCaja || !a.conIgv;
}

/** Prende o apaga una campaña sin tocar las demás. */
export function conCampana(a: AjustesResumen, id: string, ver: boolean): AjustesResumen {
  const sin = a.ocultas.filter((x) => x !== id);
  return { ...a, ocultas: ver ? sin : [...sin, id] };
}
