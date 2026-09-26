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
