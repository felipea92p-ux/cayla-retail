/**
 * El historial de una prenda, dicho como lo lee la tienda (ADR-0354, maqueta A «Hilo del tiempo»). Puro: sin React ni supabase.
 *
 * EL PROBLEMA. La base guarda una fila por CAMPO y por VARIANTE (`historial_producto_cambios`): bajar el precio de una prenda
 * de 5 colores son 5 filas, y un «Confirmar y guardar» de la ficha son 2 o 3 llamadas seguidas (la ficha, sus etiquetas, su
 * temporada). Mostrar las filas tal cual es leer un registro técnico. Aquí se vuelven EVENTOS: un guardado de una persona =
 * una tarjeta («Lucía editó precio y descripción»), con cada cambio ya en palabras de tienda y el precio de 5 variantes dicho
 * una vez («en las 5 variantes»).
 *
 * LA REGLA DEL GUARDADO. Las filas de una misma persona (o de nadie) separadas por menos de `VENTANA_GUARDADO_MS` son el mismo
 * evento: la base anota cada llamada con su `now()`, y la ficha hace hasta tres llamadas por guardado. El nacimiento (`alta`)
 * siempre va solo.
 *
 * No agrega reglas de negocio: dice lo que la base ya anotó. Lo que la base no anota (antes de ADR-0354: etiquetas, variantes
 * nuevas, fotos de la ficha, tejido y patrón) no aparece, y la pantalla lo dice al pie.
 */

/** Una fila de `fn_historial_prenda` (20261006180000). */
export type FilaHistorial = {
  id: string;
  created_at: string;
  entidad: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  nombre_anterior: string | null;
  nombre_nuevo: string | null;
  hex_anterior: string | null;
  hex_nuevo: string | null;
  variante_id: string | null;
  variante_color: string | null;
  variante_hex: string | null;
  variante_talla: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_rol: string | null;
  usuario_sede: string | null;
  sede: string | null;
  campo_color: string | null;
  campo_hex: string | null;
};

export type Persona = { id: string; nombre: string; corto: string; iniciales: string; rol: string | null; sede: string | null };

/** Un color de la prenda: el color es DATO (ADR-0336) y no cambia con el tema. */
export type ColorDato = { nombre: string; hex: string | null };

/** Una variante nombrada como hoy («S · Negro»). */
export type VarianteRef = { color: string | null; hex: string | null; talla: string | null };

export type Familia = "precio" | "variantes" | "etiquetas" | "ficha" | "fotos" | "alta";

export type Cambio =
  | { k: "alta"; nombre: string; categoria: string | null; prefijo: string | null; familia: string | null; colores: ColorDato[]; tallas: string[]; variantes: number; precio: number | null }
  | { k: "precio" | "costo"; antes: number | null; despues: number | null; variantes: VarianteRef[]; declarado?: boolean }
  | { k: "texto"; campo: string; antes: string; despues: string; largo: boolean }
  | { k: "variantes+"; nuevas: (VarianteRef & { precio: number | null })[] }
  | { k: "color~"; antes: ColorDato; despues: ColorDato; variantes: number }
  | { k: "talla~"; antes: string; despues: string; variantes: number }
  | { k: "etiqueta"; nombre: string; puesta: boolean; variantes: VarianteRef[] }
  | { k: "foto"; agregadas: string[]; quitadas: number }
  | { k: "activo"; activadas: VarianteRef[]; desactivadas: VarianteRef[] }
  | { k: "codigo"; variantes: number }
  /** Precio propio de una tienda (Felipe 2026-10-09): `propio` = después del cambio la tienda tiene su precio; si no, volvió al
   *  general. `antesPropio` = ya tenía uno (entonces se CAMBIÓ). */
  | { k: "tienda"; tienda: string; antes: number | null; despues: number | null; propio: boolean; antesPropio: boolean; motivo: string | null; variantes: number };

export type Evento = {
  id: string;
  /** El momento de la primera fila del guardado (ISO). */
  cuando: string;
  /** `null` = nadie quedó anotado (se guardó en una terminal sin elegir responsable, antes de ADR-0354). */
  persona: Persona | null;
  /** Dónde se hizo (la sede de la operación); `null` en lo anotado antes de ADR-0354. */
  sede: string | null;
  familia: Familia;
  /** «bajó el precio», «editó precio y descripción»… (va después del nombre de la persona). */
  titulo: string;
  cambios: Cambio[];
};

