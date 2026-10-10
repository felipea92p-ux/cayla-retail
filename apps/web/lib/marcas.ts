// Reglas puras de "marca y proveedor" (ADR-0109) — sin React ni red.
//
// CONTRATO
//   PROMETE: dadas las marcas, los proveedores y qué proveedores trae cada
//            marca, decir qué se puede elegir, qué se elige solo, y cómo se
//            ordenan las sugerencias.
//   ASUME:   la base es la que manda: `marca_proveedores` + la llave compuesta
//            de `productos` hacen imposible una pareja inválida. Esto solo
//            ahorra clics y evita ofrecer lo imposible.
//   NO HACE: no crea nada ni habla con la base.

import { nombresParecidos, type MotivoParecido } from "./nombres-parecidos";

export type MarcaOpcion = { id: string; nombre: string };
/** Una marca con los nombres de quienes la traen: lo que el formulario de nueva marca muestra al preguntar «¿no es esta?». */
export type MarcaConProveedores = MarcaOpcion & { proveedores: readonly string[] };
export type ProveedorOpcion = { id: string; nombre: string };
export type Vinculo = { marcaId: string; proveedorId: string };
/** Cuántas veces se usó una pareja en productos recientes de una categoría. */
export type ParejaUso = { marcaId: string; proveedorId: string; usos: number };

