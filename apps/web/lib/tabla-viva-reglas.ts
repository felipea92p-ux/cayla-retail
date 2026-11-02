/* ====================================================================
   La tabla con superpoderes · la lógica pura (ADR-0596; Felipe 2026-10-31 eligió «A · Globo desde la cabecera» mirando la maqueta
   docs/maquetas/tabla-superpoderes-2026-10/).

   Lo que la tabla HACE y no depende de React: filtrar por las opciones de una columna, contar cuántas filas tiene cada opción, ordenar,
   decir en una frase lo que se ve, sumar lo que se ve, la fecha que dice cuánto falta y el ancho de la caja de los montos. La pieza que
   lo dibuja es `components/ui/TablaViva.tsx`; aquí no hay ni un nodo ni un estado.

   Por qué vive aparte: la frase («Ves 2 de 14 órdenes: de Telas Mistral, en camino. Suman S/ 9,120.») y los conteos del globo tienen que
   decir EXACTAMENTE lo mismo que las filas que quedan. Si cada pantalla los armara a mano, el día que una cuente distinto que su filtro la
   persona deja de creerle a la tabla. Una sola función decide qué fila pasa (`pasaFiltros`) y todo lo demás sale de ella.
   ==================================================================== */

export type TipoColumna = "texto" | "numero" | "monto" | "fecha" | "opcion";
export type DireccionOrden = "asc" | "desc";
export type OrdenViva = { clave: string; dir: DireccionOrden };
/** Lo elegido en «Mostrar solo», columna por columna: la clave de la columna y las opciones marcadas. Sin opciones, no filtra. */
export type FiltrosVivos = Readonly<Record<string, readonly string[]>>;

/** Lo que la lógica necesita de una columna (la pieza le suma cómo se dibuja). */
export type ColumnaDatos<F> = {
  clave: string;
  /** El nombre de la columna, como se lee en la cabecera («Proveedor»). */
  titulo: string;
  tipo: TipoColumna;
  /** El valor con que se ORDENA: un texto, un número o una fecha ISO («2026-10-31»). `null` = sin dato, va siempre al final. */
  valor: (fila: F) => string | number | null;
  /** La opción de «Mostrar solo» a la que pertenece la fila («Telas Mistral», «En camino», «Menos de S/ 1,000»). Sin ella, la del
   *  valor dicho como texto. `null` = la fila no tiene opción en esta columna. */
  opcion?: (fila: F) => string | null;
  /** El orden de las opciones del globo, cuando no es el alfabético (los tramos de un rango: «Menos de…», «De… a…», «Más de…»). */
  ordenOpciones?: readonly string[];
  /** Cómo se dice el filtro dentro de la frase («de Telas Mistral o Botones Lumbre», «en camino»). `cuantas` es cuántas filas se ven:
   *  para concordar («nuevo» o «nuevos»). Sin ella: «proveedor: Telas Mistral o Botones Lumbre». */
  frase?: (valores: readonly string[], cuantas: number) => string;
};

const COLADOR = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** La opción de una fila en una columna: la que declara la columna o, si no, su valor como texto. */
export function opcionDe<F>(columna: ColumnaDatos<F>, fila: F): string | null {
  if (columna.opcion) return columna.opcion(fila);
  const v = columna.valor(fila);
  return v === null || v === "" ? null : String(v);
}

/** ¿La fila pasa los filtros puestos? `salvo`: una columna que no se mira (para contar las opciones de ESA columna, como si no
 *  tuviera filtro: así el globo dice cuántas filas tendría cada opción si la marcas). */
export function pasaFiltros<F>(fila: F, columnas: readonly ColumnaDatos<F>[], filtros: FiltrosVivos, salvo?: string): boolean {
  for (const c of columnas) {
    if (c.clave === salvo) continue;
    const elegidas = filtros[c.clave];
    if (!elegidas || elegidas.length === 0) continue;
    const o = opcionDe(c, fila);
    if (o === null || !elegidas.includes(o)) return false;
  }
  return true;
}

