import { describe, expect, it } from "vitest";
import { accionesDeTalla, insigniaDeTalla, lineaDeLoQueFalta, loQueFaltaEnElPiso, marcaDeColor, origenesDeTalla, pieDeTalla, queTocaConLaTalla } from "./existencias-panel-talla";
import { mejorOrigen } from "./existencias-flujos";
import { esObjetivo } from "./existencias-mision";
import { sedesParaPedir } from "./pedidos-entre-sedes-reglas";
import { agruparStockPorSede } from "./stock-por-sede";
import type { FilaPrenda } from "./existencias-prendas";

const talla = (x: Partial<FilaPrenda> & { enRed?: { sede: string; ubicacionId: string; cantidad: number }[] }) =>
  ({ pisoDisponible: 0, almacenDisponible: 0, disponible: 0, apartado: 0, danado: 0, planPiso: null, talla: "M", ...x }) as FilaPrenda & { enRed?: { sede: string; ubicacionId: string; cantidad: number }[] };
const PIDE = { accion: "por_colgar" } as never;
const TODO = { puedeReponer: true, puedeEnviar: true, puedeAjustar: true, puedeApartar: true, puedePedir: true, origenes: [{ nombre: "Tienda Lima", cantidad: 2 }, { nombre: "Tienda Arequipa", cantidad: 0 }] };

describe("acciones del panel de una talla", () => {
  it("siete tarjetas con los nombres del sistema; con algo en el piso, vender (apartar) va primero", () => {
    const a = accionesDeTalla(talla({ pisoDisponible: 2, almacenDisponible: 3, disponible: 5 }), TODO, true);
    expect(a.map((x) => x.texto)).toEqual(["Apartar", "Colgar en el piso", "Subir a almacén", "Enviar a otra sede", "Pedir a otra sede", "Ajustar stock", "Ficha"]);
  });
  it("la tecla es de la acción, no del lugar: el orden cambia con la talla y el número no", () => {
    const teclas = (f: FilaPrenda) => Object.fromEntries(accionesDeTalla(f, TODO, true).map((x) => [x.clave, x.tecla]));
    const esperado = { colgar: 1, subir: 2, enviar: 3, apartar: 4, pedir: 5, ajustar: 6, ficha: 7 };
    expect(teclas(talla({ pisoDisponible: 2, almacenDisponible: 3, disponible: 5 }))).toEqual(esperado);
    expect(teclas(talla({}))).toEqual(esperado);
  });
  it("primero lo que la talla necesita, después lo que se puede y al final lo que no", () => {
    const claves = (f: FilaPrenda) => accionesDeTalla(f, TODO, true).map((x) => `${x.clave}${x.sugerida ? "*" : ""}${x.ok ? "" : "·no"}`);
    // Sin nada en la sede y una tienda que la tiene: pedir, después lo que se puede (ajustar, ficha), al final lo apagado.
    expect(claves(talla({ enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 2 }] }))).toEqual(["pedir*", "ajustar", "ficha", "apartar·no", "colgar·no", "subir·no", "enviar·no"]);
    // Nada en el piso y algo atrás, sin decisión del motor: colgar primero y sugerida (la misma vara que «Qué toca»).
    expect(claves(talla({ almacenDisponible: 3, disponible: 3 }))[0]).toBe("colgar*");
    // Con el piso en pausa NO se sugiere colgar (podría ya colgar): se ofrece, sin resaltar.
    expect(claves(talla({ almacenDisponible: 3, disponible: 3, planPiso: { accion: "pausa_sin_cuadre" } as never })).filter((x) => x.includes("*"))).toEqual([]);
  });
  it("cada una dice qué hay o por qué está apagada", () => {
    const a = Object.fromEntries(accionesDeTalla(talla({ pisoDisponible: 0, almacenDisponible: 1, disponible: 1 }), TODO, true).map((x) => [x.clave, x]));
    expect(a.colgar).toMatchObject({ ok: true, sub: "1 unidad en almacén" });
    expect(a.subir).toMatchObject({ ok: false, sub: "Nada en piso" });
    expect(a.apartar).toMatchObject({ ok: true, sub: "Con adelanto · en Vender" });
    expect(a.pedir).toMatchObject({ ok: true, sub: "Lima tiene 2" });
  });
  it("sin permiso no se dibuja; sin separar piso y almacén tampoco hay colgar ni subir", () => {
    const a = accionesDeTalla(talla({ disponible: 4 }), { puedeReponer: false, puedeEnviar: false, puedeAjustar: false }, true);
    expect(a.map((x) => x.clave)).toEqual(["ficha"]);
    expect(accionesDeTalla(talla({ disponible: 4 }), TODO, false).map((x) => x.clave)).not.toContain("colgar");
  });
  it("sugiere colgar solo si la talla está por colgar y hay algo atrás", () => {
    const sug = (f: FilaPrenda) => accionesDeTalla(f, TODO, true).filter((x) => x.sugerida).map((x) => x.clave);
    expect(sug(talla({ pisoDisponible: 0, almacenDisponible: 3, disponible: 3, planPiso: PIDE }))).toEqual(["colgar"]);
    expect(sug(talla({ pisoDisponible: 3, almacenDisponible: 3, disponible: 6 }))).toEqual([]);
  });
});

