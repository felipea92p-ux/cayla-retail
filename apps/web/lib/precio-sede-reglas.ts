/**
 * Precio propio por sede (Felipe 2026-10-09; base: `20261010100000_precio_propio_por_sede.sql`).
 *
 * Una tienda puede vender una prenda a otro precio que las demás. No es un descuento ni un recargo: es EL precio de esa
 * tienda, y el cliente ve uno solo. Este archivo es la parte pura de la ficha (leer el monto, cuánto se aleja del general,
 * qué falta para guardar, «desde hace N días»). La regla de cuál precio vale en cada tienda vive en la base
 * (`fn_precio_en_sede`).
 */

import type { CampoDeGuia } from "./guia-campos";

/** Una sede con precio propio, como la devuelve `fn_precios_sede_producto`. */
export type PrecioDeSede = {
  ubicacionId: string;
  sede: string;
  precio: number;
  variantes: number;
  desde: string;
  motivo: string;
  creadoPor: string | null;
};

export type FilaPrecioSede = {
  ubicacion_id: string;
  sede: string;
  precio: number | string;
  variantes: number;
  desde: string;
  motivo: string;
  creado_por_nombre: string | null;
};

export function leerPreciosDeSede(filas: readonly FilaPrecioSede[] | null | undefined): PrecioDeSede[] {
  return (filas ?? []).map((f) => ({
    ubicacionId: f.ubicacion_id,
    sede: f.sede,
    precio: Number(f.precio),
    variantes: f.variantes,
    desde: f.desde,
    motivo: f.motivo,
    creadoPor: f.creado_por_nombre,
  }));
}

/** Por encima de esta diferencia con el general, la hoja pregunta «¿seguro?» (no bloquea; Felipe 2026-10-09). */
export const AVISO_DIFERENCIA = 0.3;

/** El monto como lo escribe una persona: «129,90», «S/ 129.90», «129». Nada válido → null. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/s\/?/gi, "").replace(/\s/g, "").replace(",", ".");
  if (limpio === "" || !/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** Cuánto se aleja un precio del general, en fracción (0,1 = 10 % más; −0,1 = 10 % menos). Sin general → null. */
export function diferencia(precio: number, general: number | null): number | null {
  if (general === null || general <= 0) return null;
  return (precio - general) / general;
}

/** «S/ 10.00 más que el general (+8 %)», «S/ 5.00 menos que el general (−4 %)», «igual que el general». */
export function fraseDiferencia(precio: number, general: number | null): string | null {
  const d = diferencia(precio, general);
  if (d === null || general === null) return null;
  const monto = Math.abs(precio - general);
  if (monto < 0.005) return "igual que el general";
  const pct = Math.round(Math.abs(d) * 100);
  return `${soles(monto)} ${precio > general ? "más" : "menos"} que el general (${precio > general ? "+" : "−"}${pct} %)`;
}

/** ¿Tan lejos del general que vale la pena preguntar si no es un error de tipeo? */
export function muyLejos(precio: number | null, general: number | null): boolean {
  if (precio === null) return false;
  const d = diferencia(precio, general);
  return d !== null && Math.abs(d) > AVISO_DIFERENCIA;
}

/** «hoy», «desde ayer», «desde hace 3 días», «desde hace 2 meses». */
export function desdeHace(iso: string, ahora: Date = new Date()): string {
  const dias = Math.floor((inicioDelDia(ahora) - inicioDelDia(new Date(iso))) / 86_400_000);
  if (dias <= 0) return "desde hoy";
  if (dias === 1) return "desde ayer";
  if (dias < 60) return `desde hace ${dias} días`;
  return `desde hace ${Math.floor(dias / 30)} meses`;
}
const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Las tiendas donde esta cuenta puede poner precio y todavía no hay uno propio. */
export function tiendasLibres<T extends { id: string }>(tiendas: readonly T[], precios: readonly PrecioDeSede[]): T[] {
  const tomadas = new Set(precios.map((p) => p.ubicacionId));
  return tiendas.filter((t) => !tomadas.has(t.id));
}

/** «Tienda Arequipa» → «Arequipa»: como se dice en la tienda. Sin «Tienda» delante, queda igual. */
export function nombreCorto(sede: string): string {
  return sede.replace(/^tienda\s+/i, "").trim() || sede;
}

/** Lo que ve la colaboradora junto a un precio que es el de su tienda: «Precio de Arequipa». El cliente no lo ve. */
export function etiquetaPrecioDeSede(sede: string): string {
  return `Precio de ${nombreCorto(sede)}`;
}

/** Las filas de `fn_precios_en_sede` como mapa variante → precio de esa tienda. */
export function leerPreciosEnSede(filas: readonly { variante_id: string; precio: number | string }[] | null | undefined): Map<string, number> {
  return new Map((filas ?? []).map((f) => [f.variante_id, Number(f.precio)]));
}

/** Los precios generales con los de la tienda encima: la regla de `fn_precio_en_sede`, sobre lo ya leído. Un precio propio
 *  de una prenda que no está en `generales` no se agrega (no es de esta pantalla). */
export function conPreciosDeSede(generales: ReadonlyMap<string, number>, propios: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map(generales);
  for (const [id, precio] of propios) if (out.has(id)) out.set(id, precio);
  return out;
}

/** Prendas con el precio de UNA tienda (el de `getPreciosPorSede` para esa sede): la que tiene precio propio lo toma; las demás
 *  quedan igual. Devuelve el mismo arreglo si la tienda no tiene ninguno. */
export function conPrecioDeLaSede<P extends { precio: number }>(
  prendas: P[],
  propios: Readonly<Record<string, number>> | undefined,
  idDe: (p: P) => string,
): P[] {
  if (!propios || Object.keys(propios).length === 0) return prendas;
  return prendas.map((p) => {
    const propio = propios[idDe(p)];
    return propio !== undefined ? { ...p, precio: propio } : p;
  });
}

