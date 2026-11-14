import { describe, expect, it } from "vitest";
import {
  apartadoConGrupos,
  carritoConGrupos,
  ejemploDeGrupo,
  montoDeVariante,
  ofertasDeGrupo,
  ofertasDeGrupoDeFilas,
  ofertasDeMontoDeFilas,
  type FilaOfertaDeMonto,
  type LineaDeGrupo,
  type OfertaDeGrupo,
} from "./ofertas-de-grupo";

// Los mismos ejemplos que `scripts/pruebas/ofertas_de_grupo.mjs` prueba contra `retail.fn_ofertas_de_grupo`: las dos tienen que coincidir.
const TRES_POR_DOS: OfertaDeGrupo = { reglaId: "r", tipo: "nxm", lleva: 3, paga: 2, monto: null, porcentaje: null, agrupa: "campana" };
const l = (precio: number, cantidad = 1, oferta: OfertaDeGrupo | null = TRES_POR_DOS, modeloId: string | null = null): LineaDeGrupo => ({ precio, cantidad, oferta, modeloId });
const dicho = (lineas: LineaDeGrupo[]) =>
  ofertasDeGrupo(lineas)
    .map((g, i) => (g ? `${i + 1}:${g.descuento.toFixed(2)}:${g.faltan}` : null))
    .filter(Boolean)
    .join(",") || "nada";

describe("la regla de los grupos (la misma de la base)", () => {
  it("3x2: la más barata gratis, repartida en proporción al precio (el ejemplo de la maqueta)", () => {
    expect(dicho([l(79.9), l(49.9), l(39.9)])).toBe("1:18.79:0,2:11.73:0,3:9.38:0");
  });
  it("dos grupos, de la más cara a la más barata: gratis una de 50 y una de 30", () => {
    expect(dicho([l(50, 3), l(30, 3)])).toBe("1:50.00:0,2:30.00:0");
  });
  it("sin grupo completo pagan su precio y dice cuántas faltan", () => {
    expect(dicho([l(50), l(40)])).toBe("1:0.00:1,2:0.00:1");
    expect(dicho([l(40), l(30), l(20), l(10)])).toBe("1:8.89:2,2:6.67:2,3:4.44:2,4:0.00:2");
  });
  it("«3 por S/ 100»: ahorra lo que pasa de 100, y nada si ya cuesta menos", () => {
    const o: OfertaDeGrupo = { ...TRES_POR_DOS, tipo: "n_por_monto", paga: null, monto: 100 };
    expect(dicho([l(50, 1, o), l(40, 1, o), l(30, 1, o)])).toBe("1:8.33:0,2:6.67:0,3:5.00:0");
    expect(dicho([l(30, 1, o), l(30, 1, o), l(30, 1, o)])).toBe("1:0.00:0,2:0.00:0,3:0.00:0");
  });
  it("«la 2.ª al 50 %»: la más barata, con el redondeo de la caja", () => {
    const o: OfertaDeGrupo = { ...TRES_POR_DOS, tipo: "nesima_pct", lleva: 2, paga: null, porcentaje: 50 };
    expect(dicho([l(80, 1, o), l(60, 1, o)])).toBe("1:17.14:0,2:12.86:0");
  });
  it("por modelo: dos de A y una de B no arman grupo; con cualquier prenda, sí", () => {
    const m: OfertaDeGrupo = { ...TRES_POR_DOS, agrupa: "modelo" };
    expect(dicho([l(50, 1, m, "A"), l(50, 1, m, "A"), l(50, 1, m, "B")])).toBe("1:0.00:1,2:0.00:1,3:0.00:2");
    expect(dicho([l(50, 1, TRES_POR_DOS, "A"), l(50, 1, TRES_POR_DOS, "A"), l(50, 1, TRES_POR_DOS, "B")])).toBe("1:16.67:0,2:16.67:0,3:16.66:0");
  });
  it("una prenda sin oferta de grupo no sale ni cuenta", () => {
    expect(dicho([l(50), l(50), l(50, 1, null)])).toBe("1:0.00:1,2:0.00:1");
  });
});

