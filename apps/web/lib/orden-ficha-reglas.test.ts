import { describe, expect, it } from "vitest";
import { claveCelda, construirCeldas } from "./alta-producto";
import { contarQueSeFabrica, detalleDeOrdenAbierta, faseDeAfuera, fechaCorta, fraseDelBorradorGuardado, gananciaPorPrenda, nombreDeLaFicha, partesDelCostoPorPrenda, soles, textoDeGanancia, textoSeVendeA } from "./orden-ficha-reglas";

// Contrato en `orden-ficha-reglas.ts`. La ficha solo escribe lo que el formulario ya calculó: aquí se prueba que lo escriba bien.

describe("soles", () => {
  it("dos decimales y miles con coma, como el resto de Producción", () => {
    expect(soles(0)).toBe("S/\u00a00.00");
    expect(soles(89.9)).toBe("S/\u00a089.90");
    expect(soles(1234.5)).toBe("S/\u00a01,234.50");
  });
});

describe("fechaCorta", () => {
  it("«2026-10-23» es «23 oct» (sin cero adelante)", () => {
    expect(fechaCorta("2026-10-23")).toBe("23 oct");
    expect(fechaCorta("2027-01-05")).toBe("5 ene");
    expect(fechaCorta(" 2026-12-31 ")).toBe("31 dic");
  });
  it("vacío, a medias o un día que no existe no inventa una fecha", () => {
    for (const malo of ["", "2026-10", "23/10/2026", "2026-02-30", "2026-13-01", "2026-04-31", "abc"]) expect(fechaCorta(malo), malo).toBeNull();
  });
});

describe("contarQueSeFabrica", () => {
  const celdas = construirCeldas(["S", "M", "L"], ["NEG", "CRU", "PRO"]);
  const k = (t: string, c: string) => claveCelda(t, c);

  it("cuenta los colores y las tallas que llevan prendas, no los que ofrece la tabla", () => {
    expect(contarQueSeFabrica(celdas, new Set(), { [k("S", "NEG")]: "4", [k("M", "NEG")]: "6", [k("M", "PRO")]: "2" })).toEqual({ colores: 2, tallas: 2 });
  });
  it("una celda con 0, vacía o con texto que no es cantidad no cuenta; una celda quitada tampoco aunque tenga algo", () => {
    const cantidades = { [k("S", "NEG")]: "0", [k("M", "NEG")]: "", [k("L", "NEG")]: "abc", [k("S", "CRU")]: "5" };
    expect(contarQueSeFabrica(celdas, new Set([k("S", "CRU")]), cantidades)).toEqual({ colores: 0, tallas: 0 });
    expect(contarQueSeFabrica(celdas, new Set(), cantidades)).toEqual({ colores: 1, tallas: 1 });
  });
  it("sin color (o sin talla) ese eje no cuenta: «Sin color» no es un color", () => {
    expect(contarQueSeFabrica(construirCeldas(["S", "M"], []), new Set(), { [claveCelda("S", null)]: "3", [claveCelda("M", null)]: "2" })).toEqual({ colores: 0, tallas: 2 });
    expect(contarQueSeFabrica(construirCeldas([], ["NEG"]), new Set(), { [claveCelda(null, "NEG")]: "3" })).toEqual({ colores: 1, tallas: 0 });
  });
  it("nada escrito: cero y cero", () => {
    expect(contarQueSeFabrica(celdas, new Set(), {})).toEqual({ colores: 0, tallas: 0 });
  });
});

describe("nombreDeLaFicha", () => {
  it("con nombre, el nombre (sin espacios de sobra) y no tenue", () => {
    expect(nombreDeLaFicha({ esNuevo: true, hayModelo: false, nombre: "  Blusa Aurora " })).toEqual({ texto: "Blusa Aurora", vacio: false });
  });
  it("sin modelo elegido y modelo nuevo sin nombre se dicen distinto, y ambos tenues", () => {
    expect(nombreDeLaFicha({ esNuevo: false, hayModelo: false, nombre: "" })).toEqual({ texto: "Sin modelo todavía", vacio: true });
    expect(nombreDeLaFicha({ esNuevo: true, hayModelo: false, nombre: "   " })).toEqual({ texto: "Sin nombre todavía", vacio: true });
  });
});

