import { describe, it, expect } from "vitest";
import {
  accesosAlmacen,
  armarNuevos,
  avanceDelDia,
  avanceDelTrayecto,
  ayudaNuevos,
  chipsNuevos,
  cortarTeToca,
  esPerfilAlmacen,
  etiquetaHace,
  etiquetaLlegada,
  etiquetaSedeDeOrigen,
  filtrarNuevos,
  fuentesDeAlmacen,
  inicioDeAyerLima,
  nombreDePila,
  notaEnMiSede,
  sigueAhora,
  siglaSede,
  TITULO_NUEVOS,
  tonoDeSede,
  type FilaNuevoCruda,
  type NuevoProducto,
  type OrigenDeProducto,
} from "./inicio-almacen-reglas";
import type { ClaveModulo } from "./modulos";

// 10:42 a. m. en Lima del miércoles 30 de setiembre de 2026 (UTC−5).
const AHORA = Date.parse("2026-09-30T15:42:00Z");

describe("esPerfilAlmacen", () => {
  const almacen: ClaveModulo[] = ["existencias", "traslados", "recibir", "productos"];
  const perfil = (extra: Partial<Parameters<typeof esPerfilAlmacen>[0]> = {}) => ({ ubicacionTipo: "tienda" as const, modulos: almacen, puedeEditarCatalogo: true, ...extra });
  it("la terminal de almacén vive en una tienda y aun así es de almacén: se decide por lo que su rol ve", () => {
    expect(esPerfilAlmacen(perfil())).toBe(true);
    expect(esPerfilAlmacen(perfil({ ubicacionTipo: "almacen" }))).toBe(true);
  });
  it("quien vende no es de almacén, aunque también reciba", () => {
    expect(esPerfilAlmacen(perfil({ modulos: [...almacen, "vender"] }))).toBe(false);
  });
  it("sin Productos no hay atajo a Nuevo producto: no es la cuenta", () => {
    expect(esPerfilAlmacen(perfil({ modulos: ["existencias", "traslados", "recibir"] }))).toBe(false);
  });
  it("si su rol solo LEE Productos (no puede crear), el botón central no serviría: sigue con el Inicio de siempre", () => {
    expect(esPerfilAlmacen(perfil({ puedeEditarCatalogo: false }))).toBe(false);
  });
  it("con Traslados basta para recibir; sin Recibir ni Traslados no es de almacén", () => {
    expect(esPerfilAlmacen(perfil({ modulos: ["productos", "traslados"] }))).toBe(true);
    expect(esPerfilAlmacen(perfil({ modulos: ["productos", "existencias"] }))).toBe(false);
  });
  it("el Taller tiene su propio Inicio", () => {
    expect(esPerfilAlmacen(perfil({ ubicacionTipo: "taller" }))).toBe(false);
  });
});

describe("la ventana de «hoy y ayer»", () => {
  it("abre en la medianoche de Lima de ayer (05:00 UTC)", () => {
    expect(inicioDeAyerLima(AHORA)).toBe("2026-09-29T05:00:00.000Z");
  });
  it("a las 11:30 p. m. de Lima (ya es el día siguiente en UTC) «hoy» sigue siendo el de Lima", () => {
    expect(inicioDeAyerLima(Date.parse("2026-10-01T04:30:00Z"))).toBe("2026-09-29T05:00:00.000Z");
  });
});

describe("etiquetaHace", () => {
  it("minutos y horas si es de hoy", () => {
    expect(etiquetaHace("2026-09-30T15:41:30Z", AHORA)).toEqual({ dia: "hoy", hace: "hace un momento" });
    expect(etiquetaHace("2026-09-30T15:37:00Z", AHORA)).toEqual({ dia: "hoy", hace: "hace 5 min" });
    expect(etiquetaHace("2026-09-30T13:00:00Z", AHORA)).toEqual({ dia: "hoy", hace: "hace 2 h" });
  });
  it("si es de ayer dice la hora de Lima, no las horas que pasaron", () => {
    const r = etiquetaHace("2026-09-29T23:40:00Z", AHORA);
    expect(r.dia).toBe("ayer");
    expect(r.hace).toMatch(/^ayer, 6:40\s*p\.\s*m\.$/);
  });
  it("las 11 p. m. de Lima son ya el día siguiente en UTC pero siguen siendo «ayer» para quien está en Lima", () => {
    const r = etiquetaHace("2026-09-30T04:00:00Z", AHORA);
    expect(r.dia).toBe("ayer");
    expect(r.hace).toMatch(/^ayer, 11:00\s*p\.\s*m\.$/);
  });
});

