import { describe, it, expect } from "vitest";
import { paginarSinPartirGrupos } from "./paginacion";
import {
  clavePercha,
  fotoPrincipal,
  ordenarPorModeloColorTalla,
  sumarCantidades,
  RETIRO_NO_ES_BAJA,
} from "./inventario-reglas";
import { decidirTalla, MINIMO_TALLA_CENTRAL, quedaraPidiendoColgar } from "./piso-plan";

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

// «Por colgar» se decide con lo DISPONIBLE (neto de apartados), no con lo físico: si las dos colgadas están apartadas para una
// clienta, en el piso no queda nada que vender. Las cantidades se arman con `sumarCantidades` —la misma regla que usa
// Existencias— y la decisión con el motor del piso (`decidirTalla`, `lib/piso-plan.ts`) para una talla central (mínimo 1).
describe("lo disponible que llega al motor del piso (sumarCantidades → decidirTalla)", () => {
  const fila = (variante_id: string, tipo: string | null, cantidad: number, cantidad_apartada = 0) => ({
    variante_id, cantidad, cantidad_apartada, sububicacion: tipo === null ? null : { tipo },
  });
  const cantidadesDe = (...filas: ReturnType<typeof fila>[]) => sumarCantidades(filas).get("v1")!;
  const central = (c: ReturnType<typeof cantidadesDe>) => decidirTalla(c.pisoDisponible!, c.almacenDisponible!, MINIMO_TALLA_CENTRAL, false);

  it("solo en el almacén, nada colgado: por colgar — tenga o no una fila de piso en 0", () => {
    expect(central(cantidadesDe(fila("v1", "almacen_tienda", 3)))).toBe("por_colgar");
    expect(central(cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 3)))).toBe("por_colgar");
  });
  it("nada en el piso ni en el almacén: sin stock atrás — no hay qué colgar", () => {
    expect(central(cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 0)))).toBe("sin_atras");
  });
  it("lo colgado pero apartado para una clienta no cuenta como colgado: sí está por colgar", () => {
    const c = cantidadesDe(fila("v1", "piso_venta", 2, 2), fila("v1", "almacen_tienda", 3));
    expect(c).toMatchObject({ pisoDisponible: 0, almacenDisponible: 3 });
    expect(central(c)).toBe("por_colgar");
  });
  it("si queda una colgada sin apartar, el mínimo está cubierto", () => {
    expect(central(cantidadesDe(fila("v1", "piso_venta", 2, 1), fila("v1", "almacen_tienda", 3)))).toBe("mantener");
  });
  it("lo del almacén todo apartado: no hay nada que se pueda bajar", () => {
    const c = cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 3, 3));
    expect(c).toMatchObject({ pisoDisponible: 0, almacenDisponible: 0 });
    expect(central(c)).toBe("sin_atras");
  });
  it("donde la sede no separa piso de almacén (Taller) no hay cifras de piso que decidir", () => {
    expect(cantidadesDe(fila("v1", null, 4)).pisoDisponible).toBeNull();
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

// El motor no sabe que una talla se guardó a propósito: después de subirla al almacén vuelve a pedir bajarla. La ventana de
// «Subir a almacén» lo avisa antes de confirmar (bloque 2 de ADR-0208) con la MISMA regla que pinta la fila (`decidirTalla` y el
// requisito de la talla): el aviso no puede prometer otra cosa.
describe("quedaraPidiendoColgar", () => {
  it("subir todo lo colgado de una talla central con reserva en el almacén: la talla saldrá «Por colgar»", () => {
    expect(quedaraPidiendoColgar({ piso: 3, almacen: 0 }, 3, 1)).toBe(true);
  });
  it("dejar en el piso menos de lo que pide la talla: Existencias pedirá reponer", () => {
    expect(quedaraPidiendoColgar({ piso: 10, almacen: 0 }, 9, 2)).toBe(true);
  });
  it("dejar lo que pide la talla ya no avisa", () => {
    expect(quedaraPidiendoColgar({ piso: 10, almacen: 0 }, 8, 2)).toBe(false);
  });
  it("con apartadas colgadas cuenta solo lo libre (la misma regla que arma la fila de Existencias)", () => {
    // Piso físico 5, 2 apartadas para clientas, almacén 0: libres 3. Subir las 3 deja 0 libres → «Por colgar».
    const c = sumarCantidades([{ variante_id: "v1", cantidad: 5, cantidad_apartada: 2, sububicacion: { tipo: "piso_venta" } }]).get("v1")!;
    expect(c.pisoDisponible).toBe(3);
    const disponible = { piso: c.pisoDisponible!, almacen: c.almacenDisponible! };
    expect(quedaraPidiendoColgar(disponible, 3, 1)).toBe(true);
    // Pedir más de lo libre no es un caso de este aviso: de eso se encargan los otros mensajes.
    expect(quedaraPidiendoColgar(disponible, 4, 1)).toBe(false);
  });
  it("el recordatorio del retiro no promete que lo del almacén se pueda vender: la caja solo cobra lo del piso", () => {
    expect(RETIRO_NO_ES_BAJA).not.toMatch(/disponibles? para vender/);
    expect(RETIRO_NO_ES_BAJA).toContain("la caja no las cobra hasta que vuelvan al piso");
  });
  it("una talla que no pide nada (extrema y sin ventas) nunca avisa, aunque se suba toda", () => {
    expect(quedaraPidiendoColgar({ piso: 3, almacen: 0 }, 3, 0)).toBe(false);
  });
});