describe("lo que nunca puede pasar", () => {
  // Un generador con semilla: siempre los mismos tickets.
  const azar = (semilla: number) => () => {
    semilla = (semilla * 1_103_515_245 + 12_345) % 2_147_483_648;
    return semilla / 2_147_483_648;
  };
  const r = azar(42);
  const formas: OfertaDeGrupo[] = [
    TRES_POR_DOS,
    { ...TRES_POR_DOS, lleva: 4, paga: 3 },
    { ...TRES_POR_DOS, tipo: "n_por_monto", paga: null, monto: 99.9 },
    { ...TRES_POR_DOS, tipo: "nesima_pct", lleva: 2, paga: null, porcentaje: 30 },
  ];
  it("en 2 000 tickets al azar: el ahorro es exacto (en el 3x2, la más barata de cada grupo de la más cara a la más barata), ninguna prenda ahorra más de lo que cuesta y el reparto suma lo del grupo", () => {
    for (let t = 0; t < 2000; t++) {
      const forma = formas[t % formas.length];
      const lineas = Array.from({ length: 1 + Math.floor(r() * 7) }, () => l(10 + Math.floor(r() * 900) / 10, 1 + Math.floor(r() * 3), forma));
      const res = ofertasDeGrupo(lineas);
      const total = res.reduce((a, g) => a + Math.round((g?.descuento ?? 0) * 100), 0);
      res.forEach((g, i) => expect(Math.round((g?.descuento ?? 0) * 100)).toBeLessThanOrEqual(Math.round(lineas[i].precio * 100) * lineas[i].cantidad));
      if (forma.tipo === "nxm") {
        const precios = lineas.flatMap((x) => Array.from({ length: x.cantidad }, () => Math.round(x.precio * 100))).sort((a, b) => b - a);
        const completos = Math.floor(precios.length / forma.lleva) * forma.lleva;
        let esperado = 0;
        precios.slice(0, completos).forEach((p, i) => {
          if (i % forma.lleva >= (forma.paga ?? 0)) esperado += p;
        });
        expect(total).toBe(esperado);
      }
    }
  });
});

describe("el ejemplo de la hoja", () => {
  const prendas = [
    { nombre: "Blusa Emma", precio: 79.9, productoId: "a" },
    { nombre: "Blusa Emma", precio: 69.9, productoId: "a" },
    { nombre: "Polo Brisa", precio: 49.9, productoId: "b" },
    { nombre: "Polo Raya", precio: 39.9, productoId: "c" },
  ];
  it("con cualquier prenda: las tres más caras de modelos distintos, cobradas con la regla de la caja", () => {
    const e = ejemploDeGrupo(prendas, TRES_POR_DOS);
    expect(e?.lineas.map((l) => `${l.nombre} ${l.paga.toFixed(2)}`)).toEqual(["Blusa Emma 61.11", "Polo Brisa 38.17", "Polo Raya 30.52"]);
    expect(e).toMatchObject({ total: 169.7, paga: 129.8, ahorro: 39.9 });
  });
  it("del mismo modelo: tres del modelo más caro", () => {
    const e = ejemploDeGrupo(prendas, { ...TRES_POR_DOS, agrupa: "modelo" });
    expect(e?.lineas.map((l) => l.nombre)).toEqual(["Blusa Emma", "Blusa Emma", "Blusa Emma"]);
    expect(e?.ahorro).toBe(79.9);
  });
  it("con menos modelos que el grupo, repite; sin prendas, no hay ejemplo", () => {
    expect(ejemploDeGrupo([{ nombre: "Polo Raya", precio: 39.9, productoId: "c" }], TRES_POR_DOS)?.lineas).toHaveLength(3);
    expect(ejemploDeGrupo([], TRES_POR_DOS)).toBeNull();
  });
});

