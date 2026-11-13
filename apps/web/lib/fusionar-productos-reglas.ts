// Fusionar productos duplicados (ADR-0650): lo que la hoja decide y dice, sin React. La regla de negocio vive en la base
// (`fn_fusion_productos_plan`, 20261112205000): aquí solo se lee lo que la base calculó y se arma lo que se le manda.

import { soles } from "./compras-reglas";
import type { CampoDeGuia } from "./guia-campos";

export type CampoFusion = "referencia" | "descripcion" | "categoria" | "marca_proveedor" | "tejido" | "patron" | "temporada";

type Nombrado = { id: string | null; nombre: string | null };

export type FotoPlan = { id: string; url: string; colorCodigo: string | null; esPrincipal: boolean };

export type ProductoPlan = {
  id: string;
  queda: boolean;
  referencia: string;
  codigo: string | null;
  version: number;
  estado: string;
  creadoEn: string;
  descripcion: string | null;
  temporada: string | null;
  categoria: Nombrado & { prefijo: string | null; familia: string | null };
  marca: Nombrado;
  proveedor: Nombrado;
  tejido: Nombrado;
  patron: Nombrado;
  unidadesVendidas: number;
  /** En cuántas ventas (tickets) aparece: la base lo llama `ventas`, pero es un conteo, no soles (Felipe 2026-11-13 lo vio como «S/ 1.00»). */
  tickets: number;
  ultimaVenta: string | null;
  stock: number;
  variantes: number;
  precio: number | null;
  precios: number[];
  /** Null si la cuenta no ve el dinero de compras (la base no lo manda). */
  costo: number | null;
  costoDeCompras: boolean;
  fotos: FotoPlan[];
};

export type VariantePlan = {
  varianteId: string;
  productoId: string;
  talla: string | null;
  colorCodigo: string | null;
  color: string;
  colorHex: string | null;
  /** Una talla retirada (`activo = false`) también se muda, pero no se dibuja en la matriz: no se vende. */
  activa: boolean;
  stock: number;
  trato: "muda" | "junta";
  conVarianteId: string | null;
};

export type AvisoPlan = { codigo: string; mensaje: string };

export type PlanFusion = {
  ok: boolean;
  productos: ProductoPlan[];
  variantes: VariantePlan[];
  resumen: { mudan: number; juntan: number; unidadesJuntadas: number; unidadesQueLlegan: number; fotosDuplicados: number };
  /** Los campos que difieren (y `precio`, `costo`): solo esos se eligen (decisión 8). */
  diferencias: string[];
  bloqueos: AvisoPlan[];
  avisos: AvisoPlan[];
};

type Json = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const nombrado = (v: unknown): Nombrado => {
  const o = (v ?? {}) as Json;
  return { id: texto(o.id), nombre: texto(o.nombre) };
};
const avisos = (v: unknown): AvisoPlan[] =>
  Array.isArray(v) ? v.map((a) => ({ codigo: String((a as Json).codigo ?? ""), mensaje: String((a as Json).mensaje ?? "") })) : [];

/** Lo que devuelve `previsualizar_fusion_productos`, con nombres de la web. Un plan con un bloqueo de entrada (sin
 *  duplicados, el mismo producto) trae solo `ok` y `bloqueos`: lo demás sale vacío. */