export function sinTildes(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ---------- «¿no será la misma marca?» (2026-09-25) ----------
//
// El 24-sep alguien creó «Cayla 2» para un top que confecciona Jacard: CAYLA ya existía, pero traída por CAYLA SAC, y el
// formulario de nueva marca no dijo nada. Desde entonces CAYLA vive partida en dos y todo lo que se filtra o agrupa por marca
// la cuenta a medias. Esta función le da al formulario con qué preguntar ANTES de crear. La regla es la general de
// `nombres-parecidos.ts` (la misma que usan los proveedores); en una marca todas las palabras cuentan.
//
// CONTRATO
//   PROMETE: dado el nombre que se va a crear y las marcas que existen, devuelve la marca IGUAL (la que la base
//            considera la misma: `marcas_nombre_unico` sobre `fn_clave_texto`) y hasta `max` PARECIDAS, de más a
//            menos parecida.
//   ASUME:   que la base sigue mandando: con un nombre igual, `crear_marca` no crea otra, le suma el proveedor.
//   NO HACE: no bloquea. «Parecida» es una pregunta; «La Femme» y «La Femme 21» pueden ser dos marcas de verdad.
//
// Medido contra las 80 marcas de producción (2026-09-25): entre ellas solo se parecen CAYLA ~ Cayla 2 y
// Divas ~ Divas Now. Ningún otro par dispara la pregunta, así que no molesta en el censo.
export function marcasParecidas<M extends MarcaOpcion>(
  nombre: string,
  marcas: readonly M[],
  max = 3
): { igual: M | null; parecidas: { marca: M; por: MotivoParecido }[] } {
  const { igual, parecidos } = nombresParecidos(nombre, marcas, { max });
  return { igual, parecidas: parecidos.map(({ item, por }) => ({ marca: item, por })) };
}

export function proveedoresDeMarca(vinculos: Vinculo[], marcaId: string): string[] {
  return vinculos.filter((v) => v.marcaId === marcaId).map((v) => v.proveedorId);
}

export function marcasDeProveedor(vinculos: Vinculo[], proveedorId: string): string[] {
  return vinculos.filter((v) => v.proveedorId === proveedorId).map((v) => v.marcaId);
}

/** Si la marca la trae un solo proveedor, se elige sola: cero clics de más. Con varios (o ninguno), null. */
export function proveedorAutomatico(vinculos: Vinculo[], marcaId: string): string | null {
  const provs = proveedoresDeMarca(vinculos, marcaId);
  return provs.length === 1 ? provs[0] : null;
}

export function marcaAutomatica(vinculos: Vinculo[], proveedorId: string): string | null {
  const marcas = marcasDeProveedor(vinculos, proveedorId);
  return marcas.length === 1 ? marcas[0] : null;
}

export type Resultado =
  | { tipo: "marca"; marca: MarcaOpcion; proveedores: ProveedorOpcion[] }
  | { tipo: "proveedor"; proveedor: ProveedorOpcion; marcas: MarcaOpcion[] };

/** Una sola caja busca en marcas Y proveedores, sin importar tildes ni mayúsculas. Empieza-con antes que contiene. */
export function buscarMarcaProveedor(
  consulta: string,
  marcas: MarcaOpcion[],
  proveedores: ProveedorOpcion[],
  vinculos: Vinculo[],
  max = 8
): Resultado[] {
  const q = sinTildes(consulta);
  if (!q) return [];
  const puntaje = (nombre: string): number | null => {
    const n = sinTildes(nombre);
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (n.includes(q)) return 2;
    return null;
  };
  const provPorId = new Map(proveedores.map((p) => [p.id, p]));
  const marcaPorId = new Map(marcas.map((m) => [m.id, m]));

  const encontradas: { r: Resultado; p: number; nombre: string }[] = [];
  for (const m of marcas) {
    const p = puntaje(m.nombre);
    if (p === null) continue;
    const provs = proveedoresDeMarca(vinculos, m.id)
      .map((id) => provPorId.get(id))
      .filter((x): x is ProveedorOpcion => Boolean(x));
    encontradas.push({ r: { tipo: "marca", marca: m, proveedores: provs }, p, nombre: m.nombre });
  }
  for (const pr of proveedores) {
    const p = puntaje(pr.nombre);
    if (p === null) continue;
    const ms = marcasDeProveedor(vinculos, pr.id)
      .map((id) => marcaPorId.get(id))
      .filter((x): x is MarcaOpcion => Boolean(x));
    // A igual puntaje, la marca va antes que el proveedor (es lo que la persona suele buscar).
    encontradas.push({ r: { tipo: "proveedor", proveedor: pr, marcas: ms }, p: p + 0.5, nombre: pr.nombre });
  }
  return encontradas
    .sort((a, b) => a.p - b.p || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, max)
    .map((x) => x.r);
}

/** Las parejas más usadas en la categoría, solo las que siguen siendo válidas (una pareja puede haberse desactivado). */
export function sugerenciasDeCategoria(
  usos: ParejaUso[],
  marcas: MarcaOpcion[],
  proveedores: ProveedorOpcion[],
  max = 5
): { marca: MarcaOpcion; proveedor: ProveedorOpcion; usos: number }[] {
  const marcaPorId = new Map(marcas.map((m) => [m.id, m]));
  const provPorId = new Map(proveedores.map((p) => [p.id, p]));
  return [...usos]
    .sort((a, b) => b.usos - a.usos)
    .flatMap((u) => {
      const marca = marcaPorId.get(u.marcaId);
      const proveedor = provPorId.get(u.proveedorId);
      return marca && proveedor ? [{ marca, proveedor, usos: u.usos }] : [];
    })
    .slice(0, max);
}

/** Cuenta parejas (marca, proveedor) por categoría a partir de productos recientes. Un producto sin marca o sin proveedor
 *  (ADR-0283) no forma pareja: no cuenta. */
export function contarParejasPorCategoria(
  productos: { categoria_id: string | null; marca_id: string | null; proveedor_id: string | null }[]
): Record<string, ParejaUso[]> {
  const conteo = new Map<string, Map<string, ParejaUso>>();
  for (const p of productos) {
    if (!p.categoria_id || !p.marca_id || !p.proveedor_id) continue;
    const porCat = conteo.get(p.categoria_id) ?? new Map<string, ParejaUso>();
    const clave = `${p.marca_id}|${p.proveedor_id}`;
    const actual = porCat.get(clave);
    porCat.set(clave, { marcaId: p.marca_id, proveedorId: p.proveedor_id, usos: (actual?.usos ?? 0) + 1 });
    conteo.set(p.categoria_id, porCat);
  }
  const out: Record<string, ParejaUso[]> = {};
  for (const [cat, m] of conteo) out[cat] = [...m.values()];
  return out;
}

/** «Sin marca» / «sin proveedor» (ADR-0283, migración 20260930020000): en la URL viaja como `sin` (`/productos?marca=sin`,
 *  `/productos?stock=reponer&proveedor=sin`) y a la base llega como el uuid nulo, que el filtro de `fn_productos` entiende como
 *  «los que no tienen». Nunca es una marca ni un proveedor de verdad. */
export const SIN_EN_URL = "sin";
export const SIN_ID = "00000000-0000-0000-0000-000000000000";

/** De lo que trae la URL en `?marca=` / `?proveedor=` al id que se le manda a `fn_productos`: `sin` → el uuid nulo («los que no
 *  tienen»), un uuid → él mismo, cualquier otra cosa → nada (el filtro se ignora, como siempre). */
export function filtroDeMarcaOProveedor(valorUrl?: string): string | undefined {
  if (valorUrl === SIN_EN_URL) return SIN_ID;
  return valorUrl && /^[0-9a-f-]{36}$/i.test(valorUrl) ? valorUrl : undefined;
}

// ---------- Catálogo ▸ Marcas: buscar y editar ----------

/** Lo mínimo que la búsqueda de Catálogo ▸ Marcas necesita de cada fila. */
type FilaBuscable = { nombre: string; proveedores: { nombre: string }[] };

/** Busca por el nombre de la marca O de quien la trae, sin tildes ni mayúsculas: «¿qué marcas me trae Saavedra?» también se
 *  contesta aquí. Sin texto, todas. */
export function filtrarMarcas<T extends FilaBuscable>(filas: T[], consulta: string): T[] {
  const q = sinTildes(consulta);
  if (!q) return filas;
  return filas.filter((f) => sinTildes(f.nombre).includes(q) || f.proveedores.some((p) => sinTildes(p.nombre).includes(q)));
}

/** Una marca como la pinta Catálogo ▸ Marcas: con sus proveedores y cuántos productos usan a cada uno. */
export type MarcaFila = {
  id: string;
  nombre: string;
  activo: boolean;
  /** Productos activos de la marca (todas sus parejas). */
  productos: number;
  /** `productos`: los activos (lo que se muestra). `productosTotal`: también los descontinuados — mientras haya uno, la
   *  pareja no se puede quitar (la llave de `productos` la sigue citando). */
  proveedores: { id: string; nombre: string; productos: number; productosTotal: number }[];
};

/** Un proveedor que la marca ya tiene. `productosTotal` cuenta TODOS sus productos (también descontinuados): la llave de
 *  `productos` los sigue citando, así que mientras haya uno la pareja no se puede quitar. */
export type ParejaDeMarca = { id: string; nombre: string; productosTotal: number };

/** Lo que la ventana «Editar marca» va a guardar. Se manda como sumar/quitar, no como la lista final: si otra persona sumó
 *  un proveedor mientras tanto, este guardado no se lo borra (`editar_marca`, 20260926150000). */
export type BorradorMarca = {
  nombre: string;
  /** Proveedores que la marca ya tenía y se quitan. */
  quitar: string[];
  /** Proveedores de la lista que se suman. */
  sumar: string[];
  /** Proveedores que todavía no existen: se registran en el mismo guardado. */
  nuevos: { nombre: string; ruc: string }[];
};

export function sePuedeQuitar(p: ParejaDeMarca): boolean {
  return p.productosTotal === 0;
}

/** La línea de la tarjeta bajo el nombre. Si no hay productos activos pero sí descontinuados lo dice: es lo que explica por
 *  qué esa marca no ofrece «Eliminar» (un descontinuado sigue citándola). `total` cuenta también los descontinuados. */
export function textoProductosMarca(activos: number, total: number): string {
  if (activos > 0) return `${activos} producto${activos === 1 ? "" : "s"} activo${activos === 1 ? "" : "s"}`;
  if (total > 0) return `Sin productos activos · ${total} descontinuado${total === 1 ? "" : "s"}`;
  return "Sin productos todavía";
}

/** ¿Se ofrece «Eliminar»? Solo si ningún producto tiene la marca — activo, descontinuado o archivado como prueba: todos
 *  siguen citándola en su ficha y en las ventas ya hechas. Una marca sin proveedores tampoco tiene productos (la llave de
 *  `productos` pide la pareja). Avisa antes de ir a la base, pero la que manda es `eliminar_marca` (20260926213000). */
export function sePuedeEliminarMarca(proveedores: readonly Pick<ParejaDeMarca, "productosTotal">[]): boolean {
  return proveedores.every((p) => p.productosTotal === 0);
}

/** Qué impide guardar el borrador, en palabras de la pantalla; null = se puede. Espeja a `editar_marca` para avisar antes
 *  de ir a la base, pero la que manda es la base. */
export function problemaEdicionMarca(actuales: ParejaDeMarca[], b: BorradorMarca): string | null {
  if (!b.nombre.trim()) return "Escribe el nombre de la marca.";
  const enUso = actuales.find((p) => b.quitar.includes(p.id) && !sePuedeQuitar(p));
  if (enUso) return `«${enUso.nombre}» tiene productos: cámbiales el proveedor en Productos antes de quitarlo.`;
  const quedan = actuales.filter((p) => !b.quitar.includes(p.id)).length + b.sumar.length + b.nuevos.length;
  if (quedan === 0) return "La marca necesita al menos un proveedor. Si ya nadie la trae, desactívala.";
  if (b.nuevos.some((n) => !n.nombre.trim())) return "Escribe el nombre del proveedor nuevo.";
  const rucMalo = b.nuevos.find((n) => n.ruc.trim() !== "" && !/^\d{11}$/.test(n.ruc.trim()));
  if (rucMalo) return `El RUC de «${rucMalo.nombre}» tiene que ser de 11 dígitos. Si no lo sabes, déjalo en blanco.`;
  return null;
}

/** ¿Hay algo que guardar? Sin cambios, «Guardar» solo cierra: no se le pide a nadie que firme algo que no pasó. */
export function borradorCambia(nombreActual: string, b: BorradorMarca): boolean {
  return b.nombre.trim().replace(/\s+/g, " ") !== nombreActual || b.quitar.length > 0 || b.sumar.length > 0 || b.nuevos.length > 0;
}

// ---------- Catálogo ▸ Marcas: estado, resumen y filtro (ADR-0373) ----------
//
// CONTRATO
//   PROMETE: decir, de cada marca, en cuál de cuatro estados está, y contar cuántas hay en cada uno. Son los MISMOS cuatro
//            números que se ven como píldoras y, abiertas, como tarjetas: nunca dos cuentas distintas.
//   ASUME:   `productos` son los activos y `proveedores` ya trae `productosTotal` (lo arma `productos/marcas/page.tsx`).
//   NO HACE: no decide si se puede desactivar o eliminar (eso es `sePuedeEliminarMarca` y los candados de la base).

/** En qué está una marca. `sin-proveedor` es el único estado que pide una acción: no se puede usar en un producto. */
export type EstadoMarca = "con" | "sin" | "sin-proveedor" | "desactivada";

export function estadoDeMarca(m: Pick<MarcaFila, "activo" | "productos" | "proveedores">): EstadoMarca {
  if (!m.activo) return "desactivada";
  if (m.proveedores.length === 0) return "sin-proveedor";
  return m.productos > 0 ? "con" : "sin";
}

/** La línea que dice el estado en palabras de tienda, bajo el nombre. */
export function textoEstadoMarca(m: Pick<MarcaFila, "activo" | "productos" | "proveedores">): string {
  const estado = estadoDeMarca(m);
  if (estado === "desactivada") return "Desactivada";
  if (estado === "sin-proveedor") return "Sin proveedor: no se puede usar en un producto";
  if (estado === "con") return "Ya la usamos";
  const descontinuados = m.proveedores.reduce((n, p) => n + p.productosTotal, 0);
  return descontinuados > 0 ? `Sin productos activos · ${descontinuados} descontinuado${descontinuados === 1 ? "" : "s"}` : "Nadie la ha usado todavía";
}

/** Los cuatro filtros del resumen. `activas` es «todas las activas» (no filtra nada más). */
export type FiltroMarcas = "activas" | "con" | "sin" | "sin-proveedor";
export const FILTROS_MARCAS: readonly FiltroMarcas[] = ["activas", "con", "sin", "sin-proveedor"];

export type ResumenMarcas = Record<FiltroMarcas, number>;

/** Cuántas marcas ACTIVAS hay en cada filtro. Las desactivadas no cuentan: viven aparte («Desactivadas»). */
export function resumenDeMarcas(marcas: readonly Pick<MarcaFila, "activo" | "productos" | "proveedores">[]): ResumenMarcas {
  const r: ResumenMarcas = { activas: 0, con: 0, sin: 0, "sin-proveedor": 0 };
  for (const m of marcas) {
    const e = estadoDeMarca(m);
    if (e === "desactivada") continue;
    r.activas++;
    if (e === "con") r.con++;
    else if (e === "sin") r.sin++;
    else r["sin-proveedor"]++;
  }
  return r;
}

/** Las marcas activas que caen en el filtro. */
export function marcasDelFiltro<T extends Pick<MarcaFila, "activo" | "productos" | "proveedores">>(marcas: readonly T[], filtro: FiltroMarcas): T[] {
  return marcas.filter((m) => {
    const e = estadoDeMarca(m);
    if (e === "desactivada") return false;
    return filtro === "activas" || e === filtro;
  });
}

/** Las letras del cuadrito de la marca: las iniciales de sus dos primeras palabras («Alma Costa» → «AC», «3.20 Store» → «3S»);
 *  con una sola palabra, sus dos primeras letras («Amuza» → «Am»): con una letra, doce marcas serían «A». */
export function monogramaDeMarca(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const limpia = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "");
  if (palabras.length === 0) return "·";
  if (palabras.length === 1) {
    const t = limpia(palabras[0]).slice(0, 2);
    return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : "·";
  }
  const t = limpia(palabras[0]).slice(0, 1) + limpia(palabras[1]).slice(0, 1);
  return t ? t.toUpperCase() : "·";
}

