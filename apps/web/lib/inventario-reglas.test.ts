import { describe, it, expect } from "vitest";
import { paginarSinPartirGrupos } from "./paginacion";
import {
  clavePercha,
  fotoPrincipal,
  ordenarPorModeloColorTalla,
  porColgar,
  resumirPorColgar,
  sumarCantidades,
  quedaraPidiendoReponer,
  RETIRO_NO_ES_BAJA,
  UMBRAL_REPOSICION_PISO,
  UMBRAL_STOCK_BAJO_ALMACEN,
} from "./inventario-reglas";
import { calcularAccionHoy } from "./existencias-recomendaciones";
import { politicaDe } from "./politica-operativa-inventario";

// Política de referencia para las pruebas cruzadas «Por colgar» ↔ «Acción hoy» de abajo — misma
// fuente que consume la app real (`politicaDe`), nunca un literal propio.
const POLITICA_REF = politicaDe("test");

// La miniatura de una prenda: Existencias y Conteo tienen que elegir LA MISMA foto
// para la misma prenda, así que la regla vive en un solo lugar y se prueba acá.
describe("fotoPrincipal", () => {
  it("sin fotos no hay miniatura (la fila dibuja el perchero, nunca un roto)", () => {
    expect(fotoPrincipal(undefined)).toBeNull();
    expect(fotoPrincipal(null)).toBeNull();
    expect(fotoPrincipal([])).toBeNull();
  });

  it("gana la marcada como principal, aunque no sea la primera ni la de menor orden", () => {
    expect(
      fotoPrincipal([
        { url: "a.jpg", orden: 0, es_principal: false },
        { url: "b.jpg", orden: 5, es_principal: true },
      ])
    ).toBe("b.jpg");
  });

  it("si ninguna está marcada, gana la de menor orden — sin importar cómo llegaron", () => {
    expect(
      fotoPrincipal([
        { url: "tercera.jpg", orden: 3, es_principal: false },
        { url: "primera.jpg", orden: 1, es_principal: false },
        { url: "segunda.jpg", orden: 2, es_principal: false },
      ])
    ).toBe("primera.jpg");
  });

  it("no reordena el arreglo que recibe", () => {
    const fotos = [
      { url: "b.jpg", orden: 2, es_principal: false },
      { url: "a.jpg", orden: 1, es_principal: false },
    ];
    fotoPrincipal(fotos);
    expect(fotos.map((f) => f.url)).toEqual(["b.jpg", "a.jpg"]);
  });
});

// `EstadoStock`/`calcularEstado`/`necesitaReponerPiso` se retiraron el 2026-09-25 (ver la nota en
// `inventario-reglas.ts`): Existencias decide todo con el motor único de «Acción hoy»
// (`existencias-recomendaciones.test.ts`), no con un semáforo aparte. `UMBRAL_REPOSICION_PISO`
// SIGUE existiendo — es de Análisis (`resumen-reglas.ts`), no de Existencias.

describe("sumarCantidades (la regla que comparten Existencias y la caja)", () => {
  const fila = (variante_id: string, tipo: string | null, cantidad: number, cantidad_apartada = 0) => ({
    variante_id, cantidad, cantidad_apartada, sububicacion: tipo === null ? null : { tipo },
  });

  it("en una tienda suma piso y almacén, descuenta lo apartado y deja la cuarentena fuera del total", () => {
    const c = sumarCantidades([fila("v1", "piso_venta", 5, 2), fila("v1", "almacen_tienda", 10, 1), fila("v1", "cuarentena", 3)]).get("v1")!;
    expect(c).toMatchObject({ total: 15, piso: 5, almacen: 10, danado: 3, apartado: 3, disponible: 12, pisoDisponible: 3, almacenDisponible: 9 });
  });

  it("donde no se separa piso/almacén (Taller) piso, almacén y dañado quedan null", () => {
    const c = sumarCantidades([fila("v1", null, 4, 1)]).get("v1")!;
    expect(c).toMatchObject({ total: 4, disponible: 3, piso: null, almacen: null, danado: null, pisoDisponible: null });
  });
});