export function leerPlan(json: unknown): PlanFusion {
  const o = (json ?? {}) as Json;
  const r = (o.resumen ?? {}) as Json;
  return {
    ok: o.ok === true,
    productos: (Array.isArray(o.productos) ? o.productos : []).map((x) => {
      const p = x as Json;
      const c = (p.categoria ?? {}) as Json;
      return {
        id: String(p.id),
        queda: p.queda === true,
        referencia: String(p.referencia ?? ""),
        codigo: texto(p.codigo),
        version: Number(p.version ?? 0),
        estado: String(p.estado ?? ""),
        creadoEn: String(p.creado_en ?? ""),
        descripcion: texto(p.descripcion),
        temporada: texto(p.temporada),
        categoria: { ...nombrado(c), prefijo: texto(c.prefijo), familia: texto(c.familia) },
        marca: nombrado(p.marca),
        proveedor: nombrado(p.proveedor),
        tejido: nombrado(p.tejido),
        patron: nombrado(p.patron),
        unidadesVendidas: Number(p.unidades_vendidas ?? 0),
        tickets: Number(p.ventas ?? 0),
        ultimaVenta: texto(p.ultima_venta),
        stock: Number(p.stock ?? 0),
        variantes: Number(p.variantes ?? 0),
        precio: numero(p.precio),
        precios: Array.isArray(p.precios) ? p.precios.map(Number) : [],
        costo: numero(p.costo),
        costoDeCompras: p.costo_de_compras === true,
        fotos: (Array.isArray(p.fotos) ? p.fotos : []).map((f) => {
          const g = f as Json;
          return { id: String(g.id), url: String(g.url ?? ""), colorCodigo: texto(g.color_codigo), esPrincipal: g.es_principal === true };
        }),
      };
    }),
    variantes: (Array.isArray(o.variantes) ? o.variantes : []).map((x) => {
      const v = x as Json;
      return {
        varianteId: String(v.variante_id),
        productoId: String(v.producto_id),
        talla: texto(v.talla),
        colorCodigo: texto(v.color_codigo),
        color: String(v.color ?? "Sin color"),
        colorHex: texto(v.color_hex),
        activa: v.activo !== false,
        stock: Number(v.stock ?? 0),
        trato: v.trato === "junta" ? "junta" : "muda",
        conVarianteId: texto(v.con_variante_id),
      };
    }),
    resumen: {
      mudan: Number(r.mudan ?? 0),
      juntan: Number(r.juntan ?? 0),
      unidadesJuntadas: Number(r.unidades_juntadas ?? 0),
      unidadesQueLlegan: Number(r.unidades_que_llegan ?? 0),
      fotosDuplicados: Number(r.fotos_duplicados ?? 0),
    },
    diferencias: Array.isArray(o.diferencias) ? o.diferencias.map(String) : [],
    bloqueos: avisos(o.bloqueos),
    avisos: avisos(o.avisos),
  };
}

/** El que se propone que quede (decisión 1): el que más vendió; con las mismas ventas, el más antiguo. La persona lo cambia. */
export function quedaSugerido(productos: Pick<ProductoPlan, "id" | "unidadesVendidas" | "creadoEn">[]): string | null {
  if (productos.length === 0) return null;
  return [...productos].sort((a, b) => b.unidadesVendidas - a.unidadesVendidas || a.creadoEn.localeCompare(b.creadoEn))[0].id;
}

/** Por qué se propone ese: lo que la persona lee bajo la tarjeta. Null si no hay nada que destacar (ninguno vendió). */
export function motivoSugerido(productos: Pick<ProductoPlan, "id" | "unidadesVendidas" | "creadoEn">[], id: string): string | null {
  const otros = productos.filter((p) => p.id !== id);
  const este = productos.find((p) => p.id === id);
  if (!este || otros.length === 0) return null;
  if (otros.every((o) => este.unidadesVendidas > o.unidadesVendidas)) return "El que más vendió";
  if (otros.every((o) => este.creadoEn < o.creadoEn)) return "El más antiguo";
  return null;
}

const NOMBRE_CAMPO: Record<CampoFusion | "precio" | "costo", string> = {
  referencia: "Nombre",
  descripcion: "Descripción",
  categoria: "Categoría",
  marca_proveedor: "Marca y proveedor",
  tejido: "Tejido",
  patron: "Patrón",
  temporada: "Temporada",
  precio: "Precio",
  costo: "Costo",
};

/** Los campos que la hoja deja elegir, en el orden en que se leen. Solo los que difieren (decisión 8); el costo, solo si la
 *  cuenta lo ve (la base no manda la diferencia a quien no ve el dinero de compras). */
export function camposAElegir(diferencias: string[]): (CampoFusion | "precio" | "costo")[] {
  const orden: (CampoFusion | "precio" | "costo")[] = [
    "referencia", "categoria", "marca_proveedor", "precio", "costo", "descripcion", "tejido", "patron", "temporada",
  ];
  return orden.filter((c) => diferencias.includes(c));
}

export function nombreDeCampo(campo: CampoFusion | "precio" | "costo"): string {
  return NOMBRE_CAMPO[campo];
}


/** Lo que muestra cada opción de un campo: el valor de ese producto, legible. «—» si no tiene. */
export function valorDeCampo(p: ProductoPlan, campo: CampoFusion | "precio" | "costo"): string {
  switch (campo) {
    case "referencia":
      return p.referencia;
    case "descripcion":
      return p.descripcion ?? "Sin descripción";
    case "categoria":
      return p.categoria.nombre ?? "Sin categoría";
    case "marca_proveedor":
      return [p.marca.nombre ?? "Sin marca", p.proveedor.nombre ?? "sin proveedor"].join(" · ");
    case "tejido":
      return p.tejido.nombre ?? "Sin tejido";
    case "patron":
      return p.patron.nombre ?? "Sin patrón";
    case "temporada":
      return p.temporada ?? "Sin temporada";
    case "precio":
      return p.precio === null ? "Sin precio" : p.precios.length > 1 ? `${soles(p.precio)} (varía por talla)` : soles(p.precio);
    case "costo":
      return p.costo === null ? "Sin costo" : soles(p.costo);
  }
}

