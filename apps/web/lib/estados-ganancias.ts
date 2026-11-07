// Estados financieros ▸ Ganancias y pérdidas (ADR-0611, actividad 4; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): una cifra, una frase, cómo viene mes a
// mes y a dónde se fue lo que se vendió.
//
// PROMETE: de las filas de `fn_estado_resultados` salen las palabras y las partes de la pantalla. Las partes siempre suman: lo vendido menos las cuatro partes da la
// ganancia, porque salen de `cascadaGanamos`, que ya pone en su propio tramo lo que no se nombra.
// ASUME: toda cifra viene de la base. Aquí no se calcula plata: se agrupa, se compara y se escribe. Sin dato se dice, nunca un cero que no es.

import { solesCentimos, soles as solesEntero } from "./flujo-caja-reglas";
import { cascadaGanamos, NOTA_VENTAS_SIN_IGV, porSede, type DejaSede } from "./ganamos-reglas";
import { nombreCortoSede, SEDE_EMPRESA } from "./finanzas-telar-reglas";
import { chipContraAnterior, type ColumnaDeParte, type FilaDeParte, type ParteEstado } from "./estados-partes";
import { nombreDelAnterior, type Periodo } from "./estados-periodo";
import { pesoContra, type FilaInforme, type Informe } from "./estados-informe";
import type { FilaPpto } from "./presupuesto-reglas";
import type { TramoCascada } from "./pulso-reglas";
import type { FilaER } from "./resultados-reglas";

const conSigno = (t: TramoCascada) => (t.tipo === "entra" ? -t.monto : t.monto);

/** Lo que no es mercadería, sueldos ni local va junto en «Otros gastos». Es lo que una tienda reconoce de una mirada; el detalle lo abre. */
const EN_OTROS = new Set(["publicidad", "administracion", "caja", "otros", "desgaste", "ajustes"]);

export type MontosDeGanancias = { ventas: number; mercaderia: number; sueldos: number; local: number; otros: number; resultado: number };

/** Los cinco montos de la pantalla. Lo vendido menos los cuatro gastos da la ganancia. */
export function montosDeGanancias(f: FilaER, tramos: readonly TramoCascada[] = cascadaGanamos(f, [])): MontosDeGanancias {
  const de = (clave: string) => {
    const t = tramos.find((x) => x.clave === clave);
    return t ? conSigno(t) : 0;
  };
  const otros = tramos.filter((t) => EN_OTROS.has(t.clave)).reduce((a, t) => a + conSigno(t), 0);
  return { ventas: f.ventas, mercaderia: de("costo"), sueldos: de("planilla"), local: de("local"), otros, resultado: f.resultado };
}

const porciento = (v: number, ventas: number) => (ventas > 0 ? `${Math.round((Math.abs(v) / ventas) * 100)} % de lo vendido` : undefined);

export type ComparadaGanancias = { etiqueta: string; fila: FilaER | null };

function columnasDe(clave: keyof MontosDeGanancias, actual: MontosDeGanancias, comparadas: readonly ComparadaGanancias[], etiquetaActual: string): ColumnaDeParte[] {
  const pasadas = comparadas.filter((c) => c.fila).map((c) => ({ etiqueta: c.etiqueta, valor: montosDeGanancias(c.fila!)[clave], actual: false }));
  return [...pasadas, { etiqueta: etiquetaActual, valor: actual[clave], actual: true }];
}

const nombreDeUnidad = (s: Pick<DejaSede, "clave" | "nombre">) => (s.clave === SEDE_EMPRESA ? "Empresa" : nombreCortoSede(s.nombre));

function sueldosPorSede(datos: readonly FilaER[]): FilaDeParte[] {
  return datos
    .filter((f) => f.unidad !== "consolidado" && f.planilla > 0)
    .map((f) => ({ nombre: f.unidad === "empresa" ? "Empresa" : nombreCortoSede(f.nombre), valor: f.planilla }))
    .sort((a, b) => b.valor - a.valor);
}

