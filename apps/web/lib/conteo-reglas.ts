/**
 * Las reglas de Inventario ▸ Conteo rediseñado (2026-09-29), sin red ni React: se importan desde el servidor (las
 * páginas y `lib/conteos.ts`) y desde el navegador (la pantalla de contar), y se prueban en `conteo-reglas.test.ts`.
 *
 * Qué cambió respecto del conteo «a ciegas» de ADR-0174 y por qué (contrato del rediseño, decisiones D1–D5):
 *  1. Al abrir, la base congela una FOTO de lo que había en el lugar que se cuenta: una línea por variante con stock.
 *     Quien cuenta ve «Debe haber» desde el principio y recorre la lista con la prenda en la mano.
 *  2. Vacío NO es cero. Una variante sin cantidad escrita está «Pendiente»; solo el 0 escrito de verdad («no queda
 *     ninguna») es una verificación. Por eso `cantidadEscrita` distingue vacío (null) de inválido (undefined).
 *  3. El estado de una línea no se guarda: se DERIVA de sus números (`estadoDeLinea`, regla D3), con la misma
 *     fórmula que la base. Una sola fórmula en dos lugares es la única forma de que la pantalla y el cierre no discrepen.
 *  4. «Debe haber» es lo que CAYLA esperaba en el instante de verificar (D2): si entre abrir y contar salió una venta,
 *     la venta ya está descontada y no aparece como faltante. La foto queda como nota («Al abrir: 11 · salieron 1»).
 *
 * Una convención de nombres (2026-09-26): en las prendas del conteo el campo `sku` guarda el CÓDIGO DE LA ETIQUETA
 * (`variantes.codigo`, con el `sku` legado solo de respaldo — `codigoDeEtiqueta`). El nombre quedó del legado: en
 * producción 128 de 130 variantes tienen `sku` NULL (ADR-0058). Ese campo solo se MUESTRA y se busca; para saber de qué
 * prenda se habla se compara `varianteId`, nunca el código.
 */

import { clave } from "./buscar-prenda-v2";
import { guionDeLaPistola } from "./escaner-guion";
import { codigoDeEtiqueta } from "./prenda-reglas";
import { compararTallas } from "./tallas";

// ---------------------------------------------------------------------------------------------------------------
// 1. Las formas de los datos (contrato §2.3, en camelCase)
// ---------------------------------------------------------------------------------------------------------------

export type EstadoConteo = "abierto" | "cerrado" | "anulado";

/**
 * pendiente: nadie la verificó · en_reconteo: se pidió volver a contarla y aún no hay cantidad nueva · correcta: lo
 * contado es lo que CAYLA esperaba · con_diferencia: no coincide y falta confirmarla · diferencia_confirmada: no
 * coincide y alguien ya la confirmó (con esa cifra se ajusta al cerrar).
 */
export type EstadoLinea = "pendiente" | "correcta" | "con_diferencia" | "en_reconteo" | "diferencia_confirmada";

/** Una variante del conteo. Nunca lleva nombre ni foto: eso lo pone el catálogo (`PrendaConteo`), que se cruza por `varianteId`. */
export type LineaConteo = {
  varianteId: string;
  /** Lo que CAYLA esperaba al verificar (`cantidad_sistema`). Mientras la línea está pendiente, es lo congelado al abrir. */
  debeHaber: number;
  /** Lo que había al abrir el conteo. Solo se muestra como nota cuando difiere de `debeHaber`. */
  foto: number;
  /** Lo que la persona contó. `null` = pendiente (vacío ≠ 0); `0` = verificada en cero. */
  contada: number | null;
  /** Lo que se había contado antes de pedir «Volver a contar». */
  anterior: number | null;
  verificadoEn: string | null;
  confirmadaEn: string | null;
  /** El stock vivo de la variante en el lugar del conteo. `null` si el conteo ya no está abierto. */
  actual: number | null;
  /** `contada − debeHaber`: negativo = faltan, positivo = hay de más. `null` si está pendiente. */
  diferencia: number | null;
  /** El movimiento de ajuste que dejó el cierre, si esta línea se ajustó. */
  ajusteMovimientoId: string | null;
  /**
   * Lo que los cierres de ESTE conteo le han sumado (+) o restado (−) a la variante, en total (del libro de movimientos).
   * Solo es distinto de 0 en un conteo reabierto para editarlo.
   */
  ajustadoTotal: number;
  /**
   * La parte de `ajustadoTotal` que YA estaba hecha cuando se leyó el «debe haber» actual: 0 mientras la línea no se
   * vuelva a contar (su «debe haber» se leyó antes del ajuste), `ajustadoTotal` después. Es lo que explica por qué el
   * «debe haber» ya no es la foto sin que nadie haya vendido nada: «el cierre de este conteo restó 1».
   */
  ajustadoAntes: number;
  estado: EstadoLinea;
};

export type ResumenConteo = {
  /** Las líneas que cuentan (las «ignoradas» de la regla D3 no entran). */
  variantes: number;
  verificadas: number;
  /** Pendientes + en reconteo: lo que todavía no tiene cantidad. */
  pendientes: number;
  correctas: number;
  /** Verificadas cuya cantidad no coincide, confirmadas o no. Correctas + con diferencia = verificadas. */
  conDiferencia: number;
  /** De las que tienen diferencia, las que ya se confirmaron. */
  confirmadas: number;
  enReconteo: number;
  unidadesSobrantes: number;
  unidadesFaltantes: number;
};

