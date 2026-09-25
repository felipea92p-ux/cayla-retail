// Reglas puras del formulario "Nuevo producto" (ADR-0109) — sin React ni red,
// para que lo delicado (cómo se escribe un nombre, qué falta para guardar,
// cuánto margen queda) se pruebe sin abrir la pantalla.
//
// CONTRATO
//   PROMETE: dado el estado del formulario, decir qué bloques están
//            desbloqueados, qué le falta a la persona para guardar (en frases
//            que ella entiende) y qué código va a tener el producto.
//   ASUME:   la base es la que manda. `tituloReferencia` y `tokenTalla`
//            espejan `fn_titulo_referencia` y `fn_token_talla` SOLO para
//            mostrar "se guardará como…" antes de guardar; lo que se guarda
//            lo decide el trigger de `productos`, no este archivo.
//   NO HACE: no valida contra la base (duplicados, vocabulario aprobado) —
//            eso lo hacen `buscar_productos_parecidos` y la RPC de alta.

const CONECTORES = ["de", "del", "la", "las", "el", "los", "con", "y", "e", "o", "en", "al", "para", "por", "sin"];

/** Espejo de `retail.fn_titulo_referencia`: "  blusa  CAMILA " → "Blusa Camila". */
export function tituloReferencia(texto: string): string {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  return palabras
    .map((p, i) => {
      const w = p.toLocaleLowerCase("es");
      if (i > 0 && CONECTORES.includes(w)) return w;
      return w.charAt(0).toLocaleUpperCase("es") + w.slice(1);
    })
    .join(" ");
}

/** Espejo de `retail.fn_clave_referencia`: dos nombres con la misma clave son «el mismo nombre» (sin tildes, mayúsculas, espacios ni puntuación).
 *  Pliega SOLO `áéíóúüñ`, igual que el `translate()` de la base; cualquier otro carácter (ç, à, ö) se descarta como puntuación. Con
 *  `normalize("NFD")` habría plegado también esos, y la pantalla y la base darían claves distintas para el mismo nombre. */
const PLEGADO: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
export function claveReferencia(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => PLEGADO[c])
    .replace(/[^a-z0-9]+/g, "");
}

