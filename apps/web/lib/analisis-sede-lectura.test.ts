import { describe, expect, it } from "vitest";
import { fraseFallaSedes, leerAnalisisSede, leerPrendaSede, leerPrendasSede, leerSemanas, RPC_ANALISIS_SEDE, SEMANAS_LEIDAS } from "./analisis-sede-lectura";

// Datos inventados para la prueba: una fila como la devuelve `retail.fn_analisis_sede` (claves en snake_case).
function crudo(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    variante_id: "var-1",
    producto_id: "prod-1",
    nombre: "Camisa Oxford",
    color: "Celeste",
    color_hex: "#9CC3E0",
    talla: "S",
    categoria: "Camisas y Blusas",
    categoria_prefijo: "CMS",
    categoria_familia: "indumentaria",
    foto_url: "https://fotos.ejemplo.test/camisa.jpg",
    precio: 89.9,
    costo: 35.5,
    origen: "terceros",
    proveedor_id: "prov-1",
    piso: 2,
    almacen: 5,
    vendidas_30: 9,
    semanas: [0, 1, 0, 2, 3, 1, 2, 1],
    dias_sin_vender: 3,
    salio_al_piso: "2026-09-30",
    llego: "2026-09-29",
    llegaron_30: 6,
    vendidas_de_llegadas_30: 4,
    ...parcial,
  };
}

describe("la función que se llama", () => {
  it("es la de las migraciones 20261006214000 y 20261007120000, con 8 semanas", () => {
    expect(RPC_ANALISIS_SEDE).toBe("fn_analisis_sede");
    expect(SEMANAS_LEIDAS).toBe(8);
  });
});

describe("una fila completa", () => {
  it("pasa cada cifra a su campo del contrato", () => {
    expect(leerPrendaSede(crudo())).toEqual({
      varianteId: "var-1",
      productoId: "prod-1",
      nombre: "Camisa Oxford",
      color: "Celeste",
      colorHex: "#9CC3E0",
      talla: "S",
      categoria: "Camisas y Blusas",
      categoriaPrefijo: "CMS",
      categoriaFamilia: "indumentaria",
      fotoUrl: "https://fotos.ejemplo.test/camisa.jpg",
      precio: 89.9,
      costo: 35.5,
      origen: "terceros",
      proveedorId: "prov-1",
      piso: 2,
      almacen: 5,
      vendidas30: 9,
      semanas: [0, 1, 0, 2, 3, 1, 2, 1],
      diasSinVender: 3,
      salioAlPiso: "2026-09-30",
      llego: "2026-09-29",
      llegaron30: 6,
      vendidasDeLasQueLlegaron30: 4,
    });
  });

  it("nunca salió al piso: `salio_al_piso` en null; una fecha que no es fecha tampoco cuenta como salida", () => {
    expect(leerPrendaSede(crudo({ salio_al_piso: null, dias_sin_vender: null }))).toMatchObject({ salioAlPiso: null, diasSinVender: null, llego: "2026-09-29" });
    expect(leerPrendaSede(crudo({ salio_al_piso: "ayer", llego: 20261001 }))).toMatchObject({ salioAlPiso: null, llego: null });
  });

  it("del Taller no lleva proveedor (Comprar abre Producción, no Compras)", () => {
    const p = leerPrendaSede(crudo({ origen: "taller", proveedor_id: "prov-1" }));
    expect(p?.origen).toBe("taller");
    expect(p?.proveedorId).toBeNull();
  });

  it("entiende números que llegan como texto", () => {
    const p = leerPrendaSede(crudo({ precio: "79.90", piso: "3", dias_sin_vender: "12" }));
    expect(p?.precio).toBeCloseTo(79.9);
    expect(p?.piso).toBe(3);
    expect(p?.diasSinVender).toBe(12);
  });
});

