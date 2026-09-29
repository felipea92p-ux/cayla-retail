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

/** Posiciones cuyo código ya apareció antes en la lista (la primera aparición no cuenta: es la que se queda). `null` =
 *  código todavía desconocido, nunca repetido. Dos variantes con el mismo código no caben (`variantes_codigo_unico`). */
export function codigosRepetidos(codigos: readonly (string | null)[]): number[] {
  return codigos.flatMap((c, i) => (c !== null && codigos.indexOf(c) !== i ? [i] : []));
}

/** `sinonimos`: otras palabras con que se busca el color («plomo» → Gris). Vacío si no tiene. */
export type ColorAlta = { codigo: string; nombre: string; hex: string | null; familiaColor: string; sinonimos?: readonly string[] };

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

/** Lo que el «Ver más» de un eje (hoy, Tejido) muestra: los valores aprobados del catálogo que la categoría todavía NO ofrece, en el
 *  orden del catálogo. Jeans ofrece 3 tejidos de 22 (2026-09-28): sin esto, usar Lino en un jean exigía saber que Lino existe y
 *  escribirlo letra por letra en «+ Nuevo tejido».
 *  Nunca repite uno que la categoría ya ofrece, así que el elegido (que la base exige que sea de la categoría) jamás queda escondido
 *  tras «Ver menos». Vacío si la categoría ya ofrece todo: ahí no se pinta el botón. */
export function fueraDeLaCategoria<T extends { id: string }>(universo: T[], deLaCategoria: { id: string }[]): T[] {
  const ofrecidos = new Set(deLaCategoria.map((v) => v.id));
  return universo.filter((v) => !ofrecidos.has(v.id));
}

// ---------------------------------------------------------------------------
// Qué falta para guardar, y qué bloques están desbloqueados.
// ---------------------------------------------------------------------------

export type EstadoAlta = {
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
  /** Paso 4 (ADR-0212): unidades escritas en «Cuántas tienes hoy», en las celdas que siguen en la tabla. */
  stockTotal: number;
  /** Celdas con algo que no es un entero de 0 a 9999 (la pantalla no deja escribirlo; la regla no se fía). */
  stockInvalidas: number;
  /** La persona marcó «Todavía no tengo unidades»: el producto se crea sin stock, a sabiendas. */
  sinStock: boolean;
};

/** El bloque de cada problema dice a qué pregunta del alta pertenece (ver `pasoDeProblema`). `tela` = tejido y patrón: describen
 *  la prenda y viven en «¿Cómo es?»; `tallas` y `variantes` son la forma del modelo, en «¿En qué tallas y colores?». */
export type Problema = { bloque: "categoria" | "nombre" | "tela" | "tallas" | "variantes" | "precio" | "stock"; texto: string };

/** Lo que falta, en el orden en que la persona lo encuentra en pantalla: así `problemas[0]` es siempre lo próximo que va a
 *  ver (nombre → tejido → patrón en el paso 2; tallas y tabla en el 3; precio y stock en el 4). */
export function problemasAlta(e: EstadoAlta): Problema[] {
  const p: Problema[] = [];
  if (!e.categoriaId) return [{ bloque: "categoria", texto: "Elige qué producto es (familia y categoría)." }];
  if (!e.referencia.trim()) p.push({ bloque: "nombre", texto: "Escribe el nombre del producto." });
  else if (e.nombreBloqueado) p.push({ bloque: "nombre", texto: "Ya existe un producto con ese nombre." });
  else if (e.nombreSinConfirmar) p.push({ bloque: "nombre", texto: "Confirma que es otro producto, o abre el que ya existe." });
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
  const costo = Number(e.costoBase);
  if (e.costoBase.trim() !== "" && (!Number.isFinite(costo) || costo < 0)) p.push({ bloque: "precio", texto: "El costo no puede ser negativo." });
  // Decidir el stock es obligatorio, no llenarlo: «ninguna» es una respuesta válida, pero tiene que darse. Sin esto, un
  // producto creado con prisa quedaba en 0 y su stock se metía después como «Reposición», sin rastro de que era la carga.
  if (e.stockInvalidas > 0) p.push({ bloque: "stock", texto: "Las cantidades son números enteros, de 0 a 9999." });
  else if (e.stockTotal === 0 && !e.sinStock) p.push({ bloque: "stock", texto: "Escribe cuántas tienes hoy, o marca que todavía no tienes." });
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
  // La marca y el proveedor son opcionales (ADR-0283): ya no traban el nombre.
  const nombre = marca;
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

/** El paso más lejano al que se puede entrar: el primero que todavía tiene algo pendiente. */
export function pasoAlcanzable(problemas: Problema[]): PasoAlta {
  const primero = problemas[0];
  return primero ? pasoDeProblema(primero) : 4;
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
export function fraseStockCreado(stock: { unidades: number; donde: string }, sinConexion: boolean, subida: SubidaSinConexion | undefined): string {
  const n = stock.unidades;
  const u = `${n} unidad${n === 1 ? "" : "es"}`;
  if (sinConexion && subida === "descartada") return `${u}: no se cargaron, se descartaron junto con el producto.`;
  if (sinConexion && subida === "rechazada") return `${u}: todavía no entraron, porque la base no aceptó el alta (mira el aviso rojo).`;
  if (sinConexion && subida !== "subio") return `${u}: van al inventario (${stock.donde}) junto con el producto, cuando suba.`;
  return `${u} cargada${n === 1 ? "" : "s"} al inventario (${stock.donde}): ya aparecen en Existencias.`;
}

/** Lee el `hint` estable que pone `crear_producto_con_variantes` (20260918230100). Cualquier otro error va por `traducirError`. */
export function leerErrorAlta(error: { message: string; hint?: string | null; details?: string | null } | null): ErrorAlta {
  if (!error) return { tipo: "otro" };
  if (error.hint === "nombre_duplicado" || error.hint === "nombre_casi_igual") {
    return { tipo: error.hint, existenteId: error.details ?? null, mensaje: error.message };
  }
  return { tipo: "otro" };
}
