// Reglas puras del Inicio de una cuenta de Almacén (Felipe, 2026-09-30; maqueta docs/maquetas/inicio-almacen-2026-09/).
// Sin Supabase ni React: se prueban en `inicio-almacen-reglas.test.ts` y las importan la página (servidor) y los
// componentes de `components/inicio-almacen/` (cliente).

import { porColgarDeLaSede } from "./existencias-para-hoy";
import { urlBajarAlPiso, type FilaPrenda } from "./existencias-prendas";
import type { Aviso, AvisosVisibles, FuentesAvisos } from "./inicio-avisos";
import { fotoPrincipal, type FotoCruda } from "./inventario-reglas";
import type { ClaveModulo } from "./modulos";
import { TIENDAS } from "./terminales-reglas";

// ── ¿Es la cuenta de un almacén? ─────────────────────────────────────────────────────────────────

/**
 * La cuenta de almacén es la que RECIBE y REGISTRA mercadería pero no vende: ve Recibir (o Traslados), puede crear productos
 * (`editarCatalogo`: el botón «Crear producto» es el centro de su Inicio) y no ve el Punto de venta. Se decide por lo que su
 * rol VE y PUEDE (ADR-0161) y no por el tipo de ubicación: la terminal «Almacén Trujillo» vive en una TIENDA
 * (`ubicacionTipo = "tienda"`) y aun así es de almacén. El Taller tiene su propio Inicio.
 */
export function esPerfilAlmacen(perfil: {
  ubicacionTipo: "tienda" | "almacen" | "taller";
  modulos: readonly ClaveModulo[];
  puedeEditarCatalogo: boolean;
}): boolean {
  if (perfil.ubicacionTipo === "taller") return false;
  const ve = (m: ClaveModulo) => perfil.modulos.includes(m);
  return !ve("vender") && ve("productos") && perfil.puedeEditarCatalogo && (ve("recibir") || ve("traslados"));
}

// ── «Nuevo en otras sedes»: los productos dados de alta hoy y ayer ───────────────────────────────

export type NuevoProducto = {
  id: string;
  codigo: string | null;
  referencia: string;
  creadoEn: string;
  /** El día de Lima en que se dio de alta: «hoy» o «ayer». */
  dia: "hoy" | "ayer";
  /** «hace 2 h» o «ayer, 6:40 p. m.» */
  hace: string;
  /** El precio de lista más bajo de sus variantes; `null` si ninguna tiene precio. */
  precio: number | null;
  /** Los colores de sus variantes, sin repetir. */
  colores: { nombre: string; hex: string | null }[];
  fotoUrl: string | null;
  /** Su categoría, para dibujar el producto sin foto con su ícono (`SinFoto`, ADR-0333). */
  categoria?: string | null;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  /** Lo que se puede vender de este producto en la sede de quien mira (`fn_existencias_productos`, la misma cifra que
   *  Existencias y el Catálogo: ADR-0270). `null` = no se pudo leer: la tarjeta no dice nada en vez de decir «0». */
  enMiSede: number | null;
  /** Quién lo dio de alta (`productos.propuesto_por`), solo el nombre de pila. `null` = no se sabe. */
  quien: string | null;
  /** En qué sede se registró, en corto: «TRU», «AQP», «Taller» (`etiquetaSedeDeOrigen`). `null` = no se sabe: los productos
   *  anteriores a `producto_origen` no la tienen y no se les inventa una (ADR-0292). El catálogo es UNO para todas las sedes:
   *  esto solo dice desde dónde se dio de alta, no de quién es. */
  sede: string | null;
  /** El nombre completo de esa sede («Tienda Trujillo»), para el texto de ayuda al pasar el mouse. */
  sedeNombre: string | null;
  /** ¿Se registró en la sede de quien mira? Cambia cómo se pinta la sigla y lo que dicen los chips. */
  propia: boolean;
};

