import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { conPreciosMasBajos, esProducible, problemaDeBuenas, problemaDeEntrega, topeDeBuenas, conPreciosMasBajosDeModelos, costoUnitario, parsearLineasPrellenadas, precioParaMargen, semaforoMargen, urlLlevarATiendas, ETAPAS_MUESTRA, ETAPAS_PRODUCCION, LEYENDA_SEMAFORO, TEXTO_SEMAFORO } from "./produccion-reglas";

describe("semaforoMargen", () => {
  it("gana con 60% o más de margen", () => {
    expect(semaforoMargen(100, 40)?.tono).toBe("gana");
  });
  it("al filo entre 40% y 60%", () => {
    expect(semaforoMargen(100, 50)?.tono).toBe("filo");
  });
  it("pierde por debajo de 40%", () => {
    expect(semaforoMargen(100, 70)?.tono).toBe("pierde");
  });
  it("sin precio o sin costo no opina", () => {
    expect(semaforoMargen(0, 40)).toBeNull();
    expect(semaforoMargen(100, 0)).toBeNull();
  });
});

describe("las palabras del semáforo (/formidable 2026-10-10, cambio 3)", () => {
  it("«Pierde» no se usa: con un margen de 38 % POSITIVO decía que se perdía dinero; la palabra es «Margen bajo», la misma de Nuevo producto", () => {
    expect(semaforoMargen(85, 53)?.tono).toBe("pierde");
    expect(TEXTO_SEMAFORO).toEqual({ gana: "Gana", filo: "Al filo", pierde: "Margen bajo" });
    expect(LEYENDA_SEMAFORO.pierde).toBe("margen bajo < 40%");
    expect(LEYENDA_SEMAFORO.gana).toBe("gana ≥ 60%");
  });
  it("la hoja de Nueva orden, la tarjeta y el panel leen la MISMA palabra (una sola fuente) y ninguno escribe «Pierde» a mano", () => {
    const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
    for (const ruta of ["components/NuevaOrdenProduccionForm.tsx", "components/OrdenTarjeta.tsx", "components/OrdenPanel.tsx"]) {
      const fuente = leer(ruta);
      expect(fuente, ruta).not.toMatch(/"Pierde"/);
      expect(fuente, ruta).not.toMatch(/pierde &lt; 40%/);
      expect(fuente, ruta).toMatch(/TEXTO_SEMAFORO|LEYENDA_SEMAFORO/);
    }
  });
});

