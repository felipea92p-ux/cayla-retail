import { describe, expect, it } from "vitest";
import {
  aplicarFiltro,
  argsGuardar,
  argsGuardarTope,
  avanceDelPaso,
  armarFilas,
  borradorDe,
  calcular,
  colaDelPaso,
  comoTextoDeExcel,
  comprarPorTalla,
  cuantilCritico,
  confianzaDelStock,
  conteosDeFiltros,
  cuantilTriangular,
  curvaSugerida,
  diasEntre,
  efectoEnElTope,
  ENCABEZADOS_LISTA_COMPRA,
  escalaDeRango,
  esAgotada,
  estadoCampana,
  filasDeLaListaDeCompra,
  filasDelCsvDeCompra,
  filtrarFilas,
  fraseDeLoReal,
  leerMonto,
  leerPlan,
  lineaDeBorrador,
  momentoDeLaCampana,
  nombreDelArchivoDeCompra,
  ordenarFilas,
  pendientesDelPaso,
  plegarSinMovimiento,
  porQue,
  posicionEnEscala,
  problemaDelTope,
  problemasDelBorrador,
  propuestaDeNormal,
  repartir,
  segmentosDelTope,
  siguienteSinPlan,
  TOP_VENTAS,
  totalesDelPlan,
  type Borrador,
  type TallaPlan,
} from "./plan-compra-reglas";
import { camposDelPlan, camposDelTope } from "./plan-compra-guia";
import { sePuedeConfirmar } from "./guia-campos";

const TALLAS: TallaPlan[] = [
  { id: "s", valor: "S" },
  { id: "m", valor: "M" },
  { id: "l", valor: "L" },
  { id: "xl", valor: "XL" },
];
const BIEN: Borrador = { flojo: "80", normal: "120", bueno: "180", precio: "79.90", costo: "32", recupero: "50", curva: { s: "20", m: "35", l: "30", xl: "15" } };

describe("cuantilCritico: cuánto cuesta quedarse corto frente a pasarse", () => {
  it("precio 100, costo 40, lo que sobra se vende a la mitad: 60 ÷ (60 + 0) → cubrir todo", () => {
    expect(cuantilCritico(100, 40, 50)).toBe(1);
  });
  it("lo que sobra no se recupera: 60 ÷ (60 + 40) = 0,6", () => {
    expect(cuantilCritico(100, 40, 0)).toBeCloseTo(0.6);
  });
  it("margen chico y sobrar caro: se compra corto", () => {
    expect(cuantilCritico(50, 40, 0)).toBeCloseTo(10 / 50);
  });
});

describe("cuantilTriangular", () => {
  it("los extremos y la moda", () => {
    expect(cuantilTriangular(80, 120, 180, 0)).toBe(80);
    expect(cuantilTriangular(80, 120, 180, 1)).toBe(180);
    expect(cuantilTriangular(80, 120, 180, 0.4)).toBeCloseTo(120); // F(moda) = 40/100
  });
  it("sube con el cuantil y no se sale del rango", () => {
    const qs = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => cuantilTriangular(80, 120, 180, p));
    for (let i = 1; i < qs.length; i++) expect(qs[i]).toBeGreaterThan(qs[i - 1]);
    expect(Math.min(...qs)).toBeGreaterThan(80);
    expect(Math.max(...qs)).toBeLessThan(180);
  });
  it("escenarios iguales: ese número", () => {
    expect(cuantilTriangular(50, 50, 50, 0.7)).toBe(50);
  });
});

describe("calcular", () => {
  it("compra hasta el cuantil y descuenta lo que ya hay", () => {
    const c = calcular({ flojo: 80, normal: 120, bueno: 180, precio: 100, costo: 40, recuperoPct: 0 }, 30);
    expect(c.cuantil).toBeCloseTo(0.6);
    expect(c.objetivo).toBe(Math.ceil(cuantilTriangular(80, 120, 180, 0.6)));
    expect(c.comprar).toBe(c.objetivo - 30);
    expect(c.inversion).toBeCloseTo(c.comprar * 40);
    expect(porQue(c)).toContain("60 de cada 100");
  });
  it("si sobrar no cuesta, el porqué lo dice en palabras (no «100 de cada 100»)", () => {
    expect(porQue(calcular({ flojo: 1, normal: 2, bueno: 3, precio: 100, costo: 40, recuperoPct: 50 }, 0))).toContain("casi al costo");
  });
  it("si ya hay más de lo que conviene, no compra (nunca negativo)", () => {
    expect(calcular({ flojo: 10, normal: 20, bueno: 30, precio: 100, costo: 40, recuperoPct: 0 }, 500).comprar).toBe(0);
  });
  it("dos categorías con la misma venta esperada compran distinto según cuánto cuesta sobrar", () => {
    const basico = calcular({ flojo: 80, normal: 120, bueno: 180, precio: 60, costo: 25, recuperoPct: 90 }, 0);
    const moda = calcular({ flojo: 80, normal: 120, bueno: 180, precio: 60, costo: 25, recuperoPct: 10 }, 0);
    expect(basico.comprar).toBeGreaterThan(moda.comprar);
  });
});

