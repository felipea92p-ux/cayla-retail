// Estados financieros ▸ Balance general (ADR-0611, actividad 6; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): cuánto vale CAYLA, una frase y dos tubos del mismo largo: lo
// que tienes, contra lo que debes y lo tuyo.
//
// PROMETE: de los grupos de `gruposDelBalance` salen las palabras, las partes y el libro. Los dos tubos miden lo mismo porque el Balance solo se dibuja si cuadra (ADR-0198): esa
// decisión no vive aquí, se recibe ya tomada. Mirando una sede, lo mismo con lo que es suyo, y se dice que no es un Balance completo.
// ASUME: toda cifra viene de la base. Aquí no se suma plata nueva: se agrupa y se escribe. Sin un corte anterior que cuadre no se compara: nunca contra un número que no se sabe.

import { textoRinde, type UnidadBalance } from "./balance-reglas";
import { chipContraAnterior, type ColumnaDeParte, type FilaDeParte, type FilaDelLibro, type LadoDelLibro, type ParteEstado } from "./estados-partes";
import { finDelMes, sumarMeses } from "./estados-periodo";
import { soles } from "./flujo-caja-reglas";
import { mesNombre } from "./resultados-reglas";
import type { GrupoBalance } from "./vale-reglas";

const rojo = (p: number) => `color-mix(in srgb, var(--color-rojo) ${p}%, var(--color-hueso))`;

const DE_CADA_GRUPO: Record<string, { color: string; que: string; contable: string }> = {
  plata: { color: "var(--color-verde)", que: "Lo que tienes disponible, en cajas y bancos.", contable: "Efectivo y equivalentes" },
  cobros: { color: "var(--estados-parte-3)", que: "Ventas con tarjeta que el banco aún no deposita y lo que te deben.", contable: "Cuentas por cobrar" },
  mercaderia: { color: "var(--estados-parte-1)", que: "Las prendas que aún no vendes, a lo que te costaron.", contable: "Mercadería" },
  equipos: { color: "var(--estados-parte-2)", que: "Lo que valen hoy, ya restado el desgaste.", contable: "Muebles y equipos" },
  "otros-tiene": { color: "var(--estados-parte-4)", que: "Lo demás que CAYLA tiene.", contable: "Otros activos" },
  proveedores: { color: "var(--color-rojo)", que: "Facturas de compras por pagar.", contable: "Proveedores" },
  impuestos: { color: rojo(78), que: "El impuesto de las ventas, que se paga a SUNAT el mes siguiente.", contable: "Tributos por pagar" },
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
  const d = antes ? Math.round(tuyo - totalDe(antes, "tuyo")) : null;
  const cierre = nombreDelCierre(corte);
  return {
    valor: tuyo,
    mal: tuyo < 0,
    frase: `Es lo que vale CAYLA: tienes ${soles(tiene)} y debes ${soles(debe)}.`,
    chip: d === null ? null : d === 0 ? { texto: `Igual que a ${cierre}`, tono: null } : { texto: `${soles(Math.abs(d))} ${d > 0 ? "más" : "menos"} que a ${cierre}`, tono: d > 0 ? "bien" : "mal" },
    nota: tiene > 0 && mercaderia > 0 ? `El ${Math.round((mercaderia / tiene) * 100)} % de lo que tienes está en mercadería.` : null,
  };
}

export type ComparadaBalance = { etiqueta: string; grupos: readonly GrupoBalance[] | null };

/** Una parte por grupo. «Lo tuyo» solo está en el tubo: es lo que queda, no algo que se pueda sumar a las tarjetas. */
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
      texto: soles(g.monto),
      tono: g.clave === "tuyo" ? (g.monto < 0 ? "mal" : "bien") : undefined,
      que: dato.que,
      cifra: g.monto,
      filas: g.lineas.map((l) => ({ nombre: l.nombre, valor: l.monto })),
      columnas,
      // Una deuda que sube no es buena; lo tuyo que sube, sí. El resto solo se dice.
      chip: chipContraAnterior(columnas, cierre, g.lado === "tuyo" ? true : g.lado === "debe" ? false : null, soles),
      soloEnElGrafico: g.lado === "tuyo",
    };
  });
}

