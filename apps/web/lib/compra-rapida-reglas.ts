import { soles } from "./compras-reglas";
import { leerMontoPlata } from "./monto-plata-reglas";
import { problemaDeMonto } from "./fondos-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { nombresParecidos } from "./nombres-parecidos";
import { diasEntreFechas } from "./fechas-lima";

// Compras simple (ADR-0480, actividad 3): «Compré ropa» desde el celular. Las reglas puras: leer lo que manda la base (vieja o rota: nunca
// se cae), buscar proveedores por nombre y por lo que venden, los habituales de uno, lo que se dice en cada paso, lo que falta en el paso del
// papel (lo MISMO que rechaza `registrar_compra_rapida`, 20261023005000: la guía no agrega reglas, ADR-0284) y lo que se manda a la base.
// Sin Supabase: lo importan el servidor y la pantalla.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_PROVEEDORES_PARA_COMPRAR = "fn_proveedores_para_comprar";
export const RPC_HABITUALES_PROVEEDOR = "fn_habituales_proveedor";
export const RPC_REGISTRAR_COMPRA_RAPIDA = "registrar_compra_rapida";

/** La carpeta de las fotos de los papeles dentro del depósito de las fotos de los gastos del viaje (la base exige que la ruta empiece así). */
export const CARPETA_PAPELES = "papeles/";

/** Cuántos habituales se ven antes de «Ver todos los suyos» (la maqueta aprobada). */
export const HABITUALES_A_LA_VISTA = 6;

export type TipoPapel = "factura" | "boleta" | "nota_venta" | "sin_comprobante";

/** Qué le dio el proveedor, en palabras de la tienda, con su ayuda. */
export const TIPOS_PAPEL: Record<TipoPapel, { nombre: string; ayuda: string }> = {
  factura: { nombre: "Factura", ayuda: "Con RUC" },
  boleta: { nombre: "Boleta", ayuda: "Con número" },
  nota_venta: { nombre: "Nota de venta", ayuda: "Papel simple" },
  sin_comprobante: { nombre: "Sin papel", ayuda: "No me dieron nada" },
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type ProveedorParaComprar = { id: string; nombre: string; ruc: string | null; categorias: string[]; compras: number; ultima: string | null };

/** Lo que manda `fn_proveedores_para_comprar`: el más comprado primero, como viene. */
export function leerProveedoresParaComprar(data: unknown): ProveedorParaComprar[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x): ProveedorParaComprar | null => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const id = texto(o.id);
      const nombre = texto(o.nombre);
      if (!id || !nombre) return null;
      return {
        id,
        nombre,
        ruc: texto(o.ruc),
        categorias: Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === "string") : [],
        compras: Math.max(0, Math.trunc(numero(o.compras) ?? 0)),
        ultima: texto(o.ultima),
      };
    })
    .filter((x): x is ProveedorParaComprar => x !== null);
}

/** Buscar un proveedor: por su nombre (sin tildes ni mayúsculas) y, si se eligió una categoría, solo los que la venden. */
export function filtrarProveedores(lista: readonly ProveedorParaComprar[], q: string, categoriaId: string | null): ProveedorParaComprar[] {
  const n = normalizar(q);
  return lista.filter((p) => (!n || normalizar(p.nombre).includes(n)) && (!categoriaId || p.categorias.includes(categoriaId)));
}

/**
 * «Les compraste hace poco» (maqueta compras-formidable-2026-10): los proveedores a los que ya se les compró, el más reciente primero.
 * Los demás se encuentran buscando o por lo que venden.
 */
export function proveedoresRecientes(lista: readonly ProveedorParaComprar[], maximo = 5): ProveedorParaComprar[] {
  return lista
    .filter((p) => p.compras > 0 && p.ultima)
    .sort((a, b) => (a.ultima! < b.ultima! ? 1 : a.ultima! > b.ultima! ? -1 : b.compras - a.compras))
    .slice(0, maximo);
}

