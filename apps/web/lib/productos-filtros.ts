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
  const claves = ["cat", "marca", "proveedor", "color", "stock"].filter((k) => p.get(k));
  // El precio cuenta solo si se entiende, con la misma regla que aplica el servidor (`leerMonto`): «abc» no filtra ni cuenta.
  const precio = leerMonto(p.get("precioMin") ?? "") != null || leerMonto(p.get("precioMax") ?? "") != null ? 1 : 0;
  const estado = estadoDeUrl(p.get("estado")) !== ESTADO_POR_DEFECTO ? 1 : 0;
  return claves.length + precio + estado;
}

export const ROTULO_STOCK: Record<string, string> = { sin_stock: "Sin stock", bajo: "Stock bajo", reponer: "Pedir a proveedor" };

/** Un chip por cosa puesta, siempre «Nombre: valor» (como la píldora): «Blusas» suelto no decía si era categoría o etiqueta.
 *  `quitar` son las claves que lo apagan. `nombres` resuelve ids a nombres; un id que ya no existe dice «—». */
export function chipsDeFiltros(
  consulta: string,
  nombres: { categoria: (id: string) => string | undefined; marca: (id: string) => string | undefined; proveedor: (id: string) => string | undefined; color: (id: string) => string | undefined },
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
  const color = p.get("color");
  if (color) chips.push({ texto: `Color: ${nombres.color(color) ?? "—"}`, quitar: ["color"] });
  const estado = estadoDeUrl(p.get("estado"));
  if (estado !== ESTADO_POR_DEFECTO) chips.push({ texto: `Estado: ${ROTULO_ESTADO[estado]}`, quitar: ["estado"] });
  const stock = p.get("stock");
  if (stock && ROTULO_STOCK[stock]) chips.push({ texto: `Stock: ${ROTULO_STOCK[stock]}`, quitar: ["stock"] });
  const precio = textoRangoPrecio(p.get("precioMin"), p.get("precioMax"));
  if (precio) chips.push({ texto: `Precio: ${precio}`, quitar: ["precioMin", "precioMax"] });
  return chips;
}
