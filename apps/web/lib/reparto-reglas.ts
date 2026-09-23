// Reparto de un comprobante entre tiendas (ADR-0139) — lo que NO toca la base: armar, validar y explicar un
// reparto. La base es la que lo hace cumplir (candado diferido en `compra_item_destinos`, tope por tienda en
// `recibir_compras`); acá solo se evita mandarle algo que ya se sabe que va a rechazar y se le pone palabras a
// cada cifra para quien opera. Vive aparte de `compras.ts` por la misma razón que `compras-reglas.ts`: los
// componentes cliente lo importan y no pueden arrastrar `next/headers`.
//
// Principio de UX que manda en todas las frases de este archivo: el sistema dice LO QUE FALTA, no solo que hay un
// error («Faltan 4 por repartir», no «suma inválida»), y cada número se explica solo («Te toca 12 · Recibidas aquí 4
// · Faltan 8»).

import type { LineaCompra, TiendaEnLinea } from "@/lib/compras-reglas";

/** Lo que una tienda tiene en una línea: cuánto le tocó, cuánto recibió y cuánto cerró como faltante. */
export type CifrasDeTienda = { asignado: number; recibido: number; cerrado: number };

/** El reparto de UNA línea, tal como se arma en pantalla: tienda → unidades. Una tienda en 0 no cuenta. */
export type RepartoLinea = Record<string, number>;

/** Un entero >= 0: lo que se teclea en pantalla puede venir vacío, con decimales o negativo. */
const entero = (n: unknown): number => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
};

/** Cuánto va repartido, cuánto falta y cuánto sobra para que el reparto de una línea sume lo facturado. */
export function estadoDelReparto(cantidad: number, reparto: RepartoLinea) {
  const total = entero(cantidad);
  const asignado = Object.values(reparto).reduce((suma, n) => suma + entero(n), 0);
  return {
    asignado,
    faltan: Math.max(0, total - asignado),
    sobran: Math.max(0, asignado - total),
    cuadra: total > 0 && asignado === total,
  };
}

/** La frase que ve quien reparte, con su tono (verde ✓ cuando cuadra, ámbar si falta, rojo si se pasó). */
export function textoDelReparto(cantidad: number, reparto: RepartoLinea): { tono: "ok" | "falta" | "sobra"; texto: string } {
  const e = estadoDelReparto(cantidad, reparto);
  if (e.cuadra) return { tono: "ok", texto: `Repartidas ${e.asignado} de ${entero(cantidad)}` };
  if (e.sobran > 0) return { tono: "sobra", texto: `Sobran ${e.sobran}` };
  return { tono: "falta", texto: `Faltan ${e.faltan} por repartir` };
}

/**
 * Reparto en partes iguales entre las tiendas dadas. Si no divide exacto, el resto va de a una unidad a las
 * primeras (25 entre 3 → 9 · 8 · 8): así la suma siempre cuadra y el atajo nunca deja algo por repartir.
 */
export function repartirEnPartesIguales(cantidad: number, ubicacionIds: string[]): RepartoLinea {
  const ids = [...new Set(ubicacionIds)];
  const total = entero(cantidad);
  if (ids.length === 0 || total === 0) return {};
  const base = Math.floor(total / ids.length);
  const resto = total % ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < resto ? 1 : 0)]));
}

/** Lo que se manda a `registrar_compra` en `destinos` de cada línea: solo tiendas con unidades, sin decimales. */
export function destinosParaRpc(reparto: RepartoLinea): { ubicacion_id: string; cantidad: number }[] {
  return Object.entries(reparto)
    .map(([ubicacion_id, cantidad]) => ({ ubicacion_id, cantidad: entero(cantidad) }))
    .filter((d) => d.cantidad > 0);
}

// ---------- Lo que ve una tienda ----------

