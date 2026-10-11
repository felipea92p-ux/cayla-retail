/**
 * Precio propio por sede (Felipe 2026-10-09; base: `20261010100000_precio_propio_por_sede.sql`; desde el 2026-10-10 es de la PRENDA
 * en la tienda, `20261011100000_precio_de_tienda_por_prenda.sql`).
 *
 * Una tienda puede vender una prenda a otro precio que las demás. No es un descuento ni un recargo: es EL precio de esa
 * tienda, y el cliente ve uno solo. Este archivo es la parte pura de la ficha (leer el monto, cuánto se aleja del precio de la
 * prenda, qué falta para guardar, «desde hace N días», el precio en cada tienda y la insignia «2 precios»). La regla de cuál
 * precio vale en cada tienda vive en la base (`fn_precio_en_sede`).
 *
 * VOCABULARIO EN PANTALLA (Felipe 2026-10-10: «no sé de dónde sacas lo de sugerido»). «Precio de la prenda» = el de la tabla de
 * Editar producto (`variantes.precio`), el que vale en toda tienda sin precio propio. «Precio propio» = el de UNA tienda. Nunca
 * «general», «sugerido» ni «las demás tiendas» (con dos tiendas con precio propio, «las demás» mentía).
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

/** «S/ 10.00 más que el precio de la prenda (+8 %)», «S/ 5.00 menos que el precio de la prenda (−4 %)», «igual que el precio de la
 *  prenda». `general` = el precio de la prenda (null si cambia según la talla: no hay un número contra el que medir). */
export function fraseDiferencia(precio: number, general: number | null): string | null {
  const d = diferencia(precio, general);
  if (d === null || general === null) return null;
  const monto = Math.abs(precio - general);
  if (monto < 0.005) return IGUAL_AL_DE_LA_PRENDA;
  const pct = Math.round(Math.abs(d) * 100);
  return `${soles(monto)} ${precio > general ? "más" : "menos"} que el precio de la prenda (${precio > general ? "+" : "−"}${pct} %)`;
}
export const IGUAL_AL_DE_LA_PRENDA = "igual que el precio de la prenda";

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

/** Una tienda y el precio al que vende una prenda (el suyo o el de la prenda), como se ve en Catálogo ▸ Productos. `hasta`: la tienda
 *  sin precio propio de una prenda con precio por talla vende de `precio` a `hasta` («S/ 69.90–79.90»). */
export type PrecioDeTienda = { sede: string; precio: number; hasta?: number };

/** Por prenda con algún precio propio, el precio en CADA tienda abierta: el propio (uno para toda la prenda) o, si no tiene, el de la
 *  prenda (`preciosPrenda`: de su talla más barata a la más cara; con precio por talla, un rango). Ordenado por tienda. Las prendas sin
 *  precios propios no aparecen. `porSede` es lo de `getPreciosPorSede` (solo las variantes que cambian de precio en esa tienda);
 *  `nombres`, las tiendas abiertas. */
export function preciosDeTiendaPorProducto(
  productos: readonly { productoId: string; varianteIds: readonly string[]; preciosPrenda: { desde: number; hasta: number } | null }[],
  porSede: Readonly<Record<string, Readonly<Record<string, number>>>>,
  nombres: ReadonlyMap<string, string>,
): Record<string, PrecioDeTienda[]> {
  const out: Record<string, PrecioDeTienda[]> = {};
  for (const p of productos) {
    const propioEn = (sedeId: string) => {
      const precios = porSede[sedeId];
      if (!precios) return undefined;
      for (const id of p.varianteIds) if (precios[id] !== undefined) return precios[id];
      return undefined;
    };
    const sedes = new Set([...nombres.keys(), ...Object.keys(porSede)]);
    if (![...sedes].some((s) => propioEn(s) !== undefined)) continue;
    const lista: PrecioDeTienda[] = [];
    for (const sedeId of sedes) {
      const sede = nombreCorto(nombres.get(sedeId) ?? "otra tienda");
      const propio = propioEn(sedeId);
      if (propio !== undefined) lista.push({ sede, precio: propio });
      else if (p.preciosPrenda) {
        const { desde, hasta } = p.preciosPrenda;
        lista.push(hasta - desde >= 0.005 ? { sede, precio: desde, hasta } : { sede, precio: desde });
      }
    }
    out[p.productoId] = lista.sort((a, b) => a.sede.localeCompare(b.sede, "es") || a.precio - b.precio);
  }
  return out;
}