describe("repartir y la curva", () => {
  it("enteros que suman exacto", () => {
    const r = repartir(100, [{ id: "a", peso: 1 }, { id: "b", peso: 1 }, { id: "c", peso: 1 }]);
    expect([...r.values()].reduce((s, x) => s + x, 0)).toBe(100);
    expect(r.get("a")).toBe(34);
  });
  it("sin ventas, la curva es pareja", () => {
    expect(curvaSugerida(TALLAS, undefined)).toEqual({ s: 25, m: 25, l: 25, xl: 25 });
  });
  it("con pocas ventas, se apoya en el reparto parejo; con muchas, manda lo vendido", () => {
    const pocas = curvaSugerida(TALLAS, new Map([["m", 2]]));
    expect(pocas.m).toBeGreaterThan(25);
    expect(pocas.m).toBeLessThan(50);
    const muchas = curvaSugerida(TALLAS, new Map([["s", 20], ["m", 70], ["l", 60], ["xl", 50]]));
    expect(Object.values(muchas).reduce((s, x) => s + x, 0)).toBe(100);
    expect(muchas.m).toBeGreaterThan(muchas.s);
    expect(muchas.m).toBeGreaterThan(30);
  });
  it("una categoría sin tallas no tiene curva", () => {
    expect(curvaSugerida([], new Map())).toEqual({});
  });
  it("comprarPorTalla sigue la curva, o reparte parejo sin ella", () => {
    const r = comprarPorTalla(40, TALLAS, { s: 20, m: 35, l: 30, xl: 15 });
    expect([...r.values()]).toEqual([8, 14, 12, 6]);
    expect([...comprarPorTalla(10, TALLAS, {}).values()].reduce((s, x) => s + x, 0)).toBe(10);
  });
});

describe("problemasDelBorrador: lo mismo que rechaza la base", () => {
  it("un borrador completo no tiene problemas", () => {
    expect(problemasDelBorrador(BIEN, TALLAS)).toEqual({});
  });
  it("escenarios desordenados, costo ≥ precio, recupero > 100, curva que no suma 100", () => {
    const p = problemasDelBorrador({ ...BIEN, normal: "60", costo: "80", recupero: "120", curva: { s: "50", m: "60" } }, TALLAS);
    expect(Object.keys(p).sort()).toEqual(["costo", "curva", "normal", "recupero"]);
    expect(p.curva).toBe("La curva suma 110 %: tiene que sumar 100 %.");
  });
  it("la curva vacía vale (todavía no se decidió); el flojo puede ser 0", () => {
    expect(problemasDelBorrador({ ...BIEN, flojo: "0", curva: {} }, TALLAS)).toEqual({});
  });
  it("vacío: todo falta salvo la curva", () => {
    const p = problemasDelBorrador({ flojo: "", normal: "", bueno: "", precio: "", costo: "", recupero: "", curva: {} }, TALLAS);
    expect(Object.keys(p).sort()).toEqual(["bueno", "costo", "flojo", "normal", "precio", "recupero"]);
  });
});

describe("la guía de foco dice lo mismo que la validación", () => {
  const casos: Borrador[] = [
    BIEN,
    { ...BIEN, flojo: "" },
    { ...BIEN, normal: "10" },
    { ...BIEN, bueno: "100" },
    { ...BIEN, precio: "0" },
    { ...BIEN, costo: "90" },
    { ...BIEN, recupero: "101" },
    { ...BIEN, curva: { s: "10" } },
    { ...BIEN, curva: {} },
    { flojo: "", normal: "", bueno: "", precio: "", costo: "", recupero: "", curva: {} },
  ];
  for (const [i, b] of casos.entries()) {
    for (const listo of [true, false]) {
      it(`caso ${i}, responsable ${listo ? "listo" : "sin elegir"}`, () => {
        const campos = camposDelPlan(b, TALLAS, { listo, motivo: null });
        const valido = Object.keys(problemasDelBorrador(b, TALLAS)).length === 0;
        expect(sePuedeConfirmar(campos)).toBe(valido && listo);
      });
    }
  }
});

describe("borrador, args y lo real", () => {
  it("una categoría sin plan arranca vacía con la curva propuesta; con plan, trae lo guardado", () => {
    const vacio = borradorDe(undefined, TALLAS, undefined);
    expect(vacio.flojo).toBe("");
    expect(vacio.curva).toEqual({ s: "25", m: "25", l: "25", xl: "25" });
    const guardado = borradorDe({ categoriaId: "c", flojo: 1, normal: 2, bueno: 3, precio: 50, costo: 20, recuperoPct: 40, curva: { s: 100 }, nota: null, actualizadoPor: null, actualizadoEn: null }, TALLAS, undefined);
    expect(guardado).toMatchObject({ flojo: "1", precio: "50.00", recupero: "40", curva: { s: "100" } });
  });
  it("los argumentos van como los espera la base", () => {
    expect(argsGuardar("p", "c", { ...BIEN, precio: "79,90" }, TALLAS, "  ")).toEqual({
      p_plan_id: "p", p_categoria_id: "c", p_flojo: 80, p_normal: 120, p_bueno: 180, p_precio: 79.9, p_costo: 32, p_recupero_pct: 50,
      p_curva: { s: 20, m: 35, l: 30, xl: 15 }, p_nota: null,
    });
    expect(argsGuardar("p", "c", { ...BIEN, curva: {} }, TALLAS, "x").p_curva).toEqual({});
  });
  it("lineaDeBorrador calcula solo si el borrador vale", () => {
    expect(lineaDeBorrador(BIEN, TALLAS)?.normal).toBe(120);
    expect(lineaDeBorrador({ ...BIEN, costo: "" }, TALLAS)).toBeNull();
  });
  it("antes, durante y después; y la frase de enero", () => {
    expect(estadoCampana("2026-10-05", "2026-12-01", "2026-12-31")).toBe("antes");
    expect(estadoCampana("2026-12-15", "2026-12-01", "2026-12-31")).toBe("durante");
    expect(estadoCampana("2027-01-02", "2026-12-01", "2026-12-31")).toBe("despues");
    expect(fraseDeLoReal(140, { flojo: 80, normal: 120, bueno: 180 })).toBe("Se vendieron 140: entre el normal y el bueno.");
    expect(fraseDeLoReal(200, { flojo: 80, normal: 120, bueno: 180 })).toBe("Se vendieron 200: más que el diciembre bueno.");
  });
});

