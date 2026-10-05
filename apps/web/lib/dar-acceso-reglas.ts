// Reglas puras de «Dar acceso» (Colaboradores ▸ Equipo, ADR-0341): qué falta, qué roles se ofrecen y la frase que resume el
// alta antes de confirmar. Sin base ni React (`dar-acceso-reglas.test.ts`). No agrega reglas de negocio: «falta» es lo mismo
// que apaga el botón, y los roles son los que `agregar_colaborador` acepta.
import type { CampoDeGuia } from "./guia-campos";
import type { ClaveModulo } from "./modulos";
import { rolesAsignables, type RolVista } from "./roles-reglas";

export type HojaDarAcceso = {
  personas: number;
  sedeElegida: boolean;
  /** `null` = no se pudieron leer los roles (o quien mira no tiene Roles y accesos): entra como Integrante y no se pregunta. */
  pideRol: boolean;
  rolElegido: boolean;
  responsableListo: boolean;
  responsableMotivo: string | null;
};

export function camposDeDarAcceso(h: HojaDarAcceso): CampoDeGuia[] {
  return [
    { id: "quien", nombre: "Quién", requerido: true, hecho: h.personas > 0, pendiente: "Elige a quién le das acceso." },
    { id: "sede", nombre: "Sede", requerido: true, hecho: h.sedeElegida, pendiente: "Elige la sede donde trabaja." },
    ...(h.pideRol ? [{ id: "rol", nombre: "Rol", requerido: true, hecho: h.rolElegido, pendiente: "Elige qué hace: su rol." }] : []),
    { id: "responsable", nombre: "Quién lo da", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién da el acceso." },
  ];
}

/**
 * Los roles que se pueden dar al entrar: los que quien mira puede asignar a una persona (`rolesAsignables`: «solo das lo que
 * tienes», sin archivados), menos el Líder (la base no lo da al entrar: lo sube un Admin desde la ficha). Integrante primero,
 * porque es el de siempre; el resto por nombre.
 */
export function rolesParaDarAcceso(roles: readonly RolVista[], soyAdmin: boolean, misModulos: readonly ClaveModulo[] | null): RolVista[] {
  return rolesAsignables(roles, { tipo: "persona" }, soyAdmin, misModulos)
    .filter((r) => !r.fijo)
    .sort((a, b) => (a.clave === "integrante" ? -1 : b.clave === "integrante" ? 1 : a.nombre.localeCompare(b.nombre, "es")));
}

/** «Rosa Quispe», «Rosa Quispe y Mateo Ruiz», «Rosa Quispe y 2 más». */
export function quienes(nombres: readonly string[]): string {
  if (nombres.length <= 2) return nombres.join(" y ");
  return `${nombres[0]} y ${nombres.length - 1} más`;
}

/**
 * La frase que resume el alta antes de confirmar, o `null` si todavía falta quién o dónde. `entraDirecto` = quien lo da es
 * líder (ADR-0341); si no, queda esperando el ok de un líder y la frase lo dice.
 */
export function fraseDarAcceso(a: { nombres: readonly string[]; sede: string | null; rol: string | null; entraDirecto: boolean }): string | null {
  if (a.nombres.length === 0 || !a.sede) return null;
  const varias = a.nombres.length > 1;
  const como = a.rol ? ` como ${a.rol}` : "";
  return a.entraDirecto
    ? `${quienes(a.nombres)} ${varias ? "entran" : "entra"} a ${a.sede}${como}.`
    : `${quienes(a.nombres)} ${varias ? "quedarán" : "quedará"} en ${a.sede}${como}, esperando el ok de un líder.`;
}

/** El aviso después de confirmar. */
export function avisoDarAcceso(nombres: readonly string[], entraDirecto: boolean): string {
  const varias = nombres.length > 1;
  return entraDirecto
    ? `${quienes(nombres)} ya ${varias ? "pueden" : "puede"} entrar a retail`
    : `${quienes(nombres)} ${varias ? "esperan" : "espera"} el ok de un líder`;
}