describe("el carrito de la caja con sus grupos", () => {
  const OFERTA = { ...TRES_POR_DOS, modeloId: null, nombre: "Verano 3x2", titular: "3 x 2" };
  const linea = (clave: string, precio: number, cantidad = 1, descuento = 0) => ({ claveLinea: clave, varianteId: clave, cantidad, precioUnitario: precio, descuentoUnitario: descuento });
  it("cada prenda del grupo va en su línea, con su parte sumada al descuento; las demás, como siempre", () => {
    const { lineas, porLinea } = carritoConGrupos([linea("a", 79.9), linea("b", 49.9, 2), linea("x", 20, 3)], { a: OFERTA, b: OFERTA });
    expect(lineas.map((l) => `${l.claveLinea}:${l.cantidad}:${l.descuentoGrupoUnitario.toFixed(2)}`)).toEqual(["a:1:22.19", "b:1:13.86", "b:1:13.85", "x:3:0.00"]);
    expect(lineas[0].ofertaGrupoId).toBe("r");
    expect(lineas[3].ofertaGrupoId).toBeNull();
    expect(porLinea.get("b")).toMatchObject({ titular: "3 x 2", ahorro: 27.71, faltan: 0 });
  });
  it("un descuento a mano se suma a la parte del grupo", () => {
    const { lineas } = carritoConGrupos([linea("a", 50, 1, 2.5), linea("b", 50), linea("c", 50)], { a: OFERTA, b: OFERTA, c: OFERTA });
    expect(lineas[0].descuentoUnitario).toBe(2.5 + lineas[0].descuentoGrupoUnitario);
  });
  it("sin grupo completo, nada se suma y el ticket dice cuántas faltan", () => {
    const { lineas, porLinea } = carritoConGrupos([linea("a", 50), linea("b", 40)], { a: OFERTA, b: OFERTA });
    expect(lineas.every((l) => l.descuentoGrupoUnitario === 0 && l.ofertaGrupoId === null)).toBe(true);
    expect(porLinea.get("a")).toMatchObject({ ahorro: 0, faltan: 1 });
  });
});

describe("el apartado con sus grupos (la cuenta de separar_prendas, ADR-0655 parte 4)", () => {
  const OFERTA = { ...TRES_POR_DOS, modeloId: null, nombre: "Verano", titular: "3 x 2" };
  const linea = (varianteId: string, precio: number, cantidad = 1) => ({ varianteId, cantidad, precio });
  it("el ejemplo de siempre da lo mismo que la caja y la base: 18.79 · 11.73 · 9.38", () => {
    const { porVariante, ahorro } = apartadoConGrupos([linea("c", 39.9), linea("a", 79.9), linea("b", 49.9)], { a: OFERTA, b: OFERTA, c: OFERTA });
    expect(["a", "b", "c"].map((v) => porVariante.get(v)?.ahorro)).toEqual([18.79, 11.73, 9.38]);
    expect(ahorro).toBe(39.9);
    expect(porVariante.get("a")).toMatchObject({ ofertaGrupoId: "r", titular: "3 x 2", nombre: "Verano", faltan: 0 });
  });
  it("a igual precio el orden es por prenda, no por cómo se escaneó: la base no guarda ese orden", () => {
    const ofertas = { a: OFERTA, b: OFERTA, c: OFERTA };
    const uno = apartadoConGrupos([linea("a", 50), linea("b", 50), linea("c", 50)], ofertas);
    const otro = apartadoConGrupos([linea("c", 50), linea("b", 50), linea("a", 50)], ofertas);
    expect(["a", "b", "c"].map((v) => otro.porVariante.get(v)?.ahorro)).toEqual(["a", "b", "c"].map((v) => uno.porVariante.get(v)?.ahorro));
    expect(uno.ahorro).toBe(50);
  });
  it("dos prendas iguales en una línea: su ahorro es el de las dos", () => {
    const { porVariante, ahorro } = apartadoConGrupos([linea("a", 50, 2), linea("b", 40)], { a: OFERTA, b: OFERTA });
    expect(ahorro).toBe(40);
    expect(Math.round(((porVariante.get("a")?.ahorro ?? 0) + (porVariante.get("b")?.ahorro ?? 0)) * 100) / 100).toBe(40);
  });
  it("sin grupo completo no ahorra y dice cuántas faltan; una prenda sin oferta no cuenta", () => {
    const { porVariante, ahorro } = apartadoConGrupos([linea("a", 50), linea("b", 40), linea("x", 30)], { a: OFERTA, b: OFERTA });
    expect(ahorro).toBe(0);
    expect(porVariante.get("a")).toMatchObject({ ahorro: 0, faltan: 1 });
    expect(porVariante.has("x")).toBe(false);
  });
});

