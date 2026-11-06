// Cuánto de lo vendido lleva un costo ESTIMADO (tarea 28 de «Las 36 de Finanzas»; contrato en 20261015233000_costo_estimado_venta_sin_prenda.sql).
//
// EL PROBLEMA: «Ganaste S/ X» se dibujaba igual con el costo real que con el promedio de la categoría de una prenda sin registrar. En octubre
// el 38 % de lo vendido llevaba costo estimado y la pantalla no lo decía, aunque el medidor de confianza sí lo sabía.
//
// PROMETE: de la fila de `fn_costo_estimado_resumen` arma una nota corta («El 38 % de lo vendido lleva costo estimado») y su tono, o nada si
//   todo lleva costo real. ASUME: toda cifra viene de la base; aquí no se calcula plata, solo un porcentaje de lo que ya sumó.
// DECIDÍ: el porcentaje es de la VENTA (no de las unidades), el mismo que usa el medidor, para que las dos pantallas digan lo mismo.

type Fila = Record<string, unknown>;

export type CostoEstimado = {
  unidadesEstimadas: number;
  ventaEstimada: number;
  unidadesSinCosto: number;
  ventaSinCosto: number;
  ventaTotal: number;
};

export type NotaCostoEstimado = { texto: string; detalle: string; tono: "ambar" | "rojo"; href: string };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function leerCostoEstimado(f: Fila): CostoEstimado {
  return {
    unidadesEstimadas: num(f.unidades_estimadas),
    ventaEstimada: num(f.venta_estimada),
    unidadesSinCosto: num(f.unidades_sin_costo),
    ventaSinCosto: num(f.venta_sin_costo),
    ventaTotal: num(f.venta_total),
  };
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** `null` cuando todo lleva costo real (o no hubo ventas): no hay nada que avisar. */
export function notaCostoEstimado(c: CostoEstimado | null): NotaCostoEstimado | null {
  if (!c || c.ventaTotal <= 0) return null;
  const pctEst = Math.round((Math.min(c.ventaEstimada, c.ventaTotal) / c.ventaTotal) * 100);
  const pctSin = Math.round((Math.min(c.ventaSinCosto, c.ventaTotal) / c.ventaTotal) * 100);
  // Un porcentaje que redondea a 0 con unidades sí cuenta como «menos de 1 %», para no esconder un estimado chico.
  const hayEst = c.unidadesEstimadas > 0;
  const haySin = c.unidadesSinCosto > 0;
  if (!hayEst && !haySin) return null;
  const partes: string[] = [];
  if (hayEst) partes.push(`${pctEst < 1 ? "menos del 1" : pctEst} % de lo vendido lleva costo estimado (${c.unidadesEstimadas} ${plural(c.unidadesEstimadas, "prenda sin registrar", "prendas sin registrar")})`);
  if (haySin) partes.push(`${pctSin < 1 ? "menos del 1" : pctSin} % no tiene costo (${c.unidadesSinCosto} ${plural(c.unidadesSinCosto, "prenda", "prendas")})`);
  const texto = partes.join(" y ");
  return {
    texto: texto.charAt(0).toUpperCase() + texto.slice(1),
    detalle: "La ganancia es una estimación hasta que cada prenda se registre con su costo real.",
    tono: haySin ? "rojo" : "ambar",
    href: "/inventario/por-regularizar",
  };
}