function avisoDePlan(tramos: readonly TramoCascada[]): string | null {
  const conPlan = tramos.filter((t) => t.plan !== undefined);
  if (!conPlan.length) return null;
  const plan = conPlan.reduce((a, t) => a + t.plan!, 0);
  const sobre = conPlan.find((t) => t.desvio !== undefined && t.desvio >= 0.1);
  return `Lo planeado: ${solesCentimos(plan)}${sobre ? `. ${sobre.nombre} va ${Math.round(sobre.desvio! * 100)} % sobre lo planeado` : ""}.`;
}

/**
 * Las cinco partes: mercadería, sueldos, local y servicios, otros gastos, y lo que quedó o lo que faltó. Cuando faltó, esa parte tiene tarjeta pero no entra a la
 * barra: la barra es lo que se gastó, y sumarle lo que faltó contaría lo mismo dos veces.
 */
export function partesDeGanancias({
  fila,
  ppto,
  datos,
  veCadaSede,
  comparadas,
  etiquetaActual,
  periodo,
}: {
  fila: FilaER;
  ppto: readonly FilaPpto[];
  /** Todas las columnas del Estado de resultados: de ahí sale lo de cada sede. */
  datos: readonly FilaER[];
  /** Se mira CAYLA entera y la cuenta ve cada sede. */
  veCadaSede: boolean;
  /** Los períodos anteriores, del más viejo al más nuevo. */
  comparadas: readonly ComparadaGanancias[];
  etiquetaActual: string;
  periodo: Periodo;
}): ParteEstado[] {
  const tramos = cascadaGanamos(fila, ppto);
  const m = montosDeGanancias(fila, tramos);
  const anterior = nombreDelAnterior(periodo);
  const columnas = (clave: keyof MontosDeGanancias) => columnasDe(clave, m, comparadas, etiquetaActual);
  const chip = (clave: keyof MontosDeGanancias, buenoSubir: boolean | null) => chipContraAnterior(columnas(clave), anterior, buenoSubir, solesCentimos);
  const lineas = (clave: string): FilaDeParte[] => (tramos.find((t) => t.clave === clave)?.lineas ?? []).filter((l) => l.real !== 0).map((l) => ({ nombre: l.nombre, valor: l.real }));
  const deOtros = tramos.filter((t) => EN_OTROS.has(t.clave));
  const sedes = veCadaSede ? porSede(datos) : [];
  const gano = m.resultado >= 0;
  const gasto = (clave: "mercaderia" | "sueldos" | "local" | "otros", resto: Pick<ParteEstado, "clave" | "nombre" | "color" | "que" | "filas"> & { aviso?: string | null }): ParteEstado => ({
    ...resto,
    enBarra: Math.max(m[clave], 0),
    // Un gasto que quedó a favor suma: se escribe y se pinta como lo que es.
    texto: m[clave] < 0 ? `+${solesCentimos(-m[clave])}` : solesCentimos(m[clave]),
    ...(m[clave] < 0 ? { tono: "bien" as const } : {}),
    sub: porciento(m[clave], m.ventas),
    cifra: m[clave] < 0 ? -m[clave] : m[clave],
    columnas: columnas(clave),
    chip: chip(clave, null),
  });
  const partes: ParteEstado[] = [
    gasto("mercaderia", {
      clave: "mercaderia",
      nombre: "Mercadería",
      color: "var(--estados-parte-1)",
      que: "Lo que costó cada prenda vendida: su compra o lo que gastó el Taller en hacerla.",
      filas: lineas("costo"),
      aviso: fila.sinCosto > 0 ? `Hay ${fila.sinCosto} ${fila.sinCosto === 1 ? "prenda vendida" : "prendas vendidas"} sin costo: esta cifra se queda corta.` : null,
    }),
    gasto("sueldos", {
      clave: "sueldos",
      nombre: "Sueldos",
      color: "var(--estados-parte-2)",
      que: "Los sueldos del período, según las boletas.",
      filas: veCadaSede
        ? sueldosPorSede(datos)
        : fila.planillaEstimada > 0
          ? [
              { nombre: "Ya pagado", valor: fila.planilla - fila.planillaEstimada },
              { nombre: "Por pagar, estimado", valor: fila.planillaEstimada },
            ].filter((x) => x.valor > 0)
          : [],
      aviso: fila.planillaNota ?? avisoDePlan(tramos.filter((t) => t.clave === "planilla")),
    }),
    gasto("local", {
      clave: "local",
      nombre: "Local y servicios",
      color: "var(--estados-parte-3)",
      que: "Alquileres, luz, agua e internet.",
      filas: lineas("local"),
      aviso: avisoDePlan(tramos.filter((t) => t.clave === "local")),
    }),
    gasto("otros", {
      clave: "otros",
      // Si lo devuelto y los ajustes a favor pasan a los gastos, esta parte suma en vez de restar, y se dice.
      nombre: m.otros < 0 ? "Otros a favor" : "Otros gastos",
      color: "var(--estados-parte-4)",
      que: m.otros < 0 ? "Lo devuelto y los ajustes a favor del período pasaron a los gastos de esta parte." : "Lo demás del período. El desgaste es lo que pierden de valor los equipos: no sale plata.",
      filas: deOtros.map((t) => ({ nombre: t.nombre, valor: conSigno(t) })),
      aviso: avisoDePlan(deOtros),
    }),
    {
      clave: "resultado",
      nombre: gano ? "Te quedó" : m.ventas > 0 ? "Perdiste" : "Costó",
      color: gano ? "var(--color-verde)" : "var(--color-rojo)",
      enBarra: gano ? m.resultado : 0,
      texto: solesCentimos(Math.abs(m.resultado)),
      sub: porciento(m.resultado, m.ventas),
      tono: gano ? "bien" : m.ventas > 0 ? "mal" : undefined,
      que: m.ventas <= 0 && !gano ? "Lo que costó en estas fechas. No vende: lo cubren las tiendas." : sedes.length > 1 ? "Lo que quedó del período, y cuánto dejó cada sede. El Taller y la Empresa no venden: solo gastan." : gano ? "Lo que quedó después de pagar todo lo del período." : "Lo que faltó para cubrir el período.",
      cifra: m.resultado,
      filas: sedes.length > 1 ? sedes.map((s) => ({ nombre: nombreDeUnidad(s), valor: s.resultado })) : [],
      conSignos: true,
      columnas: columnas("resultado"),
      chip: chip("resultado", true),
    },
  ];
  // Lo que no pasó no se dibuja: una tarjeta en S/ 0 solo estorba. Lo que quedó siempre va: es la respuesta.
  return partes.filter((p) => p.clave === "resultado" || Math.round(p.cifra) !== 0);
}

