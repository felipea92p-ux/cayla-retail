// Estados financieros ▸ Cambios en el patrimonio (ADR-0611, actividad 7; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): cuánto cambió tu parte en CAYLA, una frase y cómo viene mes a mes.
//
// PROMETE: de `fn_patrimonio_cambios` (un mes) o `fn_patrimonio_en_fechas` (otras fechas) salen las palabras, las partes y el libro. Las partes suman: empezar + lo que lo movió =
// terminar, y lo que la base no explica se muestra aparte, nunca se esconde.
// ASUME: toda cifra viene de la base, del mismo diario que el Balance. Aquí no se suma plata nueva: se ordena y se escribe.

import { chipContraAnterior, type ColumnaDeParte, type FilaDeParte, type FilaDelLibro, type ParteEstado } from "./estados-partes";
import { nombreDelAnterior, type Periodo } from "./estados-periodo";
import { soles, solesConSigno } from "./flujo-caja-reglas";
import { cambioDelMes, tieneExtremos } from "./patrimonio-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";

type ConExtremos = PatrimonioCambios & { inicio: NonNullable<PatrimonioCambios["inicio"]>; fin: NonNullable<PatrimonioCambios["fin"]> };

const pesa = (n: number) => Math.round(n) !== 0;

export type LecturaDelPatrimonio = { valor: number; mal: boolean; conSigno: boolean; frase: string; chip: { texto: string; tono: "bien" | "mal" | null } | null; nota: string | null };

/** La razón de la cifra: qué parte de lo ganado se quedó. */
function notaDelPatrimonio(p: ConExtremos): string | null {
  const g = Math.round(p.ganancia);
  const r = Math.round(p.retiros);
  if (g > 0) {
    if (r === 0) return "Todo lo ganado se quedó en CAYLA.";
    if (r > g) return `Retiraste más de lo que ganaste: ${soles(r - g)} salieron de lo que ya tenía CAYLA.`;
    return `El ${Math.round(((g - r) / g) * 100)} % de lo ganado se quedó en CAYLA.`;
  }
  if (g < 0) return r > 0 ? `Perdiste ${soles(-g)} y además retiraste ${soles(r)}.` : "La pérdida baja tu parte igual que un retiro.";
  return r > 0 ? `No hubo ganancia y retiraste ${soles(r)}.` : null;
}

/** Lo que dice la pantalla arriba: cuánto cambió tu parte, de cuánto a cuánto, y qué la movió. */
export function lecturaDelPatrimonio(p: ConExtremos): LecturaDelPatrimonio {
  const cambio = Math.round(cambioDelMes(p));
  const ini = soles(p.inicio.total);
  const fin = soles(p.fin.total);
  const g = Math.round(p.ganancia);
  const r = Math.round(p.retiros);
  const a = Math.round(p.aportes);
  const movio = [g > 0 ? `Ganaste ${soles(g)}` : g < 0 ? `Perdiste ${soles(-g)}` : "", a > 0 ? `pusiste ${soles(a)}` : "", r > 0 ? `retiraste ${soles(r)}` : ""].filter(Boolean);
  const dicho = movio.length ? `${movio.slice(0, -1).join(", ")}${movio.length > 1 ? " y " : ""}${movio.at(-1)}` : "";
  return {
    valor: cambio,
    mal: cambio < 0,
    conSigno: cambio > 0,
    frase: cambio === 0 ? `Tu parte en CAYLA no se movió: sigue en ${fin}.` : `Tu parte en CAYLA ${cambio > 0 ? "creció" : "bajó"}: pasó de ${ini} a ${fin}.`,
    chip: dicho ? { texto: dicho.charAt(0).toUpperCase() + dicho.slice(1), tono: cambio === 0 ? null : cambio > 0 ? "bien" : "mal" } : null,
    nota: notaDelPatrimonio(p),
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
    return { columnas, chip: chipContraAnterior(columnas, anterior, buenoSubir, soles) };
  };
  const gano = datos.ganancia >= 0;
  const partes: ParteEstado[] = [
    { clave: "inicio", nombre: "Empezaste", color: "var(--estados-parte-3)", enBarra: 0, texto: soles(datos.inicio.total), que: "Tu parte en CAYLA al empezar estas fechas.", cifra: datos.inicio.total, filas: deQueEstaHecho(datos.inicio), ...con((x) => x.inicio.total, true) },
    {
      clave: "ganancia",
      nombre: gano ? "Ganaste" : "Perdiste",
      color: gano ? VERDE : ROJO,
      enBarra: 0,
      texto: solesConSigno(datos.ganancia),
      tono: gano ? "bien" : "mal",
      que: "El resultado de estas fechas, y cuánto dejó cada sede.",
      cifra: datos.ganancia,
      filas: [...porSede],
      conSignos: true,
      ...con((x) => x.ganancia, true),
    },
  ];
  if (pesa(datos.aportes)) partes.push({ clave: "aportes", nombre: "Pusiste", color: VERDE, enBarra: 0, texto: solesConSigno(datos.aportes), tono: "bien", que: "La plata que le pusiste a CAYLA en estas fechas.", cifra: datos.aportes, filas: [], conSignos: true, ...con((x) => x.aportes, null) });
  partes.push({
    clave: "retiros",
    nombre: "Retiraste",
    color: ROJO,
    enBarra: 0,
    texto: pesa(datos.retiros) ? solesConSigno(-datos.retiros) : soles(0),
    tono: pesa(datos.retiros) ? "mal" : undefined,
    que: "Lo que sacaste de CAYLA en estas fechas.",
    cifra: -datos.retiros,
    filas: pesa(datos.retiros) ? [{ nombre: "Retiro del dueño", valor: -datos.retiros }] : [],
    conSignos: true,
    ...con((x) => x.retiros, false),
  });
  if (pesa(datos.otros)) partes.push({ clave: "otros", nombre: "Sin explicar", color: "var(--color-ambar)", enBarra: 0, texto: solesConSigno(datos.otros), que: "Un ajuste a mano: ni una venta, ni un gasto, ni un aporte, ni un retiro. El Balance dice de dónde sale.", cifra: datos.otros, filas: [], conSignos: true, ...con((x) => x.otros, null) });
  partes.push({ clave: "fin", nombre: "Terminaste", color: "var(--estados-parte-1)", enBarra: 0, texto: soles(datos.fin.total), que: "Tu parte en CAYLA al terminar estas fechas.", cifra: datos.fin.total, filas: deQueEstaHecho(datos.fin), ...con((x) => x.fin.total, true) });
  return partes;
}

/** Qué se ve abajo: una sola barra sumaría cosas que no se suman, así que aquí mandan las tarjetas. */
export const tituloDelPatrimonio = "Qué movió tu parte";

/** El estado del contador, con sus nombres de siempre. Suma: saldo inicial + lo que lo movió = saldo final. */
export function libroDelPatrimonio(p: ConExtremos): FilaDelLibro[] {
  return [
    { nombre: "Saldo inicial", valor: p.inicio.total, tipo: "normal" },
    { nombre: "Resultado del período", valor: p.ganancia, tipo: "normal" },
    ...(pesa(p.aportes) ? [{ nombre: "Aportes del dueño", valor: p.aportes, tipo: "normal" as const }] : []),
    { nombre: "Retiros del dueño", valor: -p.retiros, tipo: "normal" },
    ...(pesa(p.otros) ? [{ nombre: "Otros ajustes", valor: p.otros, tipo: "normal" as const }] : []),
    { nombre: "Saldo final", valor: p.fin.total, tipo: "total" },
  ];
}
