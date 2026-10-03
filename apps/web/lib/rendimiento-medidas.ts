/**
 * «Qué más mostrar» de Rendimiento (Felipe, 2026-10-03): qué medidas EXTRA ve una persona debajo de las cuatro cifras del panel. Es una
 * preferencia de vista, igual que «Ajustar» del Inicio (`inicio-avisos.ts`): una cookie por cuenta en este aparato, que lee el servidor
 * y que no abre ni cierra ningún permiso. Lógica pura, sin React: se prueba en `rendimiento-medidas.test.ts`.
 *
 * PROMETE: todo viene ENCENDIDO por defecto (quien nunca toca el apartado ve la pantalla completa) y una cookie rara, vieja o manipulada
 * se ignora y vuelve lo de siempre. Solo existen las medidas de `MEDIDAS`: una clave de más en la cookie se descarta.
 * NO decide qué se calcula: apagar una medida solo la oculta; los datos se leen igual.
 */

export const CLAVES_MEDIDA = ["proyeccion", "prendas", "horas"] as const;
export type ClaveMedida = (typeof CLAVES_MEDIDA)[number];

export type EleccionMedidas = Partial<Record<ClaveMedida, boolean>>;

export const MEDIDAS: readonly { clave: ClaveMedida; titulo: string; explica: string }[] = [
  { clave: "proyeccion", titulo: "Proyección del mes", explica: "Dónde cierra el mes a este ritmo." },
  { clave: "prendas", titulo: "Prendas por venta", explica: "Cuántas prendas se lleva cada compra." },
  { clave: "horas", titulo: "Ventas por hora", explica: "En qué franja se vende más, para repartir turnos." },
];

/** ¿Se muestra esta medida? Sin elección expresa, sí. */
export function medidaVisible(clave: ClaveMedida, eleccion: EleccionMedidas): boolean {
  return eleccion[clave] !== false;
}

/** ¿Hay alguna apagada? (para ofrecer «Volver a mostrar todo» solo cuando sirve). */
export function hayMedidaApagada(eleccion: EleccionMedidas): boolean {
  return CLAVES_MEDIDA.some((c) => eleccion[c] === false);
}

/** Lee la cookie: solo claves conocidas con valor booleano; cualquier otra cosa se descarta. */
export function leerEleccionMedidas(valor: string | undefined): EleccionMedidas {
  if (!valor) return {};
  try {
    const crudo = JSON.parse(valor) as unknown;
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const eleccion: EleccionMedidas = {};
    for (const c of CLAVES_MEDIDA) {
      const v = (crudo as Record<string, unknown>)[c];
      if (typeof v === "boolean") eleccion[c] = v;
    }
    return eleccion;
  } catch {
    return {};
  }
}

/** Nombre de la cookie: una por cuenta en el mismo aparato (como la de «Ajustar» del Inicio). */
export function cookieMedidas(personaId: string | null): string {
  return `cayla_rendimiento_${personaId ?? "terminal"}`;
}