describe("el margen se mide con el precio más bajo de cualquier tienda (ADR-0370, Felipe 2026-10-11)", () => {
  const nombres = new Map([["tru", "Tienda Trujillo"], ["aqp", "Tienda Arequipa"]]);
  const precios = (porSede: Record<string, Record<string, number>>) => ({ porSede, nombres });
  const orden = (extra: Partial<{ precioVenta: number; varianteIdsDelModelo: string[] }> = {}) => ({ precioVenta: 79.9, varianteIdsDelModelo: ["v1", "v2"], ...extra });

  it("precioParaMargen: el de la tienda si hay uno más bajo; si no, el de la grilla", () => {
    expect(precioParaMargen({ precioVenta: 79.9 })).toBe(79.9);
    expect(precioParaMargen({ precioVenta: 79.9, precioMasBajo: null })).toBe(79.9);
    expect(precioParaMargen({ precioVenta: 79.9, precioMasBajo: { precio: 69.9, sede: "Trujillo" } })).toBe(69.9);
    // Un valor que no es un monto no vacía el margen: se vuelve a la grilla.
    expect(precioParaMargen({ precioVenta: 79.9, precioMasBajo: { precio: 0, sede: "X" } })).toBe(79.9);
  });

  it("el mismo costo da otro semáforo con el precio de la tienda más barata (esto es lo que Felipe quiere ver)", () => {
    // Costo 30: con 79.90 el margen es 62 % (gana); con 69.90 es 57 % (al filo).
    expect(semaforoMargen(79.9, 30)?.tono).toBe("gana");
    expect(semaforoMargen(precioParaMargen({ precioVenta: 79.9, precioMasBajo: { precio: 69.9, sede: "Trujillo" } }), 30)?.tono).toBe("filo");
  });

  it("conPreciosMasBajos: reparte el precio propio más bajo a cada orden, nombra la tienda y deja igual a la que no tiene", () => {
    const [a, b] = conPreciosMasBajos([orden(), orden({ varianteIdsDelModelo: ["otro"] })], precios({ tru: { v1: 69.9, v2: 69.9 } }));
    expect(a?.precioMasBajo).toEqual({ precio: 69.9, sede: "Trujillo" });
    expect(a?.precioVenta).toBe(79.9);
    expect(b).not.toHaveProperty("precioMasBajo");
  });

  it("conPreciosMasBajos no muta lo que recibe, y sin tiendas con precio propio no agrega nada", () => {
    const original = [orden()];
    const salida = conPreciosMasBajos(original, precios({}));
    expect(salida[0]).toEqual(original[0]);
    expect(salida[0]).not.toBe(original[0]);
    expect(original[0]).not.toHaveProperty("precioMasBajo");
  });

  it("conPreciosMasBajosDeModelos: el precio de venta del modelo es el mayor de sus tallas activas", () => {
    const modelo = { productoId: "p1", variantes: [{ varianteId: "v1", precio: 69.9 }, { varianteId: "v2", precio: 79.9 }] };
    // aqp vende v1 a 59.90 (< 69.90 de la grilla de v1 pero también < 79.90 máximo): es el más bajo.
    const [m] = conPreciosMasBajosDeModelos([modelo], precios({ aqp: { v1: 59.9 } }));
    expect(m?.precioMasBajo).toEqual({ precio: 59.9, sede: "Arequipa" });
    // Un propio por encima del máximo no baja nada.
    expect(conPreciosMasBajosDeModelos([modelo], precios({ aqp: { v1: 89.9 } }))[0]).not.toHaveProperty("precioMasBajo");
  });

  it("resumenTablero: el margen promedio usa el precio más bajo de cada orden", () => {
    const base = { estado: "en_proceso" as const, esMuestra: false, cantidadPlan: 10, fechaEntrega: null, precioVenta: 100, costoUnitario: 40 };
    expect(resumenTablero([base], "2026-10-11").margenPromedio).toBeCloseTo(0.6, 5);
    const conTienda = { ...base, precioMasBajo: { precio: 80, sede: "Trujillo" } };
    expect(resumenTablero([conTienda], "2026-10-11").margenPromedio).toBeCloseTo(0.5, 5);
    // Mezcla: el promedio es el de ambas.
    expect(resumenTablero([base, conTienda], "2026-10-11").margenPromedio).toBeCloseTo(0.55, 5);
  });

  it("nadie vuelve a medir el margen con el precio de la grilla a secas: todo `semaforoMargen(` de una pantalla pasa por `precioParaMargen`", () => {
    const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
    for (const ruta of ["components/NuevaOrdenProduccionForm.tsx", "components/OrdenTarjeta.tsx", "components/OrdenPanel.tsx", "lib/produccion-reglas.ts"]) {
      const llamadas = leer(ruta).match(/semaforoMargen\([^)]*\)\)?/g) ?? [];
      // La definición (`export function semaforoMargen(precioVenta: number, ...)`) no es una llamada.
      for (const l of llamadas.filter((x) => !x.includes("precioVenta: number"))) expect(l, `${ruta}: ${l}`).toMatch(/precioParaMargen/);
    }
  });
});

describe("costoUnitario", () => {
  it("reparte los tres costos entre las prendas, a 2 decimales como la base", () => {
    expect(costoUnitario(100, 20, 5, 3)).toBe(41.67);
  });
  it("la merma sube el unitario: menos buenas, mismo costo", () => {
    expect(costoUnitario(120, 0, 0, 12)).toBe(10);
    expect(costoUnitario(120, 0, 0, 10)).toBe(12);
  });
  it("sin prendas no divide por cero", () => {
    expect(costoUnitario(120, 0, 0, 0)).toBe(0);
  });
});

