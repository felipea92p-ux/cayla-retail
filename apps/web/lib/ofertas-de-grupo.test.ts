import { describe, expect, it } from "vitest";
import { ejemploDeGrupo, ofertasDeGrupo, type LineaDeGrupo, type OfertaDeGrupo } from "./ofertas-de-grupo";

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
