/**
 * La capacidad del piso de una sede (ADR-0329): cuántas prendas caben colgadas = m² de sala × prendas por m². En Existencias es la
 * nota «de 600» junto a «Colgadas en el piso» (ADR-0331): sin ella, «138 colgadas» no dice si el piso está lleno o medio vacío.
 *
 * PROMETE: leer la fila de `fn_capacidad_piso` sin confiar en su forma (lo que no sirve es «sin capacidad», nunca un número
 * inventado) y decir la nota y la explicación de la cifra, o nada. Mientras la sede no haya cuadrado su piso, la nota lo dice
 * («por cuadrar», ADR-0328): no saber si se cuadró cuenta como no cuadrado. Y lo que se compara con la capacidad es lo mismo que ella
 * cuenta: la ropa que va al riel, con los accesorios aparte («+ 17 accesorios», `cifraColgadasEnElPiso`).
 * ASUME: la lectura la hace el servidor (`capacidad-piso-servidor.ts`) y la página la pone solo en «Colgadas en el piso», que existe
 * solo donde la sede separa piso y almacén: el Taller y una sede sin m² no llevan nota.
 */

export type CapacidadPiso = {
  m2Sala: number;
  /** Prendas colgadas por m² de sala. */
  densidad: number;
  /** Prendas que caben colgadas: m² × densidad, sin decimales (la calcula la base). */
  capacidad: number;
  /** La sede todavía no contó sus prendas: la densidad es prestada de TRU (30 por m²). */
  provisional: boolean;
  /**
   * El último cuadre del piso de la sede (ADR-0328, decisión 4; lo guarda la actividad 3). Null = «por cuadrar»: el sistema puede
   * tener como guardadas prendas que ya cuelgan, así que el número de colgadas todavía no es confiable (TRU: 138 contra 600–750).
   */
  cuadradoEn: string | null;
};

/** La fila de `fn_capacidad_piso` (un arreglo de 0 o 1 filas por PostgREST). Null si no hay fila o si no tiene la forma esperada. */
export function leerCapacidadPiso(datos: unknown): CapacidadPiso | null {
  const fila: unknown = Array.isArray(datos) ? datos[0] : datos;
  if (fila === null || typeof fila !== "object") return null;
  const f = fila as Record<string, unknown>;
  const m2Sala = Number(f.m2_sala);
  const densidad = Number(f.densidad);
  const capacidad = Number(f.capacidad);
  if (!(m2Sala > 0) || !(densidad > 0) || !Number.isInteger(capacidad) || capacidad < 1) return null;
  if (typeof f.provisional !== "boolean") return null;
  // Lo que no es una fecha (falta la columna, llega vacía o rara) se lee como «por cuadrar»: del lado seguro, nunca un piso que
  // parece cuadrado sin estarlo (la misma regla que el motor del piso, PR #787).
  const cuadradoEn = typeof f.cuadrado_en === "string" && !Number.isNaN(Date.parse(f.cuadrado_en)) ? f.cuadrado_en : null;
  return { m2Sala, densidad, capacidad, provisional: f.provisional, cuadradoEn };
}

/**
 * La nota de la cifra «Colgadas en el piso»: «de 600», «de 1800 (provisional)» si la sede no se ha contado, y « · por cuadrar»
 * mientras la sede no haya cuadrado su piso (ADR-0328: «583 de 600» con la marca «por cuadrar»). Sin separador de miles, como el
 * número grande de al lado (`CifraAnimada`), y como pide la RAE para cuatro cifras.
 */
export function notaCapacidadPiso(capacidad: CapacidadPiso | null): string | undefined {
  if (!capacidad) return undefined;
  const de = `de ${capacidad.capacidad}${capacidad.provisional ? " (provisional)" : ""}`;
  return capacidad.cuadradoEn ? de : `${de} · por cuadrar`;
}

/**
 * De qué lado del riel va cada familia (`familias.codigo`, la que guarda `categorias.familia`), según ADR-0329 (act. 2026-10-04,
 * punto 6): la ropa cuelga en el riel; bisutería, cinturones, gorros y lentes van junto a la caja, y bolsos y calzado en repisa o
 * ganchos. Las 600 / 1800 / 180 son solo ropa colgada. Se decide por la familia de la categoría y nunca por su nombre visible, que se
 * renombra («Carteras/Bolsos» pasó a «Bolsos y Carteras» sin cambiar de familia).
 *
 * Entre las dos listas están TODAS las familias que trae una base nueva: `capacidad-piso.test.ts` las lee de las migraciones y del
 * seed, así que una familia nueva por migración no entra sin decidir de qué lado va. Una que un líder cree después sin deploy (o un
 * producto sin familia) cuenta en el riel: la cifra queda como era antes de separar, y nunca se esconde ropa como si fuera accesorio.
 */
export const FAMILIAS_DEL_RIEL: ReadonlySet<string> = new Set(["indumentaria"]);
export const FAMILIAS_FUERA_DEL_RIEL: ReadonlySet<string> = new Set(["calzado", "accesorios", "bisuteria", "belleza", "papeleria"]);

