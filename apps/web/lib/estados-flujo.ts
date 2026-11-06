// Estados financieros ▸ Flujo de efectivo (ADR-0611, actividad 5; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): con cuánta plata terminaste, una frase, y por qué cambió.
//
// PROMETE: de `fn_flujo_caja_real` salen las palabras, las partes y las columnas. Las columnas cuadran: cada parte empieza donde terminó la anterior, porque son los totales de
// `partesDelFlujo` y la base exige que empezar + moverse = terminar (si no, `descuadre` lo dice y la pantalla también).
// ASUME: toda cifra viene de la base. Aquí no se suma plata nueva: se agrupa lo que ya dio y se escribe. Con una cuenta que arrancó a mitad del período (ADR-0609) no se afirma
// cuánto subió o bajó: no se sabe.

import { chipContraAnterior, type ColumnaDeParte, type FilaDelLibro, type ParteEstado } from "./estados-partes";
import { nombreDelAnterior, type Periodo } from "./estados-periodo";
import { solesCentimos, solesConSignoCentimos, type FlujoReal } from "./flujo-caja-reglas";
import { loQueNoCubre, montoDe, partesDelFlujo, type Actividad } from "./plata-reglas";
import { mesNombre } from "./resultados-reglas";

/** Montos con céntimos (Felipe 2026-11-06): la pantalla los escribe con dos decimales, así que no se redondean al sol. */
const aCentimos = (n: number) => Math.round(n * 100) / 100;

const QUE_ES: Record<Actividad, string> = {
  operacion: "Lo que cobraste a clientes menos lo que pagaste para operar.",
  inversion: "Muebles y máquinas: salió la plata, pero siguen siendo tuyos.",
  financiamiento: "Lo que pusiste, lo que retiraste y las deudas que pagaste.",
  ajustes: "Faltantes de caja y plata que pasa de una cuenta a otra.",
};

const totalDe = (real: Pick<FlujoReal, "categorias">, clave: Actividad) => partesDelFlujo(real).find((p) => p.clave === clave)?.total ?? 0;

export type LecturaDelFlujo = {
  valor: number;
  mal: boolean;
  frase: string;
  chip: { texto: string; tono: "bien" | "mal" | null } | null;
  nota: string | null;
};

/** La razón de la cifra: nombra lo que se fue fuera del día a día, que es lo que separa «gané» de «tengo». */
function notaDelFlujo(real: FlujoReal, ganancia: number | null): string | null {
  const dia = aCentimos(totalDe(real, "operacion"));
  const d = aCentimos(real.saldoFinal - real.saldoInicial);
  const g = ganancia === null ? null : aCentimos(ganancia);
  if (g !== null && g > 0 && d < 0) {
    const fuera = [
      [montoDe(real, "activos"), "compraste cosas que duran años por"],
      [montoDe(real, "dueno_saca"), "retiraste"],
      [montoDe(real, "pago_tarjeta"), "pagaste la tarjeta de crédito por"],
    ]
      .filter(([m]) => Math.round(m as number) > 0)
      .map(([m, t]) => `${t} ${solesCentimos(m as number)}`);
    if (fuera.length) return `Ganaste ${solesCentimos(g)}, pero ${fuera.length > 1 ? `${fuera.slice(0, -1).join(", ")} y ${fuera.at(-1)}` : fuera[0]}.`;
  }
  if (dia < 0) return `En el día a día pagaste ${solesCentimos(-dia)} más de lo que cobraste.`;
  if (dia > 0 && d > 0) return "Cobraste más de lo que pagaste, y por eso la plata subió.";
  if (dia > 0 && d < 0) return `En el día a día entraron ${solesCentimos(dia)}, pero salió más por otro lado.`;
  return null;
}

/** Lo que dice la pantalla arriba: con cuánto terminaste y si es más o menos que al empezar. */
export function lecturaDelFlujo(real: FlujoReal, ganancia: number | null, p: Periodo): LecturaDelFlujo {
  const noCubre = loQueNoCubre(real);
  const final = aCentimos(real.saldoFinal);
  const inicial = aCentimos(real.saldoInicial);
  const queSeMira = p.unMes ? mesNombre(p.mes) : "el período";
  if (noCubre) {
    return {
      valor: final,
      mal: final < 0,
      frase: `No se puede decir cuánto subió o bajó: ${noCubre.cuentas.length === 1 ? "una cuenta arrancó" : `${noCubre.cuentas.length} cuentas arrancaron`} ${noCubre.cuando}.`,
      chip: { texto: `Saldo de partida: ${solesCentimos(inicial)}`, tono: null },
      nota: null,
    };
  }
  const d = final - inicial;
  const cuanto = d === 0 ? "lo mismo" : `${solesCentimos(Math.abs(d))} ${d > 0 ? "más" : "menos"}`;
  const frase = p.enCurso ? `Hoy tienes ${cuanto} que al empezar ${queSeMira}.` : `Terminaste ${queSeMira} con ${cuanto} que al empezar.`;
  return { valor: final, mal: final < 0, frase, chip: { texto: `Empezaste con ${solesCentimos(inicial)}`, tono: null }, nota: notaDelFlujo(real, ganancia) };
}

export type ComparadaFlujo = { etiqueta: string; real: FlujoReal | null };

const COLOR_TOTAL = "var(--estados-parte-1)";
const colorDe = (n: number) => (n < 0 ? "var(--color-rojo)" : "var(--color-verde)");

