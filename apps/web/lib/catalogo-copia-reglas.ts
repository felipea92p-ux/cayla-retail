// Cómo se lee y se guarda el catálogo completo (`getCatalogo`, `lib/catalogo-v2.ts`). Lógica pura: la usan el catálogo y sus pruebas.
//
// EL PROBLEMA (medido en producción el 2026-11-09). La copia guardada del catálogo vivía en UNA entrada de la caché de datos de Vercel, que
// no guarda nada de más de 2 MB. Con 3.676 variantes la copia pesaba ~2,8 MB: no se guardaba nunca, sin aviso, y cada visita a Vender,
// Cambios, Buscar, Compras, Recibir, Conteo o Traslados leía el catálogo entero en vivo (~2.150 lecturas en 3 días con el catálogo quieto).
// Y cada página se pedía ordenada por `sku` (vacío en 3.675 de 3.676) saltando las anteriores: la base armaba TODAS las variantes con sus
// fotos y códigos, las ordenaba y escribía ~2 MB a disco por página.
//
// LO QUE SE HACE. Cada página se pide «después del último id» (el índice de la llave, sin ordenar ni saltar filas) y se guarda en su propia
// entrada: ~0,8 MB por cada 1.000 variantes, lejos del tope, y sigue lejos aunque el catálogo crezca (crecen las entradas, no su tamaño).

/**
 * La FORMA de la copia guardada del catálogo: la huella (sha-256, 16 letras) del código que arma cada página (`paginaDeVariantes`, la
 * consulta de marcas de `leerCatalogo`, `fotoDeVariante`, `fotoPrincipal` y `VARIANTES_POR_PARTE`). Va en la llave de la copia en vez del commit
 * (2026-11-13, `cambiar-de-modulo#3`): la caché de Vercel sobrevive a las publicaciones, y con el commit cada una la dejaba vacía. Si
 * cambia ese código, `catalogo-copia-reglas.test.ts` falla y dice la huella nueva: al ponerla aquí cambia la llave sola y nadie lee
 * una copia armada con la forma vieja. Nunca se cambia a mano por otra cosa.
 */
export const FORMA_COPIA_CATALOGO = "7a851c1e2e1df952";

/** Variantes por cada entrada de la copia. 800 y no las 1.000 de PostgREST desde que la copia lleva también la foto principal del producto
 *  (2026-11-13): con 1.000, la variante más pesada posible dejaba la entrada sobre la mitad del tope; con 800 vuelve a quedar lejos. */
export const VARIANTES_POR_PARTE = 800;

/** @internal Lo más que guarda la caché de datos de Vercel en UNA entrada (una más grande no se guarda, sin error a la vista): la prueba
 *  comprueba que una parte de `VARIANTES_POR_PARTE` variantes quede lejos de él. */
export const TOPE_COPIA_BYTES = 2 * 1024 * 1024;

/**
 * Lee una lista entera página por página, cada una con las filas que van DESPUÉS del último id de la anterior (en el orden de la base:
 * `order by id`). Termina con la primera página que viene incompleta. Si una página no avanza (su último id no es mayor que el anterior),
 * se detiene con un error en vez de repetir filas o quedarse dando vueltas.
 */
export async function leerPorCursor<T>(leerPagina: (despuesDe: string | null) => Promise<T[]>, idDe: (fila: T) => string, tamano: number): Promise<T[]> {
  const filas: T[] = [];
  let despuesDe: string | null = null;
  for (;;) {
    const pagina = await leerPagina(despuesDe);
    filas.push(...pagina);
    if (pagina.length < tamano) return filas;
    const ultimo = idDe(pagina[pagina.length - 1]!);
    if (despuesDe !== null && ultimo <= despuesDe) throw new Error("No se pudo leer el catálogo: una página no avanzó (el orden por id no se cumplió).");
    despuesDe = ultimo;
  }
}