describe("nombreDePila", () => {
  it("toma el primer nombre", () => {
    expect(nombreDePila("Rosa María Vega Paz")).toBe("Rosa");
    expect(nombreDePila("  Camila ")).toBe("Camila");
  });
  it("sin nombre no inventa uno", () => {
    expect(nombreDePila("")).toBeNull();
    expect(nombreDePila(null)).toBeNull();
    expect(nombreDePila(undefined)).toBeNull();
  });
});

const fila = (id: string, creado: string, extra: Partial<FilaNuevoCruda> = {}): FilaNuevoCruda => ({
  id,
  codigo: `COD-${id}`,
  referencia: `Prenda ${id}`,
  created_at: creado,
  propuesto_por: null,
  producto_fotos: null,
  variantes: [],
  ...extra,
});

describe("armarNuevos", () => {
  it("ordena del más nuevo al más viejo", () => {
    const r = armarNuevos([fila("a", "2026-09-29T20:00:00Z"), fila("b", "2026-09-30T14:00:00Z")], new Map(), null, AHORA);
    expect(r.map((p) => p.id)).toEqual(["b", "a"]);
    expect(r.map((p) => p.dia)).toEqual(["hoy", "ayer"]);
  });

  it("precio = el más bajo de sus variantes con precio; colores sin repetir; solo variantes activas", () => {
    const [p] = armarNuevos(
      [
        fila("a", "2026-09-30T14:00:00Z", {
          variantes: [
            { id: "1", precio: "189", activo: true, color: { nombre: "Vino", hex: "#6b2a35" } },
            { id: "2", precio: 169, activo: true, color: { nombre: "Vino", hex: "#6b2a35" } },
            { id: "3", precio: 0, activo: true, color: { nombre: "Negro", hex: null } },
            { id: "4", precio: 99, activo: false, color: { nombre: "Rojo", hex: "#f00" } },
          ],
        }),
      ],
      new Map(),
      null,
      AHORA
    );
    expect(p!.precio).toBe(169);
    expect(p!.colores).toEqual([{ nombre: "Vino", hex: "#6b2a35" }, { nombre: "Negro", hex: null }]);
  });

  it("sin precios en ninguna variante, el precio es null y no cero", () => {
    const [p] = armarNuevos([fila("a", "2026-09-30T14:00:00Z", { variantes: [{ id: "1", precio: null, activo: true, color: null }] })], new Map(), null, AHORA);
    expect(p!.precio).toBeNull();
  });

  it("enMiSede sale de lo que dice la función de existencias; sin dato para un producto es 0", () => {
    const r = armarNuevos([fila("a", "2026-09-30T14:00:00Z"), fila("b", "2026-09-30T13:00:00Z")], new Map(), new Map([["a", 6]]), AHORA);
    expect(r.map((p) => p.enMiSede)).toEqual([6, 0]);
  });

  it("si no se pudo leer lo de la sede, enMiSede es null: nunca un 0 que no se sabe", () => {
    const [p] = armarNuevos([fila("a", "2026-09-30T14:00:00Z")], new Map(), null, AHORA);
    expect(p!.enMiSede).toBeNull();
    expect(notaEnMiSede(p!.enMiSede)).toBeNull();
  });

  it("la foto es la principal; quién lo dio de alta sale de la lista de nombres, y sin nombre queda null", () => {
    const nombres = new Map([["persona-1", "Rosa María Vega"]]);
    const r = armarNuevos(
      [
        fila("a", "2026-09-30T14:00:00Z", { propuesto_por: "persona-1", producto_fotos: [{ url: "u2", orden: 2, es_principal: false }, { url: "u1", orden: 1, es_principal: true }] }),
        fila("b", "2026-09-30T13:00:00Z", { propuesto_por: "otra" }),
      ],
      nombres,
      null,
      AHORA
    );
    expect(r[0]).toMatchObject({ fotoUrl: "u1", quien: "Rosa" });
    expect(r[1]).toMatchObject({ fotoUrl: null, quien: null });
  });

  it("sin la lectura del origen, la sede llega null y la pantalla no la inventa", () => {
    const [p] = armarNuevos([fila("a", "2026-09-30T14:00:00Z")], new Map(), null, AHORA);
    expect(p).toMatchObject({ sede: null, sedeNombre: null, propia: false });
  });

  describe("la sede donde se registró (producto_origen, ADR-0292)", () => {
    const MI_SEDE = "u-tru";
    const origen = (m: [string, OrigenDeProducto][]) => ({ porProducto: new Map(m), miUbicacionId: MI_SEDE });
    const filas = [fila("a", "2026-09-30T14:00:00Z"), fila("b", "2026-09-30T13:00:00Z"), fila("c", "2026-09-30T12:00:00Z"), fila("d", "2026-09-30T11:00:00Z")];

    it("cada producto dice su sede en corto, la completa, y si es la de quien mira", () => {
      const r = armarNuevos(
        filas,
        new Map(),
        null,
        AHORA,
        origen([
          ["a", { ubicacionId: "u-aqp", nombre: "Tienda AQP" }],
          ["b", { ubicacionId: MI_SEDE, nombre: "Tienda TRU" }],
          ["c", { ubicacionId: "u-tal", nombre: "Taller" }],
        ])
      );
      expect(r.map((p) => [p.sede, p.sedeNombre, p.propia])).toEqual([
        ["AQP", "Tienda AQP", false],
        ["TRU", "Tienda TRU", true],
        ["Taller", "Taller", false],
        [null, null, false],
      ]);
    });

    it("un producto sin origen anotado (anterior a la tabla) queda sin sede, sin inventarla", () => {
      const [p] = armarNuevos([filas[0]!], new Map(), null, AHORA, origen([]));
      expect(p).toMatchObject({ sede: null, propia: false });
    });

    it("con origen pero sin sede (se sabe que se registró, no dónde) tampoco hay sigla", () => {
      const [p] = armarNuevos([filas[0]!], new Map(), null, AHORA, origen([["a", { ubicacionId: null, nombre: null }]]));
      expect(p).toMatchObject({ sede: null, propia: false });
    });

    it("si la función de origen no respondió (null) nada cambia salvo que no hay sede", () => {
      const r = armarNuevos(filas, new Map(), null, AHORA, { porProducto: null, miUbicacionId: MI_SEDE });
      expect(r.every((p) => p.sede === null && !p.propia)).toBe(true);
      expect(r).toHaveLength(4);
    });

    it("«propia» exige sede conocida: sin ubicación no se confunde con la tuya", () => {
      const [p] = armarNuevos([filas[0]!], new Map(), null, AHORA, { porProducto: new Map([["a", { ubicacionId: null, nombre: "Taller" }]]), miUbicacionId: "" });
      expect(p!.propia).toBe(false);
    });
  });
});

