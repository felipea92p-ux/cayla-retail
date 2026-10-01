import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, fraseDeLoQueFalta, sePuedeConfirmar, siguienteDe, type CampoDeGuia } from "./guia-campos";

const campo = (id: string, o: Partial<CampoDeGuia> = {}): CampoDeGuia => ({ id, nombre: id, requerido: true, hecho: false, pendiente: `Llena ${id}.`, ...o });

describe("estadosDe — cuál está hecho, cuál sigue y cuál falta", () => {
  it("el primer campo por hacer es «ahora»; los demás requeridos, «falta»; lo no requerido, «opcional»", () => {
    const e = estadosDe([campo("monto"), campo("motivo"), campo("nota", { requerido: false })]);
    expect(e).toEqual({ monto: "ahora", motivo: "falta", nota: "opcional" });
  });

  it("al hacerse uno, «ahora» pasa al siguiente y el hecho lleva ✓", () => {
    const e = estadosDe([campo("monto", { hecho: true }), campo("motivo"), campo("nota", { requerido: false })]);
    expect(e).toEqual({ monto: "hecho", motivo: "ahora", nota: "opcional" });
  });

  it("un opcional no es «ahora» aunque esté antes; y si lo llenaron lleva ✓", () => {
    const e = estadosDe([campo("nota", { requerido: false, hecho: true }), campo("motivo")]);
    expect(e).toEqual({ nota: "hecho", motivo: "ahora" });
    expect(estadosDe([campo("nota", { requerido: false }), campo("motivo")]).nota).toBe("opcional");
  });

  it("un sugerido puede ser «ahora» (se señala) pero no bloquea", () => {
    const campos = [campo("color", { requerido: false, sugerido: true })];
    expect(estadosDe(campos).color).toBe("ahora");
    expect(sePuedeConfirmar(campos)).toBe(true);
  });

  it("con todo hecho no hay «ahora»", () => {
    const e = estadosDe([campo("a", { hecho: true }), campo("b", { hecho: true })]);
    expect(Object.values(e).filter((s) => s === "ahora")).toHaveLength(0);
    expect(siguienteDe([campo("a", { hecho: true })])).toBeNull();
  });

  it("un grupo (al menos uno de tres datos) es UN campo virtual: hecho apenas uno tiene algo", () => {
    const dni = "", nombre = "Ana", whatsapp = "";
    const campos = [campo("identificacion", { nombre: "Identificación", hecho: [dni, nombre, whatsapp].some((v) => v.trim() !== "") })];
    expect(estadosDe(campos).identificacion).toBe("hecho");
    expect(estadosDe([campo("identificacion", { hecho: false })]).identificacion).toBe("ahora");
  });
});

describe("faltanDe, sePuedeConfirmar y fraseDeLoQueFalta", () => {
  it("faltanDe lista lo requerido y lo sugerido sin hacer, en orden, y no lo opcional", () => {
    const c = [campo("a", { hecho: true }), campo("b"), campo("c", { requerido: false }), campo("d", { requerido: false, sugerido: true })];
    expect(faltanDe(c).map((x) => x.id)).toEqual(["b", "d"]);
  });

  it("solo lo requerido impide confirmar", () => {
    expect(sePuedeConfirmar([campo("a", { hecho: true }), campo("n", { requerido: false })])).toBe(true);
    expect(sePuedeConfirmar([campo("a")])).toBe(false);
  });

  it("la frase nombra lo que bloquea (singular, plural) y es null si nada bloquea", () => {
    expect(fraseDeLoQueFalta([campo("a", { nombre: "Monto" })])).toBe("Falta: monto");
    expect(fraseDeLoQueFalta([campo("a", { nombre: "Monto" }), campo("b", { nombre: "Motivo" }), campo("c", { nombre: "Quién" })])).toBe("Faltan: monto, motivo y quién");
    expect(fraseDeLoQueFalta([campo("a", { hecho: true }), campo("s", { requerido: false, sugerido: true })])).toBeNull();
  });
});