describe("leerPlan", () => {
  it("lee la respuesta de la base", () => {
    const l = leerPlan({
      plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
      hoy: "2026-10-05",
      planes: [{ id: "p", nombre: "Diciembre 2026" }],
      categorias: [{ id: "c", nombre: "Polos", prefijo: "POL", familia: "indumentaria", tallas: [{ id: "s", valor: "S" }] }],
      lineas: [{ categoria_id: "c", flojo: 1, normal: 2, bueno: 3, precio: "50.00", costo: "20.00", recupero_pct: 40, curva: { s: 100 }, nota: null }],
      stock: [{ categoria_id: "c", unidades: 7 }],
      curvas: [{ categoria_id: "c", talla_id: "s", unidades: 4 }],
      vendido: [{ categoria_id: "c", unidades: 9 }],
    })!;
    expect(l.categorias[0].tallas).toHaveLength(1);
    expect(l.lineas.get("c")?.precio).toBe(50);
    expect(l.stock.get("c")).toBe(7);
    expect(l.vendidoPorTalla.get("c")?.get("s")).toBe(4);
    expect(l.vendidoEnCampana.get("c")).toBe(9);
  });
  it("forma rara → null", () => {
    expect(leerPlan(null)).toBeNull();
    expect(leerPlan({ plan: {} })).toBeNull();
  });
});

describe("armarFilas y totalesDelPlan: la hoja", () => {
  // Polos vendió 5 en 90 días, Bodys 9, Faldas 0 (pero tiene plan), Abrigos 0 y sin nada. Faldas: precio 100, costo 40, lo que sobra a la
  // mitad → cubre todo (cuantil 1) → objetivo = bueno (180).
  const plan = () =>
    leerPlan({
      plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
      hoy: "2026-10-05",
      categorias: [
        { id: "a", nombre: "Polos", familia: "indumentaria", tallas: [] },
        { id: "b", nombre: "Bodys", familia: "indumentaria", tallas: [] },
        { id: "c", nombre: "Abrigos", familia: "indumentaria", tallas: [] },
        { id: "d", nombre: "Faldas", familia: "indumentaria", tallas: [] },
        { id: "e", nombre: "Anillos", familia: "bisuteria", tallas: [] },
      ],
      lineas: [{ categoria_id: "d", flojo: 80, normal: 120, bueno: 180, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null }],
      stock: [{ categoria_id: "a", unidades: 30 }, { categoria_id: "b", unidades: 10 }, { categoria_id: "d", unidades: 30 }],
      curvas: [
        { categoria_id: "a", talla_id: "s", unidades: 3 },
        { categoria_id: "a", talla_id: "m", unidades: 2 },
        { categoria_id: "b", talla_id: "s", unidades: 9 },
        { categoria_id: "e", talla_id: "u", unidades: 4 },
      ],
      vendido: [{ categoria_id: "a", unidades: 5 }, { categoria_id: "d", unidades: 7 }],
    })!;
  const nombres = (f: { c: { nombre: string } }[]) => f.map((x) => x.c.nombre);

  it("por defecto, la que más vende primero; a igual venta, la de más stock; a igual stock, por nombre", () => {
    expect(nombres(armarFilas(plan()))).toEqual(["Bodys", "Polos", "Anillos", "Faldas", "Abrigos"]);
  });
  it("las ventas de 90 días suman todas las tallas, y las que más venden llevan su puesto (una sin ventas nunca entra)", () => {
    const f = armarFilas(plan());
    expect(f.map((x) => [x.c.nombre, x.ventas, x.puesto])).toEqual([["Bodys", 9, 1], ["Polos", 5, 2], ["Anillos", 4, 3], ["Faldas", 0, null], ["Abrigos", 0, null]]);
  });
  it("solo las TOP_VENTAS que más venden llevan puesto", () => {
    const categorias = Array.from({ length: 14 }, (_, i) => ({ id: `c${i}`, nombre: `Cat ${String(i).padStart(2, "0")}`, tallas: [] }));
    const curvas = categorias.map((c, i) => ({ categoria_id: c.id, talla_id: "s", unidades: i + 1 }));
    const f = armarFilas(leerPlan({ plan: { id: "p", nombre: "x", desde: "2026-12-01", hasta: "2026-12-31" }, hoy: "2026-10-05", categorias, curvas })!);
    expect(f.filter((x) => x.puesto !== null)).toHaveLength(TOP_VENTAS);
    expect(f[0].c.nombre).toBe("Cat 13");
    expect(f[0].puesto).toBe(1);
    expect(f[TOP_VENTAS - 1].puesto).toBe(TOP_VENTAS);
    expect(f[TOP_VENTAS].puesto).toBeNull();
  });
  it("la cuenta de cada fila es la de `calcular` con el stock de la red; sin plan no hay cuenta", () => {
    const f = armarFilas(plan());
    const faldas = f.find((x) => x.c.nombre === "Faldas")!;
    expect(faldas.calculo).toEqual(calcular({ flojo: 80, normal: 120, bueno: 180, precio: 100, costo: 40, recuperoPct: 50 }, 30));
    expect(faldas.calculo?.comprar).toBe(150);
    expect(f.find((x) => x.c.nombre === "Bodys")!.calculo).toBeNull();
    expect(f.find((x) => x.c.nombre === "Abrigos")!.stock).toBe(0);
  });
  it("los totales suman solo lo que tiene plan, pero lo vendido es de todas", () => {
    expect(totalesDelPlan(armarFilas(plan()))).toEqual({ conPlan: 1, total: 5, aComprar: 150, inversion: 6000, vendido: 12 });
  });
  it("sin categorías, todo en cero", () => {
    expect(totalesDelPlan([])).toEqual({ conPlan: 0, total: 0, aComprar: 0, inversion: 0, vendido: 0 });
  });
  it("el mismo plan da siempre el mismo orden", () => {
    expect(armarFilas(plan()).map((x) => x.c.id)).toEqual(armarFilas(plan()).map((x) => x.c.id));
  });
});

