// Tienda web ▸ Vitrina ▸ Looks (ADR-0408, actividad 11; maqueta v4, «looks-erp»): las combinaciones de 2 a 4 prendas que la tienda
// online muestra en «Arma tu look». Lógica pura: se importa desde el servidor y desde el cliente, y se prueba con
// `vitrina-looks-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: leer lo que devuelve `retail.fn_vitrina_looks()` (y cada look que devuelven `vitrina_guardar_look` y `vitrina_mostrar_look`)
//            sin caerse ante un dato raro; decir si un look se ve y, si no, por qué, en palabras de tienda; las cifras y el filtro de la
//            pantalla; lo que falta para guardar (lo MISMO que la base rechaza) y los errores de la base en palabras de tienda.
//   ASUME:   que la base es la que decide (si una prenda se ve en la web, la versión, el lugar): aquí solo se adelanta para no mandar algo
//            que va a volver rechazado.
//   NO HACE: leer la base ni decidir permisos.

import { normalizarBusqueda } from "./combo-reglas";

/** Lo que la base acepta (`vitrina_looks`): de 2 a 4 prendas, el nombre hasta 60 letras y la frase hasta 200. */
export const MIN_PRENDAS_LOOK = 2;
export const MAX_PRENDAS_LOOK = 4;
export const MAX_NOMBRE_LOOK = 60;
export const MAX_FRASE_LOOK = 200;

export type ColorLook = { codigo: string; nombre: string; hex: string | null };
export type PiezaLook = {
  posicion: number;
  productoId: string;
  nombre: string;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  color: ColorLook;
  foto: string | null;
  /** Se ve en la web en ese color (lo que ve el cliente). */
  seVe: boolean;
};
export type Look = {
  id: string;
  nombre: string;
  frase: string | null;
  publicado: boolean;
  /** Su lugar en «Arma tu look» (1 = primero). */
  lugar: number;
  version: number;
  /** Cuántas prendas se guardaron; `faltan` las que se eliminaron del catálogo después. */
  piezasDelLook: number;
  faltan: number;
  /** Encendido y con todas sus prendas a la vista: el cliente lo ve. */
  seVe: boolean;
  /** Lo que paga el cliente por el look con «Todas» (el precio más alto entre las tiendas); `null` si alguna prenda no se ve. */
  total: number | null;
  desde: boolean;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
  piezas: PiezaLook[];
};
export type ColorModelo = ColorLook & { foto: string | null };
/** Un modelo que se puede poner en un look: los que hoy se ven en la web. */
export type ModeloParaLook = {
  id: string;
  nombre: string;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  foto: string | null;
  colores: ColorModelo[];
};
export type LecturaLooks = { looks: Look[]; modelos: ModeloParaLook[] };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function colorDeJson(v: unknown): ColorModelo | null {
  if (!esObjeto(v)) return null;
  const codigo = texto(v.codigo);
  const nombre = texto(v.nombre);
  return codigo && nombre ? { codigo, nombre, hex: texto(v.hex), foto: texto(v.foto) } : null;
}

function piezaDeJson(v: unknown): PiezaLook | null {
  if (!esObjeto(v)) return null;
  const productoId = texto(v.producto_id);
  const nombre = texto(v.nombre);
  const posicion = numero(v.posicion);
  const color = colorDeJson(v.color);
  if (!productoId || !nombre || posicion === null || !color) return null;
  return {
    posicion,
    productoId,
    nombre,
    categoria: texto(v.categoria),
    prefijo: texto(v.prefijo),
    familia: texto(v.familia),
    color: { codigo: color.codigo, nombre: color.nombre, hex: color.hex },
    foto: texto(v.foto),
    seVe: v.se_ve === true,
  };
}

/** Un look como lo manda la base, o `null` si no trae ni su id, ni su nombre, ni su versión (no se dibuja a medias). */
export function lookDeJson(v: unknown): Look | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const nombre = texto(v.nombre);
  const version = numero(v.version);
  if (!id || !nombre || version === null) return null;
  const piezas = lista(v.piezas)
    .flatMap((p) => {
      const leida = piezaDeJson(p);
      return leida ? [leida] : [];
    })
    .sort((a, b) => a.posicion - b.posicion);
  return {
    id,
    nombre,
    frase: texto(v.frase),
    publicado: v.publicado === true,
    lugar: numero(v.lugar) ?? 0,
    version,
    piezasDelLook: numero(v.piezas_del_look) ?? piezas.length,
    faltan: Math.max(0, numero(v.faltan) ?? 0),
    seVe: v.se_ve === true,
    total: numero(v.total),
    desde: v.desde === true,
    actualizadoEn: texto(v.actualizado_en),
    actualizadoPor: texto(v.actualizado_por),
    piezas,
  };
}