export type LecturaDeGanancias = {
  valor: number;
  /** La cifra va en rojo. */
  mal: boolean;
  frase: string;
  chip: { texto: string; tono: "bien" | "mal" | null } | null;
  nota: string | null;
};

const QUE_NO_VENDE: Partial<Record<FilaER["unidad"], string>> = {
  taller: "El Taller no vende: sus prendas pasan a las tiendas a su costo. Esto es lo que costó tenerlo abierto.",
  empresa: "La empresa no vende: estos gastos los cubren las tiendas.",
};

/** La nota al pie: la razón de la cifra, en una línea. */
function notaDeGanancias(actual: MontosDeGanancias, antes: MontosDeGanancias | null, anterior: string): string | null {
  const { ventas: v, mercaderia, sueldos, local, otros, resultado } = actual;
  if (v <= 0) return null;
  if (resultado < 0) {
    const margen = (v - mercaderia) / v;
    if (margen <= 0) return `Lo que costó la mercadería ya pasa lo que vendiste: ${solesCentimos(mercaderia)} contra ${solesCentimos(v)}.`;
    const cubre = Math.round((sueldos + local + otros) / margen / 100) * 100;
    return `Para no perder hacía falta vender unos ${solesCentimos(cubre)}. Vendiste ${solesCentimos(v)}.`;
  }
  if (resultado > v) return null;
  if (!antes || antes.ventas <= 0) return `Te quedaron ${solesCentimos(resultado)} de ${solesCentimos(v)} vendidos.`;
  const dv = Math.round((v / antes.ventas - 1) * 100);
  const frente = anterior.startsWith("el ") ? `frente al ${anterior.slice(3)}` : `frente a ${anterior}`;
  if (dv < 0) return `Las ventas bajaron ${-dv} % ${frente}.`;
  if (dv === 0) return `Las ventas se mantuvieron ${frente}.`;
  if (antes.mercaderia <= 0) return `Las ventas subieron ${dv} % ${frente}.`;
  const dm = Math.round((mercaderia / antes.mercaderia - 1) * 100);
  if (dm < 0) return `Las ventas subieron ${dv} % y la mercadería bajó ${-dm} %.`;
  if (dm === dv) return `Las ventas y la mercadería subieron lo mismo: ${dv} %.`;
  return dm > dv ? `Las ventas subieron ${dv} % y la mercadería ${dm} %: cada sol vendido te costó un poco más.` : `Las ventas subieron ${dv} % y la mercadería ${dm} %: cada sol vendido te dejó un poco más.`;
}