/** Espejo de `retail.fn_token_talla`: el fragmento de talla dentro del código de variante. */
export function tokenTalla(valor: string | null): string {
  if (!valor) return "U";
  const clave = valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (clave === "" || ["unico", "unica", "talla unica", "u"].includes(clave)) return "U";
  if (clave === "estandar") return "STD";
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

export type CeldaAlta = { tallaId: string | null; color: string | null; clave: string };

export function claveCelda(tallaId: string | null, color: string | null): string {
  return `${tallaId ?? ""}|${color ?? ""}`;
}

/** Sin tallas ni colores elegidos = una sola variante (una correa, un gorro): la misma que ya contempla la RPC con nulls. */
export function construirCeldas(tallaIds: string[], colores: string[]): CeldaAlta[] {
  const tallas: (string | null)[] = tallaIds.length > 0 ? tallaIds : [null];
  const cods: (string | null)[] = colores.length > 0 ? colores : [null];
  const out: CeldaAlta[] = [];
  for (const color of cods) for (const tallaId of tallas) out.push({ tallaId, color, clave: claveCelda(tallaId, color) });
  return out;
}

/** Margen sobre el precio de venta, en %. null si no hay precio. Sin descontar IGV: es una alerta, no contabilidad. */
export function margenPorcentaje(precio: number, costo: number): number | null {
  if (!Number.isFinite(precio) || precio <= 0 || !Number.isFinite(costo)) return null;
  return ((precio - costo) / precio) * 100;
}

export type NivelMargen = "negativo" | "bajo" | "normal";

/** Bajo = menos de 30 %: por debajo, un descuento de campaña ya se come la ganancia. */
export function nivelMargen(margen: number | null): NivelMargen | null {
  if (margen === null) return null;
  if (margen < 0) return "negativo";
  if (margen < 30) return "bajo";
  return "normal";
}

/** Código que va a tener el producto: prefijo de la categoría + correlativo (`codigos_correlativos.ultimo + 1`). Aproximado si dos personas crean a la vez. */
export function codigoBasePrevisto(prefijo: string | null, ultimo: number | null): string {
  const p = (prefijo ?? "GEN").trim() || "GEN";
  return `${p}-${String((ultimo ?? 0) + 1).padStart(4, "0")}`;
}

export function codigoVariantePrevisto(base: string, colorCodigo: string | null, tallaValor: string | null): string {
  return base + (colorCodigo ? `-${colorCodigo}` : "") + `-${tokenTalla(tallaValor)}`;
}

export type ColorAlta = { codigo: string; nombre: string; hex: string | null; familiaColor: string };

/** Los `max` colores más usados en la categoría (solo los que tienen uso) al frente; el resto agrupado por familia de color, en el orden de `familias`. */
export function ordenarColores(
  colores: ColorAlta[],
  usoEnCategoria: Record<string, number>,
  familias: readonly { valor: string; texto: string }[],
  max = 8
): { frecuentes: ColorAlta[]; grupos: { familia: string; texto: string; colores: ColorAlta[] }[] } {
  const frecuentes = colores
    .filter((c) => (usoEnCategoria[c.codigo] ?? 0) > 0)
    .sort((a, b) => (usoEnCategoria[b.codigo] ?? 0) - (usoEnCategoria[a.codigo] ?? 0) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, max);
  const grupos = familias
    .map((f) => ({ familia: f.valor, texto: f.texto, colores: colores.filter((c) => c.familiaColor === f.valor) }))
    .filter((g) => g.colores.length > 0);
  const conocidas = new Set(familias.map((f) => f.valor));
  // Un color sin familia conocida (dato viejo) no debe desaparecer de la pantalla.
  const huerfanos = colores.filter((c) => !conocidas.has(c.familiaColor));
  if (huerfanos.length > 0) grupos.push({ familia: "sin-familia", texto: "Otros", colores: huerfanos });
  return { frecuentes, grupos };
}

// ---------------------------------------------------------------------------
// Qué familias se ven de entrada en el primer paso, y cuáles quedan tras «Ver más».
// ---------------------------------------------------------------------------

/** Las familias que "Nuevo producto" muestra de entrada (decidido con Felipe, 2026-09-20): son donde entra casi todo lo que se da de alta.
 *  El resto (Calzado, Belleza, Papelería…) queda a un toque en «Ver más», y la caja de búsqueda las alcanza igual.
 *  Vive en código y no en una columna de `familias`: son 6 filas, cambiarla es una línea, y una columna nueva sería un cambio de esquema
 *  en producción para algo que ninguna otra pantalla lee. Si algún día otra pantalla necesita "familias principales", ahí sí se sube a la tabla. */
export const FAMILIAS_A_LA_VISTA: readonly string[] = ["indumentaria", "accesorios", "bisuteria"];

/** Parte `familias` en las que van a la vista y las que van tras «Ver más». Respeta el orden que ya traen (`familias.orden`), así que la base
 *  sigue mandando en cómo se ordenan; el código solo decide en qué grupo cae cada una.
 *
 *  Una familia NUNCA se pierde: entre los dos grupos suman exactamente la entrada. Una familia nueva (que este archivo no conoce) cae tras
 *  «Ver más» — el fallo seguro es "un toque más", nunca "no la encuentro". Y si ninguna de las de siempre existe (renombradas o
 *  desactivadas) no se esconde nada: un panel largo es mejor que uno con un solo botón «Ver más». */
export function repartirFamilias<T extends { codigo: string }>(familias: T[]): { aLaVista: T[]; masFamilias: T[] } {
  const aLaVista = familias.filter((f) => FAMILIAS_A_LA_VISTA.includes(f.codigo));
  if (aLaVista.length === 0) return { aLaVista: familias, masFamilias: [] };
  return { aLaVista, masFamilias: familias.filter((f) => !FAMILIAS_A_LA_VISTA.includes(f.codigo)) };
}

// ---------------------------------------------------------------------------
// Qué falta para guardar, y qué bloques están desbloqueados.
// ---------------------------------------------------------------------------

export type EstadoAlta = {
  categoriaId: string;
  /** De quién es: marca y proveedor (ADR-0109), obligatorios. */
  marcaId: string;
  proveedorId: string;
  referencia: string;
  /** Se está comprobando el nombre contra el catálogo: hasta que conteste, no se sabe si es duplicado. */
  comprobandoNombre: boolean;
  /** El nombre coincide exactamente con uno existente: no se puede crear. */
  nombreBloqueado: boolean;
  /** Difiere en una letra de uno existente y la persona todavía no confirmó que es otro. */
  nombreSinConfirmar: boolean;
  /** La categoría no tiene ni una talla para elegir (hay que configurarla primero). */
  categoriaSinTallas: boolean;
  tallasElegidas: number;
  exigeTejidoPatron: boolean;
  hayTejidosEnCategoria: boolean;
  hayPatronesEnCategoria: boolean;
  tejidoId: string;
  patronId: string;
  celdasIncluidas: number;
  precioBase: string;
  costoBase: string;
  /** Paso 5 (ADR-0212): unidades escritas en «Cuántas tienes hoy», en las celdas que siguen en la tabla. */
  stockTotal: number;
  /** Celdas con algo que no es un entero de 0 a 9999 (la pantalla no deja escribirlo; la regla no se fía). */
  stockInvalidas: number;
  /** La persona marcó «Todavía no tengo unidades»: el producto se crea sin stock, a sabiendas. */
  sinStock: boolean;
};

export type Problema = { bloque: "categoria" | "marca" | "nombre" | "atributos" | "variantes" | "precio" | "stock"; texto: string };

export function problemasAlta(e: EstadoAlta): Problema[] {
  const p: Problema[] = [];
  if (!e.categoriaId) return [{ bloque: "categoria", texto: "Elige qué producto es (familia y categoría)." }];
  if (!e.marcaId || !e.proveedorId) p.push({ bloque: "marca", texto: "Elige la marca y el proveedor." });
  if (!e.referencia.trim()) p.push({ bloque: "nombre", texto: "Escribe el nombre del producto." });
  else if (e.nombreBloqueado) p.push({ bloque: "nombre", texto: "Ya existe un producto con ese nombre." });
  else if (e.nombreSinConfirmar) p.push({ bloque: "nombre", texto: "Confirma que es otro producto, o abre el que ya existe." });
  else if (e.comprobandoNombre) p.push({ bloque: "nombre", texto: "Comprobando que el nombre no exista todavía…" });
  if (e.categoriaSinTallas) p.push({ bloque: "atributos", texto: "Esta categoría no tiene tallas: elígelas para continuar." });
  else if (e.tallasElegidas === 0) p.push({ bloque: "atributos", texto: "Elige al menos una talla." });
  if (e.exigeTejidoPatron) {
    if (!e.hayTejidosEnCategoria || !e.hayPatronesEnCategoria) {
      p.push({ bloque: "atributos", texto: "Esta categoría no tiene tejidos o patrones habilitados: configúralos para continuar." });
    } else {
      if (!e.tejidoId) p.push({ bloque: "atributos", texto: "Elige el tejido." });
      if (!e.patronId) p.push({ bloque: "atributos", texto: "Elige el patrón (si no tiene diseño, elige Liso)." });
    }
  }
  if (e.celdasIncluidas === 0) p.push({ bloque: "variantes", texto: "Deja al menos una variante en la tabla." });
  const precio = Number(e.precioBase);
  if (e.precioBase.trim() === "" || !Number.isFinite(precio) || precio <= 0) p.push({ bloque: "precio", texto: "Pon el precio de venta." });
  const costo = Number(e.costoBase);
  if (e.costoBase.trim() !== "" && (!Number.isFinite(costo) || costo < 0)) p.push({ bloque: "precio", texto: "El costo no puede ser negativo." });
  // Decidir el stock es obligatorio, no llenarlo: «ninguna» es una respuesta válida, pero tiene que darse. Sin esto, un
  // producto creado con prisa quedaba en 0 y su stock se metía después como «Reposición», sin rastro de que era la carga.
  if (e.stockInvalidas > 0) p.push({ bloque: "stock", texto: "Las cantidades son números enteros, de 0 a 9999." });
  else if (e.stockTotal === 0 && !e.sinStock) p.push({ bloque: "stock", texto: "Escribe cuántas tienes hoy, o marca que todavía no tienes." });
  return p;
}

// ---------------------------------------------------------------------------
// Paso 5 — cuántas hay hoy (la carga inicial, ADR-0212).
// ---------------------------------------------------------------------------

/** Lo escrito en una celda de «Cuántas tienes hoy»: vacío = 0; solo enteros de 0 a 9999. null = no es una cantidad. Espejo de la
 *  validación de `crear_producto_con_stock_inicial` (la base es la que manda). */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return 0;
  if (!/^\d{1,4}$/.test(t)) return null;
  return Number(t);
}