describe("etiquetaSedeDeOrigen", () => {
  it("las tiendas salen como TRU, AQP o LIM sin importar cómo se llamen (producción y local)", () => {
    expect(etiquetaSedeDeOrigen("Tienda TRU")).toBe("TRU");
    expect(etiquetaSedeDeOrigen("Tienda Trujillo")).toBe("TRU");
    expect(etiquetaSedeDeOrigen("Tienda Arequipa")).toBe("AQP");
    expect(etiquetaSedeDeOrigen("Tienda AQP")).toBe("AQP");
    expect(etiquetaSedeDeOrigen("Tienda Lima")).toBe("LIM");
  });
  it("otra sede conserva su nombre sin «Tienda»", () => {
    expect(etiquetaSedeDeOrigen("Taller")).toBe("Taller");
    expect(etiquetaSedeDeOrigen("Tienda Cusco")).toBe("Cusco");
    expect(etiquetaSedeDeOrigen("  Almacén Central ")).toBe("Almacén Central");
  });
  it("«Tienda» sola no queda vacío", () => {
    expect(etiquetaSedeDeOrigen("Tienda")).toBe("Tienda");
  });
  it("el tono del punto es siempre el mismo para la misma sede", () => {
    expect(tonoDeSede("AQP")).toBe(tonoDeSede("AQP"));
    expect([tonoDeSede("TRU"), tonoDeSede("AQP"), tonoDeSede("LIM")].every((t) => t >= 0 && t <= 2)).toBe(true);
  });
});

