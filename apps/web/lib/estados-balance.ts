// Estados financieros ▸ Balance general (ADR-0611, ADR-0619; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): Activo, Pasivo y Patrimonio, una frase y dos tubos del mismo largo:
// Activo, contra Pasivo + Patrimonio.
//
// PROMETE: de los grupos de `gruposDelBalance` salen las palabras, las partes y el libro. Los dos tubos miden lo mismo porque el Balance no se dibuja si esa ecuación falla (ADR-0619): esa
// decisión no vive aquí, se recibe ya tomada. Mirando una sede, lo mismo con lo que es suyo, y se dice que no es un Balance completo.
// ASUME: toda cifra viene de la base. Aquí no se suma plata nueva: se agrupa y se escribe. Sin un corte anterior que cuadre no se compara: nunca contra un número que no se sabe.

import { textoRinde, type UnidadBalance } from "./balance-reglas";
import { chipContraAnterior, type ColumnaDeParte, type FilaDeParte, type ParteEstado } from "./estados-partes";
import { finDelMes, sumarMeses } from "./estados-periodo";
import { pesoContra, type FilaInforme, type Informe } from "./estados-informe";
import { solesCentimos } from "./flujo-caja-reglas";
import { mesNombre } from "./resultados-reglas";
import type { GrupoBalance } from "./vale-reglas";

/** Montos con céntimos (Felipe 2026-11-06): la pantalla los escribe con dos decimales, así que no se redondean al sol. */
const aCentimos = (n: number) => Math.round(n * 100) / 100;

const rojo = (p: number) => `color-mix(in srgb, var(--color-rojo) ${p}%, var(--color-hueso))`;

const DE_CADA_GRUPO: Record<string, { color: string; que: string; contable: string }> = {
  plata: { color: "var(--color-verde)", que: "Lo que tienes disponible, en cajas y bancos.", contable: "Efectivo y equivalentes" },
  cobros: { color: "var(--estados-parte-3)", que: "Ventas con tarjeta que el banco aún no deposita y lo que te deben.", contable: "Cuentas por cobrar" },
  credito: { color: "var(--color-taupe)", que: "IGV que SUNAT te reconoce: se descuenta del que tocaría pagar en los próximos meses. No se cobra en plata.", contable: "Crédito fiscal" },
  mercaderia: { color: "var(--estados-parte-1)", que: "Las prendas que aún no vendes, a lo que te costaron, y las telas y la ropa en proceso del Taller.", contable: "Existencias" },
  equipos: { color: "var(--estados-parte-2)", que: "Lo que valen hoy, ya restado el desgaste.", contable: "Muebles y equipos" },
  "otros-tiene": { color: "var(--estados-parte-4)", que: "Lo demás que CAYLA tiene.", contable: "Otros activos" },
  proveedores: { color: "var(--color-rojo)", que: "Facturas de compras por pagar.", contable: "Proveedores" },
  impuestos: { color: rojo(78), que: "Lo que el libro dice que le debes a SUNAT. Cuánto pagas cada mes lo dice Impuestos.", contable: "Tributos por pagar" },
  sueldos: { color: rojo(58), que: "Lo que aún no se paga al equipo.", contable: "Sueldos por pagar" },
  prestamos: { color: rojo(40), que: "Lo que se debe de la tarjeta y de préstamos.", contable: "Tarjeta y préstamos" },
  "otros-debe": { color: rojo(28), que: "Lo demás que CAYLA debe.", contable: "Otros pasivos" },
  tuyo: { color: "var(--color-verde)", que: "Lo que queda después de pagar todo lo que debes.", contable: "Patrimonio" },
};

const totalDe = (grupos: readonly GrupoBalance[], lado: GrupoBalance["lado"]) => grupos.filter((g) => g.lado === lado).reduce((a, g) => a + g.monto, 0);
const montoDe = (grupos: readonly GrupoBalance[], clave: string) => grupos.find((g) => g.clave === clave)?.monto ?? 0;

export type TotalesDelBalance = { tiene: number; debe: number; tuyo: number };
export const totalesDelBalance = (grupos: readonly GrupoBalance[]): TotalesDelBalance => ({ tiene: totalDe(grupos, "tiene"), debe: totalDe(grupos, "debe"), tuyo: totalDe(grupos, "tuyo") });

export type CorteAnterior = { corte: string; etiqueta: string };

