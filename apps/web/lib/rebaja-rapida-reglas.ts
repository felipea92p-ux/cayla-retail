/**
 * «Poner un %» (ADR-0669, Felipe 2026-11-16): la lógica pura de la hoja que abre al escanear una prenda en Campañas y ofertas. La base decide
 * (`poner_rebaja`, `quitar_rebaja`, 20261116182000); esto solo dice lo que la hoja muestra: qué % tiene la prenda, en qué lugares de % se
 * puede poner, cuánto quedaría, de dónde sale y qué falta para confirmar. No agrega reglas: el tope (70 %) y «una prenda, un lugar» son de la base.
 */
import type { CampoDeGuia } from "./guia-campos";
import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";

/** El tope de un %, el mismo de toda oferta (`rebaja_cajones_pct`, `poner_rebaja`). */
export const PCT_MAX_REBAJA = 70;

export type AlcanceRebaja = "prenda" | "modelo";

export type PrendaParaRebaja = {
  varianteId: string;
  productoId: string;
  referencia: string;
  codigo: string | null;
  color: string | null;
  colorHex: string | null;
  talla: string | null;
  /** Su precio en esta tienda. */
  precio: number;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null };
  foto: string | null;
  /** Cuántas prendas (tallas y colores) a la venta tiene su modelo, y en cuántos colores. */
  modeloPrendas: number;
  modeloColores: number;
  /** Bajo este precio se pierde plata (su costo), o null si no se sabe. La base no dice el costo: solo el piso. */
  piso: number | null;
};

/** Un % que la prenda ya tiene hoy en esta tienda y de dónde le llega. «movible»: se puede cambiar o quitar desde aquí. */
export type RebajaQueTiene = {
  etiquetaId: string;
  nombre: string;
  pct: number;
  como: "a_mano" | "categoria" | "oferta";
  esCajon: boolean;
  movible: boolean;
};

/** Un lugar de % de la tienda: un cajón o una campaña con ese % que rige aquí. */
export type LugarDeRebaja = {
  etiquetaId: string;
  nombre: string;
  pct: number;
  esCajon: boolean;
  movible: boolean;
  hasta: string | null;
  /** Le llega también a las prendas de sus categorías (no se quitan desde aquí, sino desde la campaña). */
  porCategoria?: boolean;
  /** Cuántas prendas (modelo en su color) le llegan: las marcadas y las de sus categorías. */
  prendas: number;
};

export type RebajaDePrenda = { prenda: PrendaParaRebaja; tiene: RebajaQueTiene[]; lugares: LugarDeRebaja[]; esLider: boolean };

const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN);
const texto = (x: unknown) => (typeof x === "string" && x !== "" ? x : null);
const obj = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

/** Lo que devuelve `campanas_rebaja_de_prenda`, como lo usa la hoja (o null si no se sabe leer). */
export function leerRebajaDePrenda(json: unknown): RebajaDePrenda | null {
  const j = obj(json);
  const p = obj(j.prenda);
  if (typeof p.variante_id !== "string") return null;
  const cat = obj(p.categoria);
  const piso = num(p.piso_sin_perder);
  return {
    prenda: {
      varianteId: p.variante_id,
      productoId: String(p.producto_id ?? ""),
      referencia: String(p.referencia ?? "Prenda"),
      codigo: texto(p.codigo),
      color: texto(p.color),
      colorHex: texto(p.color_hex),
      talla: texto(p.talla),
      precio: num(p.precio) || 0,
      categoria: { nombre: texto(cat.nombre), prefijo: texto(cat.prefijo), familia: texto(cat.familia) },
      foto: texto(p.foto),
      modeloPrendas: num(p.modelo_prendas) || 1,
      modeloColores: num(p.modelo_colores) || 1,
      piso: Number.isFinite(piso) && piso > 0 ? piso : null,
    },
    tiene: (Array.isArray(j.tiene) ? j.tiene : []).map((t) => {
      const x = obj(t);
      const como = x.como === "a_mano" || x.como === "categoria" ? x.como : "oferta";
      return { etiquetaId: String(x.etiqueta_id ?? ""), nombre: String(x.nombre ?? ""), pct: num(x.pct) || 0, como, esCajon: x.es_cajon === true, movible: x.movible === true };
    }),
    lugares: (Array.isArray(j.lugares) ? j.lugares : []).map((l) => {
      const x = obj(l);
      return {
        etiquetaId: String(x.etiqueta_id ?? ""),
        nombre: String(x.nombre ?? ""),
        pct: num(x.pct) || 0,
        esCajon: x.es_cajon === true,
        movible: x.movible === true,
        hasta: texto(x.hasta),
        porCategoria: x.por_categoria === true,
        prendas: num(x.prendas) || 0,
      };
    }),
    esLider: j.es_lider === true,
  };
}

