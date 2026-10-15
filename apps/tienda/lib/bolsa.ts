import { z } from "zod";
import { soles } from "./catalogo";
import { nombreTienda } from "./pedidos";
import { sedesEnOrden } from "./sede-elegida";
import { interpretarSedes, type Sede } from "./tiendas";

// La bolsa de la tienda online (ADR-0408, actividad 7; maqueta v4, `vBolsa`). Agregar NO separa nada (propuesta f): la bolsa es
// solo una lista de qué prendas (talla y color) y cuántas, más la tienda donde se recoge TODO y la marca del próximo «Separar».
//
// DÓNDE VIVE: en una cookie del navegador (`tienda-bolsa`), escrita SOLO por las acciones del servidor (`app/acciones/bolsa.ts`,
// con `httpOnly`). Se eligió la cookie y no el almacenamiento del navegador porque así el servidor arma la página de la bolsa ya con
// los precios de la tienda (sin un parpadeo ni un «cargando»), la cabecera cuenta las prendas sin JavaScript, y «Separar» vacía la
// bolsa en la MISMA respuesta que crea el pedido (si esa respuesta se pierde, la bolsa sigue con la misma marca y volver a tocar
// «Separar» devuelve el mismo pedido). No guarda precios ni stock: eso lo dice siempre la base (`retail.tienda_bolsa`), y lo que
// trae la cookie se trata como dato del navegador (se valida todo, y lo raro se descarta).
//
// Aquí: leer y escribir la cookie (lógica pura, con su prueba) y armar lo que la página muestra con la respuesta de la base.

export const COOKIE_BOLSA = "tienda-bolsa";
/** El mismo tope de cordura de `crear_pedido_web` (el motor del pedido web): una bolsa lleva hasta 20 prendas. */
export const TOPE_PRENDAS = 20;
/** La bolsa se queda en el aparato 30 días desde que se tocó por última vez. */
export const DIAS_DE_LA_BOLSA = 30;

export type LineaBolsa = { varianteId: string; cantidad: number };
/** `marca`: la del próximo «Separar» (el token del pedido). Cambia cada vez que cambia la bolsa o la tienda. */
export type Bolsa = { lineas: LineaBolsa[]; sedeId: string | null; marca: string | null };
export const BOLSA_VACIA: Bolsa = { lineas: [], sedeId: null, marca: null };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** ¿Es un id de la base (uuid en minúsculas)? */
export const esId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const VERSION = "1";
const NADA = "_";

/** Cuántas prendas lleva (las unidades, no las filas). */
export const unidades = (b: Pick<Bolsa, "lineas">) => b.lineas.reduce((n, l) => n + l.cantidad, 0);

/**
 * La cookie → la bolsa. Formato: `1.<tienda|_>.<marca|_>.<prenda>~<n>.<prenda>~<n>…` (solo letras, números, `-`, `.`, `~` y `_`:
 * nada que el navegador tenga que codificar). Lo que no tiene esa forma se descarta; la misma prenda dos veces se suma; nunca más
 * de 20 prendas.
 */
export function leerBolsa(valor: string | null | undefined): Bolsa {
  if (!valor) return BOLSA_VACIA;
  const [version, sede, marca, ...resto] = valor.split(".");
  if (version !== VERSION) return BOLSA_VACIA;
  const lineas: LineaBolsa[] = [];
  let total = 0;
  for (const parte of resto) {
    const m = /^([0-9a-f-]{36})~(\d{1,2})$/.exec(parte);
    if (!m || !esId(m[1])) continue;
    const cantidad = Math.min(Number(m[2]), TOPE_PRENDAS - total);
    if (cantidad < 1) continue;
    const ya = lineas.find((l) => l.varianteId === m[1]);
    if (ya) ya.cantidad += cantidad;
    else lineas.push({ varianteId: m[1], cantidad });
    total += cantidad;
  }
  return { lineas, sedeId: esId(sede) ? sede : null, marca: esId(marca) ? marca : null };
}