describe("filtrar, ordenar y plegar la hoja", () => {
  const base = () =>
    armarFilas(
      leerPlan({
        plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
        hoy: "2026-10-05",
        categorias: [
          { id: "a", nombre: "Polos", familia: "indumentaria", tallas: [] },
          { id: "b", nombre: "Camisas y Blusas", familia: "indumentaria", tallas: [] },
          { id: "c", nombre: "Abrigos", familia: "indumentaria", tallas: [] },
          { id: "d", nombre: "Faldas", familia: "indumentaria", tallas: [] },
          { id: "e", nombre: "Anillos", familia: "bisuteria", tallas: [] },
          { id: "f", nombre: "Kimonos", familia: "indumentaria", tallas: [] },
        ],
        lineas: [{ categoria_id: "d", flojo: 80, normal: 120, bueno: 180, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null }],
        stock: [{ categoria_id: "a", unidades: 30 }, { categoria_id: "b", unidades: 10 }],
        // Kimonos: vendía 6 y se agotó. Anillos: nada. Abrigos: nada. Faldas: tiene plan sin movimiento.
        curvas: [{ categoria_id: "a", talla_id: "s", unidades: 5 }, { categoria_id: "f", talla_id: "s", unidades: 6 }],
      })!,
    );
  const nombres = (f: { c: { nombre: string } }[]) => f.map((x) => x.c.nombre);

  it("las píldoras: sin plan, con plan, las que más venden, las que se agotaron", () => {
    const f = base();
    expect(nombres(aplicarFiltro(f, "con"))).toEqual(["Faldas"]);
    expect(nombres(aplicarFiltro(f, "sin"))).toEqual(["Kimonos", "Polos", "Camisas y Blusas", "Abrigos", "Anillos"]);
    expect(nombres(aplicarFiltro(f, "top"))).toEqual(["Kimonos", "Polos"]);
    expect(nombres(aplicarFiltro(f, "agotadas"))).toEqual(["Kimonos"]);
    expect(aplicarFiltro(f, "todas")).toHaveLength(6);
  });
  it("«se agotó» pide que vendiera: lo que no vende y no tiene no está agotado, solo está quieto", () => {
    const f = base();
    expect(esAgotada(f.find((x) => x.c.nombre === "Abrigos")!)).toBe(false);
    expect(esAgotada(f.find((x) => x.c.nombre === "Kimonos")!)).toBe(true);
  });
  it("la familia y el buscador (sin tildes ni mayúsculas) mueven los conteos de las píldoras", () => {
    const f = base();
    expect(nombres(filtrarFilas(f, { familia: "bisuteria" }))).toEqual(["Anillos"]);
    expect(nombres(filtrarFilas(f, { q: "CAMISAS" }))).toEqual(["Camisas y Blusas"]);
    expect(nombres(filtrarFilas(f, { q: "  fáldas " }))).toEqual(["Faldas"]);
    expect(filtrarFilas(f, { familia: "todas", q: "" })).toHaveLength(6);
    expect(conteosDeFiltros(filtrarFilas(f, { familia: "indumentaria" }))).toEqual({ todas: 5, sin: 4, con: 1, top: 2, agotadas: 1 });
  });
  it("el orden: por ventas, por inversión (las sin plan al final) y por nombre; no toca la lista que recibe", () => {
    const f = base();
    const antes = nombres(f);
    expect(nombres(ordenarFilas(f, "nombre"))).toEqual(["Abrigos", "Anillos", "Camisas y Blusas", "Faldas", "Kimonos", "Polos"]);
    expect(nombres(ordenarFilas(f, "inversion"))[0]).toBe("Faldas");
    expect(nombres(ordenarFilas(f, "ventas"))).toEqual(antes);
    expect(nombres(f)).toEqual(antes);
  });
  it("se pliegan las que no tienen plan, stock ni ventas; una con plan nunca se esconde", () => {
    const { visibles, plegadas } = plegarSinMovimiento(base());
    expect(nombres(plegadas)).toEqual(["Abrigos", "Anillos"]);
    expect(nombres(visibles)).toContain("Faldas");
    expect(visibles).toHaveLength(4);
  });
});