/** Lo que la pantalla tiene del historial: leyendo, falló (se ofrece reintentar) o los eventos. */
export type LecturaHistorial = { estado: "leyendo" } | { estado: "error" } | { estado: "ok"; eventos: Evento[] };

export const VENTANA_GUARDADO_MS = 120_000;

export const FAMILIAS: { id: Exclude<Familia, "alta">; nombre: string }[] = [
  { id: "precio", nombre: "Precio" },
  { id: "variantes", nombre: "Colores y tallas" },
  { id: "etiquetas", nombre: "Etiquetas" },
  { id: "ficha", nombre: "Ficha" },
  { id: "fotos", nombre: "Fotos" },
];

// ---------- personas ----------

export function personaDe(f: Pick<FilaHistorial, "usuario_id" | "usuario_nombre" | "usuario_rol" | "usuario_sede">): Persona | null {
  if (!f.usuario_id) return null;
  const nombre = (f.usuario_nombre ?? "").trim() || "Una persona";
  const partes = nombre.split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[1]?.[0] ?? "") : "")).toUpperCase() || "·";
  return { id: f.usuario_id, nombre, corto: partes[0] ?? nombre, iniciales, rol: f.usuario_rol, sede: f.usuario_sede };
}

// ---------- palabras ----------

export const soles = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `S/ ${n.toFixed(2)}`);
const num = (v: string | null) => (v === null || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** «S · Negro», «Negro», «S». */
export function nombreVariante(v: VarianteRef): string {
  return [v.talla, v.color].filter(Boolean).join(" · ") || "una variante";
}

/** «en las 5 variantes», «en S · Negro y M · Negro», «en 4 de 9 variantes». */
export function alcance(variantes: readonly VarianteRef[], total: number): string {
  const n = variantes.length;
  if (n === 0) return "";
  if (total > 0 && n >= total) return total === 1 ? "en su única variante" : `en las ${total} variantes`;
  if (n <= 2) return `en ${variantes.map(nombreVariante).join(" y ")}`;
  return total > 0 ? `en ${n} de ${total} variantes` : `en ${n} variantes`;
}

function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** Los campos que se dicen como «antes → después» con palabras: nombre, descripción, categoría… El artículo va en el título. */
const CAMPOS_TEXTO: Record<string, { campo: string; articulo: "el" | "la"; vacio: string; ya: string }> = {
  referencia: { campo: "Nombre", articulo: "el", vacio: "Sin nombre", ya: "un nombre" },
  descripcion: { campo: "Descripción", articulo: "la", vacio: "Sin descripción", ya: "una descripción" },
  categoria_id: { campo: "Categoría", articulo: "la", vacio: "Sin categoría", ya: "una categoría que ya no está" },
  marca_id: { campo: "Marca", articulo: "la", vacio: "Sin marca", ya: "una marca que ya no está" },
  proveedor_id: { campo: "Proveedor", articulo: "el", vacio: "Sin proveedor", ya: "un proveedor que ya no está" },
  temporada: { campo: "Temporada", articulo: "la", vacio: "Sin temporada propia", ya: "una temporada que ya no está" },
  tejido_id: { campo: "Tejido", articulo: "el", vacio: "Sin tejido", ya: "un tejido que ya no está" },
  patron_id: { campo: "Patrón", articulo: "el", vacio: "Sin patrón", ya: "un patrón que ya no está" },
  estado: { campo: "Estado", articulo: "el", vacio: "—", ya: "—" },
};
const ESTADO: Record<string, string> = { activo: "Activa", descontinuado: "Descontinuada" };

function textoDe(campo: string, valor: string | null, nombre: string | null): string {
  const def = CAMPOS_TEXTO[campo];
  if (campo === "estado") return valor ? (ESTADO[valor] ?? valor) : "—";
  if (campo === "referencia" || campo === "descripcion") return valor?.trim() ? valor.trim() : def!.vacio;
  if (campo.startsWith("temporada:")) return nombre ?? (valor ? valor : "Igual que su prenda");
  if (!def) return nombre ?? valor ?? "—";
  if (!valor) return def.vacio;
  return nombre ?? (campo === "temporada" ? valor : def.ya);
}

// ---------- de filas a eventos ----------

const ref = (f: FilaHistorial): VarianteRef => ({ color: f.variante_color, hex: f.variante_hex, talla: f.variante_talla });

function parseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Los cambios de un guardado, agrupados: el mismo precio en 5 variantes es UN cambio. */
export function cambiosDe(filas: readonly FilaHistorial[]): Cambio[] {
  const out: Cambio[] = [];
  const porClave = new Map<string, FilaHistorial[]>();
  const orden: string[] = [];
  const meter = (clave: string, f: FilaHistorial) => {
    if (!porClave.has(clave)) {
      porClave.set(clave, []);
      orden.push(clave);
    }
    porClave.get(clave)!.push(f);
  };
  for (const f of filas) {
    const c = f.campo;
    if (c === "eliminado") continue;
    if (c === "precio" || c === "costo" || c === "costo_declarado") meter(`${c === "precio" ? "precio" : "costo"}|${f.valor_anterior}|${f.valor_nuevo}|${c}`, f);
    else if (c === "color" || c === "color_codigo") meter(`color|${f.valor_anterior}|${f.valor_nuevo}`, f);
    else if (c === "talla" || c === "talla_id") meter(`talla|${f.nombre_anterior ?? f.valor_anterior}|${f.nombre_nuevo ?? f.valor_nuevo}`, f);
    else if (c === "etiqueta") meter(`etiqueta|${f.valor_nuevo === null ? "quita" : "pone"}|${f.valor_anterior ?? f.valor_nuevo}`, f);
    else if (c === "variante_nueva") meter("variantes+", f);
    else if (c === "foto") meter("foto", f);
    else if (c === "activo") meter("activo", f);
    else if (c === "codigo") meter("codigo", f);
    else if (c === "precio_sede") meter(`tienda|${f.valor_anterior}|${f.valor_nuevo}`, f);
    else meter(`texto|${c}`, f);
  }
  for (const clave of orden) {
    const g = porClave.get(clave)!;
    const f = g[0]!;
    const tipo = clave.split("|")[0];
    if (tipo === "precio" || tipo === "costo") {
      out.push({ k: tipo, antes: num(f.valor_anterior), despues: num(f.valor_nuevo), variantes: g.filter((x) => x.variante_id).map(ref), ...(f.campo === "costo_declarado" ? { declarado: true } : {}) });
    } else if (tipo === "color") {
      out.push({
        k: "color~",
        antes: { nombre: f.nombre_anterior ?? f.valor_anterior ?? "Sin color", hex: f.hex_anterior },
        despues: { nombre: f.nombre_nuevo ?? f.valor_nuevo ?? "Sin color", hex: f.hex_nuevo },
        variantes: g.length,
      });
    } else if (tipo === "talla") {
      out.push({ k: "talla~", antes: f.nombre_anterior ?? f.valor_anterior ?? "Sin talla", despues: f.nombre_nuevo ?? f.valor_nuevo ?? "Sin talla", variantes: g.length });
    } else if (tipo === "etiqueta") {
      const puesta = f.valor_nuevo !== null;
      out.push({ k: "etiqueta", puesta, nombre: (puesta ? f.nombre_nuevo : f.nombre_anterior) ?? "una etiqueta que ya no está", variantes: g.map(ref) });
    } else if (tipo === "variantes+") {
      out.push({
        k: "variantes+",
        nuevas: g.map((x) => {
          const j = parseJson<{ talla?: string | null; precio?: number | null }>(x.valor_nuevo);
          return { color: x.nombre_nuevo ?? x.variante_color, hex: x.hex_nuevo ?? x.variante_hex, talla: j?.talla ?? x.variante_talla, precio: j?.precio ?? null };
        }),
      });
    } else if (tipo === "foto") {
      // `agregada` sin URL: lo que anotaba `agregar_foto_producto` antes de ADR-0354.
      const agregadas = g.filter((x) => x.valor_nuevo !== null && !/^quitad/i.test(x.valor_nuevo)).map((x) => (x.valor_nuevo === "agregada" ? "" : x.valor_nuevo!));
      out.push({ k: "foto", agregadas, quitadas: g.length - agregadas.length });
    } else if (tipo === "activo") {
      out.push({ k: "activo", activadas: g.filter((x) => x.valor_nuevo === "true").map(ref), desactivadas: g.filter((x) => x.valor_nuevo === "false").map(ref) });
    } else if (tipo === "codigo") {
      out.push({ k: "codigo", variantes: g.length });
    } else if (tipo === "tienda") {
      type V = { tienda?: string; precio?: number | string | null; propio?: boolean; motivo?: string };
      const a = parseJson<V>(f.valor_anterior) ?? {};
      const d = parseJson<V>(f.valor_nuevo) ?? {};
      out.push({
        k: "tienda",
        tienda: d.tienda ?? a.tienda ?? "una tienda",
        antes: a.precio === undefined || a.precio === null ? null : Number(a.precio),
        despues: d.precio === undefined || d.precio === null ? null : Number(d.precio),
        propio: d.propio === true,
        antesPropio: a.propio === true,
        motivo: d.motivo ?? null,
        variantes: g.length,
      });
    } else {
      const campo = f.campo;
      const etiqueta = campo.startsWith("temporada:") ? `Temporada de ${f.campo_color ?? campo.slice(10)}` : (CAMPOS_TEXTO[campo]?.campo ?? campo);
      const antes = textoDe(campo, f.valor_anterior, f.nombre_anterior);
      const despues = textoDe(campo, f.valor_nuevo, f.nombre_nuevo);
      out.push({ k: "texto", campo: etiqueta, antes, despues, largo: (antes + despues).length > 38 });
    }
  }
  return out;
}

/** El nacimiento, desde la fila `alta` de `fn_historial_prenda`. */
function cambioAlta(f: FilaHistorial): Cambio {
  const j = parseJson<{ nombre?: string; categoria?: string | null; prefijo?: string | null; familia?: string | null; colores?: ColorDato[]; tallas?: string[]; variantes?: number; precio?: number | null }>(f.valor_nuevo) ?? {};
  return {
    k: "alta",
    nombre: j.nombre ?? "La prenda",
    categoria: j.categoria ?? null,
    prefijo: j.prefijo ?? null,
    familia: j.familia ?? null,
    colores: j.colores ?? [],
    tallas: j.tallas ?? [],
    variantes: j.variantes ?? 0,
    precio: j.precio === undefined || j.precio === null ? null : Number(j.precio),
  };
}

/** De qué se trata el evento (el filtro y el color del nudo): el cambio más importante manda. */
export function familiaDe(cambios: readonly Cambio[]): Familia {
  const ks = new Set(cambios.map((c) => c.k));
  if (ks.has("alta")) return "alta";
  if (ks.has("precio") || ks.has("costo") || ks.has("tienda")) return "precio";
  if (ks.has("variantes+") || ks.has("color~") || ks.has("talla~") || ks.has("activo") || ks.has("codigo")) return "variantes";
  if (ks.has("etiqueta")) return "etiquetas";
  if (ks.has("texto")) return "ficha";
  return "fotos";
}

/** El nombre corto de un cambio dentro de «editó el precio y la descripción»; `n` = cuántos cambios de ese mismo tipo trae el
 *  guardado (dos tallas corregidas son «tallas», no «una talla»). */
function corto(c: Cambio, n = 1): string {
  switch (c.k) {
    case "precio": return "el precio";
    case "costo": return "el costo";
    case "texto": {
      if (c.campo.startsWith("Temporada de")) return "la temporada de un color";
      const def = Object.values(CAMPOS_TEXTO).find((d) => d.campo === c.campo);
      return `${def?.articulo ?? "el"} ${c.campo.toLowerCase()}`;
    }
    case "variantes+": return "variantes nuevas";
    case "color~": return n > 1 ? "colores" : "un color";
    case "talla~": return n > 1 ? "tallas" : "una talla";
    case "etiqueta": return "etiquetas";
    case "foto": return "fotos";
    case "activo": return "variantes activas";
    case "codigo": return "códigos";
    case "tienda": return n > 1 ? "el precio de varias tiendas" : `el precio de ${c.tienda}`;
    default: return "";
  }
}

/** «bajó el precio», «puso la etiqueta «Oferta»», «editó el precio y la descripción»… */
export function tituloDe(cambios: readonly Cambio[]): string {
  if (cambios.length === 0) return "guardó la ficha sin cambios";
  if (cambios.some((c) => c.k === "alta")) return "creó la prenda";
  const tipos = new Set(cambios.map((c) => c.k));
  if (tipos.size === 1) {
    const c = cambios[0]!;
    switch (c.k) {
      case "precio": {
        const sube = cambios.every((x) => x.k === "precio" && x.antes !== null && x.despues !== null && x.despues > x.antes);
        const baja = cambios.every((x) => x.k === "precio" && x.antes !== null && x.despues !== null && x.despues < x.antes);
        return baja ? "bajó el precio" : sube ? "subió el precio" : "cambió el precio";
      }
      case "costo": return c.declarado ? "declaró el costo" : "corrigió el costo";
      case "texto": {
        if (cambios.length > 1) return `editó ${enumerar(cortos(cambios))}`;
        if (c.campo === "Estado") return c.despues === "Descontinuada" ? "la descontinuó" : "la reactivó";
        if (c.campo.startsWith("Temporada de")) return `cambió la temporada de ${c.campo.slice(13)}`;
        const def = Object.values(CAMPOS_TEXTO).find((d) => d.campo === c.campo);
        if (def && c.antes === def.vacio) return `le puso ${def.articulo === "el" ? "un" : "una"} ${c.campo.toLowerCase()}`;
        return `cambió ${def?.articulo ?? "el"} ${c.campo.toLowerCase()}`;
      }
      case "variantes+": {
        const colores = new Set(c.nuevas.map((v) => v.color ?? ""));
        if (c.nuevas.length === 1) return `agregó ${nombreVariante(c.nuevas[0]!)}`;
        return colores.size > 1 ? `agregó ${colores.size} colores` : `agregó ${c.nuevas.length} tallas`;
      }
      case "color~": return cambios.length > 1 ? "corrigió colores" : "corrigió un color";
      case "talla~": return cambios.length > 1 ? "corrigió tallas" : "corrigió una talla";
      case "etiqueta": {
        if (cambios.length > 1) return "cambió sus etiquetas";
        return c.puesta ? `puso la etiqueta «${c.nombre}»` : `quitó la etiqueta «${c.nombre}»`;
      }
      case "foto": {
        if (c.agregadas.length && c.quitadas) return "cambió sus fotos";
        if (c.quitadas) return c.quitadas === 1 ? "quitó una foto" : `quitó ${c.quitadas} fotos`;
        return c.agregadas.length === 1 ? "subió una foto" : `subió ${c.agregadas.length} fotos`;
      }
      case "activo": {
        if (c.activadas.length && c.desactivadas.length) return "activó y desactivó variantes";
        const n = c.activadas.length || c.desactivadas.length;
        return `${c.activadas.length ? "activó" : "desactivó"} ${n === 1 ? "una variante" : `${n} variantes`}`;
      }
      case "codigo": return "recalculó códigos";
      case "tienda": {
        if (cambios.length > 1) {
          const tiendas = new Set(cambios.map((x) => (x.k === "tienda" ? x.tienda : "")));
          return tiendas.size === 1 ? `cambió el precio de ${c.tienda}` : "cambió el precio de varias tiendas";
        }
        if (!c.propio) return `quitó el precio propio de ${c.tienda}`;
        return c.antesPropio ? `cambió el precio de ${c.tienda}` : `puso precio propio en ${c.tienda}`;
      }
    }
  }
  return `editó ${enumerar(cortos(cambios))}`;
}

/** Los nombres cortos de un guardado, uno por tipo de cambio y en el orden en que aparecen. */
function cortos(cambios: readonly Cambio[]): string[] {
  const clave = (c: Cambio) => (c.k === "texto" ? `texto:${c.campo}` : c.k);
  const cuenta = new Map<string, number>();
  for (const c of cambios) cuenta.set(clave(c), (cuenta.get(clave(c)) ?? 0) + 1);
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const c of cambios) {
    const k = clave(c);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(corto(c, cuenta.get(k)));
  }
  return [...new Set(out)];
}