describe("las ofertas de grupo que lee la caja", () => {
  it("por prenda, con su forma y lo que dice el ticket; una forma desconocida se ignora", () => {
    const o = ofertasDeGrupoDeFilas([
      { variante_id: "v1", regla_id: "r", producto_id: "p", tipo: "nxm", lleva: 3, paga: 2, monto: null, porcentaje: null, agrupa: "modelo", oferta_nombre: "ZZ 3x2", etiqueta_nombre: "Verano" },
      { variante_id: "v2", regla_id: "s", producto_id: "p", tipo: "n_por_monto", lleva: 2, paga: null, monto: "59.90", porcentaje: null, agrupa: "campana", oferta_nombre: "2 por", etiqueta_nombre: "Verano" },
      { variante_id: "v3", regla_id: "t", producto_id: "p", tipo: "otra", lleva: 2, paga: null, monto: null, porcentaje: null, agrupa: "campana", oferta_nombre: "x", etiqueta_nombre: "x" },
    ]);
    expect(o.v1).toMatchObject({ reglaId: "r", tipo: "nxm", lleva: 3, paga: 2, agrupa: "modelo", modeloId: "p", nombre: "Verano", titular: "3 x 2" });
    expect(o.v2).toMatchObject({ monto: 59.9, titular: "2 por S/\u00a059.90" });
    expect(o.v3).toBeUndefined();
    expect(ofertasDeGrupoDeFilas(null)).toEqual({});
  });
});

// ---- «Gastar un monto y ahorrar» (ADR-0655, actividad 8): los mismos ejemplos que `scripts/pruebas/monto_con_escalones.mjs` ----------

const monto = (escalones: [number, number][], ahorroEn: "soles" | "pct" = "soles"): OfertaDeGrupo => ({
  reglaId: "m", tipo: "monto", lleva: 0, paga: null, monto: null, porcentaje: null, agrupa: "campana",
  escalones: escalones.map(([desde, ahorra]) => ({ desde, ahorra })), ahorroEn,
});

describe("la cuenta del monto (la misma de la base)", () => {
  const M = monto([[300, 30]]);
  it("S/ 30 desde S/ 300: 200 + 150 → 17.14 · 12.86; bajo el monto, nada", () => {
    expect(dicho([l(200, 1, M), l(150, 1, M)])).toBe("1:17.14:0,2:12.86:0");
    expect(dicho([l(200, 1, M), l(50, 1, M)])).toBe("1:0.00:0,2:0.00:0");
  });
  it("tres escalones: con 550 vale el de 500 (32.73 · 27.27); con 800 justo, el de 800 (75 · 45)", () => {
    const tres = monto([[300, 30], [500, 60], [800, 120]]);
    expect(dicho([l(300, 1, tres), l(250, 1, tres)])).toBe("1:32.73:0,2:27.27:0");
    expect(dicho([l(500, 1, tres), l(300, 1, tres)])).toBe("1:75.00:0,2:45.00:0");
  });
  it("en %, con el redondeo de la caja: 10 % sobre 350 → 35 (20 · 15)", () => {
    expect(dicho([l(200, 1, monto([[300, 10]], "pct")), l(150, 1, monto([[300, 10]], "pct"))])).toBe("1:20.00:0,2:15.00:0");
  });
  it("una línea con varias unidades cuenta cada una (2 × 160 → 30)", () => {
    expect(dicho([l(160, 2, M)])).toBe("1:30.00:0");
  });
  it("dice el escalón alcanzado y cuánto falta para el siguiente", () => {
    const tres = monto([[300, 30], [500, 60]]);
    expect(ofertasDeGrupo([l(200, 1, tres), l(150, 1, tres)])[0]?.monto).toEqual({
      ahorroEn: "soles", alcanzado: { desde: 300, ahorra: 30 }, siguiente: { escalon: { desde: 500, ahorra: 60 }, falta: 150 },
    });
    expect(ofertasDeGrupo([l(250, 1, tres)])[0]?.monto).toMatchObject({ alcanzado: null, siguiente: { falta: 50 } });
  });
  it("500 tickets al azar: el ahorro es siempre el del escalón alcanzado, y ninguna prenda ahorra más de lo que cuesta", () => {
    const tres = monto([[150, 15], [400, 50], [700, 100]]);
    let semilla = 31;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
    for (let t = 0; t < 500; t++) {
      const lineas = Array.from({ length: 1 + Math.floor(azar() * 6) }, () => l(10 + Math.floor(azar() * 2500) / 10, 1, tres));
      const sumaC = lineas.reduce((a, x) => a + Math.round(x.precio * 100), 0);
      const esperado = sumaC >= 70000 ? 10000 : sumaC >= 40000 ? 5000 : sumaC >= 15000 ? 1500 : 0;
      const g = ofertasDeGrupo(lineas);
      expect(g.reduce((a, x) => a + Math.round((x?.descuento ?? 0) * 100), 0)).toBe(esperado);
      expect(g.every((x, i) => (x?.descuento ?? 0) <= lineas[i].precio)).toBe(true);
    }
  });
});

