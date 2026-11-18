// Crear el proveedor o la marca que no están, sin salir de Recibir (ADR-0635, Felipe 2026-11-09: «al momento de seleccionar el proveedor se pueda
// crear uno», «solo pida la razón social y el RUC (opcional)», «sin necesidad de tener los otros módulos»). Lógica pura: sin I/O ni React. Las
// hojas son `components/recepcion-conteo/ProveedorNuevoRecepcion.tsx` y `MarcaNuevaRecepcion.tsx`; la regla de verdad vive en
// `registrar_proveedor_de_recepcion` y `registrar_marca_de_recepcion` (20261109230000), de las que esto es espejo: aquí, lo que se le dice a
// quien escribe y lo que cuenta como «falta» en la guía de foco (ADR-0284: sale de lo que la base ya rechaza, y nada más).

import { soloDigitos, validarDocumento } from "@cayla-retail/shared";
import type { CampoDeGuia } from "./guia-campos";
import { esFalloDeRed, traducirError, type ErrorEscritura } from "./error-escritura";

export const RPC_PROVEEDOR_DE_RECEPCION = "registrar_proveedor_de_recepcion";
export const RPC_MARCA_DE_RECEPCION = "registrar_marca_de_recepcion";

/** Lo mismo que la base: la razón social va hasta 120 letras; la marca, de 2 a 60. */
export const TOPE_RAZON_SOCIAL = 120;
export const TOPES_MARCA = { min: 2, max: 60 } as const;

/** Lo que se escribe en la hoja del proveedor, tal cual (el RUC con espacios o guiones). */
export type BorradorProveedorRecepcion = { nombre: string; ruc: string };

const sinEspaciosDeMas = (texto: string) => texto.trim().replace(/\s+/g, " ");

export function problemaDeRazonSocial(nombre: string): string | null {
  const limpio = sinEspaciosDeMas(nombre);
  if (!limpio) return "Escribe la razón social del proveedor.";
  if (limpio.length > TOPE_RAZON_SOCIAL) return `La razón social va hasta ${TOPE_RAZON_SOCIAL} letras.`;
  return null;
}

/** El RUC es opcional: vacío no es un problema; escrito, tiene que ser un RUC de verdad (11 dígitos y su dígito verificador). */
export function problemaDelRucOpcional(ruc: string): string | null {
  if (soloDigitos(ruc).length === 0) return null;
  const v = validarDocumento("ruc", ruc);
  return v.valido ? null : v.motivo;
}

/**
 * La guía de la hoja del proveedor. La razón social es lo único obligatorio; el RUC solo cuenta si se escribió (y bloquea si está mal, o si ese RUC
 * ya es de otro proveedor de la lista: se elige ese). `preguntaPendiente`: hay un «¿no será uno que ya tienes?» sin contestar.
 */
export function camposProveedorRecepcion(
  b: BorradorProveedorRecepcion,
  { rucYaRegistrado = false, preguntaPendiente = false }: { rucYaRegistrado?: boolean; preguntaPendiente?: boolean } = {},
): CampoDeGuia[] {
  const problemaNombre = problemaDeRazonSocial(b.nombre) ?? (preguntaPendiente ? "Contesta si es uno que ya tienes." : null);
  const escrito = soloDigitos(b.ruc).length > 0;
  const problemaRuc = problemaDelRucOpcional(b.ruc) ?? (rucYaRegistrado ? "Ese RUC ya está registrado: elige a ese proveedor." : null);
  return [
    { id: "razon-social", nombre: "Razón social", requerido: true, hecho: problemaNombre === null, pendiente: problemaNombre ?? "" },
    { id: "ruc", nombre: "RUC", requerido: escrito, hecho: escrito && problemaRuc === null, pendiente: problemaRuc ?? "" },
  ];
}

/** Lo que se le manda a la función: la razón social sin espacios de más y el RUC solo con dígitos, o `null` si no se escribió. */
export function argsProveedorRecepcion(b: BorradorProveedorRecepcion): { p_nombre: string; p_ruc: string | null } {
  const ruc = soloDigitos(b.ruc);
  return { p_nombre: sinEspaciosDeMas(b.nombre), p_ruc: ruc ? ruc : null };
}

/** Lo que dice el aviso al terminar: si ya estaba, que se eligió ese (y que su ficha no tiene el RUC escrito, si es el caso: no se descarta en silencio). */
export function avisoProveedorRecepcion(res: { nombre: string; ruc: string | null; yaExistia: boolean }, escrito: BorradorProveedorRecepcion): { titulo: string; detalle?: string } {
  if (!res.yaExistia) return { titulo: `«${res.nombre}» registrado` };
  const rucEscrito = soloDigitos(escrito.ruc);
  return {
    titulo: `«${res.nombre}» ya estaba registrado: lo elegí`,
    detalle: rucEscrito !== "" && res.ruc !== rucEscrito ? "Esa ficha no tiene ese RUC cargado. Pídele a quien administra proveedores que se lo ponga." : undefined,
  };
}

/** El nombre de la marca como se guarda: sin espacios de más. */
export const nombreDeMarca = (nombre: string) => sinEspaciosDeMas(nombre);