function modeloDeJson(v: unknown): ModeloParaLook | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const nombre = texto(v.nombre);
  if (!id || !nombre) return null;
  const colores = lista(v.colores).flatMap((c) => {
    const leido = colorDeJson(c);
    return leido ? [leido] : [];
  });
  // Un modelo sin colores no se puede poner en un look (no hay en qué color mostrarlo).
  if (colores.length === 0) return null;
  return { id, nombre, categoria: texto(v.categoria), prefijo: texto(v.prefijo), familia: texto(v.familia), foto: texto(v.foto), colores };
}

/** Lo que devuelve `fn_vitrina_looks()`. Un dato raro deja la lista vacía, nunca la pantalla caída. Los looks, en su lugar. */
export function leerLooks(v: unknown): LecturaLooks {
  if (!esObjeto(v)) return { looks: [], modelos: [] };
  return {
    looks: lista(v.looks)
      .flatMap((l) => {
        const leido = lookDeJson(l);
        return leido ? [leido] : [];
      })
      .sort((a, b) => a.lugar - b.lugar),
    modelos: lista(v.modelos).flatMap((m) => {
      const leido = modeloDeJson(m);
      return leido ? [leido] : [];
    }),
  };
}

/* ---------------- En qué tiendas sale cada look (`fn_vitrina_looks_por_tienda`, 20261027204000) ---------------- */

// La web muestra un look solo si TODAS sus prendas, en su color, están a la venta y libres en la MISMA tienda (ADR-0468). Esto lee lo que la base
// dice de cada look en cada tienda de la web, con la misma regla que la tienda, para que el ERP no diga «se ve» donde la web dice que no.

/** Por qué una prenda no cuenta en una tienda: no está en su catálogo, no hay stock, o hay una talla libre pero no es de las que la web ofrece. */
export type MotivoFalta = "no_se_ve" | "sin_stock" | "no_ofrecida";
export type PiezaEnTienda = { productoId: string; color: string; hay: boolean; motivo: MotivoFalta | null };
/** Un look en una tienda: `completo` si todas sus prendas cuentan ahí (y entonces sale en la tienda online de esa tienda). */
export type LookEnTienda = { sede: string; tienda: string; completo: boolean; faltan: number; piezas: PiezaEnTienda[] };
/** Los looks por tienda, por id de look. Un objeto plano (pasa del servidor a la pantalla). */
export type LooksPorTienda = Record<string, LookEnTienda[]>;

const MOTIVOS: readonly MotivoFalta[] = ["no_se_ve", "sin_stock", "no_ofrecida"];

function piezaEnTiendaDeJson(v: unknown): PiezaEnTienda | null {
  if (!esObjeto(v)) return null;
  const productoId = texto(v.producto_id);
  const color = texto(v.color);
  if (!productoId || !color) return null;
  const hay = v.hay === true;
  const motivo = MOTIVOS.find((m) => m === v.motivo) ?? null;
  // Sin motivo no hay falta, y una falta sin motivo conocido se dice como «sin stock» (lo más común), nunca como si hubiera.
  return { productoId, color, hay, motivo: hay ? null : (motivo ?? "sin_stock") };
}

/** Lo que devuelve `fn_vitrina_looks_por_tienda()`. Un dato raro deja ese look (o todo) sin tiendas, nunca la pantalla caída. */
export function leerPorTienda(v: unknown): LooksPorTienda {
  const salida: LooksPorTienda = {};
  if (!esObjeto(v)) return salida;
  for (const l of lista(v.looks)) {
    if (!esObjeto(l)) continue;
    const id = texto(l.id);
    if (!id) continue;
    const tiendas = lista(l.por_tienda).flatMap((t) => {
      if (!esObjeto(t)) return [];
      const sede = texto(t.sede);
      const tienda = texto(t.tienda);
      if (!sede || !tienda) return [];
      const piezas = lista(t.piezas).flatMap((p) => {
        const leida = piezaEnTiendaDeJson(p);
        return leida ? [leida] : [];
      });
      // Lo que cuenta es lo de las prendas: «completo» y «faltan» se vuelven a sacar de ellas, así nunca se contradicen.
      const faltan = piezas.filter((p) => !p.hay).length;
      return [{ sede, tienda, completo: piezas.length > 0 && faltan === 0, faltan, piezas }];
    });
    salida[id] = tiendas;
  }
  return salida;
}