/**
 * Un descuento de la lista de Campañas y ofertas (ADR-0677): un cajón de «Poner un %» con su %, si es de todas las tiendas, si rige en la
 * tienda que se mira y cuántas prendas tiene ahí (`campanas_descuentos`, 20261118001000).
 */
export type DescuentoDeLista = { etiquetaId: string; pct: number; todas: boolean; rigeAqui: boolean; activo: boolean; prendas: number };

/** Las filas de `campanas_descuentos` como las usa la pantalla. Sin forma conocida, `null`: la lista se dibuja sin la sección Descuentos. */
export function leerDescuentos(filas: unknown): DescuentoDeLista[] | null {
  if (!Array.isArray(filas)) return null;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  return filas
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null && typeof (f as { etiqueta_id?: unknown }).etiqueta_id === "string")
    .map((f) => ({
      etiquetaId: f.etiqueta_id as string,
      pct: num(f.pct),
      todas: f.todas === true,
      rigeAqui: f.rige_aqui === true,
      activo: f.activo === true,
      prendas: num(f.prendas) || 0,
    }))
    .filter((d) => Number.isFinite(d.pct));
}

/**
 * Las filas de «Descuentos» en la tienda que se mira: los activos que rigen ahí, del % menor al mayor y, con el mismo %, el de la tienda
 * antes que el de todas (Felipe 2026-11-17: son dos filas, y la de todas lo dice).
 */
export function descuentosDeLaTienda(lista: readonly DescuentoDeLista[]): DescuentoDeLista[] {
  return lista.filter((d) => d.activo && d.rigeAqui).sort((a, b) => a.pct - b.pct || Number(a.todas) - Number(b.todas));
}

/** Una talla marcada en un descuento, como la devuelve `campanas_rebaja_prendas` (con su precio en la tienda). */
export type PrendaDeLugar = {
  varianteId: string;
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  talla: string | null;
  precio: number;
};

/** Lo que la vitrina de la pantalla sabe de cada talla a la venta: su categoría y su foto (la prenda sin foto, ADR-0333). */
export type VitrinaDeTalla = {
  productoId: string;
  colorNombre: string | null;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null;
  fotoUrl: string | null;
};

/**
 * Una prenda del panel de un descuento (ADR-0677): un modelo en un color, como cuentan las tiendas y la fila de la lista, con las tallas
 * marcadas. Si no están todas las de ese color, el panel las nombra («Negro · S, M»). Quitarla saca todas sus tallas.
 */
export type PiezaDeDescuento = {
  clave: string;
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  categoria: VitrinaDeTalla["categoria"];
  fotoUrl: string | null;
  variantes: string[];
  tallas: string[];
  todasLasTallas: boolean;
  /** El precio de hoy en la tienda (el menor de sus tallas) y con el %. */
  precio: number;
  precioConPct: number;
  /** Con el %, alguna talla se vende por debajo de lo que costó (sin costo a la vista, nunca). */
  bajoCosto: boolean;
};

/** La clave de un modelo en un color: la misma para la talla que llega de la base y la de la vitrina. */
export const claveModeloColor = (productoId: string, color: string | null) => `${productoId}·${color ?? ""}`;

/**
 * Las prendas del panel: las tallas marcadas, juntas por modelo y color. Primero las que se agregaron recién (la más nueva arriba, para
 * verla llegar) y después por nombre y color. `tallasPorColor` dice cuántas tallas a la venta tiene cada modelo en su color, y `costos`
 * lo que costó cada talla (0 o ausente: sin costo a la vista).
 */