function haceCuanto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return "hace una semana";
  if (dias < 30) return `hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 60) return "hace un mes";
  return `hace ${Math.floor(dias / 30)} meses`;
}

/** Lo que se lee bajo cada proveedor: «Le compraste hace 6 días · 4 compras», o «Todavía no le compras». `hoy` es el día de Lima. */
export function detalleProveedor(p: Pick<ProveedorParaComprar, "compras" | "ultima">, hoy: string): string {
  if (p.compras === 0) return "Todavía no le compras";
  const veces = p.compras === 1 ? "1 compra" : `${p.compras} compras`;
  return p.ultima ? `Le compraste ${haceCuanto(diasEntreFechas(p.ultima, hoy))} · ${veces}` : veces;
}

/** Las iniciales del cuadro de cada proveedor: «Textiles Rosa S.A.C.» → «TR»; una sola palabra, sus dos primeras letras. */
export function inicialesProveedor(nombre: string): string {
  const palabras = nombre
    .replace(/\s+(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?a\.?)$/i, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/** Las categorías que vende al menos un proveedor (las píldoras de «¿A quién le compras?»), en el orden del catálogo que se pase. */
export function categoriasConProveedor(lista: readonly ProveedorParaComprar[], categorias: readonly { id: string; nombre: string }[]) {
  const usadas = new Set(lista.flatMap((p) => p.categorias));
  return categorias.filter((c) => usadas.has(c.id));
}

export type Habitual = {
  clave: string;
  productoId: string | null;
  nombre: string;
  categoriaId: string;
  categoria: string;
  marcaId: string | null;
  marca: string | null;
  /** Cuántas veces se le compró aquí; 0 = está en el catálogo con ese proveedor, todavía no se le compró desde aquí. */
  veces: number;
  ultimaFecha: string | null;
  ultimaCantidad: number | null;
  costo: number | null;
  venta: number | null;
};

/** Lo que manda `fn_habituales_proveedor`: lo más comprado primero, como viene. */
export function leerHabituales(data: unknown): Habitual[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x): Habitual | null => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const clave = texto(o.clave);
      const nombre = texto(o.nombre);
      const categoriaId = texto(o.categoria_id);
      if (!clave || !nombre || !categoriaId) return null;
      return {
        clave,
        productoId: texto(o.producto_id),
        nombre,
        categoriaId,
        categoria: texto(o.categoria) ?? "",
        marcaId: texto(o.marca_id),
        marca: texto(o.marca),
        veces: Math.max(0, Math.trunc(numero(o.veces) ?? 0)),
        ultimaFecha: texto(o.ultima_fecha),
        ultimaCantidad: numero(o.ultima_cantidad),
        costo: numero(o.costo),
        venta: numero(o.venta),
      };
    })
    .filter((x): x is Habitual => x !== null);
}

/** Las píldoras de «¿Qué le compras hoy?»: cada categoría de sus habituales con cuántos hay, si son más de una. */
export function categoriasDeHabituales(lista: readonly Habitual[]): { id: string; nombre: string; cuantos: number }[] {
  const porId = new Map<string, { id: string; nombre: string; cuantos: number }>();
  for (const h of lista) {
    const c = porId.get(h.categoriaId) ?? { id: h.categoriaId, nombre: h.categoria, cuantos: 0 };
    c.cuantos += 1;
    porId.set(h.categoriaId, c);
  }
  return porId.size > 1 ? [...porId.values()] : [];
}

/** La línea chica de una tarjeta de habitual: lo de la vez pasada, o lo que dice el catálogo si nunca se le compró aquí. */
export function textoHabitual(h: Habitual): string | null {
  if (h.veces > 0 && h.ultimaCantidad != null && h.costo != null) {
    return `La vez pasada: ${h.ultimaCantidad} a ${soles(h.costo)}${h.venta != null ? ` · se vendió a ${soles(h.venta)}` : ""}`;
  }
  if (h.venta != null) return `En el catálogo: se vende a ${soles(h.venta)}`;
  return null;
}

export type LineaCompra = {
  /** La clave del habitual del que salió (para decir «Ya va» en su tarjeta). */
  clave: string;
  productoId: string | null;
  categoriaId: string;
  marcaId: string | null;
  nombre: string;
  categoria: string;
  marca: string | null;
  cantidad: number;
  costo: number;
  venta: number | null;
  destinoId: string;
};

export const totalDeLineas = (lineas: readonly Pick<LineaCompra, "cantidad" | "costo">[]): number =>
  Math.round(lineas.reduce((s, l) => s + l.cantidad * l.costo, 0) * 100) / 100;

export const prendasDeLineas = (lineas: readonly Pick<LineaCompra, "cantidad">[]): number => lineas.reduce((s, l) => s + l.cantidad, 0);

/** «¿Cuántas compraste?»: un entero de 1 a 99 999 (la regla de las líneas de una orden). */
export function leerCantidad(t: string): number | null {
  const limpio = t.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return n >= 1 && n <= 99999 ? n : null;
}

/** Un precio de una prenda (costo o venta): de S/ 0 a S/ 99 999.99, con hasta dos decimales. Vacío o ilegible, null. */
export function leerPrecio(t: string): number | null {
  const n = leerMontoPlata(t);
  // Dos decimales como máximo (0.29 × 100 da 28.999…: se compara con un margen, no con ===).
  if (n == null || n < 0 || n > 99999.99 || Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  return n;
}

/** Lo que dice bajo el botón gris de un paso de la prenda (la maqueta: el botón dice qué falta). */
export function faltaEnPaso(paso: "cantidad" | "costo" | "venta", t: string): string | null {
  if (paso === "cantidad") return leerCantidad(t) == null ? "Escribe cuántas compraste" : null;
  return leerPrecio(t) == null ? "Escribe el precio" : null;
}

// ---------- La hoja de la prenda (rediseño, maqueta compras-formidable-2026-10, Felipe 2026-10-23) ----------
// Al tocar una prenda se abre UNA hoja con lo que antes eran cuatro pantallas seguidas: cuántas, el costo, la venta y la tienda (que se
// sigue eligiendo por prenda: Felipe, 2026-10-23). Lo que falta es lo mismo que antes frenaba cada paso: la guía no agrega reglas.

/** Lo que se va escribiendo en la hoja de una prenda. `destinoId`: la tienda; llega con la de la prenda anterior. */
export type BorradorPrenda = { cantidad: string; costo: string; venta: string; destinoId: string | null };

/** Los campos de la hoja, en su orden, para la guía de foco. */
export function camposPrenda(b: BorradorPrenda): CampoDeGuia[] {
  return [
    { id: "cantidad", nombre: "Cuántas", requerido: true, hecho: faltaEnPaso("cantidad", b.cantidad) === null, pendiente: "Escribe cuántas compraste." },
    { id: "costo", nombre: "Costo", requerido: true, hecho: faltaEnPaso("costo", b.costo) === null, pendiente: "Escribe cuánto te costó cada una." },
    { id: "venta", nombre: "Venta", requerido: true, hecho: faltaEnPaso("venta", b.venta) === null, pendiente: "Escribe a cuánto se vende." },
    { id: "tienda", nombre: "Tienda", requerido: true, hecho: b.destinoId !== null, pendiente: "Elige a qué tienda va." },
  ];
}

/** «Por cada una ganas S/ 22.40»: la venta menos el costo, si los dos se leen. */
export function gananciaPorPrenda(b: Pick<BorradorPrenda, "costo" | "venta">): number | null {
  const costo = leerPrecio(b.costo);
  const venta = leerPrecio(b.venta);
  return costo == null || venta == null ? null : Math.round((venta - costo) * 100) / 100;
}

/** El botón de la hoja dice lo que hace: «Agregar 12 · S/ 210.00» (o «Guardar …» si corrige una que ya va). */
export function textoAgregarPrenda(b: Pick<BorradorPrenda, "cantidad" | "costo">, corrige: boolean): string {
  const verbo = corrige ? "Guardar" : "Agregar";
  const cantidad = leerCantidad(b.cantidad);
  const costo = leerPrecio(b.costo);
  return cantidad != null && costo != null ? `${verbo} ${cantidad} · ${soles(Math.round(cantidad * costo * 100) / 100)}` : verbo;
}

/** La línea que entra a la compra desde la hoja. `null` si falta algo (el botón ya está apagado). */
export function lineaDeBorrador(h: Pick<Habitual, "clave" | "productoId" | "categoriaId" | "marcaId" | "nombre" | "categoria" | "marca">, b: BorradorPrenda): LineaCompra | null {
  const cantidad = leerCantidad(b.cantidad);
  const costo = leerPrecio(b.costo);
  const venta = leerPrecio(b.venta);
  if (cantidad == null || costo == null || venta == null || b.destinoId == null) return null;
  return {
    clave: h.clave,
    productoId: h.productoId,
    categoriaId: h.categoriaId,
    marcaId: h.marcaId,
    nombre: h.nombre,
    categoria: h.categoria,
    marca: h.marca,
    cantidad,
    costo,
    venta,
    destinoId: b.destinoId,
  };
}

/** La barra negra de abajo: «12 prendas · S/ 210.00» y «2 modelos». */
export function resumenCarrito(lineas: readonly Pick<LineaCompra, "cantidad" | "costo">[]): { titulo: string; detalle: string } {
  const n = prendasDeLineas(lineas);
  return {
    titulo: `${n === 1 ? "1 prenda" : `${n} prendas`} · ${soles(totalDeLineas(lineas))}`,
    detalle: lineas.length === 1 ? "1 modelo" : `${lineas.length} modelos`,
  };
}

/** «Si se vende todo, ganas S/ X» (y cuánto se vende): con el precio de venta de cada prenda. Sin precios de venta, null. */
export function gananciaDeCompra(lineas: readonly Pick<LineaCompra, "cantidad" | "costo" | "venta">[]): { vendes: number; ganas: number } | null {
  const conVenta = lineas.filter((l) => l.venta != null);
  if (conVenta.length === 0) return null;
  const vendes = Math.round(conVenta.reduce((s, l) => s + l.cantidad * (l.venta ?? 0), 0) * 100) / 100;
  return { vendes, ganas: Math.round((vendes - totalDeLineas(conVenta)) * 100) / 100 };
}

/**
 * Lo que dice bajo «¿Cuánto dice el papel?»: si cuadra con lo anotado, en verde; si no, en ámbar, que deje el del papel (Felipe
 * 2026-10-23: «manda el papel», ADR-0480). Sin un monto legible, nada.
 */
export function cuadraElPapel(monto: number | null, total: number): { cuadra: boolean; texto: string } | null {
  if (monto == null || monto <= 0) return null;
  return Math.abs(monto - total) < 0.005
    ? { cuadra: true, texto: "Cuadra con lo que anotaste" }
    : { cuadra: false, texto: `Anotaste ${soles(total)}. Si el papel dice otro total, deja el del papel: Compras lo revisa.` };
}

/** La tienda que llega marcada: la de la prenda anterior («Como la anterior»). */
export function tiendaAnterior(lineas: readonly LineaCompra[]): string | null {
  return lineas.at(-1)?.destinoId ?? null;
}

/** «Mandar a Tienda TRU, Tienda LIM»: las tiendas de una compra, sin repetir, en el orden en que se anotaron. */
export function tiendasDeLineas(lineas: readonly LineaCompra[], nombres: ReadonlyMap<string, string>): string[] {
  return [...new Set(lineas.map((l) => l.destinoId))].map((id) => nombres.get(id) ?? "una tienda");
}

/** Lo que queda después de guardar. En negativo no se dice «tienes S/ -40»: gastó más de lo que anotó, y lo que sigue es anotar esa plata. */
export function textoPlataDespues(queda: number): string {
  return queda >= 0
    ? `Ahora tienes ${soles(queda)} para comprar.`
    : `Gastaste ${soles(-queda)} más de lo que anotaste: si te dieron más plata, anótala en «Me dieron plata».`;
}

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/**
 * Los campos del paso del papel. La foto es opcional (Felipe 2026-10-23, 20261023180000): con un papel (factura, boleta o nota) se SUGIERE —sin
 * ella, Compras copia la serie y el número del papel en la mano—, nunca frena el guardado. Sin papel, ni se ofrece.
 */
export function camposPapel(v: { tipo: TipoPapel | null; conFoto: boolean; monto: string; pago?: PagoCompra }, r: Responsable): CampoDeGuia[] {
  const monto = problemaDeMonto(v.monto);
  const conPapel = v.tipo !== null && v.tipo !== "sin_comprobante";
  // Sin `pago` (las pantallas que no lo preguntan) no entran sus campos.
  const pago = v.pago;
  const pagado = pago?.forma === "ahora" ? problemaPagado(pago.pagado, v.monto) : null;
  return [
    { id: "tipo", nombre: "Qué te dieron", requerido: true, hecho: v.tipo !== null, pendiente: "Elige qué papel te dio el proveedor." },
    ...(conPapel ? [{ id: "foto", nombre: "La foto", requerido: false, sugerido: true, hecho: v.conFoto, pendiente: "Si puedes, tómale una foto al papel." }] : []),
    { id: "monto", nombre: "Cuánto dice el papel", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    ...(pago?.forma === "ahora"
      ? [
          { id: "pagado", nombre: "Cuánto pagas ahora", requerido: true, hecho: pagado === null, pendiente: pagado ?? "" },
          { id: "medio", nombre: "Con qué pagaste", requerido: true, hecho: pago.medio !== null, pendiente: "Elige con qué pagaste." },
        ]
      : []),
    ...(r.esPersona ? [] : [{ id: "responsable", nombre: "Quién compró", requerido: true, hecho: r.listo, pendiente: r.motivo ?? "Elige quién compró." }]),
  ];
}

// ---------- Pagar ahora o después (20261023181000; Felipe 2026-10-23) ----------
// «Pagar ahora» (de fábrica, con todo lo del papel y por Yape) baja lo pagado de su plata para compras; se puede bajar el monto y lo que
// falta queda en Por pagar. «Pagar después»: no baja nada y Compras le paga al proveedor desde Por pagar. Los tres métodos salen de su
// plata para compras: el método solo dice cómo le pagó.

export type MedioPagoCompra = "yape" | "efectivo" | "transferencia";
export type PagoCompra = { forma: "ahora" | "despues"; pagado: string; medio: MedioPagoCompra | null };

/** Las fichas, en el orden de la pantalla: Yape primero, que es lo de fábrica. Las mismas fichas de color de Vender. */
export const MEDIOS_PAGO_COMPRA: readonly { clave: MedioPagoCompra; etiqueta: string; corta?: string }[] = [
  { clave: "yape", etiqueta: "Yape" },
  { clave: "efectivo", etiqueta: "Efectivo" },
  { clave: "transferencia", etiqueta: "Transferencia", corta: "Transf." },
];

/** Cómo llega el paso: pagar ahora, por Yape; lo pagado lo pone la pantalla con lo que dice el papel. */
export const PAGO_DE_FABRICA: PagoCompra = { forma: "ahora", pagado: "", medio: "yape" };

/** Lo que pagas ahora: más que cero y no más que lo que dice el papel (lo mismo que rechaza la base con `compra_rapida_pagado`). */
export function problemaPagado(pagado: string, monto: string): string | null {
  const p = leerMontoPlata(pagado);
  // Más de 2 decimales ya no se lee (`leerMontoPlata`): cae aquí.
  if (p == null || p <= 0) return "Escribe cuánto pagas ahora.";
  const m = leerMontoPlata(monto);
  if (m != null && p > m + 1e-9) return "No puede ser más que lo que dice el papel.";
  return null;
}

/** Lo que se manda a la base: pagando después, cero y sin método. */
export function pagoParaBase(pago: PagoCompra): { p_pagado: number; p_medio: MedioPagoCompra | null } {
  if (pago.forma === "despues") return { p_pagado: 0, p_medio: null };
  return { p_pagado: leerMontoPlata(pago.pagado) ?? 0, p_medio: pago.medio };
}

/** Lo que dice bajo «Pagas ahora» cuando no es todo, y en «Compra guardada»: quién paga lo que falta. */
export function textoLoQueFalta(monto: number | null, pagado: number | null): string | null {
  if (monto == null || pagado == null || pagado >= monto - 0.005) return null;
  return pagado <= 0 ? `Compras le paga al proveedor los ${soles(monto)}.` : `Compras le paga al proveedor lo que falta: ${soles(Math.round((monto - pagado) * 100) / 100)}.`;
}

/** Las prendas como las recibe `registrar_compra_rapida`. */
export function lineasParaBase(lineas: readonly LineaCompra[]) {
  return lineas.map((l) => ({
    producto_id: l.productoId,
    categoria_id: l.categoriaId,
    marca_id: l.marcaId,
    descripcion: l.nombre,
    cantidad: l.cantidad,
    costo: l.costo,
    precio_venta: l.venta,
    destino_id: l.destinoId,
  }));
}

/** El paso de la barra de avance (siempre 3, la maqueta): 1 Proveedor · 2 Prendas · 3 Boleta o factura. */
export type PasoCompra = "proveedor" | "habituales" | "revisar" | "papel" | "listo";
export function faseDePaso(p: PasoCompra): 1 | 2 | 3 {
  return p === "proveedor" ? 1 : p === "papel" || p === "listo" ? 3 : 2;
}
export function textoAvance(p: PasoCompra): string {
  const fase = faseDePaso(p);
  return `Paso ${fase} de 3 · ${fase === 1 ? "el proveedor" : fase === 2 ? "las prendas" : "el papel"}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// «Algo nuevo de este proveedor»: una prenda que todavía no le compraste, en UNA hoja, la misma de las de siempre (Felipe 2026-10-23):