/** «Tienda AQP» → «AQP», «Tienda Trujillo» → «Trujillo»: lo corto que cabe en un chip. */
export const nombreCortoDeTienda = (nombre: string): string => nombre.replace(/^\s*tienda\s+/i, "").trim() || nombre;

/** Lo que dice cada motivo, en palabras de tienda. */
export const TEXTO_DEL_MOTIVO: Record<MotivoFalta, string> = {
  no_se_ve: "no está en el catálogo de esa tienda",
  sin_stock: "no hay stock",
  no_ofrecida: "hay stock, pero de una talla que la web no ofrece",
};

export type ChipDeTienda = { sede: string; texto: string; tono: "verde" | "ambar"; completo: boolean; detalle: string };

/**
 * Los chips de un look, uno por tienda de la web: verde si el look sale completo ahí; ámbar con cuántas prendas faltan. `detalle` (el texto que
 * sale al pasar el mouse) dice cuáles, por su nombre, y por qué.
 */
export function chipsDeLook(l: Pick<Look, "piezas">, tiendas: readonly LookEnTienda[]): ChipDeTienda[] {
  const nombreDe = (p: PiezaEnTienda) => l.piezas.find((x) => x.productoId === p.productoId && x.color.codigo === p.color)?.nombre ?? "Una prenda";
  return tiendas.map((t) => {
    const corto = nombreCortoDeTienda(t.tienda);
    if (t.completo) return { sede: t.sede, texto: corto, tono: "verde", completo: true, detalle: `El look sale en ${corto}: todas sus prendas están ahí.` };
    const faltantes = t.piezas.filter((p) => !p.hay).map((p) => `${nombreDe(p)} (${TEXTO_DEL_MOTIVO[p.motivo ?? "sin_stock"]})`);
    return {
      sede: t.sede,
      texto: `${corto} · falta ${t.faltan === 1 ? "1" : t.faltan}`,
      tono: "ambar",
      completo: false,
      detalle: `No sale en ${corto}. Falta: ${listaDeNombres(faltantes)}.`,
    };
  });
}

/* ---------------- Qué hay en cada tienda, para armar un look (`fn_vitrina_prendas_por_tienda`, 20261027204000) ---------------- */

// Al armar un look se ve en qué tiendas hay cada prenda: se puede filtrar «solo lo que hay en TRU» y, con lo elegido, avisar en vivo en qué tiendas saldría el look
// (Felipe 2026-10-27). Es un aviso, no un candado: se puede guardar un look aunque hoy no salga en ninguna tienda (el stock llega mañana). La regla de «hay» es la de la
// base, la misma que usa la tienda online: aquí solo se lee y se cruza.

export type TiendaWeb = { id: string; nombre: string };
/** En qué tiendas hay cada prenda en cada color. `en` va por la clave `producto|color`; una prenda que no está no hay en ninguna tienda. */
export type PrendasPorTienda = { tiendas: TiendaWeb[]; en: Record<string, string[]> };

export const clavePrenda = (productoId: string, color: string): string => `${productoId}|${color}`;
export const SIN_PRENDAS_POR_TIENDA: PrendasPorTienda = { tiendas: [], en: {} };

/** Lo que devuelve `fn_vitrina_prendas_por_tienda()`. Un dato raro deja todo vacío (el editor se ve igual, sin filtro ni aviso), nunca la hoja caída. */
export function leerPrendasPorTienda(v: unknown): PrendasPorTienda {
  if (!esObjeto(v)) return SIN_PRENDAS_POR_TIENDA;
  const tiendas = lista(v.tiendas).flatMap((t) => {
    if (!esObjeto(t)) return [];
    const id = texto(t.id);
    const nombre = texto(t.nombre);
    return id && nombre ? [{ id, nombre }] : [];
  });
  const en: Record<string, string[]> = {};
  for (const p of lista(v.prendas)) {
    if (!esObjeto(p)) continue;
    const productoId = texto(p.producto_id);
    const color = texto(p.color);
    if (!productoId || !color) continue;
    en[clavePrenda(productoId, color)] = lista(p.en).flatMap((e) => (typeof e === "string" && e ? [e] : []));
  }
  return { tiendas, en };
}

