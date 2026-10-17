// Nueva orden de compra (ADR-0362, fase 1 · actividad 2): la lógica pura del formulario. Sin React ni red: se importa desde el cliente y
// se prueba sola (`orden-compra-alta.test.ts`).
//
//   PROMETE: leer lo que se tipea en el puesto («12,50», «12.5», « 3 »); calcular cada línea como la base (el descuento en soles desde
//   el %, el subtotal y el total), en céntimos exactos; decir qué le falta a la orden con las MISMAS reglas que `crear_orden_compra`
//   (de aquí sale la guía de foco: si la base rechaza algo que esto dejaba pasar, la prueba lo atrapa); y armar lo que viaja a la base.
//   NO HACE: no habla con la base ni decide permisos (el módulo y quién firma los decide la función).
//
// Los montos viajan como TEXTO canónico («25.50»): un número de coma flotante convertiría 0.1 + 0.2 en 0.30000000000000004 antes de
// llegar al `numeric` de Postgres.

import type { CampoDeGuia } from "./guia-campos";
import type { DetalleOrden } from "./ordenes-compra-reglas";

/** Lo que la base acepta (mismo tope que `crear_orden_compra`). */
export const TOPES = {
  lineas: 100,
  cantidad: 99_999,
  precioCentimos: 9_999_999, // S/ 99 999.99
  descripcion: 200,
  nota: 500,
  diasEntrega: 365,
} as const;

/** El valor del campo «Llega a» que dice «se reparte desde Lima» (en la base, destino NULL). */
export const POR_REPARTIR = "por_repartir";

/** Cómo se escribió el descuento de una línea: en porcentaje o en soles. El otro se calcula. */
export type ModoDescuento = "pct" | "soles";

export type LineaBorrador = {
  /** Estable para React mientras dura el formulario; no es el id de la base. */
  clave: string;
  categoriaId: string;
  marcaId: string;
  descripcion: string;
  cantidad: string;
  precio: string;
  /** Lo que se tipeó en el modo activo (`modoDescuento`). */
  descuento: string;
  modoDescuento: ModoDescuento;
  /** La línea llegó armada desde Análisis (categoría, marca y nombre; sin cantidad ni precio) y la persona todavía no la ha tocado: la guía la
   *  llama «Por revisar», no la marca con ✓ (ADR-0284, regla 4). En cuanto cambia cualquier campo de la línea, se apaga. */
  prellenada?: boolean;
};

export type OrdenBorrador = {
  proveedorId: string;
  /** «» = sin elegir; `POR_REPARTIR`; o el id de la tienda. */
  destino: string;
  /** `aaaa-mm-dd` o «». */
  entrega: string;
  nota: string;
  lineas: LineaBorrador[];
};