/** Dos productos con el mismo valor muestran una sola opción (la del primero en la lista: el que queda va primero). */
export function opcionesDeCampo(productos: ProductoPlan[], campo: CampoFusion | "precio" | "costo"): { productoId: string; valor: string }[] {
  const vistas = new Set<string>();
  const salida: { productoId: string; valor: string }[] = [];
  for (const p of [...productos].sort((a, b) => Number(b.queda) - Number(a.queda))) {
    const valor = valorDeCampo(p, campo);
    if (vistas.has(valor)) continue;
    vistas.add(valor);
    salida.push({ productoId: p.id, valor });
  }
  return salida;
}

export type Elecciones = {
  /** De qué producto sale cada campo; sin entrada, del que queda. */
  campos: Partial<Record<CampoFusion, string>>;
  /** De qué producto sale el precio; sin entrada, cada talla conserva el suyo. */
  precioDe: string | null;
  /** De qué producto sale el costo (solo prendas sin costo de compras). */
  costoDe: string | null;
  /** Las fotos que quedan, en orden. Null: todavía no se tocó y se mandan todas. */
  fotos: string[] | null;
};

export const ELECCIONES_VACIAS: Elecciones = { campos: {}, precioDe: null, costoDe: null, fotos: null };

/** De qué producto sale el precio o el costo: lo elegido, o —si difieren y nadie tocó— el del que queda (decisiones 6 y 7:
 *  por defecto, el del que queda). Si no difieren, nada: cada talla conserva el suyo. */
export function fuenteDe(eleccion: string | null, campo: "precio" | "costo", diferencias: string[], queda: string | null): string | null {
  if (!diferencias.includes(campo)) return null;
  return eleccion ?? queda;
}

/** Lo que se le manda a la base (`p_elecciones`). El precio viaja como número: el de ese producto. Un campo que apunta a un
 *  producto que ya no está en la fusión se suelta (vuelve a ser el del que queda). */
export function eleccionesParaLaBase(
  e: Elecciones,
  productos: ProductoPlan[],
  diferencias: string[] = [],
  queda: string | null = null,
): Record<string, unknown> {
  const ids = new Set(productos.map((p) => p.id));
  const campos = Object.fromEntries(Object.entries(e.campos).filter(([, id]) => id && ids.has(id)));
  const salida: Record<string, unknown> = { campos };
  const precioDe = fuenteDe(e.precioDe, "precio", diferencias, queda);
  const dePrecio = precioDe ? productos.find((p) => p.id === precioDe) : null;
  if (dePrecio?.precio != null) salida.precio = dePrecio.precio;
  const costoDe = fuenteDe(e.costoDe, "costo", diferencias, queda);
  if (costoDe && ids.has(costoDe)) salida.costo_de = costoDe;
  if (e.fotos) salida.fotos = e.fotos.filter((id) => productos.some((p) => p.fotos.some((f) => f.id === id)));
  return salida;
}

/** Todas las fotos de la fusión, en el orden de la hoja: primero las del que queda (su principal adelante), después las de
 *  cada duplicado. Es también lo que queda si la persona no toca nada. */
export function fotosEnOrden(productos: ProductoPlan[]): FotoPlan[] {
  return [...productos]
    .sort((a, b) => Number(b.queda) - Number(a.queda))
    .flatMap((p) => [...p.fotos].sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal)));
}

