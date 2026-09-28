/**
 * Textos de la ventana «Eliminar producto» (Productos ▸ Eliminar; ADR-0218 y ADR-0252).
 *
 * La REGLA de qué se puede eliminar no vive aquí: vive en la base (`fn_producto_historia`, la única definición de
 * «historia» de un producto, que usan `fn_producto_como_eliminar` y las dos funciones que borran). Este archivo solo
 * redacta lo que se le dice al líder o al Admin con lo que la base contestó: qué se borra, o por qué no y qué hacer.
 */

import { fechaLima } from "./colaboradores-reglas";

/**
 * Los cuatro casos que distingue la base (`fn_producto_como_eliminar`):
 *  - `libre`: nunca se movió. Lo elimina un Líder o un Admin (`eliminar_producto`).
 *  - `con_historia`: su historia es solo de stock (carga, ajustes, bajadas, conteos…). Solo un Admin, con respaldo
 *    (`eliminar_producto_con_historia`).
 *  - `con_documentos`: tiene ventas, compras, traslados, separaciones… Nadie lo elimina desde aquí: se desactiva.
 *  - `sistema`: la pieza «Monto manual» del punto de venta. Nunca.
 */
export type NivelEliminar = "libre" | "con_historia" | "con_documentos" | "sistema";

export type ComoEliminar = {
  nivel: NivelEliminar;
  /** Si ESTA cuenta puede hacerlo (lo decide la base, no la pantalla). */
  puedes: boolean;
  /** Lista para mostrar: «tiene movimientos de stock (7), unidades en stock (13)» o «es una pieza del sistema: …». */
  razon: string | null;
  prendas: number;
  movimientos: number;
  /** Quién hizo el primer movimiento del producto y cuándo: para no borrar sin darse cuenta el trabajo de otra persona. */
  cargadoPor: string | null;
  cargadoEl: string | null;
};

const NIVELES: readonly NivelEliminar[] = ["libre", "con_historia", "con_documentos", "sistema"];

/** PostgREST entrega la fila única de una función que devuelve `table (…)` como arreglo; se acepta también un objeto suelto.
 *  Cualquier otra forma es `null`: la ventana lo trata como «no se pudo comprobar» y NO ofrece borrar a ciegas. */
export function leerComoEliminar(datos: unknown): ComoEliminar | null {
  const fila = Array.isArray(datos) ? datos[0] : datos;
  if (!fila || typeof fila !== "object") return null;
  const f = fila as Record<string, unknown>;
  if (typeof f.nivel !== "string" || !NIVELES.includes(f.nivel as NivelEliminar) || typeof f.puedes !== "boolean") return null;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    nivel: f.nivel as NivelEliminar,
    puedes: f.puedes,
    razon: texto(f.razon),
    prendas: numero(f.prendas),
    movimientos: numero(f.movimientos),
    cargadoPor: texto(f.cargado_por),
    cargadoEl: texto(f.cargado_el),
  };
}

/** ¿Hay un botón de eliminar que la base va a aceptar? Solo cuando se puede Y esta cuenta puede. */
export function ofreceEliminar(como: ComoEliminar): boolean {
  return como.puedes && (como.nivel === "libre" || como.nivel === "con_historia");
}

/** La función que borra en cada caso. `null`: no hay nada que llamar. */
export function rpcParaEliminar(como: ComoEliminar): "eliminar_producto" | "eliminar_producto_con_historia" | null {
  if (!ofreceEliminar(como)) return null;
  return como.nivel === "libre" ? "eliminar_producto" : "eliminar_producto_con_historia";
}

/** El número en palabras del negocio: «su única variante» / «sus 3 variantes». */
function variantesEn(n: number): string {
  return n === 1 ? "su única variante" : `sus ${n} variantes`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Qué se borra si se confirma un producto que nunca se movió. */
export function textoSeBorra(numVariantes: number): string {
  return `Nunca se vendió ni se movió, así que se borra por completo: su ficha, ${variantesEn(numVariantes)}, sus códigos de barras y sus fotos. No se puede deshacer.`;
}

/** «Lo cargó Danixa Pérez el 27/09/2026.» — o nada, si no se sabe. */
export function textoQuienLoCargo(cargadoPor: string | null, cargadoEl: string | null): string | null {
  if (!cargadoEl) return null;
  return `Lo cargó ${cargadoPor ?? "alguien sin nombre registrado"} el ${fechaLima(cargadoEl)}.`;
}

/** Qué se borra si un Admin confirma un producto con historia de stock. */
export function textoSeBorraConHistoria(numVariantes: number, prendas: number, movimientos: number): string {
  const cuanto = [prendas > 0 ? plural(prendas, "prenda en stock", "prendas en stock") : null, plural(movimientos, "movimiento", "movimientos")]
    .filter(Boolean)
    .join(" y ");
  return `Ya se movió (${cuanto}), pero nunca se vendió ni se compró. Se borra todo: su ficha, ${variantesEn(numVariantes)}, su stock en todas las sedes y ese historial.`;
}

/** Lo que queda después (para quien confirma): el respaldo, la Actividad, y a quién pedirle volver atrás. */
export const TEXTO_RESPALDO =
  "Queda un respaldo y una línea en Actividad con tu nombre. Si fue un error, avísale a Felipe ese mismo día: con el respaldo se puede devolver.";

/**
 * Por qué NO se puede, según el caso.
 *
 * Con historia y en 0, se dice primero que no hay unidades: la tarjeta dice «Sin stock» y, sin esa frase, «tiene
 * movimientos de stock (12)» se leía como «le quedan 12» (Felipe, 2026-09-28, con «Fdhh»: 6 entradas y 6 ajustes que la
 * dejaron en 0). El número cuenta registros de su historia, no prendas; las prendas las trae la base aparte (`prendas`).
 */
export function textoNoSePuede(referencia: string, como: Pick<ComoEliminar, "nivel" | "razon" | "prendas">): string {
  const razon = como.razon ?? "ya se usó";
  switch (como.nivel) {
    case "sistema":
      return `«${referencia}» ${razon}.`;
    case "con_documentos":
      return `«${referencia}» ${razon}. Del otro lado hay una clienta, un proveedor, otra sede o dinero, y eso no se borra desde aquí.`;
    case "con_historia": {
      const quien = "Solo una cuenta Admin puede eliminarlo con su historia.";
      if (como.prendas > 0 || !razon.startsWith("tiene ")) return `«${referencia}» ${razon}. ${quien}`;
      return `«${referencia}» no tiene unidades en stock, pero ya tiene historia: ${razon.replace(/^tiene /, "")}. ${quien}`;
    }
    default:
      return `«${referencia}» ${razon}.`;
  }
}

/**
 * La salida que se le ofrece cuando no se puede eliminar. Una pieza del sistema no se retira de ninguna manera. Con el
 * producto todavía activo, la salida es descontinuarlo desde Editar (el mismo interruptor Activo/Descontinuado que ya
 * existe); si ya está descontinuado, no hay nada más que hacer.
 */
export function salidaSinEliminar(estado: string, nivel: NivelEliminar): { texto: string; irAEditar: boolean } | null {
  if (nivel === "sistema") return null;
  if (estado === "activo") {
    return { texto: "Si ya no lo quieres a la venta, márcalo como descontinuado: su historia se conserva.", irAEditar: true };
  }
  return { texto: "Ya está descontinuado: su historia se conserva.", irAEditar: false };
}