export type CabeceraConteo = {
  id: string;
  numero: number;
  estado: EstadoConteo;
  ubicacionId: string;
  sububicacionId: string | null;
  sububicacionTipo: string | null;
  sububicacionNombre: string | null;
  alcance: "todo" | "categoria";
  alcanceCategoriaId: string | null;
  alcanceCategoriaNombre: string | null;
  abiertoPor: string | null;
  abiertoPorNombre: string;
  cerradoPor: string | null;
  /** `null` mientras no se sepa (conteo abierto, o la base no lo trajo): la pantalla dice «—». */
  cerradoPorNombre: string | null;
  cerradoEn: string | null;
  creadoEn: string;
  /** Cuándo se tomó la foto (al abrir). `null` en los conteos anteriores al rediseño. */
  fotoEn: string | null;
  esPrueba: boolean;
};

export type DetalleConteo = { conteo: CabeceraConteo; resumen: ResumenConteo; lineas: LineaConteo[] };

/** Un conteo en el historial, ya sumado en Postgres (`fn_conteos_resumen`). Sin soles: el conteo no habla de plata. */
export type ConteoResumen = {
  id: string;
  numero: number;
  /** `abierto`, `cerrado` o `anulado`. Va como texto: Análisis lo compara con «cerrado» y un estado futuro no debe hacerlo fallar. */
  estado: string;
  creadoEn: string;
  cerradoEn: string | null;
  sububicacionId: string | null;
  sububicacionNombre: string | null;
  sububicacionTipo: string | null;
  alcance: string;
  alcanceCategoriaNombre: string | null;
  abiertoPorNombre: string;
  cerradoPorNombre: string;
  /** Líneas VERIFICADAS (las pendientes no cuentan: inflarían la exactitud de Análisis). */
  lineas: number;
  lineasConDiferencia: number;
  /** Sumas en unidades, solo de las verificadas. */
  sistema: number;
  contado: number;
  diferencia: number;
  /** Líneas que quedaron o siguen sin verificar (pendientes + en reconteo). */
  pendientes: number;
  /** Cerrado con pendientes: se cerró sin verificar todo. Derivado, no es un estado. */
  parcial: boolean;
  /** `lineas + pendientes`: el total de variantes del conteo, para «X de Y variantes verificadas». */
  variantes: number;
};

/** Una fila de `fn_conteos_resumen`. `pendientes` y `parcial` son opcionales: los trae la versión nueva de la función. */
export type FilaResumenConteo = {
  id: string;
  numero: number;
  estado: string;
  created_at: string;
  cerrado_en: string | null;
  sububicacion_id: string | null;
  sububicacion_nombre: string | null;
  sububicacion_tipo: string | null;
  alcance: string;
  alcance_categoria_nombre: string | null;
  abierto_por: string | null;
  cerrado_por: string | null;
  lineas: number;
  lineas_con_diferencia: number;
  sistema: number;
  contado: number;
  diferencia: number;
  pendientes?: number | null;
  parcial?: boolean | null;
};

/**
 * De la fila de la base a la del historial. `pendientes` y `parcial` caen a 0 y `false` si la fila no las trae: Análisis
 * también lee `fn_conteos_resumen`, y si la web se publica antes de pegar el SQL nuevo no debe caerse por dos columnas
 * que solo usa el conteo. `variantes` es `lineas + pendientes`: las verificadas más las que faltan.
 */
export function conteoResumenDesdeFila(c: FilaResumenConteo, nombrePorId: ReadonlyMap<string, string>): ConteoResumen {
  const pendientes = c.pendientes ?? 0;
  return {
    id: c.id,
    numero: c.numero,
    estado: c.estado,
    creadoEn: c.created_at,
    cerradoEn: c.cerrado_en,
    sububicacionId: c.sububicacion_id,
    sububicacionNombre: c.sububicacion_nombre,
    sububicacionTipo: c.sububicacion_tipo,
    alcance: c.alcance,
    alcanceCategoriaNombre: c.alcance_categoria_nombre,
    abiertoPorNombre: (c.abierto_por && nombrePorId.get(c.abierto_por)) || "—",
    cerradoPorNombre: (c.cerrado_por && nombrePorId.get(c.cerrado_por)) || "—",
    lineas: c.lineas,
    lineasConDiferencia: c.lineas_con_diferencia,
    sistema: c.sistema,
    contado: c.contado,
    diferencia: c.diferencia,
    pendientes,
    parcial: c.parcial ?? false,
    variantes: c.lineas + pendientes,
  };
}

/** Lo que el catálogo aporta de cada variante: cómo se llama, cómo se ve y con qué código se lee. Sin costo ni precio. */
export type PrendaConteo = {
  varianteId: string;
  productoId: string;
  categoriaId: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  /** El código de la etiqueta (ver la convención de nombres arriba). */
  sku: string;
  /** Los códigos que lee la pistola o la cámara, con el `sku` legado como opción de escaneo. */
  codigosBarras: string[];
  /** Una variante inactiva (descontinuada) puede tener stock y estar en el conteo: se dibuja igual. */
  activo: boolean;
};

// ---------------------------------------------------------------------------------------------------------------
// 2. El estado de una línea (regla D3, idéntica a la SQL)
// ---------------------------------------------------------------------------------------------------------------

/**
 * El estado de una línea a partir de sus números. Devuelve `null` cuando la línea se IGNORA (ni se cuenta ni se
 * muestra): una variante que no estaba en la foto (`foto` 0), a la que se le borró la cantidad y que NUNCA se mandó a
 * recontar (`anterior` null). Una inesperada que sí se mandó a recontar no se ignora: sigue visible como «en reconteo»
 * y cuenta como pendiente, porque la persona ya la encontró y no debe desaparecer de la lista.
 *
 * Es la MISMA regla que `retail.fn_conteo_lineas_json` (que alimenta a `fn_conteo_detalle`), `retail.cerrar_conteo`
 * y `retail.fn_conteos_resumen`. Si se toca acá, se toca allá.
 * `debeHaber` es lo que la persona ve como «Debe haber» y contra lo que se compara `contada`.
 */
