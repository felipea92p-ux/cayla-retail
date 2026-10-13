/**
 * El login «El vuelo» (Felipe 2026-10-13, ADR-0136 act. 2026-10-13; maqueta: docs/maquetas/login-2026-10/, `?v=C2`).
 *
 * El colibrí sale de la primera sede (Trujillo), cose las otras dos con un hilo punteado, da la vuelta y sube hasta su lugar.
 * Aquí vive solo la geometría y el texto (lógica pura, con su prueba); el componente `components/login/PanelVuelo.tsx`
 * mide la pantalla, mueve el ave y dibuja el hilo.
 */

export type Punto = { x: number; y: number };

/** Lo que el componente mide del panel: su tamaño, el centro de cada ojal (una sede) y dónde queda la cola del ave al llegar. */
export type MedidasDelVuelo = { ancho: number; alto: number; sedes: Punto[]; destino: Punto };

/** La cola del colibrí en el dibujo de `IsotipoCayla` (punto 47,146 del lienzo de 223×150): ahí se ata el hilo. */
export const COLA_DEL_AVE = { x: 47 / 223, y: 146 / 150 };

/** Lo que dura el vuelo, en milisegundos: se ve completo sin hacer esperar a quien ya sabe su clave (puede escribir mientras). */
export const DURACION_DEL_VUELO = 3000;

/**
 * El recorrido, como un `d` de SVG en las medidas del panel. Va en línea recta por las sedes (de la primera a la última y un
 * poco más), sube en una vuelta, cruza el panel en diagonal por detrás del lema y entra al destino desde abajo a la izquierda.
 * Las proporciones salen de la maqueta (un panel de 756×900); el principio y el final son siempre los puntos medidos.
 */
export function trazoDelVuelo({ ancho: W, alto: H, sedes, destino: P }: MedidasDelVuelo): string {
  const primera = sedes[0];
  const ultima = sedes[sedes.length - 1];
  const y = primera.y;
  const fin = ultima.x + W * 0.17;
  const n = (v: number) => Math.round(v * 10) / 10;
  return [
    `M${n(primera.x)},${n(y)}`,
    `L${n(fin)},${n(y)}`,
    `C${n(ultima.x + W * 0.28)},${n(y)} ${n(ultima.x + W * 0.27)},${n(y - H * 0.09)} ${n(fin)},${n(y - H * 0.13)}`,
    `C${n(W * 0.5)},${n(y - H * 0.23)} ${n(W * 0.2)},${n(H * 0.62)} ${n(W * 0.22)},${n(H * 0.48)}`,
    `C${n(W * 0.24)},${n(H * 0.36)} ${n(P.x - W * 0.12)},${n(P.y + H * 0.07)} ${n(P.x)},${n(P.y)}`,
  ].join(" ");
}

/** El ritmo del vuelo: arranca y llega suave, sin pasarse ni rebotar (ADR-0136). `u` y el resultado van de 0 a 1. */
export function ritmoDelVuelo(u: number): number {
  const v = Math.min(1, Math.max(0, u));
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
}

/**
 * Cómo mira el ave en cada momento. `giro` va de -1 (mira a la izquierda) a 1 (a la derecha) y `inclinacion` en grados;
 * los dos se acercan poco a poco a su objetivo para que el ave se voltee y se incline sin saltos. Al llegar (`t` = 1) queda
 * derecha, como en la marca.
 */
export function poseDelAve(
  previa: { giro: number; inclinacion: number },
  rumbo: { dx: number; dy: number },
  t: number,
): { giro: number; inclinacion: number } {
  const hacia = rumbo.dx < -0.2 ? -1 : 1;
  const giro = previa.giro + (hacia - previa.giro) * 0.14;
  const angulo = (Math.atan2(rumbo.dy, Math.abs(rumbo.dx) + 0.001) * 180) / Math.PI;
  const objetivo = t >= 1 ? 0 : Math.max(-22, Math.min(22, angulo)) * (1 - t * t);
  const inclinacion = previa.inclinacion + (objetivo - previa.inclinacion) * 0.12;
  return { giro, inclinacion };
}

/** El tamaño del ave mientras vuela: sale chiquita de la sede y llega con su tamaño. */
export const escalaDelAve = (t: number) => 0.3 + 0.7 * Math.min(1, Math.max(0, t));

const ZONA = "America/Lima";

/** «Buenos días · lunes 13 de octubre», con la hora de Perú (no la del aparato, que puede estar mal configurado). */
export function saludoDelDia(ahora: Date): string {
  const hora = Number(new Intl.DateTimeFormat("es-PE", { hour: "numeric", hourCycle: "h23", timeZone: ZONA }).format(ahora));
  const saludo = hora >= 5 && hora < 12 ? "Buenos días" : hora >= 12 && hora < 19 ? "Buenas tardes" : "Buenas noches";
  const fecha = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).format(ahora);
  return `${saludo} · ${fecha.replace(",", "")}`;
}