describe("Apartar y Pedir siguen a la talla", () => {
  it("sin stock aquí: Apartar se apaga y Pedir se sugiere si otra tienda la tiene", () => {
    const a = Object.fromEntries(accionesDeTalla(talla({}), TODO, true).map((x) => [x.clave, x]));
    expect(a.apartar).toMatchObject({ ok: false, sub: "Sin stock aquí: pídela" });
    expect(a.pedir).toMatchObject({ ok: true, sugerida: true });
  });
  it("ninguna tienda la tiene: Pedir apagado, con el porqué", () => {
    const a = Object.fromEntries(accionesDeTalla(talla({}), { ...TODO, origenes: [] }, true).map((x) => [x.clave, x]));
    expect(a.pedir).toMatchObject({ ok: false, sub: "Ninguna tienda tiene", sugerida: false });
  });
});

describe("«Qué toca con esta talla»: hay, colgar y pedir siempre dicen algo", () => {
  const TIENDAS = new Set(["lim", "aqp"]);
  const O = { separa: true, tiendas: TIENDAS, puedeColgar: true, puedePedir: true };
  const r = (x: Parameters<typeof talla>[0], o: Partial<typeof O> = {}) =>
    Object.fromEntries(queTocaConLaTalla(talla({ enTransito: 0, ...x }) as never, { ...O, ...o }).map((y) => [y.tema, y]));

  it("hay: sí con piso y almacén; no, con lo que viene en camino; lo apartado y lo dañado van aparte", () => {
    expect(r({ pisoDisponible: 0, almacenDisponible: 6, disponible: 6 }).hay).toMatchObject({ respuesta: "Sí", detalle: "0 en piso · 6 en almacén" });
    expect(r({ enTransito: 4 }).hay).toMatchObject({ respuesta: "No", detalle: "Nada para vender aquí · vienen 4 en camino" });
    expect(r({ apartado: 1 }).hay.detalle).toBe("Nada para vender en esta sede · aparte, 1 apartada");
  });

  it("colgar: el motor manda cuando decide", () => {
    expect(r({ almacenDisponible: 6, disponible: 6, planPiso: PIDE }).colgar).toMatchObject({ respuesta: "Sí", tono: "ambar", accion: "colgar", detalle: "Cuelga 1: no hay en el piso y hay 6 en almacén" });
    expect(r({ almacenDisponible: 6, disponible: 6, planPiso: { accion: "pausa_sin_cuadre" } as never }).colgar).toMatchObject({ respuesta: "En pausa", tono: "pizarra" });
    expect(r({ almacenDisponible: 6, disponible: 6, planPiso: { accion: "pausa_sin_cuadre" } as never }).colgar.accion).toBeUndefined();
    expect(r({ pisoDisponible: 2, almacenDisponible: 3, disponible: 5, planPiso: { accion: "mantener" } as never }).colgar).toMatchObject({ respuesta: "No hace falta", detalle: "Hay 2 en el piso" });
    expect(r({ almacenDisponible: 3, disponible: 3, planPiso: { accion: "mantener", central: false } as never }).colgar.detalle).toMatch(/^Talla de los extremos/);
  });

  it("colgar: sin el motor, los números (0 en el piso y algo atrás = sí)", () => {
    expect(r({ almacenDisponible: 6, disponible: 6 }).colgar).toMatchObject({ respuesta: "Sí", accion: "colgar" });
    expect(r({ pisoDisponible: 5, disponible: 5 }).colgar).toMatchObject({ respuesta: "No hace falta", detalle: "Hay 5 en el piso" });
    expect(r({}).colgar).toMatchObject({ respuesta: "No se puede", detalle: "No hay en el almacén" });
    expect(r({ almacenDisponible: 6, disponible: 6 }, { puedeColgar: false }).colgar.accion).toBeUndefined();
  });

  it("pedir: no hace falta con 2 o más aquí o algo en camino; si no, a la tienda que más tiene", () => {
    const red = [{ sede: "Lima", ubicacionId: "lim", cantidad: 1 }, { sede: "Arequipa", ubicacionId: "aqp", cantidad: 3 }, { sede: "Taller", ubicacionId: "taller", cantidad: 14 }];
    expect(r({ almacenDisponible: 6, disponible: 6, enRed: red }).pedir).toMatchObject({ respuesta: "No hace falta", detalle: "Hay 6 en esta sede" });
    expect(r({ enTransito: 2, enRed: red }).pedir).toMatchObject({ respuesta: "No hace falta", detalle: "Vienen 2 en camino" });
    expect(r({ enRed: red }).pedir).toMatchObject({ respuesta: "Sí", tono: "ambar", accion: "pedir", detalle: "No hay aquí: Arequipa tiene 3 (y 1 tienda más)" });
    expect(r({ pisoDisponible: 1, disponible: 1, enRed: red }).pedir).toMatchObject({ respuesta: "Sí", tono: "pizarra", detalle: "Queda 1 aquí: Arequipa tiene 3 (y 1 tienda más)" });
    expect(r({ enRed: red }, { puedePedir: false }).pedir.accion).toBeUndefined();
  });

  it("pedir: si solo el Taller tiene, se dice sin botón; si nadie, también", () => {
    expect(r({ enRed: [{ sede: "Taller", ubicacionId: "taller", cantidad: 14 }] }).pedir).toMatchObject({ respuesta: "A una tienda, no", detalle: "Ninguna tienda tiene; Taller tiene 14: pídeselo a Taller" });
    expect(r({ enRed: [{ sede: "Taller", ubicacionId: "taller", cantidad: 14 }] }).pedir.accion).toBeUndefined();
    expect(r({}).pedir).toMatchObject({ respuesta: "Nadie tiene", detalle: "Ninguna otra sede tiene" });
  });

  it("pedir usa la vara de «casi no hay»: solo propone algo con 1 o ninguna aquí y nada en camino", () => {
    for (const piso of [0, 1, 2]) for (const alm of [0, 1, 2]) for (const enTransito of [0, 1]) {
      const p = r({ pisoDisponible: piso, almacenDisponible: alm, disponible: piso + alm, enTransito, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 2 }] }).pedir;
      expect(p.respuesta !== "No hace falta").toBe(piso + alm <= 1 && enTransito === 0);
    }
  });

  it("donde no se separa piso y almacén (Taller), solo «Hay»", () => {
    expect(queTocaConLaTalla(talla({ disponible: 4 }) as never, { ...O, separa: false }).map((x) => x.tema)).toEqual(["hay"]);
  });

  it("cada fila se titula con su pregunta corta, en todos los casos (en mayúsculas largas se partía en dos líneas)", () => {
    const casos = [{}, { almacenDisponible: 6, disponible: 6 }, { pisoDisponible: 2, disponible: 2, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 2 }] }, { enTransito: 3 }];
    for (const c of casos) expect(queTocaConLaTalla(talla({ enTransito: 0, ...c }) as never, O).map((x) => x.titulo)).toEqual(["¿Hay?", "¿Colgar?", "¿Pedir?"]);
  });
});

