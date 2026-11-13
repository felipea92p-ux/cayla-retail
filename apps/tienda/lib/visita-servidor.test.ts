import { afterEach, describe, expect, it, vi } from "vitest";

// Medir no puede tumbar nada (principio 9): si la base no contesta, anotar no lanza; deja una línea en el registro y sigue.
const consulta = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("./base", () => ({ base: () => consulta }));

const { anotarPasos } = await import("./visita-servidor");

afterEach(() => {
  consulta.mockReset();
  vi.restoreAllMocks();
});

describe("anotarPasos", () => {
  it("con la base caída no lanza: anota el fallo en el registro y sigue", async () => {
    consulta.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(anotarPasos("0b0b0b0b-0000-4000-8000-000000000001", [{ paso: 0, camino: "qr" }], null)).resolves.toBeUndefined();
    expect(registro).toHaveBeenCalledWith(JSON.stringify({ evento: "trafico_anotar", mensaje: "connect ECONNREFUSED 127.0.0.1:5432" }));
  });

  it("sin pasos no le pregunta nada a la base", async () => {
    await anotarPasos("0b0b0b0b-0000-4000-8000-000000000001", [], null);
    expect(consulta).not.toHaveBeenCalled();
  });
});
