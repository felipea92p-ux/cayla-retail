/**
 * «Color de la tienda» (Plan del piso ▸ Propuesta; Felipe, 2026-10-12; ADR-0352, actualización 2026-10-12): de qué FAMILIAS de color (Neutro, Tierra, Rosado… las mismas
 * de Atributos ▸ Colores) es lo que cuelga hoy, y si lo que cuelga se parece a lo que se vende. Sirve para que una tienda no quede cargada de un solo tono.
 *
 * LO QUE ESTA PIEZA DECIDE (y por qué):
 *  1. Mismos datos que el riel, ninguno nuevo. Las prendas colgadas y las ventas salen de `LecturaDelPiso.tallas` y `.ventas` (`fn_piso_plan_lectura`), ya filtradas a los
 *     grupos del riel por quien llama (`armarPropuesta`): la franja cuenta EXACTAMENTE las prendas del riel (una prueba lo exige). Sin migración ni RPC.
 *  2. Las más relevantes, por el MAYOR de dos porcentajes: lo que cuelga o lo que vende. Ordenar solo por lo que cuelga esconde en «Otras» a la familia que más pide
 *     lugar (en TRU, Amarillo cuelga 2 % y vende 5 %: la señal más clara de la tienda). Se muestran `MAX_FAMILIAS`; el resto se junta en «Otras» y se puede abrir.
 *  3. UNA MARCA SOLO CON EVIDENCIA. Esperado = ventas totales × la parte que cuelga de la familia. La marca sale si lo vendido se aparta de lo esperado más de lo que el azar
 *     explica (residuo de Poisson |z| ≥ `Z_MINIMO`), por al menos `DIFERENCIA_MINIMA` prendas, y la tienda tiene `MINIMO_DE_VENTAS` ventas o más. Es RELATIVA: se compara con
 *     lo que la propia tienda vende, nunca con un corte fijo (la misma lógica de Frescura). Equilibrada, o con pocas ventas, no lleva marca: no opina sin evidencia.
 *  4. La varianza no baja de `VARIANZA_MINIMA` (2). Con casi nada esperado, 3 ventas no son raras (con λ = 1,5 pasa 1 de cada 5 veces): sin ese piso, cualquier color
 *     con 2 colgadas saldría marcado al vender 3. Se midió con datos de TRU del 2026-10-12: «Gris» (2 colgadas, 3 vendidas) salía como señal sin serlo.
 *  5. Por familia cuentan las ventas confirmadas Y las «sin registrar» (lo que ya usa «Tus ventas»: en AQP 169 de 170 ventas son anotadas, y sin ellas la franja jamás
 *     tendría evidencia). Por COLOR solo las confirmadas (`vendidas14` de la talla): una anotada puede no traer el color exacto. El desglose lo dice.
 *  6. La familia esconde al color: Tierra puede verse equilibrada (33 % contra 31 %) mientras Arena cuelga 31 y vende 3. Por eso cada color se juzga contra lo que cuelga en
 *     TODA la tienda, y la familia avisa «N colores a mirar» (`aMirar`).
 *
 * NO HACE: no decide qué comprar ni qué bajar, no toca el riel ni la propuesta, y «Cómo quedaría» no elige colores (ADR-0352 act. 2026-10-11 (c)).
 * LÓGICA PURA: sin red ni React. El hex es DATO de la prenda, no color de la interfaz (ADR-0169).
 */
import { estiloMosaicoColor } from "./color-prenda-reglas";
import { textoDeFamilia } from "./colores-familias";
import { cifraEs, pctEs } from "./mix-piso-visual";
import type { TallaEnSede, VentaPorAtributo } from "./piso-plan";

/** Cuántas familias se dibujan; el resto se junta en «Otras» (Felipe, 2026-10-12). */
export const MAX_FAMILIAS = 6;
/** Con menos ventas que estas en total (en la ventana de 14 días) la franja no opina: solo dice lo que cuelga. */
export const MINIMO_DE_VENTAS = 30;
/** El residuo de Poisson (diferencia ÷ raíz de lo esperado) a partir del cual la diferencia ya no la explica el azar. */
export const Z_MINIMO = 2;
/** Cuántas prendas de diferencia hacen falta, además del residuo: dos prendas de más no son una señal aunque el azar casi no las explique. */
export const DIFERENCIA_MINIMA = 3;
/** El piso de la varianza (ver el punto 4 de arriba). */
export const VARIANZA_MINIMA = 2;
/** La clave de lo que no tiene familia (Estampado, Multicolor, un color sin familia asignada). */
export const SIN_FAMILIA = "sin-familia";
/** El gris con que se pinta la familia Neutro: su color que más cuelga suele ser el Negro, que sobre el papel oscuro se pierde (Felipe, 2026-10-12). Es un color de DATO. */
export const HEX_DE_NEUTRO = "#8b8d90"; // tema-fijo: color de dato de la familia Neutro, igual en claro y en oscuro

