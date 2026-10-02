import { leerMonto, textoRangoPrecio } from "./productos-filtro-precio";

// La barra de filtros de /productos guarda TODO en la URL (ADR-0254): la URL es la única fuente de verdad y la pantalla
// solo la lee. Aquí vive lo que se hace con esa URL, sin React, para que se pueda probar y para que la pantalla no tenga
// dos verdades (el estado local de las cajas y la URL) que se separan. Análisis: docs/pantallas/productos-filtros.md #1.

/** Lo que nunca es un filtro: cambiar de página o de vista no se «limpia» ni cuenta. */
const NO_SE_LIMPIA = ["vista"] as const;

/** Aplica `cambios` a la consulta `actual` (sin «?»). Un valor vacío borra la clave. Siempre vuelve a la página 1: un
 *  filtro nuevo sobre «página 7» cae casi siempre en vacío. */
export function consultaConCambios(actual: string, cambios: Record<string, string>): string {
  const p = new URLSearchParams(actual);
  for (const [k, v] of Object.entries(cambios)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  p.delete("pagina");
  return p.toString();
}

export function hrefDeConsulta(pathname: string, consulta: string): string {
  return consulta ? `${pathname}?${consulta}` : pathname;
}

/** «Limpiar todo» quita los filtros, la búsqueda y el orden, pero deja a la persona en la vista donde estaba (Grilla o
 *  Tabla): antes la sacaba de la Tabla. */
export function consultaSinFiltros(actual: string): string {
  const antes = new URLSearchParams(actual);
  const p = new URLSearchParams();
  for (const k of NO_SE_LIMPIA) {
    const v = antes.get(k);
    if (v) p.set(k, v);
  }
  return p.toString();
}

/** Las cajas que se escriben (buscador y precio): mientras alguien teclea, lo suyo vive aquí y recién después pasa a la URL. */
export type CajaTipeada = "q" | "precioMin" | "precioMax";
/** Solo las cajas que se están escribiendo AHORA, con lo escrito. Una caja que no está aquí muestra lo que dice la URL,
 *  venga de donde venga («A quién pedirle», el botón Atrás, un enlace compartido). Antes las cajas se llenaban una sola vez
 *  al montar y seguían mostrando, y volvían a mandar, un precio que la URL ya no tenía. */
export type Tipeado = Partial<Record<CajaTipeada, string>>;

export function valorDeCaja(tipeado: Tipeado, caja: CajaTipeada, consulta: string): string {
  return tipeado[caja] ?? new URLSearchParams(consulta).get(caja) ?? "";
}

/** Lo que una caja manda a la URL. El precio se normaliza («39,90» → «39.9»: la URL solo acepta el punto y con la coma
 *  ignoraba el filtro en silencio); a medio escribir («39,») devuelve `null` y se espera, en vez de borrar el filtro. */
function valorParaUrl(caja: CajaTipeada, texto: string): string | null {
  if (caja === "q" || texto.trim() === "") return texto.trim();
  const n = leerMonto(texto);
  return n == null ? null : String(n);
}

/** Lo escrito que todavía no está en la URL, listo para `consultaConCambios`. Vacío = nada que mandar. */
export function cambiosTipeados(consulta: string, tipeado: Tipeado): Record<string, string> {
  const p = new URLSearchParams(consulta);
  const cambios: Record<string, string> = {};
  for (const [k, v] of Object.entries(tipeado) as [CajaTipeada, string][]) {
    const limpio = valorParaUrl(k, v);
    if (limpio != null && (p.get(k) ?? "") !== limpio) cambios[k] = limpio;
  }
  return cambios;
}

/** Cuando la URL ya dice lo escrito, la caja deja de «escribirse» y vuelve a mostrar la URL. La caja con el cursor adentro
 *  NUNCA se suelta: lo escrito es de la persona, aunque la URL ya diga lo mismo recortado o normalizado. Si se soltara,
 *  «blusa » (con el espacio antes de la palabra siguiente) pasaría a mostrar «blusa» y el espacio se borraría bajo el
 *  cursor («blusaroja»), y «39,9» pasaría a «39.90» a mitad de escribir 39,95. Se suelta al salir de la caja.
 *  Devuelve el mismo objeto si nada cambió (para no volver a pintar de gusto). */
export function tipeadoPendiente(consulta: string, tipeado: Tipeado, enfocada: CajaTipeada | null = null): Tipeado {
  const p = new URLSearchParams(consulta);
  // Sigue «escribiéndose» la caja con el cursor y lo que la URL todavía no dice (incluido lo a medio escribir, «39,»).
  const quedan = (Object.keys(tipeado) as CajaTipeada[]).filter(
    (k) => k === enfocada || valorParaUrl(k, tipeado[k] as string) !== (p.get(k) ?? ""),
  );
  if (quedan.length === Object.keys(tipeado).length) return tipeado;
  return Object.fromEntries(quedan.map((k) => [k, tipeado[k] as string])) as Tipeado;
}

/** Saca cajas de lo que se está escribiendo (al quitar su chip o con «Limpiar todo»): si no, el temporizador las volvería a
 *  mandar a la URL. */
export function sinCajas(tipeado: Tipeado, cajas: readonly CajaTipeada[]): Tipeado {
  if (!cajas.some((k) => k in tipeado)) return tipeado;
  const copia = { ...tipeado };
  for (const k of cajas) delete copia[k];
  return copia;
}

// ── Estado ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Al entrar se ven solo las activas (Felipe, 2026-10-02): el mostrador no tiene por qué ver prendas que ya no se venden.
 *  Como el de fábrica no se escribe en la URL, «Todos» sí (`estado=todos`). */
export const ESTADOS_LISTADO = ["activo", "descontinuado", "todos"] as const;
export type EstadoListado = (typeof ESTADOS_LISTADO)[number];
export const ESTADO_POR_DEFECTO: EstadoListado = "activo";
export const ROTULO_ESTADO: Record<EstadoListado, string> = { activo: "Activos", descontinuado: "Descontinuados", todos: "Todos" };

export function estadoDeUrl(valor: string | null | undefined): EstadoListado {
  return (ESTADOS_LISTADO as readonly string[]).includes(valor ?? "") ? (valor as EstadoListado) : ESTADO_POR_DEFECTO;
}

/** Lo que entiende `fn_productos`: sin estado = activos y descontinuados. */
export function estadoParaBase(estado: EstadoListado): "activo" | "descontinuado" | undefined {
  return estado === "todos" ? undefined : estado;
}

// ── Lo que está puesto ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Los filtros que quitan prendas. El orden NO es uno (solo las acomoda), ni la búsqueda (se ve en su caja), ni la vista:
 *  antes «Filtros · 1» se encendía con solo ordenar. */
export function contarFiltrosActivos(consulta: string): number {
  const p = new URLSearchParams(consulta);
  // Color y familia son un mismo filtro (el de color, con su lista agrupada por familia): cuentan una vez.
  const claves = ["cat", "marca", "proveedor", "stock", "talla", "temporada", "falta"].filter((k) => p.get(k));
  if (p.get("color") || p.get("familia")) claves.push("color");
  // El precio cuenta solo si se entiende, con la misma regla que aplica el servidor (`leerMonto`): «abc» no filtra ni cuenta.
  const precio = leerMonto(p.get("precioMin") ?? "") != null || leerMonto(p.get("precioMax") ?? "") != null ? 1 : 0;
  const estado = estadoDeUrl(p.get("estado")) !== ESTADO_POR_DEFECTO ? 1 : 0;
  return claves.length + precio + estado;
}

// ── Listas en la URL (Talla, Color y familia: varias opciones a la vez) ─────────────────────────────────────────────────
/** `talla=a,b` → ["a", "b"]: sin vacíos ni repetidos. Una sola opción sigue siendo `color=NEG`, como antes. */
export function listaDeUrl(valor: string | null | undefined): string[] {
  return [...new Set((valor ?? "").split(",").map((v) => v.trim()).filter(Boolean))];
}

/** La lista de vuelta a la URL («» si quedó vacía: borra la clave). */
export function listaParaUrl(lista: readonly string[]): string {
  return [...new Set(lista)].join(",");
}

// ── Disponibilidad (Felipe, 2026-10-02: las dos medidas, la de la sede y la de la red, cada una rotulada) ────────────────
/** En la URL sigue siendo `stock=` (los enlaces de «A quién pedirle» y los viejos siguen sirviendo). */
export const DISPONIBILIDADES = ["en_sede", "sin_sede", "sin_red", "bajo", "reponer"] as const;
export type Disponibilidad = (typeof DISPONIBILIDADES)[number];
/** Las que miran la sede elegida: sin sede (la vista CAYLA Global) no se ofrecen ni se aplican. */
export const DISPONIBILIDAD_DE_SEDE: readonly Disponibilidad[] = ["en_sede", "sin_sede"];

/** La disponibilidad de la URL; `sin_stock` (antes de 2026-10-02) es la de la red. Sin sede, las de la sede no valen. */
export function disponibilidadDeUrl(valor: string | null | undefined, haySede: boolean): Disponibilidad | undefined {
  const v = valor === "sin_stock" ? "sin_red" : valor;
  if (!(DISPONIBILIDADES as readonly string[]).includes(v ?? "")) return undefined;
  if (!haySede && DISPONIBILIDAD_DE_SEDE.includes(v as Disponibilidad)) return undefined;
  return v as Disponibilidad;
}

/** Lo que dice cada opción, con el nombre de la sede: «Hay en Tienda Lima», nunca «aquí» (en un enlace compartido
 *  «aquí» sería otra tienda). */
export function rotuloDisponibilidad(d: Disponibilidad, sede: string | null): string {
  switch (d) {
    case "en_sede":
      return `Hay en ${sede ?? "la sede"}`;
    case "sin_sede":
      return `Sin stock en ${sede ?? "la sede"}`;
    case "sin_red":
      return "Sin stock en ninguna sede";
    case "bajo":
      return "Stock bajo";
    case "reponer":
      return "Pedir a proveedor";
  }
}

// ── Temporada y «Por completar» (Felipe, 2026-10-02) ──────────────────────────────────────────────────────────────────
/** `temporada=sin` = las prendas con algún color sin temporada (la misma cuenta que el aviso «N prendas sin temporada»). */
export const SIN_TEMPORADA = "sin";

export function temporadaDeUrl(valor: string | null | undefined): string | undefined {
  return valor && /^[a-z0-9_-]{1,40}$/.test(valor) ? valor : undefined;
}

/** Lo que le falta a la ficha: el filtro de quien carga el catálogo (76 de 86 prendas sin foto el 2026-10-02). */
export const FALTAS = ["foto", "temporada", "marca", "proveedor"] as const;
export type Falta = (typeof FALTAS)[number];
export const ROTULO_FALTA: Record<Falta, string> = { foto: "Sin foto", temporada: "Sin temporada", marca: "Sin marca", proveedor: "Sin proveedor" };

export function faltaDeUrl(valor: string | null | undefined): Falta | undefined {
  return (FALTAS as readonly string[]).includes(valor ?? "") ? (valor as Falta) : undefined;
}

/** Un chip por cosa puesta, siempre «Nombre: valor» (como la píldora): «Blusas» suelto no decía si era categoría o etiqueta.
 *  `quitar` son las claves que lo apagan. `nombres` resuelve ids a nombres; un id que ya no existe dice «—». */
export function chipsDeFiltros(
  consulta: string,
  nombres: {
    categoria: (id: string) => string | undefined;
    marca: (id: string) => string | undefined;
    proveedor: (id: string) => string | undefined;
    color: (id: string) => string | undefined;
    talla?: (id: string) => string | undefined;
    familia?: (valor: string) => string | undefined;
    /** La sede elegida arriba (`null` en CAYLA Global): da nombre a «Hay en …». */
    sede?: string | null;
    temporada?: (clave: string) => string | undefined;
  },
  sin = "sin",
): { texto: string; quitar: string[] }[] {
  const p = new URLSearchParams(consulta);
  const chips: { texto: string; quitar: string[] }[] = [];
  const q = p.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: ["q"] });
  const cat = p.get("cat");
  if (cat) chips.push({ texto: `Categoría: ${nombres.categoria(cat) ?? "—"}`, quitar: ["cat"] });
  const marca = p.get("marca");
  if (marca) chips.push({ texto: `Marca: ${marca === sin ? "sin marca" : (nombres.marca(marca) ?? "—")}`, quitar: ["marca"] });
  const proveedor = p.get("proveedor");
  if (proveedor) chips.push({ texto: `Proveedor: ${proveedor === sin ? "sin proveedor" : (nombres.proveedor(proveedor) ?? "—")}`, quitar: ["proveedor"] });
  const tallas = listaDeUrl(p.get("talla"));
  if (tallas.length) chips.push({ texto: `Talla: ${tallas.map((t) => nombres.talla?.(t) ?? "—").join(", ")}`, quitar: ["talla"] });
  const colores = [
    ...listaDeUrl(p.get("familia")).map((f) => `Familia ${nombres.familia?.(f) ?? f}`),
    ...listaDeUrl(p.get("color")).map((c) => nombres.color(c) ?? "—"),
  ];
  if (colores.length) chips.push({ texto: `Color: ${colores.join(", ")}`, quitar: ["color", "familia"] });
  const estado = estadoDeUrl(p.get("estado"));
  if (estado !== ESTADO_POR_DEFECTO) chips.push({ texto: `Estado: ${ROTULO_ESTADO[estado]}`, quitar: ["estado"] });
  const temporada = temporadaDeUrl(p.get("temporada"));
  if (temporada) {
    chips.push({ texto: temporada === SIN_TEMPORADA ? "Sin temporada" : `Temporada: ${nombres.temporada?.(temporada) ?? temporada}`, quitar: ["temporada"] });
  }
  const falta = faltaDeUrl(p.get("falta"));
  if (falta) chips.push({ texto: `Por completar: ${ROTULO_FALTA[falta]}`, quitar: ["falta"] });
  const disp = disponibilidadDeUrl(p.get("stock"), nombres.sede != null);
  if (disp) chips.push({ texto: `Disponibilidad: ${rotuloDisponibilidad(disp, nombres.sede ?? null)}`, quitar: ["stock"] });
  const precio = textoRangoPrecio(p.get("precioMin"), p.get("precioMax"));
  if (precio) chips.push({ texto: `Precio: ${precio}`, quitar: ["precioMin", "precioMax"] });
  return chips;
}

