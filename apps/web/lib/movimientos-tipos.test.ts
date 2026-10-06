import { describe, expect, it } from "vitest";
import { CATEGORIAS_FILTRO, GRUPOS_RESUMEN, filtroDePalabra, filtrosDesdeParams, leerResumenTienda, type Movimiento } from "./movimientos-reglas";
import { GRUPOS_TIPO, TIPOS_VISUALES, grupoDeTipo, grupoPorId, kindDeLugar, rotuloDeMovimiento, tipoDeOperacion, tipoVisual, type TipoVisual } from "./movimientos-tipos";

type Fila = Pick<Movimiento, "categoria" | "motivo" | "delta" | "sububicacion" | "sububicacionDestino">;
const sub = (tipo: string) => ({ id: tipo, nombre: tipo, tipo });
const piso = sub("piso_venta");
const almacen = sub("almacen_tienda");
const cuarentena = sub("cuarentena");
const fila = (o: Partial<Fila> & Pick<Fila, "categoria">): Fila => ({ motivo: null, delta: 0, sububicacion: null, sububicacionDestino: null, ...o });

describe("tipoVisual: qué fue cada movimiento, de un vistazo", () => {
  it("una venta es venta; sale del piso hacia el cliente", () => {
    expect(tipoVisual(fila({ categoria: "salida", motivo: "venta", delta: -1 }))).toBe("venta");
  });

  it("almacén → piso es una colgada y piso → almacén es una guardada (el par exacto, no el motivo)", () => {
    expect(tipoVisual(fila({ categoria: "interno", motivo: "movimiento_interno", sububicacion: almacen, sububicacionDestino: piso }))).toBe("colgada");
    expect(tipoVisual(fila({ categoria: "interno", motivo: "movimiento_interno", sububicacion: piso, sububicacionDestino: almacen }))).toBe("guardada");
    // Con otro motivo (una activación, un movimiento sin proceso) el par manda igual: la misma lectura de `fn_bajadas_del_piso`.
    expect(tipoVisual(fila({ categoria: "interno", motivo: "activacion_piso_almacen", sububicacion: almacen, sububicacionDestino: piso }))).toBe("colgada");
    expect(tipoVisual(fila({ categoria: "interno", motivo: null, sububicacion: piso, sububicacionDestino: almacen }))).toBe("guardada");
  });

  it("entrar a la cuarentena o salir de ella es una prenda dañada, no una colgada ni una guardada", () => {
    expect(tipoVisual(fila({ categoria: "interno", sububicacion: piso, sububicacionDestino: cuarentena }))).toBe("danada");
    expect(tipoVisual(fila({ categoria: "interno", sububicacion: cuarentena, sububicacionDestino: almacen }))).toBe("danada");
  });

  it("cualquier otro par interno (un rack del Taller, sin sububicación) es «movida»", () => {
    expect(tipoVisual(fila({ categoria: "interno", sububicacion: sub("rack"), sububicacionDestino: sub("rack") }))).toBe("movida");
    expect(tipoVisual(fila({ categoria: "interno" }))).toBe("movida");
  });

  it("las dos piernas de un traslado se leen desde la sede: la que llega es llegada y la que sale, traslado enviado", () => {
    expect(tipoVisual(fila({ categoria: "transferencia", motivo: "traslado_entrada", delta: 8 }))).toBe("llegada");
    expect(tipoVisual(fila({ categoria: "transferencia", motivo: "traslado_salida", delta: -8 }))).toBe("traslado");
    // El envío anulado vuelve a la sede que lo envió: suma, es una llegada.
    expect(tipoVisual(fila({ categoria: "transferencia", motivo: "traslado_anulado", delta: 8 }))).toBe("llegada");
  });

  it("lo que suma stock y no es devolución ni cambio es llegada (recepción, producción, stock inicial)", () => {
    for (const motivo of ["recepcion", "produccion", "carga_inicial", "ingreso_regularizado", "siembra_cargo_especial", "algo_nuevo_de_la_base"]) {
      expect(tipoVisual(fila({ categoria: "entrada", motivo, delta: 3 }))).toBe("llegada");
    }
  });

  it("una devolución y una venta anulada son «devolución»; un cambio es «cambio» en sus dos filas", () => {
    expect(tipoVisual(fila({ categoria: "entrada", motivo: "devolucion", delta: 1 }))).toBe("devolucion");
    expect(tipoVisual(fila({ categoria: "entrada", motivo: "anulacion_venta", delta: 1 }))).toBe("devolucion");
    expect(tipoVisual(fila({ categoria: "entrada", motivo: "cambio", delta: 1 }))).toBe("cambio");
    expect(tipoVisual(fila({ categoria: "salida", motivo: "cambio", delta: -1 }))).toBe("cambio");
  });

  it("un ajuste con conteo detrás es «conteo»; los demás, «ajuste a mano»", () => {
    for (const motivo of ["conteo", "conteo_arranque", "hallazgo_conteo"]) expect(tipoVisual(fila({ categoria: "ajuste", motivo, delta: -1 }))).toBe("conteo");
    for (const motivo of ["merma", "reposicion", "conteo_fisico", "otro", null]) expect(tipoVisual(fila({ categoria: "ajuste", motivo, delta: 2 }))).toBe("ajuste");
  });

  it("las prendas dañadas que salen de la tienda sin venderse son «dañada»; una salida que la web no conoce, «otro»", () => {
    for (const motivo of ["cuarentena_liquidada", "cuarentena_se_boto", "cuarentena_donada"]) expect(tipoVisual(fila({ categoria: "salida", motivo, delta: -1 }))).toBe("danada");
    expect(tipoVisual(fila({ categoria: "salida", motivo: "motivo_nuevo", delta: -1 }))).toBe("otro");
    expect(tipoVisual(fila({ categoria: "salida", motivo: null, delta: -1 }))).toBe("otro");
  });

  it("apartar y liberar un apartado son «apartado»: no cambian el stock", () => {
    expect(tipoVisual(fila({ categoria: "apartado", motivo: "apartado" }))).toBe("apartado");
    expect(tipoVisual(fila({ categoria: "liberacion_apartado", motivo: "liberacion_apartado" }))).toBe("apartado");
  });

  it("una operación toma el tipo de su primera fila", () => {
    expect(tipoDeOperacion([fila({ categoria: "entrada", motivo: "cambio", delta: 1 }), fila({ categoria: "salida", motivo: "cambio", delta: -1 })])).toBe("cambio");
  });
});

