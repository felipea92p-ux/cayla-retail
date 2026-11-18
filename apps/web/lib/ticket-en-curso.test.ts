import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOMBRE_RECUPERADO, queHacerConLaFoto, recuperarEnLaEspera } from "./ticket-en-curso";

// ADR-0674, Fase 2 · el ticket que se está armando sobrevive a que Android cierre la pestaña.

const linea = (varianteId: string, cantidad = 1) => ({ varianteId, cantidad, referencia: "Blusa Emma", precio: 79.9 });
const ticket = (id: string, nombre?: string) => ({ id, creadoEn: "2026-11-17T15:00:00Z", carrito: [linea("v1")], nota: "", nombre, clienta: null });

describe("queHacerConLaFoto: cuándo se guarda", () => {
  it("con prendas y sin cobro en el aire, se guarda", () => {
    expect(queHacerConLaFoto(2, false)).toBe("guardar");
  });

  it("sin prendas no hay nada que recuperar", () => {
    expect(queHacerConLaFoto(0, false)).toBe("borrar");
  });

  it("con un cobro en el aire, NUNCA: si la pestaña muere ahí, el ticket ya cobrado no puede volver", () => {
    expect(queHacerConLaFoto(3, true)).toBe("borrar");
  });
});

describe("recuperarEnLaEspera: al volver a Vender", () => {
  it("la foto entra al final de la espera, con un id nuevo y su nombre", () => {
    const r = recuperarEnLaEspera([ticket("a", "Cliente 1")], ticket("en-curso", "Cliente 2"), false, "nuevo");
    expect(r.espera.map((t) => [t.id, t.nombre])).toEqual([
      ["a", "Cliente 1"],
      ["nuevo", "Cliente 2"],
    ]);
    expect(r.recuperado?.id).toBe("nuevo");
  });

  it("sin nombre, se llama «Recuperado» para que se reconozca", () => {
    const vacia: ReturnType<typeof ticket>[] = [];
    expect(recuperarEnLaEspera(vacia, ticket("en-curso"), false, "n").recuperado?.nombre).toBe(NOMBRE_RECUPERADO);
    expect(recuperarEnLaEspera(vacia, ticket("en-curso", "  "), false, "n").recuperado?.nombre).toBe(NOMBRE_RECUPERADO);
  });

  it("con la caja cerrada no se recupera (como la espera)", () => {
    const r = recuperarEnLaEspera([ticket("a")], ticket("en-curso"), true, "n");
    expect(r.recuperado).toBeNull();
    expect(r.espera).toHaveLength(1);
  });

  it("sin foto, o una rota, vieja o vacía, no se recupera nada y la espera queda igual", () => {
    const espera = [ticket("a")];
    for (const foto of [null, undefined, "texto", 42, {}, { carrito: [] }, { carrito: "x" }, { carrito: [{ varianteId: 1, cantidad: 1 }] }, { carrito: [{ varianteId: "v", cantidad: 0 }] }]) {
      const r = recuperarEnLaEspera(espera, foto, false, "n");
      expect(r.recuperado, JSON.stringify(foto)).toBeNull();
      expect(r.espera).toEqual(espera);
    }
  });

  it("no toca la espera que recibe", () => {
    const espera = [ticket("a")];
    recuperarEnLaEspera(espera, ticket("en-curso"), false, "n");
    expect(espera).toHaveLength(1);
  });
});

describe("el cableado en Vender (lo que esta regla no puede probar sola)", () => {
  const vender = readFileSync("components/PuntoDeVenta.tsx", "utf8");
  const cuerpo = (nombre: string) => {
    const i = vender.indexOf(`function ${nombre}(`);
    return i < 0 ? "" : vender.slice(i, vender.indexOf("\n  }\n", i));
  };

  it("al anotar el cobro, la foto se borra en el mismo instante y se bloquea hasta que el cobro se resuelva", () => {
    const anotar = cuerpo("anotarCobro");
    expect(anotar).toContain('borrar(claveFoto, "pestana")');
    expect(anotar).toContain("setFotoBloqueada(true)");
  });

  it("la foto vive en la pestaña (sessionStorage), no en el aparato", () => {
    expect(vender).toMatch(/guardar\(claveFoto, [\s\S]*?, "pestana"\)/);
    expect(vender).toMatch(/leer\(claveFoto, null, "pestana"\)/);
  });
});