// ---------- Catálogo ▸ Marcas: páginas, letras y «dónde quedó» (ADR-0373) ----------

/** 24 marcas por página (Felipe, 2026-10-10): se reparte exacto en 2, 3 y 4 columnas, así que la última fila nunca queda coja.
 *  20 no cabe en 3 columnas ni 30 en 4. Es fija: la colaboradora no elige cuántas ve. */
export const MARCAS_POR_PAGINA = 24;

/** El índice «Ir a»: los números van juntos bajo «#». */
export const ALFABETO: readonly string[] = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/** La letra bajo la que cae una marca en el índice: la primera letra o número de su nombre, sin tildes («Ñusta» → N, «y.j.j» → Y,
 *  «3.20 Store» → #). Un nombre sin letras ni números cae en «#». */
export function letraDeMarca(nombre: string): string {
  const c = sinTildes(nombre).match(/[a-z0-9]/)?.[0];
  if (!c || /[0-9]/.test(c)) return "#";
  return c.toUpperCase();
}

export function letrasDeMarcas(marcas: readonly { nombre: string }[]): Set<string> {
  return new Set(marcas.map((m) => letraDeMarca(m.nombre)));
}

/** En qué lugar (desde 0) de una lista YA ORDENADA por nombre empieza una letra; -1 si no hay marcas con ella. */
export function posicionDeLaLetra(marcas: readonly { nombre: string }[], letra: string): number {
  return marcas.findIndex((m) => letraDeMarca(m.nombre) === letra);
}

