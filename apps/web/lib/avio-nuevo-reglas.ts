import type { CampoDeGuia } from "./guia-campos";
import {
  COMPORTAMIENTOS,
  claseElegida,
  medidaCuadra,
  medidaProhibida,
  medidaRequerida,
  medidasDe,
  textoDeMedida,
  UNIDADES_MEDIDA,
  type ClaseDeAvio,
  type UnidadMedidaAvio,
} from "./avio-clases-reglas";
import { CANTIDAD_ILEGIBLE, leerCantidad, problemaDeCantidad, UNIDADES_INSUMO, type MaterialVista, type UnidadInsumo } from "./insumos-reglas";
import { MONTO_ILEGIBLE, numeroDeMonto } from "./monto-plata-reglas";
import { claveTexto, nombresParecidos } from "./nombres-parecidos";
// Las filas de colores son las MISMAS que las de una tela: una fila, su saldo, su costo y su mínimo, todo como se escribe. Lo único que cambia es que un avío no convierte nada
// (se cuenta en la unidad en que se compra), así que no hay columna de «≈ metros».
import { cantidadEscrita, numeroMalEscrito, tieneSaldo, type FilaDeColor } from "./tela-nueva-reglas";

// «Nuevo avío» (ADR-0580): un avío y todos sus colores en una sola hoja, como la tela. Reglas puras, sin React ni red.
//
// EL PROBLEMA. Para registrar seis botones nácar de colores había que abrir la hoja seis veces y teclear seis códigos a mano; si uno se repetía, se sabía al guardar. El combo de color tenía UN
// valor. Y la primera pregunta que contestaba la persona era «Se mide en», a ciegas: la hoja proponía «unidad» para todo, también para el hilo, que va en CONOS — y esa unidad se congela al
// primer lote (`fn_insumos_unidad_firme`).
//
// CONTRATO
//   PROMETE: `problemasDeAvioNuevo` es la ÚNICA regla con la que la hoja decide si guarda (la guía de foco y el botón salen de ella, así que no pueden contradecirla), y es la misma que
//            `retail.fn_material_leer` aplica en la base — su prueba recorre los seis comportamientos; `payloadDeAvioNuevo` arma exactamente lo que espera `crear_material`.
//   ASUME:   un avío se cuenta en la unidad en que se compra (hoy no hay factor: una caja de 144 se anota como 144, decisión de Felipe del 2026-10-30). Quien no es líder no anota saldo.
//   NO HACE: no decide quién puede guardar ni toca la base. El código que se muestra es una vista previa: lo asigna la base, con el prefijo de la clase.

export type EntradaAvioNuevo = {
  claseId: string;
  nombre: string;
  /** La unidad en que se lleva el stock. La clase la propone; la elige quien tiene el avío en la mano y DESPUÉS NO SE CAMBIA. */
  unidad: UnidadInsumo;
  /** La medida, como se escribe («18», «40», «3»). Vacío = sin medida. */
  medida: string;
  medidaUnidad: UnidadMedidaAvio | "";
  /** En porcentaje, como se escribe. Solo tiene sentido en lo que se mide en metros. */
  merma: string;
  filas: FilaDeColor[];
  puedeSaldo: boolean;
  responsableListo: boolean;
};

export const MENSAJE_CLASE = "Elige de qué clase es el avío (botón, cierre, hilo…).";
export const MENSAJE_NOMBRE = "Ponle un nombre al avío.";
export const MENSAJE_UNIDAD = "Elige en qué se cuenta: esta es la única vez que se puede.";
export const MENSAJE_MERMA = "La merma va de 0 % a menos de 50 %.";
export const MENSAJE_MERMA_SIN_METRO = "La merma al cortar es de lo que se mide en metros: lo que se cuenta por unidad no la lleva.";
export const MENSAJE_SIN_COLORES = "Elige al menos un color.";
export const MENSAJE_SIN_COSTO = "Un color con saldo necesita su costo (escribe 0 si no lo sabes).";
export const MENSAJE_SALDO_DEL_LIDER = "El saldo inicial, con su costo, lo anota el líder.";
export const MENSAJE_QUIEN = "Elige quién anota este avío.";
const MENSAJE_MEDIDA_ILEGIBLE = "La medida es un número mayor que cero (por ejemplo 18 o 11.4).";

