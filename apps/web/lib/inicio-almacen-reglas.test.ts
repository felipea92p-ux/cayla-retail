import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  existenciasDeAlmacen,
  filasDelPiso,
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
import { filtrarExistencias, filtrosDeUrl, indiceDeExistencias } from "./existencias-filtros";
import { entradaPorColgar, porColgarDeLaSede, tareasParaHoy, type EntradaParaHoy } from "./existencias-para-hoy";
import { agruparPorPrenda, queHacerPrenda, type FilaPrenda } from "./existencias-prendas";
import { tarjetasDeExistencias } from "./existencias-tarjetas";
import { avisosInicio } from "./inicio-avisos";
import { conMotor } from "./piso-plan-fixtures";

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
  const porColgar = { tallas: 7, unidades: 12, prendas: 3, enPausa: 0 };
  it("pasa cada cola con su cifra", () => {
    expect(fuentesDeAlmacen({ porRecibir: { facturas: 2, primera: "F001-1 · Andina" }, existencias: { enAlmacen: 50, porColgar }, fotos, porCompletar: 2 })).toEqual({
      porRecibir: { facturas: 2, primera: "F001-1 · Andina" },
      porColgar,
      fotosQueFaltan: 7,
      porCompletar: 2,
    });
  });
  it("lo que la cuenta no ve no existe (undefined) y lo que falló es «sin leer» (null): nunca un cero", () => {
    expect(fuentesDeAlmacen({ fotos: null, porCompletar: null })).toEqual({ porRecibir: undefined, porColgar: undefined, fotosQueFaltan: null, porCompletar: null });
    expect(fuentesDeAlmacen({ existencias: null, fotos, porCompletar: 0 }).porColgar).toBeNull();
  });
  it("una sede que no separa piso y almacén no tiene «Por colgar»", () => {
    expect(fuentesDeAlmacen({ existencias: { enAlmacen: null, porColgar: { tallas: 0, unidades: 0, prendas: 0, enPausa: 0 } }, fotos, porCompletar: 0 }).porColgar).toBeUndefined();
  });
  it("las fotos que faltan nunca son negativas", () => {
    expect(fuentesDeAlmacen({ fotos: { activos: 3, conFoto: 3 }, porCompletar: 0 }).fotosQueFaltan).toBe(0);
  });
});