// «Por colgar» (Frescura del piso, 2026-09-25): talla con algo DISPONIBLE en el almacén y NADA
// disponible en el piso — la clienta no la ve. Las cantidades se arman con `sumarCantidades`, la misma
// regla que usa Existencias, para que el reparto de lo apartado entre piso y almacén sea el real y no
// uno inventado en la prueba.
describe("porColgar", () => {
  const fila = (variante_id: string, tipo: string | null, cantidad: number, cantidad_apartada = 0) => ({
    variante_id, cantidad, cantidad_apartada, sububicacion: tipo === null ? null : { tipo },
  });
  const cantidadesDe = (...filas: ReturnType<typeof fila>[]) => sumarCantidades(filas).get("v1")!;

  it("solo en el almacén, nada colgado: sí — tenga o no una fila de piso en 0", () => {
    expect(porColgar(cantidadesDe(fila("v1", "almacen_tienda", 3)))).toBe(true);
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 3)))).toBe(true);
  });

  it("nada en el piso ni en el almacén: no — no hay qué colgar (es «Sin stock», otra pregunta)", () => {
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 0)))).toBe(false);
  });

  // El mínimo es 1 colgada por talla y color (Felipe, 2026-10-04): una sola colgada ya cumple, aunque el almacén esté lleno.
  // Hasta ese día la regla física era «piso ≤ 4» y esta talla pedía «Reponer a piso».
  it("con algo colgado: no es «Por colgar» ni pide reponer — una sola colgada cumple el mínimo, aunque el almacén esté lleno", () => {
    const c = cantidadesDe(fila("v1", "piso_venta", 1), fila("v1", "almacen_tienda", 20));
    expect(porColgar(c)).toBe(false);
    const accion = calcularAccionHoy({ varianteId: "v1", pisoDisponible: c.pisoDisponible, almacenDisponible: c.almacenDisponible, enTransito: 0 }, POLITICA_REF);
    expect(accion.tipo).toBe("sin_accion");
  });

  it("piso > 0 nunca es «Por colgar», sea cual sea la cantidad — la pregunta es «¿hay algo?», no «¿cuánto?»", () => {
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", UMBRAL_REPOSICION_PISO), fila("v1", "almacen_tienda", 5)))).toBe(false);
  });

  it("lo colgado pero apartado para una clienta no cuenta como colgado: sí está por colgar", () => {
    // 2 en el piso, las 2 apartadas: la clienta que entra no tiene ninguna que comprar.
    const c = cantidadesDe(fila("v1", "piso_venta", 2, 2), fila("v1", "almacen_tienda", 3));
    expect(c).toMatchObject({ pisoDisponible: 0, almacenDisponible: 3 });
    expect(porColgar(c)).toBe(true);
  });

  it("si queda una colgada sin apartar, no", () => {
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", 2, 1), fila("v1", "almacen_tienda", 3)))).toBe(false);
  });

  it("lo del almacén todo apartado: no — no hay nada que se pueda bajar", () => {
    const c = cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 3, 3));
    expect(c).toMatchObject({ pisoDisponible: 0, almacenDisponible: 0 });
    expect(porColgar(c)).toBe(false);
  });

  it("donde la sede no separa piso de almacén (Taller): nunca", () => {
    const c = cantidadesDe(fila("v1", null, 4));
    expect(c.pisoDisponible).toBeNull();
    expect(porColgar(c)).toBe(false);
  });

  it("toda talla por colgar tiene Acción hoy = «Reponer a piso» (piso 0 siempre cae bajo el umbral físico)", () => {
    for (const almacen of [1, 3, UMBRAL_STOCK_BAJO_ALMACEN, 50]) {
      const c = cantidadesDe(fila("v1", "almacen_tienda", almacen));
      expect(porColgar(c)).toBe(true);
      const accion = calcularAccionHoy({ varianteId: "v1", pisoDisponible: c.pisoDisponible, almacenDisponible: c.almacenDisponible, enTransito: 0 }, POLITICA_REF);
      expect(accion.tipo).toBe("reponer_a_piso");
    }
  });
});

