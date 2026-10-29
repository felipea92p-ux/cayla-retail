import { faltaEnPaso, leerCantidad, leerPrecio, leerPrecioVenta } from "./compra-rapida-reglas";
import { soles } from "./compras-reglas";

// «Corregir una compra» (ADR-0561, maqueta docs/maquetas/mis-compras-corregir-2026-10/, Felipe 2026-10-28): la compradora cambia lo que anotó mal de
// una compra, mientras Compras no la complete y su ronda siga abierta. Esta es la parte pura: leer lo que manda `fn_compra_para_corregir`, decir qué
// está mal en cada prenda (LO MISMO que rechaza `corregir_compra_rapida`: la guía no agrega reglas, ADR-0284), armar lo que se manda y calcular la
// cuenta que la hoja le muestra antes de guardar (la misma que hace la base: el papel acompaña a las prendas solo si ya cuadraba con ellas).

export const RPC_COMPRA_PARA_CORREGIR = "fn_compra_para_corregir";
export const RPC_CORREGIR_COMPRA = "corregir_compra_rapida";

export type PrendaParaCorregir = {
  /** La línea de la orden (`orden_compra_items.id`): lo que se manda para corregirla. */
  id: string;
  nombre: string;
  categoriaId: string;
  categoria: string;
  marcaId: string;
  marca: string;
  destinoId: string | null;
  destino: string | null;
  productoId: string | null;
  /** De «Del catálogo»: su nombre, categoría y marca no se cambian desde aquí. */
  esCatalogo: boolean;
  cantidad: number;
  costo: number;
  precioVenta: number | null;
  admitePrecioCero: boolean;
  /** Lo que ya salió en un envío: la prenda no puede quedar en menos. */
  enviadas: number;
};

export type CompraParaCorregir = {
  id: string;
  proveedor: string;
  tipo: string;
  monto: number;
  pagado: number;
  medioPago: string | null;
  fecha: string;
  sePuede: boolean;
  motivo: string | null;
  /** El papel dice lo mismo que suman las prendas: solo entonces acompaña a las prendas al corregir. */
  cuadra: boolean;
  totalPrendas: number;
  prendas: PrendaParaCorregir[];
  /** Las activas, para elegir la categoría y la marca de una prenda de «Algo nuevo». */
  categorias: Opcion[];
  marcas: Opcion[];
};

export type Opcion = { id: string; nombre: string };

const redondear = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lo que manda `fn_compra_para_corregir`. Un dato que no se entiende deja la compra en `null`: la hoja dice que no se pudo leer. */
export function leerCompraParaCorregir(data: unknown): CompraParaCorregir | null {
  if (!esObjeto(data) || !esObjeto(data.papel) || !Array.isArray(data.lineas)) return null;
  const p = data.papel;
  const id = texto(p.id);
  const monto = num(p.monto);
  const pagado = num(p.pagado);
  const totalPrendas = num(data.total_prendas);
  if (!id || monto == null || pagado == null || totalPrendas == null) return null;
  const prendas: PrendaParaCorregir[] = [];
  for (const l of data.lineas) {
    if (!esObjeto(l)) return null;
    const lid = texto(l.id);
    const cantidad = num(l.cantidad);
    const costo = num(l.costo);
    if (!lid || cantidad == null || costo == null) return null;
    prendas.push({
      id: lid,
      nombre: texto(l.descripcion) ?? texto(l.categoria) ?? "Prenda",
      categoriaId: texto(l.categoria_id) ?? "",
      categoria: texto(l.categoria) ?? "",
      marcaId: texto(l.marca_id) ?? "",
      marca: texto(l.marca) ?? "",
      destinoId: texto(l.destino_id),
      destino: texto(l.destino),
      productoId: texto(l.producto_id),
      esCatalogo: l.es_catalogo === true,
      cantidad,
      costo,
      precioVenta: num(l.precio_venta),
      admitePrecioCero: l.admite_precio_cero === true,
      enviadas: num(l.enviadas) ?? 0,
    });
  }
  return {
    id,
    proveedor: texto(p.proveedor) ?? "el proveedor",
    tipo: texto(p.tipo) ?? "",
    monto,
    pagado,
    medioPago: texto(p.medio_pago),
    fecha: texto(p.fecha) ?? "",
    sePuede: data.se_puede === true,
    motivo: texto(data.motivo),
    cuadra: data.cuadra === true,
    totalPrendas,
    prendas,
    categorias: leerOpciones(data.categorias),
    marcas: leerOpciones(data.marcas),
  };
}