/**
 * El color con el que se dibuja un PRODUCTO sin foto (`SinFoto`, ADR-0333): el de su único color. Con varios no hay uno que decir: pintar
 * el primero afirmaría que el producto es de ese color, y «Nuevo en el catálogo» sirve justo para reconocer una prenda por su diseño,
 * así que cae al tono de su familia (mismo criterio de `TarjetaParecida`: nunca un dato que la prenda no tiene). `null` si no hay
 * colores, o su único color no es un color (Estampado, Multicolor).
 */
export function colorUnico(colores: readonly { hex: string | null }[]): string | null {
  return colores.length === 1 ? colores[0].hex : null;
}

/** Lo que dice `fn_producto_origen` de un producto: la sede desde la que se registró (`null` = se sabe que se registró, no dónde). */
export type OrigenDeProducto = { ubicacionId: string | null; nombre: string | null };

/** Lo que devuelve la lectura de `productos` recientes (el `select` de `getNuevosDelCatalogo`). */
export type FilaNuevoCruda = {
  id: string;
  codigo: string | null;
  referencia: string;
  created_at: string;
  propuesto_por: string | null;
  /** Su categoría (opcional: una lectura que no la pidió dibuja la percha). */
  categoria?: { nombre: string; prefijo: string | null; familia: string | null } | null;
  producto_fotos: FotoCruda[] | null;
  variantes:
    | {
        id: string;
        precio: number | string | null;
        activo: boolean;
        color: { nombre: string; hex: string | null } | null;
      }[]
    | null;
};