export type Veredicto = "falta" | "sobra";

/** Un color dentro de su familia: lo que cuelga y lo que se vendió confirmado en la ventana. */
export type ColorDeLaFamilia = {
  clave: string;
  nombre: string;
  /** `#rrggbb` de la prenda; `null` si no es un color (Estampado, Multicolor). */
  hex: string | null;
  colgadas: number;
  /** Ventas confirmadas (escaneadas) de ESTE color: las «sin registrar» no traen el color exacto. */
  confirmadas: number;
  /** «falta» = vende más de lo que cuelga; «sobra» = cuelga más de lo que vende; `null` = dentro de lo esperado o sin evidencia. */
  veredicto: Veredicto | null;
  /** No cuelga nada y se vende (el «Se acabó y se vende»): solo con `veredicto === "falta"`. */
  agotado: boolean;
};

export type FamiliaDeColor = {
  clave: string;
  nombre: string;
  /** El color con que se pinta su tramo; `null` si ningún color suyo trae hex (queda un gris de la interfaz). */
  hex: string | null;
  colgadas: number;
  /** % de lo que cuelga en el riel. */
  pctColgadas: number;
  confirmadas: number;
  anotadas: number;
  vendidas: number;
  /** % de lo vendido en la ventana; `null` si no hubo ventas. */
  pctVendidas: number | null;
  /** Lo que se esperaría vender si vendiera en la misma proporción que cuelga. */
  esperadas: number;
  veredicto: Veredicto | null;
  /** Primero los que se venden y faltan, luego los que cuelgan y no salen, luego el resto del que más cuelga al que menos. */
  colores: ColorDeLaFamilia[];
  /** Cuántos de sus colores traen veredicto: el aviso «N colores a mirar». */
  aMirar: number;
};

/** Lo que no cupo en las `MAX_FAMILIAS`: se dibuja como UN tramo y se abre en sus familias. */
export type OtrasFamilias = {
  colgadas: number;
  pctColgadas: number;
  pctVendidas: number | null;
  aMirar: number;
  familias: FamiliaDeColor[];
};

export type LecturaDelColor = {
  /** «sin-ventas» (pocas para opinar), «parejo» (nada se aparta) o «aparte» (alguna familia se aparta). */
  tipo: "sin-ventas" | "parejo" | "aparte";
  frase: string;
  /** Las familias que se apartan, de la que más vende a la que menos (vacío salvo en «aparte»). */
  familias: string[];
};

export type ColorDeLaTienda = {
  /** Lo que cuelga en el riel: la MISMA cifra que `colgadasEnElRiel`. */
  colgadas: number;
  confirmadas: number;
  anotadas: number;
  vendidas: number;
  /** ¿Hay ventas suficientes para marcar una FAMILIA? */
  hayVentas: boolean;
  /** ¿Hay ventas confirmadas suficientes para marcar un COLOR? Por color solo cuentan las confirmadas. */
  hayDetalleDeColor: boolean;
  /** Las confirmadas por color (suma de `ColorDeLaFamilia.confirmadas`): con ellas se juzga cada color. */
  confirmadasPorColor: number;
  /** Todas las familias, de la más a la menos relevante. */
  familias: FamiliaDeColor[];
  visibles: FamiliaDeColor[];
  otras: OtrasFamilias | null;
  lectura: LecturaDelColor;
};

export type TallaParaColor = Pick<TallaEnSede, "colorCodigo" | "color" | "colorHex" | "familiaColor" | "pisoLibre" | "vendidas14">;
export type VentaParaColor = Pick<VentaPorAtributo, "familiaColor" | "escaneadas" | "anotadas">;

const cuenta = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);
const redondear = (x: number, decimales = 1): number => Math.round(x * 10 ** decimales) / 10 ** decimales;

