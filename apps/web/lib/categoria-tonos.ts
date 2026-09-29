/**
 * El tono de cada familia en la pantalla de Categorías (spike `docs/maquetas/categorias-iconos-2026-09/`, Felipe 2026-09-29).
 *
 * CONTRATO. Promete: dado el código de una familia (`retail.familias.codigo`), uno de cinco tonos —los mismos que ya usan
 * Atributos ▸ Etiquetas y Temporadas— y la clase del punto de su título de grupo. Nunca lanza. Una familia que este mapa no
 * conoce (un Líder puede crear una desde /productos/familias) cae al tono neutro, no a un color inventado.
 *
 * QUÉ ES Y QUÉ NO ES EL COLOR. Es identidad, no estado: Categorías no tiene estados y aquí nada dice «va bien» ni «al filo».
 * Nunca rojo (acento de la marca, máx. 2 usos por pantalla; ver `MuestraEtiqueta.tsx`). Son cinco tonos para seis familias:
 * la pizarra se repite en Calzado y Papelería, que no quedan una junto a la otra.
 */

export type TonoCategoria = "taupe" | "ambar" | "verde" | "pizarra" | "neutro";

const TONO_POR_FAMILIA: Readonly<Record<string, TonoCategoria>> = {
  indumentaria: "taupe",
  calzado: "pizarra",
  accesorios: "ambar",
  bisuteria: "verde",
  belleza: "neutro",
  papeleria: "pizarra",
};

export function tonoDeFamilia(familia: string | null | undefined): TonoCategoria {
  return (familia && TONO_POR_FAMILIA[familia]) || "neutro";
}

/** El puntito del título de cada grupo (`TituloGrupo`): el mismo tono, como clase de la paleta (nunca un hex suelto). */
export const PUNTO_DEL_TONO: Readonly<Record<TonoCategoria, string>> = {
  taupe: "bg-taupe-profundo",
  ambar: "bg-ambar",
  verde: "bg-verde",
  pizarra: "bg-pizarra",
  neutro: "bg-tinta/25",
};