describe("enFoco — la luz espera a que la persona termine de escribir", () => {
  // «Nuevo color»: con una letra el nombre ya es «hecho», pero la persona sigue tecleando.
  const nuevoColor = (o: { nombre?: string; codigo?: string; familiaElegida?: boolean; hex?: boolean } = {}) => [
    campo("nombre", { hecho: (o.nombre ?? "") !== "" }),
    campo("codigo", { hecho: (o.codigo ?? "").length === 3 }),
    campo("familia", { requerido: false, sugerido: true, hecho: o.familiaElegida ?? false }),
    campo("color", { hecho: o.hex ?? false }),
    campo("responsable"),
  ];

  it("sin foco, con una letra el nombre ya es ✓ y la luz salta al código (lo de antes)", () => {
    expect(estadosDe(nuevoColor({ nombre: "V" })).nombre).toBe("hecho");
    expect(estadosDe(nuevoColor({ nombre: "V" })).codigo).toBe("ahora");
  });

  it("escribiendo en el nombre, este conserva la luz aunque ya tenga una letra: sin ✓ y nada más se enciende", () => {
    const e = estadosDe(nuevoColor({ nombre: "V" }), "nombre");
    expect(e.nombre).toBe("ahora");
    expect(Object.values(e).filter((s) => s === "ahora")).toHaveLength(1);
    expect(e.codigo).toBe("falta");
  });

  it("al salir del nombre (sin foco), la luz pasa al siguiente y el nombre lleva ✓", () => {
    const e = estadosDe(nuevoColor({ nombre: "Verde botella", codigo: "VEB" }), null);
    expect(e.nombre).toBe("hecho");
    expect(e.codigo).toBe("hecho");
    expect(e.familia).toBe("ahora");
  });

  it("con el código sugerido puesto, la luz pasa por Familia (sugerida) antes de Color; elegirla la deja ✓", () => {
    expect(siguienteDe(nuevoColor({ nombre: "Verde botella", codigo: "VEB" }))?.id).toBe("familia");
    expect(siguienteDe(nuevoColor({ nombre: "Verde botella", codigo: "VEB", familiaElegida: true }))?.id).toBe("color");
  });

  it("Familia sin elegir no bloquea: solo lo requerido cuenta", () => {
    const listos = [campo("nombre", { hecho: true }), campo("familia", { requerido: false, sugerido: true })];
    expect(sePuedeConfirmar(listos)).toBe(true);
    expect(fraseDeLoQueFalta(listos)).toBeNull();
  });

  it("un campo opcional con foco no le quita la luz a lo que sigue", () => {
    const campos = [campo("nombre"), campo("nota", { requerido: false })];
    expect(estadosDe(campos, "nota")).toEqual({ nombre: "ahora", nota: "opcional" });
  });

  it("un id que no existe en la lista no cambia nada", () => {
    expect(estadosDe(nuevoColor({ nombre: "V" }), "fantasma")).toEqual(estadosDe(nuevoColor({ nombre: "V" })));
  });

  it("escribiendo en un campo sin hacer que no es el primero, la luz lo acompaña", () => {
    const e = estadosDe(nuevoColor(), "color");
    expect(e.color).toBe("ahora");
    expect(e.nombre).toBe("falta");
  });

  it("el foco no cambia lo que falta ni lo que se puede confirmar", () => {
    const campos = nuevoColor({ nombre: "V" });
    expect(faltanDe(campos).map((c) => c.id)).toEqual(["codigo", "familia", "color", "responsable"]);
    expect(sePuedeConfirmar(campos)).toBe(false);
  });
});

describe("campos de varias opciones (tallas, colores) con el foco retenido", () => {
  it("con la luz retenida en Tallas —ya hecha con una elegida— no salta a Colores; al soltarla, sí", () => {
    const campos = [campo("tallas", { hecho: true }), campo("colores", { requerido: false, sugerido: true })];
    expect(estadosDe(campos).colores).toBe("ahora");
    expect(estadosDe(campos, "tallas")).toEqual({ tallas: "ahora", colores: "falta" });
    expect(estadosDe(campos, null)).toEqual({ tallas: "hecho", colores: "ahora" });
  });
});
