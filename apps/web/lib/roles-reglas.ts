// Reglas puras de la pantalla «Roles y accesos» (ADR-0161 B; spike `docs/maquetas/responsable-y-roles-spike-2026-09/`,
// pantalla 1). Sin React ni Supabase: se prueban con `roles-reglas.test.ts` y se importan desde el cliente.

import { esGrupoMenu, menuPara, type FilaMenu, type TipoUbicacion } from "./menu";
import { MODULOS, esDelegable, permisosDeModulos, type ClaveModulo, type Modulo } from "./modulos";

/** Un rol como lo muestra la pantalla. */
export type RolVista = {
  id: string;
  clave: "lider" | "integrante" | "terminal_ventas" | "terminal_administrativa" | null;
  nombre: string;
  descripcion: string | null;
  /** No se archiva (Líder, Integrante). */
  esSistema: boolean;
  /** No se edita (solo Líder). */
  fijo: boolean;
  /** ADR-0161 B2d pendiente: ve sus módulos sin las capacidades de escritura (Integrante, como hoy). */
  limitadoComoHoy: boolean;
  archivado: boolean;
  modulos: ClaveModulo[];
};

/** Una cuenta que puede tener un rol: una persona (con acceso a retail) o una terminal (ADR-0162). */
export type CuentaConRol = {
  tipo: "persona" | "terminal";
  id: string;
  nombre: string;
  ubicacion: string | null;
  rolId: string;
  esLider: boolean;
  estado: string;
};

/** ¿El rol ve este módulo? El fijo (Líder) ve todos, también los que nunca se delegan. */
export function veModulo(rol: Pick<RolVista, "fijo" | "modulos">, clave: ClaveModulo): boolean {
  return rol.fijo || rol.modulos.includes(clave);
}

/** Cómo se muestra el control de un módulo para un rol: interruptor, o candado con su motivo. */
export type ControlModulo = { tipo: "interruptor"; editable: boolean } | { tipo: "candado"; texto: "Solo líder" | "Solo líder por ahora" };

export function controlDe(rol: Pick<RolVista, "fijo" | "archivado">, m: Modulo): ControlModulo {
  if (rol.fijo) return { tipo: "interruptor", editable: false };
  if (m.soloLider) return { tipo: "candado", texto: "Solo líder" };
  if (m.noDelegable) return { tipo: "candado", texto: "Solo líder por ahora" };
  return { tipo: "interruptor", editable: !rol.archivado };
}

/** Los módulos agrupados como en el spike (Ventas, Inventario, Catálogo, Compras, Producción, Gestión). */
export function modulosPorGrupo(): { grupo: Modulo["grupo"]; modulos: Modulo[] }[] {
  const grupos: { grupo: Modulo["grupo"]; modulos: Modulo[] }[] = [];
  for (const m of MODULOS) {
    const g = grupos.find((x) => x.grupo === m.grupo);
    if (g) g.modulos.push(m);
    else grupos.push({ grupo: m.grupo, modulos: [m] });
  }
  return grupos;
}

/** Enciende o apaga un módulo en el borrador de un rol. Nunca deja entrar uno que no se delega. */
export function alternarModulo(modulos: readonly ClaveModulo[], clave: ClaveModulo): ClaveModulo[] {
  const m = MODULOS.find((x) => x.clave === clave);
  if (!m || !esDelegable(m)) return [...modulos];
  return modulos.includes(clave) ? modulos.filter((c) => c !== clave) : MODULOS.filter((x) => x.clave === clave || modulos.includes(x.clave)).map((x) => x.clave);
}

/** ¿El borrador difiere de lo guardado? (el orden no importa) */
export function hayCambios(guardados: readonly ClaveModulo[], borrador: readonly ClaveModulo[]): boolean {
  return guardados.length !== borrador.length || guardados.some((c) => !borrador.includes(c));
}

/**
 * «Así queda su menú»: lo que vería en el lateral una cuenta con este rol, parada en una tienda (o en el Taller, para ver
 * Producción). Sale de `menuPara`, el mismo que arma el menú real, así la vista previa no puede mentir.
 */
export function menuDelRol(rol: Pick<RolVista, "fijo" | "modulos" | "limitadoComoHoy">, ubicacionTipo: TipoUbicacion = "tienda"): FilaMenu[] {
  const modulos = rol.fijo ? MODULOS.map((m) => m.clave) : rol.modulos;
  const permisos = permisosDeModulos(rol.fijo ? "lider" : "integrante", modulos.map((clave) => ({ clave, completo: !rol.limitadoComoHoy })));
  return menuPara({ permisos, ubicacionTipo, modulos }).riel;
}

/** El menú como texto corto: «Inicio · Ventas (Punto de Venta, Caja) · Inventario (…)». */
export function etiquetasDelMenu(riel: readonly FilaMenu[]): { etiqueta: string; hijas: string[] }[] {
  return riel.map((f) => ({ etiqueta: f.etiqueta, hijas: esGrupoMenu(f) ? f.hijos.map((h) => h.etiqueta) : [] }));
}

/** Por qué no se puede archivar este rol, o `null` si se puede. Mismo criterio que `archivar_rol` en la base. */
export function motivoParaNoArchivar(rol: Pick<RolVista, "esSistema" | "fijo" | "archivado">, cuentas: number): string | null {
  if (rol.archivado) return "Ya está archivado.";
  if (rol.fijo) return "Siempre tiene que haber quien administre.";
  if (rol.esSistema) return "Es el rol que recibe una persona nueva.";
  if (cuentas > 0) return `Lo ${cuentas === 1 ? "tiene 1 cuenta" : `tienen ${cuentas} cuentas`}: asígnales otro rol antes.`;
  return null;
}

/** Nombre libre para «Duplicar»: «Copia de X», «Copia de X (2)»… sin chocar con un rol vigente. */
export function nombreDeCopia(origen: string, vigentes: readonly string[]): string {
  const usados = new Set(vigentes.map((n) => n.trim().toLowerCase()));
  const base = `Copia de ${origen}`;
  if (!usados.has(base.toLowerCase())) return base.slice(0, 60);
  for (let i = 2; ; i++) {
    const n = `${base} (${i})`;
    if (!usados.has(n.toLowerCase())) return n.slice(0, 60);
  }
}

/** Los roles que se le pueden asignar a una cuenta: vigentes y nunca el Líder (ser líder es un acceso aparte). */
export function rolesAsignables(roles: readonly RolVista[]): RolVista[] {
  return roles.filter((r) => !r.archivado && !r.fijo);
}

/** Las cuentas de un rol. */
export function cuentasDelRol(cuentas: readonly CuentaConRol[], rolId: string): CuentaConRol[] {
  return cuentas.filter((c) => c.rolId === rolId);
}

/** Las cuentas a las que se les puede cambiar el rol: todas menos los líderes. */
export function cuentasAsignables(cuentas: readonly CuentaConRol[]): CuentaConRol[] {
  return cuentas.filter((c) => !c.esLider);
}
