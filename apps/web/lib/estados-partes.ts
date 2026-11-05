// Estados financieros ▸ lo que se explora de cada estado (ADR-0611; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): las partes de la barra o del
// gráfico, cada una con su detalle completo. Solo la forma y lo que se calcula igual en los cuatro estados: quién llena cada parte vive en la regla de su estado.

export type FilaDeParte = { nombre: string; valor: number };

export type ColumnaDeParte = { etiqueta: string; valor: number; actual: boolean };

export type ChipDeParte = { texto: string; tono: "bien" | "mal" | null };

export type ParteEstado = {
  clave: string;
  nombre: string;
  /** Un color de la receta: `var(--estados-parte-1)`, `var(--color-verde)`. */
  color: string;
  /** Lo que ocupa en la barra. 0: tiene su tarjeta, pero no entra a la barra. */
  enBarra: number;
  /** La cifra de su tarjeta, ya escrita. */
  texto: string;
  /** Debajo de la cifra: «38 %». */
  sub?: string;
  tono?: "bien" | "mal";
  /** Qué es, en una frase. */
  que: string;
  /** La cifra grande del detalle. */
  cifra: number;
  /** Las filas del detalle. */
  filas: FilaDeParte[];
  /** Las filas llevan su signo y su color: suman y restan. */
  conSignos?: boolean;
  /** Las últimas columnas, de la más vieja a la de ahora. */
  columnas: ColumnaDeParte[];
  chip: ChipDeParte | null;
  /** Lo que hay que saber de esta parte, en una línea. */
  aviso?: string | null;
  /** Se explora en el gráfico, pero no lleva tarjeta debajo (empezar y terminar). */
  soloEnElGrafico?: boolean;
};

/** La barrita de una fila del detalle, contra la mayor. */
export function anchoDeFila(valor: number, filas: readonly FilaDeParte[]): number {
  const tope = Math.max(...filas.map((f) => Math.abs(f.valor)), 1);
  return (Math.abs(valor) / tope) * 100;
}

/** Lo alto de una columna del detalle, de 4 a 72 px, contra la mayor. */
export function altoDeColumna(valor: number, columnas: readonly ColumnaDeParte[]): number {
  const tope = Math.max(...columnas.map((c) => Math.abs(c.valor)), 1);
  return Math.max((Math.abs(valor) / tope) * 72, 4);
}

export type TipoFilaDelLibro = "normal" | "total" | "grupo";
export type FilaDelLibro = { nombre: string; valor: number; tipo: TipoFilaDelLibro };
export type PasoDelLibro = FilaDelLibro & { desde: number; ancho: number; color: string };

/**
 * El libro del contador: cada fila con su barrita, y cada barrita empieza donde terminó la anterior, así se ve de dónde sale el total. Un total vuelve a
 * nacer en cero. Es el mismo cuadro de siempre con su nombre contable; la barrita solo ayuda a leerlo.
 */
export function pasosDelLibro(filas: readonly FilaDelLibro[]): PasoDelLibro[] {
  let corrido = 0;
  const tramos = filas.map((f, i) => {
    const nace = i === 0 || f.tipo === "total";
    const de = nace ? 0 : corrido;
    const a = nace ? f.valor : corrido + f.valor;
    corrido = a;
    return { f, i, menor: Math.min(de, a), mayor: Math.max(de, a) };
  });
  const lo = Math.min(0, ...tramos.map((t) => t.menor));
  const hi = Math.max(...tramos.map((t) => t.mayor), lo + 1);
  const escala = (x: number) => ((x - lo) / (hi - lo)) * 100;
  return tramos.map(({ f, i, menor, mayor }) => ({
    ...f,
    desde: escala(menor),
    ancho: escala(mayor) - escala(menor),
    color: f.tipo === "total" ? (f.valor < 0 ? "var(--color-rojo)" : "var(--color-verde)") : i === 0 ? "var(--estados-parte-1)" : f.valor < 0 ? "var(--color-rojo)" : "var(--color-verde)",
  }));
}

/** «Ver más: sedes, campañas y lo planeado». Sin nada que ofrecer, `null`: el botón no se dibuja. */
export function textoDeVerMas(cosas: readonly string[]): string | null {
  if (!cosas.length) return null;
  return `Ver más: ${cosas.length === 1 ? cosas[0]! : `${cosas.slice(0, -1).join(", ")} y ${cosas.at(-1)!}`}`;
}

/** Una cifra de una fila con signo: «+S/ 1,200», «−S/ 1,200». */
export const textoDelLibro = (n: number) => `${Math.round(n) < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

/** La diferencia contra la columna anterior, dicha en palabras. Sin columna anterior, nada. */
export function chipContraAnterior(columnas: readonly ColumnaDeParte[], nombreAnterior: string, buenoSubir: boolean | null, soles: (n: number) => string): ChipDeParte | null {
  if (columnas.length < 2) return null;
  const d = Math.round(columnas.at(-1)!.valor - columnas.at(-2)!.valor);
  if (d === 0) return { texto: `Igual que ${nombreAnterior}`, tono: null };
  const tono = buenoSubir === null ? null : d > 0 === buenoSubir ? "bien" : "mal";
  return { texto: `${soles(Math.abs(d))} ${d > 0 ? "más" : "menos"} que ${nombreAnterior}`, tono };
}