// qué es, de qué marca y cómo se llama, y después cuántas, el costo, la venta y a qué tienda va. Es SOLO UNA REFERENCIA de la compra: no
// crea nada en el catálogo. La línea de la orden va sin `producto_id`, con la categoría, la marca y el nombre escrito; la prenda nace
// cuando la tienda la recibe (Recibir), que es donde se cuentan el color y las tallas. La próxima vez sale entre sus habituales por su nombre.
// ---------------------------------------------------------------------------------------------------------------------

export type CategoriaParaComprar = { id: string; nombre: string; prefijo: string | null; familia: string | null };

/** Una opción del combo, con su grupo (la `Opcion` de `Desplegable`). */
type OpcionConGrupo = { valor: string; texto: string; grupo?: string };

/** Dos grupos solo si los dos tienen algo: «Ya le compras» sobre una lista vacía de «Otras» no dice nada. */
function enDosGrupos<T extends { id: string; nombre: string }>(lista: readonly T[], primero: (x: T) => boolean, titulos: [string, string]): OpcionConGrupo[] {
  const arriba = lista.filter(primero);
  const abajo = lista.filter((x) => !primero(x));
  const opcion = (grupo: string | undefined) => (x: T) => ({ valor: x.id, texto: x.nombre, ...(grupo ? { grupo } : {}) });
  if (arriba.length === 0 || abajo.length === 0) return lista.map(opcion(undefined));
  return [...arriba.map(opcion(titulos[0])), ...abajo.map(opcion(titulos[1]))];
}

