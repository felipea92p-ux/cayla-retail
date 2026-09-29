// Reglas puras del selector de marca y proveedor (Nuevo producto, Editar producto y el censo) — sin React ni red.
//
// Por qué existe: dos cosas viven acá, probadas, y la pantalla solo las pinta.
//   1. El formulario «Registrar marca o proveedor» cubre tres casos con un solo par de campos: marca nueva con un proveedor
//      que ya existe, marca nueva con proveedor nuevo, y un proveedor más para una marca que ya existe (spike v2,
//      2026-09-28): cuándo la pareja ya existe y cuándo se puede guardar.
//   2. Marca y proveedor por separado, cada uno filtrando al otro (ADR-0283, Felipe 2026-09-29): el buscador de parejas
//      (spike v2) se reemplazó por dos campos opcionales; ver más abajo.
//
// CONTRATO
//   PROMETE: para el formulario de registro, si la pareja elegida ya existe (y entonces no hay nada que registrar) y si ya se
//            puede guardar; para los dos campos, lo que se ofrece, lo que se suelta y lo que se pone solo.
//   ASUME:   la base es la que manda (`crear_marca` suma el proveedor si la marca existe, `on conflict do nothing` si la
//            pareja ya estaba); esto solo evita ofrecer lo que no hace falta. Las parejas se comparan por NOMBRE del
//            proveedor porque así llegan las marcas existentes (`MarcaConProveedores`), como en el resto del formulario.
//   NO HACE: no habla con la base ni decide si una marca «se parece» a otra (eso es `marcasParecidas`).

import type { MarcaOpcion, ProveedorOpcion, Vinculo } from "./marcas";

const ES = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** De la A a la Z como se lee en castellano (sin distinguir mayúsculas ni tildes). */
export function ordenarPorNombre<T extends { nombre: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => ES.compare(a.nombre, b.nombre));
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

// ---------- Marca y proveedor por separado, cada uno filtrando al otro (ADR-0283, Felipe 2026-09-29) ----------
//
// Un producto puede crearse sin marca y/o sin proveedor (llegó a almacén antes de que alguien registrara de quién es), y se
// completa después. Por eso el selector dejó de ser «una pareja o nada»: son dos campos, y elegir uno recorta y completa el
// otro. Lo que decide qué se ofrece y qué se pone solo vive acá, probado; la base sigue mandando (con LOS DOS puestos, tienen
// que ser una pareja registrada: llave compuesta).
//
// CONTRATO
//   PROMETE: dada la pareja que hay hoy y lo que la persona toca, la pareja que queda (sin contradicciones), qué se soltó y
//            qué se puso solo; y las opciones de cada campo, recortadas por el otro.
//   ASUME:   `vinculos` es TODA la tabla de parejas registradas (`marca_proveedores`); «» significa «todavía nada».
//   NO HACE: no habla con la base ni decide si se puede vaciar un valor ya guardado (eso es `problemaAlEditar`).

/** Las dos elecciones. «» = todavía nada. */
export type ParejaElegida = { marcaId: string; proveedorId: string };

/** Qué pasó además de lo que la persona tocó: `solto` = el otro campo no era compatible y se vació; `puestoSolo` = quedó un
 *  solo candidato y se puso solo. La pantalla lo dice en una línea para que nadie se pregunte de dónde salió. */
export type CambioDePareja = { pareja: ParejaElegida; solto: "marca" | "proveedor" | null; puestoSolo: "marca" | "proveedor" | null };

const carga = (vinculos: readonly Vinculo[], marcaId: string, proveedorId: string) => vinculos.some((v) => v.marcaId === marcaId && v.proveedorId === proveedorId);

/** Elegir (o quitar, con «») la marca. Si el proveedor de hoy no la trae, se suelta; si no queda proveedor y la marca la trae
 *  uno solo, se pone solo. Con varios candidatos no se elige ninguno: es de la persona. */
export function alElegirMarca(actual: ParejaElegida, marcaId: string, vinculos: readonly Vinculo[]): CambioDePareja {
  if (!marcaId) return { pareja: { marcaId: "", proveedorId: actual.proveedorId }, solto: null, puestoSolo: null };
  let proveedorId = actual.proveedorId;
  let solto: CambioDePareja["solto"] = null;
  if (proveedorId && !carga(vinculos, marcaId, proveedorId)) {
    proveedorId = "";
    solto = "proveedor";
  }
  let puestoSolo: CambioDePareja["puestoSolo"] = null;
  if (!proveedorId) {
    const unico = vinculos.filter((v) => v.marcaId === marcaId);
    if (unico.length === 1) {
      proveedorId = unico[0].proveedorId;
      puestoSolo = "proveedor";
    }
  }
  return { pareja: { marcaId, proveedorId }, solto, puestoSolo };
}

