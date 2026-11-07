// Estados financieros ▸ Cambios en el patrimonio (ADR-0611, actividad 7; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): cuánto cambió tu parte en CAYLA, una frase y cómo viene mes a mes.
//
// PROMETE: de `fn_patrimonio_cambios` (un mes) o `fn_patrimonio_en_fechas` (otras fechas) salen las palabras, las partes y el libro. Las partes suman: empezar + lo que lo movió =
// terminar, y lo que la base no explica se muestra aparte, nunca se esconde.
// ASUME: toda cifra viene de la base, del mismo diario que el Balance. Aquí no se suma plata nueva: se ordena y se escribe.

import { chipContraAnterior, type ColumnaDeParte, type FilaDeParte, type ParteEstado } from "./estados-partes";
import type { FilaInforme, Informe } from "./estados-informe";
import { nombreDelAnterior, type Periodo } from "./estados-periodo";
import { solesCentimos, solesConSignoCentimos } from "./flujo-caja-reglas";
import { cambioDelMes, tieneExtremos } from "./patrimonio-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";

/** Montos con céntimos (Felipe 2026-11-06): la pantalla los escribe con dos decimales, así que no se redondean al sol. */
const aCentimos = (n: number) => Math.round(n * 100) / 100;

type ConExtremos = PatrimonioCambios & { inicio: NonNullable<PatrimonioCambios["inicio"]>; fin: NonNullable<PatrimonioCambios["fin"]> };

const pesa = (n: number) => Math.round(n) !== 0;

export type LecturaDelPatrimonio = { valor: number; mal: boolean; conSigno: boolean; frase: string; chip: { texto: string; tono: "bien" | "mal" | null } | null; nota: string | null };

/** La razón de la cifra: qué parte de lo ganado se quedó. */
function razonDelPatrimonio(p: ConExtremos, sueldosEstimados: number): string | null {
  const g = aCentimos(p.ganancia - sueldosEstimados);
  const r = aCentimos(p.retiros);
  if (g > 0) {
    if (r === 0) return "Todo lo ganado se quedó en CAYLA.";
    if (r > g) return `Retiraste más de lo que ganaste: ${solesCentimos(r - g)} salieron de lo que ya tenía CAYLA.`;
    return `El ${Math.round(((g - r) / g) * 100)} % de lo ganado se quedó en CAYLA.`;
  }
  if (g < 0) return r > 0 ? `Perdiste ${solesCentimos(-g)} y además retiraste ${solesCentimos(r)}.` : "La pérdida baja tu parte igual que un retiro.";
  return r > 0 ? `No hubo ganancia y retiraste ${solesCentimos(r)}.` : null;
}

/**
 * La razón, y si hace falta, que esta cifra todavía no resta los sueldos que Dynamic no paga (tarea 23). El puente del patrimonio no los resta porque tiene que cuadrar con el Balance,
 * que lee el diario; pero lo retirado se mide contra lo ganado de verdad: si no, un retiro «dentro de lo ganado» ya se comió los sueldos.
 */
function notaDelPatrimonio(p: ConExtremos, sueldosEstimados: number): string | null {
  const razon = razonDelPatrimonio(p, sueldosEstimados);
  if (Math.round(sueldosEstimados) <= 0) return razon;
  const rotulo = `Sin sueldos provisionados: aún falta restar ${solesCentimos(sueldosEstimados)} que Dynamic no paga.`;
  return razon ? `${razon} ${rotulo}` : rotulo;
}