describe("momentoDeLaCampana", () => {
  it("antes: cuántos días faltan, en singular cuando es uno", () => {
    expect(momentoDeLaCampana("2026-10-10", "2026-12-01", "2026-12-31")).toEqual({ estado: "antes", fuerte: "Faltan 52 días", resto: "para que empiece" });
    expect(momentoDeLaCampana("2026-11-30", "2026-12-01", "2026-12-31").fuerte).toBe("Falta 1 día");
  });
  it("durante: en qué día va, contando el primero como el día 1", () => {
    expect(momentoDeLaCampana("2026-12-01", "2026-12-01", "2026-12-31").fuerte).toBe("Día 1 de 31");
    expect(momentoDeLaCampana("2026-12-15", "2026-12-01", "2026-12-31").fuerte).toBe("Día 15 de 31");
    expect(momentoDeLaCampana("2026-12-31", "2026-12-01", "2026-12-31").fuerte).toBe("Día 31 de 31");
  });
  it("después: hace cuántos días terminó", () => {
    expect(momentoDeLaCampana("2027-01-08", "2026-12-01", "2026-12-31").fuerte).toBe("Terminó hace 8 días");
    expect(momentoDeLaCampana("2027-01-01", "2026-12-01", "2026-12-31").fuerte).toBe("Terminó hace 1 día");
  });
  it("los días entre dos fechas no se mueven con el horario de verano de ninguna parte", () => {
    expect(diasEntre("2026-03-01", "2026-04-01")).toBe(31);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("la barra de rango", () => {
  it("la escala llega un 10 % más allá de lo más lejano, y nunca es cero", () => {
    expect(escalaDeRango({ bueno: 180 }, { objetivo: 150, stock: 30 })).toBeCloseTo(198);
    expect(escalaDeRango({ bueno: 100 }, { objetivo: 100, stock: 400 })).toBeCloseTo(440);
    expect(escalaDeRango({ bueno: 100 }, { objetivo: 100, stock: 30 }, 500)).toBeCloseTo(550);
    expect(escalaDeRango({ bueno: 0 }, { objetivo: 0, stock: 0 })).toBeGreaterThan(0);
  });
  it("la posición queda entre 0 y 100, también con valores raros", () => {
    expect(posicionEnEscala(50, 200)).toBe(25);
    expect(posicionEnEscala(-5, 200)).toBe(0);
    expect(posicionEnEscala(999, 200)).toBe(100);
    expect(posicionEnEscala(5, 0)).toBe(0);
  });
});

describe("propuestaDeNormal y siguienteSinPlan", () => {
  it("un diciembre normal es el triple de un mes normal: con 90 días vendidos, lo mismo que se vendió en esos 90 días", () => {
    expect(propuestaDeNormal(90)).toBe(90);
    expect(propuestaDeNormal(38)).toBe(38);
    expect(propuestaDeNormal(5)).toBe(5);
  });
  it("sin ventas no hay qué proponer (ni con datos raros)", () => {
    expect(propuestaDeNormal(0)).toBeNull();
    expect(propuestaDeNormal(-3)).toBeNull();
    expect(propuestaDeNormal(Number.NaN)).toBeNull();
  });

  const filas = () =>
    armarFilas(
      leerPlan({
        plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
        hoy: "2026-10-05",
        categorias: [
          { id: "a", nombre: "Polos", tallas: [] },
          { id: "b", nombre: "Bodys", tallas: [] },
          { id: "c", nombre: "Abrigos", tallas: [] },
          { id: "d", nombre: "Faldas", tallas: [] },
        ],
        lineas: [{ categoria_id: "b", flojo: 1, normal: 2, bueno: 3, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null }],
        stock: [{ categoria_id: "d", unidades: 4 }],
        curvas: [{ categoria_id: "a", talla_id: "s", unidades: 9 }, { categoria_id: "b", talla_id: "s", unidades: 20 }],
      })!,
    );
  it("la siguiente es la que más vende de las que no tienen plan; una con plan nunca", () => {
    expect(siguienteSinPlan(filas())?.c.nombre).toBe("Polos");
  });
  it("salta las que ya se guardaron en esta tanda y sigue con la próxima que se mueve", () => {
    expect(siguienteSinPlan(filas(), ["a"])?.c.nombre).toBe("Faldas");
  });
  it("una sin ventas ni stock no se ofrece; si no queda ninguna, null", () => {
    expect(siguienteSinPlan(filas(), ["a", "d"])).toBeNull();
  });
});

describe("el paso a paso: cola, pendientes y avance", () => {
  // Cat 0 a 11 con ventas 12, 11, …, 1 (las 10 primeras son las que más venden). «Con plan» ya tiene plan. «Quieta» no vende ni tiene stock.
  const filas = () =>
    armarFilas(
      leerPlan({
        plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
        hoy: "2026-10-05",
        categorias: [
          ...Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, nombre: `Cat ${String(i).padStart(2, "0")}`, tallas: [] })),
          { id: "quieta", nombre: "Quieta", tallas: [] },
          { id: "stock", nombre: "Solo stock", tallas: [] },
        ],
        lineas: [{ categoria_id: "c1", flojo: 1, normal: 2, bueno: 3, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null }],
        stock: [{ categoria_id: "stock", unidades: 2 }],
        curvas: Array.from({ length: 12 }, (_, i) => ({ categoria_id: `c${i}`, talla_id: "s", unidades: 12 - i })),
      })!,
    );
  const ids = (f: { c: { id: string } }[]) => f.map((x) => x.c.id);

  it("«top» son las 10 que más venden; «todas» suma las que se mueven (ventas o stock) y deja fuera las quietas", () => {
    expect(ids(colaDelPaso(filas(), "top"))).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]);
    const todas = ids(colaDelPaso(filas(), "todas"));
    expect(todas).toHaveLength(13);
    expect(todas).toContain("stock");
    expect(todas).not.toContain("quieta");
  });
  it("lo pendiente no incluye lo que ya tiene plan ni lo guardado en esta tanda", () => {
    const cola = colaDelPaso(filas(), "top");
    expect(ids(pendientesDelPaso(cola))).toEqual(["c0", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]);
    expect(ids(pendientesDelPaso(cola, ["c0", "c2"]))[0]).toBe("c3");
  });
  it("las saltadas pasan al final, en su orden, y no se pierden", () => {
    const cola = colaDelPaso(filas(), "top");
    expect(ids(pendientesDelPaso(cola, [], ["c0", "c3"]))).toEqual(["c2", "c4", "c5", "c6", "c7", "c8", "c9", "c0", "c3"]);
  });
  it("el avance cuenta las que venían con plan y las guardadas ahora", () => {
    const cola = colaDelPaso(filas(), "top");
    expect(avanceDelPaso(cola)).toEqual({ hechas: 1, total: 10 });
    expect(avanceDelPaso(cola, ["c0", "c2"])).toEqual({ hechas: 3, total: 10 });
    expect(avanceDelPaso(cola, ["c1"])).toEqual({ hechas: 1, total: 10 });
  });
  it("sin ventas, «top» está vacío y no hay nada que recorrer", () => {
    const sinVentas = armarFilas(leerPlan({ plan: { id: "p", nombre: "x", desde: "2026-12-01", hasta: "2026-12-31" }, hoy: "2026-10-05", categorias: [{ id: "a", nombre: "A", tallas: [] }] })!);
    expect(colaDelPaso(sinVentas, "top")).toEqual([]);
    expect(avanceDelPaso([])).toEqual({ hechas: 0, total: 0 });
  });
});