describe("«Faltan en el piso» aunque el motor no decida", () => {
  const color = (nombre: string, tallas: Parameters<typeof talla>[0][]) =>
    ({ referencia: "Blusa", color: nombre, colorHex: null, tallas: tallas.map((t, i) => ({ ...talla(t), varianteId: `${nombre}-${i}` })) }) as never;

  it("con la decisión del motor, la de siempre (y quedan marcadas al colgar)", () => {
    const f = loQueFaltaEnElPiso([color("Beige", [{ talla: "S", almacenDisponible: 2, planPiso: { accion: "por_colgar", requisito: 1 } as never }])]);
    expect(f).toEqual({ titulo: "Faltan en el piso", tallas: "S", ids: new Set(["Beige-0"]), marcadas: true, enPausa: false });
  });
  it("sin motor: los números; las que el motor manda mantener no cuentan", () => {
    const f = loQueFaltaEnElPiso([
      color("Beige", [{ talla: "S", almacenDisponible: 6 }, { talla: "M", almacenDisponible: 1 }, { talla: "L", pisoDisponible: 5 }]),
      color("Negro", [{ talla: "XL", almacenDisponible: 2, planPiso: { accion: "mantener", requisito: 0 } as never }]),
    ]);
    expect(f).toEqual({ titulo: "Faltan en el piso", tallas: "Beige S, M", ids: new Set(["Beige-0", "Beige-1"]), marcadas: false, enPausa: false });
  });
  it("las tallas que dice la frase son las mismas que el panel vuelve botones", () => {
    const prendas = [
      color("Beige", [{ talla: "S", almacenDisponible: 6 }, { talla: "M", pisoDisponible: 1, almacenDisponible: 1 }]),
      color("Negro", [{ talla: "S", almacenDisponible: 2 }, { talla: "M", almacenDisponible: 2, planPiso: { accion: "pausa_sin_cuadre", requisito: 1 } as never }]),
    ];
    const f = loQueFaltaEnElPiso(prendas)!;
    const nombres = prendas.flatMap((p: { color: string; tallas: { varianteId: string; talla: string }[] }) => p.tallas.filter((t) => f.ids.has(t.varianteId)).map((t) => `${p.color} ${t.talla}`));
    expect(nombres).toEqual(["Beige S", "Negro S", "Negro M"]);
    expect(f.tallas).toBe("Beige S · Negro S, M");
  });
  it("con el piso en pausa lo advierte", () => {
    const f = loQueFaltaEnElPiso([color("Beige", [{ talla: "S", almacenDisponible: 6, planPiso: { accion: "pausa_sin_cuadre", requisito: 1 } as never }])]);
    expect(f).toMatchObject({ titulo: "Sin colgar, según el sistema", enPausa: true, marcadas: false });
  });
  it("si no falta nada, no dice nada", () => {
    expect(loQueFaltaEnElPiso([color("Beige", [{ talla: "S", pisoDisponible: 1 }])])).toBeNull();
  });
});