describe("resumirPorColgar (el contador del filtro)", () => {
  it("cuenta tallas y suma lo que se puede bajar del almacén, neto de apartados", () => {
    const c = sumarCantidades([
      { variante_id: "a", cantidad: 5, cantidad_apartada: 1, sububicacion: { tipo: "almacen_tienda" } }, // por colgar: 4 que bajar
      { variante_id: "b", cantidad: 2, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } }, // por colgar: 2
      { variante_id: "c", cantidad: 1, cantidad_apartada: 0, sububicacion: { tipo: "piso_venta" } }, // colgada: no
      { variante_id: "c", cantidad: 9, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } },
      { variante_id: "d", cantidad: 0, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } }, // nada: no
    ]);
    expect(resumirPorColgar([...c.values()])).toEqual({ tallas: 2, unidades: 6 });
  });

  it("sin nada por colgar (o en Taller) da cero, no NaN", () => {
    expect(resumirPorColgar([])).toEqual({ tallas: 0, unidades: 0 });
    expect(resumirPorColgar([{ pisoDisponible: null, almacenDisponible: null }])).toEqual({ tallas: 0, unidades: 0 });
  });
});

describe("ordenarPorModeloColorTalla (la lista «Por colgar» se lee por percha)", () => {
  const p = (referencia: string, productoId: string, color: string | null, talla: string | null) => ({ referencia, productoId, color, talla });

  it("las tallas de un mismo modelo y color salen juntas y en su curva", () => {
    const filas = [
      p("Casaca Ximena", "x", "Negro", "L"),
      p("Blusa Lino", "b", "Crudo", "M"),
      p("Casaca Ximena", "x", "Camel", "S"),
      p("Casaca Ximena", "x", "Negro", "S"),
      p("Casaca Ximena", "x", "Negro", "M"),
    ];
    expect(ordenarPorModeloColorTalla(filas).map((f) => `${f.referencia} ${f.color} ${f.talla}`)).toEqual([
      "Blusa Lino Crudo M",
      "Casaca Ximena Camel S",
      "Casaca Ximena Negro S",
      "Casaca Ximena Negro M",
      "Casaca Ximena Negro L",
    ]);
  });

  it("la numeración va en su curva, no en orden alfabético (6 · 8 · 10, no 10 · 6 · 8)", () => {
    const filas = [p("Pantalón Dana", "d", "Azul", "10"), p("Pantalón Dana", "d", "Azul", "6"), p("Pantalón Dana", "d", "Azul", "8")];
    expect(ordenarPorModeloColorTalla(filas).map((f) => f.talla)).toEqual(["6", "8", "10"]);
  });

  it("dos modelos con el mismo nombre no intercalan sus tallas", () => {
    const filas = [p("Top Rita", "2", "Negro", "S"), p("Top Rita", "1", "Negro", "M"), p("Top Rita", "2", "Negro", "M"), p("Top Rita", "1", "Negro", "S")];
    expect(ordenarPorModeloColorTalla(filas).map((f) => `${f.productoId}${f.talla}`)).toEqual(["1S", "1M", "2S", "2M"]);
  });

  it("lo que no tiene color o talla va al final de su grupo, sin perderse", () => {
    const filas = [p("Falda Ana", "a", null, "S"), p("Falda Ana", "a", "Rojo", null), p("Falda Ana", "a", "Rojo", "S")];
    expect(ordenarPorModeloColorTalla(filas).map((f) => `${f.color}/${f.talla}`)).toEqual(["Rojo/S", "Rojo/null", "null/S"]);
  });

  it("no reordena el arreglo que recibe", () => {
    const filas = [p("Z", "z", "Negro", "M"), p("A", "a", "Negro", "S")];
    ordenarPorModeloColorTalla(filas);
    expect(filas.map((f) => f.referencia)).toEqual(["Z", "A"]);
  });

  it("con la paginación de la pantalla (15 por página), una percha nunca queda partida entre dos páginas", () => {
    // 13 tallas sueltas de modelos distintos y la Casaca Ximena Negro S·M·L, que con `paginar` a secas
    // caería en las filas 14, 15 | 16: la L en otra página.
    const sueltas = Array.from({ length: 13 }, (_, i) => p(`Blusa ${String(i).padStart(2, "0")}`, `b${i}`, "Crudo", "M"));
    const filas = ordenarPorModeloColorTalla([...sueltas, p("Casaca Ximena", "x", "Negro", "L"), p("Casaca Ximena", "x", "Negro", "S"), p("Casaca Ximena", "x", "Negro", "M")]);
    const p1 = paginarSinPartirGrupos(filas, 1, 15, clavePercha);
    expect(p1.filas.filter((f) => f.productoId === "x").map((f) => f.talla)).toEqual(["S", "M", "L"]);
    expect(p1.totalPaginas).toBe(1);
  });

  it("clavePercha separa colores y modelos homónimos, y no confunde «sin color» con un color", () => {
    expect(clavePercha({ productoId: "x", color: "Negro" })).toBe(clavePercha({ productoId: "x", color: "Negro" }));
    expect(clavePercha({ productoId: "x", color: "Negro" })).not.toBe(clavePercha({ productoId: "x", color: "Camel" }));
    expect(clavePercha({ productoId: "x", color: "Negro" })).not.toBe(clavePercha({ productoId: "y", color: "Negro" }));
    expect(clavePercha({ productoId: "x", color: null })).not.toBe(clavePercha({ productoId: "x", color: "null" }));
  });
});

