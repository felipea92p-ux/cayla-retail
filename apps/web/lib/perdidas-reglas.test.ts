import { describe, expect, it } from "vitest";
import {
  DEJA_EN_CERO_DESDE,
  RESTA_GRANDE_MAS_DE,
  avisoPerdidas,
  esRestaGrandeSinNota,
  filtrosPerdidas,
  fraseRepeticion,
  hrefDocumento,
  hrefPerdidas,
  leerResumenPerdidas,
  listaCortada,
  perdidasQueSeRepiten,
  rangoPerdidas,
  textoRazon,
  textoRespaldo,
  type HechoPerdida,
} from "./perdidas-reglas";

const HOY = "2026-10-20";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-aaaaaaaaaaaa";
const PISO = "33333333-3333-4333-8333-333333333333";
const ALM = "44444444-4444-4444-8444-444444444444";

let n = 0;
/** Un hecho de pérdida con valores de tienda; cada prueba cambia solo lo que mira. */
function hecho(o: Partial<HechoPerdida> = {}): HechoPerdida {
  n += 1;
  return {
    id: `h${n}`,
    fuente: "movimiento",
    lado: "perdida",
    razon: "conteo",
    instante: `${o.dia ?? HOY}T12:00:00-05:00`,
    dia: HOY,
    varianteId: V1,
    productoId: "p1",
    producto: "Polo Básico",
    codigo: "POL-0001",
    categoria: "Polos",
    talla: "M",
    color: "Negro",
    colorHex: "#1a1a18",
    sububicacionId: PISO,
    zona: "Piso de venta",
    zonaTipo: "piso_venta",
    unidades: 1,
    costoUnitario: null,
    conDocumento: true,
    documentoTipo: "conteo",
    documentoId: "c1",
    documentoNumero: 7,
    nota: null,
    quedaron: null,
    ...o,
  };
}

describe("perdidasQueSeRepiten — la misma prenda", () => {
  it("una prenda que pierde en DOS días distintos de los últimos 30 avisa, con cuántas y cuándo fue la última", () => {
    const r = perdidasQueSeRepiten([hecho({ dia: "2026-10-02", unidades: 1 }), hecho({ dia: "2026-10-15", unidades: 2 })], HOY);
    expect(r).toEqual([
      { tipo: "prenda", clave: `prenda:${V1}`, varianteId: V1, etiqueta: "Polo Básico · M · Negro", veces: 2, unidades: 3, ultimoDia: "2026-10-15" },
      // El piso también perdió dos días (es la zona de los dos faltantes).
      expect.objectContaining({ tipo: "zona", sububicacionId: PISO, veces: 2, unidades: 3 }),
    ]);
  });

  it("dos faltantes el MISMO día son una sola vez: no avisa", () => {
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-10" }), hecho({ dia: "2026-10-10", sububicacionId: ALM, zonaTipo: "almacen_tienda" })], HOY)).toEqual([]);
  });

  it("la ventana es de 30 días contando hoy: el día 31 hacia atrás ya no cuenta", () => {
    // HOY − 29 = 2026-09-21 está dentro; 2026-09-20 ya no.
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-09-21" }), hecho({ dia: HOY })], HOY).some((r) => r.tipo === "prenda")).toBe(true);
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-09-20" }), hecho({ dia: HOY })], HOY)).toEqual([]);
  });

  it("un día del futuro (otro reloj) no se cuenta como de hoy", () => {
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-21" }), hecho({ dia: HOY })], HOY)).toEqual([]);
  });

  it("lo que APARECIÓ nunca cuenta como pérdida que se repite (va aparte, nunca se resta)", () => {
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-02", lado: "aparecio" }), hecho({ dia: "2026-10-15", lado: "aparecio" })], HOY)).toEqual([]);
    // Una pérdida + una aparición de la misma prenda: una sola pérdida, no avisa.
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-02" }), hecho({ dia: "2026-10-15", lado: "aparecio" })], HOY)).toEqual([]);
  });

  it("dos prendas distintas que pierden una vez cada una no avisan", () => {
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-02", sububicacionId: null }), hecho({ dia: "2026-10-15", varianteId: V2, sububicacionId: null })], HOY)).toEqual([]);
  });

  it("cualquier razón cuenta para la prenda: un faltante de conteo y luego una dañada botada", () => {
    const r = perdidasQueSeRepiten([hecho({ dia: "2026-10-02", sububicacionId: null }), hecho({ dia: "2026-10-15", razon: "danada", sububicacionId: null })], HOY);
    expect(r.map((x) => x.tipo)).toEqual(["prenda"]);
  });
});