/** Una tienda con precio propio para una prenda, como se ve en Catálogo ▸ Productos. */
export type PrecioDeTienda = { sede: string; precio: number };

/** Por prenda, qué tiendas la venden a otro precio (uno por tienda y precio, ordenado por tienda). Las prendas sin ninguno no
 *  aparecen. `porSede` es lo de `getPreciosPorSede`; `nombres`, el nombre de cada tienda. */
export function preciosDeTiendaPorProducto(
  productos: readonly { productoId: string; varianteIds: readonly string[] }[],
  porSede: Readonly<Record<string, Readonly<Record<string, number>>>>,
  nombres: ReadonlyMap<string, string>,
): Record<string, PrecioDeTienda[]> {
  const out: Record<string, PrecioDeTienda[]> = {};
  for (const p of productos) {
    const vistos = new Set<string>();
    const lista: PrecioDeTienda[] = [];
    for (const [sedeId, precios] of Object.entries(porSede)) {
      for (const id of p.varianteIds) {
        const precio = precios[id];
        if (precio === undefined) continue;
        const clave = `${sedeId}|${precio}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        lista.push({ sede: nombreCorto(nombres.get(sedeId) ?? "otra tienda"), precio });
      }
    }
    if (lista.length > 0) out[p.productoId] = lista.sort((a, b) => a.sede.localeCompare(b.sede, "es") || a.precio - b.precio);
  }
  return out;
}

/** La insignia junto al precio: «2 precios» (el general más los de tienda) y lo que dice al pasar el mouse o al lector. */
export function insigniaPrecios(lista: readonly PrecioDeTienda[]): { texto: string; detalle: string } {
  return {
    texto: `${lista.length + 1} precios`,
    detalle: `Otro precio en ${lista.map((t) => `${t.sede} ${soles(t.precio)}`).join(" · ")}`,
  };
}

/** Las prendas de un traslado que se venden a OTRO precio en la tienda que recibe que en la que envía: su etiqueta colgada dice el
 *  precio de origen y hay que cambiarla. `generales` = `variantes.precio`; `origen`/`destino` = los propios de cada tienda. */
export function prendasConOtroPrecio(
  varianteIds: readonly string[],
  generales: ReadonlyMap<string, number>,
  origen: Readonly<Record<string, number>> | undefined,
  destino: Readonly<Record<string, number>> | undefined,
): string[] {
  return [...new Set(varianteIds)].filter((id) => {
    const general = generales.get(id);
    if (general === undefined) return false;
    return (origen?.[id] ?? general) !== (destino?.[id] ?? general);
  });
}

/** El aviso del pase de un traslado con prendas a otro precio en destino. Quien recibe: cambiar la etiqueta; quien envía: que allá la
 *  cambiarán. `null` sin prendas o para quien no es ninguna de las dos tiendas. */
export function avisoEtiquetasDeTraslado(n: number, origen: string, destino: string, quien: "origen" | "destino" | "otro"): string | null {
  if (n <= 0 || quien === "otro") return null;
  const uno = n === 1;
  const prendas = uno ? "1 prenda se vende" : `${n} prendas se venden`;
  return quien === "destino"
    ? `${prendas} aquí a otro precio que en ${nombreCorto(origen)}: al recibir${uno ? "la" : "las"}, cámbia${uno ? "le" : "les"} la etiqueta.`
    : `${prendas} a otro precio en ${nombreCorto(destino)}: allá le${uno ? "" : "s"} cambiarán la etiqueta.`;
}

/** El botón que abre la hoja (Formidable 2026-10-10): si queda UNA tienda sin precio propio, la nombra («Precio distinto en Tienda Lima»);
 *  si quedan varias, «en una tienda» (ninguna tiene precio aún) u «en otra tienda». Sin tiendas libres, `null`: no hay botón. */
export function textoPonerPrecio(libres: readonly { nombre: string }[], hayPrecios: boolean): string | null {
  if (libres.length === 0) return null;
  if (libres.length === 1) return `Precio distinto en ${libres[0]!.nombre}`;
  return hayPrecios ? "Precio distinto en otra tienda" : "Precio distinto en una tienda";
}

/** La hoja «Precio distinto en una sede»: lo que la base exige, en el orden en que se llena. */
export function camposPonerPrecio(h: {
  tiendaId: string | null;
  monto: string;
  general: number | null;
  motivo: string;
  responsableListo: boolean;
  responsableMotivo: string | null;
}): CampoDeGuia[] {
  const precio = leerMonto(h.monto);
  const igual = precio !== null && h.general !== null && Math.abs(precio - h.general) < 0.005;
  return [
    { id: "tienda", nombre: "Tienda", requerido: true, hecho: h.tiendaId !== null, pendiente: "Elige la tienda." },
    {
      id: "precio",
      nombre: "Precio en esta tienda",
      requerido: true,
      hecho: precio !== null && !igual,
      pendiente: igual ? "Ese ya es el precio general: escribe otro." : "Escribe el precio de esta tienda.",
    },
    { id: "motivo", nombre: "Por qué", requerido: true, hecho: h.motivo.trim().length >= 3, pendiente: "Escribe por qué esta tienda tiene otro precio." },
    { id: "responsable", nombre: "Quién lo cambia", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién lo cambia." },
  ];
}

/** La hoja «Quitar el precio de …»: solo quién (el motivo es opcional). */
export function camposQuitarPrecio(h: { responsableListo: boolean; responsableMotivo: string | null }): CampoDeGuia[] {
  return [{ id: "responsable", nombre: "Quién lo quita", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién lo quita." }];
}