/** Lo que aún le falta a una tienda en una línea: lo que le tocó menos lo que recibió y lo que cerró. */
export function pendienteDeMiTienda(c: CifrasDeTienda): number {
  return Math.max(0, entero(c.asignado) - entero(c.recibido) - entero(c.cerrado));
}

/** El estado de recepción visto desde una tienda (el del comprobante entero mezcla a todas las tiendas). */
export function estadoDeMiTienda(c: CifrasDeTienda): "sin_recibir" | "parcial" | "recibida" {
  if (pendienteDeMiTienda(c) === 0) return "recibida";
  return entero(c.recibido) + entero(c.cerrado) === 0 ? "sin_recibir" : "parcial";
}

/** «Te toca 12 · Recibidas aquí 4 · Faltan 8» (y «· Cerradas 2» si hubo faltante cerrado). */
export function textoTeToca(c: CifrasDeTienda): string {
  const partes = [`Te toca ${entero(c.asignado)}`, `Recibidas aquí ${entero(c.recibido)}`, `Faltan ${pendienteDeMiTienda(c)}`];
  if (entero(c.cerrado) > 0) partes.push(`Cerradas ${entero(c.cerrado)}`);
  return partes.join(" · ");
}

/**
 * Para un líder: cómo va el resto de las tiendas en una línea. Solo cuentan las que aún tienen algo pendiente;
 * si ninguna, se dice que las demás ya recibieron lo suyo.
 */
export function textoOtrasTiendas(otras: TiendaEnLinea[] | undefined): string | null {
  if (!otras || otras.length === 0) return null;
  const faltan = otras.filter((t) => t.pendiente > 0);
  if (faltan.length === 0) return "Las demás tiendas ya recibieron lo suyo";
  return `También falta en ${faltan.map((t) => `${t.nombre}: ${t.pendiente}`).join(" · ")}`;
}

/** «Tienda Trujillo · Taller» — los destinos de un comprobante, con nombre (los ids sin nombre se descartan). */
export function nombresDeDestinos(ubicacionesDestino: string[], nombrePorId: Record<string, string>): string {
  return ubicacionesDestino
    .map((id) => nombrePorId[id])
    .filter(Boolean)
    .join(" · ");
}

/**
 * Lleva a una línea (con los números de TODO el comprobante) los de la tienda desde la que se mira: `cantidad` pasa a
 * ser lo que le toca a ella y `recibido`/`cerrado`/`pendiente` los suyos, así los topes, «Todo llegó» y los totales
 * de la pantalla de recibir funcionan por tienda sin cambiar una línea. Lo facturado en total queda en
 * `cantidadFacturada`. Sin números de tienda (base sin reparto), la línea queda como está.
 */
export function lineaEnMiTienda(linea: LineaCompra, aqui: (CifrasDeTienda & { otrasTiendas?: TiendaEnLinea[] }) | null): LineaCompra {
  if (!aqui) return linea;
  const asignado = entero(aqui.asignado);
  const pendiente = pendienteDeMiTienda(aqui);
  return {
    ...linea,
    cantidadFacturada: linea.cantidad,
    cantidad: asignado,
    recibido: entero(aqui.recibido),
    cerrado: entero(aqui.cerrado),
    pendiente,
    // El subtotal de la línea entera no es el de esta tienda: se recalcula con lo que le toca (0 si no hay costo).
    subtotal: linea.costoUnitario > 0 ? Math.round(linea.costoUnitario * asignado * 100) / 100 : 0,
    asignadoAqui: asignado,
    recibidoAqui: entero(aqui.recibido),
    cerradoAqui: entero(aqui.cerrado),
    pendienteAqui: pendiente,
    otrasTiendas: aqui.otrasTiendas,
  };
}

