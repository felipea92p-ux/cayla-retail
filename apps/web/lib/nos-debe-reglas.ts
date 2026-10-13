// «Nos debe»: lo que el proveedor le debe a CAYLA (ADR-0362, fase 5a, decisiones 14 y 24). La lógica pura de la pantalla: sin React ni red,
// se importa desde el servidor y desde el cliente, y se prueba sola (`nos-debe-reglas.test.ts`).
//
//   PROMETE: leer lo que contestan `fn_proveedor_nos_debe`, `fn_nos_debe_resumen`, `resolver_deuda_proveedor` y las `deudas_del_proveedor` de
//   `fn_envio_detalle` sin confiar en su forma (la web puede publicarse antes que la migración: una fila rara se descarta, un campo que falta
//   toma un valor neutro); decir cada deuda en palabras de tienda («2 chompas · S/ 84.00 · ENV-000061 · Tienda Trujillo · hace 3 días»); decir
//   qué le falta a la hoja «Llegó la reposición» con las MISMAS reglas que `resolver_deuda_proveedor` (de aquí sale la guía de foco) y armar
//   sus argumentos; y, para la recepción, cuándo se ofrece «Es la reposición de lo que faltó» y cuántas puede cubrir.
//   NO HACE: no habla con la base ni decide permisos (Proveedores, Recibir u Órdenes de compra los decide cada función).
//
// El contrato con la base: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md. La deuda ES la fila de `despacho_diferencias` con
// `tipo = 'faltante'` y `causa = 'no_vino'`; lo resuelto vive en `proveedor_deuda_resoluciones` (solo se agregan filas). La fase 5a solo
// cierra una deuda con la prenda («repuesta»); pasarla a saldo a favor o cobrar un depósito espera a Felipe y al contador (fase 5b).

import { soles } from "./compras-reglas";
import { hoyLima, diasEntreFechas } from "./fechas-lima";
import type { CampoDeGuia } from "./guia-campos";
import { textoParaBase } from "./orden-compra-alta";
import { numeroEnvio } from "./ordenes-compra-reglas";

// ---------------------------------------------------------------------------------------------------------------------------------
// Nombres de la base y topes
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lecturas: empiezan con `fn_`, así el loader no bloquea la pantalla (`espera-reglas.ts`). */
export const RPC_NOS_DEBE = "fn_proveedor_nos_debe";
export const RPC_NOS_DEBE_RESUMEN = "fn_nos_debe_resumen";
/** Escritura: abre el loader («guardado»). */
export const RPC_RESOLVER_DEUDA = "resolver_deuda_proveedor";

/** Lo que acepta `resolver_deuda_proveedor`: la nota, como la de una diferencia de la recepción (hasta 300 letras). */
export const TOPES_REPOSICION = { nota: 300 } as const;

/** Las formas de cerrar una deuda. En la fase 5a solo se usa «repuesta»: las otras dos responden «todavía no» hasta la 5b. */
export type FormaResolucion = "repuesta" | "saldo_a_favor" | "deposito";

// ---------------------------------------------------------------------------------------------------------------------------------
// Lectores tolerantes
// ---------------------------------------------------------------------------------------------------------------------------------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const booleano = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);
/** Céntimos exactos: 2 × 42.00 no debe dar 83.99999. */
const redondear = (n: number): number => Math.round(n * 100) / 100;

/** El nombre de algo que la base manda como texto o como `{ id, nombre }`. */
const nombreDe = (v: unknown): string | null => texto(v) ?? texto(objeto(v)?.nombre);
/** El id de algo que la base manda como `{ id, … }`, o el `<campo>_id` de al lado. */
const idDe = (r: Record<string, unknown>, campo: string): string | null => texto(objeto(r[campo])?.id) ?? texto(r[`${campo}_id`]);

// ---- Una deuda (`fn_proveedor_nos_debe`) -------------------------------------------------------------------------------------------

export type ResolucionDeuda = {
  forma: string;
  cantidad: number;
  /** El envío donde llegó la reposición («ENV-000075»), si llegó en una recepción. */
  envio: string | null;
  nota: string | null;
  /** Quién la anotó. */
  por: string | null;
  fecha: string | null;
};