/** ¿Hay esa prenda en ese color en esa tienda? */
export const hayPrendaEnTienda = (d: PrendasPorTienda, productoId: string, color: string, sede: string): boolean => d.en[clavePrenda(productoId, color)]?.includes(sede) ?? false;

/** ¿Hay el modelo (en algún color) en esa tienda? Para filtrar la grilla de prendas. */
export const hayModeloEnTienda = (d: PrendasPorTienda, m: Pick<ModeloParaLook, "id" | "colores">, sede: string): boolean => m.colores.some((c) => hayPrendaEnTienda(d, m.id, c.codigo, sede));

export type SalidaEnTienda = { sede: string; nombre: string; completo: boolean; faltan: PiezaElegida[] };

/** Con las prendas elegidas, en qué tiendas saldría el look y qué le faltaría a cada una. Sin tiendas leídas, nada (no se sabe). */
export function salidaDelLook(d: PrendasPorTienda, piezas: readonly PiezaElegida[]): SalidaEnTienda[] {
  return d.tiendas.map((t) => {
    const faltan = piezas.filter((p) => !hayPrendaEnTienda(d, p.productoId, p.color, t.id));
    return { sede: t.id, nombre: nombreCortoDeTienda(t.nombre), completo: piezas.length > 0 && faltan.length === 0, faltan: [...faltan] };
  });
}

export type AvisoDelLook = { tono: "exito" | "atencion"; titulo: string; detalle: string | null };

/**
 * Lo que se le dice a quien arma el look, con lo elegido: nada hasta tener 2 prendas (con una no hay look) ni sin saber qué hay en las tiendas; verde si sale en alguna tienda (y,
 * si en otras no, cuál prenda les falta); ámbar si no saldría en ninguna (y qué le falta a cada una). Es un aviso: nunca impide guardar.
 */
export function avisoDelLook(salida: readonly SalidaEnTienda[], piezas: readonly PiezaElegida[], nombreDe: (p: PiezaElegida) => string): AvisoDelLook | null {
  if (piezas.length < MIN_PRENDAS_LOOK || salida.length === 0) return null;
  const falta = (s: SalidaEnTienda) => `${s.nombre}: falta ${listaDeNombres(s.faltan.map(nombreDe))}`;
  const donde = salida.filter((s) => s.completo);
  const sinSalir = salida.filter((s) => !s.completo);
  if (donde.length > 0) {
    return {
      tono: "exito",
      titulo: `Con estas prendas el look sale en ${listaDeNombres(donde.map((s) => s.nombre))}.`,
      detalle: sinSalir.length > 0 ? `No sale en ${sinSalir.map(falta).join("; ")}.` : null,
    };
  }
  return { tono: "atencion", titulo: "Con estas prendas el look no saldría en ninguna tienda.", detalle: `${salida.map(falta).join("; ")}.` };
}

/* ---------------- Lo que dice cada fila ---------------- */

/** «S/ 304.70»: con un espacio que no se parte, para que «S/» no quede sola al final de un renglón (ADR-0413). */
export const solesLook = (n: number): string =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «3 prendas · S/ 304.70» (o «desde S/ …» si una campaña no toca todas sus tallas); sin total si alguna prenda no se ve. */
export function resumenLook(l: Pick<Look, "piezasDelLook" | "total" | "desde">): string {
  const prendas = `${l.piezasDelLook} ${l.piezasDelLook === 1 ? "prenda" : "prendas"}`;
  if (l.total === null) return prendas;
  return `${prendas} · ${l.desde ? "desde " : ""}${solesLook(l.total)}`;
}

/** Los nombres en una frase: «Blusa Emma», «Blusa Emma y Falda Renata», «Blusa Emma, Falda Renata y Vestido Sofía». */
export function listaDeNombres(nombres: readonly string[]): string {
  return new Intl.ListFormat("es", { type: "conjunction" }).format(nombres);
}

/**
 * Lo que impide que un look salga en la tienda, esté encendido o no (lo mismo que `vitrina_mostrar_look` rechazaría), en una frase;
 * `null` si nada. Primero lo que falta del todo (una prenda eliminada del catálogo), después las que dejaron de verse en la web.
 */
export function loQueImpideMostrar(l: Look): string | null {
  if (l.faltan > 0) {
    return l.faltan === 1 ? "Le falta una prenda: se eliminó del catálogo. Ábrelo y elige otra." : `Le faltan ${l.faltan} prendas: se eliminaron del catálogo. Ábrelo y elige otras.`;
  }
  const ocultas = l.piezas.filter((p) => !p.seVe).map((p) => p.nombre);
  if (ocultas.length === 0) return null;
  return `${listaDeNombres(ocultas)} ${ocultas.length === 1 ? "ya no se ve" : "ya no se ven"} en la web. Muéstralo en Modelos o cámbialo en el look.`;
}

