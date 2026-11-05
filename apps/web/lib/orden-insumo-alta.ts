// Nueva / Editar orden de insumos del Taller (ADR-0362, fase 7 · actividad 2): la lógica pura del formulario. Sin React ni red: se
// importa desde el cliente y se prueba sola (`orden-insumo-alta.test.ts`).
//
//   PROMETE: decir qué le falta a la orden con las MISMAS reglas que `crear_orden_insumo` y `editar_orden_insumo`
//   (`fn_orden_insumo_validar`): de aquí sale la guía de foco, y si la base rechaza algo que esto dejaba pasar, la prueba lo atrapa;
//   leer lo que se tipea («12,5», «0.0350», « 3 »), con la cuenta exacta de `ordenes-insumo-reglas.ts`; armar lo que viaja a la base;
//   y volver una orden guardada al formulario para editarla.
//   NO HACE: no habla con la base ni decide permisos (el módulo y quién firma los decide la función).
//
// Es la gemela de `orden-compra-alta.ts` (fase 1): leer un número, el texto que viaja a la base y la entrega estimada se toman de
// allá; la línea es otra —el insumo con su unidad en vez de categoría + marca, la cantidad con tres decimales y el precio con cuatro—.

import type { CampoDeGuia } from "./guia-campos";
import { aTexto, leerNumero, problemaDeEntrega, textoParaBase } from "./orden-compra-alta";
import type { PrecargaDePedido } from "./pedir-insumo-reglas";
import {
  TOPES_INSUMO,
  calcularLineaInsumo,
  cifraDeCantidad,
  dudaDeCantidadInsumo,
  dudaDePrecioInsumo,
  leerCantidadInsumo,
  leerPrecioInsumo,
  lineasConUnidadCambiada,
  nombreUnidad,
  ordenarCantidades,
  type CantidadPorUnidad,
  type DetalleOrdenInsumo,
  type ModoDescuento,
} from "./ordenes-insumo-reglas";

export type LineaInsumoBorrador = {
  /** Estable para React mientras dura el formulario; no es el id de la base. */
  clave: string;
  insumoId: string;
  descripcion: string;
  /** En la unidad del insumo, como se tipeó. */
  cantidad: string;
  /** Por unidad del insumo, en soles, como se tipeó. */
  precio: string;
  /** Lo que se tipeó en el modo activo (`modoDescuento`). */
  descuento: string;
  modoDescuento: ModoDescuento;
  /** Al editar: la unidad del insumo cambió desde que se hizo la orden (de → a; `cantidad`, lo que la orden decía en la unidad vieja). La
   *  cantidad viene vacía para escribirla en la nueva unidad [provisional, revisar con Felipe]. Se va si se elige otro insumo. */
  unidadCambio?: { de: string; a: string; cantidad: number };
};

export type OrdenInsumoBorrador = {
  proveedorId: string;
  /** El taller al que llega; «» = sin elegir. */
  destinoId: string;
  /** `aaaa-mm-dd` o «». */
  entrega: string;
  nota: string;
  lineas: LineaInsumoBorrador[];
};

export function lineaInsumoVacia(clave: string): LineaInsumoBorrador {
  return { clave, insumoId: "", descripcion: "", cantidad: "", precio: "", descuento: "", modoDescuento: "pct" };
}

/**
 * La orden con la que abre «Nueva orden de insumos»: vacía, salvo «Llega a» (el taller que le toca) y, si la persona llegó desde un «Pedir N m»,
 * la primera línea con ese insumo y esa cantidad (en SU unidad). Se arma una sola vez, al abrir: lo que la persona escriba después no se toca.
 * El proveedor y el precio no se adivinan.
 */
export function borradorNuevoDeOrdenInsumo(destinoInicial: string, precarga: PrecargaDePedido | null): OrdenInsumoBorrador {
  const primera = lineaInsumoVacia("l1");
  if (precarga) {
    primera.insumoId = precarga.insumoId;
    primera.cantidad = precarga.cantidad ?? "";
  }
  return { proveedorId: "", destinoId: destinoInicial, entrega: "", nota: "", lineas: [primera] };
}

/**
 * Lo que la pantalla no sabe sola: qué se puede elegir. Al EDITAR, el cargador suma lo que la orden ya tenía aunque hoy esté inactivo o
 * archivado (la base no vuelve a juzgar lo que no se tocó), y `entregaOriginal` es la fecha guardada: dejarla vale aunque haya pasado.
 */