export function filtrarFilas<F>(filas: readonly F[], columnas: readonly ColumnaDatos<F>[], filtros: FiltrosVivos): F[] {
  return filas.filter((f) => pasaFiltros(f, columnas, filtros));
}

/** ¿Hay algún filtro de columna puesto? */
export function hayFiltrosPuestos(filtros: FiltrosVivos): boolean {
  return Object.values(filtros).some((v) => v.length > 0);
}

export type OpcionContada = { valor: string; n: number; elegida: boolean };

/**
 * Las opciones de «Mostrar solo» de una columna, cada una con cuántas filas tendría si se marca (contando con los OTROS filtros
 * puestos, no con el de esta columna). Salen de TODAS las filas, no solo de las que se ven: una opción que hoy deja 0 se ve apagada
 * en vez de desaparecer, y lo marcado nunca se esconde aunque quede en 0.
 */
export function contarOpciones<F>(filas: readonly F[], columna: ColumnaDatos<F>, columnas: readonly ColumnaDatos<F>[], filtros: FiltrosVivos): OpcionContada[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const o = opcionDe(columna, f);
    if (o === null) continue;
    if (!cuenta.has(o)) cuenta.set(o, 0);
    if (pasaFiltros(f, columnas, filtros, columna.clave)) cuenta.set(o, (cuenta.get(o) ?? 0) + 1);
  }
  const elegidas = filtros[columna.clave] ?? [];
  for (const e of elegidas) if (!cuenta.has(e)) cuenta.set(e, 0);
  const lugar = (v: string) => {
    const i = columna.ordenOpciones?.indexOf(v) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...cuenta.entries()]
    .map(([valor, n]) => ({ valor, n, elegida: elegidas.includes(valor) }))
    .sort((a, b) => lugar(a.valor) - lugar(b.valor) || COLADOR.compare(a.valor, b.valor));
}

/** Marca o desmarca una opción (se aplica al tocar: no hay botón «Aplicar»). */
export function alternarOpcion(filtros: FiltrosVivos, clave: string, valor: string): FiltrosVivos {
  const actuales = filtros[clave] ?? [];
  const nuevas = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
  return { ...filtros, [clave]: nuevas };
}

/** Compara dos valores de una columna, hacia arriba. Lo que no tiene dato no se compara aquí: lo resuelve `ordenarFilas`. */
function comparar(tipo: TipoColumna, a: string | number, b: string | number): number {
  if (tipo === "numero" || tipo === "monto") return Number(a) - Number(b);
  // Una fecha ISO se ordena como texto (2026-09-30 < 2026-10-01); un texto, como lo lee una persona en español.
  if (tipo === "fecha") return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  return COLADOR.compare(String(a), String(b));
}

/**
 * Una copia ordenada. Lo que no tiene dato va SIEMPRE al final, hacia donde se ordene (un costo sin cargar no es el más barato ni el
 * más caro). El orden es estable: un empate conserva el orden en que llegaron las filas, así nada salta de una vez a otra.
 */
export function ordenarFilas<F>(filas: readonly F[], columna: ColumnaDatos<F> | undefined, dir: DireccionOrden): F[] {
  if (!columna) return [...filas];
  const signo = dir === "asc" ? 1 : -1;
  return filas
    .map((f, i) => ({ f, i, v: columna.valor(f) }))
    .sort((a, b) => {
      const sinA = a.v === null || a.v === "";
      const sinB = b.v === null || b.v === "";
      if (sinA || sinB) return sinA === sinB ? a.i - b.i : sinA ? 1 : -1;
      return comparar(columna.tipo, a.v as string | number, b.v as string | number) * signo || a.i - b.i;
    })
    .map((x) => x.f);
}

/** Cómo se dicen los dos sentidos de un orden en el globo, según lo que guarda la columna. */
export function textosDeOrden(tipo: TipoColumna): { asc: string; desc: string } {
  if (tipo === "numero" || tipo === "monto") return { asc: "Menor primero", desc: "Mayor primero" };
  if (tipo === "fecha") return { asc: "Más antigua primero", desc: "Más reciente primero" };
  return { asc: "A → Z", desc: "Z → A" };
}

