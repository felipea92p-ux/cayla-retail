import { describe, expect, it } from "vitest";
import { semanaConCambio, semanaConFondo, semanaDelMesConCambio } from "./metas-frescas-reglas";

// /chaos, gravedad 2 (2026-11-04): con dos pestañas, guardar desde una página vieja mandaba lo que esa página tenía y borraba lo recién cambiado en la otra.
// Lo que se manda sale de lo último que hay en la base, con solo el dato que la persona tocó.
const fresca = { metas: [2222, null, 3000, null, null, null, null], fondo: 300 };

describe("guardar desde una página vieja no pisa lo de otra", () => {
  it("cambiar el fondo conserva las metas de la base", () => {
    expect(semanaConFondo(fresca, "555")).toEqual({ metas: ["2222", "", "3000", "", "", "", ""], fondo: "555" });
  });

  it("cambiar una meta conserva el fondo y los demás días de la base", () => {
    expect(semanaConCambio(fresca, 1, "1500")).toEqual({ metas: ["2222", "1500", "3000", "", "", "", ""], fondo: "300" });
  });

  it("vaciar un día solo vacía ese día; un fondo sin dato sigue sin dato", () => {
    expect(semanaConCambio({ metas: fresca.metas, fondo: null }, 0, "")).toEqual({ metas: ["", "", "3000", "", "", "", ""], fondo: "" });
  });

  it("en la semana de un mes, solo cambia el día tocado", () => {
    expect(semanaDelMesConCambio([100, 200, null, null, null, null, null], 2, "300")).toEqual(["100", "200", "300", "", "", "", ""]);
  });
});