describe("los tipos y sus palabras (Felipe, 2026-10-05)", () => {
  it("las palabras son «Colgada en piso» y «Guardada en almacén», en singular y en plural", () => {
    expect(TIPOS_VISUALES.colgada).toMatchObject({ nombre: "Colgada en piso", plural: "Colgadas en piso" });
    expect(TIPOS_VISUALES.guardada).toMatchObject({ nombre: "Guardada en almacén", plural: "Guardadas en almacén" });
  });

  it("todos los tipos tienen nombre, plural, tono e ícono propio", () => {
    for (const [tipo, info] of Object.entries(TIPOS_VISUALES)) {
      expect(info.nombre.length, tipo).toBeGreaterThan(2);
      expect(info.plural.length, tipo).toBeGreaterThan(2);
      expect(info.icono).toBe(tipo);
    }
  });

  it("la venta es verde y la llegada es OTRA tonalidad de verde; colgada y guardada no comparten color", () => {
    expect(TIPOS_VISUALES.venta.tono).toBe("verde");
    expect(TIPOS_VISUALES.llegada.tono).toBe("oliva");
    expect(TIPOS_VISUALES.colgada.tono).not.toBe(TIPOS_VISUALES.guardada.tono);
  });

  it("solo los ajustes a mano y los conteos llevan el borde punteado («sin documento»)", () => {
    const punteados = (Object.keys(TIPOS_VISUALES) as TipoVisual[]).filter((t) => TIPOS_VISUALES[t].punteado);
    expect(punteados.sort()).toEqual(["ajuste", "conteo"]);
  });
});