/** Los cierres de los dos meses de antes, del más viejo al más nuevo, sin los que caen antes de que Finanzas contara. */
export function cortesAnteriores(corte: string, minimo: string | null): CorteAnterior[] {
  const mes = corte.slice(0, 7);
  const cierre = (k: number): CorteAnterior => {
    const m = sumarMeses(mes, -k);
    return { corte: finDelMes(m), etiqueta: etiquetaDelCorte(m) };
  };
  return [cierre(2), cierre(1)].filter((c) => !minimo || c.corte >= minimo);
}

/** Cómo se nombra una fecha en su columna: «Oct». */
export function etiquetaDelCorte(corte: string): string {
  const nombre = mesNombre(corte.slice(0, 7)).slice(0, 3);
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** Cómo se nombra el cierre con que se compara: «fin de octubre». */
export const nombreDelCierre = (corte: string) => `fin de ${mesNombre(sumarMeses(corte.slice(0, 7), -1))}`;

export type LecturaDelBalance = { valor: number; mal: boolean; frase: string; chip: { texto: string; tono: "bien" | "mal" | null } | null; nota: string | null };

/** Lo que dice la pantalla arriba. `antes`: los grupos del cierre anterior, si cuadró. */
export function lecturaDelBalance(grupos: readonly GrupoBalance[], antes: readonly GrupoBalance[] | null, corte: string): LecturaDelBalance {
  const { tiene, debe, tuyo } = totalesDelBalance(grupos);
  const mercaderia = montoDe(grupos, "mercaderia");
  const d = antes ? aCentimos(tuyo - totalDe(antes, "tuyo")) : null;
  const cierre = nombreDelCierre(corte);
  return {
    valor: tuyo,
    mal: tuyo < 0,
    frase: `Es lo que vale CAYLA: Activo ${solesCentimos(tiene)} menos Pasivo ${solesCentimos(debe)}.`,
    chip: d === null ? null : d === 0 ? { texto: `Igual que a ${cierre}`, tono: null } : { texto: `${solesCentimos(Math.abs(d))} ${d > 0 ? "más" : "menos"} que a ${cierre}`, tono: d > 0 ? "bien" : "mal" },
    nota: tiene > 0 && mercaderia > 0 ? `El ${Math.round((mercaderia / tiene) * 100)} % del Activo está en mercadería y telas.` : null,
  };
}

/**
 * El puente con Ganancias y pérdidas (ADR-0621, decisión 4). El Balance sale del diario y Ganancias ya resta los sueldos que Dynamic todavía no paga: sin esto, las dos pantallas dicen lo contrario
 * del mismo mes. No mueve el libro: lo dice. `sueldosEstimados` es la `planillaEstimada` de la misma lectura que usa Ganancias, nunca una cifra escrita a mano. `null` si no hay nada que restar.
 */
export function avisoSueldosDelBalance(grupos: readonly GrupoBalance[], sueldosEstimados: number): string | null {
  if (Math.round(sueldosEstimados) <= 0) return null;
  const resultado = grupos.find((g) => g.lado === "tuyo")?.lineas.find((l) => l.cuenta === "resultado_mes")?.monto ?? 0;
  const despues = aCentimos(resultado - sueldosEstimados);
  const cambiaDeSigno = resultado > 0 && despues < 0 ? ` Restados, la utilidad queda en pérdida de ${solesCentimos(-despues)}.` : "";
  return `Sin sueldos provisionados: aún falta restar ${solesCentimos(sueldosEstimados)} que Dynamic no paga.${cambiaDeSigno} El Pasivo tampoco los incluye.`;
}

export type ComparadaBalance = { etiqueta: string; grupos: readonly GrupoBalance[] | null };

/** Una parte por grupo. El Patrimonio solo está en el tubo: es lo que queda, no algo que se pueda sumar a las tarjetas. */
export function partesDelBalance({ grupos, comparadas, etiquetaActual, corte }: { grupos: readonly GrupoBalance[]; comparadas: readonly ComparadaBalance[]; etiquetaActual: string; corte: string }): ParteEstado[] {
  const pasadas = comparadas.filter((c) => c.grupos);
  const cierre = `a ${nombreDelCierre(corte)}`;
  return grupos.map((g) => {
    const dato = DE_CADA_GRUPO[g.clave] ?? DE_CADA_GRUPO[g.lado === "debe" ? "otros-debe" : "otros-tiene"]!;
    const columnas: ColumnaDeParte[] = [...pasadas.map((c) => ({ etiqueta: c.etiqueta, valor: montoDe(c.grupos!, g.clave), actual: false })), { etiqueta: etiquetaActual, valor: g.monto, actual: true }];
    return {
      clave: g.clave,
      nombre: g.nombre,
      color: dato.color,
      enBarra: Math.max(g.monto, 0),
      texto: solesCentimos(g.monto),
      tono: g.clave === "tuyo" ? (g.monto < 0 ? "mal" : "bien") : undefined,
      que: dato.que,
      cifra: g.monto,
      filas: g.lineas.map((l) => ({ nombre: l.nombre, valor: l.monto })),
      columnas,
      // Una deuda que sube no es buena; lo tuyo que sube, sí. El resto solo se dice.
      chip: chipContraAnterior(columnas, cierre, g.lado === "tuyo" ? true : g.lado === "debe" ? false : null, solesCentimos),
      soloEnElGrafico: g.lado === "tuyo",
    };
  });
}


// ---- Mirando una sede --------------------------------------------------------------------------------------------------------

const mueblesDe = (u: UnidadBalance) => u.activosFijos;
const tieneLaSede = (u: UnidadBalance) => (u.caja ?? 0) + u.mercaderia + mueblesDe(u);

export type ComparadaSede = { etiqueta: string; unidad: UnidadBalance | null };

/** Lo que dice la pantalla mirando una sede: no es un Balance completo y se dice sin rodeos. */
export function lecturaDeLaSede(u: UnidadBalance, antes: UnidadBalance | null, corte: string): LecturaDelBalance {
  const d = antes ? aCentimos(u.invertido - antes.invertido) : null;
  const cierre = nombreDelCierre(corte);
  return {
    valor: u.invertido,
    mal: u.invertido < 0,
    frase: `Es lo que hay invertido en ${u.nombre}: tiene ${solesCentimos(tieneLaSede(u))} y debe ${solesCentimos(u.facturasPorPagar)}.`,
    chip: d === null ? null : d === 0 ? { texto: `Igual que a ${cierre}`, tono: null } : { texto: `${solesCentimos(Math.abs(d))} ${d > 0 ? "más" : "menos"} que a ${cierre}`, tono: d > 0 ? "bien" : "mal" },
    nota: u.tipo === "taller" ? "No es un Balance completo: el banco, el capital y el IGV son de CAYLA entera. El Taller no vende." : `No es un Balance completo: el banco, el capital y el IGV son de CAYLA entera. Rinde ${textoRinde(u.rinde)}.`,
  };
}

/** Lo que es de la sede, parte por parte. Con la caja abierta su cifra no se muestra (ADR-0186): se dice por qué. */
export function partesDeLaSede({ unidad: u, comparadas, etiquetaActual, corte }: { unidad: UnidadBalance; comparadas: readonly ComparadaSede[]; etiquetaActual: string; corte: string }): ParteEstado[] {
  const pasadas = comparadas.filter((c) => c.unidad);
  const cierre = `a ${nombreDelCierre(corte)}`;
  const columnasDe = (de: (x: UnidadBalance) => number) => [...pasadas.map((c) => ({ etiqueta: c.etiqueta, valor: de(c.unidad!), actual: false })), { etiqueta: etiquetaActual, valor: de(u), actual: true }];
  const parte = (clave: string, nombre: string, color: string, que: string, de: (x: UnidadBalance) => number, filas: FilaDeParte[], buenoSubir: boolean | null, extra: Partial<ParteEstado> = {}): ParteEstado => {
    const columnas = columnasDe(de);
    return { clave, nombre, color, que, enBarra: Math.max(de(u), 0), texto: solesCentimos(de(u)), cifra: de(u), filas, columnas, chip: chipContraAnterior(columnas, cierre, buenoSubir, solesCentimos), ...extra };
  };
  const caja: ParteEstado =
    u.caja === null
      ? { clave: "caja", nombre: "Cajón y caja fuerte", color: "var(--color-verde)", que: "La caja está abierta: su cifra la ve quien la cierra.", enBarra: 0, texto: "—", cifra: 0, filas: [], columnas: [], chip: null }
      : parte("caja", "Cajón y caja fuerte", "var(--color-verde)", "La plata que está en la tienda.", (x) => x.caja ?? 0, [], null);
  const facturas = parte("facturas", "Facturas por pagar", "var(--color-rojo)", "Las que pidió, enteras, aunque parte de la mercadería vaya a otra tienda.", (x) => x.facturasPorPagar, [], false);
  return [
    caja,
    parte("mercaderia", "Mercadería", "var(--estados-parte-1)", "Las prendas que aún no vendes, a lo que te costaron.", (x) => x.mercaderia, [], null),
    parte(
      "equipos",
      "Muebles, equipos y mejoras",
      "var(--estados-parte-2)",
      "Lo que valen hoy, ya restado el desgaste.",
      mueblesDe,
      u.activosDepreciacion > 0
        ? [
            { nombre: "Lo que costaron", valor: u.activosCosto },
            { nombre: "Desgaste", valor: -u.activosDepreciacion },
          ]
        : [],
      null,
    ),
    facturas,
    parte("invertido", "Invertido", "var(--color-verde)", "Lo que tiene menos lo que debe.", (x) => x.invertido, [], true, { soloEnElGrafico: true, tono: u.invertido < 0 ? "mal" : "bien" }),
  ];
}


// ---- Como informe (camino A, Felipe 2026-11-06) -----------------------------------------------------------------------------

/** Cómo llama el contador a cada línea del Patrimonio. */
const CONTABLE_PATRIMONIO: Record<string, string> = { "50": "Capital", "52": "Capital adicional", "591": "Resultados acumulados", resultado_mes: "Resultado del ejercicio" };
const ORDEN_PATRIMONIO = Object.keys(CONTABLE_PATRIMONIO);
const ordenPatrimonio = (cuenta: string) => {
  const i = ORDEN_PATRIMONIO.indexOf(cuenta);
  return i < 0 ? ORDEN_PATRIMONIO.length : i;
};

/**
 * El Balance como lo lee un contador (ADR-0619): tres secciones, Activo, Pasivo y Patrimonio, cada una con sus filas y su total, y al final Pasivo + Patrimonio, que es igual al Activo.
 * El Patrimonio va línea por línea: capital, aportes, resultados acumulados y el resultado del mes. Las columnas de antes solo llevan un cierre que cuadró (los demás son «—»). Cada fila pesa
 * contra el Activo. El detalle de cada fila sale de las mismas partes (`partesDelBalance`).
 */
export function informeDelBalance({ grupos, partes, comparadas, etiquetaActual, avisoResultado = null }: { grupos: readonly GrupoBalance[]; partes: readonly ParteEstado[]; comparadas: readonly ComparadaBalance[]; etiquetaActual: string; /** Lo que hay que saber de la fila del resultado (`avisoSueldosDelBalance`). Va por su cuenta, no por su nombre: con columnas de antes se llama «Resultado del mes». */ avisoResultado?: string | null }): Informe {
  const t = totalesDelBalance(grupos);
  const valores = (de: (gs: readonly GrupoBalance[]) => number) => [...comparadas.map((c) => (c.grupos ? de(c.grupos) : null)), de(grupos)];
  const deParte = (clave: string) => {
    const p = partes.find((x) => x.clave === clave);
    return p ? { que: p.que, detalle: p.filas } : {};
  };
  const linea = (g: GrupoBalance): FilaInforme => ({
    clave: g.clave,
    nombre: g.nombre,
    contable: DE_CADA_GRUPO[g.clave]?.contable ?? g.nombre,
    tipo: "linea",
    valores: valores((gs) => montoDe(gs, g.clave)),
    peso: pesoContra(g.monto, t.tiene),
    ...deParte(g.clave),
  });
  const delPatrimonio = (gs: readonly GrupoBalance[]) => gs.find((g) => g.lado === "tuyo")?.lineas ?? [];
  const montoPatrimonio = (gs: readonly GrupoBalance[], cuenta: string) => delPatrimonio(gs).find((l) => l.cuenta === cuenta)?.monto ?? 0;
  // Una línea en cero hoy, con saldo en un cierre de antes, se queda: si no, esa columna no sumaría su total.
  const pasadas = comparadas.flatMap((c) => (c.grupos ? [c.grupos] : []));
  const cuentasPatrimonio = [...new Map([grupos, ...pasadas].flatMap((gs) => delPatrimonio(gs)).filter((l) => l.monto !== 0).map((l) => [l.cuenta, l])).values()].sort(
    (a, b) => ordenPatrimonio(a.cuenta) - ordenPatrimonio(b.cuenta),
  );
  const seccion = (nombre: string): FilaInforme => ({ clave: `seccion-${nombre}`, nombre, contable: nombre, tipo: "seccion", valores: [] });
  return {
    titulo: "Balance general",
    columnas: [...comparadas.map((c) => ({ etiqueta: c.etiqueta, actual: false })), { etiqueta: etiquetaActual, actual: true }],
    pesoDe: t.tiene > 0 ? "% del Activo" : null,
    filas: [
      seccion("Activo"),
      ...grupos.filter((g) => g.lado === "tiene").map(linea),
      { clave: "total-tiene", nombre: "Total Activo", contable: "Total activo", tipo: "subtotal", valores: valores((gs) => totalDe(gs, "tiene")), peso: t.tiene > 0 ? "100 %" : null },
      seccion("Pasivo"),
      ...grupos.filter((g) => g.lado === "debe").map(linea),
      { clave: "total-debe", nombre: "Total Pasivo", contable: "Total pasivo", tipo: "subtotal", valores: valores((gs) => totalDe(gs, "debe")), peso: pesoContra(t.debe, t.tiene) },
      seccion("Patrimonio"),
      ...cuentasPatrimonio.map(
        (l): FilaInforme => ({
          clave: `tuyo-${l.cuenta}`,
          // El resultado es de un mes distinto en cada columna: con columnas de antes no se le pone el mes de ahora.
          nombre: l.cuenta === "resultado_mes" && pasadas.length ? "Resultado del mes" : l.nombre,
          contable: CONTABLE_PATRIMONIO[l.cuenta] ?? l.nombre,
          tipo: "linea",
          valores: valores((gs) => montoPatrimonio(gs, l.cuenta)),
          peso: pesoContra(montoPatrimonio(grupos, l.cuenta), t.tiene),
          ...(l.cuenta === "resultado_mes" && avisoResultado ? { aviso: avisoResultado } : {}),
        }),
      ),
      { clave: "total-tuyo", nombre: "Total Patrimonio", contable: "Total patrimonio", tipo: "subtotal", valores: valores((gs) => totalDe(gs, "tuyo")), peso: pesoContra(t.tuyo, t.tiene), tono: t.tuyo < 0 ? "mal" : "bien" },
      { clave: "total-pasivo-patrimonio", nombre: "Total Pasivo + Patrimonio", contable: "Total pasivo y patrimonio", tipo: "total", valores: valores((gs) => totalDe(gs, "debe") + totalDe(gs, "tuyo")), peso: t.tiene > 0 ? "100 %" : null },
    ],
  };
}

/** Lo de una sede como informe: lo que tiene, lo que debe y lo invertido. No es un Balance completo: el banco, el capital y el IGV son de CAYLA entera. */
export function informeDeLaSede({ unidad: u, partes, comparadas, etiquetaActual }: { unidad: UnidadBalance; partes: readonly ParteEstado[]; comparadas: readonly ComparadaSede[]; etiquetaActual: string }): Informe {
  const valores = (de: (x: UnidadBalance) => number | null) => [...comparadas.map((c) => (c.unidad ? de(c.unidad) : null)), de(u)];
  const tiene = tieneLaSede(u);
  const deParte = (clave: string) => {
    const p = partes.find((x) => x.clave === clave);
    return p ? { que: p.que, detalle: p.filas } : {};
  };
  return {
    titulo: u.nombre,
    columnas: [...comparadas.map((c) => ({ etiqueta: c.etiqueta, actual: false })), { etiqueta: etiquetaActual, actual: true }],
    pesoDe: tiene > 0 ? "De lo que tiene" : null,
    filas: [
      { clave: "caja", nombre: "Cajón y caja fuerte", contable: "Efectivo", tipo: "linea", valores: valores((x) => x.caja), peso: u.caja === null ? null : pesoContra(u.caja, tiene), ...deParte("caja") },
      { clave: "mercaderia", nombre: "Mercadería", contable: "Mercadería", tipo: "linea", valores: valores((x) => x.mercaderia), peso: pesoContra(u.mercaderia, tiene), ...deParte("mercaderia") },
      { clave: "equipos", nombre: "Muebles, equipos y mejoras", contable: "Inmuebles, maquinaria y equipo", tipo: "linea", valores: valores(mueblesDe), peso: pesoContra(mueblesDe(u), tiene), ...deParte("equipos") },
      { clave: "total-tiene", nombre: "Lo que tiene", contable: "Total activo", tipo: "subtotal", valores: valores(tieneLaSede), peso: tiene > 0 ? "100 %" : null },
      { clave: "facturas", nombre: "Facturas por pagar", contable: "Proveedores", tipo: "linea", resta: true, valores: valores((x) => x.facturasPorPagar), peso: pesoContra(u.facturasPorPagar, tiene), ...deParte("facturas") },
      { clave: "invertido", nombre: "Invertido", contable: "Inversión de la casa", tipo: "total", valores: valores((x) => x.invertido), peso: pesoContra(u.invertido, tiene), tono: u.invertido < 0 ? "mal" : "bien", ...deParte("invertido") },
    ],
  };
}
