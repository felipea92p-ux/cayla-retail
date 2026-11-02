// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601): cruzar la propuesta del SIRE con lo que el ERP registró del mismo mes.
//
// El problema: SUNAT arma la propuesta de compras con TODA factura electrónica emitida al RUC de CAYLA, y el contador suele aceptarla
// tal cual. Si una factura está en SUNAT y no en el ERP, es un gasto que nadie registró (o alguien usando el RUC); si está en el ERP y
// no en SUNAT, el proveedor no la envió o la anuló, y su IGV no se descuenta: se paga de más sin saberlo. Esta función dice cuáles.
//
// Lógica pura: las líneas de SUNAT (`sire-propuesta-reglas.ts`) y las filas del registro del ERP (`fn_impuestos_registro_compras`, el
// mismo que baja el contador) entran; sale cada comprobante con su estado. Se empareja por tipo + serie + número + RUC de la otra parte:
// es la llave de un comprobante en SUNAT (dos proveedores pueden tener la misma serie y número).

import { CODIGO_COMPROBANTE, type FilaRegistroCompras } from "./impuestos-reglas";
import { numeroSinCeros, type LineaSire } from "./sire-propuesta-reglas";
import { soles as solesExactos } from "./compras-reglas";

/** Hasta dónde dos montos son «el mismo»: el redondeo de céntimos entre el ERP y SUNAT no es una diferencia. */
export const TOLERANCIA_SOLES = 0.05;

export type EstadoCruce = "coincide" | "solo_sunat" | "solo_erp" | "montos" | "papel";

/** Lo que el ERP sabe de un comprobante, venga de una compra, del Taller, de un gasto de viaje o de una nota de crédito. */
export type ComprobanteErp = {
  origen: string;
  tipo: string;
  serie: string;
  numero: string;
  ruc: string | null;
  nombre: string;
  fecha: string;
  base: number;
  igv: number;
  total: number;
};

export type LineaCruce = {
  clave: string;
  estado: EstadoCruce;
  tipo: string;
  serie: string;
  numero: string;
  ruc: string | null;
  nombre: string;
  fecha: string;
  sunat: LineaSire | null;
  erp: ComprobanteErp | null;
  /** SUNAT menos ERP, solo cuando los dos lo tienen. */
  diferencia: { total: number; igv: number } | null;
  enDolares: boolean;
  /** En palabras de tienda: qué pasa y qué hacer. */
  motivo: string;
};

export type ResumenCruce = Record<EstadoCruce, { n: number; igv: number }>;
export type ResultadoCruce = { lineas: LineaCruce[]; resumen: ResumenCruce };

const redondear = (n: number) => Math.round(n * 100) / 100;
const soles = (n: number) => solesExactos(Math.abs(n));

/** La llave de un comprobante: «01|F001|1234|20100047218». */
export function claveComprobante(tipo: string, serie: string, numero: string, ruc: string | null): string {
  return [tipo.trim().padStart(2, "0"), serie.trim().toUpperCase(), numeroSinCeros(numero), (ruc ?? "").trim()].join("|");
}

/** Una serie que empieza con número («0001») es de un comprobante en papel: SUNAT no lo recibe y no aparece en la propuesta. */
export function esSerieDePapel(serie: string): boolean {
  return /^\d/.test(serie.trim());
}

/** Las filas del registro de compras del ERP en la forma del cruce. Los recibos por honorarios no van al Registro de Compras de SUNAT. */
export function comprobantesDeCompras(filas: readonly FilaRegistroCompras[]): ComprobanteErp[] {
  return filas
    .filter((f) => f.tipo !== "recibo_por_honorarios" && CODIGO_COMPROBANTE[f.tipo])
    .map((f) => ({
      origen: f.origen,
      tipo: CODIGO_COMPROBANTE[f.tipo]!,
      serie: f.serie.trim().toUpperCase(),
      numero: numeroSinCeros(f.numero),
      ruc: f.proveedorRuc,
      nombre: f.proveedor,
      fecha: f.fecha,
      base: f.base,
      igv: f.igv,
      total: f.total,
    }));
}

/** El total de SUNAT en soles: un comprobante en dólares se pasa con su tipo de cambio (si no lo trae, no se puede comparar). */
function totalEnSoles(l: LineaSire): number | null {
  if (l.moneda === "PEN") return l.total;
  return l.tipoCambio ? redondear(l.total * l.tipoCambio) : null;
}

function vacio(): ResumenCruce {
  return { coincide: { n: 0, igv: 0 }, solo_sunat: { n: 0, igv: 0 }, solo_erp: { n: 0, igv: 0 }, montos: { n: 0, igv: 0 }, papel: { n: 0, igv: 0 } };
}