/** Por qué un look ENCENDIDO no se ve en la tienda; `null` si se ve (o si está oculto: eso ya lo dice su interruptor). */
export function porQueNoSeVe(l: Look): string | null {
  if (!l.publicado || l.seVe) return null;
  return loQueImpideMostrar(l) ?? "No se ve en la web: recarga la pantalla.";
}

/** El estado de un look para su insignia: se ve, oculto o encendido pero sin verse (algo falta). */
export type EstadoLook = "se_ve" | "oculto" | "no_se_ve";
export const estadoDeLook = (l: Look): EstadoLook => (l.seVe ? "se_ve" : l.publicado ? "no_se_ve" : "oculto");

/* ---------------- Cifras y filtro ---------------- */

export type CifrasLooks = { seVen: number; total: number; noSeVen: number };

export function cifrasLooks(looks: readonly Look[]): CifrasLooks {
  return {
    seVen: looks.filter((l) => l.seVe).length,
    total: looks.length,
    noSeVen: looks.filter((l) => estadoDeLook(l) === "no_se_ve").length,
  };
}

export type FiltroLooks = "todos" | "en_la_web" | "no_se_ven";

export function filtrarLooks(looks: readonly Look[], filtro: FiltroLooks): Look[] {
  if (filtro === "en_la_web") return looks.filter((l) => l.seVe);
  if (filtro === "no_se_ven") return looks.filter((l) => estadoDeLook(l) === "no_se_ve");
  return [...looks];
}

/* ---------------- La hoja de un look ---------------- */

/** Una prenda elegida en la hoja: el modelo y su color. */
export type PiezaElegida = { productoId: string; color: string };

/** El color con que entra un modelo al look: el primero con foto propia (se ve mejor en la lámina) o, si ninguno tiene, el primero. */
export function colorInicial(m: ModeloParaLook): string {
  return (m.colores.find((c) => c.foto) ?? m.colores[0]).codigo;
}

/* ---------------- Elegir las prendas mirándolas (Felipe 2026-10-26) ---------------- */

/** Cuántas prendas se dibujan por página en el selector de la hoja del look: con ~300 modelos, todas juntas serían 300 fotos. */
export const PRENDAS_POR_PAGINA_LOOK = 24;
/** Cómo se llama lo que no tiene categoría en el selector. */
export const SIN_CATEGORIA_LOOK = "Sin categoría";

export type CategoriaParaLook = { nombre: string; modelos: number };