describe("textoSeVendeA", () => {
  it("con precio, el precio", () => {
    expect(textoSeVendeA({ precio: 79.9, esNuevo: false, esMuestra: false })).toBe("S/\u00a079.90");
    expect(textoSeVendeA({ precio: 40, esNuevo: true, esMuestra: true })).toBe("S/\u00a040.00");
  });
  it("modelo nuevo sin precio: una muestra dice «Al aprobarla» y una orden para vender, «Sin precio todavía» (nunca una raya suelta)", () => {
    expect(textoSeVendeA({ precio: 0, esNuevo: true, esMuestra: true })).toBe("Al aprobarla");
    expect(textoSeVendeA({ precio: 0, esNuevo: true, esMuestra: false })).toBe("Sin precio todavía");
  });
  it("un modelo que ya existe sin precio no escribe la fila (la nota de la ficha explica y lleva a Editar producto)", () => {
    expect(textoSeVendeA({ precio: 0, esNuevo: false, esMuestra: false })).toBeNull();
  });
});

describe("partesDelCostoPorPrenda", () => {
  const parte = (clave: string, nombre: string, costo: number, detalle: string | null = null) => ({ clave, nombre, detalle, costo });

  it("parte el costo por prenda en la tela y cada servicio de afuera: lo de toda la orden ÷ las prendas", () => {
    // 16 prendas: tela S/ 300 (18.75 c/u), costura S/ 72 (4.50 c/u), bordado S/ 96 (6.00 c/u) → 29.25 por prenda.
    const partes = partesDelCostoPorPrenda({
      totalPrendas: 16,
      porPrenda: 29.25,
      partes: [parte("tela", "Tela", 300), parte("costura", "Costura", 72, "Confecciones del Norte"), parte("bordado", "Bordado", 96, "Bordados Lima")],
    });
    expect(partes.map((p) => [p.clave, p.porPrenda])).toEqual([["tela", 18.75], ["costura", 4.5], ["bordado", 6]]);
    expect(partes[1].detalle).toBe("Confecciones del Norte");
  });

  it("las partes suman EXACTAMENTE lo que dice la ficha: tres tercios de una moneda no dejan una línea corrida (33.34 + 33.33 + 33.33 = 100.00)", () => {
    const partes = partesDelCostoPorPrenda({ totalPrendas: 3, porPrenda: 100, partes: [parte("tela", "Tela", 100), parte("costura", "Costura", 100), parte("bordado", "Bordado", 100)] });
    expect(partes.map((p) => p.porPrenda)).toEqual([33.34, 33.33, 33.33]);
    expect(Math.round(partes.reduce((s, p) => s + p.porPrenda, 0) * 100)).toBe(10000);
  });

  it("al azar: siempre suman el costo por prenda, ninguna se aparta más de una moneda de su valor exacto y ninguna es negativa", () => {
    let semilla = 20261016;
    const azar = () => {
      semilla = (semilla * 1664525 + 1013904223) % 4294967296;
      return semilla / 4294967296;
    };
    for (let caso = 0; caso < 400; caso++) {
      const totalPrendas = 1 + Math.floor(azar() * 400);
      const n = 1 + Math.floor(azar() * 5);
      const costos = Array.from({ length: n }, () => Math.round(azar() * 5000 * 100) / 100 + 0.01);
      const porPrenda = Math.round((costos.reduce((s, c) => s + c, 0) / totalPrendas) * 100) / 100;
      const partes = partesDelCostoPorPrenda({ totalPrendas, porPrenda, partes: costos.map((c, i) => parte(`p${i}`, `P${i}`, c)) });
      expect(partes, `caso ${caso}`).toHaveLength(n);
      expect(Math.round(partes.reduce((s, p) => s + p.porPrenda, 0) * 100), `caso ${caso}`).toBe(Math.round(porPrenda * 100));
      partes.forEach((p, i) => {
        expect(p.porPrenda, `caso ${caso}`).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p.porPrenda - costos[i] / totalPrendas), `caso ${caso}`).toBeLessThan(0.0101);
      });
    }
  });

  it("una parte en 0 no se lista, y sin prendas, sin costo por prenda o sin nada que costar no hay desglose (la ficha no inventa)", () => {
    expect(partesDelCostoPorPrenda({ totalPrendas: 10, porPrenda: 5, partes: [parte("tela", "Tela", 0), parte("costura", "Costura", 50)] }).map((p) => p.clave)).toEqual(["costura"]);
    expect(partesDelCostoPorPrenda({ totalPrendas: 0, porPrenda: 0, partes: [parte("tela", "Tela", 50)] })).toEqual([]);
    expect(partesDelCostoPorPrenda({ totalPrendas: 10, porPrenda: 0, partes: [parte("tela", "Tela", 50)] })).toEqual([]);
    expect(partesDelCostoPorPrenda({ totalPrendas: 10, porPrenda: 5, partes: [] })).toEqual([]);
  });
});

