import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, fraseDeLoQueFalta, sePuedeConfirmar } from "./guia-campos";
import { camposFicha, puedeCambiarRol, type EstadoFicha, type PanelFicha } from "./ficha-colaborador-guia";

const base: EstadoFicha = {
  panel: null,
  responsableListo: true,
  responsableMotivo: null,
  rolElegido: false,
  pideSede: false,
  sedeElegida: false,
  motivo: "",
};

describe("guía de la ficha de una persona del Equipo", () => {
  it("sin un panel abierto no hay nada que guiar", () => {
    expect(camposFicha(base)).toEqual([]);
    expect(camposFicha({ ...base, responsableListo: false })).toEqual([]);
  });

  it("«Cambiar rol» recién abierto: lo que sigue es tocar el rol nuevo", () => {
    expect(estadosDe(camposFicha({ ...base, panel: "rol" }))).toEqual({ "ficha-responsable": "hecho", "ficha-rol": "ahora" });
  });

  it("sin quién lo hace, se enciende el combo primero, con la frase del propio combo", () => {
    const campos = camposFicha({ ...base, panel: "rol", responsableListo: false, responsableMotivo: "Elige quién está atendiendo en TRU." });
    expect(estadosDe(campos)["ficha-responsable"]).toBe("ahora");
    expect(campos[0].pendiente).toBe("Elige quién está atendiendo en TRU.");
  });

  it("al bajar a un líder sin sede aparece «Sede donde queda» y el botón dice qué le falta", () => {
    const campos = camposFicha({ ...base, panel: "rol", rolElegido: true, pideSede: true });
    expect(estadosDe(campos)).toEqual({ "ficha-responsable": "hecho", "ficha-rol": "hecho", "ficha-sede": "ahora" });
    expect(fraseDeLoQueFalta(campos)).toBe("Falta: sede donde queda");
    expect(sePuedeConfirmar(camposFicha({ ...base, panel: "rol", rolElegido: true, pideSede: true, sedeElegida: true }))).toBe(true);
  });

  it("la sede solo entra a la guía cuando el rol elegido la pide", () => {
    expect(camposFicha({ ...base, panel: "rol", pideSede: true }).map((c) => c.id)).toEqual(["ficha-responsable", "ficha-rol"]);
    expect(camposFicha({ ...base, panel: "rol", rolElegido: true }).map((c) => c.id)).toEqual(["ficha-responsable", "ficha-rol"]);
  });

  it("«Suspender»: el motivo es opcional y nunca bloquea", () => {
    const campos = camposFicha({ ...base, panel: "suspender" });
    expect(estadosDe(campos)).toEqual({ "ficha-responsable": "hecho", "ficha-motivo": "opcional" });
    expect(faltanDe(campos)).toEqual([]);
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(estadosDe(camposFicha({ ...base, panel: "suspender", motivo: "Licencia" }))["ficha-motivo"]).toBe("hecho");
    expect(estadosDe(camposFicha({ ...base, panel: "suspender", motivo: "   " }))["ficha-motivo"]).toBe("opcional");
  });

  it("cambiar la sede, reactivar y quitar el acceso solo piden quién lo hace", () => {
    for (const panel of ["sede", "reactivar", "quitar"] as const) {
      expect(camposFicha({ ...base, panel }).map((c) => c.id)).toEqual(["ficha-responsable"]);
      expect(sePuedeConfirmar(camposFicha({ ...base, panel }))).toBe(true);
      expect(fraseDeLoQueFalta(camposFicha({ ...base, panel, responsableListo: false }))).toBe("Falta: quién lo hace");
    }
  });

  // La coherencia que importa: «se puede confirmar» según la guía ⇔ lo que deja tocar el botón de cada panel.
  it("coincide con lo que apaga cada botón, en cada combinación", () => {
    const si = [true, false];
    const paneles: PanelFicha[] = ["rol", "sede", "suspender", "quitar", "reactivar"];
    for (const panel of paneles)
      for (const responsableListo of si)
        for (const rolElegido of si)
          for (const pideSede of si)
            for (const sedeElegida of si)
              for (const motivo of ["", "Licencia"]) {
                const f: EstadoFicha = { ...base, panel, responsableListo, rolElegido, pideSede, sedeElegida, motivo };
                const boton = panel === "rol" ? puedeCambiarRol(f) : responsableListo;
                expect(sePuedeConfirmar(camposFicha(f)), JSON.stringify(f)).toBe(boton);
              }
  });
});
