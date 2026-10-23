import type { FilaER } from "./resultados-reglas";

// Finanzas ▸ Resumen, «El recorrido de la plata» (El telar de Finanzas, elegido por Felipe el 2026-10-23). Lógica pura: a partir del
// Estado de resultados del mes (`fn_estado_resultados`, las mismas filas que ya trae `fn_resumen_finanzas`), arma los hilos que entran
// a un nudo y los que salen de él. La pieza que lo dibuja (`components/finanzas/RecorridoPlata.tsx`) no suma nada: solo dibuja esto.
//
// LA REGLA QUE NO SE ROMPE: lo que entra al nudo es igual a lo que sale (`total`). Si las partes nombradas no explican el resultado de
// la base (una devolución, una nota de crédito), la diferencia sale como «Otros ajustes», igual que en la cascada: un dibujo que no
// cuadra es peor que un hilo de más. Si el mes da pérdida, el hueco entra como un hilo «Te faltan» para que cuadre.
//
// Dos maneras de mirar:
//   - «vende» (CAYLA entera o una tienda): las tiendas entran a «Vendiste» y salen a prendas, gastos, diferencias de caja, Taller,
//     Empresa y «Te deja». Mirando una tienda, su parte del Taller y de la Empresa no se le carga (no se reparte, D-32).
//   - «sostiene» (el Taller o la Empresa): entra lo que deja cada tienda y sale lo que se lleva cada lugar que no vende; lo que se mira
//     va encendido y lo demás tenue.

/** Qué es cada hilo: decide su color en la pieza (la sede la pone `sedeId`; lo demás, un token fijo). */
export type TipoHilo = "tienda" | "sobrante" | "falta" | "prendas" | "gastos" | "caja" | "taller" | "empresa" | "pierde" | "ajustes" | "deja";

export type HiloRecorrido = {
  clave: string;
  nombre: string;
  /** Siempre en positivo: el grosor del hilo. */
  monto: number;
  tipo: TipoHilo;
  /** La sede del hilo (`"empresa"` para la empresa): tocarlo elige esa sede. */
  sedeId?: string;
  /** Lo que no se está mirando, en el modo «sostiene». */
  tenue?: boolean;
  detalle?: string;
};

export type Recorrido = {
  modo: "vende" | "sostiene";
  entradas: HiloRecorrido[];
  /** El nudo del medio. `monto` es lo que se lee en su etiqueta; `total` es su alto (lo que entra = lo que sale). */
  nudo: { nombre: string; monto: number; total: number };
  salidas: HiloRecorrido[];
  /** Lo que queda al final del recorrido (negativo = pérdida). */
  resultado: number;
  nota: string;
};

/** Lo que se mira: CAYLA entera, una tienda, el Taller o la empresa (`VerResumen` cumple esta forma). */
export type VerRecorrido = { todas: boolean; soloEmpresa: boolean; ubicacionId: string | null; tipo: string; nombre: string };

/** La cuenta de las diferencias de caja: se ve como su propio hilo, no escondida en los gastos (decisión de Felipe, 2026-10-23). */
const CUENTA_CAJA = "6599";
const r2 = (n: number) => Math.round(n * 100) / 100;
const corto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");
const suma = (xs: readonly number[]) => r2(xs.reduce((a, b) => a + b, 0));
/** Diferencias de caja de una fila: positivo = faltó plata (sale), negativo = sobró (entra). */
const caja = (f: FilaER) => suma(f.detalleGastos.filter((g) => g.cuenta === CUENTA_CAJA).map((g) => g.monto));
/** Lo que costaron las prendas: costo, fletes y mermas (lo que la cascada nombra por separado aquí va en un solo hilo). */
const prendas = (f: FilaER) => r2(f.costo + f.fletes + f.mermas);
const sinCeros = (hs: HiloRecorrido[]) => hs.filter((h) => h.monto >= 0.5);
const idDe = (f: FilaER) => (f.unidad === "empresa" ? "empresa" : (f.ubicacionId ?? f.unidad));

/**
 * Cierra el recorrido: agrega «Otros ajustes» si lo nombrado no explica el resultado de la base, y «Te deja» (sale) o «Te faltan»
 * (entra) con lo que queda. Devuelve las dos listas ya cuadradas.
 */
function cerrar(entradas: HiloRecorrido[], salidas: HiloRecorrido[], resultado: number, queda: { nombre: string; falta: string; tenue?: boolean }) {
  const explicado = r2(suma(entradas.map((h) => h.monto)) - suma(salidas.map((h) => h.monto)));
  const ajuste = r2(explicado - resultado);
  if (Math.abs(ajuste) >= 0.5)
    (ajuste > 0 ? salidas : entradas).push({ clave: "ajustes", nombre: "Otros ajustes", monto: Math.abs(ajuste), tipo: "ajustes", detalle: "Devoluciones, notas de crédito o correcciones del mes." });
  if (resultado >= 0.5) salidas.push({ clave: "deja", nombre: queda.nombre, monto: r2(resultado), tipo: "deja", tenue: queda.tenue });
  if (resultado <= -0.5) entradas.push({ clave: "falta", nombre: queda.falta, monto: r2(-resultado), tipo: "falta", detalle: "Lo que el mes no alcanzó a pagar con lo que vendió.", tenue: queda.tenue });
  return { entradas: sinCeros(entradas), salidas: sinCeros(salidas) };
}