describe("confianzaDelStock: ¿se le puede creer al «Hay hoy»?", () => {
  const sede = (nombre: string, piso: boolean, almacen: boolean) => ({
    nombre,
    condiciones: [
      { clave: "venta_identificada" as const, titulo: "x", cumple: false, detalle: "", falta: null },
      { clave: "piso_cuadrado" as const, titulo: "x", cumple: piso, detalle: "", falta: null },
      { clave: "almacen_contado" as const, titulo: "x", cumple: almacen, detalle: "", falta: null },
    ],
  });
  it("confiable solo si TODAS las tiendas tienen el piso cuadrado y el almacén contado (la venta identificada no cuenta: no es stock)", () => {
    expect(confianzaDelStock({ sedes: [sede("TRU", true, true), sede("AQP", true, true)], falla: null }).estado).toBe("confiable");
  });
  it("incompleto si a una le falta algo, y dice qué en palabras de tienda", () => {
    const c = confianzaDelStock({ sedes: [sede("TRU", true, true), sede("AQP", false, true), sede("LIM", false, false)], falla: null });
    expect(c.estado).toBe("incompleto");
    expect(c.sedes.map((x) => [x.nombre, x.alDia, x.falta])).toEqual([["TRU", true, null], ["AQP", false, "piso sin cuadrar"], ["LIM", false, "piso sin cuadrar y almacén sin contar"]]);
  });
  it("si la lectura falló o no hay ninguna tienda, no hay dato: nunca «confiable» por omisión", () => {
    expect(confianzaDelStock({ sedes: [sede("TRU", true, true)], falla: "No se pudo leer" })).toEqual({ estado: "sin-dato", sedes: [] });
    expect(confianzaDelStock({ sedes: [], falla: null })).toEqual({ estado: "sin-dato", sedes: [] });
  });
  it("una condición que falta en la respuesta cuenta como no cumplida", () => {
    const c = confianzaDelStock({ sedes: [{ nombre: "TRU", condiciones: [] }], falla: null });
    expect(c.estado).toBe("incompleto");
    expect(c.sedes[0].falta).toBe("piso sin cuadrar y almacén sin contar");
  });
});