describe("etapas", () => {
  it("las claves son las que set_etapa_produccion acepta", () => {
    const claves = [...ETAPAS_MUESTRA, ...ETAPAS_PRODUCCION].map((e) => e.clave);
    expect(claves).toEqual(["patronaje", "muestra", "escalado", "corte", "confeccion", "acabado"]);
  });
});

import {
  DIAS_ENTREGA_PRONTO,
  claveCelda,
  datosDeVariante,
  desgloseCosto,
  estadoEntrega,
  etapaActual,
  etapasDe,
  matrizDeLineas,
  posicionEnMedidor,
  resumenTablero,
  segundas,
  terminadasDesde,
  totalBuenas,
} from "./produccion-reglas";

describe("etapaActual", () => {
  it("es la primera etapa sin marcar como hecha", () => {
    expect(etapaActual({}, false)).toBe("corte");
    expect(etapaActual({ corte: "hecho" }, false)).toBe("confeccion");
    expect(etapaActual({ corte: "hecho", confeccion: "hecho" }, false)).toBe("acabado");
  });
  it("una etapa tercerizada sigue en curso: la prenda no volvió", () => {
    expect(etapaActual({ corte: "hecho", confeccion: "tercerizado" }, false)).toBe("confeccion");
  });
  it("todas hechas: lista para cerrar", () => {
    expect(etapaActual({ corte: "hecho", confeccion: "hecho", acabado: "hecho" }, false)).toBe("listo");
  });
  it("una muestra recorre otras etapas", () => {
    expect(etapaActual({}, true)).toBe("patronaje");
    expect(etapaActual({ patronaje: "hecho", muestra: "hecho", escalado: "hecho" }, true)).toBe("listo");
    expect(etapasDe(true)).toBe(ETAPAS_MUESTRA);
    expect(etapasDe(false)).toBe(ETAPAS_PRODUCCION);
  });
});

describe("estadoEntrega", () => {
  const hoy = "2026-09-19";
  it("sin fecha no opina", () => {
    expect(estadoEntrega(null, hoy)).toEqual({ tipo: "sin_fecha" });
  });
  it("una fecha pasada está vencida, con los días que lleva", () => {
    expect(estadoEntrega("2026-09-18", hoy)).toEqual({ tipo: "vencida", dias: 1 });
    expect(estadoEntrega("2026-09-09", hoy)).toEqual({ tipo: "vencida", dias: 10 });
  });
  it(`hoy y hasta ${DIAS_ENTREGA_PRONTO} días antes avisa «pronto»`, () => {
    expect(estadoEntrega("2026-09-19", hoy)).toEqual({ tipo: "pronto", dias: 0 });
    expect(estadoEntrega("2026-09-21", hoy)).toEqual({ tipo: "pronto", dias: 2 });
  });
  it("más allá es holgada", () => {
    expect(estadoEntrega("2026-09-22", hoy)).toEqual({ tipo: "holgada", dias: 3 });
  });
});

describe("matrizDeLineas", () => {
  const lin = (color: string | null, talla: string | null, plan: number, buenas: number | null = null) => ({
    varianteId: `${color}-${talla}`,
    color,
    colorHex: color === "Negro" ? "#111" : null,
    talla,
    cantidadPlan: plan,
    cantidadBuenas: buenas,
  });
  const m = matrizDeLineas([lin("Crudo", "L", 8), lin("Crudo", "S", 6), lin("Crudo", "M", 10), lin("Negro", "S", 4), lin("Negro", "M", 8)]);

  it("ordena las tallas en su orden canónico, no en el que llegaron", () => {
    expect(m.tallas).toEqual(["S", "M", "L"]);
  });
  it("conserva los colores en el orden en que aparecen, con su tono", () => {
    expect(m.colores).toEqual([
      { nombre: "Crudo", hex: null },
      { nombre: "Negro", hex: "#111" },
    ]);
  });
  it("suma por talla, por color y el total", () => {
    expect(m.totalPorTalla).toEqual({ S: 10, M: 18, L: 8 });
    expect(m.totalPorColor).toEqual({ Crudo: 24, Negro: 12 });
    expect(m.total).toBe(36);
  });
  it("una combinación que no está en la orden no tiene celda", () => {
    expect(m.celdas[claveCelda("Negro", "L")]).toBeUndefined();
    expect(m.celdas[claveCelda("Crudo", "M")]).toMatchObject({ plan: 10, buenas: null });
  });
  it("sin color o sin talla igual se dibuja", () => {
    const u = matrizDeLineas([lin(null, null, 5)]);
    expect(u.colores[0].nombre).toBe("Sin color");
    expect(u.tallas).toEqual(["Única"]);
  });
});