/**
 * ¿Lo vendido se aparta de lo esperado más de lo que el azar explica? `totalVentas` es el total de la tienda en la misma cuenta que `vendidas`.
 * «falta» si se vende de más para lo que cuelga; «sobra» si se vende de menos; `null` si no hay evidencia o está dentro de lo esperado.
 */
export function veredictoDeReparto(e: { vendidas: number; esperadas: number; totalVentas: number }): Veredicto | null {
  // Lo que no es una cuenta (NaN, infinito, negativo) no se lee como un cero: sin dato no hay marca.
  if (![e.vendidas, e.esperadas, e.totalVentas].every((x) => Number.isFinite(x) && x >= 0)) return null;
  if (e.totalVentas < MINIMO_DE_VENTAS) return null;
  const diferencia = e.vendidas - e.esperadas;
  const z = diferencia / Math.sqrt(Math.max(e.esperadas, VARIANZA_MINIMA));
  if (Math.abs(z) < Z_MINIMO || Math.abs(diferencia) < DIFERENCIA_MINIMA) return null;
  return diferencia > 0 ? "falta" : "sobra";
}

type AcumuladoDeColor = { clave: string; nombre: string; hex: string | null; colgadas: number; confirmadas: number };
type AcumuladoDeFamilia = { clave: string; colgadas: number; confirmadas: number; anotadas: number; colores: Map<string, AcumuladoDeColor> };

/** La clave de una familia: la de la base, o `SIN_FAMILIA`. */
export const claveDeFamilia = (familia: string | null | undefined): string => (familia ?? "").trim() || SIN_FAMILIA;

/**
 * Arma la franja. `tallas` y `ventas` son los de la lectura, ya filtrados a lo que cuenta el riel: así la franja suma lo que el riel. Devuelve `null` si no cuelga nada
 * (no hay qué repartir: la pantalla ya dice que no cuelga nada).
 */