/** Lo que admite una celda mientras se tipea: solo dígitos, hasta 4. Así una cantidad imposible ni se puede escribir. */
export function limpiarCantidad(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, 4);
}

export type StockAlta = { total: number; invalidas: number; celdasConStock: number };

/** Suma lo escrito SOLO en las celdas que siguen en la tabla: una celda quitada no se crea, así que su número no se carga. */
export function resumenStock(cantidades: Readonly<Record<string, string>>, clavesIncluidas: readonly string[]): StockAlta {
  let total = 0;
  let invalidas = 0;
  let celdasConStock = 0;
  for (const clave of clavesIncluidas) {
    const n = leerCantidad(cantidades[clave] ?? "");
    if (n === null) invalidas++;
    else if (n > 0) {
      total += n;
      celdasConStock++;
    }
  }
  return { total, invalidas, celdasConStock };
}

/** A dónde entra el stock de hoy: la tienda donde está parada la persona (la de la cabecera), si separa piso y almacén, y si
 *  su cuenta puede dejarlas en el piso (la base las baja con `bajar_al_piso`, que pide el módulo «Bajada al piso»). */
export type DestinoStock = { ubicacionId: string; etiqueta: string; separaPiso: boolean; puedeBajar: boolean };

/** Dónde queda el stock de la carga inicial, dicho como lo diría la persona. */
export function textoDestinoStock(etiquetaSede: string, alPiso: boolean, separaPiso: boolean): string {
  if (!separaPiso) return etiquetaSede;
  return `${alPiso ? "piso de venta" : "almacén"} de ${etiquetaSede}`;
}

