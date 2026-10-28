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

import { enEscala } from "./color-escala";
import { agruparPorFamilia } from "./colores-familias";
import { FRASE_COSTO_CON_TOPE, FRASE_PRECIO_CON_TOPE, MAX_PRECIO_PRENDA } from "./catalogo-topes";

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

/** `sinonimos`: otras palabras con que se busca el color («plomo» → Gris). Vacío si no tiene. `pantoneTcx`: el código para pedir la tela
 *  («19-2039 TCX»); el círculo es una aproximación en pantalla y el código es la referencia real. Null en los metálicos.
 *  `tipo`: `colores.tipo` («solido» | «textura» | «estampado»); `fondoDeMuestra` lo usa para que «Gris melange» no se pinte como «Gris».
 *  Ausente = liso, que es lo que la base pone por defecto. */
export type ColorAlta = {
  codigo: string;
  nombre: string;
  hex: string | null;
  familiaColor: string;
  tipo?: string | null;
  sinonimos?: readonly string[];
  pantoneTcx?: string | null;
  /** La ficha del color (ADR-0316): qué transmite y con qué se combina (códigos). Ausentes = la pantalla no la pidió o el color no la tiene. */
  descripcion?: string | null;
  combinaCon?: readonly string[];
};

// El orden de cada familia de la carta lo da `color-escala.ts` (gama y claridad, calculadas del hex): ya no se confía en `colores.orden`,
// que un color recién creado dejaba fuera de lugar, ni en el brillo del RGB, que subestima los azules (ADR-0312).

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
  // Un solo agrupador para las tres pantallas de colores (`agruparPorFamilia`): una familia que el código aún no conoce sale con su propio
  // nombre y un color sin familia como «Sin familia»; ninguno desaparece.
  const grupos = agruparPorFamilia(colores, (c) => c.familiaColor, familias).map((g) => ({ ...g, colores: [...g.colores].sort(enEscala) }));
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
  /** ADR-0463: el alta pregunta a qué tienda pertenece el producto (CAYLA, CLAURE) ANTES de la categoría. `false` o ausente = la base
   *  todavía no tiene las tiendas (se pega antes que la web, o aún no): el alta sigue como siempre y el producto nace en CAYLA. */
  exigeEmpresa?: boolean;
  /** La tienda elegida. Vacía = todavía sin elegir (no hay valor de fábrica: un producto en la tienda equivocada no se nota hasta tarde). */
  empresaId?: string;
  categoriaId: string;
  // Marca y proveedor NO están aquí: desde ADR-0283 (2026-09-29) un producto se crea sin ellos y se completan después.
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
  /** La primera celda de la tabla con un precio propio en 0 (o que no es un número), como se lee en pantalla: «Negro en M».
   *  `null` o ausente = ninguna (`celdaSinPrecio`, lib/tabla-alta-reglas.ts; ADR-0384). */
  celdaSinPrecio?: string | null;
  /** Paso 4 (ADR-0212): unidades escritas en «Cuántas tienes hoy», en las celdas que siguen en la tabla. */
  stockTotal: number;
  /** Celdas con algo que no es un entero de 0 a 9999 (la pantalla no deja escribirlo; la regla no se fía). */
  stockInvalidas: number;
  /** La persona marcó «Todavía no tengo unidades»: el producto se crea sin stock, a sabiendas. */
  sinStock: boolean;
  /** La tienda de la carga separa piso y almacén: solo ahí se pregunta dónde están las prendas de hoy. */
  separaPiso: boolean;
  /** Dónde están hoy las prendas de la carga. `null` = todavía sin responder: la pregunta no trae respuesta de fábrica
   *  (Felipe 2026-10-04, ADR-0328). Con «almacén» marcado de antemano, TRU se cargó casi entera como guardada estando colgada:
   *  el sistema veía 138 en el piso y había 600–750, la caja no dejaba cobrar lo colgado y «Reponer» marcaba todas las tallas. */
  lugarCarga: LugarCarga | null;
  /** La carga inicial de la sede ya se cerró (ADR-0328 act. 2026-10-28): lo que se escribe entra como una LLEGADA del proveedor
   *  (`crear_producto_con_llegada`), al almacén de entrada. Sin la pregunta de piso o almacén y con el proveedor obligatorio. */
  llegada?: boolean;
  /** Hay proveedor elegido (paso 2). Solo cuenta con `llegada`: la llegada entra a su nombre (`lotes.proveedor_id`). */
  proveedorElegido?: boolean;
};