describe("campos nulos", () => {
  const p = leerPrendaSede(
    crudo({
      color: null,
      color_hex: null,
      talla: null,
      categoria: null,
      categoria_prefijo: null,
      categoria_familia: null,
      foto_url: null,
      precio: null,
      costo: null,
      origen: null,
      proveedor_id: null,
      dias_sin_vender: null,
      piso: null,
      vendidas_30: undefined,
      semanas: null,
    }),
  );

  it("la prenda se lee igual: sin color se nombra sin él y sin talla es la única", () => {
    expect(p).not.toBeNull();
    expect(p?.color).toBe("");
    expect(p?.talla).toBe("Única");
  });

  it("lo que no se sabe queda en null (la miniatura dibuja la prenda sin foto con su categoría)", () => {
    expect(p?.colorHex).toBeNull();
    expect(p?.categoria).toBeNull();
    expect(p?.categoriaPrefijo).toBeNull();
    expect(p?.categoriaFamilia).toBeNull();
    expect(p?.fotoUrl).toBeNull();
    expect(p?.precio).toBeNull();
    expect(p?.costo).toBeNull();
    expect(p?.origen).toBeNull();
    expect(p?.proveedorId).toBeNull();
    expect(p?.diasSinVender).toBeNull();
  });

  it("las cantidades que faltan son 0 y las semanas, 8 en 0", () => {
    expect(p?.piso).toBe(0);
    expect(p?.vendidas30).toBe(0);
    expect(p?.semanas).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("un costo o un precio de 0 es «no se sabe», no un 0 que abarate lo quieto", () => {
    const q = leerPrendaSede(crudo({ costo: 0, precio: 0 }));
    expect(q?.costo).toBeNull();
    expect(q?.precio).toBeNull();
  });

  it("un origen que no se conoce o un color que no es un hex quedan en null", () => {
    const q = leerPrendaSede(crudo({ origen: "importado", color_hex: "celeste" }));
    expect(q?.origen).toBeNull();
    expect(q?.proveedorId).toBeNull();
    expect(q?.colorHex).toBeNull();
  });
});

describe("una fila rota se descarta", () => {
  it("sin prenda, sin modelo o sin nombre", () => {
    expect(leerPrendaSede(crudo({ variante_id: null }))).toBeNull();
    expect(leerPrendaSede(crudo({ producto_id: "" }))).toBeNull();
    expect(leerPrendaSede(crudo({ nombre: "   " }))).toBeNull();
    expect(leerPrendaSede(crudo({ variante_id: 42 }))).toBeNull();
  });

  it("lo que no es una fila", () => {
    expect(leerPrendaSede(null)).toBeNull();
    expect(leerPrendaSede("var-1")).toBeNull();
    expect(leerPrendaSede([crudo()])).toBeNull();
  });

  it("en la lista, las rotas salen y las buenas quedan, sin repetir una prenda", () => {
    const prendas = leerPrendasSede([crudo({ variante_id: "a" }), null, crudo({ variante_id: null }), crudo({ variante_id: "b" }), crudo({ variante_id: "a", piso: 99 })]);
    expect(prendas.map((p) => p.varianteId)).toEqual(["a", "b"]);
    expect(prendas[0]?.piso).toBe(2);
  });

  it("una lista que no es lista no trae prendas", () => {
    expect(leerPrendasSede(null)).toEqual([]);
    expect(leerPrendasSede({ prendas: [] })).toEqual([]);
  });
});

describe("las semanas son siempre 8", () => {
  it("si vinieron menos, faltan las más viejas: se rellenan con 0 al principio", () => {
    expect(leerSemanas([4, 5, 6])).toEqual([0, 0, 0, 0, 0, 4, 5, 6]);
    expect(leerSemanas([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("si vinieron más, quedan las 8 más recientes (las del final)", () => {
    expect(leerSemanas([9, 9, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("una semana que no es número vale 0 y una negativa, 0", () => {
    expect(leerSemanas([1, null, "x", -3, 2.6, 0, 1, 1])).toEqual([1, 0, 0, 0, 3, 0, 1, 1]);
  });

  it("lo que no es arreglo, 8 semanas en 0", () => {
    expect(leerSemanas("1,2,3")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(leerSemanas(undefined)).toHaveLength(SEMANAS_LEIDAS);
  });
});

describe("números negativos", () => {
  it("una cantidad negativa es 0", () => {
    const p = leerPrendaSede(crudo({ piso: -2, almacen: -1, vendidas_30: -5, llegaron_30: -4, vendidas_de_llegadas_30: -1, dias_sin_vender: -7 }));
    expect(p?.piso).toBe(0);
    expect(p?.almacen).toBe(0);
    expect(p?.vendidas30).toBe(0);
    expect(p?.llegaron30).toBe(0);
    expect(p?.vendidasDeLasQueLlegaron30).toBe(0);
    expect(p?.diasSinVender).toBe(0);
  });

  it("un precio o un costo negativo es «no se sabe»", () => {
    const p = leerPrendaSede(crudo({ precio: -10, costo: -1 }));
    expect(p?.precio).toBeNull();
    expect(p?.costo).toBeNull();
  });
});

describe("se vende lo que llega", () => {
  it("nunca se vendieron más de las que llegaron", () => {
    expect(leerPrendaSede(crudo({ llegaron_30: 3, vendidas_de_llegadas_30: 7 }))?.vendidasDeLasQueLlegaron30).toBe(3);
    expect(leerPrendaSede(crudo({ llegaron_30: 0, vendidas_de_llegadas_30: 2 }))?.vendidasDeLasQueLlegaron30).toBe(0);
  });
});

describe("la respuesta entera de una tienda", () => {
  const respuesta = { ubicacion_id: "sede-1", hoy: "2026-10-06", rebaja_de_100: 4, prendas: [crudo(), crudo({ variante_id: "var-2", nombre: null })] };

  it("trae la tienda, el día, la rebaja y las prendas que calzan", () => {
    const l = leerAnalisisSede(respuesta);
    expect(l?.ubicacionId).toBe("sede-1");
    expect(l?.hoy).toBe("2026-10-06");
    expect(l?.rebajaDe100).toBe(4);
    expect(l?.prendas.map((p) => p.varianteId)).toEqual(["var-1"]);
    expect(l?.sabePiso).toBe(true);
  });

  it("sabe el piso si las filas traen la clave, aunque sea null; sin la clave (la función de antes de 20261007120000), no lo sabe", () => {
    expect(leerAnalisisSede({ ...respuesta, prendas: [crudo({ salio_al_piso: null })] })?.sabePiso).toBe(true);
    const vieja = crudo();
    delete vieja.salio_al_piso;
    delete vieja.llego;
    const l = leerAnalisisSede({ ...respuesta, prendas: [vieja] });
    expect(l?.sabePiso).toBe(false);
    expect(l?.prendas[0]?.salioAlPiso).toBeNull();
    // Sin filas no hay nada que no se sepa.
    expect(leerAnalisisSede({ ...respuesta, prendas: [] })?.sabePiso).toBe(true);
  });

  it("sin ventas, la rebaja es null; fuera de 0 a 100, se recorta", () => {
    expect(leerAnalisisSede({ ...respuesta, rebaja_de_100: null })?.rebajaDe100).toBeNull();
    expect(leerAnalisisSede({ ...respuesta, rebaja_de_100: 140 })?.rebajaDe100).toBe(100);
    expect(leerAnalisisSede({ ...respuesta, rebaja_de_100: -3 })?.rebajaDe100).toBe(0);
  });

  it("una tienda sin prendas es una lista vacía, no una falla", () => {
    expect(leerAnalisisSede({ ...respuesta, prendas: [] })?.prendas).toEqual([]);
  });

  it("NULL (la cuenta no puede analizar) o una forma que no se entiende es «no se pudo leer»", () => {
    expect(leerAnalisisSede(null)).toBeNull();
    expect(leerAnalisisSede([])).toBeNull();
    expect(leerAnalisisSede({ ...respuesta, prendas: null })).toBeNull();
    expect(leerAnalisisSede({ ...respuesta, hoy: "6 de octubre" })).toBeNull();
    expect(leerAnalisisSede({ ...respuesta, ubicacion_id: "" })).toBeNull();
  });
});

describe("la frase de lo que no se pudo leer", () => {
  it("nombra cada tienda; sin fallas, nada", () => {
    expect(fraseFallaSedes([])).toBeNull();
    expect(fraseFallaSedes(["Tienda Lima"])).toBe("No se pudieron leer las prendas de Tienda Lima");
    expect(fraseFallaSedes(["Tienda Lima", "Tienda Trujillo"])).toBe("No se pudieron leer las prendas de Tienda Lima y Tienda Trujillo");
    expect(fraseFallaSedes(["Tienda Lima", "Tienda Trujillo", "una tienda"])).toBe("No se pudieron leer las prendas de Tienda Lima, Tienda Trujillo y una tienda");
  });
});