export function armarColorDeLaTienda(e: { tallas: readonly TallaParaColor[]; ventas: readonly VentaParaColor[] }): ColorDeLaTienda | null {
  const familias = new Map<string, AcumuladoDeFamilia>();
  const de = (clave: string): AcumuladoDeFamilia => {
    let f = familias.get(clave);
    if (!f) familias.set(clave, (f = { clave, colgadas: 0, confirmadas: 0, anotadas: 0, colores: new Map() }));
    return f;
  };

  let colgadas = 0;
  for (const t of e.tallas) {
    const col = cuenta(t.pisoLibre);
    const conf = cuenta(t.vendidas14);
    if (col === 0 && conf === 0) continue;
    const f = de(claveDeFamilia(t.familiaColor));
    const nombre = (t.color ?? "").trim();
    const clave = (t.colorCodigo ?? "").trim() || nombre.toLowerCase() || "sin-color";
    const hex = estiloMosaicoColor(t.colorHex)?.fondo ?? null;
    const previo = f.colores.get(clave);
    if (previo) {
      previo.colgadas += col;
      previo.confirmadas += conf;
      if (previo.hex === null && hex !== null) previo.hex = hex;
    } else f.colores.set(clave, { clave, nombre: nombre || "Sin color", hex, colgadas: col, confirmadas: conf });
    f.colgadas += col;
    colgadas += col;
  }
  if (!(colgadas > 0)) return null;

  // Las ventas por familia: confirmadas y «sin registrar». La fuente es `ventas` (categoría × talla × familia), no la suma de los colores: una talla sin fila en la lectura no la pierde.
  let confirmadas = 0;
  let anotadas = 0;
  for (const v of e.ventas) {
    const conf = cuenta(v.escaneadas);
    const anot = cuenta(v.anotadas);
    if (conf === 0 && anot === 0) continue;
    const f = de(claveDeFamilia(v.familiaColor));
    f.confirmadas += conf;
    f.anotadas += anot;
    confirmadas += conf;
    anotadas += anot;
  }
  const vendidas = confirmadas + anotadas;
  const confirmadasPorColor = [...familias.values()].reduce((s, f) => s + [...f.colores.values()].reduce((a, c) => a + c.confirmadas, 0), 0);

  const lista: FamiliaDeColor[] = [...familias.values()]
    .filter((f) => f.colgadas > 0 || f.confirmadas > 0 || f.anotadas > 0)
    .map((f) => {
      const esperadas = (vendidas * f.colgadas) / colgadas;
      const veredicto = veredictoDeReparto({ vendidas: f.confirmadas + f.anotadas, esperadas, totalVentas: vendidas });
      const colores: ColorDeLaFamilia[] = [...f.colores.values()]
        .filter((c) => c.colgadas > 0 || c.confirmadas > 0)
        .map((c) => {
          const veredictoColor = veredictoDeReparto({ vendidas: c.confirmadas, esperadas: (confirmadasPorColor * c.colgadas) / colgadas, totalVentas: confirmadasPorColor });
          return { clave: c.clave, nombre: c.nombre, hex: c.hex, colgadas: c.colgadas, confirmadas: c.confirmadas, veredicto: veredictoColor, agotado: veredictoColor === "falta" && c.colgadas === 0 };
        })
        .sort((a, b) => rango(a.veredicto) - rango(b.veredicto) || b.colgadas - a.colgadas || b.confirmadas - a.confirmadas || a.nombre.localeCompare(b.nombre, "es") || a.clave.localeCompare(b.clave));
      const masColgado = [...f.colores.values()].filter((c) => c.hex !== null && c.colgadas > 0).sort((a, b) => b.colgadas - a.colgadas || a.clave.localeCompare(b.clave))[0];
      const total = f.confirmadas + f.anotadas;
      return {
        clave: f.clave,
        nombre: textoDeFamilia(f.clave === SIN_FAMILIA ? null : f.clave),
        hex: f.clave === "neutro" ? HEX_DE_NEUTRO : (masColgado?.hex ?? null),
        colgadas: f.colgadas,
        pctColgadas: redondear((f.colgadas / colgadas) * 100),
        confirmadas: f.confirmadas,
        anotadas: f.anotadas,
        vendidas: total,
        pctVendidas: vendidas > 0 ? redondear((total / vendidas) * 100) : null,
        esperadas: redondear(esperadas),
        veredicto,
        colores,
        aMirar: colores.filter((c) => c.veredicto !== null).length,
      };
    })
    // Las más relevantes primero: por el MAYOR de lo que cuelga o lo que vende (punto 2); a igual, el que más cuelga, y por clave para que el orden no dependa de cómo llegó la lectura.
    .sort((a, b) => relevancia(b) - relevancia(a) || b.colgadas - a.colgadas || a.clave.localeCompare(b.clave));

  const visibles = lista.slice(0, MAX_FAMILIAS);
  const resto = lista.slice(MAX_FAMILIAS);
  const otras: OtrasFamilias | null =
    resto.length === 0
      ? null
      : {
          colgadas: resto.reduce((s, f) => s + f.colgadas, 0),
          pctColgadas: redondear(resto.reduce((s, f) => s + f.pctColgadas, 0)),
          pctVendidas: vendidas > 0 ? redondear(resto.reduce((s, f) => s + f.vendidas, 0) / vendidas * 100) : null,
          aMirar: resto.reduce((s, f) => s + f.aMirar, 0),
          familias: resto,
        };

  return {
    colgadas,
    confirmadas,
    anotadas,
    vendidas,
    hayVentas: vendidas >= MINIMO_DE_VENTAS,
    hayDetalleDeColor: confirmadasPorColor >= MINIMO_DE_VENTAS,
    confirmadasPorColor,
    familias: lista,
    visibles,
    otras,
    lectura: lecturaDelColor({ familias: lista, vendidas }),
  };
}

const rango = (v: Veredicto | null): number => (v === "falta" ? 0 : v === "sobra" ? 1 : 2);
const relevancia = (f: FamiliaDeColor): number => Math.max(f.pctColgadas, f.pctVendidas ?? 0);

/** Cuántas familias que se apartan nombra la frase con su cifra; el resto es un conteo (una frase de cinco excepciones ya no se lee en 5 segundos). */
export const MAX_NOMBRADAS = 2;

/**
 * La frase de la franja: el veredicto de la tienda en palabras de tienda. Con pocas ventas dice que no opina; sin familias que se aparten, que lo que cuelga se parece a lo
 * que se vende; y si alguna se aparta, la nombra con las dos cifras («vende 5 % y cuelga 2 %»).
 */