/** La página (desde 1) en que cae el lugar `posicion` (desde 0). */
export function paginaDeLaPosicion(posicion: number, porPagina: number = MARCAS_POR_PAGINA): number {
  return Math.floor(Math.max(0, posicion) / Math.max(1, porPagina)) + 1;
}

/** «de Cala a Gala»: de qué marca a qué marca va la página que se ve. Vacío si la página está vacía. */
export function rangoDeNombres(filas: readonly { nombre: string }[]): string | null {
  if (filas.length === 0) return null;
  return `de ${filas[0].nombre} a ${filas[filas.length - 1].nombre}`;
}

// ---------- Catálogo ▸ Marcas: predicción del buscador (ADR-0373) ----------
//
// Felipe, 2026-10-10: «si el buscador ya busca dentro de las marcas, una lista desplegable es innecesaria». La predicción vive en
// dos sitios que ya existen: una sombra en el campo con lo que falta de la marca más probable, y las tarjetas, que se ordenan
// por lo probable mientras se escribe.
//
// CONTRATO
//   PROMETE: ante lo que se escribió, (1) dejar las marcas que coinciden ordenadas de la más a la menos probable, y (2) decir
//            qué marca completa lo escrito. Es determinista: la misma entrada da siempre la misma salida (sin azar ni red).
//   ASUME:   que `productos` son los activos: a igual coincidencia, la marca más usada es la que más probablemente se busca.
//   NO HACE: no cambia qué marcas existen ni las filtra por estado (eso es `marcasDelFiltro`, antes de buscar).