/** Lo que dice la pantalla arriba: cuánto cambió tu parte, de cuánto a cuánto, y qué la movió. */
export function lecturaDelPatrimonio(p: ConExtremos, sueldosEstimados = 0): LecturaDelPatrimonio {
  const cambio = aCentimos(cambioDelMes(p));
  const ini = solesCentimos(p.inicio.total);
  const fin = solesCentimos(p.fin.total);
  const g = aCentimos(p.ganancia);
  const r = aCentimos(p.retiros);
  const a = aCentimos(p.aportes);
  const movio = [g > 0 ? `Ganaste ${solesCentimos(g)}` : g < 0 ? `Perdiste ${solesCentimos(-g)}` : "", a > 0 ? `pusiste ${solesCentimos(a)}` : "", r > 0 ? `retiraste ${solesCentimos(r)}` : ""].filter(Boolean);
  const dicho = movio.length ? `${movio.slice(0, -1).join(", ")}${movio.length > 1 ? " y " : ""}${movio.at(-1)}` : "";
  return {
    valor: cambio,
    mal: cambio < 0,
    conSigno: cambio > 0,
    frase: cambio === 0 ? `Tu parte en CAYLA no se movió: sigue en ${fin}.` : `Tu parte en CAYLA ${cambio > 0 ? "creció" : "bajó"}: pasó de ${ini} a ${fin}.`,
    chip: dicho ? { texto: dicho.charAt(0).toUpperCase() + dicho.slice(1), tono: cambio === 0 ? null : cambio > 0 ? "bien" : "mal" } : null,
    nota: notaDelPatrimonio(p, sueldosEstimados),
  };
}

export type ComparadaPatrimonio = { etiqueta: string; datos: PatrimonioCambios | null };

function deQueEstaHecho(e: NonNullable<PatrimonioCambios["inicio"]>): FilaDeParte[] {
  return [
    { nombre: "Lo que pusiste al empezar", valor: e.capital },
    { nombre: "Aportes después", valor: e.aportes },
    { nombre: "Ganancias que se quedaron", valor: e.utilidades },
  ];
}

const VERDE = "var(--color-verde)";
const ROJO = "var(--color-rojo)";

/** Empezaste, lo que lo movió (sin lo que no pasó) y terminaste. Lo ganado se abre por sede si se recibe. */
export function partesDelPatrimonio({ datos, comparadas, etiquetaActual, periodo, porSede }: { datos: ConExtremos; comparadas: readonly ComparadaPatrimonio[]; etiquetaActual: string; periodo: Periodo; porSede: readonly FilaDeParte[] }): ParteEstado[] {
  const anterior = nombreDelAnterior(periodo);
  const pasadas = comparadas.filter((c) => tieneExtremos(c.datos));
  const col = (de: (x: ConExtremos) => number): ColumnaDeParte[] => [...pasadas.map((c) => ({ etiqueta: c.etiqueta, valor: de(c.datos as ConExtremos), actual: false })), { etiqueta: etiquetaActual, valor: de(datos), actual: true }];
  const con = (de: (x: ConExtremos) => number, buenoSubir: boolean | null) => {
    const columnas = col(de);
    return { columnas, chip: chipContraAnterior(columnas, anterior, buenoSubir, solesCentimos) };
  };
  const gano = datos.ganancia >= 0;
  const partes: ParteEstado[] = [
    { clave: "inicio", nombre: "Empezaste", color: "var(--estados-parte-3)", enBarra: 0, texto: solesCentimos(datos.inicio.total), que: "Tu parte en CAYLA al empezar estas fechas.", cifra: datos.inicio.total, filas: deQueEstaHecho(datos.inicio), ...con((x) => x.inicio.total, true) },
    {
      clave: "ganancia",
      nombre: gano ? "Ganaste" : "Perdiste",
      color: gano ? VERDE : ROJO,
      enBarra: 0,
      texto: solesConSignoCentimos(datos.ganancia),
      tono: gano ? "bien" : "mal",
      que: "El resultado de estas fechas, y cuánto dejó cada sede. Sale del diario: los sueldos estimados que Ganancias y pérdidas ya resta entran aquí cuando Dynamic los paga.",
      cifra: datos.ganancia,
      filas: [...porSede],
      conSignos: true,
      ...con((x) => x.ganancia, true),
    },
  ];
  if (pesa(datos.aportes)) partes.push({ clave: "aportes", nombre: "Pusiste", color: VERDE, enBarra: 0, texto: solesConSignoCentimos(datos.aportes), tono: "bien", que: "La plata que le pusiste a CAYLA en estas fechas.", cifra: datos.aportes, filas: [], conSignos: true, ...con((x) => x.aportes, null) });
  partes.push({
    clave: "retiros",
    nombre: "Retiraste",
    color: ROJO,
    enBarra: 0,
    texto: pesa(datos.retiros) ? solesConSignoCentimos(-datos.retiros) : solesCentimos(0),
    tono: pesa(datos.retiros) ? "mal" : undefined,
    que: "Lo que sacaste de CAYLA en estas fechas.",
    cifra: -datos.retiros,
    filas: pesa(datos.retiros) ? [{ nombre: "Retiro del dueño", valor: -datos.retiros }] : [],
    conSignos: true,
    ...con((x) => x.retiros, false),
  });
  if (pesa(datos.otros)) partes.push({ clave: "otros", nombre: "Sin explicar", color: "var(--color-ambar)", enBarra: 0, texto: solesConSignoCentimos(datos.otros), que: "Un ajuste a mano: ni una venta, ni un gasto, ni un aporte, ni un retiro. El Balance dice de dónde sale.", cifra: datos.otros, filas: [], conSignos: true, ...con((x) => x.otros, null) });
  partes.push({ clave: "fin", nombre: "Terminaste", color: "var(--estados-parte-1)", enBarra: 0, texto: solesCentimos(datos.fin.total), que: "Tu parte en CAYLA al terminar estas fechas.", cifra: datos.fin.total, filas: deQueEstaHecho(datos.fin), ...con((x) => x.fin.total, true) });
  return partes;
}