const nuevo = (id: string, extra: Partial<NuevoProducto> = {}): NuevoProducto => ({
  id,
  codigo: id,
  referencia: id,
  creadoEn: "2026-09-30T14:00:00Z",
  dia: "hoy",
  hace: "hace 2 h",
  precio: 100,
  colores: [],
  fotoUrl: "f",
  enMiSede: 0,
  quien: null,
  sede: null,
  sedeNombre: null,
  propia: false,
  ...extra,
});

describe("el título, la ayuda y los filtros de «Nuevo en el catálogo»", () => {
  it("el catálogo es uno para todas las sedes: el título nunca dice «otras sedes»", () => {
    expect(TITULO_NUEVOS).toEqual({ seccion: "Nuevo en el catálogo", lista: "Lo último registrado" });
  });
  it("la ayuda explica la sigla solo cuando algún producto la trae", () => {
    expect(ayudaNuevos([nuevo("a"), nuevo("b")])).toBe("¿Te llegó una prenda sin etiqueta? Mira aquí si ya la registraron antes de crear otra.");
    expect(ayudaNuevos([nuevo("a"), nuevo("b", { sede: "AQP" })])).toContain("La sigla dice en qué sede se registró; el catálogo es el mismo en todas.");
    expect(ayudaNuevos([])).not.toContain("sigla");
  });

  const lista = [nuevo("a", { sede: "LIM" }), nuevo("b", { sede: "AQP", fotoUrl: null }), nuevo("c", { sede: "LIM", fotoUrl: null })];
  it("los chips por sede solo existen si se conoce la sede", () => {
    expect(chipsNuevos([nuevo("a"), nuevo("b", { fotoUrl: null })]).map((c) => c.clave)).toEqual(["todas", "sinfoto"]);
    expect(chipsNuevos(lista).map((c) => [c.clave, c.cuenta])).toEqual([["todas", 3], ["AQP", 1], ["LIM", 2], ["sinfoto", 2]]);
  });
  it("el chip de la sede de quien mira lo dice, pero filtra por la misma sigla", () => {
    const conMia = [nuevo("a", { sede: "TRU", propia: true }), nuevo("b", { sede: "AQP" })];
    expect(chipsNuevos(conMia).map((c) => [c.clave, c.etiqueta])).toEqual([["todas", "Todas"], ["AQP", "AQP"], ["TRU", "TRU · tu sede"], ["sinfoto", "Sin foto"]]);
    expect(filtrarNuevos(conMia, "TRU").map((p) => p.id)).toEqual(["a"]);
  });
  it("filtra por sede o por «sin foto»", () => {
    expect(filtrarNuevos(lista, "LIM").map((p) => p.id)).toEqual(["a", "c"]);
    expect(filtrarNuevos(lista, "sinfoto").map((p) => p.id)).toEqual(["b", "c"]);
    expect(filtrarNuevos(lista, "todas")).toHaveLength(3);
  });
  it("«cuánto hay ya en tu sede»", () => {
    expect(notaEnMiSede(6)).toBe("Ya hay 6 en tu sede");
    expect(notaEnMiSede(0)).toBe("Aún sin stock en tu sede");
  });
});

