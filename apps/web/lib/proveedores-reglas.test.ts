import { describe, expect, it } from "vitest";
import {
  chipEntregas,
  claveRubro,
  haceCuanto,
  inicialesMeses,
  ordenarProveedores,
  proveedorConRuc,
  repartoDeuda,
  resaltarCoincidencia,
  rubrosConConteo,
  serie12Meses,
  siguienteOrden,
  siguientePaso,
  subeEnCadaCompra,
  urlWhatsApp,
  variacionCosto,
  type EstadoProveedor,
} from "./proveedores-reglas";

describe("rubros", () => {
  it("«Tela», «tela » y «Telas ¹» se agrupan por clave, sin tildes ni mayúsculas", () => {
    expect(claveRubro("  Prénda  Terminada ")).toBe("prenda terminada");
    const r = rubrosConConteo([{ rubro: "Tela" }, { rubro: "tela " }, { rubro: "Avíos" }, { rubro: null }, { rubro: "Tela" }]);
    expect(r).toEqual([
      { clave: "tela", etiqueta: "Tela", conteo: 3 },
      { clave: "avios", etiqueta: "Avíos", conteo: 1 },
    ]);
  });
});

describe("ordenarProveedores", () => {
  const ps = [
    { nombre: "B", saldo: 100, facturado_12m: 50, ultima_compra: "2026-09-10" },
    { nombre: "A", saldo: null, facturado_12m: null, ultima_compra: null },
    { nombre: "C", saldo: 300, facturado_12m: 10, ultima_compra: "2026-09-15" },
  ];
  it("por saldo descendente, los vacíos siempre al final", () => {
    expect(ordenarProveedores(ps, { campo: "saldo", dir: "desc" }).map((p) => p.nombre)).toEqual(["C", "B", "A"]);
    expect(ordenarProveedores(ps, { campo: "saldo", dir: "asc" }).map((p) => p.nombre)).toEqual(["B", "C", "A"]);
  });
  it("por última compra (fecha) y por nombre", () => {
    expect(ordenarProveedores(ps, { campo: "ultima", dir: "desc" }).map((p) => p.nombre)).toEqual(["C", "B", "A"]);
    expect(ordenarProveedores(ps, { campo: "nombre", dir: "asc" }).map((p) => p.nombre)).toEqual(["A", "B", "C"]);
  });
  it("no muta la lista original", () => {
    ordenarProveedores(ps, { campo: "saldo", dir: "desc" });
    expect(ps[0].nombre).toBe("B");
  });
  it("siguienteOrden invierte el mismo campo y arranca en lo mayor primero", () => {
    expect(siguienteOrden({ campo: "saldo", dir: "desc" }, "saldo")).toEqual({ campo: "saldo", dir: "asc" });
    expect(siguienteOrden({ campo: "saldo", dir: "desc" }, "facturado")).toEqual({ campo: "facturado", dir: "desc" });
    expect(siguienteOrden({ campo: "saldo", dir: "desc" }, "nombre")).toEqual({ campo: "nombre", dir: "asc" });
  });
});

describe("chipEntregas", () => {
  it("atrasadas > por recibir > al día; sin compras, nada", () => {
    expect(chipEntregas({ facturas: 3, facturas_atrasadas: 2, entregas_por_recibir: 2 })).toEqual({ tono: "ambar", texto: "2 atrasadas" });
    expect(chipEntregas({ facturas: 1, facturas_atrasadas: 1, entregas_por_recibir: 1 })).toEqual({ tono: "ambar", texto: "1 atrasada" });
    expect(chipEntregas({ facturas: 2, facturas_atrasadas: 0, entregas_por_recibir: 1 })).toEqual({ tono: "neutro", texto: "1 por recibir" });
    expect(chipEntregas({ facturas: 2, facturas_atrasadas: 0, entregas_por_recibir: 0 })).toEqual({ tono: "verde", texto: "Al día" });
    expect(chipEntregas({ facturas: 0, facturas_atrasadas: 0, entregas_por_recibir: 0 })).toBeNull();
    expect(chipEntregas({ facturas: null, facturas_atrasadas: null, entregas_por_recibir: null })).toBeNull();
  });
});