/**
 * Cambios en el patrimonio como informe (camino A, Felipe 2026-11-06): con cuánto empezaste, lo que lo movió (lo ganado, lo que pusiste, lo que retiraste y un
 * ajuste a mano si lo hubo) y con cuánto terminaste, con los períodos de antes al lado. Suma: saldo inicial + lo que lo movió = saldo final. Las frases y el
 * detalle de cada fila salen de las mismas partes (`partesDelPatrimonio`).
 */
export function informeDelPatrimonio({ datos, partes, comparadas, etiquetaActual }: { datos: ConExtremos; partes: readonly ParteEstado[]; comparadas: readonly ComparadaPatrimonio[]; etiquetaActual: string }): Informe {
  const DE: Record<string, { contable: string; de: (x: ConExtremos) => number; tipo: FilaInforme["tipo"] }> = {
    inicio: { contable: "Saldo inicial", de: (x) => x.inicio.total, tipo: "subtotal" },
    ganancia: { contable: "Resultado del período", de: (x) => x.ganancia, tipo: "linea" },
    aportes: { contable: "Aportes del dueño", de: (x) => x.aportes, tipo: "linea" },
    retiros: { contable: "Retiros del dueño", de: (x) => -x.retiros, tipo: "linea" },
    otros: { contable: "Otros ajustes", de: (x) => x.otros, tipo: "linea" },
    fin: { contable: "Saldo final", de: (x) => x.fin.total, tipo: "total" },
  };
  const filas: FilaInforme[] = partes.flatMap((p) => {
    const d = DE[p.clave];
    if (!d) return [];
    return [
      {
        clave: p.clave,
        nombre: p.nombre,
        contable: d.contable,
        tipo: d.tipo,
        valores: [...comparadas.map((c) => (tieneExtremos(c.datos) ? d.de(c.datos as ConExtremos) : null)), d.de(datos)],
        tono: p.clave === "fin" ? (datos.fin.total < 0 ? "mal" : null) : (p.tono ?? null),
        que: p.que,
        detalle: p.filas,
      },
    ];
  });
  return {
    titulo: "Cambios en el patrimonio",
    columnas: [...comparadas.map((c) => ({ etiqueta: c.etiqueta, actual: false })), { etiqueta: etiquetaActual, actual: true }],
    pesoDe: null,
    filas,
  };
}
