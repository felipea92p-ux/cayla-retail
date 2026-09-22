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

/** Los roles que se le pueden asignar a una cuenta: los vigentes. El Líder, solo a una persona (una terminal nunca es
 *  líder, ADR-0162); sin cuenta elegida todavía, se ofrece igual y la base decide. */
export function rolesAsignables(roles: readonly RolVista[], cuenta?: Pick<CuentaConRol, "tipo">, soyLider = true): RolVista[] {
  // Quien administra roles sin ser líder (módulo Roles y accesos, 20260923131000) no sube a nadie a Líder.
  return roles.filter((r) => !r.archivado && (!r.fijo || (soyLider && cuenta?.tipo !== "terminal")));
}

/** Las cuentas de un rol. */
export function cuentasDelRol(cuentas: readonly CuentaConRol[], rolId: string): CuentaConRol[] {
  return cuentas.filter((c) => c.rolId === rolId);
}

/** Las cuentas a las que se les puede dar este rol: todas menos uno mismo (nadie se cambia su propio rol: así nunca se
 *  queda la tienda sin líder), las que ya lo tienen y, si es el Líder, las terminales. Misma regla que `asignar_rol`. */
export function cuentasAsignables(cuentas: readonly CuentaConRol[], rol: Pick<RolVista, "id" | "fijo">, yoId: string | null, soyLider = true): CuentaConRol[] {
  // Sin ser líder (20260923131000): a un líder no se le cambia el rol, y el rol Líder no se da.
  if (!soyLider && rol.fijo) return [];
  return cuentas.filter((c) => c.id !== yoId && c.rolId !== rol.id && !(rol.fijo && c.tipo === "terminal") && (soyLider || !c.esLider));
}

/** ¿Hay que elegirle sede? Solo al bajar a un líder sin ubicación: un líder opera todas, cualquier otro rol trabaja en
 *  una (check `rol = 'lider' or ubicacion_asignada_id is not null`). */
export function pideUbicacion(cuenta: Pick<CuentaConRol, "esLider" | "ubicacion">, destino: Pick<RolVista, "fijo"> | undefined): boolean {
  return !!destino && cuenta.esLider && !destino.fijo && !cuenta.ubicacion;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Editor de roles rediseñado (spike `docs/maquetas/colaboradores-ux-spike-2026-09/`, aprobado por Felipe 2026-09-22).
 * ------------------------------------------------------------------------------------------------------------------ */

/** Cómo se agrupa la lista de roles: los del sistema, los de las terminales y los que armó un líder. */
export type FamiliaRol = "sistema" | "terminal" | "a_medida";

export function familiaDeRol(rol: Pick<RolVista, "clave" | "fijo" | "esSistema">): FamiliaRol {
  if (rol.clave === "terminal_ventas" || rol.clave === "terminal_administrativa") return "terminal";
  if (rol.fijo || rol.esSistema) return "sistema";
  return "a_medida";
}

/** El aviso de la lista de roles: «Solo Inicio» si deja cuentas sin ningún módulo, «Sin uso» si nadie lo tiene. */
export function avisoDelRol(rol: Pick<RolVista, "fijo" | "archivado" | "modulos">, cuentas: number): "solo_inicio" | "sin_uso" | null {
  if (rol.fijo || rol.archivado) return null;
  if (cuentas > 0 && rol.modulos.length === 0) return "solo_inicio";
  if (cuentas === 0) return "sin_uso";
  return null;
}

/** Lo que el borrador suma y quita respecto de lo guardado, en el orden del catálogo. */
export function cambiosDelBorrador(guardados: readonly ClaveModulo[], borrador: readonly ClaveModulo[]): { suma: ClaveModulo[]; quita: ClaveModulo[] } {
  return {
    suma: MODULOS.filter((m) => borrador.includes(m.clave) && !guardados.includes(m.clave)).map((m) => m.clave),
    quita: MODULOS.filter((m) => guardados.includes(m.clave) && !borrador.includes(m.clave)).map((m) => m.clave),
  };
}

/** «Encender todo» / «Quitar todo» de un grupo: solo toca los módulos que se pueden delegar. */
export function alternarGrupo(modulos: readonly ClaveModulo[], grupo: Modulo["grupo"], encender: boolean): ClaveModulo[] {
  const delGrupo = new Set(MODULOS.filter((m) => m.grupo === grupo && esDelegable(m)).map((m) => m.clave));
  return MODULOS.filter((m) => (delGrupo.has(m.clave) ? encender : modulos.includes(m.clave))).map((m) => m.clave);
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los grupos con los módulos que coinciden con lo buscado (nombre, lo que incluye o el grupo). Vacío = todos. */
export function modulosFiltrados(texto: string): { grupo: Modulo["grupo"]; modulos: Modulo[] }[] {
  const q = sinTildes(texto.trim());
  if (!q) return modulosPorGrupo();
  return modulosPorGrupo()
    .map((g) => ({ grupo: g.grupo, modulos: g.modulos.filter((m) => sinTildes(`${m.nombre} ${m.incluye} ${g.grupo}`).includes(q)) }))
    .filter((g) => g.modulos.length > 0);
}

export type CambioMenu = "igual" | "suma" | "quita";
export type FilaMenuConCambios = { etiqueta: string; cambio: CambioMenu; hijas: { etiqueta: string; cambio: CambioMenu }[] };

/**
 * «Así queda su menú» con el borrador a la vista: lo que se suma y lo que se quita, sobre el mismo `menuDelRol` que arma el
 * menú real. Se calcula el menú de lo guardado, el del borrador y el de ambos juntos (para conservar el orden del lateral).
 */
export function menuConCambios(
  rol: Pick<RolVista, "fijo" | "modulos" | "limitadoComoHoy">,
  borrador: readonly ClaveModulo[],
  ubicacionTipo: TipoUbicacion = "tienda",
): FilaMenuConCambios[] {
  const antes = etiquetasDelMenu(menuDelRol(rol, ubicacionTipo));
  const despues = etiquetasDelMenu(menuDelRol({ ...rol, modulos: [...borrador] }, ubicacionTipo));
  const juntos = etiquetasDelMenu(menuDelRol({ ...rol, modulos: [...new Set([...rol.modulos, ...borrador])] }, ubicacionTipo));
  const cambio = (enAntes: boolean, enDespues: boolean): CambioMenu => (enAntes && enDespues ? "igual" : enDespues ? "suma" : "quita");
  return juntos.map((f) => {
    const a = antes.find((x) => x.etiqueta === f.etiqueta);
    const d = despues.find((x) => x.etiqueta === f.etiqueta);
    return {
      etiqueta: f.etiqueta,
      cambio: cambio(!!a, !!d),
      hijas: f.hijas.map((h) => ({ etiqueta: h, cambio: cambio(!!a?.hijas.includes(h), !!d?.hijas.includes(h)) })),
    };
  });
}