export function piezasDeDescuento(
  prendas: readonly PrendaDeLugar[],
  pct: number,
  datos: {
    vitrina: ReadonlyMap<string, VitrinaDeTalla> | null;
    tallasPorColor: ReadonlyMap<string, number>;
    costos: ReadonlyMap<string, number>;
    recientes?: readonly string[];
  },
): PiezaDeDescuento[] {
  const porClave = new Map<string, PiezaDeDescuento>();
  for (const p of prendas) {
    const clave = claveModeloColor(p.productoId, p.color);
    const vitrina = datos.vitrina?.get(p.varianteId) ?? null;
    const costo = datos.costos.get(p.varianteId) ?? 0;
    const bajo = costo > 0 && precioConPct(p.precio, pct) < costo;
    const ya = porClave.get(clave);
    if (ya) {
      ya.variantes.push(p.varianteId);
      if (p.talla) ya.tallas.push(p.talla);
      if (p.precio < ya.precio) ya.precio = p.precio;
      ya.bajoCosto ||= bajo;
      continue;
    }
    porClave.set(clave, {
      clave,
      productoId: p.productoId,
      referencia: p.referencia,
      color: p.color,
      colorHex: p.colorHex,
      categoria: vitrina?.categoria ?? null,
      fotoUrl: vitrina?.fotoUrl ?? null,
      variantes: [p.varianteId],
      tallas: p.talla ? [p.talla] : [],
      todasLasTallas: false,
      precio: p.precio,
      precioConPct: 0,
      bajoCosto: bajo,
    });
  }
  const recientes = datos.recientes ?? [];
  const lugarReciente = (clave: string) => {
    const i = recientes.indexOf(clave);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...porClave.values()]
    .map((pieza) => ({
      ...pieza,
      precioConPct: precioConPct(pieza.precio, pct),
      todasLasTallas: pieza.variantes.length >= (datos.tallasPorColor.get(pieza.clave) ?? Number.POSITIVE_INFINITY),
    }))
    .sort(
      (a, b) =>
        lugarReciente(a.clave) - lugarReciente(b.clave) ||
        a.referencia.localeCompare(b.referencia, "es") ||
        (a.color ?? "").localeCompare(b.color ?? "", "es"),
    );
}

/** La línea bajo el nombre: el color y, si no van todas sus tallas, cuáles. */
export function detalleDePieza(p: Pick<PiezaDeDescuento, "color" | "tallas" | "todasLasTallas">): string {
  return [p.color, p.todasLasTallas || p.tallas.length === 0 ? null : p.tallas.join(", ")].filter(Boolean).join(" · ");
}

/** «Descuento −10 %, 15 prendas, todas las tiendas»: lo que oye el lector de pantalla en la fila. */
export function nombreDeDescuento(d: Pick<DescuentoDeLista, "pct" | "prendas" | "todas">): string {
  return [`Descuento ${textoPct(d.pct)}`, `${d.prendas} ${d.prendas === 1 ? "prenda" : "prendas"}`, d.todas ? "todas las tiendas" : null].filter(Boolean).join(", ");
}

/** «−20 %», con hasta dos decimales y sin ceros de más. */
export function textoPct(pct: number): string {
  return `−${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))} %`;
}

/** Cómo se llama un lugar en su botón: el % solo si es un cajón; «−15 % · Para liquidar» si es una campaña. */
export function nombreDeLugar(l: Pick<LugarDeRebaja, "pct" | "nombre" | "esCajon">): string {
  return l.esCajon ? textoPct(l.pct) : `${textoPct(l.pct)} · ${l.nombre}`;
}

/** El precio con un %, al céntimo y con el mismo redondeo de la caja (ADR-0403). */
export function precioConPct(precio: number, pct: number): number {
  return totalDeLineas([{ cantidad: 1, precioUnitario: precio, descuentoUnitario: descuentoDeCampana(precio, pct) }]);
}

/** ¿Con este % queda por debajo de lo que costó? */
export function quedaBajoCosto(prenda: Pick<PrendaParaRebaja, "precio" | "piso">, pct: number): boolean {
  return prenda.piso !== null && pct > 0 && precioConPct(prenda.precio, pct) < prenda.piso;
}

