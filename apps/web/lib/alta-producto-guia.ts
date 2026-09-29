// «El hilo» del formulario "Nuevo producto" (ADR-0284): qué campo está hecho, cuál sigue y cuáles faltan — sin React ni red.
//
// CONTRATO
//   PROMETE: dado el estado del formulario, decir campo por campo si está hecho, si es el que sigue («Sigue aquí»), si falta
//            más adelante o si es opcional; qué le falta a cada paso, dicho como lo diría la persona; y si un paso merece
//            el ✓ de «hecho».
//   ASUME:   `problemasAlta` (lib/alta-producto.ts) sigue mandando en qué bloquea crear. Esta guía NO agrega reglas de
//            negocio: cada campo requerido se decide con los mismos datos de `EstadoAlta`, y una prueba (`alta-producto-guia
//            .test.ts`) exige que «requerido y sin hacer» y «problema de `problemasAlta`» digan lo mismo.
//   NO HACE: no bloquea nada por su cuenta. El único campo «sugerido» (colores) avisa y deja seguir: hay productos sin color
//            (un llavero, un cuaderno) y la base los admite.
//
// Por qué existe (2026-09-29, prueba con una trabajadora real): el formulario ya decía «qué falta», pero en letra chica al
// fondo de cada paso y en la columna de la derecha; los campos mismos no decían nada, y el paso 3 salía «Listo» sin haberlo
// abierto y con cero colores. La persona no sabía por dónde ir ni qué seguía.

import { faltaDelPaso, pasoHecho, type EstadoAlta, type PasoAlta, type Problema } from "./alta-producto";

/** Cada cosa que la persona llena o decide en el alta, en el orden en que la encuentra en pantalla. */
export type CampoAlta = "categoria" | "nombre" | "descripcion" | "marca" | "tejido" | "patron" | "tallas" | "colores" | "precio" | "stock" | "responsable";

/** Cómo se ve un campo en la guía: la marca de su título y el tinte de su fila. Vive en `lib/guia-campos.ts` (lo comparten los modales). */
export type { EstadoCampo } from "./guia-campos";
import type { EstadoCampo } from "./guia-campos";

export type CampoGuia = {
  id: CampoAlta;
  paso: PasoAlta;
  /** Como lo llama la persona: «Marca y proveedor». */
  nombre: string;
  /** Sin él no se puede crear (lo mismo que dice `problemasAlta`). */
  requerido: boolean;
  /** No bloquea, pero casi siempre se llena: hoy solo los colores. */
  sugerido: boolean;
  hecho: boolean;
  /** Lo que hay que hacer con él, en una frase: «Elige el tejido.». */
  pendiente: string;
};

/** Lo que el formulario sabe y `EstadoAlta` no lleva (no decide si se puede crear). */
export type ExtraGuia = {
  coloresElegidos: number;
  descripcionEscrita: boolean;
  /** Marca y proveedor elegidos. Desde ADR-0283 (2026-09-29) un producto se crea sin ellos: es un campo OPCIONAL y ya no vive en `EstadoAlta`. */
  marcaElegida: boolean;
  responsableListo: boolean;
};

export function camposDelAlta(e: EstadoAlta, x: ExtraGuia): CampoGuia[] {
  const precio = Number(e.precioBase);
  const precioOk = e.precioBase.trim() !== "" && Number.isFinite(precio) && precio > 0;
  const costo = Number(e.costoBase);
  const costoOk = e.costoBase.trim() === "" || (Number.isFinite(costo) && costo >= 0);
  const nombreOk = e.referencia.trim() !== "" && !e.nombreBloqueado && !e.nombreSinConfirmar && !e.comprobandoNombre;
  const configurar = (tipo: "tejidos" | "patrones") => `Habilita los ${tipo} de esta categoría.`;

  return [
    { id: "categoria", paso: 1, nombre: "Categoría", requerido: true, sugerido: false, hecho: Boolean(e.categoriaId), pendiente: "Elige qué producto es (familia y categoría)." },
    {
      id: "nombre",
      paso: 2,
      nombre: "Nombre",
      requerido: true,
      sugerido: false,
      hecho: nombreOk,
      // La misma frase que `problemasAlta` da en cada caso: «Revisa el nombre» a secas no dice qué hacer.
      pendiente: !e.referencia.trim()
        ? "Escribe el nombre del producto."
        : e.nombreBloqueado
          ? "Ya existe un producto con ese nombre."
          : e.nombreSinConfirmar
            ? "Confirma que es otro producto, o abre el que ya existe."
            : "Comprobando que el nombre no exista todavía…",
    },
    { id: "descripcion", paso: 2, nombre: "Descripción", requerido: false, sugerido: false, hecho: x.descripcionEscrita, pendiente: "Cuéntanos el corte, el largo, los detalles." },
    // Opcional (ADR-0283): nunca es «Sigue aquí» ni se lista como «falta»; solo lleva ✓ si se eligió.
    { id: "marca", paso: 2, nombre: "Marca y proveedor", requerido: false, sugerido: false, hecho: x.marcaElegida, pendiente: "Elige la marca y el proveedor, o déjalo para después." },
    {
      id: "tejido",
      paso: 2,
      nombre: "Tejido",
      requerido: e.exigeTejidoPatron,
      sugerido: false,
      hecho: Boolean(e.tejidoId),
      pendiente: e.hayTejidosEnCategoria ? "Elige el tejido." : configurar("tejidos"),
    },
    {
      id: "patron",
      paso: 2,
      nombre: "Patrón",
      requerido: e.exigeTejidoPatron,
      sugerido: false,
      hecho: Boolean(e.patronId),
      pendiente: e.hayPatronesEnCategoria ? "Elige el patrón (si no tiene diseño, elige Liso)." : configurar("patrones"),
    },
    {
      id: "tallas",
      paso: 3,
      nombre: "Tallas",
      requerido: true,
      sugerido: false,
      hecho: !e.categoriaSinTallas && e.tallasElegidas > 0,
      pendiente: e.categoriaSinTallas ? "Habilita las tallas de esta categoría." : "Elige al menos una talla.",
    },
    { id: "colores", paso: 3, nombre: "Colores", requerido: false, sugerido: true, hecho: x.coloresElegidos > 0, pendiente: "Elige los colores, o sigue así si no lleva." },
    { id: "precio", paso: 4, nombre: "Precio", requerido: true, sugerido: false, hecho: precioOk && costoOk, pendiente: costoOk ? "Pon el precio de venta." : "El costo no puede ser negativo." },
    {
      id: "stock",
      paso: 4,
      nombre: "Unidades de hoy",
      requerido: true,
      sugerido: false,
      hecho: e.stockInvalidas === 0 && (e.stockTotal > 0 || e.sinStock),
      pendiente: e.stockInvalidas > 0 ? "Las cantidades son números enteros, de 0 a 9999." : "Escribe cuántas tienes hoy, o marca que todavía no tienes.",
    },
    { id: "responsable", paso: 4, nombre: "Quién lo registra", requerido: true, sugerido: false, hecho: x.responsableListo, pendiente: "Elige quién lo registra." },
  ];
}