/** La clase elegida, o `null` si todavía no eligió ninguna (o eligió una que ya no está). */
export function claseDeLaEntrada(e: Pick<EntradaAvioNuevo, "claseId">, clases: readonly ClaseDeAvio[]): ClaseDeAvio | null {
  return claseElegida(clases, e.claseId);
}

/** La medida escrita, como número; `null` si está vacía o no se entiende. */
export function medidaEscrita(e: Pick<EntradaAvioNuevo, "medida">): number | null {
  return e.medida.trim() === "" ? null : leerCantidad(e.medida);
}

/** Cómo se va a llamar el avío: lo escrito más su medida («Botón nácar» + 18 L). Es lo MISMO que compone la base (`retail.fn_medida_texto` en el disparador de cada color). */
export function nombreCompuesto(e: Pick<EntradaAvioNuevo, "nombre" | "medida" | "medidaUnidad">): string {
  const n = e.nombre.trim();
  const m = e.medidaUnidad === "" ? null : textoDeMedida(medidaEscrita(e), e.medidaUnidad);
  return m === null ? n : `${n} ${m}`;
}

/** El título de la medida en la hoja («Largo», «Ancho», «Título», «Medida») y por qué se pide. `null` si esa clase no se mide. */
export function tituloDeLaMedida(clase: ClaseDeAvio | null): { titulo: string; porQue: string; ejemplo: string; unidades: readonly UnidadMedidaAvio[] } | null {
  if (!clase || medidaProhibida(clase.comportamiento)) return null;
  const r = COMPORTAMIENTOS[clase.comportamiento];
  return { titulo: r.comoSeLlama, porQue: r.porQue, ejemplo: r.ejemplo, unidades: medidasDe(clase.comportamiento) };
}

const mermaDe = (e: Pick<EntradaAvioNuevo, "merma">): number | null => (e.merma.trim() === "" ? 0 : leerCantidad(e.merma));
const mermaBuena = (e: Pick<EntradaAvioNuevo, "merma">): boolean => {
  const m = mermaDe(e);
  return m !== null && m >= 0 && m / 100 < 0.5;
};

/** La merma solo se ofrece en lo que se mide en metros (un elástico, una cinta): un botón no se corta. */
export function llevaMerma(e: Pick<EntradaAvioNuevo, "unidad">): boolean {
  return e.unidad === "metro";
}

/** Lo que vale lo escrito en una fila (cantidad × costo por unidad). `null` si falta el costo o no se entiende. */
export function costoTotalDeFilaAvio(f: FilaDeColor): number | null {
  const q = cantidadEscrita(f);
  const c = numeroDeMonto(f.costo);
  if (q === null || f.costo.trim() === "" || !Number.isFinite(c) || c < 0) return null;
  return Math.round(q * c * 100) / 100;
}

function problemasDeFila(e: EntradaAvioNuevo, f: FilaDeColor): string[] {
  const p: string[] = [];
  if (numeroMalEscrito(f.ya) || numeroMalEscrito(f.minimo)) p.push(CANTIDAD_ILEGIBLE);
  // Medio botón no existe. La base también lo rechaza (20261031211000), pero quien escribe se entera aquí, antes de guardar,
  // y con el nombre de lo que está contando (/chaos 2026-10-31).
  for (const texto of [f.ya, f.minimo]) {
    const problema = problemaDeCantidad(texto.trim() === "" ? null : leerCantidad(texto), e.unidad);
    if (problema && !p.includes(problema)) p.push(problema);
  }
  if (f.costo.trim() !== "" && !Number.isFinite(numeroDeMonto(f.costo))) p.push(MONTO_ILEGIBLE);
  if (tieneSaldo(f)) {
    if (!e.puedeSaldo) p.push(MENSAJE_SALDO_DEL_LIDER);
    else if (costoTotalDeFilaAvio(f) === null && Number.isFinite(numeroDeMonto(f.costo))) p.push(MENSAJE_SIN_COSTO);
  }
  return p;
}

