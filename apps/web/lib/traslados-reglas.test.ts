import { describe, it, expect } from "vitest";
import { estaAtrasado } from "./traslados-reglas";

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
