// El Pulso: Finanzas ▸ Resumen en camino A («La respuesta», maquetas finanzas-v2-2026-10, Felipe 2026-10-15). Lógica pura
// sobre lo que `fn_resumen_finanzas` ya trae (`ResumenFinanzas`): ninguna cifra se calcula aquí de nuevo, solo se decide
// cómo se dice.
//
// Cuatro preguntas, en este orden: ¿estoy ganando plata? (la respuesta grande: lo que queda a la fecha), ¿a qué ritmo voy?
// (lo vendido por día contra lo que hace falta por día para cubrir el mes, y con qué cerrarías si sigues así), ¿por qué ese
// número? (la cascada: vendiste → costó → sueldos → gastos → desgaste → queda) y ¿qué deja cada lugar? (cada tienda, el
// Taller y «lo de toda la empresa», sin repartir: ADR-0417, decisión de diseño «los gastos de empresa no se reparten»).
//
// Lenguaje de tienda: «te quedan», «lo que costó la ropa», «sueldos», «desgaste de máquinas». Lo que no está registrado no se
// inventa: el medidor de confianza (lib/finanzas-confianza.ts) dice cuánto creerle.

import { diasDelMes, filaDeVer, motivoAusencia, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import { soles } from "./flujo-caja-reglas";
import { mesNombre, nombreCorto, type FilaER } from "./resultados-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «el martes 27»: el día del mes con su nombre, a partir de `mes` («2026-10») y el número de día. */
export function nombreDia(mes: string, dia: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return `el ${DIAS[new Date(Date.UTC(a, m - 1, dia)).getUTCDay()]} ${dia}`;
}

// ---- 1. La respuesta ----------------------------------------------------------------------------------------------------------

export type Respuesta =
  | {
      estado: "gana" | "pierde" | "empata";
      /** Lo que queda (o falta) a la fecha, en positivo. */
      monto: number;
      vendido: number;
      /** «te quedan» · «te faltan». */
      verbo: string;
      /** «Sí» · «No» · «Ni sí ni no». */
      corto: string;
      explica: string;
    }
  | { estado: "sin_datos"; motivo: string };

/**
 * Los gastos de operación SIN los sueldos ni el desgaste. En el Estado de resultados la base los suma TODOS en `gastos` (las cuentas
 * 62 y 681 son gastos de operación): el Pulso los nombra aparte, así que los otros son lo que queda. Sin esto, «Alquileres, servicios y
 * otros gastos» repetía los sueldos y el desgaste, y «lo fijo del mes» los contaba dos veces (visto con el fixture real, ADR-0453).
 */
const otrosGastos = (f: FilaER): number => Math.max(0, r2(f.gastos - f.planilla - f.depreciacion));

export function respuestaPulso(r: ResumenFinanzas): Respuesta {
  if (r.resultadosMes.estado !== "ok") return { estado: "sin_datos", motivo: motivoAusencia(r.resultadosMes) ?? "El estado de resultados no se pudo leer." };
  const f = filaDeVer(r.resultadosMes.datos, r.ver);
  if (!f) return { estado: "sin_datos", motivo: "Todavía no hay nada registrado este mes." };
  return respuestaDeFila(f, { mes: r.mes, vende: r.ver.todas || r.ver.tipo === "tienda", taller: r.ver.tipo === "taller" });
}

/** La misma respuesta a partir de una fila del Estado de resultados: la usan Resumen y Reportes (una función, una pieza). */
export function respuestaDeFila(f: FilaER, ctx: { mes: string; vende: boolean; taller: boolean }): Respuesta {
  if (f.ventas <= 0 && f.gastos <= 0 && f.planilla <= 0) return { estado: "sin_datos", motivo: `Todavía no hay ventas ni gastos en ${mesNombre(ctx.mes)}.` };
  const res = r2(f.resultado);
  const estado = res > 0 ? "gana" : res < 0 ? "pierde" : "empata";
  const vende = ctx.vende;
  const pagos = [f.costo > 0 ? "la ropa" : null, f.planilla > 0 ? "los sueldos" : null, otrosGastos(f) > 0 ? "los alquileres y los servicios" : null, f.depreciacion > 0 ? "el desgaste de máquinas y muebles" : null].filter(Boolean) as string[];
  const lista = pagos.length ? pagos.join(", ").replace(/, ([^,]*)$/, " y $1") : "lo registrado";
  const explica = !vende
    ? `${ctx.taller ? "El Taller" : "La empresa"} no vende: esto es lo que costó este mes (${lista}).`
    : f.ventas <= 0
      ? `Sin ventas todavía: esto es lo que ya se pagó este mes (${lista}).`
      : estado === "gana"
        ? `De los ${soles(f.ventas)} que vendiste (sin IGV), esto es lo que queda tuyo después de pagar ${lista}.`
        : estado === "pierde"
          ? `Vendiste ${soles(f.ventas)} (sin IGV) y pagar ${lista} costó más que eso.`
          : `Vendiste ${soles(f.ventas)} (sin IGV) y pagar ${lista} costó exactamente eso.`;
  return {
    estado,
    monto: Math.abs(res),
    vendido: f.ventas,
    verbo: !vende ? "costó" : estado === "pierde" ? "te faltan" : "te quedan",
    corto: estado === "gana" ? "Sí" : estado === "pierde" ? "No" : "Ni sí ni no",
    explica,
  };
}

/**
 * Cuánto se atreve a afirmar el titular según la confianza del número (ADR-0417): el «Sí» o el «No» pelado solo sale con
 * confianza alta. Con media dice «por ahora»; con baja, «Con lo que hay registrado, …» y la cifra va con «≈» y su chip
 * «Provisional». Sin medida (`null`: la base no respondió) tampoco se afirma: lo que no se pudo medir no es «alta» (principio 9).
 * No cambia ninguna cifra: solo cómo se dice. Pasa el «¿Por qué?» tal cual.
 */
export type Matiz = {
  /** Lo que dice el chip: «Sí», «Sí, por ahora», «Provisional». */
  chip: string;
  /** El tono del chip: el del resultado si es firme; `pizarra` si es provisional. */
  tono: "verde" | "rojo" | "ambar" | "pizarra";
  /** La frase que precede a «te quedan»: «En lo que va de octubre,» o «Con lo que hay registrado,». */
  intro: string;
  /** `≈` si la cifra es provisional. */
  aprox: string;
  provisional: boolean;
  /** Lo que se agrega a la explicación cuando no es firme; vacío si lo es. */
  aviso: string;
};

export function matizarRespuesta(resp: Exclude<Respuesta, { estado: "sin_datos" }>, mes: string, nivel: "alto" | "medio" | "bajo" | null): Matiz {
  const tonoFirme = resp.estado === "gana" ? "verde" : resp.estado === "pierde" ? "rojo" : "ambar";
  const enElMes = `En lo que va de ${mesNombre(mes)},`;
  if (nivel === "alto") return { chip: resp.corto, tono: tonoFirme, intro: enElMes, aprox: "", provisional: false, aviso: "" };
  const aviso = nivel === null ? "Es provisional: no se pudo medir qué tan seguro es este número." : "Es provisional: mira «Qué tan seguro es este número» para ver qué falta cargar.";
  if (nivel === "medio") return { chip: `${resp.corto}, por ahora`, tono: tonoFirme, intro: enElMes, aprox: "", provisional: false, aviso };
  return { chip: "Provisional", tono: "pizarra", intro: "Con lo que hay registrado,", aprox: "≈ ", provisional: true, aviso };
}

// ---- 2. El ritmo ----------------------------------------------------------------------------------------------------------

export type Ritmo = {
  /** Lo vendido por día, a la fecha (sin IGV). */
  porDia: number;
  /** Lo que hace falta vender por día para cubrir lo fijo del mes; `null` si no hay margen con que calcularlo. */
  necesarioPorDia: number | null;
  /** Con qué cerrarías el mes si sigues así; `null` sin margen. */
  cierre: number | null;
  /** El día del mes en que, a este ritmo, lo vendido ya cubre lo fijo; `null` si no llega. */
  diaCubre: number | null;
  /** Lo fijo del mes con lo que se calculó (sueldos, gastos y desgaste, llevados al mes entero). */
  fijoMes: number;
  dia: number;
  diasMes: number;
  tono: "verde" | "ambar" | "rojo" | "pizarra";
  frase: string;
  cierreFrase: string;
};

/**
 * Lo fijo del mes: los otros gastos y el desgaste registrados a la fecha, llevados al mes entero por regla de tres, más la planilla:
 * la ya asentada (Dynamic la pagó: el mes entero) y la estimada, que cuesta lo que costaría su período entero (`planillaAlCierre`: las
 * horas al ritmo de lo trabajado y el sueldo fijo completo). Si no hay ni lo uno ni lo otro, la que el Flujo proyecta para el mes. Es
 * una estimación con lo registrado: el medidor de confianza dice cuánto le falta.
 */
function fijoDelMes(r: ResumenFinanzas, f: FilaER, dia: number, diasMes: number): number {
  const factor = diasMes / Math.max(1, dia);
  let planilla = Math.max(0, f.planilla - f.planillaEstimada) + (f.planillaEstimada > 0 ? Math.max(f.planillaEstimada, f.planillaAlCierre) : 0);
  if (planilla <= 0 && r.flujo.estado === "ok") {
    const pl = r.flujo.datos.salidas.find((s) => s.tipo === "planilla" && s.fecha.slice(0, 7) === r.mes);
    if (pl) planilla = pl.monto;
  }
  return r2((otrosGastos(f) + f.depreciacion) * factor + planilla);
}

export function ritmoPulso(r: ResumenFinanzas): Ritmo | null {
  if (r.resultadosMes.estado !== "ok") return null;
  const f = filaDeVer(r.resultadosMes.datos, r.ver);
  if (!f || !(r.ver.todas || r.ver.tipo === "tienda")) return null;
  const dia = Number(r.hoy.slice(8, 10));
  const diasMes = diasDelMes(r.mes);
  const porDia = r2(f.ventas / Math.max(1, dia));
  const fijoMes = fijoDelMes(r, f, dia, diasMes);
  const mes = mesNombre(r.mes);
  if (f.ventas <= 0 || f.margen <= 0) {
    return {
      porDia, necesarioPorDia: null, cierre: null, diaCubre: null, fijoMes, dia, diasMes, tono: "pizarra",
      frase: f.ventas <= 0 ? `Todavía no hay ventas en ${mes}.` : `Vendiste ${soles(f.ventas)} sin margen: vender más no cubre nada.`,
      cierreFrase: fijoMes > 0 ? `Lo fijo de ${mes} ronda ${soles(fijoMes)}.` : "",
    };
  }
  const margenPct = f.margen / f.ventas;
  const necesarioMes = fijoMes / margenPct;
  const necesarioPorDia = r2(necesarioMes / diasMes);
  const cierre = r2(porDia * diasMes * margenPct - fijoMes);
  const diaCubre = porDia > 0 ? Math.ceil(necesarioMes / porDia - 1e-9) : null;
  const llega = diaCubre !== null && diaCubre <= diasMes;
  const tono: Ritmo["tono"] = necesarioPorDia <= 0 ? "verde" : porDia >= necesarioPorDia * 1.05 ? "verde" : porDia >= necesarioPorDia * 0.95 ? "ambar" : "rojo";
  const frase = necesarioPorDia <= 0
    ? `Vas en ${soles(porDia)} al día y este mes no hay nada fijo registrado que cubrir.`
    : porDia >= necesarioPorDia
      ? `Vas en ${soles(porDia)} al día; necesitas ${soles(necesarioPorDia)} para cubrir ${mes}. Te sobran ${soles(porDia - necesarioPorDia)} al día.`
      : `Vas en ${soles(porDia)} al día; necesitas ${soles(necesarioPorDia)} para cubrir ${mes}. Te faltan ${soles(necesarioPorDia - porDia)} al día.`;
  const cierreFrase = llega
    ? `Si sigues así, cierras ${mes} con ≈ ${soles(cierre)}. ${diaCubre! <= dia ? "Ya cubriste" : `${nombreDia(r.mes, diaCubre!)[0].toUpperCase()}${nombreDia(r.mes, diaCubre!).slice(1)} habrás cubierto`} todo lo fijo de ${mes}; desde ahí, casi todo lo que vendes es tuyo.`
    : `Si sigues así, cierras ${mes} con ≈ ${soles(cierre)}: a este ritmo no llegas a cubrir lo fijo del mes.`;
  return { porDia, necesarioPorDia, cierre, diaCubre: llega ? diaCubre : null, fijoMes, dia, diasMes, tono, frase, cierreFrase };
}

// ---- 3. Por qué ese número: la cascada ---------------------------------------------------------------------------------------

export type TramoCascada = { clave: string; nombre: string; monto: number; tipo: "entra" | "sale" | "queda"; detalle?: string };

export function cascadaPulso(r: ResumenFinanzas): TramoCascada[] {
  if (r.resultadosMes.estado !== "ok") return [];
  const f = filaDeVer(r.resultadosMes.datos, r.ver);
  if (!f) return [];
  return cascadaDeFila(f);
}

/** La cascada de una fila del Estado de resultados: la usan Resumen y Reportes. */
export function cascadaDeFila(f: FilaER): TramoCascada[] {
  // Los sueldos (62) y el desgaste (681) ya tienen su tramo: no se repiten en el detalle de «otros gastos».
  const gastosTop = f.detalleGastos.filter((g) => g.cuenta !== "62" && g.cuenta !== "681").sort((a, b) => b.monto - a.monto).slice(0, 3).map((g) => `${g.nombre} ${soles(g.monto)}`);
  const otros = otrosGastos(f);
  const tramos: TramoCascada[] = [{ clave: "ventas", nombre: "Lo que vendiste", monto: f.ventas, tipo: "entra", detalle: "Sin IGV: ese 18 % es de SUNAT." }];
  if (f.costo > 0) tramos.push({ clave: "costo", nombre: "Lo que costó la ropa", monto: f.costo, tipo: "sale", detalle: f.sinCosto > 0 ? `${f.sinCosto} ${f.sinCosto === 1 ? "prenda vendida sin costo" : "prendas vendidas sin costo"}.` : undefined });
  if (f.fletes > 0) tramos.push({ clave: "fletes", nombre: "Fletes de la mercadería", monto: f.fletes, tipo: "sale" });
  if (f.mermas > 0) tramos.push({ clave: "mermas", nombre: "Prendas perdidas o dañadas", monto: f.mermas, tipo: "sale" });
  if (f.planilla > 0) tramos.push({ clave: "planilla", nombre: "Sueldos", monto: f.planilla, tipo: "sale", detalle: f.planillaNota ?? undefined });
  if (otros > 0) tramos.push({ clave: "gastos", nombre: "Alquileres, servicios y otros gastos", monto: otros, tipo: "sale", detalle: gastosTop.length ? gastosTop.join(" · ") : undefined });
  if (f.depreciacion > 0) tramos.push({ clave: "depreciacion", nombre: "Desgaste de máquinas y muebles", monto: f.depreciacion, tipo: "sale" });
  // Lo que la cascada no nombra (un gasto devuelto, una nota de crédito, un ajuste) entra en un tramo propio, para que sumar los
  // tramos dé siempre «te queda»: una cuenta que no cuadra es peor que una línea de más.
  const explicado = tramos.reduce((s, t) => s + (t.tipo === "entra" ? t.monto : -t.monto), 0);
  const ajuste = r2(f.resultado - explicado);
  if (Math.abs(ajuste) >= 0.5) tramos.push({ clave: "ajustes", nombre: ajuste > 0 ? "Otros ajustes a favor" : "Otros ajustes", monto: Math.abs(ajuste), tipo: ajuste > 0 ? "entra" : "sale", detalle: "Devoluciones, notas de crédito o correcciones del mes." });
  tramos.push({ clave: "queda", nombre: f.resultado >= 0 ? "Te queda" : "Te falta", monto: Math.abs(r2(f.resultado)), tipo: "queda" });
  return tramos;
}

// ---- 4. Qué deja cada lugar -----------------------------------------------------------------------------------------------

export type Lugar = { id: string; nombre: string; tipo: FilaER["unidad"]; vendio: number; deja: number; nota: string | null };

/** Cada tienda, el Taller y lo de toda la empresa, con lo que deja después de lo que él mismo causa; solo mirando CAYLA entera. */
export function lugaresPulso(r: ResumenFinanzas): { lugares: Lugar[]; total: number; mayor: number } | null {
  if (!r.ver.todas || r.resultadosMes.estado !== "ok") return null;
  const filas = r.resultadosMes.datos;
  const lugares: Lugar[] = filas
    .filter((f) => f.unidad !== "consolidado")
    .sort((a, b) => (a.unidad === b.unidad ? a.orden - b.orden : ORDEN[a.unidad] - ORDEN[b.unidad]))
    .map((f) => ({
      id: f.ubicacionId ?? f.unidad,
      nombre: f.unidad === "empresa" ? "Lo de toda la empresa" : nombreCorto(f),
      tipo: f.unidad,
      vendio: f.ventas,
      deja: r2(f.resultado),
      nota:
        f.unidad === "empresa"
          ? "Contador, publicidad, oficina: no se reparte entre las tiendas."
          : f.unidad === "taller"
            ? "El Taller no vende: se mide por lo que cuesta."
            : f.ventas <= 0
              ? "Sin ventas este mes."
              : null,
    }));
  const total = r2(filas.find((f) => f.unidad === "consolidado")?.resultado ?? lugares.reduce((s, l) => s + l.deja, 0));
  const mayor = Math.max(1, ...lugares.map((l) => Math.abs(l.deja)));
  return { lugares, total, mayor };
}
const ORDEN: Record<FilaER["unidad"], number> = { tienda: 0, taller: 1, empresa: 2, consolidado: 3 };