describe("datosDeVariante: cómo se nombra una prenda de la orden", () => {
  const talla = { valor: "L" };
  const color = { nombre: "Violeta", hex: "#7a5" };

  it("una variante sin sku y con código (el caso de casi todo el catálogo) muestra el código de la etiqueta", () => {
    const d = datosDeVariante({ sku: null, codigo: "POL-0004-VIO-L", talla, color });
    expect(d.sku).toBe("POL-0004-VIO-L");
    expect(d).toMatchObject({ talla: "L", color: "Violeta", colorHex: "#7a5" });
  });
  it("una variante vieja con sku y sin código cae al sku", () => {
    expect(datosDeVariante({ sku: "VES-SOFI-NEG-M", codigo: null }).sku).toBe("VES-SOFI-NEG-M");
  });
  it("si trae los dos, manda el código de la etiqueta", () => {
    expect(datosDeVariante({ sku: "VES-SOFI-NEG-M", codigo: "VES-0002-NEG-M" }).sku).toBe("VES-0002-NEG-M");
  });
  it("sin código ni sku queda vacío, no un aviso: el texto se usa en tooltips y búsquedas", () => {
    expect(datosDeVariante({ sku: null, codigo: null }).sku).toBe("");
  });
  it("una variante que no llegó no rompe la orden: todo vacío", () => {
    expect(datosDeVariante(null)).toEqual({ sku: "", talla: null, color: null, colorHex: null, colorCodigo: null });
    expect(datosDeVariante(undefined).sku).toBe("");
  });
  it("sin talla o sin color deja null, para que la matriz pinte «Única» / «Sin color»", () => {
    expect(datosDeVariante({ codigo: "X-1", talla: null, color: null })).toEqual({ sku: "X-1", talla: null, color: null, colorHex: null, colorCodigo: null });
  });
});

describe("cierre: buenas y segundas", () => {
  it("suma las buenas ignorando vacíos, negativos y decimales", () => {
    expect(totalBuenas({ a: 6, b: "10", c: "", d: -3, e: "4.9" })).toBe(20);
  });
  it("las segundas nunca son negativas", () => {
    expect(segundas(48, 46)).toBe(2);
    expect(segundas(48, 50)).toBe(0);
  });
});

describe("desgloseCosto", () => {
  it("reparte los tres costos como partes de un todo", () => {
    const d = desgloseCosto(700, 100, 200);
    expect(d.total).toBe(1000);
    expect(d.partes.map((p) => [p.clave, p.parte])).toEqual([
      ["tela", 0.7],
      ["avios", 0.1],
      ["maquila", 0.2],
    ]);
  });
  it("con costo cero no hay partes que dibujar", () => {
    expect(desgloseCosto(0, 0, 0).partes.every((p) => p.parte === 0)).toBe(true);
  });
  it("el medidor recorta el margen a 0–1", () => {
    expect(posicionEnMedidor(-0.2)).toBe(0);
    expect(posicionEnMedidor(0.83)).toBe(0.83);
    expect(posicionEnMedidor(1.4)).toBe(1);
  });
});