function leerOpciones(v: unknown): Opcion[] {
  if (!Array.isArray(v)) return [];
  const lista: Opcion[] = [];
  for (const o of v) {
    if (!esObjeto(o)) continue;
    const id = texto(o.id);
    const nombre = texto(o.nombre);
    if (id && nombre) lista.push({ id, nombre });
  }
  return lista;
}

/** Por qué una compra ya no se corrige, en palabras de tienda (las claves son las de `fn_compra_corregible`). */
export function textoMotivo(motivo: string | null): string {
  switch (motivo) {
    case "completada":
      return "Compras ya completó esta compra: ya no se corrige desde aquí. Avísale a Compras.";
    case "facturada":
      return "Compras ya registró la factura de esta compra: ya no se corrige desde aquí. Avísale a Compras.";
    case "ronda_cerrada":
      return "Esta compra es de una ronda que ya cerraste: ya no se corrige.";
    case "orden_anulada":
      return "Una de las órdenes de esta compra está anulada: avísale a Compras.";
    default:
      return "Esta compra ya no se puede corregir.";
  }
}

/** Lo que la persona escribe de una prenda (siempre texto: así se ve mientras se escribe). */
export type Borrador = { cantidad: string; costo: string; venta: string; nombre: string; categoriaId: string; marcaId: string };

/** El nombre más largo que admite una línea de una orden (`fn_orden_compra_validar`). */
export const NOMBRE_MAXIMO = 200;

const dosDecimales = (n: number): string => n.toFixed(2);

export function borradorDe(p: PrendaParaCorregir): Borrador {
  return {
    cantidad: String(p.cantidad),
    costo: dosDecimales(p.costo),
    venta: p.precioVenta == null ? "" : dosDecimales(p.precioVenta),
    nombre: p.nombre,
    categoriaId: p.categoriaId,
    marcaId: p.marcaId,
  };
}

/** Lo que hay que arreglar de cada dato, o nada. Lo mismo que rechaza la base: cantidad entera de 1 a 99 999 y no menos de lo enviado, costo
 *  de S/ 0 a S/ 99 999.99, y el precio de venta de S/ 0 a S/ 5 000 (el 0 solo donde el catálogo lo admite). */
export function problemasDePrenda(
  p: PrendaParaCorregir,
  b: Borrador,
): { cantidad: string | null; costo: string | null; venta: string | null; nombre: string | null; categoria: string | null; marca: string | null } {
  const cantidad = leerCantidad(b.cantidad);
  const venta = b.venta.trim() === "" ? (p.precioVenta == null ? "sin-cambio" : null) : leerPrecioVenta(b.venta, p.admitePrecioCero);
  // El nombre, la categoría y la marca son de «Algo nuevo»: las del catálogo no se tocan desde aquí.
  const nombre = b.nombre.trim();
  return {
    nombre: p.esCatalogo ? null : nombre === "" ? "Escribe el nombre de la prenda" : nombre.length > NOMBRE_MAXIMO ? `El nombre llega hasta ${NOMBRE_MAXIMO} letras` : null,
    categoria: p.esCatalogo || b.categoriaId !== "" ? null : "Elige la categoría",
    marca: p.esCatalogo || b.marcaId !== "" ? null : "Elige la marca",
    cantidad:
      cantidad == null
        ? "Escribe cuántas unidades: un número entero, desde 1"
        : cantidad < p.enviadas
          ? `Ya salieron ${p.enviadas} en un envío: no puede quedar en menos`
          : null,
    costo: leerPrecio(b.costo) == null ? "Escribe el precio, con hasta dos decimales" : null,
    venta:
      venta === "sin-cambio"
        ? null
        : venta == null
          ? (faltaEnPaso("venta", b.venta, p.admitePrecioCero) ?? "Escribe el precio de venta")
          : null,
  };
}

export function prendaConProblema(p: PrendaParaCorregir, b: Borrador): boolean {
  const x = problemasDePrenda(p, b);
  return Object.values(x).some((v) => v !== null);
}

/** Lo que cambió respecto a lo guardado. Un dato mal escrito no cuenta como cambio (la hoja no deja guardar mientras haya uno). */
export type CambiosDePrenda = {
  cantidad?: number;
  costo?: number;
  precioVenta?: number | null;
  descripcion?: string;
  categoriaId?: string;
  marcaId?: string;
};

