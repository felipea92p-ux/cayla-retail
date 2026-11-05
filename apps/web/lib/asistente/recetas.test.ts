import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import { candidatasDeReceta, DATOS, datoDicho, pasosDeReceta, RECETAS, recetasAlcanzables } from "./recetas";
import { pasoGuarda, revisarTarea } from "./tarea";

describe("RECETAS: caminos escritos una vez, al día con las guías", () => {
  it("cada paso existe en su guía y tiene pieza, y ninguna receta se repite", () => {
    expect(new Set(RECETAS.map((r) => r.id)).size).toBe(RECETAS.length);
    for (const r of RECETAS) {
      for (const p of r.pasos) {
        const paso = GUIAS.find((g) => g.id === p.guia)?.pasos.find((x) => x.id === p.paso);
        expect(paso?.ancla, `${r.id}: ${p.guia}#${p.paso}`).toBeTruthy();
      }
    }
  });
  it("cada receta termina en el paso que guarda (lo hace la persona)", () => {
    for (const r of RECETAS) {
      const ultimo = r.pasos.at(-1)!;
      const ancla = GUIAS.find((g) => g.id === ultimo.guia)?.pasos.find((x) => x.id === ultimo.paso)?.ancla ?? null;
      expect(pasoGuarda({ ancla }), `${r.id} termina en ${ancla}`).toBe(true);
    }
  });
  it("una orden solo nombra datos conocidos, y si nombra uno trae su texto sin dato", () => {
    for (const r of RECETAS) {
      for (const p of r.pasos) {
        const nombrados = [...p.orden.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const d of nombrados) expect(DATOS, `${r.id}: {${d}}`).toContain(d);
        if (nombrados.length) expect(p.sinDato, `${r.id}#${p.paso}`).toBeTruthy();
      }
    }
  });
});

describe("los datos solo valen si la persona los dijo", () => {
  const vender = RECETAS.find((r) => r.id === "vender")!;
  it("los que dijo entran a la orden; los que la IA inventó, no", () => {
    const pregunta = "kiero bender una blusa emma negro talla m, paga con yape y quiere boleta";
    const pasos = pasosDeReceta(vender, { prenda: "blusa emma", medio: "Yape", comprobante: "Factura" }, pregunta);
    expect(pasos.find((p) => p.paso_id === "buscador")?.rellenar).toBe("blusa emma");
    expect(pasos.find((p) => p.paso_id === "cobro-medio")?.orden).toBe("Elige Yape");
    // Dijo «boleta», la IA puso «Factura»: no vale, queda la orden sin dato.
    expect(pasos.find((p) => p.paso_id === "cobro-comprobante")?.orden).toBe("Marca Boleta o Factura");
  });
  it("datoDicho compara sin tildes ni mayúsculas", () => {
    expect(datoDicho("Transferencia", "me paga por transferéncia")).toBe("Transferencia");
    expect(datoDicho("Trujillo", "a la tienda de trujiyo")).toBeNull();
    expect(datoDicho("", "algo")).toBeNull();
  });
  it("la receta de vender pasa por la revisión y termina confirmando el cobro", () => {
    const pregunta = "vender una blusa emma negro talla m con yape y boleta";
    const alcanzables = new Map([["vender", "/vender"]]);
    const t = revisarTarea(pasosDeReceta(vender, { prenda: "blusa emma", medio: "yape", comprobante: "boleta" }, pregunta), candidatasDeReceta(vender, GUIAS, alcanzables), "/", pregunta);
    expect(t.at(-1)?.pasoId).toBe("cobro-confirmar");
    expect(t.find((p) => p.pasoId === "resultados")?.orden).toBe("Toca Negro · talla M en la lista");
  });
});

describe("recetasAlcanzables: solo las que el rol puede hacer entera", () => {
  it("sin Productos no se ofrece agregar un color; con Productos sí (Editar producto se abre desde ahí)", () => {
    expect(recetasAlcanzables(new Map([["vender", "/vender"]])).map((r) => r.id)).toEqual(["vender"]);
    expect(recetasAlcanzables(new Map([["productos", "/productos"]])).map((r) => r.id)).toContain("agregar-color");
  });
});