/** Lo que dice la pantalla arriba: la cifra, la frase que la interpreta, contra qué se compara y la razón. */
export function lecturaDeGanancias(fila: FilaER | null, antes: FilaER | null, p: Periodo): LecturaDeGanancias {
  if (!fila) return { valor: 0, mal: false, frase: `Todavía no hay ventas ni gastos ${p.en}.`, chip: null, nota: null };
  const m = montosDeGanancias(fila);
  const r = Math.round(fila.resultado * 100) / 100;
  const vende = fila.ventas > 0;
  if (!vende && r === 0) return { valor: 0, mal: false, frase: `No hubo ventas ni gastos ${p.en}.`, chip: null, nota: null };
  const pc = vende ? Math.round((Math.abs(fila.resultado) / fila.ventas) * 100) : 0;
  const frase = !vende
    ? (QUE_NO_VENDE[fila.unidad] ?? `No hubo ventas ${p.en}: se gastaron ${solesCentimos(Math.abs(r))}.`)
    : r >= 0
      ? pc > 100
        ? `Ganaste ${p.en}: te quedó más de lo que vendiste, por ajustes a favor que no son ventas.`
        : `Ganaste ${p.en}: te quedó el ${pc} % de lo que vendiste.`
      : p.enCurso && p.unMes
        ? // Un mes a medias: las ventas van por día y los sueldos se cuentan desde el 29 del mes pasado. Se dice, para no asustar con la foto del día 6 (Felipe 2026-11-06).
          `Vas perdiendo ${p.en}: por cada ${solesEntero(100)} que vendiste, faltan ${solesEntero(pc)}. Las ventas llevan ${p.dias} ${p.dias === 1 ? "día" : "días"} y los sueldos corren desde el 29: el mes recién empieza.`
        : `Perdiste ${p.en}: por cada ${solesEntero(100)} que vendiste, faltaron ${solesEntero(pc)}.`;
  const anterior = nombreDelAnterior(p);
  const mAntes = antes ? montosDeGanancias(antes) : null;
  const d = mAntes ? Math.round((r - mAntes.resultado) * 100) / 100 : 0;
  const chip = !mAntes ? null : d === 0 ? { texto: `Igual que ${anterior}`, tono: null } : { texto: `${solesCentimos(Math.abs(d))} ${d > 0 ? "más" : "menos"} que ${anterior}`, tono: d > 0 ? ("bien" as const) : ("mal" as const) };
  return { valor: r, mal: r < 0 && vende, frase, chip, nota: notaDeGanancias(m, mAntes, anterior) };
}


