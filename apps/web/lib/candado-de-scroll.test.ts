import { describe, expect, it } from "vitest";
import { crearCandado, type RaizDeLaPagina } from "./candado-de-scroll";

// El candado de lo de atrás (ADR-0715): lo pone la primera hoja, lo quita la última y lo de antes vuelve tal cual.

function paginaDePrueba(ancho: number, inicial: Record<string, string> = {}) {
  const estilo = new Map(Object.entries(inicial));
  const cambios: string[] = [];
  const raiz: RaizDeLaPagina = {
    clientWidth: ancho,
    style: {
      getPropertyValue: (p: string) => estilo.get(p) ?? "",
      setProperty: (p: string, v: string | null) => {
        cambios.push(`${p}=${v}`);
        estilo.set(p, v ?? "");
      },
      removeProperty: (p: string) => {
        cambios.push(`-${p}`);
        const antes = estilo.get(p) ?? "";
        estilo.delete(p);
        return antes;
      },
    },
  };
  return { raiz, estilo, cambios };
}

describe("el candado de lo de atrás", () => {
  it("una hoja: bloquea al abrir y deja la página como estaba al cerrar", () => {
    const { raiz, estilo } = paginaDePrueba(1440);
    const soltar = crearCandado(() => raiz, () => 1440)();
    expect(estilo.get("overflow")).toBe("hidden");
    expect(estilo.has("scrollbar-gutter")).toBe(false); // sin barra que ocupe lugar (Mac, celular): nada que guardar
    soltar();
    expect(estilo.size).toBe(0);
  });

  it("con una barra que ocupa lugar (Windows) guarda su hueco para que nada salte de lado", () => {
    const { raiz, estilo } = paginaDePrueba(1425);
    const soltar = crearCandado(() => raiz, () => 1440)();
    expect(estilo.get("scrollbar-gutter")).toBe("stable");
    soltar();
    expect(estilo.has("scrollbar-gutter")).toBe(false);
  });

  it("una hoja sobre otra: lo pone la primera y lo quita la última, sin tocar la página en el medio", () => {
    const { raiz, estilo, cambios } = paginaDePrueba(1440);
    const bloquear = crearCandado(() => raiz, () => 1440);
    const soltarA = bloquear();
    const soltarB = bloquear();
    expect(cambios).toEqual(["overflow=hidden"]);
    soltarA();
    expect(estilo.get("overflow")).toBe("hidden");
    soltarB();
    expect(estilo.has("overflow")).toBe(false);
    expect(cambios).toEqual(["overflow=hidden", "-overflow", "-scrollbar-gutter"]);
  });

  it("soltar dos veces no suelta la hoja de otro (React monta y desmonta cada efecto dos veces en desarrollo)", () => {
    const { raiz, estilo } = paginaDePrueba(1440);
    const bloquear = crearCandado(() => raiz, () => 1440);
    const soltarA = bloquear();
    const soltarB = bloquear();
    soltarA();
    soltarA();
    expect(estilo.get("overflow")).toBe("hidden");
    soltarB();
    expect(estilo.has("overflow")).toBe(false);
  });

  it("devuelve lo que la página ya tenía puesto", () => {
    const { raiz, estilo } = paginaDePrueba(1440, { overflow: "clip" });
    const soltar = crearCandado(() => raiz, () => 1440)();
    expect(estilo.get("overflow")).toBe("hidden");
    soltar();
    expect(estilo.get("overflow")).toBe("clip");
  });

  it("después de cerrar todo, la siguiente hoja vuelve a bloquear y a medir la barra", () => {
    let ancho = 1440;
    const { raiz, estilo } = paginaDePrueba(1425);
    const bloquear = crearCandado(() => raiz, () => ancho);
    bloquear()();
    ancho = 1425; // la página ya no tiene barra: no se reserva su hueco
    bloquear();
    expect(estilo.get("overflow")).toBe("hidden");
    expect(estilo.has("scrollbar-gutter")).toBe(false);
  });

  it("fuera del navegador no hace nada ni se cae", () => {
    const soltar = crearCandado(() => null, () => 0)();
    expect(() => soltar()).not.toThrow();
  });
});