describe("cortarTeToca", () => {
  const a = (nivel: "urgente" | "toca" | "sinleer") => ({ nivel });
  it("muestra 4 y el resto queda tras «Ver más»", () => {
    const { visibles, extra } = cortarTeToca([a("urgente"), a("toca"), a("toca"), a("toca"), a("toca"), a("toca")]);
    expect(visibles).toHaveLength(4);
    expect(extra).toHaveLength(2);
  });
  it("una cola sin leer nunca queda detrás del corte: se le da su lugar", () => {
    const { visibles, extra } = cortarTeToca([a("urgente"), a("toca"), a("toca"), a("toca"), a("toca"), a("sinleer"), a("sinleer")]);
    expect(visibles.filter((x) => x.nivel === "sinleer")).toHaveLength(2);
    expect(visibles).toHaveLength(4);
    expect(extra.every((x) => x.nivel !== "sinleer")).toBe(true);
    expect(extra).toHaveLength(3);
  });
  it("con menos filas que el corte no parte nada", () => {
    expect(cortarTeToca([a("toca")])).toEqual({ visibles: [a("toca")], extra: [] });
  });
});

describe("sigueAhora", () => {
  it("la primera tarea y las tres siguientes", () => {
    const l = ["u", "t1", "t2", "t3", "t4"].map((k) => ({ k, nivel: "toca" as const }));
    const r = sigueAhora(l);
    expect(r.ahora!.k).toBe("u");
    expect(r.despues.map((x) => x.k)).toEqual(["t1", "t2", "t3"]);
  });
  it("una cola sin leer no es una tarea que se pueda empezar", () => {
    const r = sigueAhora([{ nivel: "sinleer" as const, k: "x" }, { nivel: "toca" as const, k: "y" }]);
    expect(r.ahora!.k).toBe("y");
    expect(r.despues).toEqual([]);
  });
  it("sin tareas no hay «ahora»", () => {
    expect(sigueAhora([{ nivel: "sinleer" as const }])).toEqual({ ahora: null, despues: [] });
    expect(sigueAhora([])).toEqual({ ahora: null, despues: [] });
  });
});

describe("avanceDelDia", () => {
  it("cuenta las colas al día de las que se ven", () => {
    expect(avanceDelDia({ activos: new Array(8).fill(0) as never[], alDia: [1] as never[] })).toEqual({ alDia: 1, total: 9, pct: 11 });
  });
  it("todo al día es 100 %, y sin colas no se divide entre cero", () => {
    expect(avanceDelDia({ activos: [], alDia: [1, 2] as never[] }).pct).toBe(100);
    expect(avanceDelDia({ activos: [], alDia: [] })).toEqual({ alDia: 0, total: 0, pct: 100 });
  });
});

describe("el trayecto de un traslado", () => {
  it("del envío a la hora estimada", () => {
    expect(avanceDelTrayecto("2026-09-30T13:00:00Z", "2026-09-30T17:00:00Z", Date.parse("2026-09-30T16:00:00Z"))).toBeCloseTo(0.75);
  });
  it("no pasa de 0 a 1", () => {
    expect(avanceDelTrayecto("2026-09-30T13:00:00Z", "2026-09-30T17:00:00Z", Date.parse("2026-09-30T20:00:00Z"))).toBe(1);
    expect(avanceDelTrayecto("2026-09-30T13:00:00Z", "2026-09-30T17:00:00Z", Date.parse("2026-09-30T12:00:00Z"))).toBe(0);
  });
  it("sin hora estimada no hay barra que dibujar", () => {
    expect(avanceDelTrayecto("2026-09-30T13:00:00Z", null, AHORA)).toBeNull();
    expect(avanceDelTrayecto("2026-09-30T13:00:00Z", "2026-09-30T13:00:00Z", AHORA)).toBeNull();
  });
});

