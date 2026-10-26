import { soles } from "./flujo-caja-reglas";
import { conceptosER, mesNombre, type FilaER } from "./resultados-reglas";
import { filaDeVer, type ResumenFinanzas } from "./resumen-finanzas-reglas";

// Finanzas ▸ Resumen, «Lo que más se movió desde el mes pasado» (Felipe 2026-10-24, spike 2). Lógica pura: pone lado a lado el Estado de
// resultados de este mes y el MISMO tramo del mes pasado (del 1 al mismo día; nunca un mes entero contra uno a medias), rubro por rubro, y dice
// cuánto movió cada uno el resultado. No calcula plata: usa los mismos conceptos del Estado de resultados (`conceptosER`).
//
// UNA CUENTA QUE CUADRA. El efecto de cada rubro es la diferencia de su valor con el signo con que se muestra en el Estado de resultados (lo que
// suma, en positivo; lo que resta, en negativo), así que la suma de los efectos es la diferencia de lo que te deja el mes. Lo que no cabe en
// la lista (los rubros más chicos) se junta en una sola fila, para que la lista siempre sume lo que dice la frase de arriba.

/** Cuántos rubros se nombran; lo demás se junta en «Otros». */
export const RUBROS_VISIBLES = 5;

export type CambioRubro = {
  clave: string;
  nombre: string;
  antes: number;
  ahora: number;
  /** Cuánto movió ESTE rubro lo que te deja el mes: positivo ayuda, negativo resta. */
  efecto: number;
  /** Cuánto cambió el rubro mismo, en %, sobre lo que era (`null` si antes era 0). */
  pct: number | null;
};

export type CambiosMes =
  | { tipo: "sin_comparacion"; motivo: string }
  | {
      tipo: "ok";
      contra: string;
      resultadoAhora: number;
      resultadoAntes: number;
      /** Lo que te deja este mes menos lo que te dejaba el mes pasado a esta fecha. */
      dif: number;
      filas: CambioRubro[];
      /** El efecto más grande, en valor absoluto: la barra más larga. */
      tope: number;
      titular: string;
      /** Lo que explica el cambio, en una frase de tienda; `null` si no hay nada que decir. */
      veredicto: string | null;
    };

const r2 = (n: number) => Math.round(n * 100) / 100;
const pctDe = (cambio: number, base: number) => (Math.abs(base) < 0.5 ? null : Math.round((cambio / Math.abs(base)) * 100));
const num = (n: number) => Math.abs(n).toLocaleString("es-PE");

export function cambiosDelMes(o: {
  r: ResumenFinanzas;
  /** El Estado de resultados de este mes (a hoy) y del tramo con que se compara; `null` si el segundo no se pudo leer. */
  ahora: readonly FilaER[];
  antes: readonly FilaER[] | null;
  enCurso: boolean;
}): CambiosMes {
  const { r, ahora, antes, enCurso } = o;
  if (!antes) return { tipo: "sin_comparacion", motivo: "No se pudo leer el mes pasado para compararlo. Vuelve a cargar la página en un rato." };
  const fa = filaDeVer(ahora, r.ver);
  const fb = filaDeVer(antes, r.ver);
  if (!fa || !fb) return { tipo: "sin_comparacion", motivo: "El mes pasado no tuvo movimientos de lo que miras para compararlos." };

  const contra = enCurso ? `${mesNombre(r.mesAnterior)} a esta fecha` : mesNombre(r.mesAnterior);
  const conceptos = conceptosER([fa, fb]).filter((c) => c.tipo === "linea");
  const todos: CambioRubro[] = conceptos.map((c) => {
    const a = r2(c.valor(fa));
    const b = r2(c.valor(fb));
    return { clave: c.clave, nombre: c.nombre, antes: Math.abs(b), ahora: Math.abs(a), efecto: r2(a - b), pct: pctDe(Math.abs(a) - Math.abs(b), b) };
  });
  const dif = r2(fa.resultado - fb.resultado);
  // Lo que los rubros no explican (redondeos, una cuenta que no se nombra) entra como una fila, para que la lista cuadre.
  const sumaRubros = r2(todos.reduce((s, x) => s + x.efecto, 0));
  const sinNombre = r2(dif - sumaRubros);
  if (Math.abs(sinNombre) >= 1) todos.push({ clave: "otros-ajustes", nombre: "Otros ajustes", antes: 0, ahora: 0, efecto: sinNombre, pct: null });

  const movidos = todos.filter((x) => Math.abs(x.efecto) >= 0.5).sort((x, y) => Math.abs(y.efecto) - Math.abs(x.efecto));
  let filas = movidos;
  if (movidos.length > RUBROS_VISIBLES + 1) {
    const resto = movidos.slice(RUBROS_VISIBLES);
    filas = [
      ...movidos.slice(0, RUBROS_VISIBLES),
      { clave: "otros", nombre: `Otros ${resto.length} rubros`, antes: 0, ahora: 0, efecto: r2(resto.reduce((s, x) => s + x.efecto, 0)), pct: null },
    ];
  }

  const vende = r.ver.todas || r.ver.tipo === "tienda";
  const titular =
    Math.abs(dif) < 1
      ? `${vende ? "Te deja" : "Cuesta"} lo mismo que en ${contra}.`
      : vende
        ? `Te deja ${soles(Math.abs(dif))} ${dif > 0 ? "más" : "menos"} que en ${contra}.`
        : `Cuesta ${soles(Math.abs(dif))} ${dif < 0 ? "más" : "menos"} que en ${contra}.`;

  return {
    tipo: "ok",
    contra,
    resultadoAhora: r2(fa.resultado),
    resultadoAntes: r2(fb.resultado),
    dif,
    filas,
    tope: Math.max(1, ...filas.map((x) => Math.abs(x.efecto))),
    titular,
    veredicto: vende ? veredictoDeVentas(fa, fb, dif) : null,
  };
}

/**
 * Qué explica el cambio, en lenguaje de tienda: si cambió lo que se vende o lo que deja cada prenda. Solo habla cuando el cambio es claro
 * (ventas movidas 5 % o más); si no, calla antes que decir algo que no sabe.
 */
function veredictoDeVentas(fa: FilaER, fb: FilaER, dif: number): string | null {
  if (fa.ventas <= 0 || fb.ventas <= 0) return null;
  const ventasPct = Math.round(((fa.ventas - fb.ventas) / fb.ventas) * 100);
  const margenAhora = Math.round((fa.margen / fa.ventas) * 100);
  const margenAntes = Math.round((fb.margen / fb.ventas) * 100);
  if (Math.abs(margenAhora - margenAntes) >= 2)
    return `Cada prenda te deja ${margenAhora > margenAntes ? "más" : "menos"}: de cada S/ 100 vendidos, ${num(margenAhora)} son margen (antes, ${num(margenAntes)}).`;
  if (Math.abs(ventasPct) < 5) return null;
  const sube = ventasPct > 0;
  if (dif > 0 && sube) return `Ganas más porque vendes más (+${num(ventasPct)} %), no porque ganes más por prenda: el margen sigue en ${num(margenAhora)} %.`;
  if (dif < 0 && !sube) return `Ganas menos porque vendes menos (−${num(ventasPct)} %), no porque cada prenda deje menos: el margen sigue en ${num(margenAhora)} %.`;
  return null;
}
