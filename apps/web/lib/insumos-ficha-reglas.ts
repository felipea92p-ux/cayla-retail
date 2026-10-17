import type { TipoInsumo } from "./insumos-reglas";

// La ficha de una tela o un avío del Taller (ADR-0400, actividad 8e): de qué TEJIDO y de qué COLOR es, con el mismo vocabulario de la prenda. Sin React ni Supabase.
//
// PARA QUÉ SIRVE. «Nueva orden» propone la tela del color de la prenda y filtra por su tejido (`telasSugeridas`, lib/orden-tela-reglas.ts) leyendo `insumos.tejido_id` y `insumos.color_codigo`. Esas dos columnas
// existían desde la actividad 1 pero NINGUNA pantalla las escribía, así que la sugerencia nunca acertaba: cada orden se armaba eligiendo la tela a mano. Aquí se leen, se dicen en la lista y se escriben.
//
// CONTRATO
//   PROMETE: una ficha que dice lo que se sabe de la tela y nada más (sin tejido ni color inventados); un avío no tiene tejido (se ignora aunque la base lo traiga); y lo que se escribe a la base es lo que se
//            eligió (`null` si se dejó vacío), con el color solo si existe en el vocabulario.
//   ASUME:   el vocabulario es el de Catálogo (`tejidos` aprobados y activos, `colores` activos); un código que ya no está en él se dice «un color que ya no está en la lista», nunca se esconde.
//   NO HACE: no decide quién edita (la política `insumos_update_lider` de la base) ni toca el costo, el saldo o los lotes.

export type OpcionDeTejido = { id: string; nombre: string };
export type OpcionDeColor = { codigo: string; nombre: string; hex: string | null };
export type VocabularioDeTelas = { tejidos: OpcionDeTejido[]; colores: OpcionDeColor[] };

export type FichaDeLaTela = {
  /** El nombre del tejido, o `null` si no se dijo (siempre `null` en un avío). */
  tejido: string | null;
  color: { nombre: string; hex: string | null } | null;
  /** Dice todo lo que se le puede decir: una tela, tejido y color; un avío, color. */
  completa: boolean;
};

export function fichaDeLaTela(i: { tipo: TipoInsumo; tejidoId: string | null; colorCodigo: string | null }, v: VocabularioDeTelas): FichaDeLaTela {
  const tejido = i.tipo === "tela" && i.tejidoId ? (v.tejidos.find((t) => t.id === i.tejidoId)?.nombre ?? "Un tejido que ya no está en la lista") : null;
  const c = i.colorCodigo ? v.colores.find((x) => x.codigo === i.colorCodigo) : null;
  const color = i.colorCodigo ? { nombre: c?.nombre ?? "Un color que ya no está en la lista", hex: c?.hex ?? null } : null;
  return { tejido, color, completa: (i.tipo === "avio" || tejido !== null) && color !== null };
}

/** «Lino · Verde botella», «Verde botella» (un avío), o lo que falta: «Sin tejido ni color». */
export function textoDeLaFicha(f: FichaDeLaTela, tipo: TipoInsumo): string {
  const partes = [f.tejido, f.color?.nombre ?? null].filter((x): x is string => x !== null);
  if (partes.length > 0) return partes.join(" · ");
  return tipo === "tela" ? "Sin tejido ni color" : "Sin color";
}

/** Lo que se escribe en `insumos`: lo elegido, `null` si se dejó vacío; el tejido de un avío no se guarda. */
export function valoresDeLaFicha(e: { tipo: TipoInsumo; tejidoId: string; colorCodigo: string }, v: VocabularioDeTelas): { tejido_id: string | null; color_codigo: string | null } {
  return {
    tejido_id: e.tipo === "tela" && e.tejidoId !== "" && v.tejidos.some((t) => t.id === e.tejidoId) ? e.tejidoId : null,
    color_codigo: e.colorCodigo !== "" && v.colores.some((c) => c.codigo === e.colorCodigo) ? e.colorCodigo : null,
  };
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);

/** Las filas de `tejidos` y `colores` tal como llegan de la base; lo que no se entiende se descarta y se ordena por nombre. */
export function leerVocabularioDeTelas(tejidos: unknown, colores: unknown): VocabularioDeTelas {
  const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  return {
    tejidos: lista(tejidos)
      .flatMap((t): OpcionDeTejido[] => (esObjeto(t) && texto(t.id) && texto(t.nombre) ? [{ id: t.id as string, nombre: t.nombre as string }] : []))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    colores: lista(colores)
      .flatMap((c): OpcionDeColor[] => (esObjeto(c) && texto(c.codigo) && texto(c.nombre) ? [{ codigo: c.codigo as string, nombre: c.nombre as string, hex: texto(c.hex) }] : []))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}