/** Lo que la hoja rechaza de la MEDIDA, según lo que pide la clase. Es lo mismo que `fn_material_leer` dice en castellano. */
export function problemasDeLaMedida(e: EntradaAvioNuevo, clase: ClaseDeAvio | null): string[] {
  if (!clase) return [];
  const escrita = e.medida.trim() !== "" || e.medidaUnidad !== "";
  if (medidaProhibida(clase.comportamiento)) {
    return escrita ? [`«${clase.nombre}» no lleva medida: lo que lo distingue es su nombre.`] : [];
  }
  if (!escrita) return medidaRequerida(clase.comportamiento) ? [`Dile su ${COMPORTAMIENTOS[clase.comportamiento].comoSeLlama.toLowerCase()}: dos «${clase.nombre}» de distinta medida son dos avíos distintos.`] : [];
  const v = medidaEscrita(e);
  if (v === null || !(v > 0 && v < 10000)) return [MENSAJE_MEDIDA_ILEGIBLE];
  if (e.medidaUnidad === "" || !medidaCuadra(clase.comportamiento, e.medidaUnidad)) {
    return [`Elige en qué se mide «${clase.nombre}»: ${medidasDe(clase.comportamiento).map((u) => UNIDADES_MEDIDA[u].larga.toLowerCase()).join(" o ")}.`];
  }
  return [];
}

/** Lo que la hoja rechaza de lo escrito, en el orden en que lo dice. Vacío = se puede guardar. */
export function problemasDeAvioNuevo(e: EntradaAvioNuevo, clases: readonly ClaseDeAvio[]): string[] {
  const p: string[] = [];
  const clase = claseDeLaEntrada(e, clases);
  if (!clase) p.push(MENSAJE_CLASE);
  if (!e.nombre.trim()) p.push(MENSAJE_NOMBRE);
  p.push(...problemasDeLaMedida(e, clase));
  if (!llevaMerma(e) && e.merma.trim() !== "" && (mermaDe(e) ?? 0) !== 0) p.push(MENSAJE_MERMA_SIN_METRO);
  else if (!mermaBuena(e)) p.push(MENSAJE_MERMA);
  if (clase?.pideColor !== false && e.filas.length === 0) p.push(MENSAJE_SIN_COLORES);
  for (const m of new Set(e.filas.flatMap((f) => problemasDeFila(e, f)))) p.push(m);
  // El responsable entra aquí y no en una comprobación aparte de la hoja: si no, la guía de foco diría «falta quién lo anota» y `problemasDeAvioNuevo` diría que no falta nada, que es
  // exactamente la contradicción que ADR-0284 prohíbe (y que la prueba de los 19 escenarios encontró).
  if (!e.responsableListo) p.push(MENSAJE_QUIEN);
  return p;
}

