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



/** «Ver más: sedes, campañas y lo planeado». Sin nada que ofrecer, `null`: el botón no se dibuja. */
export function textoDeVerMas(cosas: readonly string[]): string | null {
  if (!cosas.length) return null;
  return `Ver más: ${cosas.length === 1 ? cosas[0]! : `${cosas.slice(0, -1).join(", ")} y ${cosas.at(-1)!}`}`;
}


/** La diferencia contra la columna anterior, dicha en palabras. Sin columna anterior, nada. */
export function chipContraAnterior(columnas: readonly ColumnaDeParte[], nombreAnterior: string, buenoSubir: boolean | null, soles: (n: number) => string): ChipDeParte | null {
  if (columnas.length < 2) return null;
  const d = Math.round(columnas.at(-1)!.valor - columnas.at(-2)!.valor);
  if (d === 0) return { texto: `Igual que ${nombreAnterior}`, tono: null };
  const tono = buenoSubir === null ? null : d > 0 === buenoSubir ? "bien" : "mal";
  return { texto: `${soles(Math.abs(d))} ${d > 0 ? "más" : "menos"} que ${nombreAnterior}`, tono };
}
