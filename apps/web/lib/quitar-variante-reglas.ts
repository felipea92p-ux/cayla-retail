// «Quitar color» y «Quitar talla» en Editar producto: una variante solo se archiva con 0 unidades (ADR-0494, actividad 3; Felipe 2026-10-27).
// Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo que el eje (un color o una talla) tiene de stock, decir qué pasa al tocar su tacho: se quita sin más (todo es nuevo),
//            se pide confirmar el archivado (tiene 0), o se bloquea y se manda a Existencias a dejarlo en 0 (tiene unidades).
//   ASUME:   `fn_variantes_estado` (`EstadoVariante`) trae el stock por variante y por sede. Si esa lectura no está (`null`), no se sabe
//            cuánto hay: no se bloquea (principio 9, se degrada con gracia) y se pide confirmar como siempre.
//   NO HACE: no es una cerradura. Es una regla de pantalla: la base sigue aceptando desactivar una variante con stock. Cerrarla de verdad
//            es una decisión aparte (un origen en `ajustar_inventario` o un candado en `catalogo_actualizar_producto`) y es de Felipe.
//
// POR QUÉ: desactivar una variante con unidades deja ese stock en algo que ya no se vende y que nadie ve (principio 2, cero estados
// inconsistentes). Antes solo se avisaba debajo de la tabla; ahora no se deja.

import type { EstadoVariante, FilaFicha } from "./variantes-ficha-reglas";

export type QueHaceAlQuitar =
  | { tipo: "directo" }
  | { tipo: "confirmar"; sinDato: boolean }
  | { tipo: "bloqueado"; enEstaSede: number; enOtrasSedes: { nombre: string; cantidad: number }[]; varianteParaAjustar: string | null };

/**
 * `filas`: las variantes activas del eje que se quita. `estado`: lo que dice `fn_variantes_estado` (o `null`). `sedeId`: la sede de la que
 * se edita (la que puede ajustar), o `null` si la cuenta no ajusta stock.
 */
export function queHaceAlQuitar(filas: readonly FilaFicha[], estado: Readonly<Record<string, EstadoVariante>> | null, sedeId: string | null): QueHaceAlQuitar {
  // Todo lo que el eje tiene todavía no existe en la base: no deja rastro ni stock.
  if (filas.length > 0 && filas.every((f) => !f.guardada)) return { tipo: "directo" };
  if (!estado) return { tipo: "confirmar", sinDato: true };
  const guardadas = filas.filter((f) => f.guardada && f.id);
  let enEstaSede = 0;
  const otras = new Map<string, number>();
  let varianteParaAjustar: string | null = null;
  for (const f of guardadas) {
    const e = estado[f.id!];
    if (!e) continue;
    for (const s of e.sedes) {
      if (s.cantidad <= 0) continue;
      if (sedeId && s.ubicacionId === sedeId) {
        enEstaSede += s.cantidad;
        varianteParaAjustar ??= f.id!;
      } else otras.set(s.nombre, (otras.get(s.nombre) ?? 0) + s.cantidad);
    }
  }
  if (enEstaSede === 0 && otras.size === 0) return { tipo: "confirmar", sinDato: false };
  return { tipo: "bloqueado", enEstaSede, enOtrasSedes: [...otras].map(([nombre, cantidad]) => ({ nombre, cantidad })), varianteParaAjustar };
}

/** Cuántas unidades tiene el eje, contando todas las sedes (lo que dice la hoja: «Beige tiene 34 unidades»). */
export function totalDelEje(q: Extract<QueHaceAlQuitar, { tipo: "bloqueado" }>): number {
  return q.enEstaSede + q.enOtrasSedes.reduce((s, o) => s + o.cantidad, 0);
}
