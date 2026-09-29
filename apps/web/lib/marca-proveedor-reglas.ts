// Reglas puras del selector de marca y proveedor de Nuevo producto (spike v2, 2026-09-28) — sin React ni red.
//
// Por qué existe: el selector dejó de mostrar «lo más usado» y pasó a ser SOLO un buscador sobre las parejas
// marca·proveedor, de la A a la Z (Felipe, 2026-09-28). Y el formulario «Registrar marca o proveedor» cubre ahora tres
// casos con un solo par de campos: marca nueva con un proveedor que ya existe, marca nueva con proveedor nuevo, y un
// proveedor más para una marca que ya existe. Lo que decide qué mostrar y cuándo se puede guardar vive acá, probado.
//
// CONTRATO
//   PROMETE: las opciones del buscador (una por pareja, A-Z por marca y luego por proveedor), y para el formulario:
//            si la pareja elegida ya existe (y entonces no hay nada que registrar) y si ya se puede guardar.
//   ASUME:   la base es la que manda (`crear_marca` suma el proveedor si la marca existe, `on conflict do nothing` si la
//            pareja ya estaba); esto solo evita ofrecer lo que no hace falta. Las parejas se comparan por NOMBRE del
//            proveedor porque así llegan las marcas existentes (`MarcaConProveedores`), como en el resto del formulario.
//   NO HACE: no habla con la base ni decide si una marca «se parece» a otra (eso es `marcasParecidas`).

import type { MarcaOpcion, ProveedorOpcion, Vinculo } from "./marcas";

/** Una fila del buscador: «CAYLA» con «la trae Taller Lima». `valor` junta los dos ids (un uuid no lleva «|»). */
export type OpcionPareja = { valor: string; texto: string; detalle: string };

const ES = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** De la A a la Z como se lee en castellano (sin distinguir mayúsculas ni tildes). */
export function ordenarPorNombre<T extends { nombre: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => ES.compare(a.nombre, b.nombre));
}

/** Una opción por pareja marca·proveedor, A-Z por marca y, dentro de una marca, por proveedor. Una pareja cuya marca o
 *  proveedor no está en las listas (desactivado) no se ofrece: no se podría guardar. */
export function opcionesDeParejas(marcas: readonly MarcaOpcion[], proveedores: readonly ProveedorOpcion[], vinculos: readonly Vinculo[]): OpcionPareja[] {
  const marcaPor = new Map(marcas.map((m) => [m.id, m.nombre]));
  const provPor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const filas: { valor: string; marca: string; proveedor: string }[] = [];
  const vistas = new Set<string>();
  for (const v of vinculos) {
    const marca = marcaPor.get(v.marcaId);
    const proveedor = provPor.get(v.proveedorId);
    const valor = valorPareja(v.marcaId, v.proveedorId);
    if (!marca || !proveedor || vistas.has(valor)) continue;
    vistas.add(valor);
    filas.push({ valor, marca, proveedor });
  }
  return filas
    .sort((a, b) => ES.compare(a.marca, b.marca) || ES.compare(a.proveedor, b.proveedor))
    .map((f) => ({ valor: f.valor, texto: f.marca, detalle: `la trae ${f.proveedor}` }));
}

export function valorPareja(marcaId: string, proveedorId: string): string {
  return `${marcaId}|${proveedorId}`;
}

export function separarPareja(valor: string): { marcaId: string; proveedorId: string } {
  const [marcaId = "", proveedorId = ""] = valor.split("|");
  return { marcaId, proveedorId };
}

/** Cuántas marcas distintas ofrece el buscador (para «Toca para ver las 84 marcas…»). */
export function cuantasMarcas(opciones: readonly OpcionPareja[]): number {
  return new Set(opciones.map((o) => separarPareja(o.valor).marcaId)).size;
}

/** «Hoy la trae Taller Lima» / «Hoy la traen Taller Lima, Jacard» / «Todavía no la trae nadie». */
export function textoQuienLaTrae(proveedores: readonly string[]): string {
  if (proveedores.length === 0) return "Todavía no la trae nadie";
  return `Hoy la trae${proveedores.length > 1 ? "n" : ""} ${proveedores.join(", ")}`;
}

/** Lo elegido en el formulario. La marca: una que existe (con quién la trae hoy) o una nueva. El proveedor: uno que
 *  existe, uno nuevo (razón social escrita) o todavía nada. */
export type MarcaDelFormulario = { nombre: string; existe: true; proveedores: readonly string[] } | { nombre: string; existe: false };
export type ProveedorDelFormulario = { tipo: "existente"; nombre: string } | { tipo: "nuevo"; razonSocial: string } | null;

/** Marca que ya existe + un proveedor que YA la trae: no hay nada que registrar (se elige en el buscador). */
export function parejaYaExiste(marca: MarcaDelFormulario | null, proveedor: ProveedorDelFormulario): boolean {
  return Boolean(marca?.existe && proveedor?.tipo === "existente" && marca.proveedores.includes(proveedor.nombre));
}

/** «Registrar y elegir» se habilita con marca y proveedor válidos, sin la pareja repetida y sin preguntas pendientes
 *  («¿no será una marca/un proveedor que ya existe?»: la pregunta está a la vista, justo arriba del botón). */
export function registroListo(marca: MarcaDelFormulario | null, proveedor: ProveedorDelFormulario, preguntasPendientes = 0): boolean {
  if (!marca || marca.nombre.trim() === "") return false;
  if (!proveedor) return false;
  if (proveedor.tipo === "nuevo" && proveedor.razonSocial.trim() === "") return false;
  if (parejaYaExiste(marca, proveedor)) return false;
  return preguntasPendientes === 0;
}