/** El recorrido de la plata de lo que se mira, o `null` si no hay filas para dibujarlo. */
export function recorridoPlata(filas: readonly FilaER[], ver: VerRecorrido): Recorrido | null {
  const tiendas = filas.filter((f) => f.unidad === "tienda");
  if (ver.todas || ver.tipo === "tienda") {
    const mias = ver.todas ? tiendas : tiendas.filter((f) => f.ubicacionId === ver.ubicacionId);
    if (!mias.length) return null;
    const vendido = suma(mias.map((f) => f.ventas));
    const cajaNeta = suma(mias.map(caja));
    const entradas: HiloRecorrido[] = mias.map((f) => ({ clave: `tienda:${idDe(f)}`, nombre: corto(f.nombre), monto: r2(f.ventas), tipo: "tienda", sedeId: idDe(f) }));
    if (cajaNeta < 0) entradas.push({ clave: "sobrante", nombre: "Sobró en caja", monto: -cajaNeta, tipo: "sobrante", detalle: "Diferencias de caja a favor." });
    const salidas: HiloRecorrido[] = [
      { clave: "prendas", nombre: "Lo que costaron las prendas", monto: suma(mias.map(prendas)), tipo: "prendas" },
      { clave: "gastos", nombre: ver.todas ? "Gastos de las tiendas" : `Gastos de ${corto(ver.nombre)}`, monto: r2(suma(mias.map((f) => f.gastos)) - cajaNeta), tipo: "gastos", detalle: "Sueldos, alquiler, servicios y desgaste." },
    ];
    if (cajaNeta > 0) salidas.push({ clave: "caja", nombre: "Faltó en caja", monto: cajaNeta, tipo: "caja", detalle: "Diferencias de caja: faltantes de los cierres." });
    let resultado = suma(mias.map((f) => f.resultado));
    if (ver.todas) {
      for (const f of filas.filter((x) => x.unidad === "taller" || x.unidad === "empresa")) {
        // El Taller y la Empresa no venden: lo que cuestan es su resultado en negativo.
        const tipo: TipoHilo = f.unidad === "taller" ? "taller" : "empresa";
        salidas.push({ clave: tipo, nombre: tipo === "taller" ? "Taller" : "Empresa", monto: r2(Math.max(0, -f.resultado)), tipo, sedeId: idDe(f) });
      }
      resultado = r2(filas.find((f) => f.unidad === "consolidado")?.resultado ?? suma(filas.filter((f) => f.unidad !== "consolidado").map((f) => f.resultado)));
    }
    const c = cerrar(entradas, salidas, resultado, { nombre: "Te deja", falta: "Te faltan" });
    return {
      modo: "vende",
      entradas: c.entradas,
      nudo: { nombre: "Vendiste", monto: vendido, total: suma(c.entradas.map((h) => h.monto)) },
      salidas: c.salidas,
      resultado,
      nota: ver.todas
        ? "El Taller y la Empresa no venden: se pagan con lo que dejan las tiendas."
        : `Solo lo de ${corto(ver.nombre)}. Su parte del Taller y de la Empresa no se le carga.`,
    };
  }

  // El Taller o la Empresa: cómo se sostienen con lo que dejan las tiendas. Necesita las filas de TODAS las sedes: mirando el Taller,
  // `fn_resumen_finanzas` trae solo la del Taller, y sin las tiendas no hay de dónde sostenerlo (no se dibuja un recorrido a medias).
  const lugares = filas.filter((f) => f.unidad !== "consolidado");
  if (!lugares.some((f) => f.unidad === "tienda")) return null;
  const mirado = ver.soloEmpresa ? "empresa" : "taller";
  const entradas: HiloRecorrido[] = lugares
    .filter((f) => f.resultado > 0)
    .map((f) => ({ clave: `deja:${idDe(f)}`, nombre: `Deja ${corto(f.nombre)}`, monto: r2(f.resultado), tipo: "tienda", sedeId: idDe(f) }));
  const salidas: HiloRecorrido[] = lugares
    .filter((f) => f.resultado < 0)
    .map((f) => {
      const tipo: TipoHilo = f.unidad === "taller" ? "taller" : f.unidad === "empresa" ? "empresa" : "pierde";
      return {
        clave: `cuesta:${idDe(f)}`,
        nombre: tipo === "pierde" ? `Pierde ${corto(f.nombre)}` : tipo === "taller" ? "Taller" : "Empresa",
        monto: r2(-f.resultado),
        tipo,
        sedeId: idDe(f),
        tenue: f.unidad !== mirado,
      };
    });
  const resultado = r2(filas.find((f) => f.unidad === "consolidado")?.resultado ?? suma(lugares.map((f) => f.resultado)));
  const c = cerrar(entradas, salidas, resultado, { nombre: "Te queda", falta: "Te faltan", tenue: true });
  const total = suma(c.entradas.map((h) => h.monto));
  const quien = mirado === "taller" ? "El Taller" : "La Empresa";
  return {
    modo: "sostiene",
    entradas: c.entradas,
    nudo: { nombre: "Lo que dejan las tiendas", monto: suma(entradas.filter((h) => h.tipo === "tienda").map((h) => h.monto)), total },
    salidas: c.salidas,
    resultado,
    nota: `${quien} no vende: se sostiene con lo que dejan las tiendas. Aquí ves cuánto se lleva.`,
  };
}

/** El porcentaje de un hilo sobre lo que pasa por el nudo, redondeado (0 si el nudo está vacío). */
export function pctDelNudo(h: HiloRecorrido, r: Recorrido): number {
  return r.nudo.total > 0 ? Math.round((h.monto / r.nudo.total) * 100) : 0;
}
