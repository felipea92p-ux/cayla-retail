import { describe, expect, it } from "vitest";
import type { DynamicDisponible } from "./colaboradores";
import {
  accionesDeFila,
  avisoTerminal,
  confirmacionTerminal,
  fechaHoraLima,
  fechaLima,
  filtrarDisponibles,
  fraseEvento,
  vistaDe,
  resumenAlta,
} from "./colaboradores-reglas";

describe("filtrarDisponibles", () => {
  const disp: DynamicDisponible[] = [
    { persona_id: "a", nombre: "Milagritos Zárate", correo: "lucia@gmail.com", sede: null },
    { persona_id: "b", nombre: "Mateo Quispe", correo: "mquispe@cayla.pe", sede: "Taller LIM" },
  ];
  it("sin texto devuelve una copia de todas", () => {
    const r = filtrarDisponibles(disp, "");
    expect(r).toHaveLength(2);
    expect(r).not.toBe(disp);
  });
  it("busca nombre o correo sin tildes", () => {
    expect(filtrarDisponibles(disp, "zarate").map((d) => d.persona_id)).toEqual(["a"]);
    expect(filtrarDisponibles(disp, "cayla.pe").map((d) => d.persona_id)).toEqual(["b"]);
  });
});

describe("resumenAlta", () => {
  it("pide elegir a alguien cuando no hay nadie", () => {
    expect(resumenAlta(0, "Taller LIM")).toBe("Elige al menos una persona para continuar");
  });
  it("singular y plural", () => {
    expect(resumenAlta(1, "Tienda TRU")).toBe("Se agregará 1 persona como Integrante en Tienda TRU");
    expect(resumenAlta(2, "Taller LIM")).toBe("Se agregarán 2 personas como Integrante en Taller LIM");
  });
  it("sin ubicación elegida todavía no inventa una", () => {
    expect(resumenAlta(2, null)).toBe("Se agregarán 2 personas como Integrante");
  });
});

describe("accionesDeFila", () => {
  it("a uno mismo no se le ofrece nada", () => {
    expect(accionesDeFila({ rol: "lider", es_yo: true })).toEqual([]);
  });
  it("a un colaborador se le puede cambiar la ubicación, suspender y quitar", () => {
    expect(accionesDeFila({ rol: "colaborador", es_yo: false })).toEqual(["cambiar_rol", "cambiar_ubicacion", "suspender", "quitar"]);
  });
  it("un ADMIN (ADR-0178) le cambia el rol y la ubicación a otro líder (la tienda donde arranca)", () => {
    expect(accionesDeFila({ rol: "lider", es_yo: false })).toEqual(["cambiar_rol", "cambiar_ubicacion", "suspender", "quitar"]);
  });
  it("quien no es Admin (un líder cualquiera, o quien tiene el módulo Colaboradores) no toca a un líder; a un colaborador, sí", () => {
    expect(accionesDeFila({ rol: "lider", es_yo: false }, false)).toEqual([]);
    expect(accionesDeFila({ rol: "colaborador", es_yo: false }, false)).toEqual(["cambiar_rol", "cambiar_ubicacion", "suspender", "quitar"]);
  });
  it("a quien no está por debajo de quien mira (ADR-0178, «solo alcanzas…»), nada", () => {
    expect(accionesDeFila({ rol: "colaborador", es_yo: false }, false, false)).toEqual([]);
  });
});

describe("terminales sin persona (ADR-0162)", () => {
  it("desactivar avisa que corta la sesión al instante y conserva el historial", () => {
    const c = confirmacionTerminal({ nombre: "Terminal Ventas TRU", activo: true });
    expect(c.titulo).toBe("Desactivar Terminal Ventas TRU");
    expect(c.boton).toBe("Desactivar");
    expect(c.texto).toMatch(/al instante/);
    expect(c.texto).toMatch(/historial se conserva/);
  });
  it("reactivar vuelve con la misma clave", () => {
    expect(confirmacionTerminal({ nombre: "Terminal Ventas LIM", activo: false })).toEqual({
      titulo: "Reactivar Terminal Ventas LIM",
      texto: "El aparato vuelve a funcionar con su misma clave.",
      boton: "Reactivar",
    });
  });
  it("el aviso dice el estado NUEVO, a partir del de antes", () => {
    expect(avisoTerminal("Terminal Ventas TRU", true)).toBe("Terminal Ventas TRU desactivada");
    expect(avisoTerminal("Terminal Ventas TRU", false)).toBe("Terminal Ventas TRU reactivada");
  });
});