/**
 * Cruza la propuesta de compras con el registro del ERP.
 *
 * - Las boletas del ERP solo se comparan si SUNAT trae boletas en su propuesta: si no, todas saldrían como «solo en el ERP» sin serlo.
 * - Un mismo comprobante registrado dos veces en el ERP: la primera se empareja, la segunda queda «solo en el ERP» y lo dice.
 * - Las notas de crédito van en negativo en el registro del ERP; se comparan los montos sin signo.
 */
export function cruzarCompras(sunat: readonly LineaSire[], erp: readonly ComprobanteErp[]): ResultadoCruce {
  const sunatTraeBoletas = sunat.some((l) => l.tipo === "03");
  const delErp = erp.filter((e) => e.tipo !== "03" || sunatTraeBoletas);
  const porClave = new Map<string, ComprobanteErp[]>();
  for (const e of delErp) {
    const k = claveComprobante(e.tipo, e.serie, e.numero, e.ruc);
    porClave.set(k, [...(porClave.get(k) ?? []), e]);
  }

  const lineas: LineaCruce[] = [];
  for (const s of sunat) {
    const clave = claveComprobante(s.tipo, s.serie, s.numero, s.docNumero);
    const lista = porClave.get(clave);
    const e = lista?.shift() ?? null;
    const enDolares = s.moneda !== "PEN";
    const comun = { clave, tipo: s.tipo, serie: s.serie, numero: s.numero, ruc: s.docNumero, fecha: s.fecha, sunat: s, enDolares };
    if (!e) {
      lineas.push({
        ...comun,
        estado: "solo_sunat",
        nombre: s.nombre ?? "Proveedor sin nombre",
        erp: null,
        diferencia: null,
        motivo: "El proveedor la emitió a nombre de CAYLA y no está en el ERP. Regístrala, o avisa si nadie la reconoce.",
      });
      continue;
    }
    const totalS = totalEnSoles(s);
    const difTotal = totalS === null ? null : redondear(Math.abs(totalS) - Math.abs(e.total));
    const difIgv = enDolares ? 0 : redondear(Math.abs(s.igv) - Math.abs(e.igv));
    // En dólares el redondeo del tipo de cambio mueve céntimos: se acepta 1 % del total.
    const tolerancia = enDolares ? Math.max(TOLERANCIA_SOLES, Math.abs(e.total) * 0.01) : TOLERANCIA_SOLES;
    const cuadra = difTotal !== null && Math.abs(difTotal) <= tolerancia && Math.abs(difIgv) <= TOLERANCIA_SOLES;
    lineas.push({
      ...comun,
      estado: cuadra ? "coincide" : "montos",
      nombre: e.nombre || s.nombre || "Proveedor sin nombre",
      erp: e,
      diferencia: difTotal === null ? null : { total: difTotal, igv: difIgv },
      motivo: cuadra
        ? "Cuadra con SUNAT."
        : difTotal === null
          ? "Está en dólares y SUNAT no trae el tipo de cambio: compárala a mano."
          : `SUNAT dice ${soles(totalS!)} y el ERP ${soles(e.total)}${Math.abs(difIgv) > TOLERANCIA_SOLES ? ` (IGV: ${soles(s.igv)} contra ${soles(e.igv)})` : ""}. Corrige el que esté mal.`,
    });
  }

  for (const [clave, restantes] of porClave) {
    const yaEmparejado = lineas.some((l) => l.clave === clave);
    for (const [i, e] of restantes.entries()) {
      const repetida = yaEmparejado || i > 0;
      const papel = esSerieDePapel(e.serie);
      lineas.push({
        clave,
        estado: papel ? "papel" : "solo_erp",
        tipo: e.tipo,
        serie: e.serie,
        numero: e.numero,
        ruc: e.ruc,
        nombre: e.nombre,
        fecha: e.fecha,
        sunat: null,
        erp: e,
        diferencia: null,
        enDolares: false,
        motivo: repetida
          ? "Está registrada dos veces en el ERP. Anula la que sobra."
          : papel
            ? "Factura en papel: SUNAT no la trae. El contador la agrega al completar la propuesta."
            : "Está en el ERP y SUNAT no la tiene: el proveedor no la envió o la anuló. Su IGV no se descuenta hasta que la envíe.",
      });
    }
  }

  const resumen = vacio();
  for (const l of lineas) {
    resumen[l.estado].n += 1;
    resumen[l.estado].igv = redondear(resumen[l.estado].igv + Math.abs(l.erp?.igv ?? l.sunat?.igv ?? 0));
  }
  const orden: Record<EstadoCruce, number> = { solo_erp: 0, solo_sunat: 1, montos: 2, papel: 3, coincide: 4 };
  lineas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave));
  return { lineas, resumen };
}