export type ColgadasDelPiso = {
  /** Lo libre en el piso que cuelga en el riel: lo que se compara con la capacidad. */
  delRiel: number;
  /** Lo libre en el piso de una familia de `FAMILIAS_FUERA_DEL_RIEL`: también lo cobra la caja, pero no ocupa riel. */
  accesorios: number;
};

/**
 * Parte lo libre en el piso en riel y accesorios. PROMETE: `delRiel + accesorios` es exactamente la suma de `pisoDisponible` (el
 * número de ADR-0331, «lo que cobra la caja»): cada fila cae en uno solo de los dos, nunca en ninguno ni en ambos.
 * ASUME: `productos` es el catálogo de Existencias; una fila cuyo producto no llegó o no tiene familia cuenta en el riel.
 */
export function separarColgadas(
  filas: readonly { productoId: string; pisoDisponible?: number | null }[],
  productos: readonly { id: string; familia: string | null }[]
): ColgadasDelPiso {
  const fueraDelRiel = new Set(productos.filter((p) => p.familia !== null && FAMILIAS_FUERA_DEL_RIEL.has(p.familia)).map((p) => p.id));
  let delRiel = 0;
  let accesorios = 0;
  for (const f of filas) {
    if (fueraDelRiel.has(f.productoId)) accesorios += f.pisoDisponible ?? 0;
    else delRiel += f.pisoDisponible ?? 0;
  }
  return { delRiel, accesorios };
}

/** «+ 17 accesorios» bajo la etiqueta de la tarjeta; sin accesorios en el piso, nada (ni un «+ 0»). */
export function notaAccesorios(accesorios: number): string | undefined {
  if (!(accesorios > 0)) return undefined;
  return accesorios === 1 ? "+ 1 accesorio" : `+ ${accesorios} accesorios`;
}

export type CifraColgadas = { valor: number; nota?: string; aparte?: string; titulo: string };

/**
 * La tarjeta «Colgadas en el piso» de la cabecera de Existencias: la única que se compara con la capacidad («583 de 600»). «Para hoy»
 * e Inicio siguen contando lo que cuentan; esto cambia solo esta tarjeta.
 *
 * PROMETE: `valor` cuenta la ropa libre en el piso (la que va al riel), que es lo mismo que cuenta la capacidad; los accesorios salen
 * aparte en la misma tarjeta (`aparte`, «+ 17 accesorios»), y entre los dos suman lo libre en el piso. Si el catálogo no respondió no
 * se puede separar: `valor` es todo lo libre en el piso y no lleva la nota «de 600», porque compararía dos cosas distintas.
 * ASUME: `filas` es el stock de Existencias de la sede (`pisoDisponible` libre: sin apartadas ni dañadas).
 */
export function cifraColgadasEnElPiso({
  filas,
  productos,
  catalogoFallo,
  capacidad,
}: {
  filas: readonly { productoId: string; pisoDisponible?: number | null }[];
  productos: readonly { id: string; familia: string | null }[];
  catalogoFallo: boolean;
  capacidad: CapacidadPiso | null;
}): CifraColgadas {
  if (catalogoFallo) {
    return {
      valor: filas.reduce((n, f) => n + (f.pisoDisponible ?? 0), 0),
      titulo:
        "Prendas en el piso de venta, libres para vender: son las que cobra la caja. No se pudo leer la categoría de las prendas, así que esta vez no se separan los accesorios ni se compara con lo que cabe.",
    };
  }
  const { delRiel, accesorios } = separarColgadas(filas, productos);
  const partes = ["Ropa en el piso de venta, libre para vender: la que cuelga en el riel."];
  if (accesorios > 0) {
    partes.push(
      accesorios === 1
        ? "Aparte, 1 accesorio en el piso (bisutería, bolsos, calzado…): no cuelga en el riel y la caja también lo cobra."
        : `Aparte, ${accesorios} accesorios en el piso (bisutería, bolsos, calzado…): no cuelgan en el riel y la caja también los cobra.`
    );
  }
  const explicacion = explicarCapacidadPiso(capacidad);
  if (explicacion) partes.push(explicacion);
  return { valor: delRiel, nota: notaCapacidadPiso(capacidad), aparte: notaAccesorios(accesorios), titulo: partes.join(" ") };
}

// Sin separador de miles, como la nota y la cifra; con punto decimal, como los precios de la tienda («12.5 m²»).
const decimal = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2, useGrouping: false });

/** De dónde sale la nota, para el texto al pasar el mouse sobre la cifra: de dónde sale el número, y por qué es provisional o está por cuadrar. */
export function explicarCapacidadPiso(capacidad: CapacidadPiso | null): string | undefined {
  if (!capacidad) return undefined;
  const partes = [`Caben unas ${capacidad.capacidad} prendas colgadas: ${decimal(capacidad.m2Sala)} m² de sala × ${decimal(capacidad.densidad)} por m².`];
  if (capacidad.provisional) partes.push("Provisional: esta sede todavía no contó las prendas de su piso.");
  if (!capacidad.cuadradoEn) {
    partes.push("Por cuadrar: el piso de esta sede todavía no se cuadró, y el sistema puede tener como guardadas prendas que ya cuelgan.");
  }
  return partes.join(" ");
}
