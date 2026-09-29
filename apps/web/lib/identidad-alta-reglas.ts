/**
 * Quién firma los guardados que ocurren A MITAD del alta de producto — la parte pura, sin React ni red, para probarla sola.
 *
 * EL PROBLEMA. Al dar de alta una prenda, la colaboradora crea a la vez un tejido, un color, una marca, una talla… Cada uno es
 * su propio guardado (no va dentro de la transacción del alta: si fallara, perdería la prenda que llenaba). Hasta el
 * 2026-09-29 cada uno pedía su propio combo «Responsable» —hasta 9 veces el mismo nombre—. El ADR-0280 los soltó todos, pero
 * en una TERMINAL compartida eso deja el tejido, el color o la marca nuevos sin ninguna persona en el historial: solo «Terminal
 * Almacén».
 *
 * LA REGLA (Felipe, 2026-09-29). Quien abre «Nueva prenda» se identifica UNA vez, arriba, y esa identidad firma la prenda y
 * todo lo que se cree a mitad de camino. Vive en el estado de la pantalla: al salir del alta se acaba, y tras «Crear otro
 * parecido» se conserva (sigue siendo la misma persona, en la misma pantalla).
 *
 *  · Dentro del alta (`identidad` ≠ null): el guardado firma con esa persona —los mismos encabezados que el guardado final— y
 *    NO se puede hacer hasta que haya una identidad vigente. La base vuelve a mirar que esté presente en la tienda, igual que
 *    con el guardado final.
 *  · Fuera del alta (`identidad` = null: la marca nueva desde Marcas, el color desde la ficha de un producto): sin cambios, la
 *    acción sigue soltada del combo con su clave del ADR-0280.
 */
import { firmaOmitida, type ClaveSinResponsable, type FirmaOmitida } from "./responsable-omitido";
import { encabezadosResponsable, type Firma } from "./responsable-reglas";

/** Lo que el alta sabe de quien la inició: lo mínimo del control «Responsable» que necesitan los guardados de mitad. */
export type IdentidadDelAlta = {
  /** Hay una persona vigente (presente en la tienda, o el Admin): se puede guardar. */
  listo: boolean;
  /** Por qué todavía no (`null` si `listo`). */
  motivo: string | null;
  firma: () => Firma | null;
};

/** Lo que un guardado de mitad de formulario necesita para firmarse. */
export type FirmaDeMitad = {
  listo: boolean;
  motivo: string | null;
  /** Para `firmar(supabase.rpc(...), firma())`. `null` solo si `!listo`. */
  firma: () => Firma | FirmaOmitida | null;
  /** Los mismos encabezados para un `fetch` a una ruta `/api/*` (vacío si `!listo`). */
  encabezados: () => Record<string, string>;
};

export const MOTIVO_SIN_IDENTIDAD = "Elige arriba quién registra el alta.";

/**
 * La firma de un guardado de mitad de alta. `clave` es la del ADR-0280 y solo se usa cuando el componente se monta FUERA del
 * alta (sin `identidad`).
 */
export function firmaDeMitad(identidad: IdentidadDelAlta | null, clave: ClaveSinResponsable): FirmaDeMitad {
  if (!identidad) {
    const omitida = firmaOmitida(clave);
    return { listo: true, motivo: null, firma: () => omitida, encabezados: () => encabezadosResponsable(omitida) };
  }
  return {
    listo: identidad.listo,
    motivo: identidad.listo ? null : (identidad.motivo ?? MOTIVO_SIN_IDENTIDAD),
    firma: () => (identidad.listo ? identidad.firma() : null),
    encabezados: () => {
      const f = identidad.listo ? identidad.firma() : null;
      return f ? encabezadosResponsable(f) : {};
    },
  };
}