const plural = (n: number, una: string, varias: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? una : varias}`;

/** Las líneas de «Qué va a pasar», en palabras de tienda (ley 4 de Formidable): nada de «variante» ni «mudar». */
export function frasesDelResumen(plan: Pick<PlanFusion, "resumen" | "productos">, fotosQueQuedan: number): string[] {
  const { mudan, juntan, unidadesJuntadas, unidadesQueLlegan } = plan.resumen;
  const duplicados = plan.productos.filter((p) => !p.queda);
  const vendidas = duplicados.reduce((s, p) => s + p.unidadesVendidas, 0);
  const frases: string[] = [];
  if (mudan > 0) frases.push(`${plural(mudan, "talla y color pasa", "tallas y colores pasan")} tal cual, con su stock y sus ventas.`);
  if (juntan > 0)
    frases.push(
      `${plural(juntan, "talla y color ya existe", "tallas y colores ya existen")} en el que queda: se juntan${
        unidadesJuntadas > 0 ? ` y ${plural(unidadesJuntadas, "prenda se suma", "prendas se suman")} a su stock` : ""
      }.`,
    );
  if (unidadesQueLlegan > 0) frases.push(`En total llegan ${plural(unidadesQueLlegan, "prenda", "prendas")} en stock; no se pierde ninguna.`);
  const deLaRepetida = duplicados.length === 1 ? "la ficha repetida" : "las fichas repetidas";
  if (vendidas === 1) frases.push(`La prenda vendida de ${deLaRepetida} cuenta en el que queda.`);
  if (vendidas > 1) frases.push(`Las ${plural(vendidas, "prenda vendida", "prendas vendidas")} de ${deLaRepetida} cuentan en el que queda.`);
  const fotosTotal = plan.productos.reduce((s, p) => s + p.fotos.length, 0);
  if (fotosTotal > 0)
    frases.push(
      fotosQueQuedan === fotosTotal
        ? `Quedan las ${plural(fotosTotal, "foto", "fotos")} en el producto.`.replace("las 1 foto", "la foto")
        : `Quedan ${plural(fotosQueQuedan, "foto", "fotos")} en el producto; las demás se guardan en la ficha repetida.`,
    );
  frases.push(`Las etiquetas ya impresas siguen sirviendo al escanearlas.`);
  return frases;
}

/** «Creado el 3 oct. 2026»: lo que la persona lee para saber cuál nació primero (decisión 1). */
export function fechaDeAlta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Creado el ${d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" })}`;
}

export function textoVentas(p: Pick<ProductoPlan, "unidadesVendidas">): string {
  return p.unidadesVendidas === 0 ? "Sin ventas" : `Vendió ${plural(p.unidadesVendidas, "prenda", "prendas")}`;
}

/** La guía de foco de la hoja (ADR-0284): lo que la base exige para fusionar, sin reglas nuevas. Elegir los campos que
 *  difieren y las fotos ya viene armado (el del que queda), así que son «sugerido», nunca un candado. La hoja tiene dos pasos
 *  (rediseño 2026-11-13): en `armar` se eligen las fichas y lo que queda; en `revisar`, quien firma («Sí, fusionar»). Sin vista,
 *  todo junto. */
export function camposDeLaGuia(estado: {
  duplicados: number;
  queda: string | null;
  hayDiferencias: boolean;
  responsableListo: boolean;
  vista?: "armar" | "revisar";
}): CampoDeGuia[] {
  const armar: CampoDeGuia[] = [
    { id: "duplicados", nombre: "Ficha repetida", requerido: true, hecho: estado.duplicados > 0, pendiente: "Busca la otra ficha de esta misma prenda." },
    // Con una sola ficha no hay con qué compararla: «Cuál queda» espera a la repetida (/chaos 2026-11-13, ENT-01).
    { id: "queda", nombre: "Cuál queda", requerido: true, hecho: estado.queda !== null && estado.duplicados > 0, pendiente: "Elige la ficha que se queda." },
    ...(estado.hayDiferencias
      ? [{ id: "diferencias", nombre: "Lo que es distinto", requerido: false, sugerido: true, hecho: true, pendiente: "Revisa con qué dato se queda." }]
      : []),
  ];
  const revisar: CampoDeGuia[] = [
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: estado.responsableListo, pendiente: "Elige quién hace la fusión." },
  ];
  if (estado.vista === "armar") return armar;
  if (estado.vista === "revisar") return revisar;
  return [...armar, ...revisar];
}

/** ¿Las repetidas ya quedaron fusionadas en la que queda? Se pregunta después de una respuesta que no llegó o de una versión que cambió
 *  (/chaos 2026-11-13, RS-03 y NAV-05): la base pudo fusionar (o alguien más lo hizo) y la hoja no debe decir que nada cambió. */
export function yaFusionadas(filas: { id: string; fusionadoEnId: string | null }[], queda: string, duplicados: string[]): boolean {
  return duplicados.length > 0 && duplicados.every((d) => filas.find((f) => f.id === d)?.fusionadoEnId === queda);
}

/** El aviso cuando no se pudo fusionar: «Las fichas siguen como estaban» solo si la base respondió que no (su transacción se deshizo).
 *  Con la respuesta perdida no se sabe, y la frase de `traducirError` ya pide revisar antes de repetir. */
export function mensajeAlNoFusionar(frase: string, incierta: boolean): string {
  return incierta ? frase : `${frase} Las fichas siguen como estaban.`;
}