// ---- Resolver una diferencia (ADR-0601, actividad 2) ----------------------------------------------------------------------------
// Una diferencia no siempre es un error que se arregla registrando algo: lo de CLAURE sale con el RUC de CAYLA, una factura tardía se
// anota en otro mes. Lo que se decide queda en `sire_resoluciones` por la llave del comprobante; aquí solo se aplica a la lista.

export type DecisionSire = "es_de_claure" | "no_es_nuestra" | "otro_mes" | "pedida_al_proveedor" | "revisada";

export type ResolucionSire = { id: string; clave: string; decision: DecisionSire; nota: string | null; resueltaAt: string; resueltaPor: string | null };

/** Cómo se dice cada decisión en la lista, ya tomada. */
export const TEXTO_DECISION: Record<DecisionSire, string> = {
  es_de_claure: "Es de CLAURE",
  no_es_nuestra: "Nadie la reconoce",
  otro_mes: "Va en otro mes",
  pedida_al_proveedor: "Pedida al proveedor",
  revisada: "El ERP está bien",
};

export type OpcionDecision = { decision: DecisionSire; texto: string; ayuda: string };

/** Lo que se puede decidir según el caso. Lo que cuadra o es de papel no se resuelve: no hay nada que decidir. */
export function decisionesPara(estado: EstadoCruce): OpcionDecision[] {
  switch (estado) {
    case "solo_sunat":
      return [
        { decision: "es_de_claure", texto: "Es de CLAURE", ayuda: "Una compra de CLAURE que salió con el RUC de CAYLA: no va al ERP de CAYLA." },
        { decision: "otro_mes", texto: "Va en otro mes", ayuda: "Está registrada en el ERP con otra fecha, o el contador la anota en otro mes." },
        { decision: "no_es_nuestra", texto: "Nadie la reconoce", ayuda: "Nadie en CAYLA la pidió. Avísale al contador: alguien está usando el RUC." },
      ];
    case "solo_erp":
      return [
        { decision: "pedida_al_proveedor", texto: "Se la pedí al proveedor", ayuda: "El proveedor todavía no la envía a SUNAT. Su IGV se descuenta cuando la envíe." },
        { decision: "otro_mes", texto: "SUNAT la tiene en otro mes", ayuda: "La fecha del ERP y la de SUNAT no son del mismo mes." },
      ];
    case "montos":
      return [
        { decision: "pedida_al_proveedor", texto: "Le pedí la corrección al proveedor", ayuda: "El monto de SUNAT está mal: el proveedor emite una nota que lo corrige." },
        { decision: "revisada", texto: "El monto del ERP está bien", ayuda: "Lo revisaste con la factura en la mano: el contador usa el del comprobante." },
      ];
    default:
      return [];
  }
}

export type LineaConResolucion = LineaCruce & { resolucion: ResolucionSire | null };
export type CruceResuelto = { lineas: LineaConResolucion[]; resumen: ResumenCruce; resueltas: number };

/**
 * Pone a cada línea su resolución vigente y cuenta solo lo que queda por mirar: una diferencia resuelta sale de las cifras de arriba
 * (no se olvida: va al final de la lista con su decisión). Una resolución de una llave que ya no está en el cruce se ignora.
 */
export function aplicarResoluciones(r: ResultadoCruce, resoluciones: readonly ResolucionSire[]): CruceResuelto {
  const porClave = new Map(resoluciones.map((x) => [x.clave, x]));
  const resumen = vacio();
  let resueltas = 0;
  const lineas: LineaConResolucion[] = r.lineas.map((l) => {
    const resolucion = decisionesPara(l.estado).length > 0 ? (porClave.get(l.clave) ?? null) : null;
    if (resolucion) resueltas += 1;
    else {
      resumen[l.estado].n += 1;
      resumen[l.estado].igv = redondear(resumen[l.estado].igv + Math.abs(l.erp?.igv ?? l.sunat?.igv ?? 0));
    }
    return { ...l, resolucion };
  });
  // Lo resuelto baja al final, antes de lo que cuadra: lo que falta mirar sigue arriba.
  const peso = (l: LineaConResolucion) => (l.estado === "coincide" ? 2 : l.resolucion ? 1 : 0);
  lineas.sort((a, b) => peso(a) - peso(b));
  return { lineas, resumen, resueltas };
}
