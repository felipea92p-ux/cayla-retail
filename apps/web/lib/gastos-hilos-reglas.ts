// Gastos · «En qué se va» como hilos (Felipe 2026-10-30, maqueta `docs/maquetas/gastos-grafico-2026-10/`, reemplaza al retazo de ADR-0493):
// cada categoría es una fila con su hilo partido por sede, cuánto cambió contra el mes anterior y su línea de los últimos meses; al tocarla
// se abre su desglose, gasto por gasto, con las sedes en columna. Lógica pura, probada en `gastos-hilos-reglas.test.ts`: lo del mes que se
// mira sale de `fn_gastos_lista` (los gastos, uno por uno) y lo de antes, de `fn_gastos_panel` (lo sumado por categoría); aquí no se lee nada.
import { SEDE_EMPRESA, type ClaveSede, type ColorSede, type SedeTelar } from "./finanzas-telar-reglas";
import { solesRedondo } from "./gastos-reglas";
import type { TonoChip } from "@/components/ui/Chip";

type GastoParaHilos = {
  id: string;
  categoria: string;
  categoriaNombre: string;
  ubicacionId: string | null;
  montoTotal: number;
  estado: "vigente" | "anulado";
  fecha: string;
  descripcion: string;
  proveedorNombre: string | null;
};

/**
 * Un mes de antes, como lo suma `fn_gastos_panel`. `null` = no se pudo leer o es anterior al inicio de Finanzas: contra ese mes no se
 * compara (decir «nuevo» o «subió» contra un mes que no se registró sería mentir).
 */
export type MesPrevio = { mes: string; porCategoria: readonly { categoria: string; monto: number }[] } | null;

/** Lo que puso una sede en la categoría: `n` gastos que suman `monto`, el `pct` % de la categoría. */
/** Cuántos meses de antes lee la página: la línea de cada fila tiene, como mucho, estos más el que se mira. */
export const MESES_DE_ANTES = 5;