describe("perdidasQueSeRepiten — la misma zona", () => {
  it("el almacén que pierde dos prendas distintas en dos días avisa como zona, no como prenda", () => {
    const r = perdidasQueSeRepiten(
      [
        hecho({ dia: "2026-10-03", sububicacionId: ALM, zona: "Almacén", zonaTipo: "almacen_tienda" }),
        hecho({ dia: "2026-10-12", varianteId: V2, sububicacionId: ALM, zona: "Almacén", zonaTipo: "almacen_tienda", razon: "a_mano", unidades: 2 }),
      ],
      HOY
    );
    expect(r).toEqual([{ tipo: "zona", clave: `zona:${ALM}`, sububicacionId: ALM, etiqueta: "Almacén", zonaTipo: "almacen_tienda", veces: 2, unidades: 3, ultimoDia: "2026-10-12" }]);
    expect(fraseRepeticion(r[0])).toBe("El almacén perdió 3 prendas en 2 días distintos");
  });

  it("las dañadas botadas y lo que faltó en un traslado no hablan de una zona", () => {
    const cuarentena = { sububicacionId: ALM, zonaTipo: "cuarentena", zona: "Cuarentena" };
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-03", razon: "danada", ...cuarentena }), hecho({ dia: "2026-10-12", varianteId: V2, razon: "danada", ...cuarentena })], HOY)).toEqual([]);
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-03", razon: "traslado" }), hecho({ dia: "2026-10-12", varianteId: V2, razon: "traslado" })], HOY)).toEqual([]);
  });

  it("sin zona (una sede que no separa piso y almacén) no hay aviso de zona", () => {
    expect(perdidasQueSeRepiten([hecho({ dia: "2026-10-03", sububicacionId: null }), hecho({ dia: "2026-10-12", varianteId: V2, sububicacionId: null })], HOY)).toEqual([]);
  });
});

describe("esRestaGrandeSinNota", () => {
  const aMano = { conDocumento: false, documentoTipo: null, documentoId: null, documentoNumero: null, razon: "a_mano" };
  it(`más de ${RESTA_GRANDE_MAS_DE} de una talla sin nota es grande; ${RESTA_GRANDE_MAS_DE} no`, () => {
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: RESTA_GRANDE_MAS_DE + 1 }))).toBe(true);
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: RESTA_GRANDE_MAS_DE, quedaron: 4 }))).toBe(false);
  });
  it(`dejar la talla en 0 teniendo ${DEJA_EN_CERO_DESDE} o más es grande; teniendo 2, no`, () => {
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: DEJA_EN_CERO_DESDE, quedaron: 0 }))).toBe(true);
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: DEJA_EN_CERO_DESDE - 1, quedaron: 0 }))).toBe(false);
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: DEJA_EN_CERO_DESDE, quedaron: 1 }))).toBe(false);
  });
  it("con nota, con documento (un conteo, un traslado) o si es lo que apareció, no es «sin nota»", () => {
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: 9, nota: "se mojó en la lluvia" }))).toBe(false);
    expect(esRestaGrandeSinNota(hecho({ unidades: 9 }))).toBe(false); // el conteo de fábrica de `hecho` tiene documento
    expect(esRestaGrandeSinNota(hecho({ ...aMano, fuente: "traslado", unidades: 9 }))).toBe(false);
    expect(esRestaGrandeSinNota(hecho({ ...aMano, lado: "aparecio", unidades: 9 }))).toBe(false);
  });
  it("solo las restas A MANO: una dañada botada o donada (ya está en Dañadas) y un «Conteo físico» (es contar) no avisan", () => {
    // Una dañada que el líder botó: salida sin conteo detrás (con_documento false) y la base le calcula «quedaron».
    expect(esRestaGrandeSinNota(hecho({ ...aMano, razon: "danada", zona: "Cuarentena", zonaTipo: "cuarentena", unidades: 6 }))).toBe(false);
    expect(esRestaGrandeSinNota(hecho({ ...aMano, razon: "danada", unidades: DEJA_EN_CERO_DESDE, quedaron: 0 }))).toBe(false);
    // El «Conteo físico» de Ajustar: razón «conteo» sin documento. Decisión técnica, pregunta abierta a Felipe en el PR.
    expect(esRestaGrandeSinNota(hecho({ ...aMano, razon: "conteo", unidades: 6 }))).toBe(false);
  });
  it("una nota de puros espacios es «sin nota»", () => {
    expect(esRestaGrandeSinNota(hecho({ ...aMano, unidades: 9, nota: "   " }))).toBe(true);
  });
  it("una resta grande avisa SOLA (una vez basta), primero que las repeticiones, y dice si la talla quedó en 0", () => {
    const grande = hecho({ ...aMano, dia: "2026-10-18", unidades: 3, quedaron: 0, varianteId: V2, producto: "Jean Recto", talla: "28", color: "Azul" });
    const r = perdidasQueSeRepiten([hecho({ dia: "2026-10-02", sububicacionId: null }), hecho({ dia: "2026-10-15", sububicacionId: null }), grande], HOY);
    expect(r.map((x) => x.tipo)).toEqual(["resta_grande", "prenda"]);
    expect(fraseRepeticion(r[0])).toBe("Se quitaron 3 prendas de Jean Recto · 28 · Azul sin nota y la talla quedó en 0");
  });
});