/**
 * Ganancias y pérdidas como informe (camino A, 2026-11-06): lo vendido, cada gasto que resta, lo que queda de las prendas y el resultado, con las columnas de
 * antes al lado y lo que pesa cada fila contra lo vendido. Las frases y el detalle de cada fila salen de las mismas partes de siempre (`partesDeGanancias`).
 */
export function informeDeGanancias({
  fila,
  partes,
  comparadas,
  etiquetaActual,
}: {
  fila: FilaER;
  partes: readonly ParteEstado[];
  /** Los períodos anteriores, del más viejo al más nuevo. Uno que no se pudo leer va con `fila: null`. */
  comparadas: readonly ComparadaGanancias[];
  etiquetaActual: string;
}): Informe {
  const m = montosDeGanancias(fila);
  const antes = comparadas.map((c) => (c.fila ? montosDeGanancias(c.fila) : null));
  const valores = (de: (x: MontosDeGanancias) => number) => [...antes.map((a) => (a ? de(a) : null)), de(m)];
  const parte = (clave: string) => partes.find((p) => p.clave === clave);
  const deParte = (clave: string) => {
    const p = parte(clave);
    return p ? { que: p.que, detalle: p.filas, aviso: p.aviso ?? null } : {};
  };
  const gasto = (clave: "mercaderia" | "sueldos" | "local" | "otros", nombre: string, contable: string): FilaInforme => ({
    clave,
    nombre: m[clave] < 0 ? `${nombre} a favor` : nombre,
    contable,
    tipo: "linea",
    resta: true,
    valores: valores((x) => x[clave]),
    peso: pesoContra(m[clave], m.ventas),
    ...deParte(clave),
  });
  const gano = m.resultado >= 0;
  const filas: FilaInforme[] = [
    { clave: "ventas", nombre: "Lo que vendiste", contable: "Ventas netas", tipo: "linea", valores: valores((x) => x.ventas), peso: m.ventas > 0 ? "100 %" : null, que: NOTA_VENTAS_SIN_IGV },
    gasto("mercaderia", "Mercadería", "Costo de ventas"),
    { clave: "bruta", nombre: "Te queda de las prendas", contable: "Utilidad bruta", tipo: "subtotal", valores: valores((x) => x.ventas - x.mercaderia), peso: pesoContra(m.ventas - m.mercaderia, m.ventas) },
    gasto("sueldos", "Sueldos", "Gastos de personal"),
    gasto("local", "Local y servicios", "Local y servicios"),
    gasto("otros", "Otros gastos", "Otros gastos"),
    {
      clave: "resultado",
      nombre: gano ? "Te quedó" : m.ventas > 0 ? "Perdiste" : "Costó",
      contable: "Resultado del período",
      tipo: "total",
      valores: valores((x) => x.resultado),
      peso: m.ventas > 0 ? `${gano ? "" : "−"}${pesoContra(m.resultado, m.ventas)}` : null,
      tono: gano ? "bien" : m.ventas > 0 ? "mal" : null,
      ...deParte("resultado"),
    },
  ];
  return {
    titulo: "Ganancias y pérdidas",
    columnas: [...comparadas.map((c) => ({ etiqueta: c.etiqueta, actual: false })), { etiqueta: etiquetaActual, actual: true }],
    pesoDe: m.ventas > 0 ? "De lo vendido" : null,
    // Un gasto que no pasó en ninguna columna no se dibuja: una fila en S/ 0 solo estorba.
    filas: filas.filter((f) => f.tipo !== "linea" || f.clave === "ventas" || f.valores.some((v) => v !== null && Math.abs(v) >= 0.005)),
  };
}
