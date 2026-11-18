import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import { PUENTES } from "./puentes";

describe("PUENTES: el camino a cada pantalla con id", () => {
  it("cada pantalla, su madre y cada paso existen, y el paso tiene pieza", () => {
    for (const [hija, puente] of Object.entries(PUENTES)) {
      const guiaHija = GUIAS.find((g) => g.id === hija);
      const madre = GUIAS.find((g) => g.id === puente.desde);
      expect(guiaHija?.ruta, hija).toContain("[");
      expect(madre, `${hija} ← ${puente.desde}`).toBeDefined();
      for (const p of puente.pasos) expect(madre?.pasos.find((x) => x.id === p.pasoId)?.ancla, `${puente.desde}.${p.pasoId}`).toBeTruthy();
    }
  });
});