// «Acción hoy» no sabe que una talla se guardó a propósito: después de subirla al almacén vuelve a pedir bajarla.
// La ventana de «Subir a almacén» lo avisa antes de confirmar (revisión del bloque 2 de ADR-0208, 2026-09-25). Pregunta con la
// MISMA regla que pinta la fila (`calcularAccionHoy` y la política de la sede): el aviso no puede prometer otra cosa.
describe("quedaraPidiendoReponer", () => {
  const umbral = POLITICA_REF.umbralStockPisoReposicion;
  it("subir todo lo colgado con reserva en el almacén: la talla saldrá «Por colgar»", () => {
    expect(quedaraPidiendoReponer({ piso: 3, almacen: 0 }, 3, POLITICA_REF)).toBe(true);
  });
  it("dejar en el piso el umbral o menos: Existencias sugerirá «Reponer»", () => {
    expect(quedaraPidiendoReponer({ piso: 10, almacen: 0 }, 10 - umbral, POLITICA_REF)).toBe(true);
  });
  it("dejar una más que el umbral ya no avisa: la fila no va a pedir nada (con el semáforo viejo, 7 o menos, sí avisaba)", () => {
    expect(quedaraPidiendoReponer({ piso: 10, almacen: 0 }, 10 - (umbral + 1), POLITICA_REF)).toBe(false);
    expect(calcularAccionHoy({ varianteId: "v1", pisoDisponible: umbral + 1, almacenDisponible: 10 - (umbral + 1), enTransito: 0 }, POLITICA_REF).tipo).toBe("sin_accion");
  });
  it("con apartadas colgadas cuenta solo lo libre (la misma regla que arma la fila de Existencias)", () => {
    // Piso físico 5, 2 apartadas para clientas, almacén 0: libres 3. Subir las 3 deja 0 libres → «Por colgar».
    const c = sumarCantidades([{ variante_id: "v1", cantidad: 5, cantidad_apartada: 2, sububicacion: { tipo: "piso_venta" } }]).get("v1")!;
    expect(c.pisoDisponible).toBe(3);
    const disponible = { piso: c.pisoDisponible, almacen: c.almacenDisponible };
    expect(quedaraPidiendoReponer(disponible, 3, POLITICA_REF)).toBe(true);
    // Pedir más de lo libre no es un caso de este aviso: de eso se encargan los otros mensajes.
    expect(quedaraPidiendoReponer(disponible, 4, POLITICA_REF)).toBe(false);
  });
  it("el recordatorio del retiro no promete que lo del almacén se pueda vender: la caja solo cobra lo del piso", () => {
    expect(RETIRO_NO_ES_BAJA).not.toMatch(/disponibles? para vender/);
    expect(RETIRO_NO_ES_BAJA).toContain("la caja no las cobra hasta que vuelvan al piso");
  });
  it("si después de subir la fila no pide nada, no hay aviso", () => {
    expect(quedaraPidiendoReponer({ piso: 30, almacen: 0 }, 2, POLITICA_REF)).toBe(false);
  });
  it("cantidad vacía, cero, no entera o mayor que el piso: no avisa (eso lo dicen los otros mensajes)", () => {
    expect(quedaraPidiendoReponer({ piso: 3, almacen: 0 }, 0, POLITICA_REF)).toBe(false);
    expect(quedaraPidiendoReponer({ piso: 3, almacen: 0 }, 1.5, POLITICA_REF)).toBe(false);
    expect(quedaraPidiendoReponer({ piso: 3, almacen: 0 }, 4, POLITICA_REF)).toBe(false);
  });
  it("una sede que no separa piso y almacén (Taller): nunca", () => {
    expect(quedaraPidiendoReponer({ piso: null, almacen: null }, 1, POLITICA_REF)).toBe(false);
  });
});