export type Desbloqueos = { marca: boolean; nombre: boolean; atributos: boolean; colores: boolean; precio: boolean };

/** Cada bloque se abre al resolver el anterior; los cerrados se ven atenuados, no ocultos (la persona ve el camino completo). */
export function desbloqueos(e: EstadoAlta): Desbloqueos {
  const marca = Boolean(e.categoriaId);
  // Primero de quién es (el proveedor manda: una marca cuelga de él), después cómo se llama.
  const nombre = marca && Boolean(e.marcaId) && Boolean(e.proveedorId);
  const nombreResuelto = nombre && e.referencia.trim() !== "" && !e.nombreBloqueado && !e.nombreSinConfirmar && !e.comprobandoNombre;
  const atributos = nombreResuelto;
  const atributosResueltos =
    atributos &&
    !e.categoriaSinTallas &&
    e.tallasElegidas > 0 &&
    (!e.exigeTejidoPatron || (e.hayTejidosEnCategoria && e.hayPatronesEnCategoria && Boolean(e.tejidoId) && Boolean(e.patronId)));
  return { marca, nombre, atributos, colores: atributosResueltos, precio: atributosResueltos };
}

// ---------------------------------------------------------------------------
// Los 5 pasos del alta (spike 2026-09-24, docs/maquetas/producto-nuevo-spike-2026-09; el 5 desde ADR-0212).
// ---------------------------------------------------------------------------
//
// Los 7 bloques de antes se agrupan en pasos. Solo uno está abierto a la vez, y el terminado se pliega en una línea:
//   1 Qué es · 2 Quién es y cómo se llama (nombre, marca, proveedor) · 3 Cómo se hace (tallas, tejido, patrón,
//   colores, fotos) · 4 Precio y variantes (precio, costo, la tabla talla × color, etiquetas) · 5 Cuántas tienes hoy
//   (la carga inicial: lo que ya está en tienda, ADR-0212).
// Cada problema de `problemasAlta` cae en un paso, así el paso dice qué le falta sin repetir las reglas.
//
// El 5 va aparte del 4 a propósito: el 4 dice qué ES el producto (catálogo) y el 5 cuánto HAY (inventario). En la misma
// tabla, «toca una celda para quitarla» y «escribe cuántas hay» pelearían por el mismo toque.