describe("la lista de compra: lo que se exporta", () => {
  const filas = () =>
    armarFilas(
      leerPlan({
        plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
        hoy: "2026-10-05",
        categorias: [
          { id: "a", nombre: "Camisas y Blusas", tallas: [{ id: "xl", valor: "XL" }, { id: "s", valor: "S" }, { id: "m", valor: "M" }] },
          { id: "b", nombre: "Anillos", tallas: [] },
          { id: "c", nombre: "Sobra", tallas: [] },
          { id: "d", nombre: "=SUMA(1;1)", tallas: [] },
          { id: "e", nombre: "Sin plan", tallas: [] },
        ],
        // precio 100, costo 40, lo que sobra a la mitad: cuantil 1 → se compra hasta el bueno.
        lineas: [
          { categoria_id: "a", flojo: 10, normal: 20, bueno: 100, precio: "100", costo: "40", recupero_pct: 50, curva: { s: 50, m: 30, xl: 20 }, nota: null },
          { categoria_id: "b", flojo: 5, normal: 10, bueno: 20, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null },
          { categoria_id: "c", flojo: 5, normal: 10, bueno: 20, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null },
          { categoria_id: "d", flojo: 1, normal: 2, bueno: 3, precio: "100", costo: "40", recupero_pct: 50, curva: {}, nota: null },
        ],
        stock: [{ categoria_id: "c", unidades: 50 }],
      })!,
    );

  it("solo lo que tiene plan y algo que comprar, lo que más cuesta primero", () => {
    const l = filasDeLaListaDeCompra(filas());
    expect(l.map((x) => x.categoria)).toEqual(["Camisas y Blusas", "Anillos", "=SUMA(1;1)"]);
    expect(l.map((x) => [x.comprar, x.inversion])).toEqual([[100, 4000], [20, 800], [3, 120]]);
  });
  it("las tallas van en el orden de siempre (S, M, XL) y suman lo que se compra; sin tallas, «—»", () => {
    const [camisas, anillos] = filasDeLaListaDeCompra(filas());
    expect(camisas.porTalla).toBe("S 50 · M 30 · XL 20");
    expect(anillos.porTalla).toBe("—");
  });
  it("una con plan que ya tiene de sobra no es una línea de la lista", () => {
    expect(filasDeLaListaDeCompra(filas()).some((x) => x.categoria === "Sobra")).toBe(false);
  });
  it("el CSV lleva el total al final, el dinero con dos decimales y las «fórmulas» como texto", () => {
    const csv = filasDelCsvDeCompra(filasDeLaListaDeCompra(filas()));
    expect(csv[0]).toEqual(["Camisas y Blusas", 100, "S 50 · M 30 · XL 20", "4000.00"]);
    expect(csv[2][0]).toBe("'=SUMA(1;1)");
    expect(csv[csv.length - 1]).toEqual(["Total", 123, "", "4920.00"]);
    expect(ENCABEZADOS_LISTA_COMPRA).toEqual(["Categoría", "Comprar", "Por talla", "Inversión (S/)"]);
  });
  it("un texto que empieza con = + - @ se vuelve texto; los demás no se tocan", () => {
    expect(comoTextoDeExcel("=1+1")).toBe("'=1+1");
    expect(comoTextoDeExcel("+51 999")).toBe("'+51 999");
    expect(comoTextoDeExcel("-3")).toBe("'-3");
    expect(comoTextoDeExcel("@a")).toBe("'@a");
    expect(comoTextoDeExcel("Polos")).toBe("Polos");
    expect(comoTextoDeExcel("A-B")).toBe("A-B");
  });
  it("el nombre del archivo, sin tildes ni signos", () => {
    expect(nombreDelArchivoDeCompra("Diciembre 2026")).toBe("lista-de-compra-diciembre-2026.csv");
    expect(nombreDelArchivoDeCompra("Día de la Madre 2027")).toBe("lista-de-compra-dia-de-la-madre-2027.csv");
    expect(nombreDelArchivoDeCompra("¡¡!!")).toBe("lista-de-compra-campana.csv");
  });
  it("sin nada que comprar, la lista está vacía y el total en cero", () => {
    expect(filasDeLaListaDeCompra([])).toEqual([]);
    expect(filasDelCsvDeCompra([])).toEqual([["Total", 0, "", "0.00"]]);
  });
});

describe("la lectura ampliada (ADR-0372, B1 y B2) y su retrocompatibilidad", () => {
  const base = {
    plan: { id: "p", nombre: "Diciembre 2026", desde: "2026-12-01", hasta: "2026-12-31" },
    hoy: "2026-10-05",
    categorias: [{ id: "c", nombre: "Polos", tallas: [] }, { id: "d", nombre: "Bodys", tallas: [] }],
  };
  it("una respuesta VIEJA de la base (sin las claves nuevas) se lee sin caerse y lo nuevo queda en null", () => {
    const l = leerPlan(base)!;
    expect(l.catalogo).toBeNull();
    expect(l.stockSedes).toBeNull();
    expect(l.vendido30).toBeNull();
    expect(l.tope).toEqual({ soportado: false, valor: null });
    const f = armarFilas(l)[0];
    expect([f.ventas30, f.sedes, f.catalogo]).toEqual([null, null, null]);
  });
  it("con las claves nuevas, cada una llega a su fila; lo que no trae dato queda vacío, no inventado", () => {
    const l = leerPlan({
      ...base,
      plan: { ...base.plan, tope_inversion: "12000.50" },
      catalogo: [{ categoria_id: "c", precio: "69.90", costo: "28.00" }, { categoria_id: "d", precio: "50", costo: 0 }],
      stock_sedes: [{ categoria_id: "c", ubicacion: "Tienda Lima", unidades: 120 }, { categoria_id: "c", ubicacion: "Taller", unidades: 16 }, { categoria_id: "c", ubicacion: "Cero", unidades: 0 }],
      vendido_30: [{ categoria_id: "c", unidades: 14 }],
    })!;
    expect(l.tope).toEqual({ soportado: true, valor: 12000.5 });
    const polos = armarFilas(l).find((x) => x.c.id === "c")!;
    const bodys = armarFilas(l).find((x) => x.c.id === "d")!;
    expect(polos.catalogo).toEqual({ precio: 69.9, costo: 28 });
    expect(polos.sedes).toEqual([{ ubicacion: "Tienda Lima", unidades: 120 }, { ubicacion: "Taller", unidades: 16 }]);
    expect(polos.ventas30).toBe(14);
    // Un costo en 0 es «sin dato», no «gratis»: no se ofrece como punto de partida.
    expect(bodys.catalogo).toBeNull();
    expect(bodys.sedes).toEqual([]);
    expect(bodys.ventas30).toBe(0);
  });
  it("tope: la base lo conoce pero no hay tope (null o 0) es «sin tope»", () => {
    expect(leerPlan({ ...base, plan: { ...base.plan, tope_inversion: null } })!.tope).toEqual({ soportado: true, valor: null });
    expect(leerPlan({ ...base, plan: { ...base.plan, tope_inversion: 0 } })!.tope).toEqual({ soportado: true, valor: null });
  });
  it("sin plan guardado, el precio y el costo arrancan con los del catálogo; con plan, manda lo guardado; sin catálogo, en blanco", () => {
    expect(borradorDe(undefined, TALLAS, undefined, { precio: 69.9, costo: 28 })).toMatchObject({ precio: "69.90", costo: "28.00" });
    expect(borradorDe(undefined, TALLAS, undefined)).toMatchObject({ precio: "", costo: "" });
    expect(borradorDe(undefined, TALLAS, undefined, null)).toMatchObject({ precio: "", costo: "" });
    const guardado = borradorDe({ categoriaId: "c", flojo: 1, normal: 2, bueno: 3, precio: 50, costo: 20, recuperoPct: 40, curva: {}, nota: null, actualizadoPor: null, actualizadoEn: null }, TALLAS, undefined, { precio: 99, costo: 9 });
    expect(guardado).toMatchObject({ precio: "50.00", costo: "20.00" });
  });
});