/** La bolsa → la cookie (`leerBolsa(escribirBolsa(b))` devuelve la misma bolsa). */
export function escribirBolsa(b: Bolsa): string {
  return [VERSION, b.sedeId ?? NADA, b.marca ?? NADA, ...b.lineas.map((l) => `${l.varianteId}~${l.cantidad}`)].join(".");
}

/** Una prenda más (si cabe). Si todavía no eligió dónde recoger y venía mirando una tienda, esa queda elegida (maqueta). */
export function agregarUna(
  b: Bolsa,
  varianteId: string,
  { marca, sedeId = null }: { marca: string; sedeId?: string | null },
): Bolsa | null {
  if (unidades(b) >= TOPE_PRENDAS) return null;
  const ya = b.lineas.some((l) => l.varianteId === varianteId);
  const lineas = ya
    ? b.lineas.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + 1 } : l))
    : [...b.lineas, { varianteId, cantidad: 1 }];
  return { lineas, sedeId: b.sedeId ?? sedeId, marca };
}

/**
 * «Quitar» saca UNA (maqueta: `w-quitar`). `vista`: cuántas veía el cliente al tocar; si ya no son esas (un doble toque, otra
 * pestaña), no saca nada: así dos toques seguidos sacan una sola.
 */
export function quitarUna(b: Bolsa, varianteId: string, { vista, marca }: { vista: number; marca: string }): Bolsa {
  const linea = b.lineas.find((l) => l.varianteId === varianteId);
  if (!linea || linea.cantidad !== vista) return b;
  const lineas =
    linea.cantidad > 1 ? b.lineas.map((l) => (l === linea ? { ...l, cantidad: l.cantidad - 1 } : l)) : b.lineas.filter((l) => l !== linea);
  return { ...b, lineas, marca };
}

/** La tienda donde se recoge todo. */
export const elegirSede = (b: Bolsa, sedeId: string, marca: string): Bolsa => (b.sedeId === sedeId ? b : { ...b, sedeId, marca });

/** Después de separar: sin prendas ni marca; la tienda queda elegida para la próxima (maqueta: `separar`). */
export const sinPrendas = (b: Bolsa): Bolsa => ({ lineas: [], sedeId: b.sedeId, marca: null });

/* ---------------- Lo que dice la base (`retail.tienda_bolsa`) ---------------- */

const esquemaEnSede = z.object({ alcanza: z.boolean(), hay: z.boolean(), se_vende: z.boolean() });
const esquemaDisponible = z.object({
  variante_id: z.string().uuid(),
  cantidad: z.number().int().min(1).max(TOPE_PRENDAS),
  disponible: z.literal(true),
  producto_id: z.string().uuid(),
  nombre: z.string().min(1),
  categoria: z.object({ nombre: z.string(), prefijo: z.string().nullable() }).nullable().catch(null),
  color: z
    .object({
      nombre: z.string().nullable(),
      hex: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .nullable()
        .catch(null),
    })
    .catch({ nombre: null, hex: null }),
  talla: z.string().nullable(),
  foto: z.string().url().nullable().catch(null),
  precio_lista: z.number().positive(),
  precio: z.number().positive(),
  campana: z.object({ nombre: z.string(), pct: z.number().positive() }).nullable().catch(null),
  en_sedes: z.record(z.string(), esquemaEnSede),
  alcanza_en_total: z.boolean(),
});
const esquemaNoDisponible = z.object({ variante_id: z.string().uuid(), cantidad: z.number().int().min(1), disponible: z.literal(false) });