describe("fechas en hora de Lima", () => {
  it("una alta a las 03:00 UTC cae el día anterior en Lima", () => {
    expect(fechaLima("2026-09-17T03:00:00Z")).toBe("16/09/2026");
  });
  it("fecha y hora", () => {
    expect(fechaHoraLima("2026-09-22T16:15:00Z")).toBe("22/09 11:15");
  });
});

describe("fraseEvento", () => {
  const base = { persona_nombre: "Angie", por_nombre: "Felipe", rol: "colaborador" as const, ubicacion_anterior: null, ubicacion_nueva: null, motivo: null };
  const texto = (f: ReturnType<typeof fraseEvento>) => f.partes.map((p) => p.texto).join("");

  it("alta con autor: quién dio acceso, a quién, con qué rol y dónde", () => {
    const f = fraseEvento({ ...base, accion: "alta", ubicacion_nueva: "Tienda TRU" });
    expect(f.etiqueta).toBe("Alta");
    expect(f.tono).toBe("verde");
    expect(texto(f)).toBe("Felipe dio acceso a Angie como Integrante.");
    expect(f.detalle).toBe("Ubicación fija: Tienda TRU");
    expect(f.partes.filter((p) => p.fuerte).map((p) => p.texto)).toEqual(["Felipe", "Angie"]);
  });
  it("alta sembrada (sin autor) no inventa a nadie", () => {
    const f = fraseEvento({ ...base, accion: "alta", por_nombre: null, rol: "lider" });
    expect(texto(f)).toBe("Angie ya tenía acceso como Líder cuando se empezó a llevar este historial.");
    expect(f.detalle).toBeNull();
  });
  it("suspensión con motivo", () => {
    const f = fraseEvento({ ...base, accion: "suspension", motivo: "Cese de temporada" });
    expect(f.tono).toBe("ambar");
    expect(texto(f)).toBe("Felipe suspendió el acceso a Angie.");
    expect(f.detalle).toBe("Motivo: Cese de temporada");
  });
  it("suspensión sin motivo no muestra detalle", () => {
    expect(fraseEvento({ ...base, accion: "suspension" }).detalle).toBeNull();
  });
  it("reactivación y baja", () => {
    expect(texto(fraseEvento({ ...base, accion: "reactivacion", ubicacion_nueva: "Taller LIM" }))).toBe("Felipe reactivó el acceso a Angie.");
    const baja = fraseEvento({ ...base, accion: "baja", ubicacion_anterior: "Tienda TRU" });
    expect(texto(baja)).toBe("Felipe quitó el acceso a Angie.");
    expect(baja.detalle).toBe("Estaba en: Tienda TRU");
  });
  it("aprobación (D-70): quién aprobó, a quién, con qué rol y dónde", () => {
    const f = fraseEvento({ ...base, accion: "aprobacion", ubicacion_nueva: "Tienda TRU" });
    expect(f.etiqueta).toBe("Aprobación");
    expect(f.tono).toBe("verde");
    expect(texto(f)).toBe("Felipe aprobó el alta de Angie como Integrante.");
    expect(f.detalle).toBe("Ubicación: Tienda TRU");
  });
  it("cambio de ubicación dice de dónde a dónde", () => {
    const f = fraseEvento({ ...base, accion: "ubicacion", ubicacion_anterior: "Tienda TRU", ubicacion_nueva: "Taller LIM" });
    expect(texto(f)).toBe("Felipe cambió la ubicación de Angie de Tienda TRU a Taller LIM.");
  });
  it("una persona que ya no se puede nombrar no rompe la frase", () => {
    expect(texto(fraseEvento({ ...base, accion: "baja", persona_nombre: null }))).toBe("Felipe quitó el acceso a una persona.");
  });
});

describe("vistaDe (dos secciones; los enlaces viejos siguen funcionando)", () => {
  it("sin nada o con cualquier otra cosa abre Cuentas ▸ Personas ▸ Activas", () => {
    expect(vistaDe(undefined)).toEqual({ seccion: "cuentas", tipo: "personas", estado: "activas", actividad: false });
    expect(vistaDe("otra")).toEqual(vistaDe(undefined));
    expect(vistaDe("activos")).toEqual(vistaDe(undefined));
  });
  it("cada pestaña vieja cae en su sección y su filtro", () => {
    expect(vistaDe("roles").seccion).toBe("roles");
    expect(vistaDe("terminales")).toMatchObject({ seccion: "cuentas", tipo: "terminales" });
    expect(vistaDe("pendientes")).toMatchObject({ seccion: "cuentas", estado: "pendientes" });
    expect(vistaDe("suspendidos").estado).toBe("suspendidas");
    expect(vistaDe("inactivas").estado).toBe("inactivas");
    expect(vistaDe("actividad")).toMatchObject({ seccion: "cuentas", actividad: true });
  });
});