describe("etiquetaLlegada", () => {
  it("hoy, mañana y lo que ya debió llegar", () => {
    expect(etiquetaLlegada("2026-09-30T21:30:00Z", AHORA)).toMatch(/^llega ~4:30\s*p\.\s*m\.$/);
    expect(etiquetaLlegada("2026-10-01T13:00:00Z", AHORA)).toMatch(/^llega mañana, 8:00\s*a\.\s*m\.$/);
    expect(etiquetaLlegada("2026-09-30T14:00:00Z", AHORA)).toMatch(/^debió llegar 9:00\s*a\.\s*m\.$/);
    expect(etiquetaLlegada("2026-09-28T14:00:00Z", AHORA)).toBe("debió llegar antes");
  });
  it("sin hora estimada no dice nada", () => {
    expect(etiquetaLlegada(null, AHORA)).toBeNull();
    expect(etiquetaLlegada("no es una fecha", AHORA)).toBeNull();
  });
});

describe("siglaSede", () => {
  it("toma la última palabra: tres letras", () => {
    expect(siglaSede("Tienda Trujillo")).toBe("TRU");
    expect(siglaSede("Tienda Lima")).toBe("LIM");
    expect(siglaSede("Taller")).toBe("TAL");
    expect(siglaSede("Tienda AQP")).toBe("AQP");
    expect(siglaSede("Tienda Arequipa")).toBe("AQP");
    expect(siglaSede("Almacén Central")).toBe("CEN");
    expect(siglaSede("")).toBe("");
  });
});

describe("accesosAlmacen", () => {
  it("solo los módulos que la cuenta ve, y Escanear siempre", () => {
    expect(accesosAlmacen(["existencias", "traslados", "recibir", "productos"]).map((a) => a.etiqueta)).toEqual(["Stock", "Traslados", "Recibir", "Etiquetas", "Escanear"]);
    expect(accesosAlmacen(["recibir"]).map((a) => a.etiqueta)).toEqual(["Recibir", "Escanear"]);
    expect(accesosAlmacen([]).map((a) => a.etiqueta)).toEqual(["Escanear"]);
  });
  it("con Conteos suma Conteo, y Escanear es el destacado", () => {
    const l = accesosAlmacen(["existencias", "traslados", "recibir", "conteos"]);
    expect(l.map((a) => a.etiqueta)).toEqual(["Stock", "Traslados", "Recibir", "Etiquetas", "Conteo", "Escanear"]);
    expect(l.filter((a) => a.destacado).map((a) => a.etiqueta)).toEqual(["Escanear"]);
  });
});

describe("fuentesDeAlmacen", () => {
  const fotos = { activos: 10, conFoto: 3 };
  it("pasa cada cola con su cifra", () => {
    expect(fuentesDeAlmacen({ porRecibir: { facturas: 2, primera: "F001-1 · Andina" }, existencias: { enAlmacen: 50, modelosParaReponer: 5 }, fotos, porCompletar: 2 })).toEqual({
      porRecibir: { facturas: 2, primera: "F001-1 · Andina" },
      reponer: 5,
      fotosQueFaltan: 7,
      porCompletar: 2,
    });
  });
  it("lo que la cuenta no ve no existe (undefined) y lo que falló es «sin leer» (null): nunca un cero", () => {
    expect(fuentesDeAlmacen({ fotos: null, porCompletar: null })).toEqual({ porRecibir: undefined, reponer: undefined, fotosQueFaltan: null, porCompletar: null });
    expect(fuentesDeAlmacen({ existencias: null, fotos, porCompletar: 0 }).reponer).toBeNull();
  });
  it("una sede que no separa piso y almacén no tiene «Reponer a piso»", () => {
    expect(fuentesDeAlmacen({ existencias: { enAlmacen: null, modelosParaReponer: 0 }, fotos, porCompletar: 0 }).reponer).toBeUndefined();
  });
  it("las fotos que faltan nunca son negativas", () => {
    expect(fuentesDeAlmacen({ fotos: { activos: 3, conFoto: 3 }, porCompletar: 0 }).fotosQueFaltan).toBe(0);
  });
});
