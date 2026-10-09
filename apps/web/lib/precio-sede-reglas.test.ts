import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import {
  camposPonerPrecio,
  desdeHace,
  fraseDiferencia,
  leerMonto,
  leerPreciosDeSede,
  muyLejos,
  tiendasLibres,
} from "./precio-sede-reglas";

describe("leerMonto", () => {
  it("acepta como lo escribe la gente", () => {
    expect(leerMonto("129.90")).toBe(129.9);
    expect(leerMonto("129,90")).toBe(129.9);
    expect(leerMonto("S/ 129.90")).toBe(129.9);
    expect(leerMonto(" 129 ")).toBe(129);
  });
  it("rechaza lo que no es un precio", () => {
    for (const t of ["", "0", "-5", "abc", "12.345", "1.2.3", "1,299.90"]) expect(leerMonto(t)).toBeNull();
  });
});

describe("diferencia con el general", () => {
  it("dice cuánto más o menos", () => {
    expect(fraseDiferencia(129.9, 119.9)).toBe("S/ 10.00 más que el general (+8 %)");
    expect(fraseDiferencia(109.9, 119.9)).toBe("S/ 10.00 menos que el general (−8 %)");
    expect(fraseDiferencia(119.9, 119.9)).toBe("igual que el general");
    expect(fraseDiferencia(100, null)).toBeNull();
  });
  it("avisa pasado el 30 %, en los dos sentidos", () => {
    expect(muyLejos(1299, 119.9)).toBe(true);
    expect(muyLejos(50, 119.9)).toBe(true);
    expect(muyLejos(150, 119.9)).toBe(false);
    expect(muyLejos(null, 119.9)).toBe(false);
  });
});

describe("desdeHace", () => {
  const ahora = new Date(2026, 9, 9, 18, 0);
  it("cuenta días de calendario", () => {
    expect(desdeHace(new Date(2026, 9, 9, 8, 0).toISOString(), ahora)).toBe("desde hoy");
    expect(desdeHace(new Date(2026, 9, 8, 23, 0).toISOString(), ahora)).toBe("desde ayer");
    expect(desdeHace(new Date(2026, 8, 24).toISOString(), ahora)).toBe("desde hace 15 días");
    expect(desdeHace(new Date(2026, 5, 1).toISOString(), ahora)).toBe("desde hace 4 meses");
  });
});

describe("tiendas y precio", () => {
  const precios = leerPreciosDeSede([
    { ubicacion_id: "aqp", sede: "Tienda Arequipa", precio: "129.90", variantes: 6, desde: "2026-10-01", motivo: "Mercado", creado_por_nombre: "Lucía" },
  ]);
  it("lee la fila de la base con el precio como número", () => {
    expect(precios[0].precio).toBe(129.9);
  });
  it("ofrece solo las tiendas que aún no tienen precio propio", () => {
    expect(tiendasLibres([{ id: "aqp" }, { id: "tru" }], precios).map((t) => t.id)).toEqual(["tru"]);
  });
});

describe("la guía de «Precio distinto en una sede»", () => {
  const base: Parameters<typeof camposPonerPrecio>[0] = { tiendaId: "aqp", monto: "129.90", general: 119.9, motivo: "Mercado", responsableListo: true, responsableMotivo: null };
  it("con todo, se puede guardar", () => {
    expect(sePuedeConfirmar(camposPonerPrecio(base))).toBe(true);
  });
  it("lo que falta coincide con lo que la base rechaza", () => {
    const falta = (h: Partial<typeof base>) => camposPonerPrecio({ ...base, ...h }).filter((c) => !c.hecho).map((c) => c.id);
    expect(falta({ tiendaId: null })).toEqual(["tienda"]);
    expect(falta({ monto: "" })).toEqual(["precio"]);
    expect(falta({ monto: "0" })).toEqual(["precio"]);
    expect(falta({ monto: "119.90" })).toEqual(["precio"]); // igual al general: la base dice «ya es el precio general»
    expect(falta({ motivo: "  " })).toEqual(["motivo"]);
    expect(falta({ responsableListo: false })).toEqual(["responsable"]);
  });
  it("un precio muy lejos NO bloquea: solo pregunta", () => {
    expect(sePuedeConfirmar(camposPonerPrecio({ ...base, monto: "1299" }))).toBe(true);
  });
});