// «Por colgar» del Inicio de Almacén = «Para hoy» de Existencias = el filtro «Hoy ▸ Por colgar» (2026-10-04, ADR-0331 act. b y c),
// con la decisión del motor del piso (ADR-0328 act. 7). Hasta ese día el Inicio contaba MODELOS con alguna talla que pedía reponer,
// agotadas incluidas, y decía «Sube 4 modelos al piso» donde Existencias decía «3 tallas por colgar»; y la lista «Hoy ▸ Por colgar»
// sumaba 12 donde «Para hoy» decía 15. La prueba arma UNA escena de sede, la pasa por el motor y después por los TRES caminos que usa
// la web —la página de Existencias (filas con `planPiso` + lista del día), su filtro «Hoy» y el servidor del Inicio (`filasDelPiso`
// sobre la misma lectura)— y exige el mismo número en los tres, con el piso cuadrado y sin cuadrar.
describe("las tres cifras de «por colgar» —«Hoy», «Para hoy» y el Inicio de Almacén— salen de la misma función", () => {
  let n = 0;
  const talla = (referencia: string, color: string, t: string | null, piso: number | null, almacen: number | null, extra: Partial<FilaPrenda> = {}) =>
    ({
      varianteId: `v${++n}`, productoId: referencia, referencia, sku: `SKU-${n}`, talla: t, color, colorHex: null, fotoUrl: null,
      codigosBarras: [], categoria: null, pisoDisponible: piso, almacenDisponible: almacen, disponible: (piso ?? 0) + (almacen ?? 0),
      apartado: 0, danado: 0, enTransito: 0, planPiso: null, marca: null, ...extra,
    }) as FilaPrenda & { categoria: string | null };

  // Una tienda de verdad: tallas por colgar, colgadas, agotadas (con y sin traslado en camino), una extrema guardada que el motor
  // deja quieta, una extrema que se vendió ayer (el reloj rápido la manda a colgar, y primero) y una sin talla.
  const crudo = [
    talla("Blusa Emma", "Azul", "S", 0, 3), // por colgar
    talla("Blusa Emma", "Azul", "M", 0, 1), // por colgar
    talla("Blusa Emma", "Azul", "L", 2, 5), // colgada: nada que hacer
    talla("Blusa Emma", "Azul", "XL", 0, 4), // extrema y no se vendió: puede quedar guardada («Mantener»)
    talla("Blusa Emma", "Negro", "M", 0, 0), // agotada: sin stock atrás (el caso que el Inicio contaba de más)
    talla("Blusa Emma", "Negro", "L", 0, 0, { enTransito: 2 }), // agotada y viene en camino
    talla("Pantalón Carla", "Beige", "28", 0, 2, { apartado: 1 }), // por colgar (lo libre ya viene neto de apartados)
    talla("Casaca Nina", "Rojo", "S", 0, 0), // agotada
    talla("Casaca Nina", "Rojo", "XL", 0, 2), // extrema, pero se vendió ayer: por colgar, y primero
    talla("Polo Rita", "Blanco", null, 1, 0), // colgada, sin talla
  ];
  const ventas = { [crudo[8].varianteId]: { vendidasAyer: 1, vendidas14: 1 } };

  /** La escena por los tres caminos, con el piso cuadrado (por defecto) o sin cuadrar (`null`). */
  function escena(cuadradoEn?: string | null) {
    // La página de Existencias: la lectura pasa por el motor y cada fila recibe su decisión; la lista del día va a la pantalla.
    const { filas: stock, plan, lectura } = conMotor(crudo, { cuadradoEn, ventas });
    const cuenta = porColgarDeLaSede(stock, plan.listaDelDia);
    // «Para hoy»: lo mismo que arma `InventarioPanel`.
    const entrada: EntradaParaHoy = {
      separa: true,
      porColgar: entradaPorColgar(cuenta),
      piso: { enPausa: cuenta.enPausa, fallo: false },
      sinStockAtras: { tallas: 0 },
      sinRegistrar: null,
      danadas: 0,
      resuelveDanadas: false,
      apartados: { vencidos: 0 },
      enCamino: { traslados: 0, atrasados: 0, proximaLlegada: null },
    };
    const tareas = tareasParaHoy(entrada);
    // El filtro «Hoy ▸ Por colgar» (lo que abre el aviso del Inicio y el botón «Ver cuáles» de «Para hoy»), con sus tarjetas.
    const elegidos = filtrosDeUrl("hoy=por_colgar", { separa: true });
    const lista = filtrarExistencias(indiceDeExistencias(stock), elegidos).filas;
    const tarjetas = tarjetasDeExistencias(agruparPorPrenda(lista), elegidos.hoy);
    // El servidor del Inicio: NO lee Existencias; cuenta sobre la misma lectura del motor (`getExistenciasDeAlmacen`).
    const inicio = existenciasDeAlmacen(filasDelPiso(lectura, plan), plan.listaDelDia);
    const aviso = avisosInicio(fuentesDeAlmacen({ existencias: inicio, fotos: null, porCompletar: null })).find((a) => a.clave === "reponer");
    return { stock, cuenta, tareas, lista, tarjetas, inicio, aviso };
  }

  describe("con el piso cuadrado", () => {
    const e = escena();
    const paraHoy = e.tareas.find((t) => t.tipo === "por_colgar");

    it("«Hoy», «Para hoy», el bloque y el aviso del Inicio dicen el mismo número de tallas", () => {
      expect(paraHoy?.cifra).toBe(4);
      expect(e.lista.length).toBe(paraHoy?.cifra);
      expect(e.tarjetas.reduce((s, t) => s + (queHacerPrenda(t.colores[0].tallas)?.n ?? 0), 0)).toBe(paraHoy?.cifra);
      expect(e.inicio.porColgar.tallas).toBe(paraHoy?.cifra);
      expect(e.aviso?.cantidad).toBe(paraHoy?.cifra);
    });

    it("el enlace del aviso abre la lista «Hoy ▸ Por colgar» con esas mismas tallas", () => {
      const [ruta, consulta] = e.aviso!.href.split("?");
      expect(ruta).toBe("/inventario");
      const lista = filtrarExistencias(indiceDeExistencias(e.stock), filtrosDeUrl(consulta ?? "", { separa: true })).filas;
      expect(lista.map((f) => f.varianteId).sort()).toEqual(e.cuenta.filas.map((f) => f.varianteId).sort());
    });

    it("las mismas prendas en el mismo orden: lo vendido ayer primero, y nunca lo agotado ni la extrema que puede quedar guardada", () => {
      const paraHoyPrendas = e.cuenta.prendas.map((p) => [p.referencia, p.color, p.tallas.map((f) => f.talla ?? "Única")]);
      expect(e.inicio.primeras.map((p) => [p.referencia, p.color, p.tallas])).toEqual(paraHoyPrendas.slice(0, 3));
      expect(paraHoyPrendas).toEqual([
        ["Casaca Nina", "Rojo", ["XL"]],
        ["Blusa Emma", "Azul", ["S", "M"]],
        ["Pantalón Carla", "Beige", ["28"]],
      ]);
      expect(e.inicio.porColgar).toEqual({ tallas: 4, unidades: 8, prendas: 3, enPausa: 0 });
      expect(paraHoy?.detalle).toMatch(/^8 guardadas y ninguna colgada: empieza por Casaca Nina, Blusa Emma y 1 más/);
    });

    it("habla como Existencias: «Por colgar» y «Bajar al piso», nunca «Sube … al piso»", () => {
      expect(e.aviso?.titulo).toBe("Por colgar");
      expect(e.aviso?.ahora).toBe("Baja al piso 4 tallas por colgar");
      expect(e.aviso?.ahora).not.toMatch(/sube/i);
      // La misma frase honesta que «Para hoy»: si ya cuelgan y el sistema las cree guardadas, se registran al bajar.
      expect(e.aviso?.detalle).toBe("8 guardadas y ninguna colgada. ¿Ya cuelgan? Regístralas al bajar.");
    });

    it("«Bajar al piso» llega con las tallas por colgar ya en la lista", () => {
      const lineas = new URLSearchParams(e.inicio.hrefBajar.split("?")[1] ?? "").get("lineas") ?? "";
      const enLista = lineas.split(",").map((l) => l.split(":")[0]);
      expect(e.inicio.hrefBajar.startsWith("/inventario/bajar")).toBe(true);
      expect(new Set(enLista)).toEqual(new Set(e.cuenta.filas.map((f) => f.varianteId)));
    });
  });

  describe("con el piso sin cuadrar (así está toda tienda el día que se pega el motor)", () => {
    const e = escena(null);
    const espera = e.tareas.find((t) => t.tipo === "piso_en_pausa");

    it("nadie manda a colgar: «Hoy ▸ Por colgar» vacío, «Para hoy» sin fila «por colgar» y el Inicio en 0 tallas", () => {
      expect(e.lista).toEqual([]);
      expect(e.tareas.some((t) => t.tipo === "por_colgar")).toBe(false);
      expect(e.inicio.porColgar.tallas).toBe(0);
    });

    it("«Para hoy» y el Inicio dicen cuántas tallas esperan el cuadre, con la misma cifra, nunca «al día»", () => {
      expect(espera?.cifra).toBe(4);
      expect(e.inicio.porColgar.enPausa).toBe(espera?.cifra);
      expect(e.aviso).toMatchObject({ titulo: "Cuadrar el piso", cantidad: espera?.cifra, ahora: "Cuadra el piso antes de colgar", href: "/inventario" });
      expect(e.aviso?.detalle).toBe("4 tallas esperan el cuadre del piso: hasta cuadrarlo no se sabe qué falta colgar.");
    });
  });

  it("si el motor no responde, el Inicio dice «Sin leer», nunca un cero", () => {
    const aviso = avisosInicio(fuentesDeAlmacen({ existencias: null, fotos: null, porCompletar: null })).find((a) => a.clave === "reponer");
    expect(aviso?.cantidad).toBeNull();
  });

  // Lo de arriba prueba la regla; esto prueba que las pantallas la usan. Si una pantalla vuelve a contar «por colgar» por su lado
  // (como el Inicio hasta el 2026-10-04, o el motor con su propia cuenta por percha), las pruebas de arriba seguirían en verde y los
  // números volverían a separarse.
  it("Existencias, su filtro «Hoy» y el Inicio cuentan con la misma función y la misma decisión, no cada uno por su lado", () => {
    const fuente = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
    const panel = fuente("components/InventarioPanel.tsx");
    expect(panel).toMatch(/porColgarDeLaSede\(stock, listaDelDia\)/);
    expect(panel).toMatch(/porColgar: entradaPorColgar\(cuentaPorColgar\)/);
    expect(panel).toMatch(/enPausa: cuentaPorColgar\.enPausa/);
    // La página pone en cada fila la decisión del motor y le pasa al panel la lista del día del MISMO plan.
    const pagina = fuente("app/(app)/inventario/page.tsx");
    expect(pagina).toMatch(/planPiso: planPiso\.get\(f\.varianteId\)/);
    expect(pagina).toMatch(/listaDelDia=\{plan\?\.listaDelDia\}/);
    // El filtro «Hoy» y la cuenta preguntan lo mismo a cada talla (`hoyDeTalla`: la decisión del motor dicha en palabras).
    expect(fuente("lib/existencias-filtros.ts")).toMatch(/hoyDeTalla\(f\) !== elegidos\.hoy/);
    expect(fuente("lib/existencias-para-hoy.ts")).toMatch(/stock\.filter\(\(f\) => hoyDeTalla\(f\) === "por_colgar"\)/);
    // El Inicio: la lectura del motor → sus filas → la misma cuenta.
    expect(fuente("lib/inicio-almacen.ts")).toMatch(/existenciasDeAlmacen\(filasDelPiso\(lectura, plan\), plan\.listaDelDia\)/);
    expect(fuente("lib/inicio-almacen-reglas.ts")).toMatch(/porColgarDeLaSede\(stock, listaDelDia\)/);
    // Ninguna segunda cuenta de «por colgar» (las que hubo: `resumirPorColgar`, `paraColgarHoy`, `prendasParaColgarHoy`).
    for (const ruta of ["lib/existencias-hoy.ts", "lib/inventario-reglas.ts", "lib/piso-plan.ts", "lib/existencias-prendas.ts", "lib/inicio-almacen.ts"]) {
      expect({ ruta, otra: /export function (resumirPorColgar|paraColgarHoy|prendasParaColgarHoy)\b/.test(fuente(ruta)) }).toEqual({ ruta, otra: false });
    }
  });

  it("en una sede que no separa piso y almacén no hay «Por colgar» (el Taller)", () => {
    const taller = existenciasDeAlmacen([talla("Blusa Emma", "Azul", "M", null, null)], []);
    expect(taller.enAlmacen).toBeNull();
    expect(fuentesDeAlmacen({ existencias: taller, fotos: null, porCompletar: null }).porColgar).toBeUndefined();
  });
});