/** Los meses de antes de `mes` («2026-10»), del más viejo al anterior: `["2026-05", …, "2026-09"]`. */
export function mesesDeAntes(mes: string, n = MESES_DE_ANTES): string[] {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - n + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * ¿Se compara contra este mes? No si empieza antes del inicio de Finanzas (ADR-0332): lo de antes no se registró, y un «subió» contra ese
 * mes vacío sería falso; tampoco se pide a la base. `inicioFinanzas` es un día 1 («2026-10-01») o `null` si no hay corte.
 */
export const seCompara = (mes: string, inicioFinanzas: string | null) => !inicioFinanzas || `${mes}-01` >= inicioFinanzas;

/**
 * Un mes de antes, listo para comparar; `null` si no se pidió (antes del inicio), no se pudo leer o no tiene ni un gasto: una tienda
 * abierta siempre paga algo, así que un mes en cero es un mes que no se registró (sin corte, septiembre de 2026 era eso), no uno barato.
 */
export function mesPrevio(mes: string, panel: { porCategoria: readonly { categoria: string; monto: number }[] } | null): MesPrevio {
  if (!panel || !panel.porCategoria.some((c) => c.monto > 0)) return null;
  return { mes, porCategoria: panel.porCategoria.map((c) => ({ categoria: c.categoria, monto: c.monto })) };
}

/**
 * El mes anterior A LA MISMA ALTURA (Felipe 2026-10-30, el cambio 1 de /formidable): en el mes en curso, lo gastado hasta hoy se compara con lo
 * que ese mes llevaba al mismo día (el 10 contra el 10), nunca con el mes entero (a mitad de mes todo parecería «▼»). `gastos` son los del mes
 * anterior, uno por uno; `dia` es el de hoy (si el mes anterior es más corto, hasta su último día). `null` si no se leyó o si a esa altura
 * no había gastado nada: comparar contra cero diría «nuevo» a todo.
 */
export function mesAEstaAltura(gastos: readonly Pick<GastoParaHilos, "fecha" | "categoria" | "montoTotal" | "estado">[] | null, dia: number): MesPrevio {
  const vigentes = (gastos ?? []).filter((g) => g.estado === "vigente" && g.montoTotal > 0);
  if (vigentes.length === 0) return null;
  const mes = vigentes[0]!.fecha.slice(0, 7);
  const tope = `${mes}-${String(Math.max(1, dia)).padStart(2, "0")}`;
  const por = new Map<string, number>();
  for (const g of vigentes) if (g.fecha.slice(0, 7) === mes && g.fecha <= tope) por.set(g.categoria, (por.get(g.categoria) ?? 0) + g.montoTotal);
  return mesPrevio(mes, { porCategoria: [...por.entries()].map(([categoria, monto]) => ({ categoria, monto })) });
}

export type TramoHilo ={ clave: ClaveSede; nombre: string; color: ColorSede; monto: number; n: number; pct: number };

/** Contra el mes anterior: `igual` si se movió menos del 2 %; `nuevo` si ese mes no tuvo nada en la categoría. */
export type CambioHilo = { tipo: "sube" | "baja" | "igual" | "nuevo"; pct: number };

export type FilaHilo = {
  categoria: string;
  nombre: string;
  total: number;
  /** Parte de lo gastado en el mes, redondeada. */
  pct: number;
  /** Cuántos gastos (vigentes) hay en la categoría. */
  n: number;
  /** El hilo: lo que puso cada sede, en el orden del telar, solo las que gastaron. */
  tramos: TramoHilo[];
  /** Lo del mes anterior; `null` si ese mes no se puede comparar. */
  anterior: number | null;
  cambio: CambioHilo | null;
  /** Los meses seguidos que se pueden leer, del más viejo a este; `null` si son menos de tres (dos puntos no son una tendencia). */
  historia: number[] | null;
};

const MOVIMIENTO_MINIMO = 0.02;

function cambioContra(actual: number, antes: number): CambioHilo {
  if (antes <= 0) return { tipo: "nuevo", pct: 0 };
  const d = (actual - antes) / antes;
  if (Math.abs(d) < MOVIMIENTO_MINIMO) return { tipo: "igual", pct: 0 };
  return { tipo: d > 0 ? "sube" : "baja", pct: Math.round(Math.abs(d) * 100) };
}

const montoEn = (previo: NonNullable<MesPrevio>, categoria: string) => previo.porCategoria.find((c) => c.categoria === categoria)?.monto ?? 0;

/** El tramo de una sede que no está en la barra del telar (no debería pasar): la empresa con su color, otra cualquiera como «Otra sede». */
function sedeSuelta(clave: ClaveSede): Pick<TramoHilo, "nombre" | "color"> {
  return clave === SEDE_EMPRESA ? { nombre: "Empresa", color: "emp" } : { nombre: "Otra sede", color: "otra" };
}

/**
 * Las filas del gráfico: una por categoría con lo vigente del mes (un anulado no cuenta), de la que más gastó a la que menos. `previos`
 * son los meses de antes (enteros), del más viejo al anterior a este: hacen la línea de meses. Contra qué se compara: `contra` (en el mes
 * en curso, el anterior a la misma altura, `mesAEstaAltura`); sin él, el último de `previos`. Con `enCurso`, la línea de meses llega hasta
 * el anterior: el mes a medias sería un punto que siempre baja.
 */
export function hilosDeGastos(
  gastos: readonly GastoParaHilos[],
  sedes: readonly SedeTelar[],
  previos: readonly MesPrevio[],
  opciones: { contra?: MesPrevio; enCurso?: boolean } = {},
): FilaHilo[] {
  const por = new Map<string, { nombre: string; total: number; n: number; porSede: Map<ClaveSede, { monto: number; n: number }> }>();
  let total = 0;
  for (const g of gastos) {
    if (g.estado !== "vigente" || g.montoTotal <= 0) continue;
    const c = por.get(g.categoria) ?? { nombre: g.categoriaNombre, total: 0, n: 0, porSede: new Map() };
    const k = g.ubicacionId ?? SEDE_EMPRESA;
    const s = c.porSede.get(k) ?? { monto: 0, n: 0 };
    c.total += g.montoTotal;
    c.n += 1;
    c.porSede.set(k, { monto: s.monto + g.montoTotal, n: s.n + 1 });
    por.set(g.categoria, c);
    total += g.montoTotal;
  }
  const orden = new Map(sedes.map((s, i) => [s.clave, i]));
  const anteriorMes = opciones.contra !== undefined ? opciones.contra : (previos.at(-1) ?? null);
  // Los meses que se pueden leer seguidos hasta este: un hueco corta la línea (no se dibuja un cero que no fue).
  const seguidos: NonNullable<MesPrevio>[] = [];
  for (let i = previos.length - 1; i >= 0 && previos[i]; i--) seguidos.unshift(previos[i]!);

  return [...por.entries()]
    .map(([categoria, c]) => {
      const tramos = [...c.porSede.entries()]
        .map(([clave, { monto, n }]) => {
          const s = sedes.find((x) => x.clave === clave);
          return { clave, ...(s ? { nombre: s.nombre, color: s.color } : sedeSuelta(clave)), monto, n, pct: Math.round((monto / c.total) * 100) };
        })
        .sort((a, b) => (orden.get(a.clave) ?? 99) - (orden.get(b.clave) ?? 99) || a.nombre.localeCompare(b.nombre, "es"));
      const anterior = anteriorMes ? montoEn(anteriorMes, categoria) : null;
      const historia = opciones.enCurso
        ? seguidos.length >= 3
          ? seguidos.map((m) => montoEn(m, categoria))
          : null
        : seguidos.length >= 2
          ? [...seguidos.map((m) => montoEn(m, categoria)), c.total]
          : null;
      return {
        categoria,
        nombre: c.nombre,
        total: c.total,
        pct: total > 0 ? Math.round((c.total / total) * 100) : 0,
        n: c.n,
        tramos,
        anterior,
        cambio: anterior === null ? null : cambioContra(c.total, anterior),
        historia,
      };
    })
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
}

/** La píldora de cada fila: «▲ 29 %» en ámbar (se gastó más), «▼ 5 %» en verde (se gastó menos), «igual» o «nuevo» en pizarra. */
export function etiquetaCambio(c: CambioHilo): { texto: string; tono: TonoChip } {
  if (c.tipo === "sube") return { texto: `▲ ${c.pct} %`, tono: "ambar" };
  if (c.tipo === "baja") return { texto: `▼ ${c.pct} %`, tono: "verde" };
  return { texto: c.tipo === "igual" ? "igual" : "nuevo", tono: "pizarra" };
}

/**
 * Junto al título: contra el mes anterior, qué categoría subió más y cuál bajó más. Solo cuentan las que pesan (4 % del mes o más: que una
 * categoría de S/ 30 pase a S/ 60 no es la noticia) y las que ese mes ya existían, y la frase lo dice («entre lo que más pesa»: sin eso, una
 * «▲ 75 %» chica a la vista la contradecía, /formidable 2026-10-30). Con `aEstaAltura`, en el mes en curso, lo dice también. `null` si no
 * hay contra qué comparar o nada se movió.
 */
export function fraseDeLosHilos(filas: readonly FilaHilo[], nombreMesAnterior: string, aEstaAltura = false): string | null {
  const total = filas.reduce((a, f) => a + f.total, 0);
  const cand = filas.filter((f) => f.anterior !== null && f.anterior > 0 && f.total >= total * 0.04).map((f) => ({ f, d: (f.total - f.anterior!) / f.anterior! }));
  if (cand.length === 0) return null;
  const sube = cand.reduce((a, c) => (c.d > a.d ? c : a));
  const baja = cand.reduce((a, c) => (c.d < a.d ? c : a));
  // El número y su «%» van pegados (espacio duro): a 1024 px la frase se partía y dejaba «%)» solo en la línea de abajo.
  const partes = [
    sube.d > MOVIMIENTO_MINIMO ? `lo que más subió fue ${sube.f.nombre.toLowerCase()} (+${Math.round(sube.d * 100)}\u00a0%)` : null,
    baja.d < -MOVIMIENTO_MINIMO ? `lo que más bajó, ${baja.f.nombre.toLowerCase()} (−${Math.round(-baja.d * 100)}\u00a0%)` : null,
  ].filter((p): p is string => !!p);
  return partes.length ? `Contra ${nombreMesAnterior}${aEstaAltura ? " a esta altura" : ""}, entre lo que más pesa, ${partes.join("; ")}.` : null;
}

/**
 * El chip de la cifra grande: el mes contra el anterior; en el mes en curso (`aEstaAltura`), contra lo que el anterior llevaba al mismo día,
 * y lo dice. `null` si ese mes no se puede comparar o no tuvo gastos.
 */
export function chipDelMesAnterior(totalDelMes: number, anterior: MesPrevio, nombreMesAnterior: string, aEstaAltura = false): { texto: string; tono: TonoChip } | null {
  if (!anterior) return null;
  const c = cambioContra(totalDelMes, anterior.porCategoria.reduce((a, x) => a + x.monto, 0));
  const contra = `${nombreMesAnterior}${aEstaAltura ? " a esta altura" : ""}`;
  if (c.tipo === "nuevo") return null;
  if (c.tipo === "igual") return { texto: `Igual que ${contra}`, tono: "pizarra" };
  return { texto: `${c.tipo === "sube" ? "▲" : "▼"} ${c.pct} % vs ${contra}`, tono: c.tipo === "sube" ? "ambar" : "verde" };
}

/** Bajo el nombre de la categoría: «22 % de lo gastado»; una que redondea a cero, «menos de 1 %» (un «0 %» se leía como que no gastó nada). */
export const parteDeLoGastado = (fila: Pick<FilaHilo, "pct" | "total">) => (fila.pct === 0 && fila.total > 0 ? "menos de 1 % de lo gastado" : `${fila.pct} % de lo gastado`);

// ---- El desglose: lo que se gastó exactamente en una categoría ----------------------------------------------------------------

export type GastoDelDesglose = { id: string; fecha: string; descripcion: string; proveedorNombre: string | null; clave: ClaveSede; monto: number };

/** Los gastos de una categoría (de una sede, si se eligió), del más grande al más chico; a igual monto, el más reciente primero. */
export function desgloseDe(gastos: readonly GastoParaHilos[], categoria: string, sede: ClaveSede | null): GastoDelDesglose[] {
  return gastos
    .filter((g) => g.estado === "vigente" && g.montoTotal > 0 && g.categoria === categoria && (sede === null || (g.ubicacionId ?? SEDE_EMPRESA) === sede))
    .map((g) => ({ id: g.id, fecha: g.fecha, descripcion: g.descripcion, proveedorNombre: g.proveedorNombre, clave: g.ubicacionId ?? SEDE_EMPRESA, monto: g.montoTotal }))
    .sort((a, b) => b.monto - a.monto || b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
}

/**
 * La línea sobre la lista, en dos partes (la primera va en negrita): «7 gastos» + « en 4 sedes · S/ 2,092»; con una sede elegida,
 * «En Lima» + «: 3 gastos · S/ 880 · el 42 % de esta categoría»; si todo es de una sola, «Todo en Empresa» + «: 1 gasto · S/ 160».
 */
export function resumenDelDesglose(fila: FilaHilo, sede: ClaveSede | null): { fuerte: string; resto: string } {
  const unidades = (n: number) => `${n} ${n === 1 ? "gasto" : "gastos"}`;
  if (sede !== null && fila.tramos.length > 1) {
    const t = fila.tramos.find((x) => x.clave === sede) ?? { nombre: "esta sede", n: 0, monto: 0, pct: 0 };
    return { fuerte: `En ${t.nombre}`, resto: `: ${unidades(t.n)} · ${solesRedondo(t.monto)} · el ${t.pct} % de esta categoría` };
  }
  if (fila.tramos.length === 1) return { fuerte: `Todo en ${fila.tramos[0]!.nombre}`, resto: `: ${unidades(fila.n)} · ${solesRedondo(fila.total)}` };
  return { fuerte: unidades(fila.n), resto: ` en ${fila.tramos.length} sedes · ${solesRedondo(fila.total)}` };
}
