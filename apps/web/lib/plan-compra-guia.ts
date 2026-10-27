// Guía de foco del plan de campaña (ADR-0284 aplicada a ADR-0349): qué está hecho, qué sigue y qué falta en la hoja de una categoría.
// No agrega reglas: cada campo está «hecho» cuando `problemasDelBorrador` (las mismas validaciones que la base) no le encuentra nada.
// La prueba exige que la guía deje confirmar exactamente cuando la base aceptaría.

import type { CampoDeGuia } from "./guia-campos";
import type { DecisionDeCampana } from "./plan-compra-calendario";
import { problemasDeLaHoja, type BorradorDeCampanaDelCalendario, type ContextoDeLaHoja } from "./plan-compra-calendario-hoja";
import type { CampanaDelCalendario } from "./plan-compra-calendario-vista";
import { problemaDelRecupero } from "./plan-compra-propuesta";
import { problemaDeLosDias } from "./plan-compra-plazo";
import { problemasDeLosMinimos } from "./plan-compra-reparto";
import { problemaDelTope, problemasDeLaCampana, problemasDeLaEdicion, problemasDelBorrador, type BorradorCampana, type BorradorEdicion, type Borrador, type EtiquetaCampana, type TallaPlan } from "./plan-compra-reglas";

export function camposDelPlan(
  b: Borrador,
  tallas: readonly TallaPlan[],
  responsable: { listo: boolean; motivo: string | null }
): CampoDeGuia[] {
  const p = problemasDelBorrador(b, tallas);
  const campo = (id: keyof typeof p, nombre: string, pendiente: string): CampoDeGuia => ({ id, nombre, requerido: true, hecho: !p[id], pendiente: p[id] ?? pendiente });
  return [
    campo("flojo", "Flojo", "Escribe cuántas venderías si la campaña va floja."),
    campo("normal", "Normal", "Escribe cuántas venderías si la campaña va normal."),
    campo("bueno", "Bueno", "Escribe cuántas venderías si la campaña va buena."),
    campo("precio", "Precio", "Escribe el precio de venta promedio."),
    campo("costo", "Costo", "Escribe el costo promedio por prenda."),
    campo("recupero", "Lo que sobra", "Escribe a qué % del precio vendes lo que sobre."),
    // El descuento es opcional (vacío = sin descuento): solo bloquea si está mal escrito, como los mínimos del reparto. Viene sugerido por la campaña.
    { id: "descuento", nombre: "Descuento en la campaña", requerido: !!p.descuento, hecho: !p.descuento && (b.descuento ?? "").trim() !== "", pendiente: p.descuento ?? "Opcional." },
    // La curva viene propuesta por el sistema: solo falta si alguien la cambió y ya no suma 100.
    campo("curva", "Curva de tallas", "Revisa la curva de tallas."),
    { id: "responsable", nombre: "Quién arma el plan", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién arma el plan." },
  ];
}

/** La guía de la hoja del tope (ADR-0372): el monto y quién lo firma. «Hecho» es lo que `problemaDelTope` ya acepta: la misma regla que la base. */
export function camposDelTope(texto: string, responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const problema = problemaDelTope(texto);
  return [
    { id: "tope", nombre: "Tope de inversión", requerido: true, hecho: problema === null, pendiente: problema ?? "Escribe cuánto quieres invertir." },
    { id: "responsable", nombre: "Quién fija el tope", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién fija el tope." },
  ];
}

/** La guía de la hoja del plazo (ADR-0499): los días para llegar y quién los firma. «Hecho» es lo que `problemaDeLosDias` acepta: la misma regla que la base. */
export function camposDelPlazo(texto: string, responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const problema = problemaDeLosDias(texto);
  return [
    { id: "dias", nombre: "Días para llegar", requerido: true, hecho: problema === null, pendiente: problema ?? "Escribe cuántos días tarda un pedido en llegar." },
    { id: "responsable", nombre: "Quién fija el plazo", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién fija el plazo." },
  ];
}

/** La guía de «Armar el plan» de una campaña del calendario (ADR-0372, ADR-0525): qué falta, en el orden en que se llena. «Hecho» es lo que `problemasDeLaCampana` ya acepta: la regla de la base. */
export function camposDeLaCampana(
  b: BorradorCampana,
  etiquetas: readonly EtiquetaCampana[],
  nombresEnUso: readonly string[],
  responsable: { listo: boolean; motivo: string | null },
  propias: readonly Pick<DecisionDeCampana, "id" | "planes">[] = [],
): CampoDeGuia[] {
  const p = problemasDeLaCampana(b, etiquetas, nombresEnUso, propias);
  const campo = (id: "etiqueta" | "nombre" | "desde" | "hasta", nombre: string): CampoDeGuia => ({ id, nombre, requerido: true, hecho: !p[id], pendiente: p[id] ?? "Falta este dato." });
  // La campaña ya viene elegida (act. 2026-10-12 f): solo cuenta si mientras tanto alguien le armó el plan de ese año o la quitaron del calendario.
  return [
    ...(p.etiqueta ? [campo("etiqueta", "Campaña")] : []),
    campo("nombre", "Nombre del plan"),
    campo("desde", "Desde"),
    campo("hasta", "Hasta"),
    { id: "responsable", nombre: "Quién arma el plan", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién arma el plan." },
  ];
}

/**
 * La guía de la hoja «Configurar campaña» / «Campaña nueva» del Calendario (ADR-0525, ADR-0284): qué falta, en el orden en que se llena. «Hecho» es lo que `problemasDeLaHoja` ya
 * acepta: la regla de la base. Las fechas solo son obligatorias donde la base las exige (una propia, o una de Insignias que entra a mi plan y la insignia no las trae); el regreso de una
 * pausada es opcional (sin fecha, descansa hasta que la reactiven) y solo bloquea si está mal escrito.
 */
export function camposDeLaHojaDelCalendario(
  b: BorradorDeCampanaDelCalendario,
  c: CampanaDelCalendario | null,
  ctx: ContextoDeLaHoja,
  responsable: { listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const p = problemasDeLaHoja(b, c, ctx);
  const propia = c === null || c.esPropia;
  const lasPide = propia || (b.uso !== "no" && !c?.fechasDeLaInsignia);
  const fecha = (id: "desde" | "hasta", nombre: string, falta: string): CampoDeGuia => ({ id, nombre, requerido: lasPide || !!p[id], hecho: !p[id] && b[id] !== "", pendiente: p[id] ?? falta });
  return [
    ...(propia ? [{ id: "nombre", nombre: "Nombre de la campaña", requerido: true, hecho: !p.nombre, pendiente: p.nombre ?? "Escribe el nombre de la campaña." } satisfies CampoDeGuia] : []),
    fecha("desde", "Desde", "Escribe desde cuándo empieza."),
    fecha("hasta", "Hasta", "Escribe hasta cuándo dura."),
    ...(b.uso === "pausada"
      ? [{ id: "pausaHasta", nombre: "Hasta cuándo descansa", requerido: !!p.pausaHasta, hecho: !p.pausaHasta && b.pausaHasta !== "", pendiente: p.pausaHasta ?? "Opcional: sin fecha, descansa hasta que la reactives." } satisfies CampoDeGuia]
      : []),
    { id: "responsable", nombre: "Quién configura la campaña", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién configura la campaña." },
  ];
}

/** La guía de «Editar campaña» (ADR-0372, B5): nombre, fechas y quién la edita. «Hecho» es lo que `problemasDeLaEdicion` acepta: la regla de la base. */
export function camposDeLaEdicion(b: BorradorEdicion, otrosNombres: readonly string[], responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const p = problemasDeLaEdicion(b, otrosNombres);
  const campo = (id: "nombre" | "desde" | "hasta", nombre: string): CampoDeGuia => ({ id, nombre, requerido: true, hecho: !p[id], pendiente: p[id] ?? "Falta este dato." });
  return [
    campo("nombre", "Nombre del plan"),
    campo("desde", "Desde"),
    campo("hasta", "Hasta"),
    { id: "responsable", nombre: "Quién edita la campaña", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién edita la campaña." },
  ];
}

/** La guía de la hoja del reparto (ADR-0372): los mínimos son opcionales (en blanco = sin mínimo); falta solo lo que la base rechazaría y quién firma. */
export function camposDelReparto(textos: Readonly<Record<string, string>>, tiendas: readonly { id: string; nombre: string }[], responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const p = problemasDeLosMinimos(textos);
  return [
    // En blanco es opcional; mal escrito bloquea (la base lo rechazaría).
    ...tiendas.map((t): CampoDeGuia => ({ id: `minimo-${t.id}`, nombre: `Mínimo de ${t.nombre}`, requerido: !!p.porTienda[t.id], hecho: !p.porTienda[t.id] && (textos[t.id] ?? "").trim() !== "", pendiente: p.porTienda[t.id] ?? "Opcional." })),
    { id: "suma", nombre: "La suma de los mínimos", requerido: true, hecho: p.suma === null, pendiente: p.suma ?? "" },
    { id: "responsable", nombre: "Quién lo fija", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo fija." },
  ];
}

/** La guía de la hoja de «Lo que sobra» (ADR-0372, C5): el % y quién lo firma. «Hecho» es lo que `problemaDelRecupero` acepta: la regla de la base. */
export function camposDelRecupero(texto: string, responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const problema = problemaDelRecupero(texto);
  return [
    { id: "recupero", nombre: "Lo que sobra, en % del precio", requerido: true, hecho: problema === null, pendiente: problema ?? "Escribe el %." },
    { id: "responsable", nombre: "Quién lo fija", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo fija." },
  ];
}
