// Finanzas ▸ Impuestos, versión «E · B++» (Felipe 2026-10-28, ADR-0573): una sola respuesta grande («Pagas»), la cuenta en líneas, y en una
// fila los pendientes con su monto, el límite del año y el IGV de cada mes. Lógica pura sobre lo que `fn_impuestos_panel` ya trae: no repite
// ninguna regla tributaria. Lo que pagas sale de `pulsoImpuestos` y la composición de las compras, de `balanzaIgv`, para que ninguna cifra
// contradiga a la de antes. **El porcentaje de la renta nunca se escribe aquí**: viene del parámetro del año (Configuración ▸ Impuestos), que
// hoy es provisional y lo confirma el contador (1 %, o 1,5 % / coeficiente pasadas las 300 UIT).

import { solesRedondo } from "./gastos-reglas";
import { balanzaIgv } from "./impuestos-balanza-reglas";
import { pulsoImpuestos } from "./impuestos-pulso-reglas";
import { nombreMes, proyectarUmbral, sumarMeses, tonoAvance, type PanelImpuestos } from "./impuestos-reglas";
import type { Sobre } from "./impuestos-sobres-reglas";
import type { BarraTiempo } from "@/components/ui/BarrasTiempo";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** «1 %», «1.5 %»: la tasa del parámetro, con el punto decimal de es-PE (como el resto del ERP). */
export function tasaEnTexto(fraccion: number): string {
  return `${(Math.round(fraccion * 1000) / 10).toLocaleString("es-PE")} %`;
}

/** «7.9 mil» para la cifra sobre una barra angosta; menos de mil, el número. */
export function milesCortos(n: number): string {
  const v = Math.round(n);
  return v >= 1000 ? `${(Math.round(v / 100) / 10).toLocaleString("es-PE")} mil` : String(v);
}

// ---- La respuesta y la cuenta ---------------------------------------------------------------------------------------------

export type LineaCompras = { clave: string; nombre: string; monto: number; /** Resta de las compras (notas de crédito de proveedor). */ resta: boolean };

export type CuentaImpuestos =
  | { estado: "sin_mes"; etiqueta: string; frase: string }
  | {
      estado: "a_pagar" | "a_favor";
      /** «Pagas» o «Pagarás» (el mes en curso todavía cambia). */
      etiqueta: string;
      /** Lo que de verdad sale hacia SUNAT: con IGV a favor, solo la renta. */
      pagas: number;
      /** El chip bajo la cifra: cuándo se paga, o cuánto IGV pasa al mes siguiente. */
      chip: string;
      frase: string;
      vendiste: number;
      comprobantes: number;
      igvVentas: number;
      /** La tasa del IGV en % entero (18). */
      tasaIgv: number;
      igvCompras: number;
      lineasCompras: LineaCompras[];
      saldoAnterior: number;
      renta: { monto: number | null; base: number; /** «1.5 %», o null si el año no tiene tasa. */ tasa: string | null; provisional: boolean };
      aFavor: number;
    };

export function cuentaImpuestos(p: PanelImpuestos, opciones: { enCurso: boolean; pendientes: number }): CuentaImpuestos {
  const pulso = pulsoImpuestos(p);
  const f = p.foco;
  if (pulso.estado === "sin_mes" || !f) return { estado: "sin_mes", etiqueta: "Sin movimiento", frase: "Nada que declarar: sin ventas ni compras con factura." };

  const siguiente = nombreMes(sumarMeses(pulso.mes, 1));
  const b = balanzaIgv(f, p.renta.monto);
  const lineasCompras: LineaCompras[] = b.compras.pesas.filter((x) => x.clave !== "saldo_anterior").map((x) => ({ clave: x.clave, nombre: x.nombre, monto: x.monto, resta: false }));
  if (b.compras.resta > 0) lineasCompras.push({ clave: "notas", nombre: "Notas de crédito", monto: b.compras.resta, resta: true });

  const pagas = pulso.estado === "a_pagar" ? pulso.total : (pulso.renta ?? 0);
  const hacer = opciones.pendientes > 0 ? `Falta: revisar ${plural(opciones.pendientes, "pendiente", "pendientes")}, descargar y pagar.` : "Falta: descargar y pagar.";
  const frase = opciones.enCurso
    ? "El mes sigue abierto: la cifra cambia hasta que cierre."
    : pulso.estado === "a_pagar"
      ? hacer
      : pulso.renta !== null && pulso.renta > 0
        ? `Solo pagas la renta. El IGV a favor pasa a ${siguiente}.`
        : `No pagas IGV. El saldo a favor pasa a ${siguiente}.`;
  const chip = opciones.enCurso ? "Va a la fecha" : pulso.estado === "a_pagar" ? `Se paga en ${siguiente}` : `IGV a favor ${solesRedondo(pulso.aFavor)} → ${siguiente}`;

  return {
    estado: pulso.estado,
    etiqueta: opciones.enCurso ? "Pagarás a SUNAT" : "Pagas a SUNAT",
    pagas,
    chip,
    frase,
    vendiste: f.baseVentas,
    comprobantes: f.comprobantes,
    igvVentas: b.cuenta.cobraste,
    tasaIgv: p.parametros.igv ? Math.round(p.parametros.igv.valor * 100) : 18,
    igvCompras: b.cuenta.compras,
    lineasCompras,
    saldoAnterior: b.cuenta.saldoAnterior,
    renta: { monto: p.renta.monto === null ? null : r2(p.renta.monto), base: p.renta.base, tasa: p.renta.tasa === null ? null : tasaEnTexto(p.renta.tasa), provisional: p.parametros.renta?.provisional === true },
    aFavor: pulso.aFavor,
  };
}