export type LugarCarga = "piso" | "almacen";

/** Lo que falta cuando hay unidades en una tienda que separa piso y almacén y nadie dijo dónde están. */
export const TEXTO_FALTA_LUGAR = "Di si están colgadas en el piso o guardadas en el almacén.";

/** Hay unidades que cargar y la tienda separa piso y almacén, pero la persona todavía no dijo dónde están. Una llegada no lo pregunta:
 *  entra al almacén, como todo lo que llega de un proveedor («se cuenta allí y luego se cuelga», ADR-0328). */
export function faltaLugarCarga(e: Pick<EstadoAlta, "stockTotal" | "stockInvalidas" | "separaPiso" | "lugarCarga" | "llegada">): boolean {
  return !e.llegada && e.stockInvalidas === 0 && e.stockTotal > 0 && e.separaPiso && e.lugarCarga === null;
}

/** Lo que falta cuando llegaron unidades y no hay proveedor: la llegada entra a su nombre (ADR-0328 act. 2026-10-28). */
export const TEXTO_FALTA_PROVEEDOR_LLEGADA = "Elige el proveedor en «¿Cómo es?»: lo que llegó entra a su nombre.";

/** Escribió unidades que llegaron, pero todavía no eligió de qué proveedor. */
export function faltaProveedorLlegada(e: Pick<EstadoAlta, "stockTotal" | "stockInvalidas" | "llegada" | "proveedorElegido">): boolean {
  return !!e.llegada && e.stockInvalidas === 0 && e.stockTotal > 0 && !e.proveedorElegido;
}

/** Lo que falta cuando no se escribió ninguna cantidad ni se dijo que no hay: la frase cambia con la carga cerrada. */
export function textoFaltaStock(e: Pick<EstadoAlta, "llegada">): string {
  return e.llegada ? "Escribe cuántas llegaron, o marca que todavía no tienes." : "Escribe cuántas tienes hoy, o marca que todavía no tienes.";
}

/** El bloque de cada problema dice a qué pregunta del alta pertenece (ver `pasoDeProblema`). `tela` = tejido y patrón: describen
 *  la prenda y viven en «¿Cómo es?»; `tallas` y `variantes` son la forma del modelo, en «¿En qué tallas y colores?». */
/** Lo que se dice de una celda de la tabla con el precio en 0 (ADR-0384): cuál es, dónde está y qué hacer. Una sola frase para
 *  `problemasAlta` y la guía, que tienen que decir lo mismo. */
export function textoCeldaSinPrecio(celda: string): string {
  return `${celda} tiene el precio en 0 (tabla, pestaña Precios): pon un precio mayor que 0 o déjala vacía para que tome el de todas.`;
}

/** Lo que falta cuando todavía no se dijo a qué tienda pertenece el producto. Una sola frase para `problemasAlta` y la guía. */
export const TEXTO_FALTA_EMPRESA = "Elige a qué tienda pertenece el producto.";

export type Problema = { bloque: "empresa" | "categoria" | "nombre" | "tela" | "tallas" | "variantes" | "precio" | "stock"; texto: string };

/** Lo que falta, en el orden en que la persona lo encuentra en pantalla: así `problemas[0]` es siempre lo próximo que va a
 *  ver (nombre → tejido → patrón en el paso 2; tallas y tabla en el 3; precio y stock en el 4). */