describe("urlWhatsApp", () => {
  it("móvil peruano de 9 dígitos, con o sin 51, con espacios o guiones", () => {
    expect(urlWhatsApp("987 654 321")).toBe("https://wa.me/51987654321");
    expect(urlWhatsApp("+51 987-654-321")).toBe("https://wa.me/51987654321");
  });
  it("fijos, vacíos o raros: sin enlace", () => {
    expect(urlWhatsApp("01 456 7890")).toBeNull();
    expect(urlWhatsApp("")).toBeNull();
    expect(urlWhatsApp(null)).toBeNull();
    expect(urlWhatsApp("12345")).toBeNull();
  });
});

describe("costo", () => {
  it("variación del primero al último; sin dos puntos, nada", () => {
    expect(variacionCosto([46, 48, 50])).toBe(8.7);
    expect(variacionCosto([50, 48])).toBe(-4);
    expect(variacionCosto([50])).toBeNull();
  });
  it("«sube en cada compra» solo si de verdad sube siempre", () => {
    expect(subeEnCadaCompra([46, 48, 50])).toBe(true);
    expect(subeEnCadaCompra([46, 50, 48])).toBe(false);
    expect(subeEnCadaCompra([46])).toBe(false);
  });
});

describe("serie12Meses", () => {
  it("rellena con ceros los meses sin compras y deja el mes actual al final", () => {
    const s = serie12Meses(
      [
        { mes: "2026-09-01", monto: 9145 },
        { mes: "2026-08-01", monto: 5333.6 },
        { mes: "2025-10-01", monto: 100 },
      ],
      "2026-09-19",
    );
    expect(s).toHaveLength(12);
    expect(s[11]).toBe(9145);
    expect(s[10]).toBe(5333.6);
    expect(s[0]).toBe(100); // octubre 2025 es el más antiguo de la ventana
    expect(s.slice(1, 10).every((v) => v === 0)).toBe(true);
  });
  it("ignora lo que cae fuera de la ventana y suma dos filas del mismo mes", () => {
    const s = serie12Meses(
      [
        { mes: "2025-09-01", monto: 999 }, // 13 meses atrás
        { mes: "2026-10-01", monto: 999 }, // el futuro
        { mes: "2026-09-01", monto: 1 },
        { mes: "2026-09-01", monto: 2 },
      ],
      "2026-09-19",
    );
    expect(s.reduce((a, b) => a + b, 0)).toBe(3);
    expect(s[11]).toBe(3);
  });
  it("cruza el cambio de año", () => {
    expect(serie12Meses([{ mes: "2025-12-01", monto: 7 }], "2026-02-10")[9]).toBe(7);
  });
});

describe("inicialesMeses", () => {
  it("termina en la inicial del mes actual", () => {
    expect(inicialesMeses("2026-09-19").join("")).toBe("ONDEFMAMJJAS");
    expect(inicialesMeses("2026-01-05").join("")).toBe("FMAMJJASONDE");
  });
});

describe("repartoDeuda", () => {
  const ps = [
    { id: "a", nombre: "A", saldo: 500 },
    { id: "b", nombre: "B", saldo: 300 },
    { id: "c", nombre: "C", saldo: 100 },
    { id: "d", nombre: "D", saldo: 50 },
    { id: "e", nombre: "E", saldo: 50 },
    { id: "f", nombre: "F", saldo: 0 },
    { id: "g", nombre: "G", saldo: null },
  ];
  it("los tres mayores y «Resto», que suman 100 %", () => {
    const r = repartoDeuda(ps);
    expect(r.map((t) => t.nombre)).toEqual(["A", "B", "C", "Resto"]);
    expect(r[3]).toMatchObject({ id: null, monto: 100 });
    expect(r.reduce((s, t) => s + t.pct, 0)).toBeCloseTo(100, 6);
    expect(r[0].pct).toBeCloseTo(50, 6);
  });
  it("con tres o menos proveedores con deuda no hay «Resto»", () => {
    expect(repartoDeuda(ps.slice(0, 2)).map((t) => t.nombre)).toEqual(["A", "B"]);
  });
  it("sin deuda no hay tramos", () => {
    expect(repartoDeuda([{ id: "f", nombre: "F", saldo: 0 }, { id: "g", nombre: "G", saldo: null }])).toEqual([]);
  });
});