export type PasoAlta = 1 | 2 | 3 | 4 | 5;
export const PASOS_ALTA: readonly PasoAlta[] = [1, 2, 3, 4, 5];

export function pasoDeProblema(p: Problema): PasoAlta {
  if (p.bloque === "categoria") return 1;
  if (p.bloque === "marca" || p.bloque === "nombre") return 2;
  if (p.bloque === "atributos") return 3;
  if (p.bloque === "stock") return 5;
  return 4;
}

/** Lo primero que le falta a un paso, o null si el paso está completo. */
export function faltaDelPaso(problemas: Problema[], paso: PasoAlta): string | null {
  return problemas.find((p) => pasoDeProblema(p) === paso)?.texto ?? null;
}

/** Un paso está hecho cuando ni él ni ninguno anterior tiene problemas: sin categoría, «Cómo se hace» no puede estar listo. */
export function pasoHecho(problemas: Problema[], paso: PasoAlta): boolean {
  return !problemas.some((p) => pasoDeProblema(p) <= paso);
}

/** El paso más lejano al que se puede entrar: el primero que todavía tiene algo pendiente. */
export function pasoAlcanzable(problemas: Problema[]): PasoAlta {
  const primero = problemas[0];
  return primero ? pasoDeProblema(primero) : 5;
}

// ---------------------------------------------------------------------------
// Fotos elegidas durante el alta: se suben DESPUÉS de crear el producto.
// ---------------------------------------------------------------------------

/**
 * El orden y la principal de las fotos del alta, igual que la galería de la edición: van primero las de color en el
 * orden de los colores, al final las generales (sin color), y la principal es la primera. Así la foto de la grilla es
 * la del primer color elegido, no la última que se agregó.
 */
export function ordenarFotosAlta<T extends { colorCodigo: string | null }>(fotos: T[], ordenColores: string[]): (T & { orden: number; esPrincipal: boolean })[] {
  const rango = (c: string | null) => (c === null ? ordenColores.length : Math.max(0, ordenColores.indexOf(c)));
  return fotos
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rango(a.f.colorCodigo) - rango(b.f.colorCodigo) || a.i - b.i)
    .map(({ f }, orden) => ({ ...f, orden, esPrincipal: orden === 0 }));
}

// ---------------------------------------------------------------------------
// Lo que la RPC de alta contesta cuando dice que no.
// ---------------------------------------------------------------------------

export type ErrorAlta =
  | { tipo: "nombre_duplicado"; existenteId: string | null; mensaje: string }
  | { tipo: "nombre_casi_igual"; existenteId: string | null; mensaje: string }
  | { tipo: "otro" };

/** Lee el `hint` estable que pone `crear_producto_con_variantes` (20260918230100). Cualquier otro error va por `traducirError`. */
export function leerErrorAlta(error: { message: string; hint?: string | null; details?: string | null } | null): ErrorAlta {
  if (!error) return { tipo: "otro" };
  if (error.hint === "nombre_duplicado" || error.hint === "nombre_casi_igual") {
    return { tipo: error.hint, existenteId: error.details ?? null, mensaje: error.message };
  }
  return { tipo: "otro" };
}
