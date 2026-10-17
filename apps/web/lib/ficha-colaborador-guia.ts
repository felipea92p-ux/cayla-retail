// La guía de foco de la ficha de una persona del Equipo (Colaboradores ▸ la ficha; ADR-0284, ADR-0340). No agrega reglas: cada
// «falta» es lo que ya apaga el botón del panel abierto y lo que la base rechazaría. Quién lo hace lo firma cada función con
// `fn_actor_persona_id(true)`; el rol nuevo es el botón que se toca; y al bajar a un líder que no tiene sede, `asignar_rol` exige
// `p_ubicacion_id` (check `rol = 'lider' or ubicacion_asignada_id is not null`, `pideUbicacion` en `roles-reglas.ts`). La prueba compara
// la guía con `puedeCambiarRol` en todas las combinaciones.
//
// Cada panel pide lo suyo: «Cambiar rol», el rol y (a veces) la sede; «Suspender», un motivo que nunca bloquea. Cambiar la sede,
// reactivar y quitar el acceso son un toque: solo piden quién lo hace. Sin panel abierto no hay nada que llenar.

import type { CampoDeGuia } from "./guia-campos";

/** Lo que la ficha tiene abierto. «reactivar» es la ficha de alguien suspendido: su único botón no abre panel. */
export type PanelFicha = "rol" | "sede" | "suspender" | "quitar" | "reactivar";

export type EstadoFicha = {
  panel: PanelFicha | null;
  responsableListo: boolean;
  /** Por qué no se puede firmar todavía (lo dice el combo), o null. */
  responsableMotivo: string | null;
  /** Ya tocó uno de los roles de «Cambiar rol». */
  rolElegido: boolean;
  /** El rol elegido saca a un líder sin sede de Líder: hay que darle una (`pideUbicacion`). */
  pideSede: boolean;
  sedeElegida: boolean;
  motivo: string;
};

/** Lo que hoy deja tocar «Cambiar a …» (sin contar la espera de otro guardado, que no es un dato que falte). */
export function puedeCambiarRol(f: Pick<EstadoFicha, "responsableListo" | "rolElegido" | "pideSede" | "sedeElegida">): boolean {
  return f.responsableListo && f.rolElegido && (!f.pideSede || f.sedeElegida);
}

/** Los campos de la guía para el panel abierto, en el orden de la ficha: el responsable va arriba de los botones. */
export function camposFicha(f: EstadoFicha): CampoDeGuia[] {
  if (!f.panel) return [];
  const campos: CampoDeGuia[] = [
    {
      id: "ficha-responsable",
      nombre: "Quién lo hace",
      requerido: true,
      hecho: f.responsableListo,
      pendiente: f.responsableMotivo ?? "Elige quién hace el cambio.",
    },
  ];
  if (f.panel === "rol") {
    campos.push({ id: "ficha-rol", nombre: "Rol nuevo", requerido: true, hecho: f.rolElegido, pendiente: "Toca el rol que va a tener." });
    // La sede solo existe en pantalla cuando el rol elegido la pide: antes no hay nada que encender.
    if (f.rolElegido && f.pideSede) {
      campos.push({ id: "ficha-sede", nombre: "Sede donde queda", requerido: true, hecho: f.sedeElegida, pendiente: "Deja de ser líder: elige la sede donde va a trabajar." });
    }
  }
  if (f.panel === "suspender") {
    campos.push({ id: "ficha-motivo", nombre: "Motivo", requerido: false, hecho: f.motivo.trim() !== "", pendiente: "" });
  }
  return campos;
}