describe("el tope de inversión: leer lo que se escribe y medirlo", () => {
  it("lee un monto como lo escribe una persona: miles con coma o espacio, decimal con punto o coma", () => {
    expect(leerMonto("12000")).toBe(12000);
    expect(leerMonto("12,000")).toBe(12000);
    expect(leerMonto("12 000")).toBe(12000);
    expect(leerMonto("1,234,567.89")).toBe(1234567.89);
    expect(leerMonto("12000.5")).toBe(12000.5);
    expect(leerMonto("12000,50")).toBe(12000.5);
    expect(leerMonto("12,5")).toBe(12.5);
    expect(leerMonto("  8 500  ")).toBe(8500);
  });
  it("lo que no es un monto, o no es mayor que cero, no se lee", () => {
    for (const t of ["", "  ", "0", "0,00", "-5", "abc", "12.3.4", "12,000.123", "1e5", "S/ 100", "99999999999"]) expect(leerMonto(t), t).toBeNull();
  });
  it("el problema dice qué hacer, y los argumentos van como los espera la base (null quita el tope)", () => {
    expect(problemaDelTope("")).toMatch(/Escribe cuánto/);
    expect(problemaDelTope("12,000")).toBeNull();
    expect(argsGuardarTope("p", "12,000")).toEqual({ p_plan_id: "p", p_tope: 12000 });
    expect(argsGuardarTope("p", null)).toEqual({ p_plan_id: "p", p_tope: null });
  });
  it("el efecto de una categoría en el tope: el total, el % y cuánto te pasas (0 si no)", () => {
    expect(efectoEnElTope(9000, 1500.5, 12000)).toEqual({ total: 10500.5, porcentaje: 88, excede: 0 });
    expect(efectoEnElTope(11000, 1500, 12000)).toEqual({ total: 12500, porcentaje: 104, excede: 500 });
    expect(efectoEnElTope(0, 0, 12000)).toEqual({ total: 0, porcentaje: 0, excede: 0 });
  });
  it("la barra: las 5 que más cuestan y el resto junto en «Otras»; sin plan o sin costo no entran", () => {
    const mk = (n: number, inv: number) => ({ c: { id: `c${n}`, nombre: `Cat ${n}`, prefijo: null, familia: null, tallas: [] }, linea: undefined, stock: 0, calculo: { cuantil: 1, objetivo: 1, stock: 0, comprar: 1, inversion: inv }, vendido: 0, ventas: 0, puesto: null, ventas30: null, sedes: null, catalogo: null });
    const filas = [mk(1, 100), mk(2, 700), mk(3, 300), mk(4, 500), mk(5, 200), mk(6, 50), mk(7, 25), { ...mk(8, 0) }, { ...mk(9, 900), calculo: null }];
    const seg = segmentosDelTope(filas);
    expect(seg.map((x) => [x.clave, x.valor])).toEqual([["c2", 700], ["c4", 500], ["c3", 300], ["c5", 200], ["c1", 100], ["otras", 75]]);
    expect(segmentosDelTope(filas.slice(0, 3)).some((x) => x.clave === "otras")).toBe(false);
    expect(segmentosDelTope([])).toEqual([]);
  });
});

describe("la guía del tope dice lo mismo que la validación", () => {
  const listo = { listo: true, motivo: null };
  it("deja confirmar exactamente cuando el monto se lee y hay quien firme", () => {
    for (const t of ["12000", "12,000", "12 000", "12000.50", "8,5"]) expect(sePuedeConfirmar(camposDelTope(t, listo)), t).toBe(true);
    for (const t of ["", "0", "abc", "-5", "S/ 100"]) expect(sePuedeConfirmar(camposDelTope(t, listo)), t).toBe(false);
    expect(sePuedeConfirmar(camposDelTope("12000", { listo: false, motivo: "Elige quién" }))).toBe(false);
  });
  it("lo que falta dice qué hacer, con el mismo texto que la validación", () => {
    const [tope, quien] = camposDelTope("", { listo: false, motivo: "Elige quién fija el tope." });
    expect(tope.pendiente).toBe(problemaDelTope(""));
    expect(quien.pendiente).toBe("Elige quién fija el tope.");
  });
});
