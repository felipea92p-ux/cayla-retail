import { describe, it, expect } from "vitest";
import { estaAtrasado, llegaHoy, textoPrendas, vistaTraslado } from "./traslados-reglas";

describe("estaAtrasado", () => {
  const ahora = "2026-09-16T12:00:00.000Z";

  it("cerrada nunca está atrasada, aunque la ETA ya haya pasado", () => {
    expect(estaAtrasado("2026-09-15T00:00:00.000Z", "cerrada", ahora)).toBe(false);
  });

  it("en_transito con ETA en el pasado: atrasado", () => {
    expect(estaAtrasado("2026-09-16T11:00:00.000Z", "en_transito", ahora)).toBe(true);
  });

  it("en_transito con ETA en el futuro: no atrasado", () => {
    expect(estaAtrasado("2026-09-17T00:00:00.000Z", "en_transito", ahora)).toBe(false);
  });

  it("recibido_con_diferencia con ETA vencida también cuenta como atrasado", () => {
    expect(estaAtrasado("2026-09-16T00:00:00.000Z", "recibido_con_diferencia", ahora)).toBe(true);
  });
});

describe("vistaTraslado", () => {
  const base = { ubicacionOrigenId: "lima", ubicacionDestinoId: "trujillo" };

  it("en tránsito hacia mi sede: me toca confirmar; desde mi sede: en camino", () => {
    expect(vistaTraslado({ ...base, estado: "en_transito" }, "trujillo")).toBe("por_confirmar");
    expect(vistaTraslado({ ...base, estado: "en_transito" }, "lima")).toBe("en_camino");
  });

  it("con diferencia se lee igual desde las dos puntas", () => {
    expect(vistaTraslado({ ...base, estado: "recibido_con_diferencia" }, "lima")).toBe("con_diferencia");
    expect(vistaTraslado({ ...base, estado: "recibido_con_diferencia" }, "trujillo")).toBe("con_diferencia");
  });

  it("cerrada y completada (modelo anterior) son historial", () => {
    expect(vistaTraslado({ ...base, estado: "cerrada" }, "lima")).toBe("cerrado");
    expect(vistaTraslado({ ...base, estado: "completada" }, "lima")).toBe("cerrado");
    expect(estaAtrasado("2026-09-15T00:00:00.000Z", "completada", "2026-09-16T12:00:00.000Z")).toBe(false);
  });
});

describe("textoPrendas", () => {
  it("nombra las primeras y cuenta el resto", () => {
    expect(textoPrendas(["Blusa Emma", "Vestido Sofía", "Falda Renata", "Pantalón Carla"])).toBe("Blusa Emma, Vestido Sofía +2");
    expect(textoPrendas(["Blusa Emma"])).toBe("Blusa Emma");
    expect(textoPrendas([])).toBe("Sin prendas");
  });
});

describe("llegaHoy", () => {
  it("compara en día de Lima, no en UTC", () => {
    // 23:30 del 16 en Lima es 04:30 del 17 en UTC.
    expect(llegaHoy("2026-09-17T04:30:00.000Z", "2026-09-16")).toBe(true);
    expect(llegaHoy("2026-09-17T12:00:00.000Z", "2026-09-16")).toBe(false);
  });
});
