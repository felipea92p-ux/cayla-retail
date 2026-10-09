// Caja ▸ Registrar gasto, la versión rápida (maqueta A, Felipe 2026-10-09; docs/maquetas/gasto-rapido-caja-2026-10/).
// Sin React ni red.
//
// El problema: en una tienda los gastos son chicos y se repiten —el agua, unas bolsas, el mototaxi, los S/ 0.80 del baño— y el
// formulario de Finanzas ▸ Gastos pedía comprobante, proveedor, categoría contable, tienda, cuenta y condición para cada uno.
// Aquí la colaboradora toca un CONCEPTO en palabras de tienda («Baño», «Bolsas») y el monto; el concepto ya trae su categoría
// contable de `categorias_gasto` (nadie la elige) y el dinero sale del cajón abierto.
//
// CONTRATO
//   PROMETE: (1) a cada concepto, su categoría contable existente; (2) reconocer el concepto de un gasto YA registrado por su
//            descripción y su categoría —también los de antes de esta pantalla («Luz de septiembre»)—, para contar cuántas
//            veces se usó cada uno en la sede; (3) el orden por frecuencia, con «Otro» siempre al final y la ★ en los 4 primeros
//            que se usaron al menos una vez; (4) armar el borrador que `validarGasto` (la misma regla de Finanzas) valida.
//   ASUME:   el gasto rápido se guarda con la descripción que empieza por el nombre del concepto («Baño — llave del local»): así se
//            reconoce después sin columna nueva en `retail.gastos`. Un gasto que no calza con ningún concepto cuenta como «Otro».
//   NO HACE: no inventa categorías contables (sin «Otros» en la base: «Otro» pide escribir qué fue Y elegir a qué se parece), no
//            paga a crédito (eso sigue en Finanzas ▸ Gastos) ni suma proveedores.

import { parsearMonto, type BorradorGasto, type CategoriaGasto, type TipoComprobante } from "./gastos-reglas";
import type { CampoDeGuia } from "./guia-campos";

/** Cuántos días hacia atrás se cuentan para ordenar por frecuencia. */
export const DIAS_FRECUENCIA = 90;
/** Cuántos conceptos llevan la ★ de «lo más frecuente». */
export const CUANTOS_FRECUENTES = 4;
export const CLAVE_OTRO = "otro";

export type ClaveConcepto =
  | "agua"
  | "luz"
  | "internet"
  | "bano"
  | "movilidad"
  | "envio"
  | "bolsas"
  | "limpieza"
  | "utiles"
  | "arreglo";

export type ConceptoGasto = {
  clave: ClaveConcepto;
  /** Como lo dice la tienda; también es el comienzo de la descripción que se guarda. */
  nombre: string;
  /** El código de `retail.categorias_gasto` al que va. */
  categoria: string;
  /** Palabras con las que se reconoce un gasto ya registrado (sin tildes, en minúsculas; basta el comienzo de la palabra). */
  palabras: readonly string[];
};