/**
 * De las filas de `fn_historial_prenda` a eventos, del más reciente al más viejo. Un guardado = las filas de la misma persona
 * (o de nadie) a menos de `VENTANA_GUARDADO_MS` una de otra; el nacimiento, siempre aparte.
 */
export function armarEventos(filas: readonly FilaHistorial[]): Evento[] {
  const ordenadas = [...filas].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const grupos: FilaHistorial[][] = [];
  for (const f of ordenadas) {
    const g = grupos[grupos.length - 1];
    const ultima = g?.[g.length - 1];
    const mismo =
      g &&
      ultima &&
      f.campo !== "alta" &&
      ultima.campo !== "alta" &&
      (f.usuario_id ?? "") === (ultima.usuario_id ?? "") &&
      Date.parse(f.created_at) - Date.parse(ultima.created_at) <= VENTANA_GUARDADO_MS;
    if (mismo) g.push(f);
    else grupos.push([f]);
  }
  const eventos: Evento[] = [];
  for (const g of grupos) {
    const f = g[0]!;
    const cambios = f.campo === "alta" ? [cambioAlta(f)] : cambiosDe(g);
    if (cambios.length === 0) continue;
    eventos.push({
      id: f.id,
      cuando: f.created_at,
      persona: personaDe(f),
      sede: g.find((x) => x.sede)?.sede ?? null,
      familia: familiaDe(cambios),
      titulo: tituloDe(cambios),
      cambios,
    });
  }
  return eventos.reverse();
}

