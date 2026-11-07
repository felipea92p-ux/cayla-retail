// El Dial de Recibir (rediseño «B», Felipe 2026-10-29, docs/maquetas/recibir-b-2026-10): el aro de una categoría se llena con lo contado
// contra lo que dijeron. Aquí solo se decide qué dibuja; el número lo sigue escribiendo la persona y lo guarda `ContarEnvio` como siempre.
// Faltar no es un error (se explica al cerrar): el aro se queda en tinta; cuadrar lo pinta de verde y pasarse suma un arco ámbar por fuera.

/** Con más segmentos que estos, los cortes del aro se pegan y ya no se leen: el aro va liso. */
export const MAX_CORTES = 40;

export type EstadoDial = {
  /** Cuánto del aro está lleno, de 0 a 100. */
  lleno: number;
  /** El arco de fuera: cuánto se pasó de lo que dijeron, de 0 a 100 (100 = el doble o más). */
  exceso: number;
  tono: "cuadra" | "sobra" | "neutro";
  /** La frase corta bajo el número («faltan 2 de 4»). */
  texto: string;
  /** Un corte por prenda esperada (0 = aro liso). */
  cortes: number;
  /** Hacia dónde mira la perilla, en grados desde arriba. */
  angulo: number;
};

const miles = (n: number): string => n.toLocaleString("es-PE");

/**
 * Los dos atajos de suma, a la escala de lo que se cuenta: de 5 en 5 para 40 prendas, pero nadie llega a 12.000 de 5 en 5. Sin lo que dijeron (sin
 * aviso), la escala la da lo que ya se lleva contado.
 */
export function atajosDelDial(dijeron: number | null, contadas: number): readonly [number, number] {
  const escala = dijeron ?? contadas;
  if (escala >= 5000) return [100, 500];
  if (escala >= 1000) return [50, 100];
  if (escala >= 200) return [10, 50];
  return [5, 10];
}

/** Qué dibuja el aro con lo contado (`hayConteo`: alguien ya escribió un número, aunque sea 0) y lo que dijeron (`null` = sin aviso). */
export function estadoDelDial(contadas: number, dijeron: number | null, hayConteo: boolean): EstadoDial {
  const n = Math.max(0, contadas);
  if (dijeron == null || dijeron <= 0) {
    const lleno = n > 0 ? 100 : 0;
    return { lleno, exceso: 0, tono: "neutro", texto: hayConteo ? (n === 1 ? "contada" : "contadas") : "por contar", cortes: 0, angulo: lleno * 3.6 };
  }
  const lleno = (Math.min(n, dijeron) / dijeron) * 100;
  const exceso = Math.min(100, (Math.max(0, n - dijeron) / dijeron) * 100);
  const cortes = dijeron <= MAX_CORTES ? dijeron : 0;
  const base = { lleno, exceso, cortes, angulo: lleno * 3.6 };
  if (!hayConteo) return { ...base, tono: "neutro", texto: `dijeron ${miles(dijeron)}` };
  const d = n - dijeron;
  if (d === 0) return { ...base, tono: "cuadra", texto: `cuadra · ${miles(dijeron)}` };
  return d < 0 ? { ...base, tono: "neutro", texto: `faltan ${miles(-d)} de ${miles(dijeron)}` } : { ...base, tono: "sobra", texto: `sobran ${miles(d)}` };
}
