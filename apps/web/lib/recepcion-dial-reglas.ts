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

/**
 * ¿Elegir este modelo en la lista deja su número abierto para escribir? (tarea 4 de las 30 de Recibir, 2026-11-14). Lo que se pidió abrir a propósito (`pidio`: «empezar por el
 * primero»), sí. Lo que todavía no se contó, sí, pero solo con mouse: con el dedo, abrir el número levanta el teclado del aparato y tapa la pantalla. Lo ya contado, no: se eligió
 * para mirarlo o repartir sus tallas.
 */
export const abreAlElegir = ({ pidio, contada, conMouse }: { pidio: boolean; contada: boolean; conMouse: boolean }): boolean => pidio || (!contada && conMouse);

/**
 * El Dial recibe cada pedido de abrir su número con un número propio, siempre distinto del anterior (0 = ninguno). Un pedido es nuevo si no es el que ya vio: así elegir otra vez el
 * MISMO modelo, el que ya estaba en el contador, vuelve a abrir su número aunque se haya cerrado con Escape o con un clic fuera, siempre que siga sin contar y se use el mouse
 * (`abreAlElegir`): con una cifra a medio escribir, tocar su propia fila ya no saca el cursor de la caja (`conservaLaCifra`), y el pedido no la vuelve a seleccionar. Antes se pedía con la llave del
 * modelo, y pedir dos veces lo mismo no cambiaba nada: el cursor se quedaba en la fila y lo tecleado se perdía sin aviso.
 */
export const esPedidoNuevo = (visto: number, pedido: number): boolean => pedido > 0 && pedido !== visto;

/**
 * ¿El toque en la fila de la lista se queda sin el cursor, para que la caja del número lo conserve? (Felipe 2026-11-14). Con «4» a medio escribir, tocar la fila del MISMO
 * modelo le quitaba el cursor a la caja: se guardaba 4 y el «7» que seguía no entraba en ningún lado. Solo la fila del modelo que se cuenta (`filaActiva`), con el número
 * abierto y el botón principal del mouse: la fila de otro modelo, el ✓, el basurero, el teclado y el lector de pantalla siguen igual, y salir de la caja guarda.
 */
export const conservaLaCifra = ({ filaActiva, numeroAbierto, botonPrincipal }: { filaActiva: boolean; numeroAbierto: boolean; botonPrincipal: boolean }): boolean =>
  filaActiva && numeroAbierto && botonPrincipal;