export function cambiosDePrenda(p: PrendaParaCorregir, b: Borrador): CambiosDePrenda {
  const cambios: CambiosDePrenda = {};
  if (!p.esCatalogo) {
    const nombre = b.nombre.trim();
    if (nombre !== "" && nombre !== p.nombre) cambios.descripcion = nombre;
    if (b.categoriaId !== "" && b.categoriaId !== p.categoriaId) cambios.categoriaId = b.categoriaId;
    if (b.marcaId !== "" && b.marcaId !== p.marcaId) cambios.marcaId = b.marcaId;
  }
  const cantidad = leerCantidad(b.cantidad);
  if (cantidad != null && cantidad !== p.cantidad) cambios.cantidad = cantidad;
  const costo = leerPrecio(b.costo);
  if (costo != null && Math.abs(costo - p.costo) > 0.001) cambios.costo = costo;
  if (b.venta.trim() === "") {
    if (p.precioVenta != null) cambios.precioVenta = null;
  } else {
    const venta = leerPrecioVenta(b.venta, p.admitePrecioCero);
    if (venta != null && (p.precioVenta == null || Math.abs(venta - p.precioVenta) > 0.001)) cambios.precioVenta = venta;
  }
  return cambios;
}

export function prendaCambio(p: PrendaParaCorregir, b: Borrador): boolean {
  return Object.keys(cambiosDePrenda(p, b)).length > 0;
}

/** Las prendas con cambios, como las recibe `corregir_compra_rapida` (solo lo que cambió). */
export function cambiosParaLaBase(prendas: readonly PrendaParaCorregir[], borradores: ReadonlyMap<string, Borrador>): Record<string, unknown>[] {
  const lista: Record<string, unknown>[] = [];
  for (const p of prendas) {
    const b = borradores.get(p.id);
    if (!b) continue;
    const c = cambiosDePrenda(p, b);
    if (Object.keys(c).length === 0) continue;
    lista.push({
      item_id: p.id,
      ...(c.cantidad !== undefined ? { cantidad: c.cantidad } : {}),
      ...(c.costo !== undefined ? { costo: c.costo } : {}),
      ...(c.precioVenta !== undefined ? { precio_venta: c.precioVenta } : {}),
      ...(c.descripcion !== undefined ? { descripcion: c.descripcion } : {}),
      ...(c.categoriaId !== undefined ? { categoria_id: c.categoriaId } : {}),
      ...(c.marcaId !== undefined ? { marca_id: c.marcaId } : {}),
    });
  }
  return lista;
}

export type CuentaDeLaCorreccion = {
  /** Cuántos datos cambian (unidades, costo y venta de cada prenda cuentan por separado). */
  datos: number;
  /** Cuántas prendas tienen algún cambio. */
  prendas: number;
  monto: number;
  pagado: number;
  /** Lo que cambia tu plata para comprar: positivo, sube (te vuelve plata); negativo, baja. */
  plata: number;
  /** Lo que le falta pagar a Compras después de corregir. */
  falta: number;
  papelAcompana: boolean;
};

/** La cuenta de `corregir_compra_rapida`: el papel acompaña si ya cuadraba con las prendas; lo pagado acompaña (pagó todo → todo el monto nuevo;
 *  una parte → no pasa del monto nuevo). */
export function cuentaDeLaCorreccion(c: CompraParaCorregir, borradores: ReadonlyMap<string, Borrador>): CuentaDeLaCorreccion {
  let datos = 0;
  let prendas = 0;
  let despues = 0;
  for (const p of c.prendas) {
    const b = borradores.get(p.id);
    // Una prenda con un dato que no se entiende no suma a la cuenta: el botón de guardar sigue apagado hasta que se arregle.
    const cambios = b && !prendaConProblema(p, b) ? cambiosDePrenda(p, b) : {};
    const n = Object.keys(cambios).length;
    datos += n;
    if (n > 0) prendas += 1;
    despues += (cambios.cantidad ?? p.cantidad) * (cambios.costo ?? p.costo);
  }
  const papelAcompana = c.cuadra;
  const monto = papelAcompana ? redondear(despues) : c.monto;
  const pagoTodo = Math.abs(c.pagado - c.monto) < 0.005;
  const pagado = redondear(pagoTodo ? monto : Math.min(c.pagado, monto));
  return { datos, prendas, monto, pagado, plata: redondear(c.pagado - pagado), falta: redondear(monto - pagado), papelAcompana };
}

/** Lo que pasa con su plata, dicho en una frase. */
export function textoDeLaPlata(plata: number): string {
  if (Math.abs(plata) < 0.005) return "Tu plata para comprar no cambia";
  return plata > 0 ? `Tu plata sube ${soles(plata)}` : `Tu plata baja ${soles(-plata)}`;
}

/** «3 cambios» o «1 cambio»: lo que cuenta el pie de la hoja. */
export function textoDeCambios(datos: number): string {
  return datos === 1 ? "1 cambio" : `${datos} cambios`;
}