// ---- El límite del año ------------------------------------------------------------------------------------------------------

export type LimiteImpuestos =
  | { estado: "sin_config" | "sin_base" }
  | {
      estado: "ok";
      /** «El límite de 300 UIT». */
      titulo: string;
      vendido: number;
      umbralSoles: number;
      /** 0 a 1 y más. */
      avance: number;
      tono: ReturnType<typeof tonoAvance>;
      /** Hasta dónde llega la franja rayada: lo proyectado a diciembre, de 0 a 100. */
      proyectadoPct: number;
      /** Dónde cae el aviso (250 UIT) sobre la barra, de 0 a 100; null si no hay. */
      avisoPct: number | null;
      /** Las UIT del aviso (250), para rotular la marca. */
      avisoUit: number | null;
      /** Una o dos frases cortas: cuándo se cruza y cómo cierra el año. */
      frase: string;
      uit: { anio: number; valor: number; provisional: boolean };
    };

export function limiteImpuestos(p: PanelImpuestos): LimiteImpuestos {
  const { umbral, parametros, hoy } = p;
  if (umbral.umbralSoles === null || !parametros.uit) return { estado: "sin_config" };
  if (umbral.ventasAnio === null) return { estado: "sin_base" };
  const n = parametros.umbralUit?.valor ?? null;
  const proy = proyectarUmbral(umbral.ventasMeses, hoy, umbral.umbralSoles, umbral.primerMes, umbral.ajuste);
  const cruce = umbral.cruzado || proy.yaCruzado
    ? "Ya pasaste el límite: coordina con el contador las obligaciones nuevas."
    : proy.mesCruce
      ? `A este ritmo lo cruzas en ${nombreMes(proy.mesCruce)}.`
      : "A este ritmo no lo cruzas este año.";
  return {
    estado: "ok",
    titulo: n !== null ? `El límite de ${n.toLocaleString("es-PE")} UIT` : "El límite de ventas",
    vendido: umbral.ventasAnio,
    umbralSoles: umbral.umbralSoles,
    avance: umbral.avance ?? 0,
    tono: tonoAvance(umbral.avance),
    proyectadoPct: Math.min(100, Math.max(0, Math.round((proy.proyectadoDiciembre / umbral.umbralSoles) * 100))),
    avisoPct: umbral.avisoSoles !== null ? Math.min(100, Math.round((umbral.avisoSoles / umbral.umbralSoles) * 100)) : null,
    avisoUit: umbral.avisoSoles !== null ? (parametros.avisoUmbralUit?.valor ?? null) : null,
    frase: `${cruce} Cierras el año en ${solesRedondo(proy.proyectadoDiciembre)}.`,
    uit: { anio: parametros.uit.anio, valor: parametros.uit.valor, provisional: parametros.uit.provisional || parametros.umbralUit?.provisional === true },
  };
}

// ---- El IGV de cada mes, en barras ----------------------------------------------------------------------------------------

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Una barra por mes con el IGV del mes: lo que se paga de IGV o, si quedó a favor, el saldo (en verde). El mes que se mira va en tinta
 * (`destacada`); el que todavía corre, rayado. Es el IGV (ventas − compras): la renta no entra, porque
 * su tasa es del año y la base no la guarda mes a mes.
 */
export function barrasMeses(sobres: readonly Sobre[]): { barras: BarraTiempo[]; destacada: string | null } {
  const barras = sobres.map((s): BarraTiempo => {
    const mes = Number(s.mes.slice(5, 7)) - 1;
    const que = s.aFavor ? `${solesRedondo(s.monto)} a favor` : `${solesRedondo(s.monto)} de IGV`;
    return {
      clave: s.mes,
      valor: s.monto,
      etiqueta: MES_CORTO[mes] ?? s.mes,
      fuerte: s.elegido,
      cifra: milesCortos(s.monto),
      tip: `${s.nombre}: ${que} · ${s.texto}`,
      aria: `${s.nombre}: ${que}, ${s.texto}${s.elegido ? " (lo estás viendo)" : ""}`,
      tono: s.aFavor ? "verde" : undefined,
      rayada: s.estado === "en_curso",
    };
  });
  return { barras, destacada: sobres.find((s) => s.elegido)?.mes ?? null };
}
