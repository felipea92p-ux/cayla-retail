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
};

export type Problema = { bloque: "categoria" | "marca" | "nombre" | "atributos" | "precio"; texto: string };

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
  if (e.celdasIncluidas === 0) p.push({ bloque: "atributos", texto: "Deja al menos una variante en la matriz." });
  const precio = Number(e.precioBase);
  if (e.precioBase.trim() === "" || !Number.isFinite(precio) || precio <= 0) p.push({ bloque: "precio", texto: "Pon el precio de venta." });
  const costo = Number(e.costoBase);
  if (e.costoBase.trim() !== "" && (!Number.isFinite(costo) || costo < 0)) p.push({ bloque: "precio", texto: "El costo no puede ser negativo." });
  return p;
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