describe("las tallas de arriba lo dicen en su lugar (sin volver a listarlas abajo)", () => {
  it("debajo del número: el piso; sin ninguna aquí, si viene en camino u otra sede la tiene (el Taller también es otra sede)", () => {
    expect(pieDeTalla(talla({ pisoDisponible: 2, almacenDisponible: 3, disponible: 5 }), true)).toEqual({ texto: "2 piso", afuera: false });
    expect(pieDeTalla(talla({ disponible: 4 }), false)).toEqual({ texto: "4", afuera: false });
    expect(pieDeTalla(talla({ enTransito: 2, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 1 }] }), true)).toEqual({ texto: "en camino", afuera: true });
    expect(pieDeTalla(talla({ enTransito: 0, enRed: [{ sede: "Taller", ubicacionId: "taller", cantidad: 3 }] }), true)).toEqual({ texto: "otra sede", afuera: true });
    expect(pieDeTalla(talla({ enTransito: 0, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 0 }] }), true)).toEqual({ texto: "—", afuera: false });
  });

  it("el punto del color: con filtro, solo si lo cumple; sin filtro, lo que falta en el piso antes que lo que tiene otra sede", () => {
    const tallas = [talla({ varianteId: "a", disponible: 2, pisoDisponible: 0, almacenDisponible: 2 }), talla({ varianteId: "b", enTransito: 0, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 2 }] })];
    expect(marcaDeColor(tallas, { faltan: new Set(["a"]), separa: true })).toBe("falta");
    expect(marcaDeColor(tallas, { faltan: new Set(), separa: true })).toBe("afuera");
    expect(marcaDeColor(tallas, { faltan: new Set(["a"]), coincide: (f) => f.varianteId === "b", separa: true })).toBe("filtro");
    expect(marcaDeColor(tallas, { faltan: new Set(["a"]), coincide: () => false, separa: true })).toBeNull();
    expect(marcaDeColor([talla({ varianteId: "c", disponible: 3, pisoDisponible: 3 })], { faltan: new Set(), separa: true })).toBeNull();
  });

  it("una sola línea: cuántas faltan en este color y en qué otros, sin nombrar las tallas", () => {
    const colores = [
      { clave: "azul", color: "Azul marino", tallas: [{ varianteId: "a26" }, { varianteId: "a28" }] },
      { clave: "celeste", color: "Celeste", tallas: [{ varianteId: "c28" }] },
      { clave: "negro", color: "Negro", tallas: [{ varianteId: "n28" }] },
    ];
    const falta = (ids: string[], titulo = "Faltan en el piso") => ({ titulo, ids: new Set(ids) });
    expect(lineaDeLoQueFalta(colores, "azul", falta(["a26", "a28"]))).toBe("Faltan en el piso: 2 tallas");
    expect(lineaDeLoQueFalta(colores, "azul", falta(["a26", "c28", "n28"]))).toBe("Faltan en el piso: 1 talla · también en Celeste y Negro");
    expect(lineaDeLoQueFalta(colores, "azul", falta(["c28"]))).toBe("Faltan en el piso: en Celeste");
    expect(lineaDeLoQueFalta(colores, "azul", falta(["a26"], "Sin colgar, según el sistema"))).toBe("Sin colgar, según el sistema: 1 talla");
    expect(lineaDeLoQueFalta(colores, "azul", falta([]))).toBeNull();
    expect(lineaDeLoQueFalta(colores, "azul", null)).toBeNull();
  });
});

