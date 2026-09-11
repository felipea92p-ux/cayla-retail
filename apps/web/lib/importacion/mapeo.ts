/**
 * El plan de mapeo: qué es cada columna del archivo del cliente, y cómo se
 * convierte su texto en un valor.
 *
 * ESTE ARCHIVO ES EL QUE APLICA EL PLAN, Y NO TIENE IA. El modelo produce el
 * plan una sola vez mirando las cabeceras y 40 filas; después este código lo
 * aplica a las 3.000 filas. Por eso el modelo no puede equivocarse en la fila
 * 2.847: nunca la ve. Es la regla que gobierna todo el importador — lo que
 * resuelve el código no se le pregunta a la IA.
 */

/** Los campos de CAYLA a los que puede ir una columna. */
export const CAMPOS = [
  "referencia",
  "codigoCliente",
  "categoria",
  "talla",
  "color",
  "costo",
  "precio",
  "marca",
  "genero",
  "temporada",
  "descripcion",
  "tejido",
  "patron",
  "ignorar",
] as const;

export type Campo = (typeof CAMPOS)[number];

export type ColumnaMapeada = {
  /** Índice de la columna en el archivo, empezando en 0. */
  indice: number;
  campo: Campo;
  confianza: "alta" | "media" | "baja";
  porque: string;
};

/**
 * Cómo está organizado el archivo.
 *
 * `matriz_de_tallas` es el formato clásico de un catálogo de moda: una fila por
 * modelo y color, y una COLUMNA por talla con la cantidad dentro.
 *
 *     Referencia   Color        S   M   L
 *     Blusa V      Azul marino  2   5   3
 *
 * Leerlo como si fuera una fila por variante crearía un producto con una talla
 * llamada "S" y otra columna suelta — o sea, nada aprovechable. Detectarlo es
 * la diferencia entre importar 3 variantes o importar basura.
 */
export type Disposicion = "fila_por_variante" | "matriz_de_tallas";

export type PlanDeMapeo = {
  disposicion: Disposicion;
  columnas: ColumnaMapeada[];
  /** Solo en `matriz_de_tallas`: qué columna corresponde a qué talla. */
  columnasTalla: { indice: number; talla: string }[];
  notas: string;
};

/** Una variante lista para el siguiente paso. Todo texto menos los importes. */
export type FilaEstandar = {
  referencia: string;
  codigoCliente: string;
  categoria: string;
  talla: string;
  color: string;
  costo: number;
  precio: number;
  marca: string;
  genero: string;
  temporada: string;
  descripcion: string;
  tejido: string;
  patron: string;
  /** Fila del archivo de la que salió, para poder señalar el problema exacto. */
  filaOrigen: number;
};

/**
 * Texto a número, aguantando cómo escribe los precios el mundo real.
 *
 * EL CASO QUE OBLIGA A PENSARLO: "1.234,56" y "1,234.56" son el mismo importe
 * escrito a la europea y a la americana, y un `parseFloat` a secas devuelve
 * 1.234 para el primero — mil veces menos. En un catálogo eso no falla: importa
 * una blusa a S/ 1.23 y nadie se entera hasta que se vende.
 *
 * LA REGLA: manda el ÚLTIMO separador que aparece. Si hay punto y coma, el que
 * va más a la derecha es el decimal y el otro es de miles. Si hay uno solo,
 * es decimal cuando le siguen 1 o 2 dígitos, y de miles cuando le siguen 3
 * exactos — "89,90" es un precio y "1,500" son mil quinientos.
 *
 * Devuelve 0 para lo que no es un número. 0 es un valor legítimo acá (un costo
 * que la tienda no sabe) y el paso siguiente lo muestra para que se revise.
 */
export function parsearNumero(texto: string): number {
  if (!texto) return 0;

  // Primero el símbolo de moneda ENTERO, y recién después lo que no sea dígito
  // o separador. El orden importa: "S/." lleva un punto, y si se quitaba solo la
  // "S" y la "/", ese punto quedaba dentro del número — "S/. 89.90" pasaba a
  // ".89.90", dos puntos se leían como miles, y el precio salía 8.990. Cien
  // veces más, sin ningún error. Es el formato que Excel en Perú pone por
  // defecto. Lo encontró la revisión adversarial del 2026-09-11.
  // Segunda defensa: un separador que no va precedido por dígito no es
  // separador (".89" → "89"), venga de la moneda que venga.
  const limpio = texto
    .replace(/S\/\.?/gi, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/^[.,]+/, "")
    .trim();
  if (!limpio || !/\d/.test(limpio)) return 0;

  const ultimoPunto = limpio.lastIndexOf(".");
  const ultimaComa = limpio.lastIndexOf(",");

  let normalizado: string;

  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // Los dos presentes: el de más a la derecha es el decimal.
    const decimal = ultimoPunto > ultimaComa ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    normalizado = limpio.split(miles).join("").replace(decimal, ".");
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const sep = ultimoPunto >= 0 ? "." : ",";
    const pos = ultimoPunto >= 0 ? ultimoPunto : ultimaComa;
    const decimales = limpio.length - pos - 1;
    const veces = limpio.split(sep).length - 1;
    // Un solo separador con exactamente 3 dígitos detrás es de miles ("1,500"),
    // salvo que aparezca más de una vez ("1.234.567"), que también lo es.
    normalizado = decimales === 3 || veces > 1 ? limpio.split(sep).join("") : limpio.replace(sep, ".");
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

const VACIA: Omit<FilaEstandar, "filaOrigen"> = {
  referencia: "", codigoCliente: "", categoria: "", talla: "", color: "",
  costo: 0, precio: 0, marca: "", genero: "", temporada: "", descripcion: "",
  tejido: "", patron: "",
};

const NUMERICOS = new Set<Campo>(["costo", "precio"]);

/**
 * Aplica el plan a la tabla. Determinista, sin red y sin IA: dos veces el mismo
 * archivo con el mismo plan dan exactamente lo mismo, que es lo que permite
 * guardar el plan y reimportar sin volver a pagar una llamada al modelo.
 */
export function aplicarMapeo(
  filas: string[][],
  plan: PlanDeMapeo,
  filaCabecera: number
): FilaEstandar[] {
  const datos = filas.slice(filaCabecera + 1);
  const salida: FilaEstandar[] = [];

  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i];
    const filaOrigen = filaCabecera + 1 + i;

    const base = { ...VACIA };
    for (const col of plan.columnas) {
      if (col.campo === "ignorar") continue;
      const celda = (fila[col.indice] ?? "").trim();
      if (NUMERICOS.has(col.campo)) {
        (base as Record<string, unknown>)[col.campo] = parsearNumero(celda);
      } else {
        (base as Record<string, unknown>)[col.campo] = celda;
      }
    }

    // Una fila sin referencia no describe ninguna prenda: suele ser un subtotal,
    // una nota al pie o una fila de separación. Se descarta acá y no más
    // adelante, para que el conteo que ve la persona sea el de prendas reales.
    if (!base.referencia.trim()) continue;

    if (plan.disposicion === "fila_por_variante") {
      salida.push({ ...base, filaOrigen });
      continue;
    }

    // Matriz de tallas: la fila se abre en una variante por cada columna de
    // talla que traiga algo. Una celda vacía o en 0 significa que ese modelo no
    // existe en esa talla — no que existe con stock cero.
    for (const ct of plan.columnasTalla) {
      const celda = (fila[ct.indice] ?? "").trim();
      if (!celda || parsearNumero(celda) === 0) continue;
      salida.push({ ...base, talla: ct.talla, filaOrigen });
    }
  }

  return salida;
}