describe("los siete grupos del filtro de la derecha", () => {
  it("son siete, en el orden de la maqueta, y ningún tipo está en dos", () => {
    expect(GRUPOS_TIPO.map((g) => g.id)).toEqual(["venta", "colgada", "guardada", "llegada", "traslado", "cliente", "ajuste"]);
    const todos = GRUPOS_TIPO.flatMap((g) => g.tipos);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("cada grupo lleva el color y el ícono de su primer tipo", () => {
    for (const g of GRUPOS_TIPO) expect(g.tipos[0]).toBe(g.tipo);
  });

  it("devoluciones y cambios van juntos; apartados, dañadas, movidas y otros no tienen botón", () => {
    expect(grupoDeTipo("devolucion")?.id).toBe("cliente");
    expect(grupoDeTipo("cambio")?.id).toBe("cliente");
    expect(grupoDeTipo("conteo")?.id).toBe("ajuste");
    for (const t of ["apartado", "danada", "movida", "otro"] as const) expect(grupoDeTipo(t)).toBeNull();
  });

  it("se busca por id y un id raro no rompe", () => {
    expect(grupoPorId("colgada")?.nombre).toBe("Colgadas en piso");
    expect(grupoPorId("nada")).toBeNull();
    expect(grupoPorId(undefined)).toBeNull();
  });
});

describe("el buscador entiende las palabras nuevas y las de antes", () => {
  it("«colgadas» y «bajadas» filtran las colgadas en piso; «guardadas» y «retiros», las guardadas en almacén", () => {
    for (const palabra of ["colgada", "Colgadas", "bajadas"]) expect(filtroDePalabra(palabra), palabra).toEqual({ cat: "colgada", proc: null, etiqueta: "Colgadas en piso" });
    for (const palabra of ["guardada", "guardadas", "retiros"]) expect(filtroDePalabra(palabra), palabra).toEqual({ cat: "guardada", proc: null, etiqueta: "Guardadas en almacén" });
  });
});

describe("rotuloDeMovimiento: lo que dice arriba de cada fila", () => {
  it("si el proceso dice lo mismo que el tipo, no se repite", () => {
    expect(rotuloDeMovimiento(fila({ categoria: "salida", motivo: "venta", delta: -1 }))).toEqual({ tipo: "venta", titulo: "Venta", detalle: null });
    expect(rotuloDeMovimiento(fila({ categoria: "interno", motivo: "movimiento_interno", sububicacion: almacen, sububicacionDestino: piso }))).toEqual({ tipo: "colgada", titulo: "Colgada en piso", detalle: null });
    expect(rotuloDeMovimiento(fila({ categoria: "interno", motivo: "movimiento_interno", sububicacion: piso, sububicacionDestino: almacen }))).toEqual({ tipo: "guardada", titulo: "Guardada en almacén", detalle: null });
  });

  it("si el proceso dice algo más, va como detalle: «Llegada · Recepción»", () => {
    expect(rotuloDeMovimiento(fila({ categoria: "entrada", motivo: "recepcion", delta: 48 }))).toEqual({ tipo: "llegada", titulo: "Llegada", detalle: "Recepción" });
    expect(rotuloDeMovimiento(fila({ categoria: "transferencia", motivo: "traslado_entrada", delta: 8 }))).toEqual({ tipo: "llegada", titulo: "Llegada", detalle: "Traslado recibido" });
    expect(rotuloDeMovimiento(fila({ categoria: "entrada", motivo: "anulacion_venta", delta: 1 }))).toEqual({ tipo: "devolucion", titulo: "Devolución", detalle: "Venta anulada" });
  });

  it("si el proceso ya empieza con el nombre del tipo, solo se queda con lo que sigue: «Ajuste a mano · merma»", () => {
    expect(rotuloDeMovimiento(fila({ categoria: "ajuste", motivo: "merma", delta: -1 }))).toEqual({ tipo: "ajuste", titulo: "Ajuste a mano", detalle: "merma" });
    expect(rotuloDeMovimiento(fila({ categoria: "interno", sububicacion: piso, sububicacionDestino: cuarentena, motivo: null }))).toMatchObject({ tipo: "danada", titulo: "Dañado", detalle: "reportada en el piso" });
  });
});

describe("kindDeLugar: el ícono de cada punto del trayecto", () => {
  it("el piso, el almacén y el cliente se reconocen por su nombre", () => {
    expect(kindDeLugar("Piso", "origen", "venta", "venta")).toBe("piso");
    expect(kindDeLugar("Almacén", "destino", "movimiento_interno", "colgada")).toBe("almacen");
    expect(kindDeLugar("Cliente", "destino", "venta", "venta")).toBe("cliente");
  });

  it("el origen de una recepción o de producción es «de fuera»; el de un traslado es una sede", () => {
    expect(kindDeLugar("Textiles Andinos", "origen", "recepcion", "llegada")).toBe("fuera");
    expect(kindDeLugar("Producción", "origen", "produccion", "llegada")).toBe("fuera");
    expect(kindDeLugar("Tienda Lima", "origen", "traslado_entrada", "llegada")).toBe("sede");
    expect(kindDeLugar("Tienda Lima", "destino", "traslado_salida", "traslado")).toBe("sede");
  });
});

describe("«colgada» y «guardada» como tipo del filtro y como grupo de las cifras (migración 20261005160000)", () => {
  it("la URL acepta ?cat=colgada, ?cat=venta y los demás tipos; una categoría inventada se ignora", () => {
    for (const cat of ["venta", "llegada", "traslado", "cliente"]) expect(filtrosDesdeParams({ cat }).categoria).toBe(cat);
    expect(filtrosDesdeParams({ cat: "colgada" }).categoria).toBe("colgada");
    expect(filtrosDesdeParams({ cat: "guardada" }).categoria).toBe("guardada");
    expect(filtrosDesdeParams({ cat: "interno" }).categoria).toBe("interno");
    expect(filtrosDesdeParams({ cat: "basura" }).categoria).toBeUndefined();
  });

  it("los tipos que se ven van después de las cinco de siempre y los grupos de las cifras los traen", () => {
    expect(CATEGORIAS_FILTRO).toEqual(["entrada", "salida", "interno", "ajuste", "transferencia", "venta", "colgada", "guardada", "llegada", "traslado", "cliente"]);
    for (const g of ["venta", "colgada", "guardada", "llegada", "traslado", "cliente"]) expect(GRUPOS_RESUMEN).toContain(g);
  });

  it("cada botón del filtro es un grupo que la base entiende (el id del grupo es la categoría que se pide)", () => {
    for (const g of GRUPOS_TIPO) expect(CATEGORIAS_FILTRO, g.id).toContain(g.id);
  });

  it("las cifras leen los dos grupos nuevos; con una base que todavía no los manda, salen en cero sin romper", () => {
    const fila = (grupo: string, movidas: number) => ({ grupo, proceso: "movimiento_interno", operaciones: 1, filas: 2, entran: 0, salen: 0, movidas });
    const con = leerResumenTienda([fila("interno", 7), fila("colgada", 3), fila("guardada", 4)]);
    expect(con.colgada).toMatchObject({ operaciones: 1, movidas: 3 });
    expect(con.guardada).toMatchObject({ operaciones: 1, movidas: 4 });
    const sin = leerResumenTienda([fila("interno", 7)]);
    expect(sin.colgada).toEqual({ operaciones: 0, entran: 0, salen: 0, movidas: 0, procesos: [] });
    expect(sin.guardada.operaciones).toBe(0);
  });
});
