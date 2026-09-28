/**
 * Reglas puras del formulario de categoría (`CategoriasLista.tsx`): qué ejemplo mostrar según la familia y si el
 * prefijo o el nombre ya los usa otra categoría.
 *
 * EL CHOQUE SE AVISA AL TIPEAR, NO AL GUARDAR (2026-09-28). La base ya lo rechaza (`categorias_prefijo_unico`,
 * `categorias_nombre_clave_unica`) y ese candado sigue siendo el real —cubre a dos líderes guardando a la vez—, pero
 * antes la persona se enteraba recién al pulsar «Guardar», con un aviso que no decía QUIÉN tenía el prefijo. Ambos
 * índices cuentan también las categorías DESACTIVADAS (no son parciales por `activo`): «ese prefijo está libre» mirando
 * solo las activas sería mentira, por eso aquí se compara contra todas.
 *
 * EL EJEMPLO DEPENDE DE LA FAMILIA. «Ej. Kimonos» bajo Calzado enseña mal qué es una categoría. Cada familia tiene
 * ejemplos propios y se ofrece el primero que NO exista ya (ni por nombre ni por prefijo): un ejemplo que choca con una
 * categoría real invitaría a tipear algo que la base va a rechazar. Las familias las edita un Líder
 * (`retail.familias`): una familia nueva, sin ejemplos aquí, recibe un texto neutro en vez de uno de otra familia.
 */

export type CategoriaExistente = { id: string; nombre: string; prefijo: string | null; activo: boolean };
export type EjemploCategoria = { nombre: string; prefijo: string };

/** Ejemplos por código de familia (`retail.familias.codigo`), en el orden en que se ofrecen. */
export const EJEMPLOS_POR_FAMILIA: Record<string, readonly EjemploCategoria[]> = {
  indumentaria: [
    { nombre: "Kimonos", prefijo: "KIM" },
    { nombre: "Blazers", prefijo: "BLZ" },
    { nombre: "Enterizos", prefijo: "ENT" },
    { nombre: "Chalecos", prefijo: "CHA" },
    { nombre: "Faldas", prefijo: "FAL" },
  ],
  calzado: [
    { nombre: "Botines", prefijo: "BOT" },
    { nombre: "Sandalias", prefijo: "SAN" },
    { nombre: "Mocasines", prefijo: "MOC" },
    { nombre: "Ballerinas", prefijo: "BAL" },
    { nombre: "Zapatillas", prefijo: "ZAP" },
  ],
  accesorios: [
    { nombre: "Carteras", prefijo: "CRT" },
    { nombre: "Cinturones", prefijo: "CIN" },
    { nombre: "Pañuelos", prefijo: "PAN" },
    { nombre: "Sombreros", prefijo: "SOM" },
    { nombre: "Billeteras", prefijo: "BIL" },
  ],
  bisuteria: [
    { nombre: "Aretes", prefijo: "ARE" },
    { nombre: "Collares", prefijo: "COL" },
    { nombre: "Pulseras", prefijo: "PUL" },
    { nombre: "Anillos", prefijo: "ANI" },
    { nombre: "Tobilleras", prefijo: "TOB" },
  ],
  belleza: [
    { nombre: "Perfumes", prefijo: "PER" },
    { nombre: "Labiales", prefijo: "LAB" },
    { nombre: "Esmaltes", prefijo: "ESM" },
    { nombre: "Cremas corporales", prefijo: "CRE" },
  ],
  papeleria: [
    { nombre: "Agendas", prefijo: "AGE" },
    { nombre: "Cuadernos", prefijo: "CUA" },
    { nombre: "Tarjetas de regalo", prefijo: "TAR" },
    { nombre: "Stickers", prefijo: "STK" },
  ],
};

/** Lo que se muestra cuando la familia no tiene ejemplos o todos ya existen. */
export const EJEMPLO_NEUTRO = { nombre: "Nombre de la categoría", prefijo: "ABC" } as const;

/** El mismo criterio que `retail.fn_clave_texto`: minúsculas, sin tildes, sin espacios de más. */
export function claveNombre(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** El primer ejemplo de la familia que no choca con ninguna categoría (activa o no); si no queda ninguno, el neutro. */
export function ejemploParaFamilia(familia: string, categorias: readonly CategoriaExistente[]): { nombre: string; prefijo: string } {
  const nombres = new Set(categorias.map((c) => claveNombre(c.nombre)));
  const prefijos = new Set(categorias.map((c) => c.prefijo).filter(Boolean));
  const libre = (EJEMPLOS_POR_FAMILIA[familia] ?? []).find((e) => !nombres.has(claveNombre(e.nombre)) && !prefijos.has(e.prefijo));
  return libre ?? EJEMPLO_NEUTRO;
}

/** La categoría que ya usa este prefijo, sin contar a `excluirId` (la que se está editando). Solo con 3 letras. */
export function quienUsaPrefijo(prefijo: string, categorias: readonly CategoriaExistente[], excluirId: string | null): CategoriaExistente | null {
  const p = prefijo.trim().toUpperCase();
  if (p.length !== 3) return null;
  return categorias.find((c) => c.id !== excluirId && c.prefijo === p) ?? null;
}

/** La categoría que ya tiene este nombre (con el criterio de la base), sin contar a `excluirId`. */
export function quienUsaNombre(nombre: string, categorias: readonly CategoriaExistente[], excluirId: string | null): CategoriaExistente | null {
  const clave = claveNombre(nombre);
  if (!clave) return null;
  return categorias.find((c) => c.id !== excluirId && claveNombre(c.nombre) === clave) ?? null;
}

/** El texto bajo el campo cuando hay choque: dice QUIÉN lo tiene, y si está desactivada (por qué no la ve en la lista). */
export function avisoChoque(que: "prefijo" | "nombre", dueña: CategoriaExistente): string {
  const desactivada = dueña.activo ? "" : " (desactivada)";
  return que === "prefijo" ? `Ya lo usa «${dueña.nombre}»${desactivada}` : `Ya existe «${dueña.nombre}»${desactivada}`;
}