export type DeudaProveedor = {
  /** La fila de `despacho_diferencias`: lo que `resolver_deuda_proveedor` nombra. */
  diferenciaId: string;
  /** Dónde faltó: «ENV-000061». */
  envio: string | null;
  sede: string | null;
  /** Cuándo se recibió el envío donde faltó (la fecha de la deuda). */
  fecha: string | null;
  /** La orden de compra de esa línea: «OC-000129». */
  orden: string | null;
  /** Cuándo quedó saldada (solo en una cerrada). */
  saldadaEn: string | null;
  categoria: string | null;
  categoriaId: string | null;
  marca: string | null;
  marcaId: string | null;
  descripcion: string | null;
  /** Lo que faltó. */
  cantidad: number;
  /** Lo que ya llegó (o se resolvió de otra forma). */
  resuelto: number;
  /** Lo que falta reponer: la deuda sigue abierta mientras sea mayor que 0. */
  pendiente: number;
  costoUnitario: number | null;
  /** Pendiente × costo de la línea, SIN IGV [provisional del contrato]. */
  montoPendiente: number;
  /** El papel de esa compra era una factura con IGV: lo pagado por esas prendas lleva además su 18 %. `null` = la base no lo dice. */
  conIgv: boolean | null;
  /** Lo pendiente con su IGV, si la base lo manda. */
  montoConIgv: number | null;
  /** Lo que escribió quien recibió («Caja abierta»). */
  nota: string | null;
  resoluciones: ResolucionDeuda[];
};

function leerResolucion(f: unknown): ResolucionDeuda | null {
  const r = objeto(f);
  if (!r) return null;
  const cantidad = cifra(r.cantidad);
  if (cantidad == null || cantidad <= 0) return null;
  const envio = objeto(r.envio) ?? objeto(r.despacho);
  return {
    forma: texto(r.forma) ?? "repuesta",
    cantidad,
    envio: numeroEnvio(envio ? envio.numero : (r.envio ?? r.numero_envio ?? r.despacho_numero)),
    nota: texto(r.nota),
    por: nombreDe(r.creado_por) ?? texto(r.por) ?? texto(r.creado_por_nombre),
    fecha: texto(r.creado_en) ?? texto(r.fecha),
  };
}

function leerDeuda(f: unknown): DeudaProveedor | null {
  const r = objeto(f);
  if (!r) return null;
  const diferenciaId = texto(r.diferencia_id) ?? texto(r.id);
  const cantidad = cifra(r.cantidad);
  if (!diferenciaId || cantidad == null || cantidad <= 0) return null;
  const resoluciones = lista(r.resoluciones)
    .map(leerResolucion)
    .filter((x): x is ResolucionDeuda => x !== null);
  const resuelto = Math.max(0, cifra(r.resuelto) ?? resoluciones.reduce((a, x) => a + x.cantidad, 0));
  const pendiente = Math.max(0, Math.min(cantidad, cifra(r.pendiente) ?? cantidad - resuelto));
  const costoUnitario = cifra(r.costo_unitario) ?? cifra(r.costo);
  const envio = objeto(r.envio) ?? objeto(r.despacho);
  return {
    diferenciaId,
    envio: numeroEnvio(envio ? envio.numero : (r.envio ?? r.numero_envio ?? r.despacho_numero)),
    sede: nombreDe(r.sede) ?? texto(r.sede_nombre),
    fecha: texto(r.fecha) ?? texto(r.creado_en) ?? texto(r.recibido_en),
    orden: texto(objeto(r.orden)?.numero) ?? texto(r.orden),
    saldadaEn: texto(r.saldada_en),
    categoria: nombreDe(r.categoria),
    categoriaId: idDe(r, "categoria"),
    marca: nombreDe(r.marca),
    marcaId: idDe(r, "marca"),
    descripcion: texto(r.descripcion),
    cantidad,
    resuelto,
    pendiente,
    costoUnitario,
    montoPendiente: Math.max(0, cifra(r.monto_pendiente) ?? redondear(pendiente * (costoUnitario ?? 0))),
    conIgv: booleano(r.con_igv) ?? booleano(r.factura_con_igv) ?? booleano(r.incluye_igv),
    montoConIgv: cifra(r.monto_pendiente_con_igv) ?? cifra(r.monto_con_igv),
    nota: texto(r.nota),
    resoluciones,
  };
}

export type NosDebe = {
  /** Las que siguen por reponer, la más antigua primero (es la que una reposición cierra primero). */
  abiertas: DeudaProveedor[];
  /** Las cerradas de los últimos 90 días, la más reciente primero. */
  cerradas: DeudaProveedor[];
  unidadesPendientes: number;
  /** Sin IGV [provisional del contrato]. */
  montoPendiente: number;
  /** Con el IGV de las que se compraron con factura: solo si alguna abierta lo lleva (si no, es igual al de arriba y no se dice). */
  montoConIgv: number | null;
};

export const NOS_DEBE_VACIO: NosDebe = { abiertas: [], cerradas: [], unidadesPendientes: 0, montoPendiente: 0, montoConIgv: null };

