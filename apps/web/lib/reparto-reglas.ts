// Reparto de un comprobante entre tiendas (ADR-0139) — lo que NO toca la base: mirar, validar y explicar un
// reparto. La base es la que lo hace cumplir (candado diferido en `compra_item_destinos`, tope por tienda en
// `recibir_compras`); acá solo se evita mandarle algo que ya se sabe que va a rechazar y se le pone palabras a
// cada cifra para quien opera. Vive aparte de `compras.ts` por la misma razón que `compras-reglas.ts`: los
// componentes cliente lo importan y no pueden arrastrar `next/headers`.
//
// Principio de UX que manda en todas las frases de este archivo: el sistema dice LO QUE FALTA, no solo que hay un
// error («La cantidad tiene que ser un entero entre 1 y 4», no «cantidad inválida»), y cada número se explica solo
// («Te toca 12 · Recibidas aquí 4 · Faltan 8»).

import type { LineaCompra, TiendaEnLinea } from "@/lib/compras-reglas";

/** Lo que una tienda tiene en una línea: cuánto le tocó, cuánto recibió y cuánto cerró como faltante. */
export type CifrasDeTienda = { asignado: number; recibido: number; cerrado: number };

/** Un entero >= 0: lo que se teclea en pantalla puede venir vacío, con decimales o negativo. */
const entero = (n: unknown): number => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
};

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

/**
 * Cómo se nombra una línea que todavía NO tiene prenda —la de un comprobante que sale de una orden de compra (ADR-0362): se pidió por
 * «categoría + marca» y la prenda se crea cuando llega la mercadería—: «Blusas · Cayla · lino crudo». Lo que falte no se inventa.
 */
export function nombreDeLineaSinPrenda(l: { categoria?: string | null; marca?: string | null; descripcion?: string | null }): string {
  return [l.categoria, l.marca, l.descripcion].map((x) => x?.trim()).filter(Boolean).join(" · ") || "Prenda por definir";
}

/**
 * «Blusa Emma · Arena / M» (o solo «Blusa Emma» si la línea no detalla talla y color): cómo se nombra una línea en el reparto. Una línea
 * sin prenda (sin referencia, con categoría y marca) se nombra «Blusas · Cayla · lino crudo».
 */
export function etiquetaDeLinea(
  l: Pick<LineaCompra, "referencia" | "varianteId" | "talla" | "color"> & Partial<Pick<LineaCompra, "categoria" | "marca" | "descripcion">>,
): string {
  if (!l.referencia && (l.categoria || l.marca)) return nombreDeLineaSinPrenda(l);
  const variante = l.varianteId ? [l.talla, l.color].filter(Boolean).join(" / ") : "";
  return variante ? `${l.referencia} · ${variante}` : l.referencia;
}