describe("avisoPerdidas — lo que dice el Inicio del líder", () => {
  it("sin nada que se repita: cantidad 0 (el Inicio lo dibuja «al día»)", () => {
    expect(avisoPerdidas([])).toEqual({ cantidad: 0, detalle: "", href: "/inventario/movimientos?vista=perdidas&p=30" });
  });
  it("una sola: la lleva a la pestaña filtrada a esa prenda", () => {
    const r = perdidasQueSeRepiten([hecho({ dia: "2026-10-02", sububicacionId: null }), hecho({ dia: "2026-10-15", sububicacionId: null })], HOY);
    expect(avisoPerdidas(r)).toEqual({
      cantidad: 1,
      detalle: "Polo Básico · M · Negro perdió 2 prendas en 2 días distintos.",
      href: `/inventario/movimientos?vista=perdidas&p=30&variante=${V1}`,
    });
  });
  it("varias: dice la primera y cuántas más, y lleva a la pestaña de 30 días", () => {
    const r = perdidasQueSeRepiten([hecho({ dia: "2026-10-02" }), hecho({ dia: "2026-10-15" })], HOY);
    const a = avisoPerdidas(r);
    expect(a.cantidad).toBe(2);
    expect(a.detalle).toMatch(/ · y 1 más\.$/);
    expect(a.href).toBe("/inventario/movimientos?vista=perdidas&p=30");
  });
  it("una zona sola lleva a la pestaña filtrada a esa zona", () => {
    const zona = { sububicacionId: ALM, zona: "Almacén", zonaTipo: "almacen_tienda" };
    const r = perdidasQueSeRepiten([hecho({ dia: "2026-10-03", ...zona }), hecho({ dia: "2026-10-12", varianteId: V2, ...zona })], HOY);
    expect(avisoPerdidas(r).href).toBe(`/inventario/movimientos?vista=perdidas&p=30&zona=${ALM}`);
  });
});