/** Un instante como número, para ordenar (sin fecha, al principio). Las fechas llegan con «Z» o con «+00:00»: no se comparan como texto. */
const instante = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0);
const porFecha = (a: DeudaProveedor, b: DeudaProveedor): number => instante(a.fecha) - instante(b.fecha);
/** Cuándo se cerró una deuda: lo que dice la base o, si no, su última resolución (o la deuda misma, sin resoluciones). */
const cerradaEl = (d: DeudaProveedor): number => instante(d.saldadaEn) || Math.max(instante(d.fecha), ...d.resoluciones.map((x) => instante(x.fecha)));

/**
 * Lee `fn_proveedor_nos_debe`. Acepta `{ abiertas, cerradas }`, `{ deudas }` o una lista suelta: en todos los casos una deuda está abierta
 * si le queda algo pendiente (la cifra manda, no el cajón en que vino). `null` si no llegó nada que se entienda (la pantalla lo dice).
 */
export function leerNosDebe(data: unknown): NosDebe | null {
  // Una función que devuelve filas en vez de un jsonb llega como lista de un solo objeto: se abre si ese objeto es el resumen, no una deuda.
  const unico = Array.isArray(data) && data.length === 1 ? objeto(data[0]) : null;
  const crudo = unico && ("abiertas" in unico || "cerradas" in unico || "deudas" in unico) ? unico : data;
  const d = objeto(crudo);
  if (!d && !Array.isArray(crudo)) return crudo == null ? NOS_DEBE_VACIO : null;
  const filas = d ? [...lista(d.abiertas), ...lista(d.cerradas), ...lista(d.deudas)] : lista(crudo);
  // Una deuda repetida (la misma en dos cajones) cuenta una vez.
  const porId = new Map<string, DeudaProveedor>();
  for (const f of filas) {
    const deuda = leerDeuda(f);
    if (deuda && !porId.has(deuda.diferenciaId)) porId.set(deuda.diferenciaId, deuda);
  }
  const deudas = [...porId.values()];
  const abiertas = deudas.filter((x) => x.pendiente > 0).sort(porFecha);
  const cerradas = deudas.filter((x) => x.pendiente === 0).sort((a, b) => cerradaEl(b) - cerradaEl(a));
  const conIgv = abiertas.some((x) => x.conIgv);
  return {
    abiertas,
    cerradas,
    unidadesPendientes: abiertas.reduce((a, x) => a + x.pendiente, 0),
    montoPendiente: redondear(abiertas.reduce((a, x) => a + x.montoPendiente, 0)),
    montoConIgv: conIgv ? (cifra(d?.monto_con_igv) ?? redondear(abiertas.reduce((a, x) => a + (x.montoConIgv ?? x.montoPendiente), 0))) : null,
  };
}

// ---- El resumen por proveedor (`fn_nos_debe_resumen`) -----------------------------------------------------------------------------

export type ResumenNosDebe = {
  proveedorId: string;
  nombre: string | null;
  unidades: number;
  monto: number;
  /** Qué debe, por categoría («2 chompas, 1 polo»), si la base lo dice; vacío si no. */
  detalle: { categoria: string; unidades: number }[];
};