describe("haceCuanto", () => {
  it("lee días y meses", () => {
    expect([null, 0, 1, 7, 29, 30, 65, 400].map(haceCuanto)).toEqual(["Nunca", "hoy", "ayer", "hace 7 d", "hace 29 d", "hace 1 mes", "hace 2 meses", "hace 13 meses"]);
  });
});

describe("siguientePaso", () => {
  const sano: EstadoProveedor = { activo: true, conCompras: true, montoVencido: 0, facturasVencidas: 0, facturasAtrasadas: 0, saldoFavor: 0, diasSinComprar: 10 };
  it("lo vencido pesa más que una entrega atrasada", () => {
    const p = siguientePaso({ ...sano, montoVencido: 6670, facturasVencidas: 2, facturasAtrasadas: 3 });
    expect(p).toMatchObject({ tono: "rojo", accion: "pagar" });
    expect(p.fuerte).toContain("6,670.00");
    expect(p.resto).toContain("2 comprobantes");
  });
  it("una entrega atrasada, en singular y plural", () => {
    expect(siguientePaso({ ...sano, facturasAtrasadas: 1 })).toMatchObject({ tono: "ambar", accion: "recibir", fuerte: "1 entrega atrasada." });
    expect(siguientePaso({ ...sano, facturasAtrasadas: 2 }).fuerte).toBe("2 entregas atrasadas.");
  });
  it("saldo a favor, dormido, sin compras y al día", () => {
    expect(siguientePaso({ ...sano, saldoFavor: 1240 })).toMatchObject({ tono: "verde", accion: "favor" });
    expect(siguientePaso({ ...sano, diasSinComprar: 130 })).toMatchObject({ tono: "ambar", accion: "desactivar", fuerte: "Lleva 4 meses sin comprarle." });
    expect(siguientePaso({ ...sano, conCompras: false, diasSinComprar: null })).toMatchObject({ tono: "neutro", accion: null });
    expect(siguientePaso(sano)).toMatchObject({ tono: "verde", accion: null, fuerte: "Todo al día." });
  });
  it("un desactivado solo ofrece reactivar, aunque deba", () => {
    expect(siguientePaso({ ...sano, activo: false, montoVencido: 500 })).toMatchObject({ tono: "neutro", accion: "reactivar" });
  });
});

describe("resaltarCoincidencia", () => {
  it("marca la coincidencia sin tildes ni mayúsculas y conserva el texto original", () => {
    expect(resaltarCoincidencia("Hilandería Cusco", "HILANDERIA")).toEqual([
      { texto: "Hilandería", coincide: true },
      { texto: " Cusco", coincide: false },
    ]);
    expect(resaltarCoincidencia("Estampados Kero", "ker")).toEqual([
      { texto: "Estampados ", coincide: false },
      { texto: "Ker", coincide: true },
      { texto: "o", coincide: false },
    ]);
  });
  it("sin búsqueda o sin coincidencia devuelve el texto entero", () => {
    expect(resaltarCoincidencia("Kero", " ")).toEqual([{ texto: "Kero", coincide: false }]);
    expect(resaltarCoincidencia("Kero", "zzz")).toEqual([{ texto: "Kero", coincide: false }]);
  });
});

describe("proveedorConRuc", () => {
  const ps = [
    { id: "a", ruc: "20512345671", nombre: "Textiles Andinos" },
    { id: "b", ruc: null, nombre: "Sin RUC" },
  ];
  it("halla al que ya tiene ese RUC, salvo a uno mismo", () => {
    expect(proveedorConRuc("20512345671", ps, null)?.nombre).toBe("Textiles Andinos");
    expect(proveedorConRuc("20512345671", ps, "a")).toBeNull();
  });
  it("un RUC incompleto no se compara todavía", () => {
    expect(proveedorConRuc("2051234", ps, null)).toBeNull();
  });
});