/**
 * Un plan SIN modelo, por el nombre de la columna. Es el camino de respaldo
 * cuando no hay clave de Anthropic, se acabó el saldo, o la API no responde:
 * la pantalla prometía "las columnas se pueden asignar a mano" y no había
 * ninguna forma de llegar a los desplegables sin que el modelo respondiera
 * primero. Revisión del 2026-09-11.
 *
 * Es deliberadamente tonto: mira solo la cabecera, nunca los datos, y lo que
 * no reconoce va a "ignorar" con confianza baja para que se vea. Todo lo que
 * propone se marca como "media" a lo sumo: una coincidencia de palabra no es
 * una certeza. `disposicion` siempre es fila por variante — detectar una
 * matriz de tallas por cabeceras (S, M, L…) sin mirar qué hay dentro sería
 * adivinar.
 */
export function planPorCabeceras(cabeceras: string[]): PlanDeMapeo {
  const REGLAS: [Campo, RegExp][] = [
    ["codigoCliente", /^(cod(igo)?|sku|ref(erencia)?\s*(cod|n[ºo°]|#)|c[óo]d\.?)\b/i],
    ["referencia", /^(descripci[óo]n|nombre|producto|prenda|art[íi]culo|modelo|referencia|detalle|item)\b/i],
    ["categoria", /^(categor[íi]a|tipo|l[íi]nea|familia|rubro|clase)\b/i],
    ["talla", /^(talla|tamaño|size|medida)\b/i],
    ["color", /^(color|tono)\b/i],
    ["costo", /^(costo|coste|p\.?\s*(costo|compra)|precio\s*(de\s*)?(costo|compra)|compra)\b/i],
    ["precio", /^(precio|pvp|p\.?\s*venta|venta|p\.?\s*u(nitario)?|valor)\b/i],
    ["marca", /^(marca|brand)\b/i],
    ["genero", /^(g[ée]nero|sexo)\b/i],
    ["temporada", /^(temporada|colecci[óo]n|season)\b/i],
    ["tejido", /^(tejido|tela|material|composici[óo]n)\b/i],
    ["patron", /^(patr[óo]n|estampado|diseño)\b/i],
  ];
  const usados = new Set<Campo>();
  const columnas: ColumnaMapeada[] = cabeceras.map((cabecera, indice) => {
    const texto = cabecera.trim().replace(/\s+/g, " ");
    for (const [campo, regla] of REGLAS) {
      // Cada campo una sola vez: si hay dos columnas "PRECIO", la segunda
      // queda en "ignorar" y la persona decide, en vez de que la última pise.
      if (!usados.has(campo) && regla.test(texto)) {
        usados.add(campo);
        return { indice, campo, confianza: "media", porque: `Por el nombre de la columna ("${texto}").` };
      }
    }
    return { indice, campo: "ignorar", confianza: "baja", porque: texto ? "No reconocí el nombre." : "Sin título." };
  });
  return {
    disposicion: "fila_por_variante",
    columnas,
    columnasTalla: [],
    notas: "Asignado por el nombre de cada columna, sin el modelo. Revisa cada una.",
  };
}

/** Los campos que el plan dejó sin cubrir. `referencia` es el único imprescindible. */
export function camposFaltantes(plan: PlanDeMapeo): Campo[] {
  const cubiertos = new Set(plan.columnas.filter((c) => c.campo !== "ignorar").map((c) => c.campo));
  const necesarios: Campo[] = ["referencia", "precio"];
  const faltan = necesarios.filter((c) => !cubiertos.has(c));
  // En matriz de tallas la talla no sale de una columna mapeada sino de las
  // cabeceras, así que exigirla como columna daría un falso faltante.
  if (plan.disposicion === "fila_por_variante" && !cubiertos.has("talla")) faltan.push("talla");
  return faltan;
}