/** Lee `fn_nos_debe_resumen`: por proveedor, lo pendiente. Un proveedor sin nada pendiente no entra (no hay nada que avisar). */
export function leerResumenNosDebe(data: unknown): Record<string, ResumenNosDebe> {
  const d = objeto(data);
  const filas = d ? lista(d.proveedores ?? d.resumen) : lista(data);
  const out: Record<string, ResumenNosDebe> = {};
  for (const f of filas) {
    const r = objeto(f);
    if (!r) continue;
    const proveedorId = texto(r.proveedor_id) ?? texto(objeto(r.proveedor)?.id) ?? texto(r.id);
    const unidades = cifra(r.unidades) ?? cifra(r.unidades_pendientes) ?? cifra(r.pendiente);
    if (!proveedorId || unidades == null || unidades <= 0) continue;
    // La base lo manda por categoría Y marca; el aviso habla de categorías («2 chompas»): se juntan, la que más debe primero (a igual
    // cantidad, por nombre).
    const porCategoria = new Map<string, number>();
    for (const x of lista(r.detalle ?? r.categorias)) {
      const c = objeto(x);
      const categoria = c ? (nombreDe(c.categoria) ?? texto(c.nombre)) : null;
      const n = c ? (cifra(c.unidades) ?? cifra(c.pendiente)) : null;
      if (categoria && n != null && n > 0) porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + n);
    }
    const detalle = [...porCategoria.entries()]
      .map(([categoria, n]) => ({ categoria, unidades: n }))
      .sort((a, b) => b.unidades - a.unidades || a.categoria.localeCompare(b.categoria, "es"));
    out[proveedorId] = {
      proveedorId,
      nombre: nombreDe(r.proveedor) ?? texto(r.proveedor_nombre) ?? texto(r.nombre),
      unidades,
      monto: Math.max(0, cifra(r.monto) ?? cifra(r.monto_pendiente) ?? 0),
      detalle,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Cómo se dice
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que une dos nombres en una categoría («Camisas y Blusas», «Libretas/Cuadernos») y no se toca. */
const CONECTORES = new Set(["y", "e", "o", "u"]);
/** Desde aquí el nombre ya no está en plural («Lentes de sol», «Útiles de oficina»). */
const CORTES = new Set(["de", "del", "para", "con", "sin", "en"]);
const VOCAL = /[aeiouáéíóú]/;

/** «chompas» → «chompa», «pantalones» → «pantalón», «collares» → «collar», «relojes» → «reloj», «útiles» → «útil». Una palabra que no está en
 *  plural se queda igual. Es una regla de tienda, no un diccionario: los nombres de categoría que se crean sin deploy caen bien casi siempre, y
 *  si no, se lee igual (la prueba recorre todas las categorías de hoy). */
function singularDe(palabra: string): string {
  const p = palabra;
  if (p.length <= 3 || !p.endsWith("s")) return p;
  if (/[^aeiouáéíóú]ones$/.test(p)) return `${p.slice(0, -4)}ón`; // pantalones, cinturones
  if (/[^aeiouáéíóú]ines$/.test(p)) return `${p.slice(0, -4)}ín`; // botines, mocasines
  if (p.endsWith("ojes")) return p.slice(0, -2); // relojes (trajes → traje: la regla general)
  if (p.endsWith("ces")) return `${p.slice(0, -3)}z`; // lápices
  const antes = p.at(-4) ?? "";
  if ((p.endsWith("res") || p.endsWith("les")) && VOCAL.test(antes)) return p.slice(0, -2); // collares, colores, útiles, formales
  return p.slice(0, -1); // polos, chompas, blazers, aretes, jeans
}

/** ¿La categoría se nombra en plural? («Polos» sí; «Maquillaje», «Ropa interior/Lencería» no). */
const enPlural = (categoria: string): boolean => /s$/i.test(categoria.trim().split(/\s+/)[0]?.split("/")[0] ?? "");

/**
 * «2 chompas», «1 chompa», «1 camisa o blusa», «2 unidades de maquillaje». El nombre de la categoría se escribe en plural en el catálogo
 * (`categorias.nombre`); con una sola prenda se dice en singular, y una categoría que no se nombra en plural se cuenta en unidades. Sin
 * categoría: «2 prendas».
 */
export function cantidadDePrendas(n: number, categoria: string | null | undefined): string {
  const cuantas = n.toLocaleString("es-PE");
  const cat = categoria?.trim().toLocaleLowerCase("es") ?? "";
  if (!cat) return `${cuantas} ${n === 1 ? "prenda" : "prendas"}`;
  if (!enPlural(cat)) return `${cuantas} ${n === 1 ? "unidad" : "unidades"} de ${cat}`;
  if (n !== 1) return `${cuantas} ${cat}`;
  let cortado = false;
  const palabras = cat.split(/\s+/).map((palabra) => {
    if (cortado) return palabra;
    if (CORTES.has(palabra)) {
      cortado = true;
      return palabra;
    }
    // «Camisas y Blusas»: una sola prenda es una camisa O una blusa.
    if (CONECTORES.has(palabra)) return palabra === "y" || palabra === "e" ? "o" : palabra;
    return palabra
      .split("/")
      .map(singularDe)
      .join("/");
  });
  return `${cuantas} ${palabras.join(" ")}`;
}

/** «Chompas · CAYLA · Chompa cuello alto»: lo que se debe, como se nombra la línea de una orden. */
export function nombreDeDeuda(d: Pick<DeudaProveedor, "categoria" | "marca" | "descripcion">): string {
  return [d.categoria, d.marca, d.descripcion].filter(Boolean).join(" · ") || "Prendas";
}

/** «2 chompas»: lo que todavía falta reponer. */
export const queDebe = (d: Pick<DeudaProveedor, "pendiente" | "categoria">): string => cantidadDePrendas(d.pendiente, d.categoria);

/** El día de Lima de un instante (o de una fecha `aaaa-mm-dd`). */
function diaLima(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? hoyLima(new Date(t)) : null;
}

/** «hoy», «ayer», «hace 3 días», «hace 2 meses». Sin fecha, nada. */
export function cuandoFue(fecha: string | null | undefined, hoy: string): string | null {
  const dia = fecha ? diaLima(fecha) : null;
  if (!dia) return null;
  const dias = Math.max(0, diasEntreFechas(dia, hoy));
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 60) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} meses`;
}

/** «ENV-000061 · Tienda Trujillo · hace 3 días»: dónde y cuándo faltó. */
export function dondeFalto(d: Pick<DeudaProveedor, "envio" | "sede" | "fecha">, hoy: string): string {
  return [d.envio, d.sede, cuandoFue(d.fecha, hoy)].filter(Boolean).join(" · ");
}

/** «2 chompas · S/ 84.00 · ENV-000061 · Tienda Trujillo · hace 3 días»: una deuda en una línea. */
export function textoDeDeuda(d: DeudaProveedor, hoy: string): string {
  return [queDebe(d), soles(d.montoPendiente), dondeFalto(d, hoy)].filter(Boolean).join(" · ");
}

/** «ya llegó 1 de 3»: solo si ya llegó una parte. */
export function avanceDeDeuda(d: Pick<DeudaProveedor, "cantidad" | "resuelto" | "pendiente">): string | null {
  if (d.resuelto <= 0 || d.pendiente <= 0) return null;
  return `ya ${d.resuelto === 1 ? "llegó 1" : `llegaron ${d.resuelto.toLocaleString("es-PE")}`} de ${d.cantidad.toLocaleString("es-PE")}`;
}

/** Cómo se cerró una deuda: «Llegaron 2 en ENV-000075 · Sandra Quispe · hoy», «Llegó 1, anotado a mano («La trajo el chofer») · …». */
export function textoDeResolucion(r: ResolucionDeuda, hoy: string): string {
  const cuando = cuandoFue(r.fecha, hoy);
  const cuantas = r.cantidad.toLocaleString("es-PE");
  const llego = r.cantidad === 1 ? "Llegó 1" : `Llegaron ${cuantas}`;
  const como =
    r.forma === "saldo_a_favor"
      ? `${cuantas} a saldo a favor`
      : r.forma === "deposito"
        ? `${cuantas} pagadas con un depósito`
        : r.envio
          ? `${llego} en ${r.envio}`
          : `${llego}, anotado a mano${r.nota ? ` («${r.nota}»)` : ""}`;
  return [como, r.por, cuando].filter(Boolean).join(" · ");
}

/** «2 chompas y 1 polo», «2 chompas, 1 polo y 3 prendas más» o «3 prendas»: lo que debe un proveedor, para el aviso de la orden nueva. */
export function queDebeElProveedor(r: Pick<ResumenNosDebe, "unidades" | "detalle">): string {
  const partes = r.detalle.filter((x) => x.unidades > 0);
  if (partes.length === 0) return cantidadDePrendas(r.unidades, null);
  const primeras = partes.slice(0, 2).map((x) => cantidadDePrendas(x.unidades, x.categoria));
  const resto = partes.slice(2).reduce((a, x) => a + x.unidades, 0);
  const todas = resto > 0 ? [...primeras, `${cantidadDePrendas(resto, null)} más`] : primeras;
  return new Intl.ListFormat("es", { type: "conjunction" }).format(todas);
}

/** El aviso de la orden nueva: «Textiles Andina SAC te debe 2 chompas (S/ 84.00) por reponer». */
export function tituloAvisoOrden(proveedor: string, r: Pick<ResumenNosDebe, "unidades" | "detalle" | "monto">): string {
  return `${proveedor} te debe ${queDebeElProveedor(r)}${r.monto > 0 ? ` (${soles(r.monto)})` : ""} por reponer`;
}

export const TEXTO_AVISO_ORDEN = "Pídeselo en esta orden o márcalo cuando llegue.";

// ---------------------------------------------------------------------------------------------------------------------------------
// La hoja «Llegó la reposición» (`resolver_deuda_proveedor` con `p_forma = 'repuesta'`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type BorradorReposicion = { cantidad: string; nota: string };

/** Viene puesto todo lo que se debía: es lo más común («llegó la reposición»). La nota, vacía. */
export const borradorReposicion = (d: Pick<DeudaProveedor, "pendiente">): BorradorReposicion => ({ cantidad: String(Math.max(1, d.pendiente)), nota: "" });

/** Lo que admite la caja de cantidad mientras se tipea: solo dígitos, hasta 4. */
export const limpiarCantidadReposicion = (t: string): string => t.replace(/\D/g, "").slice(0, 4);

/** La cantidad escrita: un entero de 1 a lo pendiente, como exige la base. Con la categoría, el tope se dice en sus palabras. */
export function leerCantidadReposicion(t: string, pendiente: number, categoria: string | null = null): { n: number | null; problema: string | null } {
  const limpio = t.trim();
  if (limpio === "") return { n: null, problema: "Escribe cuántas llegaron." };
  if (!/^\d{1,4}$/.test(limpio)) return { n: null, problema: "Escribe solo el número de prendas, sin letras ni decimales." };
  const n = Number(limpio);
  if (n < 1) return { n: null, problema: "Tiene que haber llegado al menos 1." };
  if (n > pendiente) return { n: null, problema: `Te debía ${cantidadDePrendas(pendiente, categoria)}: no pueden haber llegado más.` };
  return { n, problema: null };
}

/** La nota escrita: obligatoria [provisional del contrato] y hasta 300 letras. */
export function problemaDeNota(t: string): string | null {
  const limpia = textoParaBase(t);
  if (limpia === "") return "Escribe cómo llegó: en qué envío, quién la trajo o qué pasó.";
  if (limpia.length > TOPES_REPOSICION.nota) return `La nota va hasta ${TOPES_REPOSICION.nota} letras.`;
  return null;
}

/**
 * Los campos de la guía de la hoja, en su orden. Salen de lo que `resolver_deuda_proveedor` rechaza: la cantidad (un entero de 1 a lo
 * pendiente), la nota (obligatoria) y quién lo anota (el combo «Responsable»). Con UNA sola pendiente no hay cantidad que elegir: no se
 * pregunta. La cantidad viene puesta con todo lo pendiente: mientras la persona no la toca es «sugerida» (ADR-0284 act. h): la luz pasa por
 * ella para que la revise y nunca bloquea; puesta mal, bloquea como siempre.
 */
export function camposReposicion(
  b: BorradorReposicion,
  d: Pick<DeudaProveedor, "pendiente"> & { categoria?: string | null },
  responsable: { listo: boolean; motivo: string | null },
  tocados: { cantidad?: boolean } = {},
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (d.pendiente > 1) {
    const { problema } = leerCantidadReposicion(b.cantidad, d.pendiente, d.categoria ?? null);
    campos.push(
      problema === null && !tocados.cantidad
        ? { id: "cantidad", nombre: "Cuántas llegaron", requerido: false, sugerido: true, hecho: false, pendiente: "Revisa cuántas llegaron: viene puesto todo lo que te debía." }
        : { id: "cantidad", nombre: "Cuántas llegaron", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    );
  }
  const problemaNota = problemaDeNota(b.nota);
  campos.push({ id: "nota", nombre: "Cómo llegó", requerido: true, hecho: problemaNota === null, pendiente: problemaNota ?? "" });
  campos.push({ id: "responsable", nombre: "Quién lo anota", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo anota." });
  return campos;
}

/** Cuántas se anotan: lo escrito si es válido; con una sola pendiente, 1. */
export function cantidadAnotada(b: BorradorReposicion, d: Pick<DeudaProveedor, "pendiente">): number | null {
  return d.pendiente === 1 ? 1 : leerCantidadReposicion(b.cantidad, d.pendiente).n;
}

export type ArgsResolverDeuda = { p_diferencia_id: string; p_forma: FormaResolucion; p_cantidad: number; p_nota: string; p_token: string };

/** Los argumentos de `resolver_deuda_proveedor`. Solo se llama con la hoja lista. `token` se genera al abrir la hoja: un reintento (doble clic,
 *  corte de señal) no anota dos veces. */
export function argsResolverDeuda(d: Pick<DeudaProveedor, "diferenciaId" | "pendiente">, b: BorradorReposicion, token: string): ArgsResolverDeuda {
  return {
    p_diferencia_id: d.diferenciaId,
    p_forma: "repuesta",
    p_cantidad: cantidadAnotada(b, d) ?? 0,
    p_nota: textoParaBase(b.nota),
    p_token: token,
  };
}

/** «Anotar que llegaron 2» / «Anotar que llegó 1»: el botón dice lo que se anota. */
export function textoBotonReposicion(n: number | null): string {
  if (n == null || n <= 0) return "Anotar que llegó";
  return n === 1 ? "Anotar que llegó 1" : `Anotar que llegaron ${n.toLocaleString("es-PE")}`;
}

export type ResultadoResolucion = { pendiente: number | null };

/** Lee lo que contesta `resolver_deuda_proveedor`: lo que queda pendiente de esa deuda, si lo dice. `null` si no llegó un objeto. */
export function leerResultadoResolucion(data: unknown): ResultadoResolucion | null {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  const deuda = objeto(r.deuda);
  return { pendiente: cifra(r.pendiente) ?? (deuda ? cifra(deuda.pendiente) : null) };
}

/** El aviso de éxito: «Textiles Andina SAC ya no te debe esas chompas» o «Todavía te debe 1 chompa». */
export function detalleDeReposicion(proveedor: string, d: Pick<DeudaProveedor, "pendiente" | "categoria">, anotadas: number, r: ResultadoResolucion | null): string {
  const queda = r?.pendiente ?? Math.max(0, d.pendiente - anotadas);
  return queda > 0 ? `Todavía te debe ${cantidadDePrendas(queda, d.categoria)} de esto.` : `${proveedor} ya no te debe nada de esto.`;
}

/** Qué decir cuando se corta la señal al anotar: pudo guardarse. Reintentar sin cambiar nada es seguro (el mismo token no anota dos veces). */
export const AVISO_DE_CORTE_REPOSICION =
  "Se cortó la conexión y no sabemos si se anotó. Vuelve a pulsar el botón sin cambiar nada: si ya se anotó, no se repite.";

/** ¿Conviene recargar? La deuda cambió mientras la hoja estaba abierta (otra persona marcó, ya se saldó, no existe) o el mismo pedido ya se
 *  guardó con otros datos: lo que la hoja muestra ya no es lo que hay. */
const HINTS_RECARGAR = new Set(["nos_debe_saldada", "nos_debe_pasa_de_lo_debido", "nos_debe_no_existe", "nos_debe_otros_datos"]);
export const sugiereRecargarNosDebe = (error: { hint?: string | null } | null | undefined): boolean => !!error?.hint && HINTS_RECARGAR.has(error.hint);

/** Los avisos de la base de esta fase vienen en palabras de tienda (hint `deuda_*`, `nos_debe_*`, `reposicion_*`). Algunos llegan con 42501
 *  y caerían al genérico «No se pudo…»: se dicen tal cual. `null` = no es uno de estos (sigue por `traducirError`). */
const HINTS_NOS_DEBE = /^(nos_debe|deuda|deudas|reposicion|resolver_deuda|resolucion)_[a-z_]+$/;
export function mensajeDeNosDebe(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  if (!error?.message || !error.hint) return null;
  return HINTS_NOS_DEBE.test(error.hint) && !/_sin_modulo$/.test(error.hint) ? error.message : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La recepción: «Es la reposición de lo que faltó» (`fn_envio_detalle.deudas_del_proveedor`)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que un proveedor del envío debe de una categoría y una marca (lo que una reposición puede cubrir). */
export type DeudaDelEnvio = {
  proveedorId: string;
  categoriaId: string;
  marcaId: string;
  /** Unidades por reponer de esa categoría y marca (todas sus deudas abiertas juntas). */
  pendiente: number;
  /** El costo por unidad de la deuda más antigua (la que se salda primero): precarga el de lo que no estaba en la guía. */
  costoUnitario: number | null;
};

export const claveDeuda = (proveedorId: string, categoriaId: string, marcaId: string): string => `${proveedorId}|${categoriaId}|${marcaId}`;

/**
 * Lee las `deudas_del_proveedor` de `fn_envio_detalle`. Acepta una fila por deuda o una por categoría y marca: junta las de la misma clave.
 * `null` si la base no las manda (todavía sin la fase 5: la recepción sigue como antes, sin ofrecer la reposición).
 */
export function leerDeudasDelEnvio(data: unknown): DeudaDelEnvio[] | null {
  if (!Array.isArray(data)) return null;
  const porClave = new Map<string, DeudaDelEnvio>();
  for (const f of data) {
    const r = objeto(f);
    if (!r) continue;
    const proveedorId = idDe(r, "proveedor");
    const categoriaId = idDe(r, "categoria");
    const marcaId = idDe(r, "marca");
    const pendiente = cifra(r.pendiente) ?? cifra(r.unidades) ?? cifra(r.unidades_pendientes);
    if (!proveedorId || !categoriaId || !marcaId || pendiente == null || pendiente <= 0) continue;
    const clave = claveDeuda(proveedorId, categoriaId, marcaId);
    const previa = porClave.get(clave);
    // Las filas llegan de la deuda más antigua a la más nueva: se queda el primer costo que haya.
    const costo = cifra(r.costo_unitario) ?? cifra(r.costo);
    porClave.set(clave, { proveedorId, categoriaId, marcaId, pendiente: (previa?.pendiente ?? 0) + pendiente, costoUnitario: previa?.costoUnitario ?? costo });
  }
  return [...porClave.values()];
}

/** La deuda de ese proveedor, de esa categoría y marca (o null si no debe nada de eso, o si falta alguno de los tres). */
export function deudaDe(deudas: readonly DeudaDelEnvio[] | null | undefined, proveedorId: string | null | undefined, categoriaId: string, marcaId: string): DeudaDelEnvio | null {
  if (!deudas || !proveedorId || !categoriaId || !marcaId) return null;
  return deudas.find((x) => x.proveedorId === proveedorId && x.categoriaId === categoriaId && x.marcaId === marcaId && x.pendiente > 0) ?? null;
}

/** Lo que ese proveedor debe de esa categoría y marca (0 si nada, o si falta alguno de los tres). */
export function pendienteDe(deudas: readonly DeudaDelEnvio[] | null | undefined, proveedorId: string | null | undefined, categoriaId: string, marcaId: string): number {
  return deudaDe(deudas, proveedorId, categoriaId, marcaId)?.pendiente ?? 0;
}

/** Un pedido de reposición de la recepción: una línea con de más, o algo que no estaba en la guía. `categoria` y `marca` (los nombres) solo
 *  sirven para decir el problema («Te debe 1 polo CAYLA…»). */
export type PedidoReposicion = {
  id: string;
  proveedorId: string | null;
  categoriaId: string;
  marcaId: string;
  cantidad: number;
  categoria?: string | null;
  marca?: string | null;
};

/** «1 polo CAYLA», «2 chompas»: lo que se debe, con la marca si se sabe. */
const loQueSeDebe = (n: number, categoria?: string | null, marca?: string | null): string => `${cantidadDePrendas(n, categoria)}${marca ? ` ${marca}` : ""}`;

/**
 * Cuántas puede cubrir cada pedido de reposición, en el orden de la pantalla (las líneas y después lo que no estaba en la guía): lo que toma
 * un pedido ya no está para el siguiente de la misma categoría y marca. Es el espejo de `recibir_despacho`: la acepta solo si ese proveedor
 * debe esa categoría y marca, y rechaza lo que pase de lo debido (que es un sobrante con otra causa). Devuelve, por pedido, lo que tenía
 * disponible y el problema (o `null` si la base lo acepta).
 */
export function cubrirReposiciones(deudas: readonly DeudaDelEnvio[] | null | undefined, pedidos: readonly PedidoReposicion[]): Map<string, { disponible: number; problema: string | null }> {
  const quedan = new Map<string, number>();
  for (const x of deudas ?? []) quedan.set(claveDeuda(x.proveedorId, x.categoriaId, x.marcaId), x.pendiente);
  const out = new Map<string, { disponible: number; problema: string | null }>();
  for (const p of pedidos) {
    const clave = p.proveedorId ? claveDeuda(p.proveedorId, p.categoriaId, p.marcaId) : null;
    const disponible = clave ? (quedan.get(clave) ?? 0) : 0;
    if (disponible <= 0) {
      out.set(p.id, { disponible: 0, problema: "Este proveedor no te debe nada de esta categoría y marca: elige otra opción." });
      continue;
    }
    if (p.cantidad > disponible) {
      out.set(p.id, {
        disponible,
        problema: `Te debe ${loQueSeDebe(disponible, p.categoria, p.marca)} y aquí hay ${p.cantidad.toLocaleString("es-PE")} de más: la reposición cubre hasta ${disponible.toLocaleString("es-PE")}. Elige otra opción.`,
      });
      continue;
    }
    quedan.set(clave!, disponible - p.cantidad);
    out.set(p.id, { disponible, problema: null });
  }
  return out;
}

/** La opción de la recepción, con lo que ese proveedor debe de esto: `aviso` antes de elegir, `ayuda` después. */
export const VALOR_REPOSICION = "reposicion";
export const TEXTO_REPOSICION = "Es la reposición de lo que faltó";
export function opcionReposicion(
  pendiente: number,
  proveedor: string | null,
  que: { categoria?: string | null; marca?: string | null } = {},
): { valor: typeof VALOR_REPOSICION; texto: string; ayuda: string; aviso: string } {
  const quien = proveedor ?? "Este proveedor";
  const cuantas = loQueSeDebe(pendiente, que.categoria, que.marca);
  return {
    valor: VALOR_REPOSICION,
    texto: TEXTO_REPOSICION,
    ayuda: `Se descuentan de lo que ${quien} te debe (${cuantas} por reponer).`,
    aviso: `${quien} te debe ${cuantas} de un envío anterior. Si es lo que faltó, elige «${TEXTO_REPOSICION}».`,
  };
}
