// Los puntos de avance de Nuevo producto (Felipe, 2026-10-06; ADR-0260, actualización del 2026-10-06): arriba del formulario,
// un punto por pregunta unido por una línea que se llena hasta donde está la persona. Reemplazan a los números 1–4 de cada paso,
// a las tarjetas plegadas de los pasos que no están abiertos y a la lista «Avance» de la ficha: eran tres marcadores para lo mismo.
//
// Lógica pura: el formulario calcula el estado de cada paso como siempre (`estadoPaso`, `pasoAbrible`) y aquí solo se traduce a
// lo que se dibuja. No agrega reglas: qué está hecho y qué se puede abrir lo sigue diciendo `lib/alta-producto.ts`.

export type EstadoPaso = "abierto" | "hecho" | "pendiente";

/** Lo que el formulario sabe de cada paso, en su orden. */
export type PasoDeAvance = {
  numero: number;
  estado: EstadoPaso;
  /** Se puede abrir (los anteriores están contestados). */
  abrible: boolean;
};

/** hecho = ✓ · aqui = el paso abierto (late) · sigue = el primero por hacer después del abierto · falta = los demás. */
export type TipoPunto = "hecho" | "aqui" | "sigue" | "falta";

export type Punto = {
  numero: number;
  tipo: TipoPunto;
  /** Lo que dice bajo el nombre: «Listo», «Estás aquí», «Sigue», «Por revisar» o nada. */
  rotulo: string;
  /** Un toque lleva a ese paso: los hechos y los que vienen armados («Por revisar»), nunca el que ya está abierto. */
  tocable: boolean;
  /** Dónde va el punto en la línea, de 0 (izquierda) a 1 (derecha). */
  posicion: number;
};

export type Avance = {
  puntos: Punto[];
  /** Hasta dónde llega la línea llena, de 0 a 1: el punto abierto, o el final si ya no hay ninguno abierto. */
  lleno: number;
};

export function puntosDeAvance(pasos: readonly PasoDeAvance[]): Avance {
  const n = pasos.length;
  const posicion = (i: number) => (n <= 1 ? 0 : i / (n - 1));
  const iAbierto = pasos.findIndex((p) => p.estado === "abierto");
  // «Sigue» es el primer paso que falta DESPUÉS del abierto; sin abierto, el primero que falta.
  const iSigue = pasos.findIndex((p, i) => p.estado === "pendiente" && i > iAbierto);

  const puntos = pasos.map((p, i): Punto => {
    if (p.estado === "abierto") return { numero: p.numero, tipo: "aqui", rotulo: "Estás aquí", tocable: false, posicion: posicion(i) };
    if (p.estado === "hecho") return { numero: p.numero, tipo: "hecho", rotulo: "Listo", tocable: true, posicion: posicion(i) };
    if (i === iSigue) return { numero: p.numero, tipo: "sigue", rotulo: "Sigue", tocable: p.abrible, posicion: posicion(i) };
    // Un paso que viene armado («Crear otro parecido») y la persona todavía no abrió: se puede abrir, pero no está confirmado.
    return { numero: p.numero, tipo: "falta", rotulo: p.abrible ? "Por revisar" : "", tocable: p.abrible, posicion: posicion(i) };
  });

  const lleno = iAbierto >= 0 ? posicion(iAbierto) : pasos.every((p) => p.estado === "hecho") ? 1 : 0;
  return { puntos, lleno };
}
