// El movimiento de una campaña de la tienda online (Tienda web ▸ Campañas, maqueta docs/maquetas/campanas-tienda-2026-10): cómo entra la portada,
// qué efecto cae o brilla sobre ella, cuánto, cuánto dura y cuándo se ve la cuenta regresiva. Las dos apps lo dibujan con la MISMA lista de
// partículas y la misma hoja de estilos (`campana-efectos.css`, una copia en cada app que una prueba mantiene idéntica): el ERP para mostrarlo
// mientras se elige y la tienda para el cliente. Todo es CSS, sin librerías; con «reducir movimiento» no se mueve nada.

import type { EfectoCampana, FranjaCampana } from "./campanas-web";

export const ENTRADAS_CAMPANA = ["telon", "caen", "aparece", "ninguna"] as const;
export type EntradaCampana = (typeof ENTRADAS_CAMPANA)[number];
export const INTENSIDADES_CAMPANA = ["poca", "media"] as const;
export type IntensidadCampana = (typeof INTENSIDADES_CAMPANA)[number];
export const DURACIONES_CAMPANA = ["una", "continuo"] as const;
export type DuracionCampana = (typeof DURACIONES_CAMPANA)[number];
export const CUENTAS_CAMPANA = ["siempre", "ultimo", "no"] as const;
export type CuentaCampana = (typeof CUENTAS_CAMPANA)[number];

export const NOMBRE_DE_EFECTO: Record<EfectoCampana, string> = {
  ninguno: "Ninguno", destellos: "Destellos", confeti: "Confeti", petalos: "Pétalos", copos: "Copos", corazones: "Corazones",
  estrellas: "Estrellas", hojas: "Hojas", burbujas: "Burbujas", patitas: "Patitas",
};
export const NOMBRE_DE_FRANJA: Record<FranjaCampana, string> = { rota: "Rota las frases", marquesina: "Marquesina", quieta: "Quieta" };
export const NOMBRE_DE_ENTRADA: Record<EntradaCampana, string> = {
  telon: "Telón que se abre", caen: "Las prendas caen", aparece: "La foto aparece", ninguna: "Sin animación",
};
export const NOMBRE_DE_INTENSIDAD: Record<IntensidadCampana, string> = { poca: "Poca", media: "Media" };
export const NOMBRE_DE_DURACION: Record<DuracionCampana, string> = { una: "Una vez al llegar", continuo: "Suave y continuo" };
export const NOMBRE_DE_CUENTA: Record<CuentaCampana, string> = { siempre: "Siempre", ultimo: "Solo el último día", no: "No mostrar" };

/** De qué color va cada partícula: el acento y el texto del diseño, o dos neutros fijos (blanco y hielo) para la nieve y el confeti. */
export type ColorDeParticula = "acento" | "texto" | "blanco" | "hielo";

export type Particula = {
  /** Posición horizontal y vertical, en % del cuadro. */
  x: number;
  y: number;
  /** Cuánto espera antes de empezar y cuánto dura cada pasada, en segundos. */
  retraso: number;
  dura: number;
  /** Tamaño base en px. */
  tam: number;
  /** Cuánto se corre de lado (px) y cuánto gira (grados) al caer. */
  dx: number;
  giro: number;
  color: ColorDeParticula;
};

const COLORES: Record<Exclude<EfectoCampana, "ninguno">, readonly ColorDeParticula[]> = {
  destellos: ["acento"],
  confeti: ["acento", "texto", "blanco"],
  petalos: ["acento", "texto"],
  copos: ["blanco", "hielo"],
  corazones: ["acento", "texto"],
  estrellas: ["acento", "texto", "blanco"],
  hojas: ["acento", "texto"],
  burbujas: ["texto", "acento"],
  patitas: ["acento", "texto"],
};
/** Tamaño base y variación de cada efecto (px). */
const TAMANOS: Partial<Record<EfectoCampana, readonly [number, number]>> = {
  destellos: [10, 16], copos: [11, 9], corazones: [11, 9], estrellas: [9, 9], hojas: [11, 9], burbujas: [8, 14], patitas: [14, 10],
};

export const PARTICULAS_POR_INTENSIDAD: Record<IntensidadCampana, number> = { poca: 18, media: 36 };

/** Un reloj de azar con semilla: mismo diseño, mismas partículas (la vista previa y la tienda se ven igual, y una prueba puede contarlas). */
function azar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const redondo = (n: number, d: number) => Number(n.toFixed(d));

/** Las partículas de un efecto. Sin efecto, ninguna. «Una vez» reparte los retrasos en 2,4 s (todo empieza al llegar); «continuo», en 5 s
 *  (las pasadas se desfasan y no se nota el comienzo). */
export function particulasDeEfecto(efecto: EfectoCampana, intensidad: IntensidadCampana, duracion: DuracionCampana): Particula[] {
  if (efecto === "ninguno") return [];
  const rnd = azar(11);
  const [base, extra] = TAMANOS[efecto] ?? [6, 7];
  const colores = COLORES[efecto];
  return Array.from({ length: PARTICULAS_POR_INTENSIDAD[intensidad] }, (_, i) => ({
    tam: redondo(base + rnd() * extra, 1),
    x: redondo(rnd() * 100, 1),
    y: redondo(rnd() * 100, 1),
    retraso: redondo(rnd() * (duracion === "continuo" ? 5 : 2.4), 2),
    dura: redondo(3.6 + rnd() * 3, 2),
    dx: Math.round((rnd() - 0.5) * 140),
    giro: Math.round((rnd() - 0.5) * 720),
    color: colores[i % colores.length]!,
  }));
}