const LIMA = "America/Lima";
const fechaLima = new Intl.DateTimeFormat("en-CA", { timeZone: LIMA });
const horaLima = new Intl.DateTimeFormat("es-PE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: LIMA });

/** Cuándo se abre la ventana de «hoy y ayer»: la medianoche de Lima de AYER (UTC−5 fijo, como `nombreDiaLima`), en ISO. */
export function inicioDeAyerLima(ahoraMs: number): string {
  const hoy = fechaLima.format(new Date(ahoraMs));
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  return new Date(`${ayer.toISOString().slice(0, 10)}T05:00:00Z`).toISOString();
}

/** «hace 5 min», «hace 2 h» (mismo día de Lima) o «ayer, 6:40 p. m.». */
export function etiquetaHace(creadoIso: string, ahoraMs: number): { dia: "hoy" | "ayer"; hace: string } {
  const creado = new Date(creadoIso);
  const mismoDia = fechaLima.format(creado) === fechaLima.format(new Date(ahoraMs));
  if (!mismoDia) return { dia: "ayer", hace: `ayer, ${horaLima.format(creado)}` };
  const min = Math.max(0, Math.floor((ahoraMs - creado.getTime()) / 60000));
  if (min < 1) return { dia: "hoy", hace: "hace un momento" };
  if (min < 60) return { dia: "hoy", hace: `hace ${min} min` };
  return { dia: "hoy", hace: `hace ${Math.floor(min / 60)} h` };
}

/** El nombre de pila de «nombres apellidos» (lo que devuelve `fn_nombres_personas`): «Rosa María Vega» → «Rosa». */
export function nombreDePila(completo: string | null | undefined): string | null {
  const t = (completo ?? "").trim().split(/\s+/)[0];
  return t ? t : null;
}

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** «TRU», «AQP» o «LIM» si el nombre de la sede lo dice (por sigla o por ciudad: producción dice «Tienda TRU» y el Postgres
 *  local «Tienda Trujillo»); `null` si es otra. La misma regla de las terminales (`TIENDAS`). */
function codigoDeCiudad(nombre: string): "TRU" | "AQP" | "LIM" | null {
  const palabras = sinTildes(nombre).split(/[^a-z0-9]+/).filter(Boolean);
  for (const [codigo, claves] of Object.entries(TIENDAS)) {
    if (claves.some((c) => palabras.includes(c))) return codigo as "TRU" | "AQP" | "LIM";
  }
  return null;
}

/** Cómo se rotula la sede de origen: «TRU»/«AQP»/«LIM» para las tiendas; para otra, su nombre sin «Tienda» («Taller»). */
export function etiquetaSedeDeOrigen(nombre: string): string {
  return codigoDeCiudad(nombre) ?? (nombre.trim().replace(/^tienda\s+/i, "") || nombre.trim());
}

/** Uno de tres tonos para el punto de la sigla, siempre el mismo para la misma sede (no depende del orden de la lista). */
export function tonoDeSede(etiqueta: string): 0 | 1 | 2 {
  return ([...etiqueta].reduce((n, c) => n + c.charCodeAt(0), 0) % 3) as 0 | 1 | 2;
}

/**
 * @param aqui cuánto hay de cada producto en esta sede (`producto_id` → unidades), o `null` si no se pudo leer.
 * @param origen la sede de registro de cada producto (`fn_producto_origen`) y la sede de quien mira; sin él, o con `porProducto`
 *   en `null` (la función no responde o todavía no está en la base), `sede` llega `null` y la pantalla no muestra sigla.
 */
export function armarNuevos(
  filas: readonly FilaNuevoCruda[],
  nombres: ReadonlyMap<string, string>,
  aqui: ReadonlyMap<string, number> | null,
  ahoraMs: number,
  origen?: { porProducto: ReadonlyMap<string, OrigenDeProducto> | null; miUbicacionId: string }
): NuevoProducto[] {
  return [...filas]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((f) => {
      const vars = (f.variantes ?? []).filter((v) => v.activo);
      const precios = vars.map((v) => Number(v.precio)).filter((p) => Number.isFinite(p) && p > 0);
      const colores: NuevoProducto["colores"] = [];
      for (const v of vars) {
        if (!v.color) continue;
        if (!colores.some((c) => c.nombre === v.color!.nombre)) colores.push({ nombre: v.color.nombre, hex: v.color.hex });
      }
      const dondeSeRegistro = origen?.porProducto?.get(f.id) ?? null;
      const nombreSede = dondeSeRegistro?.nombre?.trim() || null;
      return {
        id: f.id,
        codigo: f.codigo,
        referencia: f.referencia,
        creadoEn: f.created_at,
        ...etiquetaHace(f.created_at, ahoraMs),
        precio: precios.length ? Math.min(...precios) : null,
        colores,
        fotoUrl: fotoPrincipal(f.producto_fotos),
        categoria: f.categoria?.nombre ?? null,
        categoriaPrefijo: f.categoria?.prefijo ?? null,
        categoriaFamilia: f.categoria?.familia ?? null,
        enMiSede: aqui === null ? null : (aqui.get(f.id) ?? 0),
        quien: nombreDePila(f.propuesto_por ? nombres.get(f.propuesto_por) : null),
        sede: nombreSede ? etiquetaSedeDeOrigen(nombreSede) : null,
        sedeNombre: nombreSede,
        propia: !!dondeSeRegistro?.ubicacionId && dondeSeRegistro.ubicacionId === origen?.miUbicacionId,
      };
    });
}

/** El catálogo es UNO para todas las sedes (solo cambia el inventario): la sección nunca dice «de otras sedes», dice qué se
 *  registró y, en cada producto, desde qué sede (ADR-0292). */
export const TITULO_NUEVOS = { seccion: "Nuevo en el catálogo", lista: "Lo último registrado" } as const;

/** La frase de ayuda bajo el título; suma la explicación de la sigla solo cuando algún producto la trae. */
export function ayudaNuevos(items: readonly NuevoProducto[]): string {
  const base = "¿Te llegó una prenda sin etiqueta? Mira aquí si ya la registraron antes de crear otra.";
  return items.some((p) => p.sede !== null) ? `${base} La sigla dice en qué sede se registró; el catálogo es el mismo en todas.` : base;
}

/** «todas», «sinfoto» o el nombre de una sede. */
export type FiltroNuevos = string;

export function filtrarNuevos(items: readonly NuevoProducto[], filtro: FiltroNuevos): NuevoProducto[] {
  if (filtro === "todas") return [...items];
  if (filtro === "sinfoto") return items.filter((p) => !p.fotoUrl);
  return items.filter((p) => p.sede === filtro);
}

/** Los chips de filtro: «Todas» y «Sin foto» siempre; una por sede de registro solo cuando se conoce (la de quien mira dice «tu sede»). */
export function chipsNuevos(items: readonly NuevoProducto[]): { clave: FiltroNuevos; etiqueta: string; cuenta: number }[] {
  const sedes = [...new Set(items.map((p) => p.sede).filter((s): s is string => s !== null))].sort((a, b) => a.localeCompare(b, "es"));
  const esMia = (s: string) => items.some((p) => p.sede === s && p.propia);
  return [
    { clave: "todas", etiqueta: "Todas", cuenta: items.length },
    ...sedes.map((s) => ({ clave: s, etiqueta: esMia(s) ? `${s} · tu sede` : s, cuenta: filtrarNuevos(items, s).length })),
    { clave: "sinfoto", etiqueta: "Sin foto", cuenta: filtrarNuevos(items, "sinfoto").length },
  ];
}

/** La ficha de un producto: la pantalla que lo muestra y lo edita (`/productos/[id]/editar`). NO existe `/productos/[id]` a secas: la
 *  primera versión del Inicio de almacén enlazaba ahí y cada «Ver» caía en un 404 (Felipe, 2026-09-30). */
export function hrefFichaProducto(productoId: string): string {
  return `/productos/${productoId}/editar`;
}

/** La misma ficha, parada en su sección de fotos (`#fotos`, la misma que usa «Agregar fotos» al crear un producto). */
export function hrefFotosProducto(productoId: string): string {
  return `${hrefFichaProducto(productoId)}#fotos`;
}

/** «Ya hay 6 en tu sede» / «Aún sin stock en tu sede»; `null` (no se pudo leer) no dice nada. */
export function notaEnMiSede(unidades: number | null): string | null {
  if (unidades === null) return null;
  return unidades > 0 ? `Ya hay ${unidades} en tu sede` : "Aún sin stock en tu sede";
}

// ── «Te toca» y «Sigue ahora» ────────────────────────────────────────────────────────────────────

/**
 * En «Te toca» se ven `corte` filas y el resto queda tras «Ver N más». Lo que NO se pudo leer nunca queda detrás: una cola
 * sin leer no está «al día», así que ocupa un lugar visible y las tareas se acortan para dárselo.
 */
export function cortarTeToca<A extends Pick<Aviso, "nivel">>(activos: readonly A[], corte = 4): { visibles: A[]; extra: A[] } {
  const sinLeer = activos.filter((a) => a.nivel === "sinleer");
  const tareas = activos.filter((a) => a.nivel !== "sinleer");
  const cupo = Math.max(0, corte - sinLeer.length);
  return { visibles: [...tareas.slice(0, cupo), ...sinLeer], extra: tareas.slice(cupo) };
}

/** «Sigue ahora»: la primera tarea (lo urgente primero, como ya viene ordenada) y las tres siguientes. Una cola sin leer no es
 *  una tarea que se pueda empezar: no entra. */
export function sigueAhora<A extends Pick<Aviso, "nivel">>(activos: readonly A[]): { ahora: A | null; despues: A[] } {
  const tareas = activos.filter((a) => a.nivel !== "sinleer");
  return { ahora: tareas[0] ?? null, despues: tareas.slice(1, 4) };
}

/** El avance del día: cuántas colas están al día de las que se ven. Lo que no se pudo leer cuenta como pendiente. */
export function avanceDelDia(v: Pick<AvisosVisibles, "activos" | "alDia">): { alDia: number; total: number; pct: number } {
  const alDia = v.alDia.length;
  const total = alDia + v.activos.length;
  return { alDia, total, pct: total === 0 ? 100 : Math.round((alDia / total) * 100) };
}

// ── «En camino» ──────────────────────────────────────────────────────────────────────────────────

/** Cuánto del trayecto lleva un traslado, de 0 a 1: del envío a la hora estimada de llegada. Sin hora estimada no hay
 *  trayecto que medir: `null` (la pantalla no dibuja una barra inventada). */
export function avanceDelTrayecto(envioIso: string, llegadaIso: string | null, ahoraMs: number): number | null {
  if (!llegadaIso) return null;
  const desde = Date.parse(envioIso);
  const hasta = Date.parse(llegadaIso);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return null;
  return Math.min(1, Math.max(0, (ahoraMs - desde) / (hasta - desde)));
}

/** «llega ~4:30 p. m.» (hoy) o «llega mañana, 8:00 a. m.» / «llega el vie 2, …»; «llegó hace…» no: si ya pasó se dice «debió llegar». */
export function etiquetaLlegada(llegadaIso: string | null, ahoraMs: number): string | null {
  if (!llegadaIso) return null;
  const t = new Date(llegadaIso);
  if (Number.isNaN(t.getTime())) return null;
  const hoy = fechaLima.format(new Date(ahoraMs));
  const dia = fechaLima.format(t);
  const hora = horaLima.format(t);
  if (t.getTime() < ahoraMs) return dia === hoy ? `debió llegar ${hora}` : "debió llegar antes";
  if (dia === hoy) return `llega ~${hora}`;
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (dia === manana.toISOString().slice(0, 10)) return `llega mañana, ${hora}`;
  return `llega el ${new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", timeZone: LIMA }).format(t)}`;
}

/** La sigla de una sede para el trazo del viaje: «Tienda Trujillo» → «TRU», «Tienda Arequipa» → «AQP» (la misma regla que las terminales), «Taller» → «TAL». */
export function siglaSede(nombre: string): string {
  const ciudad = codigoDeCiudad(nombre);
  if (ciudad) return ciudad;
  const palabra = nombre.trim().split(/\s+/).pop() ?? "";
  return (palabra.length <= 3 ? palabra : palabra.slice(0, 3)).toUpperCase();
}

// ── Accesos ──────────────────────────────────────────────────────────────────────────────────────

export type AccesoDeAlmacen = {
  href: string;
  etiqueta: string;
  icono: "stock" | "traslados" | "truck" | "tag" | "conteo" | "scan";
  /** El botón oscuro de la fila (Escanear). */
  destacado?: boolean;
};

const ACCESOS_ALMACEN: (AccesoDeAlmacen & { modulo: ClaveModulo | null })[] = [
  { href: "/inventario", etiqueta: "Stock", icono: "stock", modulo: "existencias" },
  { href: "/inventario/traslados", etiqueta: "Traslados", icono: "traslados", modulo: "traslados" },
  { href: "/recibir", etiqueta: "Recibir", icono: "truck", modulo: "recibir" },
  // Etiquetas de precio no es de un módulo propio: se llega desde Existencias, así que la ve quien ve Existencias.
  { href: "/etiquetas-de-precio", etiqueta: "Etiquetas", icono: "tag", modulo: "existencias" },
  { href: "/inventario/conteo", etiqueta: "Conteo", icono: "conteo", modulo: "conteos" },
  // «Buscar» no pide módulo: es la puerta a escanear una prenda.
  { href: "/buscar", etiqueta: "Escanear", icono: "scan", modulo: null, destacado: true },
];

/** Los accesos de la cuenta de almacén: hasta seis, SOLO de módulos que ve (ADR-0161), así que ninguno lleva a «Sin acceso». */
export function accesosAlmacen(modulos: readonly ClaveModulo[]): AccesoDeAlmacen[] {
  return ACCESOS_ALMACEN.filter((a) => a.modulo === null || modulos.includes(a.modulo)).map((a) => ({ href: a.href, etiqueta: a.etiqueta, icono: a.icono, ...(a.destacado ? { destacado: true } : {}) }));
}

// ── «Por colgar»: lo que sale de las existencias de la sede ─────────────────────────────────────

export type PrendaPorColgar = {
  clave: string;
  referencia: string;
  color: string | null;
  colorHex?: string | null;
  fotoUrl: string | null;
  /** Su categoría, para dibujar la prenda sin foto con su ícono (`SinFoto`, ADR-0333). */
  categoria?: string | null;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  /** Sus tallas por colgar, en curva («Única» si el modelo no tiene talla). */
  tallas: string[];
};

export type Existencias = {
  /** Unidades libres en el almacén de la sede. `null` donde no se separa piso y almacén: ahí no hay nada por colgar. */
  enAlmacen: number | null;
  /** Lo mismo que cuenta «Para hoy» de Existencias: tallas por colgar, sus unidades guardadas y en cuántas prendas (modelo + color). */
  porColgar: { tallas: number; unidades: number; prendas: number };
  /** Las tres prendas que conviene colgar primero. */
  primeras: PrendaPorColgar[];
  /** «Colgar en el piso» con esas tallas ya en la lista: el mismo enlace que el botón de «Para hoy». */
  hrefBajar: string;
};

/**
 * De las existencias de la sede a lo que el Inicio de Almacén dice del piso. Cuenta con `porColgarDeLaSede`, la MISMA función que
 * arma la fila «por colgar» de «Para hoy» en Existencias (y el filtro «Hoy ▸ Por colgar»): el número del Inicio y el de la pantalla
 * a la que lleva no pueden discrepar. Lo prueba `inicio-almacen-reglas.test.ts` contra `tareasParaHoy`.
 *
 * Hasta el 2026-10-04 contaba MODELOS con alguna talla que pedía reponer: con el mínimo de 1 colgada por talla (umbral 0) eso
 * metía las tallas agotadas en la sede (piso 0 y nada atrás), y el Inicio decía «Sube N modelos al piso» con prendas que no
 * existían atrás. Las agotadas son «sin stock atrás»: se piden a otra sede, no se cuelgan.
 *
 * `stock` lleva «Acción hoy» (`accionHoy`) solo para armar el enlace de «Colgar en el piso» (`urlBajarAlPiso`), igual que Existencias.
 */
export function existenciasDeAlmacen<F extends FilaPrenda>(stock: readonly F[]): Existencias {
  if (!stock.some((f) => f.pisoDisponible !== null)) {
    return { enAlmacen: null, porColgar: { tallas: 0, unidades: 0, prendas: 0 }, primeras: [], hrefBajar: "/inventario/bajar" };
  }
  const p = porColgarDeLaSede(stock);
  return {
    enAlmacen: stock.reduce((s, f) => s + (f.almacenDisponible ?? 0), 0),
    porColgar: { tallas: p.tallas, unidades: p.unidades, prendas: p.prendas.length },
    primeras: p.prendas.slice(0, 3).map((x) => ({
      clave: x.clave,
      referencia: x.referencia,
      color: x.color,
      colorHex: x.colorHex,
      fotoUrl: x.fotoUrl,
      categoria: x.categoria ?? null,
      categoriaPrefijo: x.categoriaPrefijo ?? null,
      categoriaFamilia: x.categoriaFamilia ?? null,
      tallas: x.tallas.map((f) => f.talla ?? "Única"),
    })),
    hrefBajar: urlBajarAlPiso(p.filas) ?? "/inventario/bajar",
  };
}

// ── De lo leído a las fuentes de «Te toca» ───────────────────────────────────────────────────────

/**
 * Las colas nuevas de «Te toca» que salen de las lecturas del Inicio de Almacén. `undefined` = esa cola no es para esta cuenta
 * (no ve el módulo, o la sede no separa piso y almacén) y su aviso no existe; `null` = se intentó leer y falló («Sin leer»).
 */
export function fuentesDeAlmacen(d: {
  porRecibir?: { facturas: number; primera: string | null } | null;
  existencias?: Pick<Existencias, "enAlmacen" | "porColgar"> | null;
  fotos: { activos: number; conFoto: number } | null;
  porCompletar: number | null;
}): Pick<FuentesAvisos, "porRecibir" | "porColgar" | "fotosQueFaltan" | "porCompletar"> {
  return {
    porRecibir: d.porRecibir,
    porColgar: d.existencias === undefined ? undefined : d.existencias === null ? null : d.existencias.enAlmacen === null ? undefined : d.existencias.porColgar,
    fotosQueFaltan: d.fotos === null ? null : Math.max(0, d.fotos.activos - d.fotos.conFoto),
    porCompletar: d.porCompletar,
  };
}
