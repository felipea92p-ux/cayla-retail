// La ficha de un color (ADR-0316): qué transmite (`colores.descripcion`) y con qué se combina (`colores.combina_con`), resuelta
// por código contra el vocabulario que la pantalla ya tiene en memoria. Es lo que dibuja `components/ui/FichaDelColor.tsx`
// en el pie de la carta de Nuevo producto, en «Todo de la prenda» de Vender y en la vista rápida de Catálogo (Felipe,
// 2026-10-10: solo al señalar o fijar un color; en reposo no hay nada).
//
// CONTRATO
//   PROMETE: `fichaDelColor` devuelve `null` si el color no existe o no tiene ficha (ni descripción ni compañeros): la
//     pantalla no dibuja nada, nunca un «sin datos». Los compañeros salen en el orden guardado (el criterio de estilismo de la
//     ficha, ADR-0316: no se simetriza ni se reordena por gusto), sin el propio color, sin repetidos, solo los que están en el
//     vocabulario recibido (quien arma el mapa pasa los ACTIVOS: uno desactivado no se recomienda, como en Atributos) y hasta
//     `MAX_COMBINA_CON`. Con `unidadesAqui`, cada compañero sabe cuántas unidades hay en la sede y los que tienen van primero,
//     conservando entre ellos el orden guardado: en el mostrador solo sirve sugerir un color que de verdad cuelga (Felipe).
//   ASUME: nada de la base; el mapa viene de un select con `activo = true`.
import { MAX_COMBINA_CON } from "./color-referencias";

export type ColorConFicha = {
  codigo: string;
  nombre: string;
  hex: string | null;
  familiaColor: string;
  tipo?: string | null;
  descripcion?: string | null;
  combinaCon?: readonly string[] | null;
};

export type Companero = {
  codigo: string;
  nombre: string;
  hex: string | null;
  familiaColor: string;
  tipo: string | null;
  /** Unidades en la sede que mira; `null` si la pantalla no sabe de stock (el alta). */
  aqui: number | null;
};

export type FichaDelColor = {
  descripcion: string | null;
  /** La primera oración de la descripción, para donde solo cabe una línea (el pie de la carta). */
  primeraFrase: string | null;
  companeros: Companero[];
};

/** La primera oración («Neutro cálido y versátil que transmite calma.»); el texto entero si no hay punto seguido. */
export function primeraFrase(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const corte = t.search(/[.;!?]\s/);
  return corte > 0 ? t.slice(0, corte + 1) : t;
}

export function fichaDelColor(
  codigo: string | null | undefined,
  porCodigo: ReadonlyMap<string, ColorConFicha>,
  opciones: { unidadesAqui?: ReadonlyMap<string, number> | null } = {}
): FichaDelColor | null {
  if (!codigo) return null;
  const color = porCodigo.get(codigo);
  if (!color) return null;
  const descripcion = (color.descripcion ?? "").trim() || null;
  const vistos = new Set<string>([codigo]);
  const companeros: Companero[] = [];
  for (const cod of color.combinaCon ?? []) {
    if (vistos.has(cod)) continue;
    vistos.add(cod);
    const c = porCodigo.get(cod);
    if (!c) continue;
    const aqui = opciones.unidadesAqui ? (opciones.unidadesAqui.get(cod) ?? 0) : null;
    companeros.push({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, familiaColor: c.familiaColor, tipo: c.tipo ?? null, aqui });
    if (companeros.length === MAX_COMBINA_CON) break;
  }
  if (opciones.unidadesAqui) {
    // Estable: los que cuelgan aquí primero, y dentro de cada grupo el orden de la ficha.
    const con = companeros.filter((c) => (c.aqui ?? 0) > 0);
    const sin = companeros.filter((c) => (c.aqui ?? 0) === 0);
    companeros.splice(0, companeros.length, ...con, ...sin);
  }
  if (!descripcion && companeros.length === 0) return null;
  return { descripcion, primeraFrase: primeraFrase(descripcion), companeros };
}
