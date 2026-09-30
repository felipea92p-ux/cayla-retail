import { describe, expect, it } from "vitest";
import { fraseCostoAtipico, leerCostoAtipico, MOTIVOS_COSTO_ATIPICO, type CostoAtipico } from "./costo-atipico-reglas";
import { soles } from "./compras-reglas";

const detalle = (o: Record<string, unknown>) => JSON.stringify(o);
const error = (o: Record<string, unknown>) => ({ message: "costo_atipico", details: detalle(o) });

describe("leerCostoAtipico", () => {
  it("lee lo que la base contesta: motivo, costo por prenda, costo vigente, precio y talla", () => {
    expect(leerCostoAtipico(error({ motivo: "sube", costo_unitario: 70, costo_vigente: 32, precio: 79.9, sku: "BLU-EMMA-NEG-M" }))).toEqual({
      motivo: "sube",
      costoUnitario: 70,
      costoVigente: 32,
      precio: 79.9,
      sku: "BLU-EMMA-NEG-M",
    });
  });

  it("acepta los números como texto (así viaja un numeric) y los ausentes como null", () => {
    expect(leerCostoAtipico(error({ motivo: "sin_costo", costo_unitario: "0.00", costo_vigente: null, precio: "79.90" }))).toEqual({
      motivo: "sin_costo",
      costoUnitario: 0,
      costoVigente: null,
      precio: 79.9,
      sku: null,
    });
  });

  it("los cuatro motivos de la base se reconocen", () => {
    for (const motivo of MOTIVOS_COSTO_ATIPICO) {
      expect(leerCostoAtipico(error({ motivo, costo_unitario: 1 }))?.motivo).toBe(motivo);
    }
  });

  it("el error de quien no es líder (sin cifras) NO es un costo atípico que se pueda confirmar", () => {
    expect(leerCostoAtipico({ message: "costo_atipico_sin_lider", details: null })).toBeNull();
    expect(leerCostoAtipico({ message: "costo_atipico_sin_lider", details: detalle({ motivo: "sube", costo_unitario: 70 }) })).toBeNull();
  });

  it("cualquier otra cosa devuelve null y nunca lanza: otro error, sin detalle, JSON roto, motivo desconocido, sin costo", () => {
    expect(leerCostoAtipico(null)).toBeNull();
    expect(leerCostoAtipico(undefined)).toBeNull();
    expect(leerCostoAtipico({ message: "La orden no existe", details: null })).toBeNull();
    expect(leerCostoAtipico({ message: "costo_atipico", details: null })).toBeNull();
    expect(leerCostoAtipico({ message: "costo_atipico", details: "{esto no es json" })).toBeNull();
    expect(leerCostoAtipico(error({ motivo: "otro", costo_unitario: 1 }))).toBeNull();
    expect(leerCostoAtipico(error({ motivo: "sube" }))).toBeNull();
    expect(leerCostoAtipico(error({ motivo: "sube", costo_unitario: "abc" }))).toBeNull();
  });
});

const base: CostoAtipico = { motivo: "sube", costoUnitario: 70, costoVigente: 32, precio: 79.9, sku: "BLU-EMMA-NEG-M" };

describe("fraseCostoAtipico", () => {
  it("sube: dice cuánto saldría cada prenda y cuántas veces su costo actual", () => {
    const f = fraseCostoAtipico(base);
    expect(f.titulo).toBe("El costo por prenda subió mucho");
    expect(f.detalle).toContain(soles(70));
    expect(f.detalle).toContain(soles(32));
    expect(f.detalle).toContain("BLU-EMMA-NEG-M");
    expect(f.detalle).toContain(`${(70 / 32).toLocaleString("es-PE", { maximumFractionDigits: 1 })} veces`);
  });

  it("baja: dice qué porcentaje del costo actual sería", () => {
    const f = fraseCostoAtipico({ ...base, motivo: "baja", costoUnitario: 15 });
    expect(f.titulo).toBe("El costo por prenda bajó mucho");
    expect(f.detalle).toContain(soles(15));
    expect(f.detalle).toContain("47 % de su costo actual");
  });

  it("sin costo: avisa del margen de 100 %", () => {
    const f = fraseCostoAtipico({ ...base, motivo: "sin_costo", costoUnitario: 0, costoVigente: null });
    expect(f.titulo).toBe("Esta orden no tiene costo");
    expect(f.detalle).toContain("margen de 100 %");
  });

  it("mayor que el precio: dice a cuánto se vende y que sería con pérdida", () => {
    const f = fraseCostoAtipico({ ...base, motivo: "mayor_que_precio", costoUnitario: 85 });
    expect(f.detalle).toContain(soles(85));
    expect(f.detalle).toContain(soles(79.9));
    expect(f.detalle).toContain("pérdida");
  });

  it("sin costo vigente ni talla no se rompe ni inventa cifras", () => {
    const sube = fraseCostoAtipico({ motivo: "sube", costoUnitario: 70, costoVigente: null, precio: null, sku: null });
    expect(sube.detalle).toBe(`Cada prenda saldría a ${soles(70)}, más del doble de su costo actual.`);
    const baja = fraseCostoAtipico({ motivo: "baja", costoUnitario: 5, costoVigente: 0, precio: null, sku: null });
    expect(baja.detalle).toBe(`Cada prenda saldría a ${soles(5)}, menos de dos tercios de su costo actual.`);
    const pierde = fraseCostoAtipico({ motivo: "mayor_que_precio", costoUnitario: 85, costoVigente: null, precio: null, sku: null });
    expect(pierde.detalle).toBe(`Cada prenda saldría a ${soles(85)}: se vendería con pérdida.`);
  });

  it("un costo negativo se muestra como S/ 0, no como una cifra rara", () => {
    expect(fraseCostoAtipico({ ...base, motivo: "sin_costo", costoUnitario: -3 }).detalle).toContain(soles(0));
  });
});