export function problemaDelNombreDeMarca(nombre: string): string | null {
  const limpio = nombreDeMarca(nombre);
  if (limpio.length < TOPES_MARCA.min) return "Escribe el nombre de la marca, como dice su etiqueta.";
  if (limpio.length > TOPES_MARCA.max) return `El nombre de la marca va hasta ${TOPES_MARCA.max} letras.`;
  return null;
}

/** La guía de la hoja de la marca: el nombre (y contestar «¿no será…?» si se parece a una que existe) y quién la trae. */
export function camposMarcaRecepcion(nombre: string, proveedorId: string, { preguntaPendiente = false }: { preguntaPendiente?: boolean } = {}): CampoDeGuia[] {
  const problemaNombre = problemaDelNombreDeMarca(nombre) ?? (preguntaPendiente ? "Contesta si es una marca que ya existe." : null);
  return [
    { id: "marca-nombre", nombre: "Marca", requerido: true, hecho: problemaNombre === null, pendiente: problemaNombre ?? "" },
    { id: "marca-proveedor", nombre: "Quién la trae", requerido: true, hecho: proveedorId !== "", pendiente: "Elige quién te la trae, o agrégalo." },
  ];
}

/** Lo que devuelve `registrar_marca_de_recepcion`. `null` si la respuesta no tiene esa forma. */
export function leerMarcaRegistrada(data: unknown): { id: string; nombre: string; nueva: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.nombre !== "string") return null;
  return { id: r.id, nombre: r.nombre, nueva: r.nueva === true };
}

/**
 * Qué se le dice a quien intentó crear y no pudo. Los rechazos de la base ya traen su frase (ninguna repite el nombre ni el RUC escritos); aquí solo
 * se arma lo que la base no puede decir: la web publicada antes que la migración, la red, quién recibe.
 */
export function mensajeAltaRecepcion(error: ErrorEscritura | undefined | null, que: "el proveedor" | "la marca"): string {
  const hint = error?.hint ?? "";
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return `Crear ${que} desde Recibir todavía no está disponible. Pídele a tu líder que lo cree.`;
  }
  if (hint === "recibir_sin_modulo") return `Tu rol no puede crear ${que} al recibir. Pídeselo a tu líder.`;
  if (hint === "responsable_requerido") return "Elige quién recibe y vuelve a intentarlo.";
  if ((hint.startsWith("proveedor_") || hint.startsWith("marca_")) && error?.message) return error.message;
  if (esFalloDeRed(error ?? null)) return "No llegó la señal. Vuelve a intentarlo: si ya se había creado, no se duplica.";
  return traducirError(error ?? null, `crear ${que}`);
}

/** Lo creado en esta visita a Recibir: entra a las listas de la pantalla sin esperar a que la página relea (ADR-0635). */
export type AltasDeLaVisita = {
  proveedores: { id: string; nombre: string; ruc?: string | null }[];
  marcas: { id: string; nombre: string }[];
  vinculos: { marcaId: string; proveedorId: string }[];
};

export const SIN_ALTAS: AltasDeLaVisita = { proveedores: [], marcas: [], vinculos: [] };

export function conProveedor(a: AltasDeLaVisita, p: { id: string; nombre: string; ruc?: string | null }): AltasDeLaVisita {
  return a.proveedores.some((x) => x.id === p.id) ? a : { ...a, proveedores: [...a.proveedores, p] };
}

/** La marca (nueva, o la que ya existía) y quién la trae: el vínculo se suma una sola vez. */
export function conMarca(a: AltasDeLaVisita, r: { marca: { id: string; nombre: string }; proveedor: { id: string; nombre: string; ruc?: string | null } }): AltasDeLaVisita {
  const conProv = r.proveedor.nombre ? conProveedor(a, r.proveedor) : a;
  const yaVinculada = conProv.vinculos.some((v) => v.marcaId === r.marca.id && v.proveedorId === r.proveedor.id);
  return {
    ...conProv,
    marcas: conProv.marcas.some((m) => m.id === r.marca.id) ? conProv.marcas : [...conProv.marcas, r.marca],
    vinculos: yaVinculada ? conProv.vinculos : [...conProv.vinculos, { marcaId: r.marca.id, proveedorId: r.proveedor.id }],
  };
}

/** El catálogo de Recibir con lo creado en esta visita: las marcas nuevas en orden alfabético y sus vínculos sin repetir. `null` sigue siendo `null`. */
export function conAltas<C extends { marcas: { id: string; nombre: string }[]; vinculos: { marcaId: string; proveedorId: string }[] }>(catalogo: C | null, a: AltasDeLaVisita): C | null {
  if (!catalogo || (a.marcas.length === 0 && a.vinculos.length === 0)) return catalogo;
  const marcas = [...catalogo.marcas, ...a.marcas.filter((m) => !catalogo.marcas.some((x) => x.id === m.id))].sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  const vinculos = [...catalogo.vinculos, ...a.vinculos.filter((v) => !catalogo.vinculos.some((x) => x.marcaId === v.marcaId && x.proveedorId === v.proveedorId))];
  return { ...catalogo, marcas, vinculos };
}