describe("gananciaPorPrenda — en soles, con el mismo precio que pinta el semáforo", () => {
  it("es el precio menos lo que cuesta hacerla, a dos decimales (el ejemplo de la maqueta: 89.00 − 38.40)", () => {
    expect(gananciaPorPrenda(89, 38.4)).toBe(50.6);
    expect(gananciaPorPrenda(79.9, 31.37)).toBe(48.53);
  });
  it("sin precio o sin costo no hay ganancia que decir (igual que el semáforo)", () => {
    expect(gananciaPorPrenda(0, 38.4)).toBeNull();
    expect(gananciaPorPrenda(89, 0)).toBeNull();
    expect(gananciaPorPrenda(Number.NaN, 10)).toBeNull();
  });
  it("si cuesta más de lo que se cobra, sale negativa y se escribe con su signo", () => {
    expect(gananciaPorPrenda(30, 34.2)).toBe(-4.2);
    expect(textoDeGanancia(-4.2)).toBe(`−${soles(4.2)}`);
    expect(textoDeGanancia(50.6)).toBe(soles(50.6));
    expect(textoDeGanancia(0)).toBe(soles(0));
  });
});

describe("faseDeAfuera — cada fase de afuera es un par", () => {
  it("dice la fase y quién la hace", () => {
    expect(faseDeAfuera({ nombre: "Costura", proveedor: "Confecciones del Norte", pendiente: false })).toEqual({ fase: "Costura", quien: "Confecciones del Norte" });
  });
  it("sin proveedor dice qué falta, distinto si está por registrarse", () => {
    expect(faseDeAfuera({ nombre: "Corte", proveedor: null, pendiente: true }).quien).toBe("Pendiente de registrar");
    expect(faseDeAfuera({ nombre: "Corte", proveedor: null, pendiente: false }).quien).toBe("Falta elegir a quién");
  });
});

describe("las frases de los avisos de la orden", () => {
  it("el detalle de la orden abierta dice cuántas y de qué tipo, sin puntos medios y sin «Lote de producción»", () => {
    expect(detalleDeOrdenAbierta({ total: 24, esMuestra: false, esNuevo: false })).toBe("24 prendas para vender");
    expect(detalleDeOrdenAbierta({ total: 1, esMuestra: true, esNuevo: false })).toBe("1 prenda de muestra");
    expect(detalleDeOrdenAbierta({ total: 6, esMuestra: true, esNuevo: true })).toBe("6 prendas de muestra, con un modelo nuevo");
    for (const esMuestra of [true, false]) for (const esNuevo of [true, false]) expect(detalleDeOrdenAbierta({ total: 3, esMuestra, esNuevo })).not.toMatch(/·|producción/);
  });
  it("la orden a medias dice cuándo quedó y, si tenía prendas, cuántas", () => {
    expect(fraseDelBorradorGuardado("hace 2 horas", 0)).toBe("Quedó guardada hace 2 horas.");
    expect(fraseDelBorradorGuardado("hace 2 horas", 12)).toBe("Quedó guardada hace 2 horas, con 12 prendas.");
    expect(fraseDelBorradorGuardado("ayer", 1)).toBe("Quedó guardada ayer, con 1 prenda.");
  });
});