/** «¿Qué es?»: primero las categorías que ya se le compran a este proveedor, después las demás. El combo las busca sin tildes. */
export function opcionesCategoriaNueva(categorias: readonly CategoriaParaComprar[], suyas: ReadonlySet<string>): OpcionConGrupo[] {
  return enDosGrupos(categorias, (c) => suyas.has(c.id), ["Ya le compras", "Otras"]);
}

/** «¿De qué marca?»: primero las que trae este proveedor, después todas las del catálogo. */
export function opcionesMarcaNueva(marcas: readonly { id: string; nombre: string }[], delProveedor: readonly { id: string }[]): OpcionConGrupo[] {
  const suyas = new Set(delProveedor.map((m) => m.id));
  const orden = [...delProveedor.map((m) => marcas.find((x) => x.id === m.id)).filter((m) => m !== undefined), ...marcas.filter((m) => !suyas.has(m.id))];
  return enDosGrupos(orden, (m) => suyas.has(m.id), ["Las que trae", "Otras marcas"]);
}

/** Lo que se va contestando de la prenda nueva en su hoja. `descartadas`: los habituales parecidos que ya contestó con «No, es otra». */
export type BorradorNuevo = { categoriaId: string | null; marcaId: string | null; nombre: string; descartadas: ReadonlySet<string> };