describe("insigniaDeTalla: UNA respuesta junto al número grande", () => {
  const O = { separa: true, tiendas: new Set(["lim"]), puedeColgar: true, puedePedir: true };
  const ins = (x: Parameters<typeof talla>[0]) => insigniaDeTalla(queTocaConLaTalla(talla({ enTransito: 0, ...x }) as never, O));

  it("se acabó: rojo, y la frase dice quién tiene", () => {
    const r = ins({ enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 2 }] as never });
    expect(r).toMatchObject({ tono: "rojo", texto: "Se acabó" });
    expect(r.frase).toContain("2");
  });
  it("falta colgar: ámbar, con cuántas", () => {
    expect(ins({ pisoDisponible: 0, almacenDisponible: 3, disponible: 3, planPiso: PIDE })).toMatchObject({ tono: "ambar", texto: "Falta colgar" });
  });
  it("con el piso en pausa no manda a colgar", () => {
    expect(ins({ pisoDisponible: 0, almacenDisponible: 3, disponible: 3, planPiso: { accion: "pausa_sin_cuadre" } as never })).toMatchObject({ tono: "pizarra", texto: "Piso en pausa" });
  });
  it("queda 1 y otra tienda tiene: queda poco", () => {
    expect(ins({ pisoDisponible: 1, almacenDisponible: 0, disponible: 1, enRed: [{ sede: "Lima", ubicacionId: "lim", cantidad: 3 }] as never })).toMatchObject({ tono: "pizarra", texto: "Queda poco" });
  });
  it("lo demás: todo bien", () => {
    expect(ins({ pisoDisponible: 2, almacenDisponible: 2, disponible: 4 })).toMatchObject({ tono: "verde", texto: "Todo bien" });
  });
});

