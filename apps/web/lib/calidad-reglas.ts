// Reglas del panel de calidad (ADR-0113). La ÚNICA casa de "qué significan" los números que devuelven
// `fn_calidad` y `fn_calidad_danadas`: el SQL cuenta unidades vendidas, devueltas, dañadas y cambiadas; acá se
// decide cuándo una tasa es una señal y cuándo es ruido. Puro TypeScript, sin base de datos: se prueba sin Docker.
//
// LA DECISIÓN QUE MÁS IMPORTA: UNA TASA CON POCAS VENTAS NO ES UNA TASA.
// Una talla que vendió 2 unidades y tuvo 1 devolución "tiene 50% de devolución". Es el número más alto de la
// pantalla y no significa nada: con 2 ventas, una sola clienta cambia el resultado. Un panel que pone eso arriba
// en rojo hace perseguir fantasmas (y puede culpar a un proveedor por una devolución). Por eso:
//   · una fila con menos de MUESTRA_MINIMA unidades vendidas se marca "muestra chica" y va AL FINAL, no arriba;
//   · "requiere atención" exige a la vez una tasa claramente sobre el promedio Y un mínimo de devoluciones.
//
// SE COMPARA CONTRA EL RESTO, NO CONTRA EL TOTAL.
// Si una talla concentra 21 de las 38 devoluciones, el promedio general la INCLUYE: ella misma sube la vara con
// la que se mide y termina "dentro de lo normal" siendo el problema. La tasa de una fila se compara con la tasa
// de todas las DEMÁS filas de esa misma vista (total menos la fila).
//
// SIMPLIFICACIONES DECLARADAS: los tres umbrales son provisionales (se calibran con Felipe con meses reales);
// se cuentan UNIDADES, no tickets; y no se calcula una significancia estadística: es una regla de tres umbrales
// honestos, no una prueba.

/** Menos de estas unidades vendidas: la tasa no dice nada todavía. */
export const MUESTRA_MINIMA = 10;
/** "Requiere atención" desde este múltiplo de la tasa del resto de las filas (2 = el doble). */
export const FACTOR_ATENCION = 2;
/** …y solo si hubo al menos estas devoluciones: dos devoluciones no son un patrón. */
export const DEVUELTAS_MINIMAS_ATENCION = 3;

export type NivelCalidad = "producto" | "talla" | "origen" | "categoria" | "total";

/** Una fila de `fn_calidad`, ya en camelCase. */
export type FilaCalidad = {
  nivel: NivelCalidad;
  clave: string;
  etiqueta: string;
  vendidas: number;
  devueltas: number;
  vendibles: number;
  danadas: number;
  aProveedor: number;
  cambiadas: number;
};

export type EstadoCalidad = "atencion" | "normal" | "muestra_chica" | "sin_ventas";

export type FilaEvaluada = FilaCalidad & {
  /** Devueltas ÷ vendidas. Null si no hubo ventas. */
  tasa: number | null;
  /** De lo devuelto, qué fracción volvió dañada. Null si no hubo devoluciones. */
  tasaDanadas: number | null;
  /** Cambiadas ÷ vendidas. Null si no hubo ventas. */
  tasaCambios: number | null;
  /** Cuántas veces la tasa del RESTO de las filas (2,4 = 2,4 veces). Null si no hay con qué comparar. */
  vsResto: number | null;
  estado: EstadoCalidad;
};

export function tasa(parte: number, total: number): number | null {
  return total > 0 ? parte / total : null;
}

/** Lo que se necesita del total de la cohorte para comparar una fila contra el resto. */
export type TotalCohorte = { vendidas: number; devueltas: number };

/**
 * Evalúa una fila contra la tasa del RESTO (total menos la fila). La fila "total" nunca requiere atención: no hay
 * nada contra qué compararla. Si no queda resto (es la única fila de su vista) o el resto no vendió nada, no hay
 * con qué comparar y la fila queda "normal": no se inventa una alarma sin referencia.
 */
export function evaluar(fila: FilaCalidad, total: TotalCohorte): FilaEvaluada {
  const t = tasa(fila.devueltas, fila.vendidas);

  const vendidasResto = total.vendidas - fila.vendidas;
  const tasaResto = vendidasResto > 0 ? tasa(total.devueltas - fila.devueltas, vendidasResto) : null;
  const vsResto = t !== null && tasaResto !== null && tasaResto > 0 ? t / tasaResto : null;

  let estado: EstadoCalidad;
  if (fila.vendidas === 0) {
    estado = "sin_ventas";
  } else if (fila.vendidas < MUESTRA_MINIMA) {
    estado = "muestra_chica";
  } else if (
    fila.nivel !== "total" &&
    tasaResto !== null &&
    fila.devueltas >= DEVUELTAS_MINIMAS_ATENCION &&
    (tasaResto === 0 || (t !== null && t >= FACTOR_ATENCION * tasaResto))
  ) {
    estado = "atencion";
  } else {
    estado = "normal";
  }

  return {
    ...fila,
    tasa: t,
    tasaDanadas: tasa(fila.danadas, fila.devueltas),
    tasaCambios: tasa(fila.cambiadas, fila.vendidas),
    vsResto,
    estado,
  };
}