/** El orden de fábrica: el que se usa para desempatar cuando dos conceptos tienen la misma frecuencia. */
export const CONCEPTOS: readonly ConceptoGasto[] = [
  { clave: "agua", nombre: "Agua", categoria: "servicios_basicos", palabras: ["agua", "sedapal", "sedalib", "sedapar", "epsel"] },
  { clave: "luz", nombre: "Luz", categoria: "servicios_basicos", palabras: ["luz", "hidrandina", "enel", "seal", "electricidad", "electro"] },
  {
    clave: "internet",
    nombre: "Internet y celular",
    categoria: "servicios_basicos",
    palabras: ["internet", "celular", "recarga", "telefono", "wifi", "movistar", "claro", "entel", "bitel"],
  },
  { clave: "bano", nombre: "Baño", categoria: "servicios_basicos", palabras: ["bano", "sshh", "ss.hh", "servicio higienico", "servicios higienicos"] },
  {
    clave: "movilidad",
    nombre: "Movilidad",
    categoria: "transporte",
    palabras: ["movilidad", "mototaxi", "moto", "taxi", "colectivo", "pasaje", "combi", "carrera", "uber"],
  },
  { clave: "envio", nombre: "Envío", categoria: "transporte", palabras: ["envio", "encomienda", "olva", "shalom", "courier", "delivery", "agencia"] },
  { clave: "bolsas", nombre: "Bolsas", categoria: "suministros", palabras: ["bolsa", "empaque"] },
  {
    clave: "limpieza",
    nombre: "Limpieza",
    categoria: "suministros",
    palabras: ["limpieza", "lejia", "detergente", "trapeador", "escoba", "desinfectante", "ambientador", "papel higienico", "jabon"],
  },
  {
    clave: "utiles",
    nombre: "Útiles",
    categoria: "suministros",
    palabras: ["util", "cinta", "gancho", "papel", "rollo", "plumon", "lapicero", "pila", "grapa", "tijera", "goma"],
  },
  {
    clave: "arreglo",
    nombre: "Arreglo",
    categoria: "mantenimiento",
    palabras: ["arreglo", "reparacion", "tecnico", "cerrajero", "gasfitero", "electricista", "foco", "pintura", "mantenimiento"],
  },
];

export const conceptoPorClave = (clave: string): ConceptoGasto | null => CONCEPTOS.find((c) => c.clave === clave) ?? null;

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Dónde empieza `palabra` en `texto` como comienzo de una palabra («moto» en «mototaxi» sí; «luz» en «aluzado» no). -1 si no. */
function posicionDePalabra(texto: string, palabra: string): number {
  let desde = 0;
  while (desde <= texto.length) {
    const i = texto.indexOf(palabra, desde);
    if (i < 0) return -1;
    if (i === 0 || !/[a-z0-9]/.test(texto[i - 1])) return i;
    desde = i + 1;
  }
  return -1;
}

/**
 * El concepto de un gasto ya registrado, o «otro». Primero el comienzo de la descripción (lo que guarda esta pantalla:
 * «Baño — …»); si no, la palabra que aparece antes —a igual lugar, la más larga: «papel higiénico» es Limpieza, no Útiles—.
 * Solo cuenta un concepto de la MISMA categoría contable: «Agua de mesa» en Suministros no es el recibo del agua.
 */
export function conceptoDeGasto(g: { descripcion: string; categoria: string }): ClaveConcepto | typeof CLAVE_OTRO {
  const texto = normalizar(g.descripcion);
  const candidatos = CONCEPTOS.filter((c) => c.categoria === g.categoria);
  const porNombre = candidatos.find((c) => posicionDePalabra(texto, normalizar(c.nombre)) === 0);
  if (porNombre) return porNombre.clave;
  let mejor: { clave: ClaveConcepto; pos: number; largo: number } | null = null;
  for (const c of candidatos) {
    for (const p of c.palabras) {
      const pos = posicionDePalabra(texto, p);
      if (pos < 0) continue;
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && p.length > mejor.largo)) mejor = { clave: c.clave, pos, largo: p.length };
    }
  }
  return mejor?.clave ?? CLAVE_OTRO;
}

/** Cuántos montos habituales se ofrecen bajo «¿Cuánto?» para el concepto elegido. */
export const CUANTOS_MONTOS = 3;

export type ConceptoOrdenado = {
  concepto: ConceptoGasto;
  veces: number;
  frecuente: boolean;
  /** Los montos que más se pagaron por este concepto en la sede (hasta `CUANTOS_MONTOS`): siguen a lo elegido (ADR-0290). */
  montos: number[];
};

type GastoParaContar = { descripcion: string; categoria: string; montoTotal?: number };

/** Los montos más repetidos de una lista (a igual cantidad, el más chico primero). */
function montosHabituales(montos: readonly number[]): number[] {
  const veces = new Map<number, number>();
  for (const m of montos) if (m > 0) veces.set(m, (veces.get(m) ?? 0) + 1);
  return [...veces.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, CUANTOS_MONTOS)
    .map(([m]) => m);
}