/** Lo mismo al revés: elegir (o quitar) el proveedor. */
export function alElegirProveedor(actual: ParejaElegida, proveedorId: string, vinculos: readonly Vinculo[]): CambioDePareja {
  if (!proveedorId) return { pareja: { marcaId: actual.marcaId, proveedorId: "" }, solto: null, puestoSolo: null };
  let marcaId = actual.marcaId;
  let solto: CambioDePareja["solto"] = null;
  if (marcaId && !carga(vinculos, marcaId, proveedorId)) {
    marcaId = "";
    solto = "marca";
  }
  let puestoSolo: CambioDePareja["puestoSolo"] = null;
  if (!marcaId) {
    const unica = vinculos.filter((v) => v.proveedorId === proveedorId);
    if (unica.length === 1) {
      marcaId = unica[0].marcaId;
      puestoSolo = "marca";
    }
  }
  return { pareja: { marcaId, proveedorId }, solto, puestoSolo };
}

/** Hasta `max` nombres y «+N»: «Taller Lima, Jacard +1». */
function resumirNombres(nombres: readonly string[], max: number): string {
  if (nombres.length <= max) return nombres.join(", ");
  return `${nombres.slice(0, max).join(", ")} +${nombres.length - max}`;
}

/** Las opciones del campo Marca. Con proveedor elegido, solo las marcas que él trae. `detalle` dice quién la trae (y por él se
 *  encuentra la marca tipeando el proveedor). `conservar` mantiene una marca ya guardada que hoy no viene en las listas activas. */
export function opcionesDeMarca(
  marcas: readonly MarcaOpcion[],
  proveedores: readonly ProveedorOpcion[],
  vinculos: readonly Vinculo[],
  proveedorId: string,
  conservar?: MarcaOpcion | null
): { valor: string; texto: string; detalle?: string }[] {
  const provPor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const lista = marcas.filter((m) => !proveedorId || carga(vinculos, m.id, proveedorId));
  if (conservar && conservar.id && !lista.some((m) => m.id === conservar.id)) lista.push(conservar);
  return ordenarPorNombre(lista).map((m) => {
    const quienes = vinculos.filter((v) => v.marcaId === m.id).map((v) => provPor.get(v.proveedorId)).filter((n): n is string => Boolean(n));
    return { valor: m.id, texto: m.nombre, detalle: quienes.length ? `la trae ${resumirNombres(quienes, 2)}` : undefined };
  });
}

/** Las opciones del campo Proveedor. Con marca elegida, solo quienes la traen. `detalle` dice qué marcas trae. */
export function opcionesDeProveedor(
  marcas: readonly MarcaOpcion[],
  proveedores: readonly ProveedorOpcion[],
  vinculos: readonly Vinculo[],
  marcaId: string,
  conservar?: ProveedorOpcion | null
): { valor: string; texto: string; detalle?: string }[] {
  const marcaPor = new Map(marcas.map((m) => [m.id, m.nombre]));
  const lista = proveedores.filter((p) => !marcaId || carga(vinculos, marcaId, p.id));
  if (conservar && conservar.id && !lista.some((p) => p.id === conservar.id)) lista.push(conservar);
  return ordenarPorNombre(lista).map((p) => {
    const cuales = vinculos.filter((v) => v.proveedorId === p.id).map((v) => marcaPor.get(v.marcaId)).filter((n): n is string => Boolean(n));
    return { valor: p.id, texto: p.nombre, detalle: cuales.length ? `trae ${resumirNombres(cuales, 3)}` : undefined };
  });
}

/** Al EDITAR: lo ya guardado se puede cambiar por otra cosa, pero no dejar en blanco (regla «no empeora», la misma de tejido y
 *  patrón: mandar nada = no tocar). Devuelve el mensaje de lo que falta, o null si se puede guardar. */
export function problemaAlEditar(guardado: ParejaElegida, actual: ParejaElegida): string | null {
  if (guardado.marcaId && !actual.marcaId && guardado.proveedorId && !actual.proveedorId) return "Este producto ya tenía marca y proveedor: cámbialos por otros, no se pueden dejar en blanco.";
  if (guardado.marcaId && !actual.marcaId) return "Este producto ya tenía marca: cámbiala por otra, no se puede dejar en blanco.";
  if (guardado.proveedorId && !actual.proveedorId) return "Este producto ya tenía proveedor: cámbialo por otro, no se puede dejar en blanco.";
  return null;
}

/** Lo que falta, dicho para el chip de la tarjeta: «Sin marca ni proveedor», «Sin marca», «Sin proveedor» o null si está completo. */
export function textoLoQueFalta(marca: string | null | undefined, proveedor: string | null | undefined): string | null {
  const sinMarca = !marca;
  const sinProveedor = !proveedor;
  if (sinMarca && sinProveedor) return "Sin marca ni proveedor";
  if (sinMarca) return "Sin marca";
  if (sinProveedor) return "Sin proveedor";
  return null;
}