export type PrendaEnLaBolsa = {
  varianteId: string;
  cantidad: number;
  productoId: string;
  nombre: string;
  categoria: { nombre: string; prefijo: string | null } | null;
  color: { nombre: string | null; hex: string | null };
  talla: string | null;
  foto: string | null;
  precioLista: number;
  precio: number;
  campana: { nombre: string; pct: number } | null;
  enSedes: Record<string, { alcanza: boolean; hay: boolean; seVende: boolean }>;
  alcanzaEnTotal: boolean;
};
/** Una prenda que ya no se puede separar: la base no dice ni su nombre (puede no estar publicada). */
export type PrendaQueYaNoEsta = { varianteId: string; cantidad: number; noEsta: true };
export type LineaEnBase = PrendaEnLaBolsa | PrendaQueYaNoEsta;
export type BolsaEnBase = { sedeId: string | null; sedes: Sede[]; lineas: LineaEnBase[] };

export const yaNoEsta = (l: LineaEnBase): l is PrendaQueYaNoEsta => "noEsta" in l;

/** La respuesta de la base; `null` si no tiene forma de bolsa (la página dice que no pudo cargarla). */
export function interpretarBolsaEnBase(dato: unknown): BolsaEnBase | null {
  const r = z.object({ sede: z.string().uuid().nullable(), sedes: z.unknown(), lineas: z.array(z.unknown()) }).safeParse(dato);
  if (!r.success) return null;
  const lineas: LineaEnBase[] = [];
  for (const crudo of r.data.lineas) {
    const d = esquemaDisponible.safeParse(crudo);
    if (d.success) {
      const x = d.data;
      lineas.push({
        varianteId: x.variante_id,
        cantidad: x.cantidad,
        productoId: x.producto_id,
        nombre: x.nombre,
        categoria: x.categoria,
        color: x.color,
        talla: x.talla,
        foto: x.foto,
        precioLista: x.precio_lista,
        precio: x.precio,
        campana: x.campana,
        enSedes: Object.fromEntries(
          Object.entries(x.en_sedes).map(([id, s]) => [id, { alcanza: s.alcanza, hay: s.hay, seVende: s.se_vende }]),
        ),
        alcanzaEnTotal: x.alcanza_en_total,
      });
      continue;
    }
    // Lo que no se puede mostrar (o llega raro) se trata como «ya no está»: se puede quitar, pero no separar.
    const n = esquemaNoDisponible.safeParse(crudo);
    const id = n.success ? n.data.variante_id : z.object({ variante_id: z.string().uuid() }).safeParse(crudo).data?.variante_id;
    if (id) lineas.push({ varianteId: id, cantidad: n.success ? n.data.cantidad : 1, noEsta: true });
  }
  return { sedeId: r.data.sede, sedes: interpretarSedes({ sedes: r.data.sedes }), lineas };
}

/* ---------------- Lo que muestra la página ---------------- */

export type MarcaDeLinea =
  | { tipo: "no_esta" }
  | { tipo: "agotada" }
  | { tipo: "no_alcanza" }
  | { tipo: "no_se_vende"; sede: string }
  | { tipo: "hay"; sede: string }
  | { tipo: "traslado"; sede: string; desde: string | null }
  | { tipo: "nada" };

/** Lo que se dice debajo de cada prenda (maqueta: «Se agotó…», «Hay en Trujillo», «No está en Trujillo: la tienda puede traerla de
 *  Lima»). Lo que no está en la maqueta —una prenda que ya no está, una que no se vende en esa tienda, o que no alcanza para todas
 *  las que lleva— dice qué hacer en una línea. */
export function textoDeLaMarca(m: MarcaDeLinea): string | null {
  switch (m.tipo) {
    case "no_esta":
      return "Ya no está en la tienda online. Quítala para separar.";
    case "agotada":
      return "Se agotó en todas las tiendas. Quítala para separar.";
    case "no_alcanza":
      return "No quedan tantas en las tiendas. Quita una para separar.";
    case "no_se_vende":
      return `No se vende en ${m.sede}. Quítala o elige otra tienda.`;
    case "hay":
      return `Hay en ${m.sede}`;
    case "traslado":
      return m.desde
        ? `No está en ${m.sede}: la tienda puede traerla de ${m.desde}`
        : `No está en ${m.sede}: la tienda puede traerla de otra tienda`;
    case "nada":
      return null;
  }
}

