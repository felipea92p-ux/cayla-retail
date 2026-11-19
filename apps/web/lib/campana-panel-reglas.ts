// Lo que dice una campaña abierta en Campañas y ofertas (ADR-0677, actividad 6 de la maqueta `docs/maquetas/campanas-simple-2026-11/`):
// sus tres chips (estado, fechas, tiendas) y sus ofertas como carteles. Lógica pura, sin red: la pantalla solo la dibuja.
// La ficha con cada medida: `docs/milimetro/panel-de-campana.md`.

import type { VariantesDichas } from "./oferta-variantes";
import { alcanceDicho, ordenarReglas, reglasVivas, textoDiasCorto, titularDeOferta, vigenciaDeRegla, type ReglaCampana } from "./campana-reglas";
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
  /** Dónde y cuándo, solo lo que no es lo de su campaña: «Solo Tienda Lima · 25 nov – 30 nov · mar y jue». `null` si rige como la campaña.
   *  Lo pidió la prueba ciega de Formidable (2026-11-18): un «3 x 2 solo en Lima» y dos «−20 %» se veían iguales. */
  detalle: string | null;
  chip: { texto: string; tono: TonoChipCampana } | null;
};

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Lo de la campaña contra lo que se compara cada oferta: sus fechas y sus tiendas (vacío = todas), con los nombres de las tiendas. */
export type DondeDeLaCampana = { vigenteDesde: string | null; vigenteHasta: string | null; sedeIds: readonly string[]; tiendas: readonly TiendaOpcion[] };

/**
 * Las ofertas vivas de una campaña como carteles (las que no terminaron ni se retiraron), en el orden de la hoja (`ordenarReglas`). Sin ofertas
 * y con el descuento de siempre (`descuentoPct`, el de las campañas de antes de las ofertas), ese descuento es su único cartel. `nombre` nombra
 * categorías e insignias (sus ids no se repiten). Con `donde`, cada cartel dice en qué tiendas, qué fechas y qué días rige si no son los de su
 * campaña (`detalle`); una programada con fechas propias dice «Programada» (las fechas ya van en el detalle). `sueltasDe` dice las tallas y
 * colores sueltos de una oferta (ADR-0682): con un solo modelo, el cartel lo nombra («Blusa Emma (Negro S y M)»).
 */
export function cartelesDeCampana(
  reglas: readonly ReglaCampana[],
  hoy: string,
  nombre: (id: string) => string,
  descuentoPct: number | null,
  donde?: DondeDeLaCampana,
  sueltasDe?: (r: ReglaCampana) => VariantesDichas | null,
): CartelDeOferta[] {
  const vivas = ordenarReglas(reglasVivas(reglas, hoy), hoy);
  if (vivas.length === 0) {
    return descuentoPct !== null
      ? [{ id: "descuento", glifo: titularDeOferta({ tipo: "pct", porcentaje: descuentoPct, lleva: 0, paga: 0, monto: 0 }), en: "Toda la campaña", detalle: null, chip: null }]
      : [];
  }
  return vivas.map((r) => {
    const alcance = alcanceDicho(r, nombre, sueltasDe?.(r));
    const en = r.tipo === "monto" && r.cuenta !== "campana" ? "Toda la compra" : alcance ? conMayuscula(alcance) : "Toda la campaña";
    const propio = donde ? dondeYCuandoPropios(r, donde, hoy) : { texto: null, fechas: false };
    const v = vigenciaDeRegla(r, hoy);
    const chip =
      v === "borrador"
        ? { texto: "Borrador", tono: "neutro" as const }
        : v === "programada"
          ? { texto: propio.fechas ? "Programada" : `Desde el ${fechaCorta(r.desde)}`, tono: "ambar" as const }
          : null;
    return { id: r.id, glifo: titularDeOferta(r), en, detalle: propio.texto, chip };
  });
}

/** Las tiendas, las fechas y los días de una oferta que no son los de su campaña, en una línea («Solo Tienda Lima · 25 nov – 30 nov · mar y jue»). */
function dondeYCuandoPropios(r: ReglaCampana, d: DondeDeLaCampana, hoy: string): { texto: string | null; fechas: boolean } {
  // Una oferta sin tiendas rige en todas las de su campaña; una que las nombra todas, también.
  const deLaCampana = d.sedeIds.length > 0 ? d.sedeIds : d.tiendas.map((t) => t.id);
  const tiendasPropias = r.sedeIds.length > 0 && !deLaCampana.every((id) => r.sedeIds.includes(id));
  // Las fechas se comparan desde hoy: una oferta que ya rige empezó «con la campaña» aunque naciera días después (la hoja la abre desde hoy).
  const desdeHoy = (f: string | null) => (f && f > hoy ? f : hoy);
  const fechas = desdeHoy(r.desde) !== desdeHoy(d.vigenteDesde) || r.hasta !== d.vigenteHasta;
  const partes = [
    tiendasPropias ? textoSedesDeCampana(r.sedeIds, d.tiendas) : null,
    fechas ? rangoCorto(r.desde, r.hasta, hoy) : null,
    textoDiasCorto(r.dias) || null,
  ].filter((x): x is string => Boolean(x));
  return { texto: partes.length > 0 ? partes.join(" · ") : null, fechas };
}

/**
 * ¿Las prendas de la campaña las eligen sus ofertas? Una oferta viva que nombra categorías, modelos, tallas sueltas o insignias vivas, o un monto que cuenta toda
 * la compra, alcanza prendas por su cuenta: la campaña no está «sin prendas» aunque no tenga ninguna marcada ni categoría (antes lo decía).
 * La misma regla que «En qué prendas» de las tres preguntas (ADR-0655).
 */
export function prendasLasEligenSusOfertas(reglas: readonly ReglaCampana[], hoy: string, insigniaViva: (id: string) => boolean): boolean {
  return reglasVivas(reglas, hoy).some(
    (r) => r.categoriasSolo.length > 0 || r.productosSolo.length > 0 || r.variantesSolo.length > 0 || r.insigniasSolo.some(insigniaViva) || (r.tipo === "monto" && r.cuenta !== "campana"),
  );
}