/** Los campos de la guía de foco: qué está hecho, qué sigue y qué falta. «Falta» sale de `problemasDeAvioNuevo`, nunca de una regla propia. */
export function camposDeAvioNuevo(e: EntradaAvioNuevo, clases: readonly ClaseDeAvio[]): CampoDeGuia[] {
  const clase = claseDeLaEntrada(e, clases);
  const medida = tituloDeLaMedida(clase);
  const problemasMedida = problemasDeLaMedida(e, clase);
  const problemasColores = [...new Set(e.filas.flatMap((f) => problemasDeFila(e, f)))];
  const mermaEscrita = e.merma.trim() !== "";
  // Un porcentaje escrito en algo que no se mide en metros: la base lo rechaza, así que la guía tiene que verlo.
  const mermaSobrante = !llevaMerma(e) && mermaEscrita && (mermaDe(e) ?? 0) !== 0;
  const pideColor = clase?.pideColor !== false;
  return [
    { id: "clase", nombre: "Qué avío es", requerido: true, hecho: clase !== null, pendiente: MENSAJE_CLASE },
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: e.nombre.trim() !== "", pendiente: MENSAJE_NOMBRE },
    // La unidad no se puede dejar mal: es la única decisión irreversible de toda la hoja.
    { id: "unidad", nombre: "En qué se cuenta", requerido: true, hecho: true, pendiente: MENSAJE_UNIDAD },
    // La medida se dibuja cuando la clase la lleva y, además, cuando NO la lleva pero quedó algo escrito: si no, la hoja diría «todo listo» y la base rechazaría el guardado (ADR-0284 prohíbe
    // que la guía y la validación digan cosas distintas; su prueba recorre los seis comportamientos).
    ...(medida || problemasMedida.length > 0
      ? [
          {
            id: "medida",
            nombre: medida?.titulo ?? "Medida",
            requerido: problemasMedida.length > 0 || (clase !== null && medidaRequerida(clase.comportamiento)),
            sugerido: problemasMedida.length === 0 && clase !== null && !medidaRequerida(clase.comportamiento),
            hecho: problemasMedida.length === 0 && e.medida.trim() !== "",
            pendiente: problemasMedida[0] ?? medida?.porQue ?? "",
          },
        ]
      : []),
    // La merma se dibuja cuando el avío se mide en metros y, además, cuando NO se mide en metros pero quedó un porcentaje escrito: la hoja no puede decir «todo listo» con algo que la base
    // va a rechazar (misma razón que la medida).
    ...(llevaMerma(e)
      ? [{ id: "merma", nombre: "Merma al cortar", requerido: mermaEscrita, hecho: mermaEscrita && mermaBuena(e), pendiente: MENSAJE_MERMA }]
      : mermaSobrante
        ? [{ id: "merma", nombre: "Merma al cortar", requerido: true, hecho: false, pendiente: MENSAJE_MERMA_SIN_METRO }]
        : []),
    ...(pideColor
      ? [
          {
            id: "colores",
            nombre: "Los colores",
            requerido: true,
            hecho: e.filas.length > 0 && problemasColores.length === 0,
            pendiente: e.filas.length === 0 ? MENSAJE_SIN_COLORES : (problemasColores[0] ?? MENSAJE_SIN_COLORES),
          },
        ]
      : []),
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: MENSAJE_QUIEN },
  ];
}

/** Los datos del avío como los espera `crear_material` / `editar_material`. La merma va como fracción y solo si se mide en metros. */
export function materialDelAvioParaLaBase(e: EntradaAvioNuevo, clases: readonly ClaseDeAvio[]): Record<string, unknown> {
  const clase = claseDeLaEntrada(e, clases);
  const v = medidaEscrita(e);
  const conMedida = clase !== null && !medidaProhibida(clase.comportamiento) && v !== null && e.medidaUnidad !== "";
  return {
    nombre: e.nombre.trim(),
    tipo: "avio",
    clase_id: e.claseId || null,
    unidad_medida: e.unidad,
    merma_pct: llevaMerma(e) ? (mermaDe(e) ?? 0) / 100 : 0,
    medida_valor: conMedida ? v : null,
    medida_unidad: conMedida ? e.medidaUnidad : null,
  };
}

/** Los colores como los espera la base. Un avío no convierte nada: lo escrito es lo que entra. Una fila con el color vacío es la línea «sin color» (la etiqueta de composición). */
export function coloresDelAvioParaLaBase(e: EntradaAvioNuevo): Record<string, unknown>[] {
  return e.filas.map((f) => {
    const cantidad = cantidadEscrita(f);
    const total = costoTotalDeFilaAvio(f);
    return {
      color_codigo: f.color === "" ? null : f.color,
      stock_minimo: f.minimo.trim() === "" ? null : leerCantidad(f.minimo),
      ...(tieneSaldo(f) && cantidad !== null && total !== null ? { saldo_inicial: { cantidad: Math.round(cantidad * 1000) / 1000, costo_total: total } } : {}),
    };
  });
}