describe("«Pedir a otra sede» cruza la red con las tiendas por id, no por nombre (regresión 2026-10-07)", () => {
  // El caso de la base local: Blusa Valentina Blanco L, agotada en Tienda Lima; Taller tiene 15 y Tienda Trujillo 4. El cajón
  // decía «Otras sedes: Taller 15 · Trujillo 4» y, al lado, «Pedir a otra sede» apagado con «Ninguna tienda tiene»: la red
  // guarda «Trujillo» (acortado) y `sedesParaPedir`, «Tienda Trujillo».
  const ubicaciones = [
    { id: "taller", nombre: "Taller", tipo: "taller", activo: true },
    { id: "lim", nombre: "Tienda Lima", tipo: "tienda", activo: true },
    { id: "tru", nombre: "Tienda Trujillo", tipo: "tienda", activo: true },
  ];
  const red = agruparStockPorSede(
    [
      { variante_id: "v", ubicacion_id: "taller", cantidad: 15 },
      { variante_id: "v", ubicacion_id: "tru", cantidad: 4 },
    ],
    ubicaciones,
    "lim"
  );
  const enRed = red.get("v")?.otrasSedes ?? [];
  const sedes = sedesParaPedir(ubicaciones, "lim");
  const fila = talla({ enRed });

  it("las tiendas a las que se puede pedir traen lo que tienen", () => {
    expect(origenesDeTalla(enRed, sedes)).toEqual([{ id: "tru", nombre: "Tienda Trujillo", cantidad: 4 }]);
  });
  it("la acción se enciende y dice quién tiene", () => {
    const pedir = accionesDeTalla(fila, { ...TODO, origenes: origenesDeTalla(enRed, sedes) }, true).find((a) => a.clave === "pedir");
    expect(pedir).toMatchObject({ ok: true, sugerida: true });
    expect(JSON.stringify(pedir)).toContain("Trujillo tiene 4");
    expect(JSON.stringify(pedir)).not.toContain("Ninguna tienda tiene");
  });
  it("«¿Pedir?» propone Trujillo, no el Taller", () => {
    const p = queTocaConLaTalla(fila as never, { separa: true, tiendas: new Set(sedes.map((s) => s.id)), puedeColgar: true, puedePedir: true }).find((x) => x.tema === "pedir");
    expect(p).toMatchObject({ respuesta: "Sí", accion: "pedir", detalle: "No hay aquí: Trujillo tiene 4" });
  });
  it("la tienda a la que conviene pedir y la misión del día la reconocen", () => {
    expect(mejorOrigen(enRed, sedes)).toEqual({ id: "tru", nombre: "Tienda Trujillo", cantidad: 4 });
    expect(esObjetivo({ varianteId: "v", pisoDisponible: 0, almacenDisponible: 0, disponible: 0, planPiso: null, enRed }, new Set(sedes.map((s) => s.id)))).toBe(true);
  });
});