/** `texto` sin tildes y en minúscula, SIN recortar: para predecir importa cada espacio que la persona escribió. */
function aMinusculasSinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const palabrasDe = (nombre: string): string[] => aMinusculasSinTildes(nombre).split(/[\s.&·-]+/).filter(Boolean);

/** Cuánto coincide `nombre` con lo escrito `q` (ya normalizado): igual 4 · empieza con eso 3 · una palabra suya empieza así 2 ·
 *  lo contiene 1 · nada 0. */
function puntajeDeCoincidencia(nombre: string, q: string): number {
  const n = aMinusculasSinTildes(nombre);
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  if (palabrasDe(nombre).some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}

/** Letras que hay que cambiar, poner o quitar para pasar de `a` a `b` (distancia de Levenshtein; los nombres son cortos). */
export function distanciaDeEdicion(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** «Parecida» = lo escrito está a una letra de una palabra de la marca o de su nombre entero (a dos si lo escrito tiene 6 o más);
 *  también contra su comienzo, para que una errata a mitad de camino («wayy», «alma cosa») encuentre «Wayi» y «Alma Costa».
 *  Con menos de 3 letras no se adivina nada. */
function seParece(nombre: string, q: string): boolean {
  if (q.length < 3) return false;
  const tope = q.length >= 6 ? 2 : 1;
  const comparables = [aMinusculasSinTildes(nombre), ...palabrasDe(nombre)];
  return comparables.some((w) => Math.min(distanciaDeEdicion(q, w), distanciaDeEdicion(q, w.slice(0, q.length))) <= tope);
}

type MarcaBuscable = { nombre: string; productos: number; proveedores: readonly { nombre: string }[] };

/** Las marcas que coinciden con lo escrito, de la más a la menos probable: igual > empieza con eso > una palabra suya empieza así
 *  > lo contiene > la trae un proveedor con ese nombre; a igual puntaje, la de más productos; y por nombre. Sin coincidencia
 *  devuelve las PARECIDAS (`parecidas: true`) para que la pantalla pregunte «¿buscabas alguna de estas?» en vez de quedar vacía.
 *  Sin texto, todas por nombre. No modifica lo que recibe. */
export function ordenarPorPrediccion<T extends MarcaBuscable>(marcas: readonly T[], consulta: string): { lista: T[]; parecidas: boolean } {
  const q = aMinusculasSinTildes(consulta).trim();
  const porNombre = (a: T, b: T) => a.nombre.localeCompare(b.nombre, "es");
  if (!q) return { lista: [...marcas].sort(porNombre), parecidas: false };
  const nota = (m: T) => Math.max(puntajeDeCoincidencia(m.nombre, q), m.proveedores.some((p) => puntajeDeCoincidencia(p.nombre, q) > 0) ? 0.5 : 0);
  const directas = marcas
    .map((m) => ({ m, n: nota(m) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || b.m.productos - a.m.productos || porNombre(a.m, b.m))
    .map((x) => x.m);
  if (directas.length > 0) return { lista: directas, parecidas: false };
  return { lista: marcas.filter((m) => seParece(m.nombre, q)).sort((a, b) => b.productos - a.productos || porNombre(a, b)), parecidas: true };
}

/** La marca que completa lo escrito, y lo que le falta (`cola`): solo si lo escrito es su COMIENZO, y la más usada primero. Sin nada
 *  que completar (lo escrito ya es el nombre entero, o no empieza ninguna marca así) devuelve null. Lo escrito no se corrige: la
 *  sombra solo agrega lo que falta, así la persona conserva sus mayúsculas hasta que acepta. */
export function prediccionDe<T extends { nombre: string; productos: number }>(marcas: readonly T[], consulta: string): { marca: T; cola: string } | null {
  if (!consulta.trim() || consulta !== consulta.trimStart()) return null;
  const q = aMinusculasSinTildes(consulta);
  const candidatas = marcas
    .filter((m) => m.nombre.length > consulta.length && aMinusculasSinTildes(m.nombre).length === m.nombre.length && aMinusculasSinTildes(m.nombre).startsWith(q))
    .sort((a, b) => b.productos - a.productos || a.nombre.localeCompare(b.nombre, "es"));
  const marca = candidatas[0];
  return marca ? { marca, cola: marca.nombre.slice(consulta.length) } : null;
}