describe("resumenTablero", () => {
  const base = { estado: "en_proceso" as const, esMuestra: false, cantidadPlan: 10, fechaEntrega: null, precioVenta: 100, costoUnitario: 30 };
  const hoy = "2026-09-19";
  it("cuenta solo órdenes de producción abiertas: ni muestras, ni terminadas, ni anuladas", () => {
    const r = resumenTablero(
      [base, { ...base, esMuestra: true }, { ...base, estado: "terminada" }, { ...base, estado: "anulada" }, { ...base, cantidadPlan: 5 }],
      hoy
    );
    expect(r.enCurso).toBe(2);
    expect(r.prendas).toBe(15);
  });
  it("separa las entregas vencidas de las que vencen pronto", () => {
    const r = resumenTablero([{ ...base, fechaEntrega: "2026-09-10" }, { ...base, fechaEntrega: "2026-09-20" }, { ...base, fechaEntrega: "2026-10-30" }], hoy);
    expect(r.vencidas).toBe(1);
    expect(r.pronto).toBe(1);
  });
  it("el margen promedio ignora las órdenes sin precio o sin costo", () => {
    const r = resumenTablero([base, { ...base, precioVenta: 0 }, { ...base, costoUnitario: 0 }, { ...base, costoUnitario: 50 }], hoy);
    expect(r.margenPromedio).toBeCloseTo((0.7 + 0.5) / 2, 5);
  });
  it("sin nada con qué comparar, el margen es null", () => {
    expect(resumenTablero([], hoy).margenPromedio).toBeNull();
  });
});

describe("terminadasDesde: las prendas que entraron al stock, por día de Lima", () => {
  // Ejemplo inventado. `inventariadoEn` como lo manda la base: timestamptz en UTC (2026-10-14 01:00 UTC = 13 de octubre, 20:00 en Lima).
  const orden = (inventariadoEn: string | null, cantidadBuenas: number | null) => ({ inventariadoEn, cantidadBuenas });

  it("lo que entró a las 20:00 del 13 en Lima es del 13: no suma en «hoy» del 14", () => {
    const ordenes = [orden("2026-10-14T01:00:00.123456+00:00", 12), orden("2026-10-14T15:00:00+00:00", 5)];
    expect(terminadasDesde(ordenes, "2026-10-14")).toBe(5); // con el corte de UTC daba 17
    expect(terminadasDesde(ordenes, "2026-10-13")).toBe(17);
  });

  it("el borde de la ventana es la medianoche de Lima", () => {
    expect(terminadasDesde([orden("2026-10-08T04:59:00+00:00", 3)], "2026-10-08")).toBe(0); // 23:59 del 7 en Lima
    expect(terminadasDesde([orden("2026-10-08T05:00:00+00:00", 3)], "2026-10-08")).toBe(3); // 00:00 del 8 en Lima
  });

  it("una orden que no entró al stock, o sin buenas anotadas, no suma", () => {
    expect(terminadasDesde([orden(null, 4), orden("2026-10-14T15:00:00+00:00", null)], "2026-10-01")).toBe(0);
  });
});

describe("llevar las prendas a las tiendas (F8)", () => {
  it("arma el enlace a Mover con el Taller de origen y solo las líneas con prendas buenas", () => {
    expect(
      urlLlevarATiendas("taller-1", [
        { varianteId: "v1", cantidadBuenas: 12 },
        { varianteId: "v2", cantidadBuenas: 0 },
        { varianteId: "v3", cantidadBuenas: null },
        { varianteId: "v4", cantidadBuenas: 8 },
      ])
    ).toBe("/inventario/mover?origen=taller-1&lineas=v1:12,v4:8");
  });
  it("sin prendas buenas no hay nada que llevar", () => {
    expect(urlLlevarATiendas("t", [{ varianteId: "v1", cantidadBuenas: 0 }])).toBeNull();
    expect(urlLlevarATiendas("t", [])).toBeNull();
  });
  it("ida y vuelta: lo que se arma se lee igual", () => {
    const url = urlLlevarATiendas("t", [{ varianteId: "a-1", cantidadBuenas: 5 }, { varianteId: "b-2", cantidadBuenas: 7 }])!;
    expect(parsearLineasPrellenadas(new URL(url, "http://x").searchParams.get("lineas") ?? "")).toEqual([{ varianteId: "a-1", cantidad: 5 }, { varianteId: "b-2", cantidad: 7 }]);
  });
  it("un parámetro roto se ignora: sin cantidad, con decimales, negativa, vacío o repetido (se suma)", () => {
    expect(parsearLineasPrellenadas(undefined)).toEqual([]);
    expect(parsearLineasPrellenadas("")).toEqual([]);
    expect(parsearLineasPrellenadas("v1,v2:0,v3:-4,v4:2.5,:9,v5:x")).toEqual([]);
    expect(parsearLineasPrellenadas("v1:3,v1:4,v2:1")).toEqual([{ varianteId: "v1", cantidad: 7 }, { varianteId: "v2", cantidad: 1 }]);
  });
});