/** «Blusas», «Blusas o Casacas», «Blusas, Casacas o Jeans». */
export function unirConO(valores: readonly string[]): string {
  if (valores.length <= 1) return valores[0] ?? "";
  return `${valores.slice(0, -1).join(", ")} o ${valores[valores.length - 1]}`;
}

/** Cómo se dice un filtro de columna en la frase. */
export function parteDeFiltro<F>(columna: ColumnaDatos<F>, valores: readonly string[], cuantas: number): string {
  if (columna.frase) return columna.frase(valores, cuantas);
  return `${columna.titulo.toLowerCase()}: ${unirConO(valores)}`;
}

/** Las partes de la frase, en el orden de las columnas (como se leen de izquierda a derecha). Con 0 filas concuerdan en singular:
 *  la frase dice «Ningún modelo nuevo», no «Ningún modelo nuevos». */
export function partesDeFiltros<F>(columnas: readonly ColumnaDatos<F>[], filtros: FiltrosVivos, cuantas: number): string[] {
  const concordar = cuantas === 0 ? 1 : cuantas;
  return columnas.flatMap((c) => {
    const v = filtros[c.clave];
    return v && v.length > 0 ? [parteDeFiltro(c, v, concordar)] : [];
  });
}

/** El nombre de lo que lista la tabla: «orden»/«órdenes» (femenino), «modelo»/«modelos» (masculino). */
export type Sustantivo = { uno: string; varios: string; genero: "f" | "m" };
/** Un trozo de la frase; `fuerte` va en negrita (la cifra que importa). */
export type PiezaFrase = { texto: string; fuerte?: boolean };

/**
 * Lo que ves, en una frase (superpoder 4): nadie cuenta filas ni suma a mano, ni se olvida de que dejó un filtro puesto.
 *   · sin filtros:  «Ves las 14 órdenes. Suman S/ 9,120.»
 *   · con filtros:  «Ves 2 de 14 órdenes: de Telas Mistral, en camino. Suman S/ 9,120.»
 *   · sin nada:     «Ninguna orden de Telas Mistral, en camino.»
 * `cola` va pegada a lo que se cuenta («los 14 modelos que entraron en los últimos 7 días»); con nada que mostrar no va (se leería
 * «Ningún modelo que entraron…»). `suma` ya viene dicha («340 prendas», «S/ 9,120»): la frase no sabe de monedas.
 */
export function fraseDeLoQueVes({
  visibles,
  total,
  sustantivo,
  partes,
  suma,
  cola,
}: {
  visibles: number;
  total: number;
  sustantivo: Sustantivo;
  partes: readonly string[];
  suma?: string | null;
  cola?: string;
}): PiezaFrase[] {
  const n = (x: number) => x.toLocaleString("es-PE");
  const nombre = (x: number) => (x === 1 ? sustantivo.uno : sustantivo.varios);
  const tras = cola ? ` ${cola}` : "";
  const sumaPieza = (cuantas: number): PiezaFrase[] => (suma ? [{ texto: ` ${cuantas === 1 ? "Suma" : "Suman"} ` }, { texto: suma, fuerte: true }, { texto: "." }] : []);
  if (partes.length === 0) {
    const articulo = sustantivo.genero === "f" ? "las" : "los";
    const cuenta = total === 1 ? `1 ${sustantivo.uno}` : `${articulo} ${n(total)} ${sustantivo.varios}`;
    return [{ texto: "Ves " }, { texto: cuenta, fuerte: true }, { texto: `${tras}.` }, ...sumaPieza(total)];
  }
  if (visibles === 0) {
    const ninguno = sustantivo.genero === "f" ? "Ninguna" : "Ningún";
    return [{ texto: `${ninguno} ${sustantivo.uno}`, fuerte: true }, { texto: ` ${partes.join(", ")}.` }];
  }
  return [{ texto: "Ves " }, { texto: `${n(visibles)} de ${n(total)} ${nombre(total)}`, fuerte: true }, { texto: `${tras}: ${partes.join(", ")}.` }, ...sumaPieza(visibles)];
}