/** Cómo llega la hoja: si el proveedor trae una sola marca, ya puesta (antes se saltaba la pregunta; ahora se ve y se cambia). */
export function nuevoVacio(marcasDelProveedor: readonly { id: string }[]): BorradorNuevo {
  return { categoriaId: null, marcaId: marcasDelProveedor.length === 1 ? marcasDelProveedor[0].id : null, nombre: "", descartadas: new Set() };
}

/** Lo más corto y lo más largo que se acepta como nombre de una prenda nueva (lo que la tienda reconoce al recibir). */
export const NOMBRE_NUEVO_MIN = 3;
export const NOMBRE_NUEVO_MAX = 80;

/** Lo que dice bajo el botón gris de «¿Cómo se llama?». */
export function faltaNombreNuevo(nombre: string): string | null {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (limpio.length < NOMBRE_NUEVO_MIN) return "Escribe el nombre de la prenda";
  if (limpio.length > NOMBRE_NUEVO_MAX) return `El nombre va hasta ${NOMBRE_NUEVO_MAX} letras`;
  return null;
}

/**
 * «¿Es la Blusa manga globo que le compraste?»: la prenda de sus habituales que se llama igual o casi igual (la misma regla de
 * «¿no será uno que ya existe?» de marcas y proveedores), salvo las que ya contestó con «No, es otra». Solo se pregunta, no se bloquea.
 */