describe("esProducible (Resumen de Producción: qué se le ofrece a la líder para fabricar)", () => {
  const sano = { estado: "activo", estado_alta: "aprobado", es_prueba: false, categoria_id: "blusas" };
  const apagadas = new Set(["bolsas"]);

  it("un modelo activo, aprobado, real y de una familia que entra a los motores se ofrece", () => {
    expect(esProducible(sano, apagadas)).toBe(true);
  });
  it("un descontinuado no se produce (ADR-0270)", () => {
    expect(esProducible({ ...sano, estado: "descontinuado" }, apagadas)).toBe(false);
  });
  it("un alta pendiente de aprobación o rechazada todavía no es mercadería", () => {
    expect(esProducible({ ...sano, estado_alta: "pendiente" }, apagadas)).toBe(false);
    expect(esProducible({ ...sano, estado_alta: "rechazado" }, apagadas)).toBe(false);
  });
  it("un producto de prueba no se ofrece", () => {
    expect(esProducible({ ...sano, es_prueba: true }, apagadas)).toBe(false);
  });
  it("una bolsa (familia fuera de los motores, ADR-0377) no se ofrece, y una categoría hermana sí", () => {
    expect(esProducible({ ...sano, categoria_id: "bolsas" }, apagadas)).toBe(false);
    expect(esProducible({ ...sano, categoria_id: "polos" }, apagadas)).toBe(true);
  });
  it("lo que no se sabe sigue contando: sin categoría, o sin ninguna familia apagada leída, se ofrece", () => {
    expect(esProducible({ ...sano, categoria_id: null }, apagadas)).toBe(true);
    expect(esProducible({ ...sano, categoria_id: "bolsas" }, new Set())).toBe(true);
  });
  it("cualquiera de los motivos basta: un descontinuado de prueba y de bolsas sigue fuera", () => {
    expect(esProducible({ estado: "descontinuado", estado_alta: "pendiente", es_prueba: true, categoria_id: "bolsas" }, apagadas)).toBe(false);
  });
});

// ADR-0415 (recomendaciones de /chaos): hasta el doble de lo pedido por talla, y una entrega que no es anterior a hoy.
describe("las buenas de una talla tienen techo", () => {
  it("el doble de lo pedido, o 5 más si la talla es chica", () => {
    expect([topeDeBuenas(6), topeDeBuenas(10), topeDeBuenas(1), topeDeBuenas(0)]).toEqual([12, 20, 6, 5]);
  });
  it("dice la primera talla que se pasa; si todas caben, nada", () => {
    const lineas = [{ varianteId: "a", cantidadPlan: 6 }, { varianteId: "b", cantidadPlan: 1 }];
    expect(problemaDeBuenas(lineas, { a: 12, b: 6 })).toBeNull();
    expect(problemaDeBuenas(lineas, { a: "9", b: "2" })).toBeNull();
    expect(problemaDeBuenas(lineas, { a: 60, b: 1 })).toMatch(/se pidieron 6 y anotaste 60 buenas.*hasta 12/);
    expect(problemaDeBuenas(lineas, { a: 6, b: 7 })).toMatch(/se pidieron 1 y anotaste 7/);
  });
});

describe("la entrega no es anterior a hoy", () => {
  it("ayer o 1990 no; hoy, más adelante o en blanco sí", () => {
    const hoy = "2026-10-15";
    expect(problemaDeEntrega("1990-01-01", hoy)).toMatch(/no puede ser antes de hoy/);
    expect(problemaDeEntrega("2026-10-14", hoy)).not.toBeNull();
    for (const f of ["2026-10-15", "2026-11-01", ""]) expect(problemaDeEntrega(f, hoy)).toBeNull();
  });
});