export function payloadDeAvioNuevo(e: EntradaAvioNuevo, clases: readonly ClaseDeAvio[]): { material: Record<string, unknown>; colores: Record<string, unknown>[] } {
  return { material: materialDelAvioParaLaBase(e, clases), colores: coloresDelAvioParaLaBase(e) };
}

/** El código que la base le va a poner (vista previa: lo asigna ella). Prefijo de la CLASE + el siguiente número libre de ese prefijo. */
export function codigoDeVistaPreviaAvio(clase: ClaseDeAvio | null, existentes: readonly Pick<MaterialVista, "codigo">[]): string {
  const p = clase?.prefijo ?? "AVI";
  const usados = existentes
    .map((m) => /^([A-Z]{2,4})-(\d+)/i.exec(m.codigo))
    .filter((r): r is RegExpExecArray => r !== null && r[1].toUpperCase() === p)
    .map((r) => Number(r[2]));
  return `${p}-${String(Math.max(0, ...usados) + 1).padStart(2, "0")}`;
}

/**
 * ¿Ya hay un avío así? Dos fichas del mismo nombre con medidas DISTINTAS son dos avíos a propósito (un cierre de 20 cm y uno de 40); con la misma medida, es el mismo y hay que sumarle
 * colores en vez de repetirlo. Por eso el aviso distingue «es el mismo» de «se parece».
 */
export function avioParecido<T extends Pick<MaterialVista, "nombre" | "tipo" | "medida">>(
  e: Pick<EntradaAvioNuevo, "nombre" | "medida" | "medidaUnidad">,
  materiales: readonly T[],
): { avio: T; igual: boolean } | null {
  const avios = materiales.filter((m) => m.tipo === "avio");
  const v = medidaEscrita(e);
  const u = e.medidaUnidad === "" ? null : e.medidaUnidad;
  const mismaMedida = (m: T) => (m.medida?.valor ?? null) === v && (m.medida?.unidad ?? null) === u;
  const r = nombresParecidos(e.nombre, avios, { max: 500 });
  if (r.igual && mismaMedida(r.igual)) return { avio: r.igual, igual: true };
  const candidato = r.igual ?? r.parecidos.find((x) => claveTexto(x.item.nombre) !== claveTexto(e.nombre))?.item ?? r.parecidos[0]?.item ?? null;
  return candidato ? { avio: candidato, igual: false } : null;
}

/** Las columnas de la tabla de colores de un avío: Color, Código, [¿Ya tienes?, Costo] (solo el líder), Mínimo, ×. Sin columna de conversión: un avío se cuenta como se compra. */
export function columnasDeLaTablaAvio(e: Pick<EntradaAvioNuevo, "puedeSaldo">): { plantilla: string; anchoMinimo: number } {
  const cols: { css: string; px: number }[] = [
    { css: "minmax(6.5rem,1.4fr)", px: 104 },
    { css: "minmax(6rem,1.1fr)", px: 96 },
    ...(e.puedeSaldo ? [{ css: "6rem", px: 96 }] : []),
    ...(e.puedeSaldo ? [{ css: "6rem", px: 96 }] : []),
    { css: "5rem", px: 80 },
    { css: "2rem", px: 32 },
  ];
  return { plantilla: cols.map((c) => c.css).join(" "), anchoMinimo: cols.reduce((s, c) => s + c.px, 0) + (cols.length - 1) * 12 + 24 + 2 };
}

/** Cómo se dice la unidad de un avío en la cabecera de una columna («unid.», «conos», «m»). */
export function unidadCorta(u: UnidadInsumo): string {
  return UNIDADES_INSUMO[u].corta;
}

/** En singular, para «Costo por cono» (y no «Costo por conos», que es lo que da la forma corta). */
const SINGULAR: Record<UnidadInsumo, string> = { metro: "metro", kilo: "kilo", unidad: "unidad", cono: "cono", par: "par", docena: "docena" };
export function unidadSingular(u: UnidadInsumo): string {
  return SINGULAR[u];
}