/** El título del vacío cuando los filtros no dejan nada (superpoder 8): dice qué pasó, nunca una tabla vacía que parece rota. */
export function tituloSinResultados(sustantivo: Sustantivo): string {
  return `${sustantivo.genero === "f" ? "Ninguna" : "Ningún"} ${sustantivo.uno} cumple con lo que pusiste`;
}

/** La suma de lo que se ve (superpoder 7): lo que no tiene dato no suma, pero tampoco se vuelve 0 a la vista. */
export function sumaDe<F>(filas: readonly F[], valor: (fila: F) => number | null): number {
  return filas.reduce((s, f) => s + (valor(f) ?? 0), 0);
}

/** Días de calendario entre dos fechas ISO (solo el día: «2026-10-31» o «2026-10-31T15:00…»). Positivo = `fecha` está por venir. */
export function diasEntre(fecha: string, hoy: string): number {
  const dia = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d) / 86_400_000;
  };
  return Math.round(dia(fecha) - dia(hoy));
}

/**
 * La fecha dice cuánto falta o cuánto pasó (superpoder 6): «hoy», «mañana», «en 4 días», «ayer», «hace 2 días». Nadie hace la cuenta
 * del calendario. `pasada` sirve a la pantalla para teñirla de ámbar cuando lo que debía pasar ya pasó y no pasó (una orden que no
 * llegó): eso lo decide la pantalla, no la fecha.
 */
export function fechaRelativa(fecha: string, hoy: string): { texto: string; pasada: boolean } {
  const d = diasEntre(fecha, hoy);
  if (d === 0) return { texto: "hoy", pasada: false };
  if (d === 1) return { texto: "mañana", pasada: false };
  if (d === -1) return { texto: "ayer", pasada: true };
  if (d > 1) return { texto: `en ${d.toLocaleString("es-PE")} días`, pasada: false };
  return { texto: `hace ${(-d).toLocaleString("es-PE")} días`, pasada: true };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** «28 oct»; con el año si no es el de hoy («28 oct 2025»). Así se escribe una fecha en una fila (Perú dice «set», no «sep»). */
export function fechaDiaMes(fecha: string, hoy: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  const base = `${d} ${MESES_CORTOS[m - 1]}`;
  return String(a) === hoy.slice(0, 4) ? base : `${base} ${a}`;
}

/** Lo que mide cada signo al lado de una cifra (`1` = el ancho de un `0`, que es lo que vale `1ch`): medido en DM Sans con cifras tabulares.
 *  Contar cada signo como una cifra hacía la caja de «S/ 30.73 – 31.02» un 50 % más ancha que el monto y le quitaba lugar al nombre. */
const PESO_SIGNO: Readonly<Record<string, number>> = { ".": 0.3, ",": 0.3, " ": 0.4, "\u00a0": 0.4, "/": 0.45, "–": 1, "-": 0.6, S: 0.9 };

/**
 * El ancho de la caja de los montos, en `ch` (el ancho de una cifra), redondeado hacia arriba al medio: el del más largo (superpoder
 * 2). El monto va centrado en su columna, pero dentro de una caja que mide lo del más largo y con las cifras a la derecha: así quedan
 * una bajo la otra y se pueden comparar (S/ 980 y S/ 12,480 no quedan corridos). Se mide sobre TODAS las filas, no solo las que se
 * ven: filtrar no hace saltar la columna.
 */
export function anchoDeMontos(textos: readonly string[]): number {
  const ancho = (t: string) => [...t].reduce((s, c) => s + (PESO_SIGNO[c] ?? 1), 0);
  return Math.ceil(textos.reduce((max, t) => Math.max(max, ancho(t)), 0) * 2) / 2;
}