export function estadoDeLinea(l: {
  contada: number | null;
  debeHaber: number;
  foto: number | null;
  anterior: number | null;
  confirmadaEn: string | null;
}): EstadoLinea | null {
  if (l.contada === null) {
    if ((l.foto ?? 0) === 0 && l.anterior === null) return null;
    return l.anterior === null ? "pendiente" : "en_reconteo";
  }
  if (l.contada === l.debeHaber) return "correcta";
  return l.confirmadaEn === null ? "con_diferencia" : "diferencia_confirmada";
}

export type TonoEstado = "verde" | "rojo" | "ambar" | "neutro";

/**
 * Lo que dice y cómo se pinta el estado de una línea (copy literal del contrato §3.2). El rojo es solo para
 * diferencias reales: una pendiente es neutra, NUNCA roja (nadie se equivocó, solo falta contar). `confirmada` es la
 * marca discreta «Confirmado» que va junto a una diferencia ya confirmada, no un estado aparte.
 */
export function etiquetaDeLinea(l: { estado: EstadoLinea; diferencia: number | null }): { texto: string; tono: TonoEstado; confirmada: boolean } {
  switch (l.estado) {
    case "pendiente":
      return { texto: "Pendiente", tono: "neutro", confirmada: false };
    case "en_reconteo":
      return { texto: "En reconteo", tono: "ambar", confirmada: false };
    case "correcta":
      return { texto: "Correcto", tono: "verde", confirmada: false };
    case "con_diferencia":
    case "diferencia_confirmada": {
      const confirmada = l.estado === "diferencia_confirmada";
      const d = l.diferencia ?? 0;
      // «Falta 1» y no «Faltan 1»: el singular es español correcto. «Hay N de más» no cambia con el número.
      if (d < 0) return { texto: d === -1 ? "Falta 1" : `Faltan ${-d}`, tono: "rojo", confirmada };
      if (d > 0) return { texto: `Hay ${d} de más`, tono: "rojo", confirmada };
      // Con diferencia y sin diferencia a la vez no existe (contada ≠ debeHaber); si llegara, se dice sin inventar una cifra.
      return { texto: "Con diferencia", tono: "rojo", confirmada };
    }
  }
}

/**
 * La nota discreta bajo una fila, si hace falta. Lo que cambió entre la foto y el «debe haber» actual se parte en dos, porque
 * tienen dueños distintos y la persona que cuenta tiene que poder distinguirlos:
 *  · lo de OTROS (una venta, una recepción entre abrir y contar): «Al abrir: 11 · salió 1 durante el conteo».
 *  · lo del PROPIO conteo: al editar un conteo ya cerrado, su cierre anterior ajustó el stock (encontró 0 de 1 → restó 1);
 *    si ahora se vuelve a contar, el «debe haber» ya trae ese ajuste y sin explicarlo parecería que la prenda «salió sola»:
 *    «Al abrir: 1 · el cierre de este conteo restó 1».
 *  Las dos pueden ir juntas («Al abrir: 5 · salió 1 durante el conteo · el cierre de este conteo restó 1»). La foto NO es el
 *  «debe haber»; es la referencia que explica por qué cambió.
 *  · una variante que no estaba registrada aquí y se encontró: «Encontraste 1 que no estaba registrada aquí».
 * `ajustadoAntes` es opcional para quien todavía no lo trae (vale 0: la nota de siempre).
 */
export function notaDeLinea(l: { foto: number; debeHaber: number; contada: number | null; ajustadoAntes?: number }): string | null {
  const delCierre = l.ajustadoAntes ?? 0;
  const deOtros = l.debeHaber - l.foto - delCierre;
  if (deOtros !== 0 || delCierre !== 0) {
    const partes = [`Al abrir: ${l.foto}`];
    if (deOtros !== 0) {
      const n = Math.abs(deOtros);
      const verbo = deOtros < 0 ? (n === 1 ? "salió" : "salieron") : n === 1 ? "entró" : "entraron";
      partes.push(`${verbo} ${n} durante el conteo`);
    }
    if (delCierre !== 0) partes.push(`el cierre de este conteo ${delCierre < 0 ? "restó" : "sumó"} ${Math.abs(delCierre)}`);
    return partes.join(" · ");
  }
  if (l.foto === 0 && l.contada !== null && l.contada > 0) return `Encontraste ${l.contada} que no estaba registrada aquí`;
  return null;
}

/**
 * En la pantalla de confirmar: si desde que se verificó la línea el stock se movió, el ajuste se aplica sobre lo que
 * hay HOY (nunca «fijar el stock = lo contado»), y la persona debe verlo antes de cerrar: «Hoy hay 10 por movimientos
 * posteriores; quedará en 8.» Sin nota cuando no hay nada que ajustar o no hubo movimientos.
 */
export function notaAjuste(l: { actual: number | null; debeHaber: number; diferencia: number | null }): string | null {
  if (l.actual === null || l.diferencia === null || l.diferencia === 0 || l.actual === l.debeHaber) return null;
  return `Hoy hay ${l.actual} por movimientos posteriores; quedará en ${l.actual + l.diferencia}.`;
}