// ── Color agrupado por familia (Felipe, 2026-10-02: un solo filtro de color, no uno aparte de familia) ──────────────────
const PREFIJO_FAMILIA = "familia:";

/** Las opciones del filtro de color: por cada familia (en el orden de `FAMILIAS_COLOR`) primero «Toda la familia Azul» y
 *  debajo sus colores; al final, los colores sin familia. Una sola lista: elegir la familia o un tono exacto. */
export function opcionesDeColor<C extends { id: string; nombre: string; familia: string | null }>(
  colores: readonly C[],
  familias: readonly { valor: string; texto: string }[],
): ({ valor: string; texto: string; familia: true } | { valor: string; texto: string; familia: false; color: C })[] {
  const salida: ({ valor: string; texto: string; familia: true } | { valor: string; texto: string; familia: false; color: C })[] = [];
  for (const f of familias) {
    const suyos = colores.filter((c) => c.familia === f.valor);
    if (suyos.length === 0) continue;
    salida.push({ valor: PREFIJO_FAMILIA + f.valor, texto: `Toda la familia ${f.texto}`, familia: true });
    for (const c of suyos) salida.push({ valor: c.id, texto: c.nombre, familia: false, color: c });
  }
  for (const c of colores.filter((x) => !familias.some((f) => f.valor === x.familia))) salida.push({ valor: c.id, texto: c.nombre, familia: false, color: c });
  return salida;
}

/** Lo marcado en la lista de color, de vuelta a la URL: `color=` los tonos y `familia=` las familias. */
export function separarColor(valores: readonly string[]): { color: string; familia: string } {
  return {
    color: listaParaUrl(valores.filter((v) => !v.startsWith(PREFIJO_FAMILIA))),
    familia: listaParaUrl(valores.filter((v) => v.startsWith(PREFIJO_FAMILIA)).map((v) => v.slice(PREFIJO_FAMILIA.length))),
  };
}

/** Y al revés: lo que dice la URL, como lo marca la lista. */
export function marcadosDeColor(consulta: string): string[] {
  const p = new URLSearchParams(consulta);
  return [...listaDeUrl(p.get("familia")).map((f) => PREFIJO_FAMILIA + f), ...listaDeUrl(p.get("color"))];
}