export function problemasAlta(e: EstadoAlta): Problema[] {
  const p: Problema[] = [];
  // La tienda va antes que la categoría (ADR-0463): sin ella no se sabe de qué negocio es el producto.
  if (e.exigeEmpresa && !e.empresaId) return [{ bloque: "empresa", texto: TEXTO_FALTA_EMPRESA }];
  if (!e.categoriaId) return [{ bloque: "categoria", texto: "Elige qué producto es (familia y categoría)." }];
  if (!e.referencia.trim()) p.push({ bloque: "nombre", texto: "Escribe el nombre del producto." });
  // Sin ni una letra ni un número («...», «✨») la base no tiene con qué formar la clave del nombre y lo rechaza recién al final de los 4 pasos.
  else if (claveReferencia(e.referencia) === "") p.push({ bloque: "nombre", texto: "El nombre necesita al menos una letra o un número." });
  else if (e.nombreBloqueado) p.push({ bloque: "nombre", texto: "Ya existe un producto con ese nombre." });
  else if (e.nombreSinConfirmar) p.push({ bloque: "nombre", texto: "Confirma que es otro diseño (mira la prenda parecida), o ábrela." });
  else if (e.comprobandoNombre) p.push({ bloque: "nombre", texto: "Comprobando que el nombre no exista todavía…" });
  if (e.exigeTejidoPatron) {
    if (!e.hayTejidosEnCategoria || !e.hayPatronesEnCategoria) {
      p.push({ bloque: "tela", texto: "Esta categoría no tiene tejidos o patrones habilitados: configúralos para continuar." });
    } else {
      if (!e.tejidoId) p.push({ bloque: "tela", texto: "Elige el tejido." });
      if (!e.patronId) p.push({ bloque: "tela", texto: "Elige el patrón (si no tiene diseño, elige Liso)." });
    }
  }
  if (e.categoriaSinTallas) p.push({ bloque: "tallas", texto: "Esta categoría no tiene tallas: elígelas para continuar." });
  else if (e.tallasElegidas === 0) p.push({ bloque: "tallas", texto: "Elige al menos una talla." });
  if (e.celdasIncluidas === 0) p.push({ bloque: "variantes", texto: "Deja al menos una variante en la tabla." });
  const precio = Number(e.precioBase);
  if (e.precioBase.trim() === "" || !Number.isFinite(precio) || precio <= 0) p.push({ bloque: "precio", texto: "Pon el precio de venta." });
  if (e.celdaSinPrecio) p.push({ bloque: "precio", texto: textoCeldaSinPrecio(e.celdaSinPrecio) });
  const costo = Number(e.costoBase);
  if (e.costoBase.trim() !== "" && (!Number.isFinite(costo) || costo < 0)) p.push({ bloque: "precio", texto: "El costo no puede ser negativo." });
  // ADR-0415: hasta S/ 5 000 (la base lo rechaza igual con `variantes_precio_con_tope`).
  if (precio > MAX_PRECIO_PRENDA) p.push({ bloque: "precio", texto: FRASE_PRECIO_CON_TOPE });
  if (costo > MAX_PRECIO_PRENDA) p.push({ bloque: "precio", texto: FRASE_COSTO_CON_TOPE });
  // Decidir el stock es obligatorio, no llenarlo: «ninguna» es una respuesta válida, pero tiene que darse. Sin esto, un
  // producto creado con prisa quedaba en 0 y su stock se metía después como «Reposición», sin rastro de que era la carga.
  if (e.stockInvalidas > 0) p.push({ bloque: "stock", texto: "Las cantidades son números enteros, de 0 a 9999." });
  else if (e.stockTotal === 0 && !e.sinStock) p.push({ bloque: "stock", texto: textoFaltaStock(e) });
  else if (faltaLugarCarga(e)) p.push({ bloque: "stock", texto: TEXTO_FALTA_LUGAR });
  else if (faltaProveedorLlegada(e)) p.push({ bloque: "stock", texto: TEXTO_FALTA_PROVEEDOR_LLEGADA });
  return p;
}

// ---------------------------------------------------------------------------
// Paso 4 — cuántas hay hoy (la carga inicial, ADR-0212).
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
 *  su cuenta puede dejarlas en el piso (la base las baja con `bajar_al_piso`, que pide Existencias, ADR-0306). */
export type DestinoStock = { ubicacionId: string; etiqueta: string; separaPiso: boolean };

/** Dónde queda el stock de la carga inicial, dicho como lo diría la persona. Sin respuesta todavía, lo dice. */
export function textoDestinoStock(etiquetaSede: string, lugar: LugarCarga | null, separaPiso: boolean): string {
  if (!separaPiso) return etiquetaSede;
  if (lugar === null) return `${etiquetaSede} · falta decir si están colgadas o guardadas`;
  return `${lugar === "piso" ? "piso de venta" : "almacén"} de ${etiquetaSede}`;
}