/** `otras_tiendas` llega como json desde la RPC (solo para un líder): [{ubicacion_id, nombre, asignado, …}]. */
export function otrasTiendasDeJson(json: unknown): TiendaEnLinea[] | undefined {
  if (!Array.isArray(json)) return undefined;
  return json.flatMap((x): TiendaEnLinea[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.ubicacion_id !== "string") return [];
    return [
      {
        ubicacionId: o.ubicacion_id,
        nombre: String(o.nombre ?? ""),
        asignado: entero(o.asignado),
        recibido: entero(o.recibido),
        cerrado: entero(o.cerrado),
        pendiente: entero(o.pendiente),
      },
    ];
  });
}

/**
 * «S/ por llegar» de UNA tienda, para un líder: lo que le falta a ELLA, a su costo y con el IGV del comprobante
 * (mismo criterio que `resumen_compras_extra`: pendiente × costo × total / subtotal). Los indicadores de Recibir son
 * de la tienda desde la que se mira; los de toda la empresa siguen en Compras.
 */
export function valorPorRecibirDeMiTienda(
  compras: { id: string; subtotal: number; total: number }[],
  lineas: { compraId: string; pendiente: number; costoUnitario: number }[]
): number {
  const factor = new Map(compras.map((c) => [c.id, c.subtotal > 0 ? c.total / c.subtotal : 1]));
  const suma = lineas.reduce((s, l) => s + Math.max(0, l.pendiente) * l.costoUnitario * (factor.get(l.compraId) ?? 1), 0);
  return Math.round(suma * 100) / 100;
}

/**
 * Para una línea REPARTIDA entre tiendas: «Te toca 12 de 24 del comprobante» y, para un líder, dónde más falta. `null`
 * si la línea no está repartida (toda es de esta tienda): ahí la pantalla no muestra nada extra y todo se ve como siempre.
 */
export function textoDeLaParte(l: Pick<LineaCompra, "asignadoAqui" | "cantidadFacturada" | "otrasTiendas">): string | null {
  if (l.asignadoAqui == null || l.cantidadFacturada == null || l.cantidadFacturada === l.asignadoAqui) return null;
  const otras = textoOtrasTiendas(l.otrasTiendas);
  return `Te toca ${l.asignadoAqui} de ${l.cantidadFacturada} del comprobante${otras ? ` · ${otras}` : ""}`;
}

// ---------- Registrar: en qué tiendas se reparte y cuántas unidades le tocan a cada una ----------

/** Cuántas unidades del comprobante le tocan a cada tienda (suma de sus líneas). Para el resumen de «Dónde cae». */
export function unidadesPorTienda(lineas: readonly { cantidad: number; reparto: RepartoLinea }[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const l of lineas) {
    for (const [id, n] of Object.entries(l.reparto)) {
      const u = entero(n);
      if (u > 0) total[id] = (total[id] ?? 0) + u;
    }
  }
  return total;
}

/** El reparto de una línea sin las tiendas que ya no participan (se desmarcó su casilla): sus unidades vuelven a «faltan». */
export function repartoSoloDe(reparto: RepartoLinea, ubicacionIds: readonly string[]): RepartoLinea {
  const permitidas = new Set(ubicacionIds);
  return Object.fromEntries(Object.entries(reparto).filter(([id]) => permitidas.has(id)));
}

// ---------- El detalle del comprobante (líder): cómo va cada tienda y reasignar ----------

/** Una casilla del reparto: UNA línea × UNA tienda, con lo que le tocó, lo que ya recibió y lo que cerró como faltante. */
export type FilaReparto = {
  compraItemId: string;
  ubicacionId: string;
  asignado: number;
  recibido: number;
  cerrado: number;
  pendiente: number;
};

/** Por qué un líder mueve mercadería de una tienda a otra (queda en `compra_reasignaciones`). */
export type MotivoReasignacion = "llego_de_mas" | "error_de_tienda" | "otro";

export const ETIQUETA_MOTIVO_REASIGNACION: Record<MotivoReasignacion, string> = {
  llego_de_mas: "Llegó de más a la otra tienda",
  error_de_tienda: "Se repartió a la tienda equivocada",
  otro: "Otro motivo",
};