/** El Balance del contador, con sus nombres de siempre, en dos lados. */
export function ladosDelBalance(grupos: readonly GrupoBalance[]): LadoDelLibro[] {
  const contable = (g: GrupoBalance) => DE_CADA_GRUPO[g.clave]?.contable ?? g.nombre;
  const filas = (lado: GrupoBalance["lado"]): FilaDelLibro[] => grupos.filter((g) => g.lado === lado).map((g) => ({ nombre: contable(g), valor: g.monto, tipo: "normal" }));
  const { tiene, debe, tuyo } = totalesDelBalance(grupos);
  return [
    { titulo: "Lo que tienes · Activo", total: tiene, filas: [...filas("tiene"), { nombre: "Total activo", valor: tiene, tipo: "total" }] },
    {
      titulo: "Lo que debes y lo tuyo · Pasivo y patrimonio",
      total: tiene,
      filas: [...filas("debe"), { nombre: "Total pasivo", valor: debe, tipo: "total" }, { nombre: "Patrimonio", valor: tuyo, tipo: "total" }],
    },
  ];
}

// ---- Mirando una sede --------------------------------------------------------------------------------------------------------

const mueblesDe = (u: UnidadBalance) => u.activosFijos;
const tieneLaSede = (u: UnidadBalance) => (u.caja ?? 0) + u.mercaderia + mueblesDe(u);

export type ComparadaSede = { etiqueta: string; unidad: UnidadBalance | null };

/** Lo que dice la pantalla mirando una sede: no es un Balance completo y se dice sin rodeos. */
export function lecturaDeLaSede(u: UnidadBalance, antes: UnidadBalance | null, corte: string): LecturaDelBalance {
  const d = antes ? Math.round(u.invertido - antes.invertido) : null;
  const cierre = nombreDelCierre(corte);
  return {
    valor: u.invertido,
    mal: u.invertido < 0,
    frase: `Es lo que hay invertido en ${u.nombre}: tiene ${soles(tieneLaSede(u))} y debe ${soles(u.facturasPorPagar)}.`,
    chip: d === null ? null : d === 0 ? { texto: `Igual que a ${cierre}`, tono: null } : { texto: `${soles(Math.abs(d))} ${d > 0 ? "más" : "menos"} que a ${cierre}`, tono: d > 0 ? "bien" : "mal" },
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
    return { clave, nombre, color, que, enBarra: Math.max(de(u), 0), texto: soles(de(u)), cifra: de(u), filas, columnas, chip: chipContraAnterior(columnas, cierre, buenoSubir, soles), ...extra };
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

/** Lo de la sede para el contador, en dos lados. */
export function ladosDeLaSede(u: UnidadBalance): LadoDelLibro[] {
  const tiene = tieneLaSede(u);
  return [
    {
      titulo: "Lo que tiene",
      total: tiene,
      filas: [
        ...(u.caja === null ? [] : [{ nombre: "Cajón y caja fuerte", valor: u.caja, tipo: "normal" as const }]),
        { nombre: "Mercadería", valor: u.mercaderia, tipo: "normal" },
        { nombre: "Muebles, equipos y mejoras", valor: mueblesDe(u), tipo: "normal" },
        { nombre: "Total", valor: tiene, tipo: "total" },
      ],
    },
    {
      titulo: "Lo que debe y lo invertido",
      total: tiene,
      filas: [
        { nombre: "Facturas por pagar", valor: u.facturasPorPagar, tipo: "normal" },
        { nombre: "Invertido", valor: u.invertido, tipo: "total" },
      ],
    },
  ];
}