/**
 * Los conceptos ordenados por cuántas veces se usaron (los gastos vigentes de la sede en los últimos `DIAS_FRECUENCIA` días),
 * desempatando por el orden de fábrica. La ★ va en los `CUANTOS_FRECUENTES` primeros que se usaron al menos una vez: una
 * sede nueva, sin gastos, ve el orden de fábrica y ninguna estrella (una ★ con «0 veces» sería mentira).
 */
export function ordenarPorFrecuencia(gastos: readonly GastoParaContar[]): {
  conceptos: ConceptoOrdenado[];
  vecesOtro: number;
} {
  const veces = new Map<string, number>();
  const montos = new Map<string, number[]>();
  for (const g of gastos) {
    const clave = conceptoDeGasto(g);
    veces.set(clave, (veces.get(clave) ?? 0) + 1);
    if (g.montoTotal !== undefined) montos.set(clave, [...(montos.get(clave) ?? []), g.montoTotal]);
  }
  const conceptos = CONCEPTOS.map((concepto, i) => ({ concepto, veces: veces.get(concepto.clave) ?? 0, i }))
    .sort((a, b) => b.veces - a.veces || a.i - b.i)
    .map(({ concepto, veces: n }, posicion) => ({
      concepto,
      veces: n,
      frecuente: n > 0 && posicion < CUANTOS_FRECUENTES,
      montos: montosHabituales(montos.get(concepto.clave) ?? []),
    }));
  return { conceptos, vecesOtro: veces.get(CLAVE_OTRO) ?? 0 };
}

export const textoVeces = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

// ---- El borrador ------------------------------------------------------------------------------------------------------------

export type ComprobanteRapido = Exclude<TipoComprobante, "sin_comprobante">;

export type EstadoGastoRapido = {
  /** Una clave de concepto, «otro», o "" si aún no se eligió. */
  concepto: string;
  /** Con «Otro»: qué fue (obligatorio) y a qué categoría contable se parece (obligatorio: la base no tiene «Otros»). */
  otroTexto: string;
  otroCategoria: string;
  monto: string;
  nota: string;
  /** Abrió «¿Te dieron factura o boleta?». */
  conComprobante: boolean;
  comprobante: ComprobanteRapido;
  proveedorId: string;
  /** Serie y número ya partidos (`partirSerieNumero`). */
  serie: string;
  numero: string;
};

export const GASTO_RAPIDO_VACIO: EstadoGastoRapido = {
  concepto: "",
  otroTexto: "",
  otroCategoria: "",
  monto: "",
  nota: "",
  conComprobante: false,
  comprobante: "boleta",
  proveedorId: "",
  serie: "",
  numero: "",
};

/** «Otro» necesita al menos esto para decir qué fue. */
export const MIN_OTRO = 3;

/** La descripción que se guarda: el nombre del concepto (o lo que escribió en «Otro») y la nota, si la hay. */
export function descripcionDe(e: Pick<EstadoGastoRapido, "concepto" | "otroTexto" | "nota">): string {
  const base = e.concepto === CLAVE_OTRO ? e.otroTexto.trim() : (conceptoPorClave(e.concepto)?.nombre ?? "");
  const nota = e.nota.trim();
  return nota ? `${base} — ${nota}` : base;
}

export function categoriaDe(e: Pick<EstadoGastoRapido, "concepto" | "otroCategoria">): string {
  return e.concepto === CLAVE_OTRO ? e.otroCategoria : (conceptoPorClave(e.concepto)?.categoria ?? "");
}

