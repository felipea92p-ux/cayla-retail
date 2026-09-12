/**
 * Anclar el vocabulario propio de una marca al estándar universal (0052) — la
 * parte que NO necesita IA.
 *
 * EL PROBLEMA. `colores` tiene 30 nombres de CAYLA; el estándar universal tiene
 * 19. "Arena", "Palo rosa" y "Animal print" no existen allá, y hacerlas
 * desaparecer sería quitarle a la marca distinciones que su clienta sí hace en
 * mostrador. Anclar es decir de qué término universal CUELGA cada término
 * propio, sin borrar ninguno.
 *
 * POR QUÉ ESTE ARCHIVO ESTÁ SEPARADO DE `anclar-ia.ts`. De los 30 colores de
 * CAYLA, la mitad coincide por nombre exacto con el universal (Negro, Blanco,
 * Gris, Beige, Azul marino…). Mandarlos al modelo sería pagar por una
 * comparación de cadenas — y aceptar que un modelo pueda equivocarse donde
 * `===` no puede. Acá vive esa primera pasada: pura, determinista, gratis y
 * testeable sin red. El modelo solo ve lo que de verdad pide criterio.
 *
 * Es el mismo principio que gobierna el importador entero: lo que resuelve el
 * código no se le pregunta a la IA.
 */

/** Un término del vocabulario de la marca: un color, una categoría. */
export type TerminoPropio = {
  /** Identificador estable en el vocabulario propio: 'PAL', el uuid de la categoría. */
  clave: string;
  nombre: string;
  /** Pista opcional para desambiguar: la familia del color, la familia de la categoría. */
  contexto?: string;
};

/** Un término del estándar universal contra el que se ancla. */
export type TerminoUniversal = {
  id: string;
  nombre: string;
  /** Ruta completa, para categorías. Le da al modelo el árbol, no solo la hoja. */
  ruta?: string;
};

export type Anclaje = {
  clave: string;
  /** Null cuando ni el código ni el modelo encontraron un universal defendible. */
  universalId: string | null;
  confianza: "exacta" | "alta" | "media" | "baja";
  /** Por qué se eligió ése. Vacío en las exactas: no hay nada que explicar. */
  porque: string;
};

/**
 * Réplica en TypeScript de `fn_clave_texto` (0046): minúsculas, sin acentos,
 * espacios colapsados. Debe dar el MISMO resultado que la función de Postgres —
 * si divergen, el importador cree que un color es nuevo, intenta crearlo, y la
 * base lo rechaza por el índice único sobre `fn_clave_texto(nombre)`: un error
 * tardío, en mitad de una escritura, sobre un dato que el cliente ya confirmó.
 * `anclar.test.ts` fija los casos contra la salida real de Postgres.
 */
export function claveTexto(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => "aeiouun"["áéíóúüñ".indexOf(c)])
    .replace(/\s+/g, " ");
}

/**
 * La ruta universal entera es larga ("Ropa y accesorios > Prendas de vestir >
 * Ropa deportiva > Pantalones"); en pantalla alcanza con la hoja… salvo que la
 * hoja se repita. "Pantalones" está en cuatro ramas, y mostrar solo la hoja
 * hacía que un anclaje a la rama equivocada se viera correcto, y que el
 * datalist ofreciera cuatro opciones idénticas que resolvían siempre a la
 * primera. Se muestra la hoja y, cuando hace falta para distinguirla, el
 * padre: "Pantalones · Ropa deportiva". `repetidas` son las hojas que aparecen
 * más de una vez en el catálogo que se está mostrando; sin ella, se agrega el
 * padre siempre que la ruta tenga más de dos niveles.
 */
export function etiquetaCorta(ruta: string, repetidas?: Set<string>): string {
  const partes = ruta.split(" > ");
  const hoja = partes[partes.length - 1] ?? ruta;
  if (partes.length < 2) return hoja;
  const ambigua = repetidas ? repetidas.has(hoja) : partes.length > 2;
  return ambigua ? `${hoja} · ${partes[partes.length - 2]}` : hoja;
}

/** Las hojas que se repiten entre varias rutas: las que `etiquetaCorta` debe desambiguar. */
export function hojasRepetidas(rutas: string[]): Set<string> {
  const veces = new Map<string, number>();
  for (const r of rutas) {
    const hoja = r.split(" > ").pop() ?? r;
    veces.set(hoja, (veces.get(hoja) ?? 0) + 1);
  }
  return new Set([...veces].filter(([, n]) => n > 1).map(([h]) => h));
}

/**
 * Primera pasada: coincidencia exacta de nombre normalizado. Sin IA, sin costo.
 *
 * Solo cuando el nombre es ÚNICO en el catálogo universal. El árbol de ropa
 * repite 73 hojas en 188 ramas ("Pantalones" está bajo ropa deportiva, de
 * bebé, de dormir…): con un Map a secas ganaba la última rama cargada, el
 * anclaje salía "exacto" y la pantalla lo mostraba como correcto. Un nombre
 * repetido no es una coincidencia exacta: es una pregunta, y va al modelo con
 * el catálogo entero delante. Revisión del 2026-09-11.
 */
export function anclarPorNombre(
  propios: TerminoPropio[],
  universales: TerminoUniversal[]
): { resueltos: Anclaje[]; pendientes: TerminoPropio[] } {
  const porClave = new Map<string, string[]>();
  for (const u of universales) {
    const k = claveTexto(u.nombre);
    porClave.set(k, [...(porClave.get(k) ?? []), u.id]);
  }
  const resueltos: Anclaje[] = [];
  const pendientes: TerminoPropio[] = [];

  for (const p of propios) {
    const ids = porClave.get(claveTexto(p.nombre));
    const id = ids?.length === 1 ? ids[0] : undefined;
    if (id) {
      resueltos.push({ clave: p.clave, universalId: id, confianza: "exacta", porque: "" });
    } else {
      pendientes.push(p);
    }
  }
  return { resueltos, pendientes };
}