// ---------------------------------------------------------------------------
// Las 4 preguntas del alta (spike v2 2026-09-28, docs/maquetas/producto-nuevo-v2-2026-09; antes 5 pasos, spike 2026-09-24).
// ---------------------------------------------------------------------------
//
// Solo una pregunta está abierta a la vez, y la contestada se pliega en una línea:
//   1 ¿A qué categoría pertenece? · 2 ¿Cómo es? (nombre, descripción, marca y proveedor, tejido, patrón; temporada y
//   etiquetas plegadas) · 3 ¿En qué tallas y colores? (tallas, colores y la tabla talla × color con la foto en la fila de
//   su color) · 4 ¿Cuánto cuesta y cuántas hay? (precio, costo, la MISMA tabla con cantidades —la carga inicial,
//   ADR-0212— y quién lo registra).
// Cada problema de `problemasAlta` cae en un paso, así el paso dice qué le falta sin repetir las reglas.
//
// Por qué así (README del spike v2): tejido y patrón DESCRIBEN la prenda, así que van con el nombre y la marca, no con
// sus variantes. Y la tabla talla × color se dibujaba dos veces en dos pasos (variantes en el 4, stock en el 5): ahora se
// arma en el 3 y en el 4 es la misma tabla, con números. Precio y stock juntos cierran el alta en un solo paso.

export type PasoAlta = 1 | 2 | 3 | 4;
export const PASOS_ALTA: readonly PasoAlta[] = [1, 2, 3, 4];

export function pasoDeProblema(p: Problema): PasoAlta {
  switch (p.bloque) {
    case "empresa":
    case "categoria":
      return 1;
    case "nombre":
    case "tela":
      return 2;
    case "tallas":
    case "variantes":
      return 3;
    case "precio":
    case "stock":
      return 4;
  }
}

/** Lo primero que le falta a un paso, o null si el paso está completo. */
export function faltaDelPaso(problemas: Problema[], paso: PasoAlta): string | null {
  return problemas.find((p) => pasoDeProblema(p) === paso)?.texto ?? null;
}

/** Un paso está hecho cuando ni él ni ninguno anterior tiene problemas: sin categoría, «¿En qué tallas y colores?» no puede estar listo. */
export function pasoHecho(problemas: Problema[], paso: PasoAlta): boolean {
  return !problemas.some((p) => pasoDeProblema(p) <= paso);
}

/** Se puede abrir un paso (desde la lista «Avance» de la ficha) cuando los anteriores están contestados. El 1 siempre. */
export function pasoAbrible(problemas: Problema[], paso: PasoAlta): boolean {
  return paso === 1 || pasoHecho(problemas, (paso - 1) as PasoAlta);
}

/** Lo que el alta sabe de quién la firma (el combo «Responsable», ADR-0161), reducido a lo que la pantalla tiene que decir. */
export type ResponsableAlta = { listo: boolean; /** Todavía nadie elegido (no «nadie de turno» ni «cargando»). */ faltaElegir: boolean; motivo: string | null };

/**
 * El pie de un paso abierto: lo que falta, o que ya se puede seguir. El paso 4 cierra el alta: ahí «listo» incluye
 * haber elegido quién lo registra —el combo vive en ese paso—, y si es lo ÚNICO que falta, lo dice así (spike v2,
 * «Revisión de claridad»). Un problema de un paso anterior (se volvió a abrir el 4 con algo pendiente atrás) también
 * se dice: «Todo listo» con «Crear» apagado sería mentir.
 */
export function piePaso(problemas: Problema[], paso: PasoAlta, responsable: ResponsableAlta): { texto: string; listo: boolean } {
  const falta = faltaDelPaso(problemas, paso);
  if (falta) return { texto: falta, listo: false };
  if (paso < 4) return { texto: "Listo. Sigue cuando quieras.", listo: true };
  if (problemas.length > 0) return { texto: problemas[0].texto, listo: false };
  if (!responsable.listo) {
    return { texto: responsable.faltaElegir ? "Solo falta elegir quién lo registra." : (responsable.motivo ?? "Solo falta elegir quién lo registra."), listo: false };
  }
  return { texto: "Todo listo. Revisa la ficha y crea el producto.", listo: true };
}

/** Lo siguiente que falta para poder crear (la ficha y la barra de celular lo muestran), o null si ya se puede. */
export function siguienteDelAlta(problemas: Problema[], responsable: ResponsableAlta): string | null {
  if (problemas.length > 0) return problemas[0].texto;
  if (responsable.listo) return null;
  return responsable.faltaElegir ? "Elige quién lo registra." : (responsable.motivo ?? "Elige quién lo registra.");
}

