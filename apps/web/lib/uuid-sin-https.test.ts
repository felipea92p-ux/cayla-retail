import { describe, expect, it } from "vitest";
import { SCRIPT_UUID_SIN_HTTPS } from "./uuid-sin-https";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function correr(crypto: unknown) {
  new Function("window", SCRIPT_UUID_SIN_HTTPS)({ crypto });
}

describe("SCRIPT_UUID_SIN_HTTPS", () => {
  it("define randomUUID cuando falta (página por HTTP) y devuelve UUID v4 distintos", () => {
    const c: { getRandomValues: typeof globalThis.crypto.getRandomValues; randomUUID?: () => string } = {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    };
    correr(c);
    expect(typeof c.randomUUID).toBe("function");
    const ids = new Set(Array.from({ length: 200 }, () => c.randomUUID!()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it("no pisa el randomUUID que el navegador ya trae", () => {
    const propio = () => "propio";
    const c = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto), randomUUID: propio };
    correr(c);
    expect(c.randomUUID).toBe(propio);
  });

  it("no hace nada, ni falla, si ni siquiera hay getRandomValues", () => {
    expect(() => correr({})).not.toThrow();
    expect(() => correr(undefined)).not.toThrow();
  });
});