/**
 * La línea tal como quedará al guardar una cantidad, para pintarla YA (el guardado real tarda: se agrupa unos
 * 600 ms y espera su turno) y dejar que la respuesta de `conteo_contar` la corrija. Replica lo que hace la base:
 *  · con cantidad: se verifica contra el stock vivo (`actual`, que es lo que la base va a leer; si no se conoce,
 *    el «debe haber» que ya se mostraba). Si se pidió «Volver a contar» y se escribe lo mismo que antes, y no
 *    coincide con lo esperado, queda confirmada de una vez (reconfirmada por reconteo).
 *  · `null` (borrar lo escrito): vuelve a pendiente, con lo congelado al abrir. No pone 0.
 * `null` en el resultado = la línea deja de existir para el conteo (regla D3: variante que no estaba en la foto, sin
 * cantidad y nunca mandada a recontar). Si tenía `anterior`, se conserva y la línea sigue visible «en reconteo».
 */
export function contarLinea(l: LineaConteo, cantidad: number | null, ahora: string): LineaConteo | null {
  let base: Omit<LineaConteo, "diferencia" | "estado">;
  if (cantidad === null) {
    base = { ...l, contada: null, verificadoEn: null, confirmadaEn: null, debeHaber: l.foto, ajustadoAntes: 0 };
  } else {
    const debeHaber = l.actual ?? l.debeHaber;
    const reconfirmada = l.anterior !== null && cantidad === l.anterior && cantidad !== debeHaber;
    // Al volver a verificar, lo que un cierre anterior de este conteo ya ajustó pasa a formar parte del «debe haber» (la base lo lee del stock vivo).
    base = { ...l, contada: cantidad, debeHaber, verificadoEn: ahora, confirmadaEn: reconfirmada ? ahora : null, ajustadoAntes: l.ajustadoTotal };
  }
  const estado = estadoDeLinea(base);
  if (estado === null) return null;
  return { ...base, diferencia: base.contada === null ? null : base.contada - base.debeHaber, estado };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Resumen, progreso y cierre
// ---------------------------------------------------------------------------------------------------------------

/** El resumen de unas líneas. La pantalla lo recalcula tras cada lectura sin volver a la base. */
export function resumirLineas(lineas: readonly Pick<LineaConteo, "estado" | "diferencia">[]): ResumenConteo {
  const r: ResumenConteo = { variantes: lineas.length, verificadas: 0, pendientes: 0, correctas: 0, conDiferencia: 0, confirmadas: 0, enReconteo: 0, unidadesSobrantes: 0, unidadesFaltantes: 0 };
  for (const l of lineas) {
    switch (l.estado) {
      case "pendiente":
        r.pendientes += 1;
        break;
      case "en_reconteo":
        r.pendientes += 1;
        r.enReconteo += 1;
        break;
      case "correcta":
        r.verificadas += 1;
        r.correctas += 1;
        break;
      case "diferencia_confirmada":
      case "con_diferencia": {
        // Una diferencia confirmada sigue siendo una diferencia: `confirmadas` es un subconjunto de `conDiferencia`.
        r.verificadas += 1;
        r.conDiferencia += 1;
        if (l.estado === "diferencia_confirmada") r.confirmadas += 1;
        const d = l.diferencia ?? 0;
        if (d > 0) r.unidadesSobrantes += d;
        if (d < 0) r.unidadesFaltantes += -d;
        break;
      }
    }
  }
  return r;
}

export type BloqueoDeCierre = "conteo_vacio" | "conteo_pendientes" | "diferencias_sin_confirmar";

/**
 * Qué impide cerrar el conteo, en el MISMO orden en que lo revisa `cerrar_conteo`: sin nada verificado no hay qué
 * cerrar (se cancela); con pendientes solo se cierra como parcial, a propósito; y toda diferencia se confirma antes.
 * `null` = se puede cerrar. Las pantallas de revisar y confirmar deciden a dónde llevar a la persona con esto.
 */
export function bloqueoDeCierre(
  r: Pick<ResumenConteo, "verificadas" | "pendientes" | "conDiferencia" | "confirmadas">,
  parcial: boolean
): BloqueoDeCierre | null {
  if (r.verificadas === 0) return "conteo_vacio";
  if (r.pendientes > 0 && !parcial) return "conteo_pendientes";
  if (r.conDiferencia - r.confirmadas > 0) return "diferencias_sin_confirmar";
  return null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «37 variantes · 18 verificadas · 19 pendientes · 2 con diferencia» (sin «con diferencia» si no hay). */
export function textoResumen(r: Pick<ResumenConteo, "variantes" | "verificadas" | "pendientes" | "conDiferencia">): string {
  const partes = [plural(r.variantes, "variante", "variantes"), plural(r.verificadas, "verificada", "verificadas"), plural(r.pendientes, "pendiente", "pendientes")];
  if (r.conDiferencia > 0) partes.push(`${r.conDiferencia} con diferencia`);
  return partes.join(" · ");
}

/** «18 de 37 variantes verificadas»: el progreso, sin hablar de prendas ni de unidades. */
export function textoProgreso(p: { verificadas: number; variantes: number }): string {
  return `${p.verificadas} de ${p.variantes} ${p.variantes === 1 ? "variante verificada" : "variantes verificadas"}`;
}

/** «34 correctas · 3 con diferencia · 0 pendientes»: el desglose de la pantalla de revisar. */
export function textoRevision(r: Pick<ResumenConteo, "correctas" | "conDiferencia" | "pendientes">): string {
  return [plural(r.correctas, "correcta", "correctas"), `${r.conDiferencia} con diferencia`, plural(r.pendientes, "pendiente", "pendientes")].join(" · ");
}

/** «Faltan 2 variantes por contar.»: el aviso ámbar cuando quedan pendientes al revisar. */
export function textoFaltanPorContar(n: number): string {
  return n === 1 ? "Falta 1 variante por contar." : `Faltan ${n} variantes por contar.`;
}

/** «Se actualizarán 3 variantes.»: lo que cambia al cerrar. */
export function textoSeActualizaran(n: number): string {
  return n === 1 ? "Se actualizará 1 variante." : `Se actualizarán ${n} variantes.`;
}

/** «Quedan 4 variantes sin verificar; no cambiarán.»: la aclaración del cierre parcial. */
export function textoQuedanSinVerificar(n: number): string {
  return n === 1 ? "Queda 1 variante sin verificar; no cambiará." : `Quedan ${n} variantes sin verificar; no cambiarán.`;
}

/**
 * «37 variantes verificadas · 34 coincidieron · 3 fueron corregidas», y en un cierre parcial suma cuántas quedaron sin
 * verificar. Es el resultado de un conteo terminado: las «corregidas» son las diferencias que se confirmaron y ajustaron.
 */
export function textoTerminado(r: Pick<ResumenConteo, "verificadas" | "correctas" | "conDiferencia" | "pendientes">, parcial: boolean): string {
  const partes = [
    `${r.verificadas} ${r.verificadas === 1 ? "variante verificada" : "variantes verificadas"}`,
    `${r.correctas} ${r.correctas === 1 ? "coincidió" : "coincidieron"}`,
    `${r.conDiferencia} ${r.conDiferencia === 1 ? "fue corregida" : "fueron corregidas"}`,
  ];
  if (parcial && r.pendientes > 0) partes.push(`${r.pendientes} ${r.pendientes === 1 ? "quedó sin verificar" : "quedaron sin verificar"} (conteo parcial)`);
  return partes.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------------
// 4. El resultado de un conteo en el historial
// ---------------------------------------------------------------------------------------------------------------

export type ResultadoConteo = "en_curso" | "cancelado" | "parcial" | "todo_correcto" | "con_diferencias";

type DatosDeResultado = { estado: string; lineas: number; lineasConDiferencia: number; parcial: boolean };

/**
 * Cómo se lee un conteo de un vistazo. Un anulado es «cancelado»; y un cerrado SIN ninguna línea verificada (los
 * conteos de antes del rediseño que se cerraron vacíos) también: cerrar sin verificar nada no dice nada del inventario,
 * y no debe leerse «Todo correcto» ni contar para la exactitud. El parcial va antes que las diferencias: lo primero que
 * hay que saber de un conteo a medias es que quedó a medias.
 */
export function resultadoConteo(c: DatosDeResultado): ResultadoConteo {
  if (c.estado === "abierto") return "en_curso";
  if (c.estado === "anulado" || c.lineas === 0) return "cancelado";
  if (c.parcial) return "parcial";
  return c.lineasConDiferencia === 0 ? "todo_correcto" : "con_diferencias";
}

/** «Todo correcto» / «3 diferencias corregidas» / «Conteo parcial» / «Cancelado» / «En curso». Nunca «Cerrado · Vacío». */
export function textoResultadoConteo(c: DatosDeResultado): string {
  switch (resultadoConteo(c)) {
    case "en_curso":
      return "En curso";
    case "cancelado":
      return "Cancelado";
    case "parcial":
      return "Conteo parcial";
    case "todo_correcto":
      return "Todo correcto";
    case "con_diferencias":
      return c.lineasConDiferencia === 1 ? "1 diferencia corregida" : `${c.lineasConDiferencia} diferencias corregidas`;
  }
}

/** Dónde se contó: «Almacén de tienda», «Piso de venta» o «Toda la ubicación» (el Taller no separa piso y almacén). */
export function textoLugar(c: { sububicacionTipo: string | null; sububicacionNombre: string | null }): string {
  if (c.sububicacionTipo === "almacen_tienda") return "Almacén de tienda";
  if (c.sububicacionTipo === "piso_venta") return "Piso de venta";
  return c.sububicacionNombre ?? "Toda la ubicación";
}

/** Qué se contó: «Todo» o «Solo Blusas». */
export function textoAlcance(c: { alcance: string; alcanceCategoriaNombre: string | null }): string {
  return c.alcance === "categoria" && c.alcanceCategoriaNombre ? `Solo ${c.alcanceCategoriaNombre}` : "Todo";
}

// ---------------------------------------------------------------------------------------------------------------
// 5. La lista de contar: producto → color → tallas, en un orden que no se mueve
// ---------------------------------------------------------------------------------------------------------------

/** Lo mínimo que una fila debe traer para agruparse y buscarse. `PrendaConteo` lo cumple; una fila de pantalla puede sumarle su línea. */
export type PrendaAgrupable = {
  varianteId: string;
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  talla: string | null;
  sku: string;
};

/** Un modelo en un color, con sus tallas: es el encabezado (miniatura + «Blusa Emma · Beige») y las filas de abajo. */
export type GrupoConteo<T extends PrendaAgrupable> = {
  clave: string;
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  tallas: T[];
};

const comparaTexto = (a: string, b: string) => a.localeCompare(b, "es");
/** Lo que no tiene valor (sin color, sin talla) va al final, no al principio. */
const conNulosAlFinal = <V>(a: V | null, b: V | null, comparar: (x: V, y: V) => number) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : comparar(a, b));

/**
 * Junta las filas por modelo y color y ordena TODO de forma estable: modelo (por nombre, y por id si dos modelos se
 * llaman igual), color, y dentro las tallas en el orden del rack (XS, S, M, L… y 36, 38, 40; `lib/tallas.ts`). Agrupa
 * por `productoId`, NUNCA por nombre: dos modelos con el mismo nombre no deben mezclar sus tallas. El orden no
 * depende de cómo lleguen las filas ni de la última que se tocó: quien cuenta recorre la lista siempre igual.
 */
export function agruparConteo<T extends PrendaAgrupable>(filas: readonly T[]): GrupoConteo<T>[] {
  const grupos = new Map<string, GrupoConteo<T>>();
  for (const f of filas) {
    const k = JSON.stringify([f.productoId, f.color]);
    let g = grupos.get(k);
    if (!g) {
      g = { clave: k, productoId: f.productoId, referencia: f.referencia, color: f.color, colorHex: f.colorHex, fotoUrl: f.fotoUrl, tallas: [] };
      grupos.set(k, g);
    }
    // Todas las tallas de un color comparten foto y muestra; se toma la primera que las tenga.
    g.colorHex ??= f.colorHex;
    g.fotoUrl ??= f.fotoUrl;
    g.tallas.push(f);
  }
  for (const g of grupos.values()) {
    g.tallas.sort(
      (a, b) => conNulosAlFinal(a.talla, b.talla, compararTallas) || comparaTexto(a.sku, b.sku) || comparaTexto(a.varianteId, b.varianteId)
    );
  }
  return [...grupos.values()].sort(
    (a, b) => comparaTexto(a.referencia, b.referencia) || comparaTexto(a.productoId, b.productoId) || conNulosAlFinal(a.color, b.color, comparaTexto)
  );
}

/** ¿Alguna palabra de `texto` (ya sin tildes ni mayúsculas) empieza con `p`? */
const empiezaPalabra = (texto: string, p: string) => texto.split(/[^a-z0-9]+/).some((palabra) => palabra.startsWith(p));

/**
 * La búsqueda manual: producto, color, talla o código, sin tildes ni mayúsculas y con varias palabras a la vez
 * («blusa beige m»: todas deben coincidir, en cualquier orden). Cada palabra escrita debe ser la talla ENTERA, el
 * comienzo de una palabra del producto o del color, o un pedazo del código. Así «m» es la talla M (y lo que empiece con
 * «m»), no cualquier nombre que lleve una «m» adentro como «Emma»; y una sola letra no se busca dentro de los códigos,
 * donde coincidiría con casi todo. Sin texto no filtra nada.
 */
export function filtrarConteo<T extends PrendaAgrupable>(filas: readonly T[], texto: string): T[] {
  const palabras = clave(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [...filas];
  return filas.filter((f) => {
    const referencia = clave(f.referencia);
    const color = clave(f.color);
    const sku = clave(f.sku);
    const talla = clave(f.talla);
    return palabras.every((p) => talla === p || empiezaPalabra(referencia, p) || empiezaPalabra(color, p) || (p.length >= 2 && sku.includes(p)));
  });
}

/**
 * «Contar esta prenda» (ADR-0241, desde un movimiento de Movimientos): `?variantes=` acota la lista de contar a esas
 * tallas. Solo la lista de la pantalla: el conteo abierto sigue siendo el que es. Sin lista, todo.
 */
export function acotarALista<T extends { varianteId: string }>(filas: readonly T[], varianteIds: readonly string[]): T[] {
  if (varianteIds.length === 0) return [...filas];
  const ids = new Set(varianteIds);
  return filas.filter((f) => ids.has(f.varianteId));
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Escribir y escanear una cantidad
// ---------------------------------------------------------------------------------------------------------------

/** El mayor entero que guarda la base (`integer`): más allá, la base rechazaría el número. */
const MAX_CANTIDAD = 2_147_483_647;

/**
 * Lee lo escrito en el campo «Contaste». Tres respuestas, y la diferencia entre las dos primeras es la regla más
 * importante del conteo:
 *  · `null`: vacío. La variante sigue PENDIENTE; jamás se guarda como 0.
 *  · `undefined`: no es una cantidad válida (letras, negativo, decimal, «1e2»). No se guarda; se avisa.
 *  · un entero ≥ 0: la cantidad. El 0 escrito de verdad es una verificación: «no queda ninguna».
 */
export function cantidadEscrita(texto: string): number | null | undefined {
  const t = texto.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) && n <= MAX_CANTIDAD ? n : undefined;
}

/** La cantidad tras escanear una unidad: +1 sobre lo ya contado. Una pendiente arranca en 1, no en NaN ni en 0. */
export function sumarLectura(contada: number | null): number {
  return (contada ?? 0) + 1;
}

/**
 * Lo que el buscador del conteo lee de cada variante del catálogo. `sku` pasa a ser el código de la etiqueta (es lo
 * que se muestra y contra lo que se teclea a medias) y `codigosBarras` conserva los códigos de barras y suma el `sku`
 * legado cuando existe y no es el mismo texto: una prenda vieja no debe dejar de resolverse al escanear su código de
 * siempre. Solo agrega opciones de emparejamiento; no inventa ni escribe nada.
 */
export function codigosDeConteo(v: { sku: string; codigo: string | null; codigosBarras: readonly string[] }): { sku: string; codigosBarras: string[] } {
  const codigo = codigoDeEtiqueta(v);
  const yaEsta = (c: string) => c.toLowerCase() === codigo.toLowerCase() || v.codigosBarras.some((b) => b.toLowerCase() === c.toLowerCase());
  return { sku: codigo, codigosBarras: [...v.codigosBarras, ...(v.sku && !yaEsta(v.sku) ? [v.sku] : [])] };
}

/**
 * La lista que se despliega bajo la caja de escanear: lo tecleado a medias contra el código de la etiqueta, o exacto
 * contra cualquier código de barras (el que lee la pistola). Con el `sku` legado, «POL-0004» no encontraba nada y la
 * pantalla ofrecía «Dar de alta esta prenda» para una que sí existía (ver `codigosDeConteo`).
 */
export function coincidenciasPorCodigo<T extends { sku: string | null; codigosBarras: readonly string[] }>(texto: string, catalogo: readonly T[], max = 8): T[] {
  const q = guionDeLaPistola(texto).trim().toLowerCase();
  if (!q) return [];
  const clave = (c: string) => guionDeLaPistola(c).toLowerCase();
  return catalogo.filter((v) => clave(v.sku ?? "").includes(q) || v.codigosBarras.some((c) => clave(c) === q)).slice(0, max);
}

/**
 * El código con el que se dibuja una prenda recién dada de alta al vuelo. `censo_crear_variante` devuelve `v.sku`,
 * que en una prenda nueva es NULL (nace sin sku y el disparador solo acuña el `codigo`): sin esto la prenda entraba a
 * la lista con la línea vacía. Si la función un día devuelve el `codigo`, se usa; mientras tanto se muestra el código de
 * barras que la colaboradora acaba de escanear —el que tiene en la mano—, que es un dato real y no se guarda.
 */
export function codigoDePrendaNueva(fila: { sku: string | null; codigo?: string | null; codigo_barras: string }): string {
  return codigoDeEtiqueta(fila) || fila.codigo_barras;
}

/**
 * El alta al vuelo cayó en la regla «Sin color o con colores» (hint `mezcla_sin_color`, ADR-0263 T5): la prenda con ese
 * nombre ya existe «del otro lado» y `censo_crear_variante` le iba a colgar la variante. La frase de la base habla desde
 * la ficha («ponle color a las que no lo tienen o desactívalas»), que desde el Conteo no se puede hacer: esta dice qué
 * pasó con ESTA prenda y dónde se arregla. `null` si el error es otro (lo traduce `traducirError`).
 */
export function mensajeMezclaEnCenso(error: { hint?: string | null } | null | undefined, referencia: string, conColor: boolean): string | null {
  if (error?.hint !== "mezcla_sin_color") return null;
  const nombre = `«${referencia.trim()}»`;
  return conColor
    ? `${nombre} está registrada «Sin color», y una prenda no puede tener variantes «Sin color» y de color a la vez. Para sumarle este color, primero hay que ponerle su color a las que ya tiene, desde su ficha en Productos.`
    : `${nombre} tiene colores: una variante «Sin color» no va junto a ellas. Elige el color de esta prenda.`;
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Guardar sin pisarse: agrupar por variante y escribir en fila
// ---------------------------------------------------------------------------------------------------------------

/** Cuánto se espera, sin nuevos cambios de una variante, antes de guardarla. Una ráfaga de 12 lecturas es UN guardado. */
export const ESPERA_GUARDADO_MS = 600;

/**
 * Cola de guardado en serie. Cada guardado manda el TOTAL de la variante (1, 2, 3…). Si dos salieran en paralelo y la
 * respuesta del «2» llegara después que la del «3», la variante quedaría en 2. En fila, la última en salir es la última
 * en escribirse. La usan Conteo y Traslados (`TrasladoDetallePanel`): no se mueve ni se renombra.
 */
export function crearColaEnSerie() {
  let cola: Promise<unknown> = Promise.resolve();
  let pendientes = 0;
  return {
    /** Encola `tarea`; se ejecuta cuando terminen las anteriores (aunque alguna haya fallado). */
    agregar<T>(tarea: () => Promise<T>): Promise<T> {
      pendientes += 1;
      const turno = cola.then(tarea, tarea);
      cola = turno.then(
        () => {
          pendientes -= 1;
        },
        () => {
          pendientes -= 1;
        }
      );
      return turno;
    },
    /** Se resuelve cuando no queda nada por guardar (para revisar el cierre con todo ya escrito). */
    vaciar(): Promise<void> {
      return cola.then(() => undefined);
    },
    get pendientes() {
      return pendientes;
    },
  };
}

/**
 * Junta los cambios seguidos de una MISMA variante en uno solo: cada lectura reprograma la espera de su variante y,
 * cuando pasa `esperaMs` sin cambios, dispara UN guardado con el último valor. Con la pistola, 12 blusas iguales son
 * 12 lecturas y un solo viaje a la base. `alDisparar` suele ser `cola.agregar(() => guardar(...))`.
 *
 * `soltarTodo` dispara YA lo que espera (al pasar a revisar, o al salir de la pantalla): sin eso, la última lectura de
 * una ráfaga se perdería si la persona pulsa «Revisar conteo» antes de que venza la espera.
 */
export function crearAgrupadorDeGuardado<V>(alDisparar: (varianteId: string, valor: V) => void, esperaMs: number = ESPERA_GUARDADO_MS) {
  const esperando = new Map<string, { valor: V; timer: ReturnType<typeof setTimeout> }>();
  return {
    programar(varianteId: string, valor: V) {
      const previo = esperando.get(varianteId);
      if (previo) clearTimeout(previo.timer);
      const timer = setTimeout(() => {
        esperando.delete(varianteId);
        alDisparar(varianteId, valor);
      }, esperaMs);
      esperando.set(varianteId, { valor, timer });
    },
    soltarTodo() {
      const todo = [...esperando];
      esperando.clear();
      for (const [varianteId, { valor, timer }] of todo) {
        clearTimeout(timer);
        alDisparar(varianteId, valor);
      }
    },
    get pendientes() {
      return esperando.size;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Leer lo que devuelve la base (jsonb) sin confiar en él
// ---------------------------------------------------------------------------------------------------------------

type Objeto = Record<string, unknown>;

function comoObjeto(v: unknown, dato: string): Objeto {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`El conteo llegó mal formado: «${dato}» no es un objeto.`);
  return v as Objeto;
}
function texto(o: Objeto, campo: string): string {
  const v = o[campo];
  if (typeof v !== "string" || v === "") throw new Error(`El conteo llegó mal formado: falta «${campo}».`);
  return v;
}
function textoONulo(o: Objeto, campo: string): string | null {
  const v = o[campo];
  return typeof v === "string" && v !== "" ? v : null;
}
function entero(o: Objeto, campo: string): number {
  const v = o[campo];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`El conteo llegó mal formado: «${campo}» no es un número.`);
  return v;
}
function enteroONulo(o: Objeto, campo: string): number | null {
  const v = o[campo];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Una línea como la devuelve la base (`fn_conteo_detalle.lineas[i]` o el resultado de `conteo_contar`,
 * `conteo_recontar` y `conteo_confirmar_diferencia`), pasada a camelCase. El estado y la diferencia se DERIVAN de los
 * números con la regla de este archivo (no se copian del texto de la base): así lo que se ve nunca se contradice a sí
 * mismo. `null` si la línea se ignora (regla D3): la base también devuelve `null`, sin línea, cuando la variante quedó
 * ignorada (por ejemplo, se le borró la cantidad a una que no estaba en la foto y nunca se mandó a recontar). Lanza si llega algo que no es una
 * línea: mejor no dibujar que dibujar algo falso.
 */
export function lineaDesdeJson(json: unknown): LineaConteo | null {
  if (json === null || json === undefined) return null;
  const o = comoObjeto(json, "línea");
  const debeHaber = entero(o, "debe_haber");
  const base = {
    varianteId: texto(o, "variante_id"),
    debeHaber,
    foto: enteroONulo(o, "foto") ?? debeHaber,
    contada: enteroONulo(o, "contada"),
    anterior: enteroONulo(o, "anterior"),
    verificadoEn: textoONulo(o, "verificado_en"),
    confirmadaEn: textoONulo(o, "confirmada_en"),
    actual: enteroONulo(o, "actual"),
    ajusteMovimientoId: textoONulo(o, "ajuste_movimiento_id"),
    // Faltan si la web sale antes que el SQL (`20260930050000`): valen 0 y la nota es la de siempre.
    ajustadoTotal: enteroONulo(o, "ajustado_total") ?? 0,
    ajustadoAntes: enteroONulo(o, "ajustado_antes") ?? 0,
  };
  const estado = estadoDeLinea(base);
  if (estado === null) return null;
  return { ...base, diferencia: base.contada === null ? null : base.contada - base.debeHaber, estado };
}

const ESTADOS_DE_CONTEO: readonly string[] = ["abierto", "cerrado", "anulado"];

/**
 * El detalle de un conteo como lo devuelve `retail.fn_conteo_detalle` (un solo jsonb). `null` si la base no devolvió
 * nada: el conteo no existe o quien pregunta no opera esa sede. El `resumen` se calcula de las líneas con
 * `resumirLineas` (la misma cuenta que hace la pantalla en vivo), no se copia del que trae la base.
 */
export function detalleDesdeJson(json: unknown): DetalleConteo | null {
  if (json === null || json === undefined) return null;
  const raiz = comoObjeto(json, "detalle");
  if (raiz.conteo === undefined || raiz.conteo === null) return null;
  const c = comoObjeto(raiz.conteo, "conteo");
  const estado = texto(c, "estado");
  if (!ESTADOS_DE_CONTEO.includes(estado)) throw new Error(`El conteo llegó mal formado: estado «${estado}» desconocido.`);
  const alcance = texto(c, "alcance");
  if (alcance !== "todo" && alcance !== "categoria") throw new Error(`El conteo llegó mal formado: alcance «${alcance}» desconocido.`);
  if (!Array.isArray(raiz.lineas)) throw new Error("El conteo llegó mal formado: faltan las líneas.");

  const lineas = raiz.lineas.flatMap((l) => lineaDesdeJson(l) ?? []);
  return {
    conteo: {
      id: texto(c, "id"),
      numero: entero(c, "numero"),
      estado: estado as EstadoConteo,
      ubicacionId: texto(c, "ubicacion_id"),
      sububicacionId: textoONulo(c, "sububicacion_id"),
      sububicacionTipo: textoONulo(c, "sububicacion_tipo"),
      sububicacionNombre: textoONulo(c, "sububicacion_nombre"),
      alcance,
      alcanceCategoriaId: textoONulo(c, "alcance_categoria_id"),
      alcanceCategoriaNombre: textoONulo(c, "alcance_categoria_nombre"),
      abiertoPor: textoONulo(c, "abierto_por"),
      abiertoPorNombre: textoONulo(c, "abierto_por_nombre") ?? "—",
      cerradoPor: textoONulo(c, "cerrado_por"),
      cerradoPorNombre: textoONulo(c, "cerrado_por_nombre"),
      cerradoEn: textoONulo(c, "cerrado_en"),
      creadoEn: texto(c, "created_at"),
      fotoEn: textoONulo(c, "foto_en"),
      esPrueba: c.es_prueba === true,
    },
    resumen: resumirLineas(lineas),
    lineas,
  };
}