export type ContextoOrdenInsumo = {
  hoy: string;
  proveedores: ReadonlySet<string>;
  talleres: ReadonlySet<string>;
  /** Insumo → su unidad HOY (la que la base copia al guardar la línea). */
  insumos: ReadonlyMap<string, string>;
  entregaOriginal?: string;
  /** `false` = «Llega a» tiene todavía el valor de fábrica (el taller donde se trabaja) y la persona no lo eligió: es «sugerido» (con
   *  varios talleres). Sin dato cuenta como elegido (al editar, el que la orden ya tenía). Con UN solo taller no hay nada que elegir. */
  destinoElegido?: boolean;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Qué le falta (las reglas de `fn_orden_insumo_validar`, dichas para quien llena)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Si la línea tiene un número escrito con miles con punto, la frase que lo explica (a la vista bajo la línea); null si no hay duda. */
export function dudaDeLineaInsumo(l: LineaInsumoBorrador, unidad: string | null): string | null {
  const ambiguo = (r: ReturnType<typeof leerNumero>) => r.tipo === "mal" && r.motivo === "ambiguo";
  if (ambiguo(leerCantidadInsumo(l.cantidad))) return dudaDeCantidadInsumo(l.cantidad, unidad ?? "unidad");
  if (ambiguo(leerPrecioInsumo(l.precio))) return dudaDePrecioInsumo(l.precio);
  if (l.modoDescuento === "soles" && ambiguo(leerNumero(l.descuento, 2))) return dudaDePrecioInsumo(l.descuento);
  return null;
}

/** El primer problema de una línea, en una frase para quien la llena; null si la línea está lista. */
export function problemaDeLineaInsumo(l: LineaInsumoBorrador, ctx: Pick<ContextoOrdenInsumo, "insumos">): string | null {
  const unidad = l.insumoId ? (ctx.insumos.get(l.insumoId) ?? null) : null;
  if (!unidad) return "Elige el insumo.";
  if (l.descripcion.trim().length > TOPES_INSUMO.descripcion) return `La descripción va hasta ${TOPES_INSUMO.descripcion} letras.`;
  const plural = nombreUnidad(unidad);
  const cant = leerCantidadInsumo(l.cantidad);
  if (cant.tipo === "vacio") return l.unidadCambio ? `Escribe otra vez la cantidad, ahora en ${plural}.` : `Escribe la cantidad en ${plural}.`;
  if (cant.tipo === "mal" && cant.motivo === "ambiguo") return dudaDeCantidadInsumo(l.cantidad, unidad);
  if (cant.tipo === "mal" || cant.escalado < 1 || cant.escalado > TOPES_INSUMO.cantidadMilesimas)
    return `La cantidad va de 0.001 a 99 999.999 ${plural}, con hasta tres decimales.`;
  const precio = leerPrecioInsumo(l.precio);
  if (precio.tipo === "vacio") return `Escribe el costo por ${nombreUnidad(unidad, 1)}.`;
  if (precio.tipo === "mal" && precio.motivo === "ambiguo") return dudaDePrecioInsumo(l.precio);
  if (precio.tipo === "mal" || precio.escalado > TOPES_INSUMO.precioDiezmilesimas) return "El costo va de S/\u00a00 a S/\u00a099 999.9999, con hasta cuatro decimales.";
  if (l.modoDescuento === "pct") {
    const p = leerNumero(l.descuento, 4);
    if (p.tipo === "mal" || (p.tipo === "ok" && p.escalado > 1_000_000)) return "El descuento va de 0 % a 100 %.";
  } else {
    const s = leerNumero(l.descuento, 2);
    if (s.tipo === "mal" && s.motivo === "ambiguo") return dudaDePrecioInsumo(l.descuento);
    const importe = calcularLineaInsumo(l).importeCentimos ?? 0;
    if (s.tipo === "mal" || (s.tipo === "ok" && s.escalado > importe)) return "El descuento no puede pasar de lo que cuesta la línea.";
  }
  return null;
}

/**
 * «Llega a». Con UN solo taller no hay nada que elegir: va puesto y no es un campo de la guía (si es válido). Con varios, viene puesto
 * el taller donde se trabaja: es un valor de fábrica que importa (a dónde llega la tela), así que hasta que la persona lo elige es
 * «sugerido» —la luz pasa por él y no lleva ✓—, nunca un candado (ADR-0284 act. h). Uno que no es un taller activo sí bloquea: la base
 * lo rechazaría.
 */
function campoDestino(o: OrdenInsumoBorrador, ctx: ContextoOrdenInsumo): CampoDeGuia | null {
  const valido = ctx.talleres.has(o.destinoId);
  if (!valido) {
    const pendiente = ctx.talleres.size === 0 ? "No hay un taller activo al que pueda llegar: pídele al líder que active uno." : "Elige a qué taller llega.";
    return { id: "destino", nombre: "Llega a", requerido: true, hecho: false, pendiente };
  }
  if (ctx.talleres.size <= 1) return null;
  const porRevisar = ctx.destinoElegido === false;
  return {
    id: "destino",
    nombre: "Llega a",
    requerido: false,
    sugerido: porRevisar,
    hecho: !porRevisar,
    pendiente: porRevisar ? "Revisa a qué taller llega: viene puesto el taller donde trabajas." : "",
  };
}

/**
 * «Entrega estimada»: es OPCIONAL de verdad (la base la acepta vacía, y la caja dice «si la sabes»), así que vacía no se lista como «falta» ni
 * recibe la luz: queda como un campo opcional (ADR-0284, regla 5: «lo opcional de verdad no se lista como falta»; lo contrario decía «Faltan:
 * …, Entrega estimada» y, dos líneas después, «puedes seguir así»). Una fecha ESCRITA que la base rechazaría sí bloquea (como la fase 1).
 */
function campoEntrega(o: OrdenInsumoBorrador, ctx: ContextoOrdenInsumo): CampoDeGuia {
  const problema = problemaDeEntrega(o.entrega, ctx.hoy, ctx.entregaOriginal);
  if (o.entrega && problema) return { id: "entrega", nombre: "Entrega estimada", requerido: true, hecho: false, pendiente: problema };
  return { id: "entrega", nombre: "Entrega estimada", requerido: false, hecho: !!o.entrega, pendiente: "" };
}

/**
 * Los campos de la guía de foco, en el orden de la pantalla. `hecho` y `requerido` son las reglas de la base: la guía no inventa
 * ninguna (lo vigila `orden-insumo-alta.test.ts` contra los casos de `scripts/pruebas/ordenes_insumo.mjs`). `responsable` solo cuenta
 * en una terminal (decisión 39, extendida al Taller).
 */
export function camposDeLaOrdenInsumo(
  o: OrdenInsumoBorrador,
  ctx: ContextoOrdenInsumo,
  responsable: { pide: boolean; listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [
    { id: "proveedor", nombre: "Proveedor", requerido: true, hecho: !!o.proveedorId && ctx.proveedores.has(o.proveedorId), pendiente: "Elige el proveedor." },
  ];
  const destino = campoDestino(o, ctx);
  if (destino) campos.push(destino);
  campos.push(campoEntrega(o, ctx));
  if (o.lineas.length === 0) campos.push({ id: "lineas", nombre: "Insumos", requerido: true, hecho: false, pendiente: "Agrega al menos un insumo." });
  o.lineas.forEach((l, i) => {
    const problema = problemaDeLineaInsumo(l, ctx);
    campos.push({ id: `linea-${l.clave}`, nombre: `Línea ${i + 1}`, requerido: true, hecho: problema === null, pendiente: problema ?? "" });
  });
  // La nota es opcional; solo bloquea si se pasa del tope (la base la rechazaría).
  const notaLarga = o.nota.trim().length > TOPES_INSUMO.nota;
  campos.push({
    id: "nota",
    nombre: "Nota",
    requerido: notaLarga,
    hecho: o.nota.trim().length > 0 && !notaLarga,
    pendiente: notaLarga ? `La nota va hasta ${TOPES_INSUMO.nota} letras.` : "",
  });
  if (o.lineas.length > TOPES_INSUMO.lineas) {
    campos.push({ id: "lineas", nombre: "Insumos", requerido: true, hecho: false, pendiente: `Una orden lleva hasta ${TOPES_INSUMO.lineas} líneas: parte el pedido en dos órdenes.` });
  }
  if (responsable.pide) {
    campos.push({ id: "responsable", nombre: "Quién la hace", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace la orden." });
  }
  return campos;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base (números como TEXTO canónico: un flotante convertiría 0.1 + 0.2 antes de llegar al `numeric`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type LineaInsumoParaBase = {
  insumo_id: string;
  descripcion?: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct?: string;
  descuento?: string;
};

export type ArgsCrearOrdenInsumo = {
  p_id: string;
  p_proveedor_id: string;
  p_destino_id: string;
  p_fecha_entrega_estimada: string | null;
  p_nota: string | null;
  p_lineas: LineaInsumoParaBase[];
};

export type ArgsEditarOrdenInsumo = ArgsCrearOrdenInsumo & { p_version_esperada: number };

function lineasParaBase(lineas: readonly LineaInsumoBorrador[]): LineaInsumoParaBase[] {
  return lineas.map((l) => {
    const cant = leerCantidadInsumo(l.cantidad);
    const precio = leerPrecioInsumo(l.precio);
    const linea: LineaInsumoParaBase = {
      insumo_id: l.insumoId,
      cantidad: cant.tipo === "ok" ? aTexto(cant.escalado, 3, { recortar: true }) : "",
      precio_unitario: precio.tipo === "ok" ? aTexto(precio.escalado, 4, { recortar: true }) : "",
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

/** Los argumentos de `crear_orden_insumo`. Solo se llama con la orden lista (la guía sin nada requerido pendiente). */
export function argsCrearOrdenInsumo(id: string, o: OrdenInsumoBorrador): ArgsCrearOrdenInsumo {
  return {
    p_id: id,
    p_proveedor_id: o.proveedorId,
    p_destino_id: o.destinoId,
    p_fecha_entrega_estimada: o.entrega || null,
    p_nota: textoParaBase(o.nota) || null,
    p_lineas: lineasParaBase(o.lineas),
  };
}

/** Los argumentos de `editar_orden_insumo`: lo mismo que crear y la versión que la pantalla vio al abrir. */
export function argsEditarOrdenInsumo(id: string, version: number, o: OrdenInsumoBorrador): ArgsEditarOrdenInsumo {
  return { ...argsCrearOrdenInsumo(id, o), p_version_esperada: version };
}

/** Un precio guardado como se lee en su caja: con dos decimales al menos y los cuatro si los usa («25.50», «0.035»). */
function precioParaCaja(precio: number): string {
  const t = aTexto(Math.round(precio * 10_000), 4);
  return t.replace(/(\.\d\d\d?)0$/, "$1").replace(/(\.\d\d)0$/, "$1");
}

/**
 * Una orden guardada, como el formulario la edita. El descuento vuelve como se escribió: en % si la línea lo recuerda (`descuento_pct`),
 * si no en soles; sin descuento, en % y vacío. Una línea cuya unidad cambió desde que se hizo la orden vuelve con la cantidad VACÍA y
 * su aviso (`unidadCambio`): «50 metros» no se convierte sola en «50 kilos» [provisional, revisar con Felipe].
 */
export function borradorDeDetalleInsumo(d: DetalleOrdenInsumo): OrdenInsumoBorrador {
  const cambiadas = new Set(lineasConUnidadCambiada(d).map((l) => l.posicion));
  return {
    proveedorId: d.proveedor.id,
    destinoId: d.destino.id,
    entrega: d.fechaEntregaEstimada ?? "",
    nota: d.nota ?? "",
    lineas: d.lineas.map((l, i) => ({
      clave: `l${i + 1}`,
      insumoId: l.insumoId,
      descripcion: l.descripcion ?? "",
      cantidad: cambiadas.has(l.posicion) ? "" : aTexto(Math.round(l.cantidad * 1000), 3, { recortar: true }),
      precio: precioParaCaja(l.precioUnitario),
      ...(l.descuentoPct != null
        ? { modoDescuento: "pct" as const, descuento: aTexto(Math.round(l.descuentoPct * 10_000), 4, { recortar: true }) }
        : l.descuento > 0
          ? { modoDescuento: "soles" as const, descuento: aTexto(Math.round(l.descuento * 100), 2) }
          : { modoDescuento: "pct" as const, descuento: "" }),
      ...(cambiadas.has(l.posicion) && l.unidadActual ? { unidadCambio: { de: l.unidadMedida, a: l.unidadActual, cantidad: l.cantidad } } : {}),
    })),
  };
}

/** El aviso de una línea cuya unidad cambió: «La unidad de Lino crudo cambió de metro a kilo: vuelve a escribir la cantidad en kilos (la
 *  orden decía 50 metros).» Con la cantidad que tenía, para que nadie tenga que adivinarla. */
export function avisoDeUnidadCambiada(insumo: string, cambio: { de: string; a: string; cantidad: number }): string {
  return (
    `La unidad de ${insumo} cambió de ${cambio.de} a ${cambio.a}: vuelve a escribir la cantidad en ${nombreUnidad(cambio.a)} ` +
    `(la orden decía ${cifraDeCantidad(cambio.cantidad)} ${nombreUnidad(cambio.de, cambio.cantidad)}).`
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Las opciones del combo de insumo y dónde se dice un rechazo de la base
// ---------------------------------------------------------------------------------------------------------------------------------

export type OpcionInsumo = { valor: string; texto: string; detalle: string; claves: string[] };

/**
 * Las opciones del combo «Insumo»: el nombre, y debajo el código y en qué se pide («LIN-01 · en metros»); se encuentra también por su
 * código. Con el proveedor elegido, los insumos que se le compran de costumbre (`insumos.proveedor_id`) van primero; la orden acepta
 * cualquiera (no es un candado, `fn_orden_insumo_validar`) y no toca el catálogo.
 */
export function opcionesDeInsumo(
  insumos: readonly { id: string; codigo: string; nombre: string; unidadMedida: string; proveedorId: string | null }[],
  proveedorId: string,
): OpcionInsumo[] {
  const suyo = (i: { proveedorId: string | null }) => (proveedorId && i.proveedorId === proveedorId ? 0 : 1);
  return [...insumos]
    .sort((a, b) => suyo(a) - suyo(b) || a.nombre.localeCompare(b.nombre, "es") || a.codigo.localeCompare(b.codigo, "es"))
    .map((i) => ({
      valor: i.id,
      texto: i.nombre,
      detalle: [i.codigo, `en ${nombreUnidad(i.unidadMedida)}`].filter(Boolean).join(" · "),
      claves: i.codigo ? [i.codigo] : [],
    }));
}

/** Dónde se dice un rechazo de la base: bajo su campo, bajo su línea (`linea`, desde 1), sobre la lista de insumos o en el aviso de la
 *  hoja, sobre los botones (ADR-0358: el error de un dato bajo su campo; el de toda la hoja, en `<Aviso tono="error">`). */
export type LugarDelError = { donde: "proveedor" | "destino" | "entrega" | "nota" | "lineas" | "hoja" } | { donde: "linea"; linea: number };

const POR_HINT: Record<string, LugarDelError["donde"]> = {
  orden_insumo_proveedor: "proveedor",
  orden_insumo_destino: "destino",
  orden_insumo_entrega: "entrega",
  orden_insumo_nota: "nota",
  orden_insumo_sin_lineas: "lineas",
  orden_insumo_muchas_lineas: "lineas",
};
const DE_UNA_LINEA = new Set(["orden_insumo_linea", "orden_insumo_insumo", "orden_insumo_descripcion", "orden_insumo_cantidad", "orden_insumo_precio", "orden_insumo_descuento"]);

/** El lugar de un rechazo según su hint (los de `fn_orden_insumo_validar`). Los de una línea dicen cuál en el mensaje («… de la línea 2 …»).
 *  Todo lo demás —ya se guardó, otra persona la cambió, falta quién la hace, se cortó la señal— va en el aviso de la hoja. */
export function lugarDelError(error: { hint?: string | null; message?: string | null } | null): LugarDelError {
  const hint = error?.hint ?? "";
  if (POR_HINT[hint]) return { donde: POR_HINT[hint]! } as LugarDelError;
  if (DE_UNA_LINEA.has(hint)) {
    const n = /\bl[ií]nea (\d+)\b/i.exec(error?.message ?? "");
    if (n) return { donde: "linea", linea: Number(n[1]) };
    return { donde: "lineas" };
  }
  return { donde: "hoja" };
}

/** Lo que lleva la orden mientras se llena, por unidad («12.5 metros · 4 conos»), con las líneas que ya tienen insumo y una cantidad que se
 *  entiende. En milésimas hasta el final: sumar 0.1 + 0.2 metros como flotantes daría 0.30000000000000004. */
export function cantidadesDelBorrador(lineas: readonly LineaInsumoBorrador[], insumos: ReadonlyMap<string, string>): CantidadPorUnidad[] {
  const porUnidad = new Map<string, number>();
  for (const l of lineas) {
    const unidad = insumos.get(l.insumoId);
    const cant = leerCantidadInsumo(l.cantidad);
    if (!unidad || cant.tipo !== "ok" || cant.escalado <= 0) continue;
    porUnidad.set(unidad, (porUnidad.get(unidad) ?? 0) + cant.escalado);
  }
  return ordenarCantidades([...porUnidad.entries()].map(([unidad, milesimas]) => ({ unidad, cantidad: milesimas / 1000 })));
}
