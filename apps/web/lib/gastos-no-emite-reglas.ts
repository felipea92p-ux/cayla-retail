// «No emite comprobante» (ADR-0588, `20261031155000_gastos_no_emite_comprobante.sql`): un gasto grande sin comprobante que nunca lo tendrá se marca
// con su motivo y deja de pedir algo (Felipe: «sale de la cuenta»). Lo puro: los motivos, qué falta, cómo se dice y cómo se juntan con la lista.
import type { CampoDeGuia } from "./guia-campos";

export const RPC_MARCAR_NO_EMITE = "marcar_gasto_no_emite";

export type MotivoNoEmite = "no_emite" | "se_perdio" | "otro";
export type NoEmite = { motivo: MotivoNoEmite; nota: string | null };

export const MOTIVOS_NO_EMITE: readonly { valor: MotivoNoEmite; texto: string }[] = [
  { valor: "no_emite", texto: "El proveedor no emite comprobante" },
  { valor: "se_perdio", texto: "Se perdió el comprobante" },
  { valor: "otro", texto: "Otro motivo" },
];

/** El tope de la nota (el mismo de la base). */
export const MAX_NOTA_NO_EMITE = 200;

/** Cómo se lee en la hoja del gasto, en gris: «No emite · El proveedor no emite comprobante». */
export function textoNoEmite(n: NoEmite): string {
  if (n.motivo === "otro") return n.nota ?? "Otro motivo";
  return MOTIVOS_NO_EMITE.find((m) => m.valor === n.motivo)?.texto ?? "Sin comprobante";
}

export type BorradorNoEmite = { motivo: MotivoNoEmite | ""; nota: string };

/** Lo que falta para poder guardar (las mismas reglas que la base), o `null`. */
export function problemaNoEmite(b: BorradorNoEmite): string | null {
  if (!b.motivo) return "Elige por qué no tiene comprobante.";
  const nota = b.nota.trim();
  if (b.motivo === "otro" && !nota) return "Cuenta en una línea por qué no tiene comprobante.";
  if (nota.length > MAX_NOTA_NO_EMITE) return `El motivo cabe en ${MAX_NOTA_NO_EMITE} letras.`;
  return null;
}

/** La guía de foco (ADR-0284): sale de `problemaNoEmite`. La nota solo cuenta con «Otro motivo». */
export function camposNoEmite(b: BorradorNoEmite, responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const nota = b.nota.trim();
  const campos: CampoDeGuia[] = [{ id: "motivo", nombre: "Por qué", requerido: true, hecho: Boolean(b.motivo), pendiente: "Elige por qué no tiene comprobante." }];
  if (b.motivo === "otro") {
    campos.push({
      id: "nota",
      nombre: "El motivo",
      requerido: true,
      hecho: Boolean(nota) && nota.length <= MAX_NOTA_NO_EMITE,
      pendiente: nota ? `El motivo cabe en ${MAX_NOTA_NO_EMITE} letras.` : "Cuenta en una línea por qué no tiene comprobante.",
    });
  }
  campos.push({ id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo marca." });
  return campos;
}

/** Lo que se manda a `marcar_gasto_no_emite`: la nota solo con «Otro motivo». */
export function payloadNoEmite(gastoId: string, b: BorradorNoEmite): { p_gasto_id: string; p_motivo: MotivoNoEmite; p_nota: string | null } {
  return { p_gasto_id: gastoId, p_motivo: b.motivo as MotivoNoEmite, p_nota: b.motivo === "otro" ? b.nota.trim() : null };
}

/** Lo que devuelve `fn_gastos_no_emiten`, por gasto. Lo que no se entiende se deja fuera (el gasto sigue pidiendo comprobante, que es lo seguro). */
export function leerNoEmiten(data: unknown): Map<string, NoEmite> {
  const m = new Map<string, NoEmite>();
  if (!Array.isArray(data)) return m;
  for (const f of data as Record<string, unknown>[]) {
    const id = typeof f.gasto_id === "string" ? f.gasto_id : null;
    const motivo = MOTIVOS_NO_EMITE.find((x) => x.valor === f.motivo)?.valor ?? null;
    if (!id || !motivo) continue;
    m.set(id, { motivo, nota: typeof f.nota === "string" && f.nota.trim() ? f.nota : null });
  }
  return m;
}

/** Junta la marca con cada gasto de la lista. */
export function conNoEmite<T extends { id: string }>(gastos: readonly T[], marcados: ReadonlyMap<string, NoEmite>): (T & { noEmite: NoEmite | null })[] {
  return gastos.map((g) => ({ ...g, noEmite: marcados.get(g.id) ?? null }));
}