/** El borrador de Finanzas ▸ Gastos: sale del cajón abierto (`cajaId`), al contado, con fecha de hoy. */
export function borradorDeGastoRapido(e: EstadoGastoRapido, caja: { id: string; ubicacionId: string }, hoy: string): BorradorGasto {
  return {
    ubicacion: caja.ubicacionId,
    categoria: categoriaDe(e),
    descripcion: descripcionDe(e),
    fecha: hoy,
    monto: e.monto,
    comprobante: e.conComprobante ? e.comprobante : "sin_comprobante",
    proveedorId: e.conComprobante ? e.proveedorId : "",
    serie: e.conComprobante ? e.serie : "",
    numero: e.conComprobante ? e.numero : "",
    condicion: "contado",
    vence: "",
    medio: "efectivo",
    cajaId: caja.id,
    egresoId: "",
    referencia: "",
  };
}

/**
 * Lo que se teclea en el monto: solo dígitos y UN punto, con dos decimales a lo más. La coma se vuelve punto: en la tienda
 * «0,80» son ochenta céntimos, y `parsearMonto` (que lee la coma como separador de miles) lo tomaría por S/ 80.
 */
export function limpiarMonto(texto: string): string {
  const s = texto.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [entero, ...resto] = s.split(".");
  return resto.length ? `${entero}.${resto.join("").slice(0, 2)}` : entero;
}

const montoValido = (s: string) => parsearMonto(s).ok;

/**
 * Los campos de la guía de foco (ADR-0284), sacados de lo mismo que `validarGasto` bloquea; la prueba exige que coincidan.
 * El responsable lo suma la pantalla (lo sabe `useResponsable`).
 */
export function camposDeGastoRapido(e: EstadoGastoRapido): CampoDeGuia[] {
  const esOtro = e.concepto === CLAVE_OTRO;
  const campos: CampoDeGuia[] = [
    { id: "concepto", nombre: "En qué se gastó", requerido: true, hecho: e.concepto !== "", pendiente: "Toca en qué se gastó." },
  ];
  if (esOtro) {
    campos.push(
      { id: "otro-texto", nombre: "Qué fue", requerido: true, hecho: e.otroTexto.trim().length >= MIN_OTRO, pendiente: "Escribe qué fue." },
      { id: "otro-categoria", nombre: "A qué se parece", requerido: true, hecho: e.otroCategoria !== "", pendiente: "Elige a qué se parece." },
    );
  }
  campos.push({ id: "monto", nombre: "Cuánto", requerido: true, hecho: montoValido(e.monto), pendiente: "Escribe cuánto fue." });
  if (e.conComprobante) {
    campos.push(
      { id: "proveedor", nombre: "Proveedor", requerido: true, hecho: e.proveedorId !== "", pendiente: "Elige el proveedor." },
      {
        id: "documento",
        nombre: "Serie y número",
        requerido: true,
        hecho: e.serie.trim() !== "" && e.numero.trim() !== "",
        pendiente: "Escribe la serie y el número.",
      },
    );
  }
  campos.push({ id: "nota", nombre: "Nota", requerido: false, hecho: e.nota.trim() !== "", pendiente: "" });
  return campos;
}

/** Las categorías contables para «Otro»: cada una con sus ejemplos, que es lo que la persona reconoce. */
export function opcionesOtro(categorias: readonly CategoriaGasto[]) {
  return categorias.map((c) => ({ valor: c.codigo, texto: `${c.nombre} — ${c.ejemplos}` }));
}

/** «Servicios básicos», para la línea «Va a …» bajo el mosaico. */
export function nombreCategoria(categorias: readonly CategoriaGasto[], codigo: string): string | null {
  return categorias.find((c) => c.codigo === codigo)?.nombre ?? null;
}

/** El ejemplo de «Serie y número» sigue al tipo de comprobante elegido (ADR-0290): la serie empieza con su letra. */
export function ejemploSerie(tipo: ComprobanteRapido): string {
  return tipo === "factura" ? "F001-00140" : tipo === "boleta" ? "B001-00042" : "E001-00012";
}

export const TEXTO_COMPROBANTE_RAPIDO: Record<ComprobanteRapido, string> = {
  boleta: "Boleta",
  factura: "Factura",
  recibo_por_honorarios: "Recibo por honorarios",
};