export function habitualParecido(nombre: string, habituales: readonly Habitual[], descartadas: ReadonlySet<string>): Habitual | null {
  const vivos = habituales.filter((h) => !descartadas.has(h.clave));
  const { igual, parecidos } = nombresParecidos(nombre, vivos, { max: 1 });
  return igual ?? parecidos[0]?.item ?? null;
}

/** Las marcas que trae este proveedor (las de sus habituales), de la que más prendas tiene a la que menos. */
export function marcasDeHabituales(habituales: readonly Habitual[]): { id: string; nombre: string }[] {
  const porId = new Map<string, { id: string; nombre: string; n: number }>();
  for (const h of habituales) {
    if (!h.marcaId || !h.marca) continue;
    const m = porId.get(h.marcaId) ?? { id: h.marcaId, nombre: h.marca, n: 0 };
    m.n += 1;
    porId.set(h.marcaId, m);
  }
  return [...porId.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es")).map(({ id, nombre }) => ({ id, nombre }));
}

/** La prenda nueva, con la forma de un habitual (sin compras ni precios de antes): así sigue por los mismos pasos que las de siempre. */
function habitualNuevo(
  clave: string,
  v: { nombre: string; categoria: CategoriaParaComprar; marca: { id: string; nombre: string } },
): Habitual {
  return {
    clave,
    productoId: null,
    nombre: v.nombre.trim().replace(/\s+/g, " "),
    categoriaId: v.categoria.id,
    categoria: v.categoria.nombre,
    marcaId: v.marca.id,
    marca: v.marca.nombre,
    veces: 0,
    ultimaFecha: null,
    ultimaCantidad: null,
    costo: null,
    venta: null,
  };
}

/** Los campos de la hoja de una prenda nueva, en su orden: lo que la describe y después lo de siempre. */
export function camposPrendaNueva(n: BorradorNuevo, hayParecido: boolean, b: BorradorPrenda): CampoDeGuia[] {
  const nombre = faltaNombreNuevo(n.nombre);
  return [
    { id: "categoria", nombre: "Qué es", requerido: true, hecho: n.categoriaId !== null, pendiente: "Elige qué es." },
    { id: "marca", nombre: "Marca", requerido: true, hecho: n.marcaId !== null, pendiente: "Elige la marca, como dice su etiqueta." },
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombre === null && !hayParecido, pendiente: nombre ? "Escribe cómo se llama." : "Dinos si es la misma prenda." },
    ...camposPrenda(b),
  ];
}

/** La prenda nueva ya descrita, con la forma de un habitual; `null` si falta qué es, la marca o el nombre. */
export function habitualDeNuevo(
  clave: string,
  n: BorradorNuevo,
  categorias: readonly CategoriaParaComprar[],
  marcas: readonly { id: string; nombre: string }[],
): Habitual | null {
  const categoria = categorias.find((c) => c.id === n.categoriaId);
  const marca = marcas.find((m) => m.id === n.marcaId);
  if (!categoria || !marca || faltaNombreNuevo(n.nombre)) return null;
  return habitualNuevo(clave, { nombre: n.nombre, categoria, marca });
}
