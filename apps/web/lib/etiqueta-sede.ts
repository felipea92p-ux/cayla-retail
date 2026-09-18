// Reglas puras de cómo se LEE una sede. Vive aparte de `sedes.ts` a propósito: ahí
// están las consultas a Supabase, y esto no necesita base de datos ni servidor — es
// una función de texto a texto, y así se puede probar sola y usar desde cualquier lado.

/* ------------------------------------------------------------------
   etiquetaSede — cómo se LEE una sede en pantalla.

   `codigo` dejó de servir para esto desde la unificación con Dynamic: el
   Taller es `LIM` y la tienda de Lima es `003`, así que la cabecera decía
   "003" y había que saberse el mapa de memoria. La etiqueta dice las dos
   cosas que importan de un vistazo — QUÉ es y DÓNDE está: "TND LIM" es la
   tienda de Lima, "TLL LIM" es el Taller.

   Se deriva, no se escribe a mano: una tienda nueva que Dynamic dé de alta
   mañana aparece bien sin que nadie toque este archivo.
   ------------------------------------------------------------------ */

// El prefijo sale del TIPO, nunca del código (misma razón que en persona.ts).
const ABREV_TIPO: Record<string, string> = {
  tienda: "TND",
  fabrica: "TLL",
  almacen: "ALM",
};

/**
 * El sufijo dice EN QUÉ CIUDAD, y sale de la primera fuente que siga siendo
 * legible:
 *   1. el código, cuando todavía es el de la ciudad (TRU, AQP, LIM);
 *   2. la última palabra del nombre, para cuando el código dejó de serlo — la
 *      tienda de Lima es `003` porque `LIM` ya se lo había llevado el Taller,
 *      y su nombre ("Tienda LIM") es el único lugar donde quedó la ciudad;
 *   3. nada — y la etiqueta queda solo con el prefijo, que es suficiente
 *      cuando hay una sola de ese tipo (el Taller).
 * Nunca inventa: si ninguna fuente da un token corto y limpio, devuelve "".
 */
function ciudadDe({ codigo, nombre }: { codigo: string; nombre: string }): string {
  if (/^[a-zA-Z]{2,4}$/.test(codigo)) return codigo.toUpperCase();
  const ultima = nombre.trim().split(/\s+/).at(-1) ?? "";
  return /^[a-zA-Z0-9]{2,4}$/.test(ultima) ? ultima.toUpperCase() : "";
}

export function etiquetaSede(sede: { codigo: string; nombre: string; tipo: string }): string {
  const prefijo = ABREV_TIPO[sede.tipo];
  // 'corporativo' —y cualquier tipo que no abreviemos— se queda con su código:
  // CCO ya se lee como lo que es y no gana nada con un prefijo delante.
  if (!prefijo) return sede.codigo;
  const ciudad = ciudadDe(sede);
  return ciudad ? `${prefijo} ${ciudad}` : prefijo;
}