// ---------- fechas (Lima) ----------

const ZONA = "America/Lima";
/** `aaaa-mm-dd` en Lima. */
export function diaLima(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function horaLima(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const partes = (dia: string) => dia.split("-").map(Number) as [number, number, number];
const diasEntre = (a: string, b: string) => Math.round((Date.UTC(...ajusta(partes(b))) - Date.UTC(...ajusta(partes(a)))) / 864e5);
const ajusta = ([y, m, d]: [number, number, number]): [number, number, number] => [y, m - 1, d];

/** «Hoy», «Ayer», «sáb 4 oct» (y el año si no es el de hoy). `hoy` = `aaaa-mm-dd` en Lima. */
export function etiquetaDia(iso: string, hoy: string): string {
  const dia = diaLima(iso);
  const d = diasEntre(dia, hoy);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  const [y, m, dd] = partes(dia);
  const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return `${DIAS[dow]} ${dd} ${MESES[m - 1]}${y !== partes(hoy)[0] ? ` ${y}` : ""}`;
}
/** «6 de octubre». */
export function diaLargo(iso: string): string {
  const [, m, d] = partes(diaLima(iso));
  return `${d} de ${MESES_L[m - 1]}`;
}
/** «hoy, 09:20», «ayer, 16:56», «hace 3 días», «el 18 de septiembre». */
export function haceCuanto(iso: string, hoy: string): string {
  const d = diasEntre(diaLima(iso), hoy);
  if (d === 0) return `hoy, ${horaLima(iso)}`;
  if (d === 1) return `ayer, ${horaLima(iso)}`;
  if (d < 7) return `hace ${d} días`;
  return `el ${diaLargo(iso)}`;
}

/** La frase bajo el título: «11 cambios en 18 días · 3 personas · el último hoy, 09:20, Lucía». */
export function resumenHistorial(eventos: readonly Evento[], hoy: string): string {
  const cambios = eventos.filter((e) => e.familia !== "alta");
  const nacio = eventos.find((e) => e.familia === "alta");
  if (cambios.length === 0) return nacio ? `Nació ${haceCuanto(nacio.cuando, hoy)} y nadie la cambió desde entonces.` : "Todavía no hay nada anotado de esta prenda.";
  const personas = new Set(cambios.filter((e) => e.persona).map((e) => e.persona!.id));
  const sinFirma = cambios.filter((e) => !e.persona).length;
  const ultimo = cambios[0]!;
  const desde = nacio ?? cambios[cambios.length - 1]!;
  const dias = Math.max(1, diasEntre(diaLima(desde.cuando), hoy));
  return [
    `${cambios.length} ${cambios.length === 1 ? "cambio" : "cambios"} en ${dias} ${dias === 1 ? "día" : "días"}`,
    personas.size ? `${personas.size} ${personas.size === 1 ? "persona" : "personas"}` : null,
    sinFirma ? `${sinFirma} sin firma` : null,
    `el último ${haceCuanto(ultimo.cuando, hoy)}${ultimo.persona ? `, ${ultimo.persona.corto}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Las personas que tocaron la prenda (y «sin firma», si hay), con cuántos eventos cada una, de más a menos. */
export function personasDe(eventos: readonly Evento[]): { clave: string; persona: Persona | null; n: number }[] {
  const m = new Map<string, { clave: string; persona: Persona | null; n: number }>();
  for (const e of eventos) {
    const clave = e.persona?.id ?? "nadie";
    const x = m.get(clave) ?? { clave, persona: e.persona, n: 0 };
    x.n++;
    m.set(clave, x);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

/** Los eventos que quedan con un filtro de tipo y de persona. El nacimiento queda siempre, como ancla, salvo que se filtre por
 *  otra persona. */
export function filtrarEventos(eventos: readonly Evento[], familia: Familia | "todo", persona: string | null): Evento[] {
  return eventos.filter((e) => {
    const deLaPersona = !persona || (e.persona?.id ?? "nadie") === persona;
    if (e.familia === "alta") return deLaPersona;
    return deLaPersona && (familia === "todo" || e.familia === familia);
  });
}