/** Lo que se elige en la hoja: un lugar que ya existe, u «otro %» que se escribe. */
export type EleccionDePct = { tipo: "lugar"; etiquetaId: string } | { tipo: "otro"; pct: number | null } | null;

/** El % de lo elegido, o null si todavía no hay uno válido. */
export function pctElegido(e: EleccionDePct, lugares: readonly LugarDeRebaja[]): number | null {
  if (!e) return null;
  if (e.tipo === "lugar") return lugares.find((l) => l.etiquetaId === e.etiquetaId)?.pct ?? null;
  return e.pct !== null && Number.isFinite(e.pct) && e.pct > 0 && e.pct <= PCT_MAX_REBAJA ? e.pct : null;
}

/** «Otro %» que ya existe en la tienda: se usa ese lugar en vez de crear un cajón igual al lado (una campaña con ese % gana a un cajón nuevo). */
export function lugarConPct(pct: number, lugares: readonly LugarDeRebaja[]): LugarDeRebaja | null {
  const iguales = lugares.filter((l) => Math.round(l.pct * 100) === Math.round(pct * 100));
  return iguales.find((l) => l.esCajon) ?? iguales[0] ?? null;
}

/** Los lugares de los que sale la prenda al ponerla en `destino` (los que le llegan a mano y se pueden mover). */
export function saleDe(tiene: readonly RebajaQueTiene[], destinoId: string | null): string[] {
  return tiene.filter((t) => t.como === "a_mano" && t.movible && t.etiquetaId !== destinoId).map((t) => nombreDeLugar(t));
}

/** Lo que le sigue llegando aunque se ponga otro % (por categoría, por una oferta o de otra tienda): la caja cobra el mayor. */
export function sigueLlegando(tiene: readonly RebajaQueTiene[], destinoId: string | null): RebajaQueTiene[] {
  return tiene.filter((t) => !(t.como === "a_mano" && t.movible) && t.etiquetaId !== destinoId);
}

/** El % que cobrará la caja con lo elegido: el mayor entre lo elegido y lo que le sigue llegando. */
export function pctQueCobra(tiene: readonly RebajaQueTiene[], destinoId: string | null, pct: number | null): number {
  return Math.max(pct ?? 0, ...sigueLlegando(tiene, destinoId).map((t) => t.pct));
}

/** ¿Hay algo que «Quitar el %» pueda sacar? */
export function hayQueQuitar(tiene: readonly RebajaQueTiene[]): boolean {
  return tiene.some((t) => t.como === "a_mano" && t.movible);
}

/** Los campos de la guía de foco de la hoja: a qué, cuánto y quién. Sale de lo mismo que exige `poner_rebaja`. */
export function camposDeRebaja(c: { alcance: AlcanceRebaja | null; eleccion: EleccionDePct; pct: number | null; responsableListo: boolean; responsableMotivo: string | null }): CampoDeGuia[] {
  const escribiendoOtro = c.eleccion?.tipo === "otro";
  return [
    { id: "alcance", nombre: "A qué", requerido: true, hecho: c.alcance !== null, pendiente: "Elige si va solo a esta prenda o a todo el modelo." },
    {
      id: "pct",
      nombre: "Cuánto",
      requerido: true,
      hecho: c.pct !== null,
      pendiente: escribiendoOtro ? `Escribe un % de 1 a ${PCT_MAX_REBAJA}.` : "Elige cuánto menos.",
    },
    { id: "responsable", nombre: "Quién", requerido: true, hecho: c.responsableListo, pendiente: c.responsableMotivo ?? "Elige quién lo pone." },
  ];
}

/** El botón que confirma: «Poner −20 %», o «Poner el %» si todavía no se eligió. */
export function textoDelBoton(pct: number | null): string {
  return pct === null ? "Poner el %" : `Poner ${textoPct(pct)}`;
}

/** La prenda en una línea: «Blusa Emma · Negro · M». */
export function nombreDePrenda(p: Pick<PrendaParaRebaja, "referencia" | "color" | "talla">): string {
  return [p.referencia, p.color, p.talla].filter(Boolean).join(" · ");
}