const ORDEN_ESTADO: Record<EstadoCalidad, number> = { atencion: 0, normal: 1, muestra_chica: 2, sin_ventas: 3 };

/**
 * Excepciones primero: lo que requiere atención arriba (la tasa más alta antes); lo normal después; las filas de
 * muestra chica al final, por ventas, porque una tasa alta con pocas ventas no debe ganarle a una con evidencia.
 */
export function ordenarPorAtencion(filas: readonly FilaEvaluada[]): FilaEvaluada[] {
  return [...filas].sort((a, b) => {
    const porEstado = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado];
    if (porEstado !== 0) return porEstado;
    if (a.estado === "muestra_chica" || a.estado === "sin_ventas") return b.vendidas - a.vendidas || a.etiqueta.localeCompare(b.etiqueta, "es");
    return (b.tasa ?? 0) - (a.tasa ?? 0) || b.devueltas - a.devueltas || a.etiqueta.localeCompare(b.etiqueta, "es");
  });
}

export type CalidadAgrupada = {
  total: FilaEvaluada;
  tasaGeneral: number | null;
  producto: FilaEvaluada[];
  talla: FilaEvaluada[];
  origen: FilaEvaluada[];
  categoria: FilaEvaluada[];
};

const FILA_VACIA: FilaCalidad = {
  nivel: "total", clave: "", etiqueta: "Total", vendidas: 0, devueltas: 0, vendibles: 0, danadas: 0, aProveedor: 0, cambiadas: 0,
};

/** Separa las filas por vista, las evalúa contra la tasa general y las ordena. */
export function agrupar(filas: readonly FilaCalidad[]): CalidadAgrupada {
  const totalCrudo = filas.find((f) => f.nivel === "total") ?? FILA_VACIA;
  const tasaGeneral = tasa(totalCrudo.devueltas, totalCrudo.vendidas);
  const de = (nivel: NivelCalidad) =>
    ordenarPorAtencion(filas.filter((f) => f.nivel === nivel).map((f) => evaluar(f, totalCrudo)));
  return {
    total: evaluar(totalCrudo, totalCrudo),
    tasaGeneral,
    producto: de("producto"),
    talla: de("talla"),
    origen: de("origen"),
    categoria: de("categoria"),
  };
}

/** Una fila de `fn_calidad_danadas`, ya en camelCase. `mes` es `YYYY-MM-DD` (día 1). */
export type FilaDanadas = {
  ubicacionId: string;
  mes: string;
  condicion: string;
  origen: "devolucion" | "anulacion";
  unidades: number;
};

export type DanadasDeTienda = {
  ubicacionId: string;
  /** Un elemento por mes, del más reciente al más antiguo. */
  meses: { mes: string; danadas: number; aProveedor: number }[];
  totalDanadas: number;
  totalAProveedor: number;
};

/**
 * Pivota las filas a "una tienda, sus meses". Dañada = a reparar o a donar; `devolver_proveedor` se cuenta aparte
 * porque la prenda no está mal de por sí: se manda de vuelta. Un mes sin ninguna aparece en 0 (no se omite),
 * así una tienda sin problemas se ve distinta de una tienda que falta.
 */
export function danadasPorTienda(
  filas: readonly FilaDanadas[],
  ubicacionIds: readonly string[],
  mesesVista: readonly string[]
): DanadasDeTienda[] {
  return ubicacionIds.map((ubicacionId) => {
    const meses = mesesVista.map((mes) => {
      const delMes = filas.filter((f) => f.ubicacionId === ubicacionId && f.mes === mes);
      const danadas = delMes.filter((f) => f.condicion === "danada_reparacion" || f.condicion === "danada_donar").reduce((a, f) => a + f.unidades, 0);
      const aProveedor = delMes.filter((f) => f.condicion === "devolver_proveedor").reduce((a, f) => a + f.unidades, 0);
      return { mes, danadas, aProveedor };
    });
    return {
      ubicacionId,
      meses,
      totalDanadas: meses.reduce((a, m) => a + m.danadas, 0),
      totalAProveedor: meses.reduce((a, m) => a + m.aProveedor, 0),
    };
  });
}

/**
 * Los últimos `cantidad` meses (día 1, `YYYY-MM-DD`) hasta el de `fecha`, del más reciente al más antiguo. Pura
 * aritmética de calendario sobre el texto: no usa `Date`, así la zona horaria del servidor no puede correr un mes.
 */
export function ultimosMeses(fecha: string, cantidad: number): string[] {
  const [anio, mes] = fecha.split("-").map(Number);
  const meses: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const total = anio * 12 + (mes - 1) - i;
    meses.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`);
  }
  return meses;
}

/** Texto corto y honesto para cada estado. Va SIEMPRE con texto: nunca solo un color. */
export function textoLectura(f: FilaEvaluada): string {
  switch (f.estado) {
    case "atencion":
      return f.vsResto !== null
        ? `Requiere atención: ${f.vsResto.toLocaleString("es-PE", { maximumFractionDigits: 1 })} veces la tasa del resto`
        : "Requiere atención: el resto no tuvo devoluciones";
    case "normal":
      return "Dentro de lo normal";
    case "muestra_chica":
      return `Muestra chica (menos de ${MUESTRA_MINIMA} ventas)`;
    case "sin_ventas":
      return "Sin ventas";
  }
}