describe("rangoPerdidas — el período", () => {
  it("por defecto, este mes hasta hoy (se compara con las Mermas del mes en Finanzas)", () => {
    expect(rangoPerdidas(undefined, HOY)).toEqual({ periodo: "mes", desde: "2026-10-01", hasta: HOY, texto: "este mes (octubre)" });
    expect(rangoPerdidas("cualquier-cosa", HOY).periodo).toBe("mes");
  });
  it("el mes pasado entero, también al cruzar el año", () => {
    expect(rangoPerdidas("mes_pasado", HOY)).toEqual({ periodo: "mes_pasado", desde: "2026-09-01", hasta: "2026-09-30", texto: "septiembre" });
    expect(rangoPerdidas("mes_pasado", "2027-01-05")).toMatchObject({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(rangoPerdidas("mes_pasado", "2028-03-10")).toMatchObject({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
  it("30 y 90 días terminan hoy y cuentan hoy", () => {
    expect(rangoPerdidas("30", HOY)).toMatchObject({ desde: "2026-09-21", hasta: HOY });
    expect(rangoPerdidas("90", HOY)).toMatchObject({ desde: "2026-07-23", hasta: HOY });
  });
});

describe("la URL de la pestaña", () => {
  it("solo acepta uuids como prenda o zona", () => {
    expect(filtrosPerdidas({ variante: V1, zona: "piso" })).toEqual({ varianteId: V1, sububicacionId: null });
    expect(filtrosPerdidas({ variante: "'; drop table", zona: ALM })).toEqual({ varianteId: null, sububicacionId: ALM });
  });
  it("«este mes» no se escribe en la URL (es lo que se ve sin nada)", () => {
    expect(hrefPerdidas()).toBe("/inventario/movimientos?vista=perdidas");
    expect(hrefPerdidas({ periodo: "mes", varianteId: V1 })).toBe(`/inventario/movimientos?vista=perdidas&variante=${V1}`);
  });
});

describe("palabras de tienda", () => {
  it("cada razón dice qué pasó, de los dos lados", () => {
    expect(textoRazon("conteo", "perdida")).toBe("Faltó al contar");
    expect(textoRazon("traslado", "aparecio")).toBe("Llegó de más en un traslado");
    expect(textoRazon("a_mano", "aparecio")).toBe("Sumada a mano");
  });
  it("una razón que la base sume mañana se muestra, no rompe", () => {
    expect(textoRazon("uso_interno", "perdida")).toBe("uso interno");
  });
  it("el respaldo: el documento, la nota o «Sin nota»", () => {
    expect(textoRespaldo({ documentoTipo: "conteo", documentoNumero: 7, nota: null, fuente: "movimiento" })).toBe("Conteo 7");
    expect(textoRespaldo({ documentoTipo: "traslado", documentoNumero: 24, nota: "faltó una", fuente: "traslado" })).toBe("Traslado 24");
    expect(textoRespaldo({ documentoTipo: "venta", documentoNumero: null, nota: null, fuente: "anulacion" })).toBe("Venta anulada");
    expect(textoRespaldo({ documentoTipo: null, documentoNumero: null, nota: "se manchó", fuente: "movimiento" })).toBe("«se manchó»");
    expect(textoRespaldo({ documentoTipo: null, documentoNumero: null, nota: null, fuente: "movimiento" })).toBe("Sin nota");
  });
  it("el documento lleva a su pantalla; una venta anulada no tiene una aquí", () => {
    expect(hrefDocumento({ documentoTipo: "conteo", documentoId: "c1" })).toBe("/inventario/conteo/c1");
    expect(hrefDocumento({ documentoTipo: "traslado", documentoId: "t1" })).toBe("/inventario/traslados/t1");
    expect(hrefDocumento({ documentoTipo: "venta", documentoId: "v1" })).toBeNull();
  });
});

describe("leerResumenPerdidas", () => {
  it("lee el jsonb de la base (cifras como texto o número) y marca si la lista vino cortada", () => {
    const r = leerResumenPerdidas({
      desde: "2026-10-01",
      hasta: "2026-10-20",
      ve_costo: false,
      perdido: { unidades: 9, soles: "250.00", sin_costo: 1, hechos: 6 },
      aparecio: { unidades: 4, soles: 120, hechos: 3 },
      por_razon: [{ lado: "perdida", razon: "a_mano", unidades: 5, soles: "155" }],
      por_categoria: [{ categoria: "Polos", unidades: 9, soles: 250 }],
      por_talla: [{ talla: "M", unidades: 9, soles: 250 }],
      mas_faltan: [{ categoria: "Polos", talla: "M", color: "Negro", color_hex: "#000000", unidades: 5, veces: 3 }],
      hechos: [{ id: "x", fuente: "movimiento", lado: "perdida", razon: "a_mano", dia: "2026-10-12", variante_id: V1, unidades: 3, costo_unitario: null, quedaron: 0 }],
      hechos_total: 1200,
    });
    expect(r?.perdido).toEqual({ unidades: 9, soles: 250, sinCosto: 1, hechos: 6 });
    expect(r?.veCosto).toBe(false);
    expect(r?.hechos[0]).toMatchObject({ costoUnitario: null, quedaron: 0, conDocumento: false, dia: "2026-10-12" });
    expect(listaCortada(r!)).toBe(true);
  });
  it("algo que no es un objeto es «no se pudo leer», nunca un cero", () => {
    expect(leerResumenPerdidas(null)).toBeNull();
    expect(leerResumenPerdidas([1, 2])).toBeNull();
    expect(leerResumenPerdidas("x")).toBeNull();
  });
});
