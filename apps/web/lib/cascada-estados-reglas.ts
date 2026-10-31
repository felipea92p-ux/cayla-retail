// Estados financieros ▸ la cascada de la maqueta aprobada (ADR-0585, `docs/maquetas/finanzas-eeff-2026-10/`, función `cascada`).
//
// PROMETE: la geometría de una cascada de verdad: cada paso empieza donde terminó el anterior (la barra «flota»), los totales y
// subtotales nacen en cero, y todo se dibuja a una sola escala, de la cifra más baja a la más alta que toque cualquier barra (con el
// cero marcado si hay negativos). También pasa los tramos que ya arman ¿Ganamos?, la plata y lo tuyo (`TramoCascada`) a filas con
// signo, e inserta el subtotal del margen.
// ASUME: las cifras vienen de la base; aquí solo se ubican. Sin estado y sin red: lo dibuja `components/finanzas/estados/CascadaEstados.tsx`.

import type { TramoCascada } from "./pulso-reglas";

export type TipoFila = "total" | "subtotal" | "paso" | "final";

export type FilaCascada = {
  clave: string;
  nombre: string;
  /** La línea chica bajo el nombre («Meta: S/ 52,000 · 93 %»). */
  detalle?: string;
  /** Con su signo: lo que suma es positivo, lo que resta, negativo. Un total o el final, su cifra tal cual. */
  valor: number;
  tipo: TipoFila;
  /** Lo planeado (positivo, como un gasto): la raya sobre la barra. */
  plan?: number;
  desvio?: number;
  lineas?: TramoCascada["lineas"];
  href?: string;
  /** Color de dato de la barra (la sede: `var(--color-sede-tru)`). */
  color?: string;
};

export type GeometriaFila = {
  /** Izquierda y ancho de la barra, en % de la pista. */
  izq: number;
  ancho: number;
  /** Dónde va la raya de lo planeado (en %), si hay. */
  plan: number | null;
  /** Cómo se pinta: suma (verde), resta (ámbar), total (tinta), subtotal (arena), pierde (rojo), sede (su color). */
  clase: "suma" | "resta" | "total" | "subtotal" | "pierde" | "sede";
};

/** El ancho mínimo de una barra (en %), para que un monto chico se vea. */
const ANCHO_MINIMO = 0.6;

export function geometriaCascada(filas: readonly FilaCascada[]): { filas: GeometriaFila[]; eje: number | null } {
  let corriente = 0;
  const tramos = filas.map((f) => {
    const nace = f.tipo === "paso" ? corriente : 0;
    const termina = f.tipo === "paso" ? corriente + f.valor : f.valor;
    corriente = termina;
    // La raya de lo planeado: donde terminaría el paso si se gastara justo lo planeado.
    const plan = f.plan !== undefined && f.tipo === "paso" ? nace - f.plan : null;
    return { f, nace, termina, plan };
  });
  const puntos = [0, ...tramos.flatMap((t) => [t.nace, t.termina, ...(t.plan === null ? [] : [t.plan])])];
  const bajo = Math.min(...puntos);
  const alto = Math.max(...puntos);
  const rango = alto - bajo || 1;
  const x = (v: number) => ((v - bajo) / rango) * 100;
  return {
    eje: bajo < 0 ? x(0) : null,
    filas: tramos.map(({ f, nace, termina, plan }) => ({
      izq: Math.min(x(nace), x(termina)),
      ancho: Math.max(Math.abs(x(termina) - x(nace)), ANCHO_MINIMO),
      plan: plan === null ? null : x(plan),
      clase: f.color
        ? "sede"
        : f.tipo === "total"
          ? "total"
          : f.tipo === "subtotal"
            ? "subtotal"
            : f.tipo === "final"
              ? f.valor < 0
                ? "pierde"
                : "total"
              : f.valor < 0
                ? "resta"
                : "suma",
    })),
  };
}

/**
 * Los tramos de siempre (monto positivo con «entra / sale / queda») como filas con signo. El primer tramo es el total del que se parte;
 * el «queda», el final. `subtotal`, si viene, se inserta después del tramo `tras` con la suma de todo lo anterior (el margen).
 */
export function filasDeTramos(tramos: readonly TramoCascada[], subtotal?: { tras: string; clave: string; nombre: string; detalle?: (valor: number) => string }): FilaCascada[] {
  const filas: FilaCascada[] = [];
  let corriente = 0;
  tramos.forEach((t, i) => {
    const valor = t.tipo === "queda" ? (t.negativo ? -t.monto : t.monto) : t.tipo === "sale" ? -t.monto : t.negativo ? -t.monto : t.monto;
    const tipo: TipoFila = t.tipo === "queda" ? "final" : i === 0 ? "total" : "paso";
    corriente = tipo === "paso" ? corriente + valor : valor;
    filas.push({
      clave: t.clave,
      nombre: t.nombre,
      valor,
      tipo,
      ...(t.detalle ? { detalle: t.detalle } : {}),
      ...(t.plan !== undefined ? { plan: t.plan } : {}),
      ...(t.desvio !== undefined ? { desvio: t.desvio } : {}),
      ...(t.lineas?.length ? { lineas: t.lineas } : {}),
      ...(t.href ? { href: t.href } : {}),
    });
    if (subtotal && t.clave === subtotal.tras) {
      const valorSub = Math.round(corriente * 100) / 100;
      filas.push({ clave: subtotal.clave, nombre: subtotal.nombre, valor: valorSub, tipo: "subtotal", ...(subtotal.detalle ? { detalle: subtotal.detalle(valorSub) } : {}) });
    }
  });
  return filas;
}
