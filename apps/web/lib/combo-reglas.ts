/* ====================================================================
   combo-reglas · la regla global de todo combo del sistema (ADR-0209)

   Por qué existe: cada combo decidía por su cuenta cuánto mostrar —
   `ComboBuscable` cortaba en 40 y pedía "sigue tipeando para acortar";
   `Desplegable`/`CampoSelectNativo` no cortaban nunca, y un desplegable de
   292 proveedores metía 292 filas al DOM sin buscador. Felipe pidió UNA
   regla, la misma en todo el sistema: más de 8 opciones, aparece un campo
   para buscar; más de 50 (ya filtradas), la lista se completa sola al
   bajar el scroll en vez de cortar de golpe.

   Puro y testeado — `campos.tsx` ya dice "ningún componente valida,
   transforma ni decide": el componente solo pinta lo que esto calcula.
   ==================================================================== */

/** Con más de esto, el combo suma un campo para escribir y filtrar. */
export const UMBRAL_BUSCAR_COMBO = 8;

/** Cuánto se revela de entrada y cuánto se suma cada vez que el scroll llega al fondo. */
export const TAMANO_PAGINA_COMBO = 50;

export function comboNecesitaBuscador(totalOpciones: number): boolean {
  return totalOpciones > UMBRAL_BUSCAR_COMBO;
}

/** El scroll de la lista llegó al fondo (con margen): momento de revelar más. */
export function comboLlegoAlFinal(medida: { scrollTop: number; clientHeight: number; scrollHeight: number }, margen = 32): boolean {
  return medida.scrollTop + medida.clientHeight >= medida.scrollHeight - margen;
}

/* Grupos y opciones que se ven pero no se eligen (2026-09-26): lo que el <select> del navegador resolvía con <optgroup>
   y `disabled` —las cuentas agrupadas en bancos, cajas fuertes y cajones; un cajón con la caja cerrada—, y lo que dejó
   fuera de la regla a los últimos combos nativos del ERP. Las flechas y el «activo» siguen contando la lista PLANA: el
   grupo solo agrega un título al dibujarla. */

/** Desde `desde`, la siguiente opción elegible en esa dirección (+1 baja, −1 sube). Sin otra elegible, se queda donde
 *  está: las flechas no aterrizan nunca en una opción que no se puede elegir. */
export function siguienteElegible(opciones: readonly { deshabilitada?: boolean }[], desde: number, paso: 1 | -1): number {
  for (let i = desde + paso; i >= 0 && i < opciones.length; i += paso) if (!opciones[i].deshabilitada) return i;
  return desde;
}

/** La primera elegible (Inicio) o, `desdeElFinal`, la última (Fin). −1 si no hay ninguna. */
export function primeraElegible(opciones: readonly { deshabilitada?: boolean }[], desdeElFinal = false): number {
  return desdeElFinal ? opciones.findLastIndex((o) => !o.deshabilitada) : opciones.findIndex((o) => !o.deshabilitada);
}

/** La lista en tramos seguidos del mismo grupo, en el mismo orden y con el índice de siempre. Un tramo sin `grupo` se
 *  dibuja sin título; dos tramos del mismo grupo separados por otro son dos tramos (el orden lo decide quien arma las
 *  opciones, no el combo). */
export function tramosPorGrupo<O extends { grupo?: string }>(opciones: readonly O[]): { grupo?: string; items: { o: O; i: number }[] }[] {
  const tramos: { grupo?: string; items: { o: O; i: number }[] }[] = [];
  opciones.forEach((o, i) => {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.grupo === o.grupo) ultimo.items.push({ o, i });
    else tramos.push({ grupo: o.grupo, items: [{ o, i }] });
  });
  return tramos;
}

/**
 * ¿Una opción de combo responde a lo que se escribió? Por su texto, su detalle o una de sus `claves` (sinónimos:
 * «plomo» encuentra Gris, «guinda» encuentra Vino — revisión de la paleta, 2026-09-26). `k` ya viene como `clave()`
 * (sin tildes ni mayúsculas); las claves se comparan igual.
 *
 * Devuelve `null` si no responde; `""` si responde por su texto o su detalle; o la clave por la que respondió,
 * para que la lista diga «Gris · «plomo»» y quien escribió «plomo» entienda por qué le sale Gris.
 */
export function coincidenciaCombo(
  o: { texto: string; detalle?: string; claves?: readonly string[] },
  k: string,
  normalizar: (s: string) => string
): string | null {
  if (!k) return "";
  if (normalizar(`${o.texto} ${o.detalle ?? ""}`).includes(k)) return "";
  return o.claves?.find((c) => normalizar(c).includes(k)) ?? null;
}
