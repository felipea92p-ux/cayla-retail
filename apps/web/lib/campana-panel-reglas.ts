// Lo que dice una campaña abierta en Campañas y ofertas (ADR-0677, actividad 6 de la maqueta `docs/maquetas/campanas-simple-2026-11/`):
// sus tres chips (estado, fechas, tiendas) y sus ofertas como carteles. Lógica pura, sin red: la pantalla solo la dibuja.
// La ficha con cada medida: `docs/milimetro/panel-de-campana.md`.

import { alcanceDicho, ordenarReglas, reglasVivas, titularDeOferta, vigenciaDeRegla, type ReglaCampana } from "./campana-reglas";
import { chipDeTarjeta, textoSedesDeCampana, type TiendaOpcion } from "./etiqueta-campana";
import { vigenciaDe } from "./etiqueta-vigencia";
import { tramoDeCampana } from "./sellos-campanas";
import { diasEntre, fechaCorta, rangoCorto } from "./sellos-pases";

/** Los tonos de `<Chip>` que usa el panel (los mismos nombres). */
export type TonoChipCampana = "neutro" | "ambar" | "verde" | "pizarra" | "apagado";

export type ChipDeCampana = { clave: string; texto: string; tono: TonoChipCampana; title?: string; punto: boolean };

type CampanaParaChips = {
  activo: boolean;
  estado: "pendiente" | "aprobado" | "rechazado";
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  sedeIds: readonly string[];
};

/**
 * Los chips bajo el nombre: su estado (con el punto), sus fechas y en qué tiendas rige. `alcance` es a cuántas prendas llega (`null` si quien
 * mira no ve los conteos, o si sus ofertas eligen las prendas: ahí no se juzga si está lista). Lo que falta va en un chip ámbar aparte,
 * como en la tarjeta de siempre (`chipDeTarjeta`).
 */
export function chipsDeCampana(e: CampanaParaChips, hoy: string, tiendas: readonly TiendaOpcion[], alcance: number | null): ChipDeCampana[] {
  const chips: ChipDeCampana[] = [];
  const v = vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
  if (e.estado === "pendiente") chips.push({ clave: "estado", texto: "Por aprobar", tono: "ambar", punto: true });
  else if (e.estado === "rechazado") chips.push({ clave: "estado", texto: "Rechazada", tono: "apagado", punto: true });
  else if (!e.activo) chips.push({ clave: "estado", texto: "Desactivada", tono: "apagado", punto: true });
  else if (!v) chips.push({ clave: "estado", texto: "Guardada", tono: "neutro", punto: true });
  else {
    const c = chipDeTarjeta(v, alcance, hoy);
    if (c) {
      chips.push({ clave: "estado", texto: c.texto, tono: c.tono, title: c.title, punto: true });
      if (c.alerta) chips.push({ clave: "falta", texto: c.alerta, tono: "ambar", title: c.title, punto: true });
    }
  }
  chips.push({ clave: "fechas", texto: textoFechasDeCampana(e.vigenteDesde, e.vigenteHasta, hoy), tono: "neutro", punto: false });
  chips.push({ clave: "tiendas", texto: textoSedesDeCampana(e.sedeIds, tiendas) ?? "Todas las tiendas", tono: "pizarra", punto: false });
  return chips;
}

/** «16 – 30 nov · 12 días» si rige hoy (los que le quedan), «16 – 30 nov» si no, «Sin fechas» si no las tiene. */
export function textoFechasDeCampana(desde: string | null, hasta: string | null, hoy: string): string {
  const rango = rangoCorto(desde, hasta, hoy);
  if (!rango) return "Sin fechas";
  if (tramoDeCampana(desde, hasta, hoy) === "ahora" && hasta) {
    const n = diasEntre(hoy, hasta);
    return n === 0 ? `${rango} · último día` : `${rango} · ${n} ${n === 1 ? "día" : "días"}`;
  }
  return rango;
}

export type CartelDeOferta = {
  /** El id de la oferta, o «descuento» para el descuento de siempre de la campaña (sin ofertas). */
  id: string;
  /** Lo que da, en grande: «3 x 2», «−20 %», «S/ 30 menos desde S/ 300». */
  glifo: string;
  /** A qué: «Polos», «Toda la campaña», «Toda la compra». */
  en: string;
  chip: { texto: string; tono: TonoChipCampana } | null;
};

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Las ofertas vivas de una campaña como carteles (las que no terminaron ni se retiraron), en el orden de la hoja (`ordenarReglas`). Sin ofertas
 * y con el descuento de siempre (`descuentoPct`, el de las campañas de antes de las ofertas), ese descuento es su único cartel. `nombre` nombra
 * categorías e insignias (sus ids no se repiten).
 */
export function cartelesDeCampana(
  reglas: readonly ReglaCampana[],
  hoy: string,
  nombre: (id: string) => string,
  descuentoPct: number | null,
): CartelDeOferta[] {
  const vivas = ordenarReglas(reglasVivas(reglas, hoy), hoy);
  if (vivas.length === 0) {
    return descuentoPct !== null
      ? [{ id: "descuento", glifo: titularDeOferta({ tipo: "pct", porcentaje: descuentoPct, lleva: 0, paga: 0, monto: 0 }), en: "Toda la campaña", chip: null }]
      : [];
  }
  return vivas.map((r) => {
    const alcance = alcanceDicho(r, nombre);
    const en = r.tipo === "monto" && r.cuenta !== "campana" ? "Toda la compra" : alcance ? conMayuscula(alcance) : "Toda la campaña";
    const v = vigenciaDeRegla(r, hoy);
    const chip = v === "borrador" ? { texto: "Borrador", tono: "neutro" as const } : v === "programada" ? { texto: `Desde el ${fechaCorta(r.desde)}`, tono: "ambar" as const } : null;
    return { id: r.id, glifo: titularDeOferta(r), en, chip };
  });
}

/**
 * ¿Las prendas de la campaña las eligen sus ofertas? Una oferta viva que nombra categorías, modelos o insignias vivas, o un monto que cuenta toda
 * la compra, alcanza prendas por su cuenta: la campaña no está «sin prendas» aunque no tenga ninguna marcada ni categoría (antes lo decía).
 * La misma regla que «En qué prendas» de las tres preguntas (ADR-0655).
 */
export function prendasLasEligenSusOfertas(reglas: readonly ReglaCampana[], hoy: string, insigniaViva: (id: string) => boolean): boolean {
  return reglasVivas(reglas, hoy).some(
    (r) => r.categoriasSolo.length > 0 || r.productosSolo.length > 0 || r.insigniasSolo.some(insigniaViva) || (r.tipo === "monto" && r.cuenta !== "campana"),
  );
}