/** Las categorías de los modelos que se pueden elegir, con cuántos hay en cada una: por nombre, y «Sin categoría» al final. */
export function categoriasParaLook(modelos: readonly ModeloParaLook[]): CategoriaParaLook[] {
  const cuenta = new Map<string, number>();
  for (const m of modelos) {
    const c = m.categoria ?? SIN_CATEGORIA_LOOK;
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return [...cuenta]
    .map(([nombre, n]) => ({ nombre, modelos: n }))
    .sort((a, b) => (a.nombre === SIN_CATEGORIA_LOOK ? 1 : b.nombre === SIN_CATEGORIA_LOOK ? -1 : a.nombre.localeCompare(b.nombre, "es")));
}

/** Los modelos del selector: los de la categoría elegida (`null`: todas) cuyo nombre o categoría lleva lo escrito (sin tildes ni mayúsculas). Conserva el orden. */
export function modelosParaElegir(modelos: readonly ModeloParaLook[], filtro: { categoria: string | null; texto: string }): ModeloParaLook[] {
  const buscado = normalizarBusqueda(filtro.texto);
  return modelos.filter((m) => {
    if (filtro.categoria !== null && (m.categoria ?? SIN_CATEGORIA_LOOK) !== filtro.categoria) return false;
    return buscado === "" || normalizarBusqueda(`${m.nombre} ${m.categoria ?? ""}`).includes(buscado);
  });
}

/** Las prendas de un look ya guardado, como se eligen en la hoja. */
export const piezasElegidasDe = (l: Look): PiezaElegida[] => l.piezas.map((p) => ({ productoId: p.productoId, color: p.color.codigo }));

/**
 * Las prendas elegidas que NO se ven en la web en su color (para mostrar el look, la base las rechaza): un modelo que ya no está entre los
 * que se ven, o un color que ese modelo ya no muestra. Devuelve sus nombres, en el orden del look.
 */
export function prendasQueNoSeVen(elegidas: readonly PiezaElegida[], modelos: readonly ModeloParaLook[], nombres: ReadonlyMap<string, string>): string[] {
  const porId = new Map(modelos.map((m) => [m.id, m]));
  return elegidas
    .filter((p) => !porId.get(p.productoId)?.colores.some((c) => c.codigo === p.color))
    .map((p) => porId.get(p.productoId)?.nombre ?? nombres.get(p.productoId) ?? "Una prenda");
}

/** El nombre como lo guarda la base: sin espacios de más. */
export const nombreLimpio = (s: string): string => s.replace(/\s+/g, " ").trim();
/** La frase como la guarda la base: sin espacios de más, y vacía = sin frase. */
export const fraseLimpia = (s: string): string | null => nombreLimpio(s) || null;

/** «1.º (el primero)», «2.º», …, «4.º (el último)»: los lugares que puede ocupar el look (con él incluido). */
export function opcionesDeLugar(cuantos: number): { valor: string; texto: string }[] {
  const n = Math.max(1, cuantos);
  return Array.from({ length: n }, (_, i) => {
    const lugar = i + 1;
    const extra = n === 1 ? "" : lugar === 1 ? " (el primero)" : lugar === n ? " (el último)" : "";
    return { valor: String(lugar), texto: `${lugar}.º${extra}` };
  });
}

/** Lo que se manda como `p_lugar`: solo si la persona lo cambió (si no, `null` = donde está; así una hoja abierta hace rato no lo
 *  devuelve a un lugar viejo). Un look nuevo que se deja al final también va `null`. */
export function lugarParaGuardar(elegido: number, inicial: number): number | null {
  return elegido === inicial ? null : elegido;
}

/** Lo que se manda como `p_piezas`. */
export const piezasParaGuardar = (elegidas: readonly PiezaElegida[]) => elegidas.map((p) => ({ producto_id: p.productoId, color: p.color }));

/** ¿Cambió algo respecto de lo guardado? (Si no, «Guardar» solo cierra.) */
export function lookSinCambios(
  l: Look | null,
  h: { nombre: string; frase: string; publicado: boolean; piezas: readonly PiezaElegida[]; lugar: number },
): boolean {
  if (!l) return false;
  const antes = piezasElegidasDe(l);
  return (
    nombreLimpio(h.nombre) === l.nombre &&
    fraseLimpia(h.frase) === (l.frase ?? null) &&
    h.publicado === l.publicado &&
    h.lugar === l.lugar &&
    antes.length === h.piezas.length &&
    antes.every((p, i) => p.productoId === h.piezas[i]?.productoId && p.color === h.piezas[i]?.color)
  );
}

/* ---------------- Lo que dice la base ---------------- */

/** Los rechazos de los looks en palabras de tienda; `releer`: la pantalla está vieja y conviene recargar. `null` si no es de aquí. */
export function errorDeLook(mensaje: string): { titulo: string; detalle?: string; releer?: boolean } | null {
  const detalle = mensaje.replace(/^[\s\S]*?vitrina_[a-z_]+\s*/, "").trim() || undefined;
  if (/vitrina_web_sin_modulo/.test(mensaje)) return { titulo: "Tu rol no tiene la Vitrina web", detalle: "Pídele al líder que la active en Roles y accesos." };
  if (/vitrina_look_cambio_otro/.test(mensaje)) return { titulo: "Otra persona cambió este look", detalle, releer: true };
  if (/vitrina_look_no_existe/.test(mensaje)) return { titulo: "Ese look ya no existe", detalle, releer: true };
  if (/vitrina_look_nombre_repetido/.test(mensaje)) return { titulo: "Ese nombre ya lo tiene otro look", detalle };
  if (/vitrina_look_prenda_no_se_ve/.test(mensaje)) return { titulo: "Una prenda no se ve en la web", detalle, releer: true };
  if (/vitrina_look_incompleto/.test(mensaje)) return { titulo: "Al look le falta una prenda", detalle, releer: true };
  if (/vitrina_look_prenda_no_existe|vitrina_look_prenda_invalida/.test(mensaje)) return { titulo: "Una prenda ya no se puede usar", detalle, releer: true };
  if (/vitrina_look_datos_invalidos/.test(mensaje)) return { titulo: "Revisa los datos del look", detalle };
  return null;
}
