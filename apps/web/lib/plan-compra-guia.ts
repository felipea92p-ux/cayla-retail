// Guía de foco del plan de campaña (ADR-0284 aplicada a ADR-0349): qué está hecho, qué sigue y qué falta en la hoja de una categoría.
// No agrega reglas: cada campo está «hecho» cuando `problemasDelBorrador` (las mismas validaciones que la base) no le encuentra nada.
// La prueba exige que la guía deje confirmar exactamente cuando la base aceptaría.

import type { CampoDeGuia } from "./guia-campos";
import { problemaDelRecupero } from "./plan-compra-propuesta";
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
    campo("flojo", "Diciembre flojo", "Escribe cuántas venderías en un diciembre flojo."),
    campo("normal", "Diciembre normal", "Escribe cuántas venderías en un diciembre normal."),
    campo("bueno", "Diciembre bueno", "Escribe cuántas venderías en un diciembre bueno."),
    campo("precio", "Precio", "Escribe el precio de venta promedio."),
    campo("costo", "Costo", "Escribe el costo promedio por prenda."),
    campo("recupero", "Lo que sobra", "Escribe a qué % del precio vendes lo que sobre."),
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

/** La guía de «Nueva campaña» (ADR-0372): qué falta, en el orden en que se llena. «Hecho» es lo que `problemasDeLaCampana` ya acepta: la regla de la base. */
export function camposDeLaCampana(b: BorradorCampana, etiquetas: readonly EtiquetaCampana[], nombresEnUso: readonly string[], responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const p = problemasDeLaCampana(b, etiquetas, nombresEnUso);
  const campo = (id: "etiqueta" | "nombre" | "desde" | "hasta", nombre: string): CampoDeGuia => ({ id, nombre, requerido: true, hecho: !p[id], pendiente: p[id] ?? "Falta este dato." });
  return [
    campo("etiqueta", "Campaña de Etiquetas"),
    campo("nombre", "Nombre del plan"),
    campo("desde", "Desde"),
    campo("hasta", "Hasta"),
    { id: "responsable", nombre: "Quién crea la campaña", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién crea la campaña." },
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