export const MOTIVOS_REASIGNACION = Object.keys(ETIQUETA_MOTIVO_REASIGNACION) as MotivoReasignacion[];

/** Una vez que ocurrió: quién movió cuánto de dónde a dónde y por qué. */
export type ReasignacionCompra = {
  id: string;
  compraItemId: string;
  desdeId: string;
  haciaId: string;
  cantidad: number;
  motivo: MotivoReasignacion;
  nota: string | null;
  personaNombre: string | null;
  creadoEn: string;
};

/** Las casillas de UNA línea. Con `ordenarPor` de `ubicaciones` se respeta el orden canónico de tiendas de la app. */
export function filasDeLinea(filas: readonly FilaReparto[], compraItemId: string, ordenUbicaciones: readonly string[] = []): FilaReparto[] {
  const pos = (id: string) => {
    const i = ordenUbicaciones.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return filas.filter((f) => f.compraItemId === compraItemId).sort((a, b) => pos(a.ubicacionId) - pos(b.ubicacionId) || a.ubicacionId.localeCompare(b.ubicacionId));
}

/** Las tiendas a las que aún les falta algo de una línea: de ahí puede salir una reasignación o cerrarse un faltante. */
export function tiendasConPendiente(filasDeLaLinea: readonly FilaReparto[]): FilaReparto[] {
  return filasDeLaLinea.filter((f) => f.pendiente > 0);
}

/** Las tiendas distintas del reparto de un comprobante, en el orden dado (las que no están en el orden, al final). */
export function tiendasDelReparto(filas: readonly FilaReparto[], ordenUbicaciones: readonly string[] = []): string[] {
  const vistas = new Set(filas.map((f) => f.ubicacionId));
  const conocidas = ordenUbicaciones.filter((id) => vistas.has(id));
  const resto = [...vistas].filter((id) => !ordenUbicaciones.includes(id)).sort();
  return [...conocidas, ...resto];
}

/** ¿El comprobante trae mercadería para más de una tienda? Si no, la sección de reparto no tiene nada que comparar. */
export function estaRepartido(filas: readonly FilaReparto[]): boolean {
  return new Set(filas.map((f) => f.ubicacionId)).size > 1;
}

/** Cifras de UNA tienda en todo el comprobante (suma de sus líneas). Es lo que responde «¿cómo va Trujillo?». */
export type ResumenDeTienda = { ubicacionId: string; asignado: number; recibido: number; cerrado: number; pendiente: number };

export function resumenPorTienda(filas: readonly FilaReparto[], ordenUbicaciones: readonly string[] = []): ResumenDeTienda[] {
  const por = new Map<string, ResumenDeTienda>();
  for (const f of filas) {
    const r = por.get(f.ubicacionId) ?? { ubicacionId: f.ubicacionId, asignado: 0, recibido: 0, cerrado: 0, pendiente: 0 };
    r.asignado += f.asignado;
    r.recibido += f.recibido;
    r.cerrado += f.cerrado;
    r.pendiente += Math.max(0, f.pendiente);
    por.set(f.ubicacionId, r);
  }
  return tiendasDelReparto(filas, ordenUbicaciones).map((id) => por.get(id)!);
}

/**
 * Lo que valida el formulario de «Reasignar» antes de llamar a `reasignar_reparto_compra`: el primer motivo por el que la
 * RPC lo rechazaría, dicho en llano y con la cifra que sirve (`null` si se puede enviar). La base vuelve a exigir todo.
 */
export function errorDeReasignacion(o: {
  desdeId: string;
  haciaId: string;
  cantidad: number;
  pendienteDesde: number;
  nombreDesde: string;
  motivo: MotivoReasignacion | "";
  nota: string;
}): string | null {
  if (!o.desdeId || !o.haciaId) return "Elige de qué tienda sale la mercadería y a cuál va.";
  if (o.desdeId === o.haciaId) return "Tienen que ser dos tiendas distintas.";
  if (!Number.isInteger(o.cantidad) || o.cantidad < 1 || o.cantidad > o.pendienteDesde) {
    return `La cantidad tiene que ser un entero entre 1 y ${o.pendienteDesde}: es lo que aún le falta recibir a ${o.nombreDesde}.`;
  }
  if (!o.motivo) return "Elige por qué se mueve.";
  if (o.motivo === "otro" && o.nota.trim() === "") return "Cuenta el motivo en la nota: así queda claro para quien lo revise después.";
  return null;
}

/** «Felipe movió 2 unidades de Taller a Tienda Trujillo» (el motivo va aparte, con su etiqueta). */
export function textoDeReasignacion(r: Pick<ReasignacionCompra, "cantidad" | "desdeId" | "haciaId" | "personaNombre">, nombreDe: (ubicacionId: string) => string): string {
  return `${r.personaNombre ?? "Alguien"} movió ${r.cantidad} ${r.cantidad === 1 ? "unidad" : "unidades"} de ${nombreDe(r.desdeId)} a ${nombreDe(r.haciaId)}`;
}

/** `compra_reasignaciones.motivo` llega como texto: solo se aceptan los tres que la base permite. */
export function motivoDeReasignacion(x: unknown): MotivoReasignacion {
  return x === "llego_de_mas" || x === "error_de_tienda" ? x : "otro";
}

/** «Blusa Emma · Arena / M» (o solo «Blusa Emma» si la línea no detalla talla y color): cómo se nombra una línea en el reparto. */
export function etiquetaDeLinea(l: Pick<LineaCompra, "referencia" | "varianteId" | "talla" | "color">): string {
  const variante = l.varianteId ? [l.talla, l.color].filter(Boolean).join(" / ") : "";
  return variante ? `${l.referencia} · ${variante}` : l.referencia;
}

/**
 * Al registrar (ADR-0179, F3): ¿se puede quitar `id` del reparto de tiendas que participan? Sin restricción (líder,
 * `misTiendasIds` ausente): tiene que quedar al menos una, sin más — cualquiera puede ser gestora. Con restricción
 * (comprador): además tiene que quedar al menos UNA de sus propias tiendas — la base exige que la gestora tenga
 * parte en el reparto, y la gestora de un comprador solo puede ser una tienda suya.
 */
export function puedeQuitarseDelReparto(id: string, tiendas: readonly string[], misTiendasIds?: readonly string[]): boolean {
  const quedarian = tiendas.filter((t) => t !== id);
  if (!misTiendasIds) return quedarian.length > 0;
  return quedarian.some((t) => misTiendasIds.includes(t));
}

/**
 * La tienda GESTORA que se manda a `registrar_compra` como `p_ubicacion_destino_id` (ADR-0179, F3: ese parámetro
 * dejó de ser solo un valor por defecto). Sin reparto: la única tienda elegida. Repartiendo sin restricción (líder):
 * la primera del reparto — el orden sigue el de todas las ubicaciones, y da igual cuál sea porque el líder puede
 * gestionar cualquiera. Repartiendo CON restricción (comprador, `misTiendasIds`): NUNCA una posición a ciegas —
 * `tiendasReparto[0]` puede no ser suya (el orden sigue TODAS las ubicaciones, no el orden en que las marcó); se
 * busca la primera tienda del reparto que sí sea suya (`puedeQuitarseDelReparto` ya garantiza que existe una).
 */
export function tiendaGestora(repartir: boolean, tiendasReparto: readonly string[], ubicacionId: string, misTiendasIds?: readonly string[]): string {
  if (!repartir) return ubicacionId;
  if (!misTiendasIds) return tiendasReparto[0] ?? ubicacionId;
  return tiendasReparto.find((t) => misTiendasIds.includes(t)) ?? ubicacionId;
}
