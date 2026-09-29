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