export type OpcionDeTienda = { sede: Sede; elegida: boolean; texto: string | null };

export type VistaBolsa = {
  lineas: { linea: LineaEnBase; marca: MarcaDeLinea; importe: number | null }[];
  /** La tienda elegida para recoger (una de la web), o null. */
  sede: Sede | null;
  tiendas: OpcionDeTienda[];
  prendas: number;
  /** Lo que se paga (con las campañas) y lo que las campañas ahorran. */
  total: number;
  ahorro: number;
  /** Lo que se dice sobre el botón; `destacado` va en negrita (maqueta: «Falta: <b>elegir la tienda</b>»). */
  nota: { antes: string; destacado: string; despues: string };
  boton: string;
  listo: boolean;
  /** Lo que viaja con «Separar»: lo que el cliente VE (la base lo vuelve a calcular y lo compara). */
  paraSeparar: { variante_id: string; cantidad: number; precio: number }[];
};

export function vistaBolsa(b: BolsaEnBase): VistaBolsa {
  const sedes = sedesEnOrden(b.sedes);
  const sede = sedes.find((s) => s.id === b.sedeId) ?? null;
  const disponibles = b.lineas.filter((l): l is PrendaEnLaBolsa => !yaNoEsta(l));

  const lineas = b.lineas.map((linea) => {
    if (yaNoEsta(linea)) return { linea, marca: { tipo: "no_esta" } as MarcaDeLinea, importe: null };
    let marca: MarcaDeLinea = { tipo: "nada" };
    if (!linea.alcanzaEnTotal) marca = Object.values(linea.enSedes).some((s) => s.hay) ? { tipo: "no_alcanza" } : { tipo: "agotada" };
    else if (sede) {
      const ahi = linea.enSedes[sede.id];
      if (ahi && !ahi.seVende) marca = { tipo: "no_se_vende", sede: sede.nombre };
      else if (ahi?.alcanza) marca = { tipo: "hay", sede: sede.nombre };
      else {
        const otras = sedes.filter((s) => s.id !== sede.id);
        const desde = otras.find((s) => linea.enSedes[s.id]?.alcanza) ?? otras.find((s) => linea.enSedes[s.id]?.hay) ?? null;
        marca = { tipo: "traslado", sede: sede.nombre, desde: desde?.nombre ?? null };
      }
    }
    return { linea, marca, importe: redondear(linea.precio * linea.cantidad) };
  });

  // «Tiene todo lo que elegiste» o «Tiene 1 de 2; lo demás lo trae de otra tienda» (maqueta, `cobertura`: cuenta filas).
  const tiendas = sedes.map((s) => {
    const total = disponibles.length;
    const ahi = disponibles.filter((l) => l.enSedes[s.id]?.alcanza && l.enSedes[s.id]?.seVende).length;
    const ninguna = disponibles.filter((l) => !l.alcanzaEnTotal).length;
    const resto = total - ahi - ninguna;
    const texto =
      total === 0
        ? null
        : ahi === total
          ? "Tiene todo lo que elegiste"
          : `Tiene ${ahi} de ${total}${resto > 0 ? "; lo demás lo trae de otra tienda" : ""}`;
    return { sede: s, elegida: s.id === sede?.id, texto };
  });

  const marcas = lineas.map((l) => l.marca.tipo);
  const total = redondear(disponibles.reduce((n, l) => n + l.precio * l.cantidad, 0));
  const ahorro = redondear(disponibles.reduce((n, l) => n + (l.precioLista - l.precio) * l.cantidad, 0));
  let nota: VistaBolsa["nota"];
  if (sedes.length === 0)
    nota = { antes: "", destacado: "Por ahora no recibimos pedidos de la web.", despues: " Vuelve a intentarlo en un rato." };
  else if (marcas.includes("no_esta"))
    nota = { antes: "", destacado: "Una prenda ya no está en la tienda online.", despues: " Quítala para separar." };
  else if (marcas.includes("agotada") || marcas.includes("no_alcanza"))
    nota = { antes: "", destacado: "Hay una prenda agotada.", despues: " Quítala para separar." };
  else if (!sede) nota = { antes: "Falta: ", destacado: "elegir la tienda", despues: "" };
  else if (marcas.includes("no_se_vende"))
    nota = { antes: "", destacado: `Una prenda no se vende en ${sede.nombre}.`, despues: " Quítala o elige otra tienda." };
  else nota = { antes: `No pagas nada ahora: ${nombreTienda(sede.nombre)} te confirma por WhatsApp.`, destacado: "", despues: "" };
  const bloqueada = marcas.some((m) => m === "no_esta" || m === "agotada" || m === "no_alcanza" || m === "no_se_vende");

  return {
    lineas,
    sede,
    tiendas,
    prendas: unidades({ lineas: disponibles }),
    total,
    ahorro,
    nota,
    boton: sede ? `Separar en ${sede.nombre}` : "Separar",
    listo: Boolean(sede) && !bloqueada && disponibles.length > 0,
    paraSeparar: disponibles.map((l) => ({ variante_id: l.varianteId, cantidad: l.cantidad, precio: l.precio })),
  };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** «S/ 139.80»: el importe de una fila (precio × cuántas). */
export const importe = (n: number | null) => (n === null ? "" : soles(n));

/** «3 prendas», «1 prenda». */
export const cuantas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;

/* ---------------- Lo que dice el servidor al agregar o al separar ---------------- */

/** Las respuestas de «Separar» que la base explica con su hint, en palabras de tienda. Lo demás: «no pudimos separar ahora». */
export const MENSAJES_SEPARAR: Record<string, string> = {
  tienda_separar_precio: "El precio de una prenda cambió. Revisa tu bolsa y vuelve a tocar «Separar».",
  tienda_separar_agotada: "Una prenda se agotó mientras la mirabas. Quítala para separar.",
  tienda_separar_no_publicada: "Una prenda ya no está en la tienda online. Quítala para separar.",
  tienda_separar_no_se_vende: "Una prenda no se vende en esa tienda. Quítala o elige otra tienda.",
  tienda_separar_tienda: "Esa tienda no recibe pedidos de la web ahora. Elige otra.",
  pedido_web_muchas_prendas: `Tu bolsa lleva hasta ${TOPE_PRENDAS} prendas. Quita alguna para separar.`,
  tienda_sin_cuenta: "Tu cuenta no terminó de crearse. Entra a «Mi cuenta» para terminarla.",
  // Lo que llegó no se pudo leer (una bolsa vieja, una pestaña a medias): se vuelve a mirar la bolsa de ahora.
  pedido_web_linea_invalida: "Revisa tu bolsa y vuelve a tocar «Separar».",
  pedido_web_bolsa_vacia: "Revisa tu bolsa y vuelve a tocar «Separar».",
};
export const SEPARAR_SIN_RESPUESTA = "No pudimos separar ahora. Tu bolsa sigue aquí: vuelve a intentarlo en un momento.";
export const BOLSA_CAMBIO = "Tu bolsa cambió en otra pestaña. Revísala y vuelve a tocar «Separar».";

/** El aviso de abajo al agregar (maqueta, `agregarABolsa`). */
export const avisoAgregada = (p: Pick<PrendaEnLaBolsa, "nombre" | "color" | "talla">) =>
  `Agregaste ${[p.nombre, p.color.nombre, p.talla].filter(Boolean).join(" · ")} a tu bolsa.`;
export const AGREGAR_AGOTADA = "Esa talla ya no está en ninguna tienda.";
export const AGREGAR_NO_ESTA = "Esa prenda ya no está en la tienda online.";
export const AGREGAR_LLENA = `Tu bolsa lleva hasta ${TOPE_PRENDAS} prendas.`;
export const AGREGAR_SIN_RESPUESTA = "No pudimos agregarla ahora. Vuelve a intentarlo en un momento.";
