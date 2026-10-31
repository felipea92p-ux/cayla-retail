// El tramo de una cascada (camino A de las maquetas finanzas-v2-2026-10, Felipe 2026-10-15): lo arman ¿Ganamos?, la plata y los pulsos de
// Finanzas. La respuesta y la cascada del Pulso de Reportes se retiraron el 2026-10-31: Estados financieros dibuja la cascada de su maqueta
// (`lib/cascada-estados-reglas.ts`, ADR-0585), y su prueba de ADR-0453 pasó a `ganamos-reglas.test.ts`.

/** `negativo`: solo en «queda», cuando el resultado es una pérdida (`monto` va siempre en positivo; el color sale de aquí). */
export type TramoCascada = {
  clave: string;
  nombre: string;
  monto: number;
  tipo: "entra" | "sale" | "queda";
  detalle?: string;
  negativo?: boolean;
  /** Lo planeado para este tramo (el tope del presupuesto, en positivo): la cascada dibuja su raya sobre la barra (ADR-0585). */
  plan?: number;
  /** Cuánto se pasa (o queda bajo) de lo planeado, como fracción: desde ±10 % la cascada lo dice con su píldora. */
  desvio?: number;
  /** Las cuentas del tramo, con lo real y lo planeado: el tramo se abre para verlas. */
  lineas?: { nombre: string; real: number; plan: number | null }[];
  /** El tramo lleva a otra pantalla (Lo que dejó cada sede: la sede). */
  href?: string;
};