/** «AQP», «AQP y Lima», «AQP, Lima y TRU». */
export function unirConY(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** La insignia junto al precio: cuántos precios DISTINTOS tiene la prenda entre las tiendas («2 precios») y cuál en cada una,
 *  juntas las que venden igual: «AQP y Lima S/ 79.90 · TRU S/ 69.90» (al pasar el mouse y para el lector de pantalla). Si todas
 *  venden al mismo precio, `null`: no hay insignia (antes contaba tiendas más uno y decía «3 precios» con dos, FAL-0008). */
export function insigniaPrecios(lista: readonly PrecioDeTienda[] | undefined): { texto: string; detalle: string } | null {
  // Un rango («S/ 69.90–79.90», la prenda con precio por talla) es un grupo aparte de cualquier precio único.
  const grupos = new Map<string, { texto: string; sedes: string[] }>();
  for (const t of lista ?? []) {
    const clave = t.hasta !== undefined ? `${t.precio.toFixed(2)}-${t.hasta.toFixed(2)}` : t.precio.toFixed(2);
    const texto = t.hasta !== undefined ? `${soles(t.precio)}–${t.hasta.toFixed(2)}` : soles(t.precio);
    const g = grupos.get(clave) ?? { texto, sedes: [] };
    g.sedes.push(t.sede);
    grupos.set(clave, g);
  }
  if (grupos.size <= 1) return null;
  return {
    texto: `${grupos.size} precios`,
    detalle: [...grupos.values()].map((g) => `${unirConY(g.sedes)} ${g.texto}`).join(" · "),
  };
}

/** Una tienda en el bloque «Precio por tienda» de la ficha: con su precio propio, o con el de la prenda. */
export type FilaPrecioTienda = { ubicacionId: string; sede: string; precio: number | null; propio: PrecioDeSede | null };

/** Todas las tiendas abiertas, cada una con el precio al que vende la prenda (Felipe 2026-10-10: «el de AQP 79.90 y TRU 69.90»; antes
 *  la ficha decía «Las demás tiendas: S/ 79.90» bajo AQP, y TRU estaba a 69.90). Un precio propio de una tienda que ya no está abierta
 *  igual se muestra: sigue en la base. `precioPrenda` null = el de la prenda cambia según la talla. */
export function preciosEnCadaTienda(
  tiendas: readonly { id: string; nombre: string }[],
  propios: readonly PrecioDeSede[],
  precioPrenda: number | null,
): FilaPrecioTienda[] {
  const porTienda = new Map(propios.map((p) => [p.ubicacionId, p] as const));
  const filas: FilaPrecioTienda[] = tiendas.map((t) => {
    const propio = porTienda.get(t.id) ?? null;
    return { ubicacionId: t.id, sede: t.nombre, precio: propio ? propio.precio : precioPrenda, propio };
  });
  for (const p of propios) {
    if (!tiendas.some((t) => t.id === p.ubicacionId)) filas.push({ ubicacionId: p.ubicacionId, sede: p.sede, precio: p.precio, propio: p });
  }
  return filas.sort((a, b) => a.sede.localeCompare(b.sede, "es"));
}

/** El precio de la prenda si todas sus tallas activas valen lo mismo; si cambia según la talla, null. Sin tallas con precio, null. */
export function precioUnico(precios: readonly number[]): number | null {
  const validos = precios.filter((p) => Number.isFinite(p) && p > 0);
  if (validos.length === 0) return null;
  const primero = validos[0]!;
  return validos.every((p) => Math.abs(p - primero) < 0.005) ? primero : null;
}

/** Qué pasa en una tienda con precio propio cuando cambia el precio de la prenda (Felipe 2026-10-10: «preguntar al guardar»):
 *  - `se-iguala`: el precio nuevo de la prenda es el mismo que el suyo → deja de ser propio solo (la base lo archiva).
 *  - `se-queda`: sigue con su precio; quien puede tocar esa tienda puede «igualarla» al nuevo (quitar su precio propio). */
export type TiendaAlCambiarPrecio = {
  ubicacionId: string;
  sede: string;
  propio: number;
  que: "se-iguala" | "se-queda";
  puedeIgualar: boolean;
};

/** Al guardar la ficha: si cambió el precio de alguna talla activa y la prenda tiene precios propios, qué pasa en cada tienda y cuáles
 *  siguen al precio de la prenda. `null` si no hay nada que preguntar (no cambió el precio, o ninguna tienda tiene uno propio).
 *  `antes`/`despues` son los precios de las tallas ACTIVAS (los de la tabla, sin las desactivadas). */
export function tiendasAlCambiarPrecio(h: {
  propios: readonly PrecioDeSede[];
  tiendas: readonly { id: string; nombre: string }[];
  antes: readonly number[];
  despues: readonly number[];
  puedeTocar: (ubicacionId: string) => boolean;
}): { conPropio: TiendaAlCambiarPrecio[]; siguen: string[]; antes: number | null; despues: number | null } | null {
  if (h.propios.length === 0) return null;
  // Precios DISTINTOS: agregar o desactivar una talla al mismo precio no es «cambiar el precio» (antes la hoja decía «79.90 → 79.90»).
  const clave = (xs: readonly number[]) => [...new Set(xs.map((x) => x.toFixed(2)))].sort().join("|");
  if (clave(h.antes) === clave(h.despues)) return null;
  const despues = precioUnico(h.despues);
  const conPropio = [...h.propios]
    .sort((a, b) => a.sede.localeCompare(b.sede, "es"))
    .map<TiendaAlCambiarPrecio>((p) => {
      const iguala = despues !== null && Math.abs(despues - p.precio) < 0.005;
      return { ubicacionId: p.ubicacionId, sede: p.sede, propio: p.precio, que: iguala ? "se-iguala" : "se-queda", puedeIgualar: !iguala && h.puedeTocar(p.ubicacionId) };
    });
  const conPropioIds = new Set(h.propios.map((p) => p.ubicacionId));
  const siguen = h.tiendas.filter((t) => !conPropioIds.has(t.id)).map((t) => t.nombre).sort((a, b) => a.localeCompare(b, "es"));
  return { conPropio, siguen, antes: precioUnico(h.antes), despues };
}

/** Cuántas prendas de esta tienda llevan colgada una etiqueta con otro precio, dicho para quien acaba de cambiarlo: «En Tienda AQP
 *  hay 3 prendas con la etiqueta de S/ 69.90: cámbiales la etiqueta.» Sin prendas, null. */
export function avisoEtiquetasAlCambiar(unidades: number, sede: string, etiquetaVieja: number | null): string | null {
  if (unidades <= 0) return null;
  const uno = unidades === 1;
  const cuantas = uno ? "1 prenda" : `${unidades} prendas`;
  const dice = etiquetaVieja !== null ? ` con la etiqueta de ${soles(etiquetaVieja)}` : " con la etiqueta de antes";
  return `En ${sede} hay ${cuantas}${dice}: cámbia${uno ? "le" : "les"} la etiqueta.`;
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
  // «Igual» solo si TODAS las tallas valen eso (`general` es null cuando cambia según la talla): es lo que rechaza la base.
  const igual = precio !== null && h.general !== null && Math.abs(precio - h.general) < 0.005;
  return [
    { id: "tienda", nombre: "Tienda", requerido: true, hecho: h.tiendaId !== null, pendiente: "Elige la tienda." },
    {
      id: "precio",
      nombre: "Precio en esta tienda",
      requerido: true,
      hecho: precio !== null && !igual,
      pendiente: igual ? "Ese ya es el precio de la prenda: escribe otro." : "Escribe el precio de esta tienda.",
    },
    { id: "motivo", nombre: "Por qué", requerido: true, hecho: h.motivo.trim().length >= 3, pendiente: "Escribe por qué esta tienda tiene otro precio." },
    { id: "responsable", nombre: "Quién lo cambia", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién lo cambia." },
  ];
}

/** La hoja «Quitar el precio de …»: solo quién (el motivo es opcional). */
export function camposQuitarPrecio(h: { responsableListo: boolean; responsableMotivo: string | null }): CampoDeGuia[] {
  return [{ id: "responsable", nombre: "Quién lo quita", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién lo quita." }];
}