/** Las tallas en una línea corta (resumen del paso 3): hasta 5 se leen todas («S M L»); con más, «26–42 (9)». */
export function textoTallas(textos: readonly string[]): string {
  if (textos.length <= 5) return textos.join(" ");
  return `${textos[0]}–${textos[textos.length - 1]} (${textos.length})`;
}

// ---------------------------------------------------------------------------
// Fotos elegidas durante el alta: se suben DESPUÉS de crear el producto.
// ---------------------------------------------------------------------------

/**
 * El orden y la principal de las fotos del alta: primero las de «Todos los colores» (sin color), después las de cada
 * color en el orden de los colores, y la principal es la primera. Desde el 2026-09-26 (Felipe: «una foto general y
 * luego escoger la gama de colores») la foto sin color ES la foto de la prenda: se ve en cada color que no tenga la
 * suya, así que también es la miniatura. Si solo hay fotos por color, la principal sigue siendo la del primer color.
 */
export function ordenarFotosAlta<T extends { colorCodigo: string | null }>(fotos: T[], ordenColores: string[]): (T & { orden: number; esPrincipal: boolean })[] {
  const rango = (c: string | null) => (c === null ? -1 : Math.max(0, ordenColores.indexOf(c)));
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

// ---------------------------------------------------------------------------
// Un alta guardada sin conexión (ADR-0210): qué pasó con ella, y qué decir de su stock (ADR-0212).
// ---------------------------------------------------------------------------

/** Dónde está un alta guardada sin conexión: esperando la red, ya en la base, rechazada por la base, o descartada a mano. */
export type SubidaSinConexion = "esperando" | "subio" | "rechazada" | "descartada";

/**
 * «Subió» SOLO si la operación salió de la cola sin que nadie la descartara. Salir de la cola pasa de dos maneras (subir
 * de verdad, o «Descartar» una rechazada) y confundirlas hacía decir «ya subió» y «ya aparecen en Existencias» de un
 * producto y un stock que no existen (revisión adversarial del 2026-09-26). `undefined` = el alta no fue sin conexión.
 */
export function estadoSubidaSinConexion(o: {
  token?: string;
  descartado?: boolean;
  enCola?: { rechazo: string | null };
}): SubidaSinConexion | undefined {
  if (!o.token) return undefined;
  if (o.descartado) return "descartada";
  if (!o.enCola) return "subio";
  return o.enCola.rechazo ? "rechazada" : "esperando";
}

/** La frase del stock en la pantalla de éxito: nunca dice «ya aparecen en Existencias» de algo que todavía no entró. */
export function fraseStockCreado(
  stock: { unidades: number; donde: string; llegadaDe?: string | null },
  sinConexion: boolean,
  subida: SubidaSinConexion | undefined
): string {
  const n = stock.unidades;
  const u = `${n} unidad${n === 1 ? "" : "es"}`;
  // ADR-0328 act. 2026-10-28: con la carga cerrada, lo escrito entró como una llegada del proveedor, no como stock inicial.
  if (stock.llegadaDe && !(sinConexion && subida !== "subio")) {
    return `${u} recibida${n === 1 ? "" : "s"} de ${stock.llegadaDe} (${stock.donde}) como una llegada de hoy: ya aparecen en Existencias, donde desde ahora se ajustan.`;
  }
  if (sinConexion && subida === "descartada") return `${u}: no se cargaron, se descartaron junto con el producto.`;
  if (sinConexion && subida === "rechazada") return `${u}: todavía no entraron, porque la base no aceptó el alta (mira el aviso rojo).`;
  if (sinConexion && subida !== "subio") return `${u}: van al inventario (${stock.donde}) junto con el producto, cuando suba.`;
  return `${u} cargada${n === 1 ? "" : "s"} al inventario (${stock.donde}) como stock inicial: ya aparecen en Existencias, donde desde ahora se ajustan.`;
}

/** Lee el `hint` estable que pone `crear_producto_con_variantes` (20260918230100). Cualquier otro error va por `traducirError`. */
export function leerErrorAlta(error: { message: string; hint?: string | null; details?: string | null } | null): ErrorAlta {
  if (!error) return { tipo: "otro" };
  if (error.hint === "nombre_duplicado" || error.hint === "nombre_casi_igual") {
    return { tipo: error.hint, existenteId: error.details ?? null, mensaje: error.message };
  }
  return { tipo: "otro" };
}
