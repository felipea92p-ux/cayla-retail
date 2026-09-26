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
// la cuenta a medias. Estas funciones le dan al formulario con qué preguntar ANTES de crear.
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

/** Lo que la base compara (`retail.fn_clave_texto` sobre el nombre ya limpiado por `crear_marca`): espacios juntados,
 *  minúsculas, y sin las tildes y la ñ que la base traduce (solo esas: «ç» sigue siendo «ç», como en la base). */
export function claveMarca(nombre: string): string {
  const traduce: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
  return nombre
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => traduce[c]);
}

/** Por qué se parece: mismo nombre salvo números o signos («Cayla 2»), una o dos letras cambiadas («Kristell»), o el
 *  nombre entero cabe en el otro, palabra por palabra («Divas» en «Divas Now»). */
export type MotivoParecido = "raiz" | "letras" | "contenida";

const palabrasDe = (nombre: string) => claveMarca(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
// La raíz: todo junto, sin signos y sin el número del final. «Cayla 2», «CAYLA.» y «cayla» dan «cayla».
const raizDe = (nombre: string) => palabrasDe(nombre).join("").replace(/\d+$/, "");

function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[b.length];
}

function motivoParecido(a: string, b: string): { por: MotivoParecido; peso: number } | null {
  const ra = raizDe(a);
  const rb = raizDe(b);
  if (!ra || !rb) return null;
  if (ra === rb) return { por: "raiz", peso: 0 };
  // Con nombres cortos una letra ya es otra marca («Kero» / «Kera»): solo se cuenta el error de tipeo desde 5 letras,
  // y dos letras desde 8.
  const corta = Math.min(ra.length, rb.length);
  const d = distancia(ra, rb);
  if ((corta >= 5 && d <= 1) || (corta >= 8 && d <= 2)) return { por: "letras", peso: d };
  const pa = palabrasDe(a).filter((w) => !/^\d+$/.test(w));
  const pb = palabrasDe(b).filter((w) => !/^\d+$/.test(w));
  const [menos, mas] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (menos.join("").length >= 4 && menos.every((w) => mas.includes(w))) return { por: "contenida", peso: 3 };
  return null;
}

export function marcasParecidas<M extends MarcaOpcion>(
  nombre: string,
  marcas: readonly M[],
  max = 3
): { igual: M | null; parecidas: { marca: M; por: MotivoParecido }[] } {
  const clave = claveMarca(nombre);
  if (!clave) return { igual: null, parecidas: [] };
  const igual = marcas.find((m) => claveMarca(m.nombre) === clave) ?? null;
  const parecidas = marcas
    .filter((m) => m !== igual)
    .flatMap((m) => {
      const r = motivoParecido(nombre, m.nombre);
      return r ? [{ marca: m, ...r }] : [];
    })
    .sort((x, y) => x.peso - y.peso || x.marca.nombre.localeCompare(y.marca.nombre, "es"))
    .slice(0, max)
    .map(({ marca, por }) => ({ marca, por }));
  return { igual, parecidas };
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

/** Cuenta parejas (marca, proveedor) por categoría a partir de productos recientes. */
export function contarParejasPorCategoria(
  productos: { categoria_id: string | null; marca_id: string; proveedor_id: string }[]
): Record<string, ParejaUso[]> {
  const conteo = new Map<string, Map<string, ParejaUso>>();
  for (const p of productos) {
    if (!p.categoria_id) continue;
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

export type FilaReposicion = { producto_id: string; proveedor_id: string; proveedor_nombre: string };
export type ReposicionProveedor = { proveedorId: string; proveedor: string; productos: number };

/** «A quién pedirle»: cuenta PRODUCTOS (no variantes) por proveedor, de más a menos. `fn_productos` devuelve una fila por variante, así que un producto con 6 tallas llega 6 veces y cuenta una. */
export function contarProductosPorProveedor(filas: FilaReposicion[]): ReposicionProveedor[] {
  const vistos = new Set<string>();
  const porProveedor = new Map<string, ReposicionProveedor>();
  for (const f of filas) {
    // Una fila sin proveedor (la base todavía sin el SQL de proveedores) no tiene a quién pedirle: se salta.
    if (!f.proveedor_id || vistos.has(f.producto_id)) continue;
    vistos.add(f.producto_id);
    const actual = porProveedor.get(f.proveedor_id) ?? { proveedorId: f.proveedor_id, proveedor: f.proveedor_nombre, productos: 0 };
    actual.productos += 1;
    porProveedor.set(f.proveedor_id, actual);
  }
  return [...porProveedor.values()].sort((a, b) => b.productos - a.productos || a.proveedor.localeCompare(b.proveedor, "es"));
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