export function lineaVacia(clave: string, marcaId = ""): LineaBorrador {
  return { clave, categoriaId: "", marcaId, descripcion: "", cantidad: "", precio: "", descuento: "", modoDescuento: "pct" };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Leer números como se tipean
// ---------------------------------------------------------------------------------------------------------------------------------

export type Lectura =
  | { tipo: "vacio" }
  | { tipo: "ok"; escalado: number }
  | { tipo: "mal"; motivo: "no_numero" | "decimales" | "negativo" | "ambiguo" };

/** «1.000», «1.500», «12.500»: un punto seguido de tres cifras, como se escriben los miles. En el Perú así se escribe también «mil» o «mil
 *  quinientos», no solo «uno con quinientos»: no se adivina. Con «los ceros de más se quitan», «1.000» unidades se guardaba como 1 y «1.500»
 *  como S/ 1.50 (chaos 2026-10-10). Solo cuando caben menos de tres decimales: en el % de descuento (cuatro), «1.000» es 1 %. */
const MILES_CON_PUNTO = /^[1-9]\d{0,2}\.\d{3}$/;

/**
 * Un número escrito a mano, escalado a `decimales` (2 → céntimos). La costumbre del ERP y de Perú (`parsearMonto` de Gastos,
 * `leerMonto` de Caja): el PUNTO es el decimal y la COMA separa miles («1,950.50» es 1950.50; «1,000» es mil). Una sola tolerancia:
 * sin punto, una coma seguida de UNA o DOS cifras al final («12,50», «12,5») es el decimal, porque leer «12,50» como 1250 multiplicaría
 * el precio por cien sin que nadie lo note. Más decimales de los que caben no se redondean: se avisa (la base tampoco los acepta).
 */
export function leerNumero(texto: string, decimales: number): Lectura {
  let t = texto.replace(/\s+/g, "").replace(/^s\//i, "");
  if (t === "") return { tipo: "vacio" };
  if (t.startsWith("-")) return { tipo: "mal", motivo: "negativo" };
  // Solo lo que antes pasaba en silencio: las cifras que sobran son ceros («1.500» → 1.50). «10.555» ya se rechaza por decimales.
  if (decimales < 3 && MILES_CON_PUNTO.test(t) && /^0+$/.test(t.slice(t.indexOf(".") + 1 + decimales))) return { tipo: "mal", motivo: "ambiguo" };
  if (t.includes(".")) {
    // Con punto, las comas solo pueden separar miles.
    t = t.replace(/,/g, "");
  } else if (/^\d+,\d{1,2}$/.test(t)) {
    t = t.replace(",", ".");
  } else if (/^[1-9]\d{0,2}(,\d{3})+$/.test(t)) {
    // «1,000» y «12,345,678»: miles. «0,500» no (unos miles no empiezan en cero) y cae como número mal escrito.
    t = t.replace(/,/g, "");
  }
  const partes = t.split(".");
  if (partes.length > 2) return { tipo: "mal", motivo: "no_numero" };
  const entera = partes[0] ?? "";
  let fraccion = partes[1] ?? "";
  if (!/^\d*$/.test(entera) || !/^\d*$/.test(fraccion) || (entera === "" && fraccion === "")) return { tipo: "mal", motivo: "no_numero" };
  if (fraccion.length > decimales) {
    // «12.50» con 0 decimales permitidos ya es un problema; «12.500» con 2 también, salvo ceros de más.
    if (/^0*$/.test(fraccion.slice(decimales))) fraccion = fraccion.slice(0, decimales);
    else return { tipo: "mal", motivo: "decimales" };
  }
  const escalado = Number((entera || "0") + fraccion.padEnd(decimales, "0"));
  return Number.isSafeInteger(escalado) ? { tipo: "ok", escalado } : { tipo: "mal", motivo: "no_numero" };
}

/** Un escalado con `decimales` como texto canónico: 2550 con 2 → «25.50»; 100000 con 4 → «10» (los ceros de más se quitan). */
export function aTexto(escalado: number, decimales: number, { recortar = false } = {}): string {
  if (decimales === 0) return String(escalado);
  const base = 10 ** decimales;
  const entero = Math.floor(escalado / base);
  let fraccion = String(escalado % base).padStart(decimales, "0");
  if (recortar) fraccion = fraccion.replace(/0+$/, "");
  return fraccion ? `${entero}.${fraccion}` : String(entero);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Calcular una línea (céntimos exactos, igual que la base)
// ---------------------------------------------------------------------------------------------------------------------------------

export type CalculoLinea = {
  cantidad: number | null;
  precioCentimos: number | null;
  /** El bruto (cantidad × precio), o null si falta alguno de los dos. */
  brutoCentimos: number | null;
  descuentoCentimos: number;
  /** El porcentaje equivalente, para mostrar en el otro campo (escalado ×10 000), o null si no hay bruto. */
  pctEscalado: number | null;
  subtotalCentimos: number | null;
};

/**
 * `round(cantidad × precio × % / 100, 2)` de la base, con el mismo redondeo (mitad hacia arriba: todo es positivo). En BigInt: el
 * producto pasa de 2^53 con cantidades y precios grandes.
 */
export function descuentoDesdePct(cantidad: number, precioCentimos: number, pctEscalado: number): number {
  const n = BigInt(cantidad) * BigInt(precioCentimos) * BigInt(pctEscalado);
  const d = BigInt(1_000_000); // ×10 000 del porcentaje y /100 del «por ciento»
  const dos = BigInt(2);
  return Number((dos * n + d) / (dos * d));
}

export function calcularLinea(l: LineaBorrador): CalculoLinea {
  const cant = leerNumero(l.cantidad, 0);
  const precio = leerNumero(l.precio, 2);
  const cantidad = cant.tipo === "ok" ? cant.escalado : null;
  const precioCentimos = precio.tipo === "ok" ? precio.escalado : null;
  const brutoCentimos = cantidad != null && precioCentimos != null ? cantidad * precioCentimos : null;
  let descuentoCentimos = 0;
  let pctEscalado: number | null = null;
  if (brutoCentimos != null) {
    if (l.modoDescuento === "pct") {
      const p = leerNumero(l.descuento, 4);
      pctEscalado = p.tipo === "ok" ? p.escalado : 0;
      descuentoCentimos = p.tipo === "ok" && cantidad != null && precioCentimos != null ? descuentoDesdePct(cantidad, precioCentimos, p.escalado) : 0;
    } else {
      const s = leerNumero(l.descuento, 2);
      descuentoCentimos = s.tipo === "ok" ? s.escalado : 0;
      pctEscalado = brutoCentimos > 0 ? Math.round((descuentoCentimos * 1_000_000) / brutoCentimos) : 0;
    }
  }
  const subtotalCentimos = brutoCentimos != null ? Math.max(0, brutoCentimos - descuentoCentimos) : null;
  return { cantidad, precioCentimos, brutoCentimos, descuentoCentimos, pctEscalado, subtotalCentimos };
}

export function totalCentimos(lineas: readonly LineaBorrador[]): number {
  return lineas.reduce((acc, l) => acc + (calcularLinea(l).subtotalCentimos ?? 0), 0);
}

export function unidades(lineas: readonly LineaBorrador[]): number {
  return lineas.reduce((acc, l) => acc + (calcularLinea(l).cantidad ?? 0), 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué le falta (las reglas de `crear_orden_compra`, dichas para quien llena)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que se le pregunta a la base que la pantalla no sabe sola: qué proveedores, categorías, marcas y destinos siguen activos. Al
 *  EDITAR, el cargador suma a esos conjuntos lo que la orden ya tenía aunque hoy esté inactivo (la base no vuelve a juzgar lo que no
 *  se tocó), y `entregaOriginal` es la fecha guardada: dejarla como estaba vale aunque ya haya pasado. */
export type ContextoValidacion = {
  hoy: string;
  proveedoresActivos: ReadonlySet<string>;
  categoriasActivas: ReadonlySet<string>;
  marcasActivas: ReadonlySet<string>;
  destinos: ReadonlySet<string>;
  entregaOriginal?: string;
  /** `false` = «Llega a» todavía tiene el valor de fábrica (la sede donde se trabaja) y la persona no lo eligió. Sin dato, cuenta como
   *  elegido (al editar, el destino es el que la orden ya tenía). */
  destinoElegido?: boolean;
  /** La orden llegó con sus prendas puestas (la abrió Análisis): lo que sigue es la cantidad de cada una, así que la entrega estimada
   *  —que es solo una sugerencia— espera DESPUÉS de las líneas. Sin esto, la luz se detendría en la entrega antes de llegar a la primera
   *  cantidad. */
  lineasPrimero?: boolean;
};

/** Lo que se le dice a quien escribió miles con punto: las dos lecturas y cómo escribir la que quiso. */
const limpio = (texto: string) => texto.replace(/\s+/g, "").replace(/^s\//i, "");
function dudaDeCantidad(texto: string): string {
  const t = limpio(texto);
  return `¿«${t}» son ${t.replace(".", "")}? Escribe la cantidad sin punto: ${t.replace(".", "")}.`;
}
function dudaDeMonto(texto: string): string {
  const t = limpio(texto);
  const miles = t.replace(".", "");
  const decimal = t.slice(0, -1); // «1.500» → «1.50»: el cero de más
  return `¿«${t}» es S/\u00a0${miles} o S/\u00a0${decimal}? Escríbelo sin punto (${miles}) o con dos decimales (${decimal}).`;
}

/** Si la línea tiene un número escrito con miles con punto, la frase que lo explica (para decirla A LA VISTA bajo la línea, no solo al
 *  pasar el mouse por «Falta: Línea N»); null si no hay duda. */
export function dudaDeLinea(l: LineaBorrador): string | null {
  const ambiguo = (texto: string, decimales: number) => {
    const r = leerNumero(texto, decimales);
    return r.tipo === "mal" && r.motivo === "ambiguo";
  };
  if (ambiguo(l.cantidad, 0)) return dudaDeCantidad(l.cantidad);
  if (ambiguo(l.precio, 2)) return dudaDeMonto(l.precio);
  if (l.modoDescuento === "soles" && ambiguo(l.descuento, 2)) return dudaDeMonto(l.descuento);
  return null;
}

/** Lo que se le dice a quien dejó la cantidad vacía (la guía lo reconoce para decir algo más a una línea que llegó armada). */
const SIN_CANTIDAD = "Escribe la cantidad.";

/** El primer problema de una línea, en una frase para quien la llena; null si la línea está lista. */
export function problemaDeLinea(l: LineaBorrador, ctx: ContextoValidacion): string | null {
  if (!l.categoriaId || !ctx.categoriasActivas.has(l.categoriaId)) return "Elige la categoría.";
  if (!l.marcaId || !ctx.marcasActivas.has(l.marcaId)) return "Elige la marca.";
  if (l.descripcion.trim().length > TOPES.descripcion) return `La descripción va hasta ${TOPES.descripcion} letras.`;
  const cant = leerNumero(l.cantidad, 0);
  if (cant.tipo === "vacio") return SIN_CANTIDAD;
  if (cant.tipo === "mal" && cant.motivo === "ambiguo") return dudaDeCantidad(l.cantidad);
  if (cant.tipo === "mal" || cant.escalado < 1 || cant.escalado > TOPES.cantidad) return "La cantidad va de 1 a 99 999 unidades, sin decimales.";
  const precio = leerNumero(l.precio, 2);
  if (precio.tipo === "vacio") return "Escribe el precio por unidad.";
  if (precio.tipo === "mal" && precio.motivo === "ambiguo") return dudaDeMonto(l.precio);
  if (precio.tipo === "mal" || precio.escalado > TOPES.precioCentimos) return "El precio va de S/\u00a00 a S/\u00a099 999.99, con hasta dos decimales.";
  if (l.modoDescuento === "pct") {
    const p = leerNumero(l.descuento, 4);
    if (p.tipo === "mal" || (p.tipo === "ok" && p.escalado > 1_000_000)) return "El descuento va de 0 % a 100 %.";
  } else {
    const s = leerNumero(l.descuento, 2);
    if (s.tipo === "mal" && s.motivo === "ambiguo") return dudaDeMonto(l.descuento);
    if (s.tipo === "mal" || (s.tipo === "ok" && s.escalado > cant.escalado * precio.escalado)) return "El descuento no puede pasar de lo que cuesta la línea.";
  }
  return null;
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** El último día que la base acepta como entrega estimada. */
export const entregaMaxima = (hoy: string) => sumarDias(hoy, TOPES.diasEntrega);

/** El problema de la entrega estimada, o null (vacía también vale: no es obligatoria). Al editar, la fecha que ya tenía la orden
 *  (`original`) vale tal cual, aunque haya pasado: no se obliga a moverla para corregir otra cosa (igual que la base). */
export function problemaDeEntrega(entrega: string, hoy: string, original?: string): string | null {
  if (!entrega) return null;
  if (original && entrega === original) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrega)) return "La fecha no se entiende.";
  if (entrega < hoy) return "La entrega estimada no puede ser antes de hoy.";
  if (entrega > entregaMaxima(hoy)) return "La entrega estimada va hasta dentro de un año.";
  return null;
}

/**
 * «Llega a» en la guía. Viene puesto con la sede donde se trabaja: es un valor de fábrica que IMPORTA (manda la mercadería a esa tienda).
 * Hasta que la persona lo elige —aunque elija el mismo— es «sugerido»: la luz pasa por él y no lleva ✓, pero nunca bloquea si es válido
 * (ADR-0284 act. h). Con ✓ de entrada, una prueba ciega dudó si ya estaba «hecho» cuando tenía que cambiarlo (Formidable, 2026-10-10).
 * Un destino que no es de la lista sí bloquea: la base lo rechazaría.
 */
function campoDestino(o: OrdenBorrador, ctx: ContextoValidacion): CampoDeGuia {
  const valido = o.destino === POR_REPARTIR || ctx.destinos.has(o.destino);
  if (!valido) return { id: "destino", nombre: "Llega a", requerido: true, hecho: false, pendiente: "Elige a qué tienda llega, o «Por repartir»." };
  const porRevisar = ctx.destinoElegido === false;
  return {
    id: "destino",
    nombre: "Llega a",
    requerido: false,
    sugerido: porRevisar,
    hecho: !porRevisar,
    pendiente: porRevisar ? "Revisa a dónde llega: viene puesta la tienda donde trabajas." : "",
  };
}

/**
 * «Entrega estimada» en la guía. Vacía es «sugerida»: avisa y nunca bloquea (en Gamarra muchas veces no se sabe). Pero una fecha ESCRITA
 * que la base rechazaría (pasada, o a más de un año) bloquea: antes la guía decía «puedes seguir así» con el error a la vista bajo el campo, y
 * `/chaos` (2026-10-10) guardó el año 2999 editando una orden sin fecha. La guía sale de lo que la base valida (ADR-0284, regla 5).
 */
function campoEntrega(o: OrdenBorrador, ctx: ContextoValidacion): CampoDeGuia {
  const problema = problemaDeEntrega(o.entrega, ctx.hoy, ctx.entregaOriginal);
  if (o.entrega && problema) return { id: "entrega", nombre: "Entrega estimada", requerido: true, hecho: false, pendiente: problema };
  return {
    id: "entrega",
    nombre: "Entrega estimada",
    requerido: false,
    sugerido: true,
    hecho: !!o.entrega,
    pendiente: "¿Cuándo crees que llega? Sirve para saber si se atrasa.",
  };
}

/**
 * Los campos de la guía de foco, en el orden de la pantalla. `hecho` y `requerido` son las reglas de la base: la guía no inventa
 * ninguna. La entrega estimada es «sugerida»: avisa, nunca bloquea. `responsable` solo cuenta en una terminal (decisión 39).
 */
export function camposDeLaOrden(
  o: OrdenBorrador,
  ctx: ContextoValidacion,
  responsable: { pide: boolean; listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const entrega = campoEntrega(o, ctx);
  const campos: CampoDeGuia[] = [
    { id: "proveedor", nombre: "Proveedor", requerido: true, hecho: !!o.proveedorId && ctx.proveedoresActivos.has(o.proveedorId), pendiente: "Elige el proveedor." },
    campoDestino(o, ctx),
  ];
  if (!ctx.lineasPrimero) campos.push(entrega);
  if (o.lineas.length === 0) {
    campos.push({ id: "lineas", nombre: "Prendas", requerido: true, hecho: false, pendiente: "Agrega al menos una prenda." });
  }
  o.lineas.forEach((l, i) => {
    const problema = problemaDeLinea(l, ctx);
    // Una línea que trajo Análisis ya tiene categoría y marca, y lo único que le falta es lo que la persona decide: se lo dice, y que revise
    // lo que vino armado (ADR-0284, regla 4). Si lo armado no sirve (una categoría archivada), manda el problema de siempre.
    const pendiente = l.prellenada && problema === SIN_CANTIDAD ? "Vino de Análisis: revisa la categoría y la marca, y escribe la cantidad." : (problema ?? "");
    campos.push({ id: `linea-${l.clave}`, nombre: `Línea ${i + 1}`, requerido: true, hecho: problema === null, pendiente });
  });
  if (ctx.lineasPrimero) campos.push(entrega);
  // La nota es opcional; solo pasa a bloquear si se pasa del tope (la base la rechazaría).
  const notaLarga = o.nota.trim().length > TOPES.nota;
  campos.push({
    id: "nota",
    nombre: "Nota",
    requerido: notaLarga,
    hecho: o.nota.trim().length > 0 && !notaLarga,
    pendiente: notaLarga ? `La nota va hasta ${TOPES.nota} letras.` : "",
  });
  // Más líneas de las que caben: la pantalla no deja agregarlas, pero la regla es de la base y se dice igual.
  if (o.lineas.length > TOPES.lineas) {
    campos.push({ id: "lineas", nombre: "Prendas", requerido: true, hecho: false, pendiente: `Una orden lleva hasta ${TOPES.lineas} líneas: parte el pedido en dos órdenes.` });
  }
  if (responsable.pide) {
    campos.push({ id: "responsable", nombre: "Quién la hace", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace la orden." });
  }
  return campos;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type LineaParaBase = {
  categoria_id: string;
  marca_id: string;
  descripcion?: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct?: string;
  descuento?: string;
};

export type ArgsCrearOrden = {
  p_id: string;
  p_proveedor_id: string;
  p_destino_id: string | null;
  p_fecha_entrega_estimada: string | null;
  p_nota: string | null;
  p_lineas: LineaParaBase[];
};

/** Un texto tal como viaja a la base: sin caracteres de control invisibles (el nulo, la campana…) y sin espacios en las puntas. Los saltos
 *  de línea y las tabulaciones se quedan. Un nulo pegado desde otro programa hacía que la base rechazara el guardado con un error técnico
 *  («unsupported Unicode escape sequence») que no decía qué borrar (chaos 2026-10-10). */
export function textoParaBase(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** Los argumentos de `crear_orden_compra`. Solo se llama con la orden lista (la guía sin nada requerido pendiente). */
export function argsCrearOrden(id: string, o: OrdenBorrador): ArgsCrearOrden {
  return {
    p_id: id,
    p_proveedor_id: o.proveedorId,
    p_destino_id: o.destino === POR_REPARTIR ? null : o.destino,
    p_fecha_entrega_estimada: o.entrega || null,
    p_nota: textoParaBase(o.nota) || null,
    p_lineas: lineasParaBase(o.lineas),
  };
}

export type ArgsEditarOrden = Omit<ArgsCrearOrden, "p_id"> & { p_id: string; p_version_esperada: number };

/** Los argumentos de `editar_orden_compra`: lo mismo que crear y la versión que la pantalla vio al abrir (si otra persona guardó
 *  antes, la base responde «otra persona cambió esta orden»). */
export function argsEditarOrden(id: string, version: number, o: OrdenBorrador): ArgsEditarOrden {
  return { ...argsCrearOrden(id, o), p_version_esperada: version };
}

/** Una orden guardada, como el formulario la edita. El descuento vuelve como se escribió: en % si la línea lo recuerda
 *  (`descuento_pct`), si no en soles; sin descuento, la línea queda en % y vacía, como una nueva. */
export function borradorDeDetalle(d: DetalleOrden): OrdenBorrador {
  const conDecimales = (n: number, decimales: number) => aTexto(Math.round(n * 10 ** decimales), decimales, { recortar: decimales > 2 });
  return {
    proveedorId: d.proveedor.id,
    destino: d.destino?.id ?? POR_REPARTIR,
    entrega: d.fechaEntregaEstimada ?? "",
    nota: d.nota ?? "",
    lineas: d.lineas.map((l, i) => ({
      clave: `l${i + 1}`,
      categoriaId: l.categoriaId,
      marcaId: l.marcaId,
      descripcion: l.descripcion ?? "",
      cantidad: String(l.cantidad),
      precio: conDecimales(l.precioUnitario, 2),
      ...(l.descuentoPct != null
        ? { modoDescuento: "pct" as const, descuento: conDecimales(l.descuentoPct, 4) }
        : l.descuento > 0
          ? { modoDescuento: "soles" as const, descuento: conDecimales(l.descuento, 2) }
          : { modoDescuento: "pct" as const, descuento: "" }),
    })),
  };
}

function lineasParaBase(lineas: readonly LineaBorrador[]): LineaParaBase[] {
  return lineas.map((l) => {
    const cant = leerNumero(l.cantidad, 0);
    const precio = leerNumero(l.precio, 2);
    const linea: LineaParaBase = {
      categoria_id: l.categoriaId,
      marca_id: l.marcaId,
      cantidad: cant.tipo === "ok" ? aTexto(cant.escalado, 0) : "",
      precio_unitario: precio.tipo === "ok" ? aTexto(precio.escalado, 2) : "",
    };
    const descripcion = textoParaBase(l.descripcion);
    if (descripcion) linea.descripcion = descripcion;
    if (l.modoDescuento === "pct") {
      const p = leerNumero(l.descuento, 4);
      if (p.tipo === "ok" && p.escalado > 0) linea.descuento_pct = aTexto(p.escalado, 4, { recortar: true });
    } else {
      const s = leerNumero(l.descuento, 2);
      if (s.tipo === "ok" && s.escalado > 0) linea.descuento = aTexto(s.escalado, 2);
    }
    return linea;
  });
}