export function lecturaDelColor(e: { familias: readonly FamiliaDeColor[]; vendidas: number }): LecturaDelColor {
  if (!(e.vendidas >= MINIMO_DE_VENTAS)) {
    return { tipo: "sin-ventas", frase: `Todavía hay pocas ventas para opinar (${cifraEs(e.vendidas)} en 14 días): esto es solo lo que cuelga.`, familias: [] };
  }
  const aparte = e.familias.filter((f) => f.veredicto !== null).sort((a, b) => (b.pctVendidas ?? 0) - (a.pctVendidas ?? 0) || a.clave.localeCompare(b.clave));
  if (aparte.length === 0) return { tipo: "parejo", frase: "Lo que cuelga se parece a lo que vendes.", familias: [] };
  const nombradas = aparte.slice(0, MAX_NOMBRADAS).map((f) => (f.veredicto === "falta" ? `${f.nombre} (vende ${pctEs(f.pctVendidas ?? 0)} y cuelga ${pctEs(f.pctColgadas)})` : `${f.nombre} (cuelga ${pctEs(f.pctColgadas)} y vende ${pctEs(f.pctVendidas ?? 0)})`));
  const mas = aparte.length - nombradas.length;
  const cola = mas > 0 ? `${nombradas.join(", ")} y ${mas} ${mas === 1 ? "familia más" : "familias más"}` : nombradas.join(" y ");
  return { tipo: "aparte", frase: `Dentro de lo esperado, salvo ${cola}.`, familias: aparte.map((f) => f.nombre) };
}

/** La marca de una familia (o de un color), en palabras de tienda. */
export const palabraDeMarca = (v: Veredicto): string => (v === "falta" ? "Le falta lugar" : "Cuelga de más");
/** La marca de un COLOR: el que no cuelga nada y se vende lo dice distinto. */
export const palabraDeMarcaDeColor = (c: Pick<ColorDeLaFamilia, "veredicto" | "agotado">): string | null =>
  c.veredicto === null ? null : c.agotado ? "Se acabó y se vende" : c.veredicto === "falta" ? "Se vende y falta" : "Cuelga y no sale";

/** «4 colores a mirar», «1 color a mirar»; vacío si no hay ninguno. */
export const textoDeAMirar = (aMirar: number): string => (aMirar > 0 ? `${cifraEs(aMirar)} ${aMirar === 1 ? "color a mirar" : "colores a mirar"}` : "");

/** La cifra de ventas de una familia en una línea: «124 ventas: 84 confirmadas y 40 sin registrar» (la parte de «sin registrar» solo si la hay). */
export function textoDeVentasDeFamilia(f: Pick<FamiliaDeColor, "vendidas" | "confirmadas" | "anotadas">): string {
  const ventas = `${cifraEs(f.vendidas)} ${f.vendidas === 1 ? "venta" : "ventas"}`;
  if (f.anotadas <= 0) return ventas;
  return `${ventas}: ${cifraEs(f.confirmadas)} ${f.confirmadas === 1 ? "confirmada" : "confirmadas"} y ${cifraEs(f.anotadas)} sin registrar`;
}

/**
 * La nota al pie de la franja: de dónde salen las ventas y qué se puede (y qué no) ver por color. Dice la verdad según los datos: con pocas ventas, que no opina; con casi
 * todo «sin registrar» (AQP), que por familia sí hay marca pero por color todavía no.
 */
export function notaDelColor(e: Pick<ColorDeLaTienda, "hayVentas" | "hayDetalleDeColor" | "vendidas" | "confirmadas" | "anotadas">, dias: number): string {
  if (!e.hayVentas) return `Con ${cifraEs(MINIMO_DE_VENTAS)} ventas o más en ${cifraEs(dias)} días, la franja marca lo que se aparta de lo que vendes.`;
  const detalle = e.anotadas > 0 ? ` (${cifraEs(e.confirmadas)} ${e.confirmadas === 1 ? "confirmada" : "confirmadas"} y ${cifraEs(e.anotadas)} sin registrar)` : "";
  const base = `Las marcas comparan lo que cuelga con tus ${cifraEs(e.vendidas)} ${e.vendidas === 1 ? "venta" : "ventas"} de ${cifraEs(dias)} días${detalle}.`;
  return e.hayDetalleDeColor
    ? `${base} Por color solo se cuentan las confirmadas.`
    : `${base} Casi no hay ventas confirmadas: por color todavía no se puede ver qué sale. Registra las ventas anotadas para verlo.`;
}