/** Lo que aún le falta a un campo para dejar de estar pendiente: requerido o sugerido, y sin hacer. */
const porHacer = (c: CampoGuia) => !c.hecho && (c.requerido || c.sugerido);

/** El campo que sigue DENTRO del paso abierto (el primero por hacer), o null si el paso no tiene nada pendiente. */
export function campoAhora(campos: readonly CampoGuia[], pasoAbierto: PasoAlta): CampoAlta | null {
  return campos.find((c) => c.paso === pasoAbierto && porHacer(c))?.id ?? null;
}

/** El estado de cada campo del paso ABIERTO: el primero por hacer es «ahora» (Sigue aquí), los demás por hacer «falta». Un campo
 *  de otro paso no lleva «ahora»: solo el paso abierto tiene un lugar donde estar parado. */
export function estadosDeCampos(campos: readonly CampoGuia[], pasoAbierto: PasoAlta): Record<CampoAlta, EstadoCampo> {
  const ahora = campoAhora(campos, pasoAbierto);
  const out = {} as Record<CampoAlta, EstadoCampo>;
  for (const c of campos) {
    out[c.id] = c.hecho ? "hecho" : c.id === ahora ? "ahora" : c.requerido || c.sugerido ? "falta" : "opcional";
  }
  return out;
}

/** Lo que falta en un paso, en el orden de pantalla. Incluye lo sugerido (colores): quien mira el pie debe verlo. */
export function faltanDelPaso(campos: readonly CampoGuia[], paso: PasoAlta): CampoGuia[] {
  return campos.filter((c) => c.paso === paso && porHacer(c));
}

/** Lo que falta hasta el paso dado, incluido lo que quedó pendiente atrás: el pie de un paso no puede decir «listo» con algo roto más
 *  arriba (se volvió a un paso anterior y se borró el nombre). */
export function faltanHastaElPaso(campos: readonly CampoGuia[], paso: PasoAlta): CampoGuia[] {
  return campos.filter((c) => c.paso <= paso && porHacer(c));
}

/** «Falta: marca y proveedor» / «Faltan: nombre, marca y tejido». Si solo quedan sugerencias (colores) no dice «falta» —crear ya se
 *  puede—: «Por revisar: colores». null si no queda nada. Para la lista «Avance» de la ficha. */
export function resumenFaltan(faltan: readonly CampoGuia[]): string | null {
  if (faltan.length === 0) return null;
  const nombres = faltan.map((c) => c.nombre.toLocaleLowerCase("es"));
  const lista = new Intl.ListFormat("es", { type: "conjunction" }).format(nombres);
  if (faltan.every((c) => !c.requerido)) return `Por revisar: ${lista}`;
  return `${faltan.length === 1 ? "Falta" : "Faltan"}: ${lista}`;
}

/** Lo que sigue en TODO el alta: el primer campo por hacer, sin importar el paso. `bloquea` es false cuando solo quedan sugerencias
 *  (crear ya se puede). */
export function siguienteDelHilo(campos: readonly CampoGuia[]): { campo: CampoGuia; bloquea: boolean } | null {
  const campo = campos.find(porHacer);
  if (!campo) return null;
  return { campo, bloquea: campos.some((c) => !c.hecho && c.requerido) };
}

/**
 * ¿Merece el ✓ un paso que NO está abierto? Solo si la persona ya lo abrió, no le falta nada y —salvo que sea anterior al
 * abierto— los pasos de atrás también están contestados. Antes bastaba con que no tuviera problemas: el paso 3 salía «Listo» sin
 * haberlo visitado, con las tallas que el sistema marca de antemano y cero colores (prueba con una trabajadora, 2026-09-29).
 */
export function pasoConfirmado(o: { paso: PasoAlta; abierto: PasoAlta; vistos: ReadonlySet<PasoAlta>; problemas: Problema[] }): boolean {
  if (!o.vistos.has(o.paso)) return false;
  if (faltaDelPaso(o.problemas, o.paso)) return false;
  return o.paso < o.abierto || pasoHecho(o.problemas, o.paso);
}