/** Lo que la cascada dibuja: empezar, cada parte que movió la plata y terminar. `inicio` y `fin` solo están en el gráfico: no llevan tarjeta. */
export function partesDelEstadoFlujo({ real, comparadas, etiquetaActual, periodo }: { real: FlujoReal; comparadas: readonly ComparadaFlujo[]; etiquetaActual: string; periodo: Periodo }): ParteEstado[] {
  const anterior = nombreDelAnterior(periodo);
  const pasadas = comparadas.filter((c) => c.real);
  const columnas = (de: (r: FlujoReal) => number): ColumnaDeParte[] => [...pasadas.map((c) => ({ etiqueta: c.etiqueta, valor: de(c.real!), actual: false })), { etiqueta: etiquetaActual, valor: de(real), actual: true }];
  const queSeMira = periodo.unMes ? mesNombre(periodo.mes) : "el período";
  const noCubre = loQueNoCubre(real) !== null;
  const conDe = (de: (r: FlujoReal) => number, buenoSubir: boolean | null) => {
    const c = columnas(de);
    return { columnas: c, chip: chipContraAnterior(c, anterior, buenoSubir, solesCentimos) };
  };
  const delMedio: ParteEstado[] = partesDelFlujo(real).map((p) => ({
    clave: p.clave,
    nombre: p.nombre,
    color: colorDe(p.total),
    enBarra: Math.abs(p.total),
    texto: solesConSignoCentimos(p.total),
    tono: p.total < 0 ? "mal" : "bien",
    que: QUE_ES[p.clave],
    cifra: p.total,
    filas: p.lineas.map((l) => ({ nombre: l.nombre, valor: l.monto })),
    conSignos: true,
    ...conDe((r) => totalDe(r, p.clave), true),
  }));
  return [
    {
      clave: "inicio",
      nombre: noCubre ? "Saldo de partida" : "Al empezar",
      color: "var(--estados-parte-3)",
      enBarra: 0,
      soloEnElGrafico: true,
      texto: solesCentimos(real.saldoInicial),
      que: noCubre ? "El saldo de cada cuenta al empezar; las que arrancaron a mitad del período, con el de ese día." : `La plata con la que empezaste ${queSeMira}.`,
      cifra: real.saldoInicial,
      filas: [],
      ...conDe((r) => r.saldoInicial, null),
    },
    ...delMedio,
    {
      clave: "fin",
      nombre: periodo.enCurso ? "Hoy" : "Al terminar",
      color: COLOR_TOTAL,
      enBarra: 0,
      soloEnElGrafico: true,
      texto: solesCentimos(real.saldoFinal),
      que: periodo.enCurso ? "La plata que tienes hoy." : `La plata con la que terminaste ${queSeMira}.`,
      cifra: real.saldoFinal,
      filas: [
        { nombre: "Entró", valor: real.entro },
        { nombre: "Salió", valor: -real.salio },
        { nombre: "Diferencias", valor: real.ajustes },
      ],
      conSignos: true,
      ...conDe((r) => r.saldoFinal, true),
    },
  ];
}

export type ColumnaCascada = {
  clave: string;
  nombre: string;
  texto: string;
  /** Es un saldo, no un movimiento. */
  total: boolean;
  color: string;
  /** Todo en % del alto del gráfico. */
  abajo: number;
  alto: number;
  /** Dónde va la raya que la une con la siguiente; `null` en la última. */
  enlace: number | null;
};

/** Cada movimiento empieza donde terminó el anterior, y un saldo nace en cero. Con plata en negativo, el piso baja para que quepa. */
export function columnasDeCascada(partes: readonly ParteEstado[]): ColumnaCascada[] {
  let corrido = 0;
  const tramos = partes.map((p, i) => {
    const total = i === 0 || i === partes.length - 1;
    const de = total ? 0 : corrido;
    const a = total ? p.cifra : corrido + p.cifra;
    corrido = a;
    return { p, total, menor: Math.min(de, a), mayor: Math.max(de, a), nivel: a };
  });
  const piso = Math.min(0, ...tramos.map((t) => t.menor));
  const maximo = Math.max(...tramos.map((t) => t.mayor), 0);
  const tope = maximo > piso ? maximo + (maximo - piso) * 0.14 : piso + 1;
  const escala = (x: number) => ((x - piso) / (tope - piso)) * 100;
  return tramos.map(({ p, total, menor, mayor, nivel }, i) => ({
    clave: p.clave,
    nombre: p.nombre,
    texto: total ? solesCentimos(p.cifra) : `${aCentimos(p.cifra) < 0 ? "−" : "+"}${Math.abs(aCentimos(p.cifra)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    total,
    color: total ? "color-mix(in srgb, var(--color-tinta) 15%, transparent)" : colorDe(p.cifra),
    abajo: escala(menor),
    alto: escala(mayor) - escala(menor),
    enlace: i < tramos.length - 1 ? escala(nivel) : null,
  }));
}

/** El estado de flujos del contador, con sus nombres de siempre. Suma: inicio + cada actividad = final. */
export function libroDelFlujo(real: FlujoReal): FilaDelLibro[] {
  const partes = partesDelFlujo(real);
  return [
    { nombre: loQueNoCubre(real) ? "Saldo de partida" : "Saldo inicial", valor: real.saldoInicial, tipo: "normal" },
    ...partes.map((p) => ({ nombre: p.formal.replace(/^Efectivo de actividades/, "Actividades"), valor: p.total, tipo: "normal" as const })),
    { nombre: "Saldo final", valor: real.saldoFinal, tipo: "total" },
  ];
}