describe("el monto en la caja y en Apartar", () => {
  const FILA = (o: Partial<FilaOfertaDeMonto> = {}): FilaOfertaDeMonto => ({
    regla_id: "m", oferta_nombre: "ZZ Monto", etiqueta_nombre: "Verano", escalones: [{ desde: 300, ahorra: 30 }], ahorro_en: "soles", cuenta: "compra",
    variantes: null, excluidas: ["claure"], ...o,
  });
  const linea = (clave: string, precio: number, campana: unknown = null) => ({ claveLinea: clave, varianteId: clave, cantidad: 1, precioUnitario: precio, descuentoUnitario: 0, campana });
  it("toda la compra: cuenta todo salvo lo excluido; de la campaña: solo lo que alcanza", () => {
    const [compra] = ofertasDeMontoDeFilas([FILA()]);
    expect(montoDeVariante([compra], "a")?.reglaId).toBe("m");
    expect(montoDeVariante([compra], "claure")).toBeNull();
    const [deLaCampana] = ofertasDeMontoDeFilas([FILA({ cuenta: "campana", variantes: ["a"], excluidas: null })]);
    expect(montoDeVariante([deLaCampana], "a")?.reglaId).toBe("m");
    expect(montoDeVariante([deLaCampana], "b")).toBeNull();
  });
  it("la caja reparte el monto en cada prenda; una con «% menos» no cuenta ni ahorra (decisión 3)", () => {
    const montos = ofertasDeMontoDeFilas([FILA()]);
    const { lineas, porLinea } = carritoConGrupos([linea("a", 200), linea("b", 150), linea("c", 400, { etiquetaId: "e", nombre: "Top", pct: 20 })], {}, montos);
    expect(lineas.map((x) => `${x.claveLinea}:${x.descuentoGrupoUnitario.toFixed(2)}:${x.ofertaGrupoId ?? "-"}`)).toEqual(["a:17.14:m", "b:12.86:m", "c:0.00:-"]);
    expect(porLinea.get("a")).toMatchObject({ titular: "S/\u00a030.00 menos desde S/\u00a0300.00", nombre: "Verano", ahorro: 17.14 });
    expect(porLinea.has("c")).toBe(false);
  });
  it("una prenda con oferta de grupo va con su grupo, no con el monto", () => {
    const OFERTA = { ...TRES_POR_DOS, modeloId: null, nombre: "Verano 3x2", titular: "3 x 2" };
    const montos = ofertasDeMontoDeFilas([FILA()]);
    const { lineas } = carritoConGrupos([linea("g", 100), linea("a", 200), linea("b", 150)], { g: OFERTA }, montos);
    expect(lineas.map((x) => x.ofertaGrupoId ?? "-")).toEqual(["-", "m", "m"]);
  });
  it("Apartar da lo mismo que la caja y la base", () => {
    const [m] = ofertasDeMontoDeFilas([FILA()]);
    const { porVariante, ahorro } = apartadoConGrupos([{ varianteId: "b", cantidad: 1, precio: 150 }, { varianteId: "a", cantidad: 1, precio: 200 }], { a: m, b: m });
    expect([porVariante.get("a")?.ahorro, porVariante.get("b")?.ahorro, ahorro]).toEqual([17.14, 12.86, 30]);
    expect(porVariante.get("a")?.monto?.alcanzado).toEqual({ desde: 300, ahorra: 30 });
  });
  it("una fila que no se sabe leer se ignora", () => {
    expect(ofertasDeMontoDeFilas([FILA({ escalones: [{ desde: 300, ahorra: 30 }, { desde: 200, ahorra: 40 }] }), FILA({ ahorro_en: "x" }), FILA({ cuenta: "x" })])).toEqual([]);
    expect(ofertasDeMontoDeFilas([FILA({ escalones: [{ desde: "300", ahorra: "30" }] })])[0]?.escalones).toEqual([{ desde: 300, ahorra: 30 }]);
    expect(ofertasDeMontoDeFilas([FILA({ escalones: [] })])).toEqual([]);
    expect(ofertasDeMontoDeFilas(null)).toEqual([]);
  });
});
