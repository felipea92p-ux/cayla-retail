import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  armarFrescuraLider,
  leerConfianzaRegistro,
  leerFrescuraSede,
  MARCA_EDAD_DESCONOCIDA,
  MARCA_INTERNO,
  MARCA_VENTA,
  nivelPorVentas,
  type FrescuraPrenda,
  type FrescuraSede,
  type LlamarRpcFrescura,
  type RespuestaRpc,
} from "./frescura-reglas";

// EL CONTRATO SQL ↔ WEB DE FRESCURA (ADR-0208, paso 3 del 3c), probado con la salida REAL de la base.
//
// POR QUÉ. `frescura-reglas.test.ts` prueba las reglas con eventos escritos a mano, y `frescura_lectura.mjs` prueba el SQL
// con consultas: ninguna de las dos ve si lo que DEVUELVE `retail.fn_frescura_sede` es lo que la web LEE. Un nombre de
// campo distinto (`talla` vs `talla_valor`), una marca en otro bit o una fecha en otro formato no rompen ninguna de las
// dos, y en la pantalla se verían como «Nueva» o «Sin temporada» en silencio: `leerFrescuraSede` descarta lo que no
// entiende (a propósito, para no tumbar la pantalla).
//
// CÓMO. `__fixtures__/frescura-sede.json` es la salida de las dos funciones sobre la tienda que siembra el caso T13 de
// `scripts/pruebas/frescura_lectura.mjs` (Postgres con todas las migraciones), guardada tal cual. Ese caso, en el CI de
// SQL, exige que la salida de hoy tenga la misma forma que este archivo; esta prueba exige que la web lo lea ENTERO y
// que la lógica diga de cada prenda sembrada lo que su historia dice. Se rehace con
// `FRESCURA_FIXTURE_ESCRIBIR=1 pnpm pruebas:frescura-lectura`; no se edita a mano.
//
// Las afirmaciones no dependen del día en que se rehizo el archivo: la siembra es relativa a `now()` (salvo la chompa de
// invierno, con fecha fija de 2026) y la web usa el `ahora` que trae la lectura.

type Crudo = {
  fn_frescura_sede: {
    separa_piso: boolean;
    desde: string;
    ahora: string;
    prendas: { variante_id: string; codigo: string; piso_hoy: number; almacen_hoy: number; apartadas_hoy: number }[];
    eventos: Record<string, [string, number, number, string | null][]>;
    apartados: Record<string, [string, number][]>;
    tardias: { oid: string; variante_id: string; bajada_en: string; unidades_tardias: number }[];
    dudosas: string[];
  };
  fn_confianza_registro: { ubicacion_id: string; mes: string; filas: number; unidades: number; tardias: number; confianza: number | null; nivel: string | null }[];
};
const CRUDO = JSON.parse(readFileSync(new URL("./__fixtures__/frescura-sede.json", import.meta.url), "utf8")) as Crudo;
const SEDE = CRUDO.fn_frescura_sede;
const CONF = CRUDO.fn_confianza_registro;
const idDe = (codigo: string) => {
  const p = SEDE.prendas.find((x) => x.codigo === codigo);
  if (!p) throw new Error(`el archivo no trae ${codigo}`);
  return p.variante_id;
};

/** Una `rpc` de mentira que responde lo que la base respondió, y anota con qué se la llamó. */
function rpcDesde(respuestas: Record<string, (args: unknown) => RespuestaRpc | Promise<RespuestaRpc>>) {
  const llamadas: { fn: string; args: unknown }[] = [];
  const rpc: LlamarRpcFrescura = (fn, args) => {
    llamadas.push({ fn, args });
    return Promise.resolve().then(() => respuestas[fn === "fn_frescura_sede" ? `${fn}:${(args as { p_ubicacion_id: string }).p_ubicacion_id}` : fn](args));
  };
  return { rpc, llamadas };
}
const ok = (data: unknown): RespuestaRpc => ({ data, error: null });
const TIENDA = { id: "u-tienda", nombre: "ZZ Tienda Frescura" };

async function laSede(): Promise<FrescuraSede> {
  const { rpc } = rpcDesde({ [`fn_frescura_sede:${TIENDA.id}`]: () => ok(SEDE), fn_confianza_registro: () => ok(CONF) });
  const r = await armarFrescuraLider([TIENDA], rpc, 120);
  const datos = r.sedes[0].lectura.datos;
  if (!datos || !datos.separaPiso) throw new Error(`la sede no se leyó: ${r.sedes[0].lectura.fallo}`);
  return datos;
}
const prendaCon = (sede: FrescuraSede, codigo: string): FrescuraPrenda => {
  const id = idDe(codigo);
  const p = sede.prendas.find((x) => x.tallas.some((t) => t.varianteId === id));
  if (!p) throw new Error(`la web no armó la prenda de ${codigo}`);
  return p;
};

describe("contrato fn_frescura_sede → leerFrescuraSede: la web lee ENTERA la salida real", () => {
  const l = leerFrescuraSede(SEDE);

  it("la forma calza: separa piso, desde y ahora tal cual", () => {
    expect(l).not.toBeNull();
    expect(l!.separaPiso).toBe(true);
    if (!l?.separaPiso) return;
    expect(l.desde).toBe(SEDE.desde);
    expect(l.ahora).toBe(SEDE.ahora);
  });

  it("ninguna prenda se pierde, y cada campo llega con su nombre", () => {
    if (!l?.separaPiso) throw new Error("sin lectura");
    expect(l.tallas).toHaveLength(SEDE.prendas.length);
    for (const t of l.tallas) {
      expect(t.codigo, t.varianteId).not.toBeNull();
      expect(t.talla, `${t.codigo} sin talla`).not.toBeNull();
      expect(t.categoriaNombre, `${t.codigo} sin categoría`).not.toBeNull();
      expect(t.productoNombre, `${t.codigo} sin nombre`).not.toBe("");
    }
    // Las fechas y los números llegan como tales (no como texto vacío ni 0 por un nombre mal escrito).
    const vieja = l.tallas.find((t) => t.codigo === "ZZ-FX-VIEJA-M")!;
    expect(vieja.pisoHoy).toBe(2);
    expect(vieja.almacenHoy).toBe(1);
    expect(vieja.primeraExhibicion).not.toBeNull();
    expect(vieja.ultimaLlegada).not.toBeNull();
    const chompa = l.tallas.find((t) => t.codigo === "ZZ-FX-CHOMPA-M")!;
    expect(chompa).toMatchObject({ temporada: "invierno", temporadaOrigen: "producto", esClasico: false, enEstacionAhora: expect.any(Boolean) });
    expect(chompa.finEstacion).not.toBeNull();
    // La última llegada a ESTA tienda (15-ago) y la última llegada A CAYLA (el lote del 20-ago en Trujillo) son campos
    // distintos: si la web leyera uno por el otro, la tienda que recibe una prenda trasladada no vería su temporada pasada.
    const crudaChompa = SEDE.prendas.find((p) => p.codigo === "ZZ-FX-CHOMPA-M") as unknown as Record<string, unknown>;
    expect(chompa.ultimaLlegada).toBe(crudaChompa.ultima_llegada);
    expect(chompa.ultimaLlegadaCayla).toBe(crudaChompa.ultima_llegada_cayla);
    expect(Date.parse(chompa.ultimaLlegadaCayla!)).toBeGreaterThan(Date.parse(chompa.ultimaLlegada!));
    // Las dos tallas del modelo+color traen la misma llegada a CAYLA (la S nunca llegó a Trujillo).
    expect(l.tallas.find((t) => t.codigo === "ZZ-FX-CHOMPA-S")!.ultimaLlegadaCayla).toBe(chompa.ultimaLlegadaCayla);
    expect(l.tallas.find((t) => t.codigo === "ZZ-FX-CLASICO-M")).toMatchObject({ temporada: "clasico", esClasico: true, finEstacion: null });
    expect(l.tallas.find((t) => t.codigo === "ZZ-FX-SINTEMP-M")).toMatchObject({ temporada: null, temporadaOrigen: null, finEstacion: null });
  });

  it("ningún evento se pierde, y las marcas se leen en su bit (1 venta, 2 interno, 4 edad desconocida)", () => {
    if (!l?.separaPiso) throw new Error("sin lectura");
    const idsPrendas = new Set(SEDE.prendas.map((p) => p.variante_id));
    let n = 0;
    for (const [id, crudos] of Object.entries(SEDE.eventos)) {
      expect(idsPrendas.has(id), `eventos de ${id}, que no está en prendas`).toBe(true);
      const leidos = l.eventos[id];
      expect(leidos, id).toHaveLength(crudos.length);
      crudos.forEach(([ts, delta, marcas, oid], i) => {
        const e = leidos[i];
        expect(e.ts).toBe(ts);
        expect(e.delta).toBe(delta);
        expect(e.esVenta).toBe((marcas & MARCA_VENTA) !== 0);
        expect(e.esMovimientoInterno).toBe((marcas & MARCA_INTERNO) !== 0);
        expect(e.edadDesconocida).toBe((marcas & MARCA_EDAD_DESCONOCIDA) !== 0);
        expect(e.oid ?? null).toBe(oid);
        n++;
      });
    }
    expect(n).toBeGreaterThan(40);
    // La carga inicial por la puerta real llega como interna Y de edad desconocida (marca 6).
    expect(l.eventos[idDe("ZZ-FX-CARGA-M")]).toEqual([expect.objectContaining({ delta: 2, esMovimientoInterno: true, edadDesconocida: true, esVenta: false })]);
    // La venta de la tardía, como venta.
    expect(l.eventos[idDe("ZZ-FX-TARDIA-M")].filter((e) => e.esVenta)).toHaveLength(1);
  });

  it("lo apartado (R7-1): cada punto llega con su hora y su signo, y cada prenda con lo libre y lo apartado", () => {
    if (!l?.separaPiso) throw new Error("sin lectura");
    const idsPrendas = new Set(SEDE.prendas.map((p) => p.variante_id));
    expect(Object.keys(SEDE.apartados).length).toBeGreaterThan(0);
    for (const [id, crudos] of Object.entries(SEDE.apartados)) {
      expect(idsPrendas.has(id), `apartados de ${id}, que no está en prendas`).toBe(true);
      expect(l.apartados?.[id]).toEqual(crudos.map(([ts, delta]) => ({ ts, delta })));
    }
    for (const t of l.tallas) expect(t.apartadasHoy, t.codigo ?? t.varianteId).toBe(SEDE.prendas.find((p) => p.variante_id === t.varianteId)!.apartadas_hoy);
    // El vestido apartado: nada libre en el piso ni en el almacén, 3 apartadas, y lo del piso se apartó en un solo punto.
    const apartada = l.tallas.find((t) => t.codigo === "ZZ-FX-APARTADA-M")!;
    expect(apartada).toMatchObject({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 3 });
    expect(l.apartados?.[apartada.varianteId]).toEqual([{ ts: expect.any(String), delta: -2 }]);
  });

  it("tardías y dudosas: todas, con el oid de su bajada (así las reconoce excluirTardias)", () => {
    if (!l?.separaPiso) throw new Error("sin lectura");
    expect(l.tardias).toHaveLength(SEDE.tardias.length);
    expect(l.tardias).toEqual([
      expect.objectContaining({ varianteId: idDe("ZZ-FX-TARDIA-M"), unidadesTardias: 1, bajadaEn: SEDE.tardias[0].bajada_en }),
    ]);
    const bajada = l.eventos[idDe("ZZ-FX-TARDIA-M")].find((e) => e.oid === l.tardias[0].oid);
    expect(bajada?.delta, "la tardía apunta a un evento de su prenda").toBe(1);
    expect(l.dudosas).toEqual([idDe("ZZ-FX-DUDOSA-M")]);
  });
});

describe("contrato fn_confianza_registro → leerConfianzaRegistro", () => {
  const filas = leerConfianzaRegistro(CONF);

  it("ninguna fila se pierde; mes como fecha, números como números y el nivel de la base", () => {
    expect(filas).toHaveLength(CONF.length);
    expect(filas.length).toBeGreaterThan(0);
    for (const [i, f] of filas.entries()) {
      expect(f.mes).toMatch(/^\d{4}-\d{2}-01$/);
      expect(f.ubicacionId).toBe(CONF[i].ubicacion_id);
      expect(f.sede).toBe("ZZ Tienda Frescura");
      expect(f.filas).toBe(CONF[i].filas);
      expect(f.unidades).toBe(CONF[i].unidades);
      expect(f.tardias).toBe(CONF[i].tardias);
      expect(f.nivel).toBe(CONF[i].nivel);
      // confianza = 1 − tardías ÷ unidades (4 decimales), nula sin unidades; nivel por filas: 1-9, 10-19, 20+.
      expect(f.confianza).toBe(f.unidades > 0 ? Math.round((1 - f.tardias / f.unidades) * 10_000) / 10_000 : null);
      expect(f.nivel).toBe(nivelPorVentas(f.filas));
    }
  });

  it("la tardía de la siembra está; la carga inicial y la dudosa no suman", () => {
    expect(filas.reduce((s, f) => s + f.tardias, 0)).toBe(1);
    // Las bajadas de hace 1 a 10 días de la siembra son 7 filas y 10 unidades efectivas (3 nueva, 1 + 2 tardía, 3 − 1
    // retiro, 2 sin temporada... ver T13); la carga inicial (2) y la dudosa (2) quedan fuera, así que ninguna fila puede
    // tener más unidades que el total sembrado sin ellas.
    const total = filas.reduce((s, f) => s + f.unidades, 0);
    const bajadoSinCargaNiDudosa = Object.entries(SEDE.eventos)
      .filter(([id]) => id !== idDe("ZZ-FX-CARGA-M") && id !== idDe("ZZ-FX-DUDOSA-M"))
      .flatMap(([, ev]) => ev)
      .filter(([, delta, marcas]) => delta > 0 && (marcas & MARCA_INTERNO) !== 0)
      .reduce((s, [, delta]) => s + delta, 0);
    expect(total).toBeLessThanOrEqual(bajadoSinCargaNiDudosa);
  });
});

describe("la salida real por armarFrescuraLider: lo que la pantalla dirá de cada prenda sembrada", () => {
  it("pide una lectura por tienda con sus días y UNA confianza para todas", async () => {
    const { rpc, llamadas } = rpcDesde({ [`fn_frescura_sede:${TIENDA.id}`]: () => ok(SEDE), fn_confianza_registro: () => ok(CONF) });
    const r = await armarFrescuraLider([TIENDA], rpc, 90);
    expect(llamadas).toEqual([
      { fn: "fn_frescura_sede", args: { p_ubicacion_id: TIENDA.id, p_dias: 90 } },
      { fn: "fn_confianza_registro", args: {} },
    ]);
    expect(r.confianza.fallo).toBeNull();
    expect(r.confianza.datos).toHaveLength(CONF.length);
  });

  it("la vara de las blusas es «solido» con sus tres cortes; la de las chompas, «pocos_datos»", async () => {
    const sede = await laSede();
    const blusas = sede.categorias.find((c) => c.categoriaNombre === "Camisas y Blusas")!;
    expect(blusas.nivel).toBe("solido");
    expect(blusas.vendidas).toBeGreaterThanOrEqual(20);
    const { p50, p75, p90 } = blusas.cortes;
    expect(p50 !== null && p75 !== null && p90 !== null && p50 < p75 && p75 < p90).toBe(true);
    expect(sede.categorias.find((c) => c.categoriaNombre === "Chompas")!.nivel).toBe("pocos_datos");
  });

  it("las tres tallas de la blusa nueva son UNA prenda (modelo + color), Nueva, con 1 día colgada", async () => {
    const p = prendaCon(await laSede(), "ZZ-FX-NUEVA-M");
    expect(p.tallas.map((t) => t.talla).sort()).toEqual(["L", "M", "S"]);
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "nueva", alMenos: false, quieta: false });
    expect(p.reloj.segundos).toBeCloseTo(86_400, -1);
    expect(p.pisoHoy).toBe(3);
  });

  it("la blusa vieja (40 días, nada vendido) es Crítica y está «por decidir»: cambiar de lugar y trasladar, nunca rebajar", async () => {
    const sede = await laSede();
    const p = prendaCon(sede, "ZZ-FX-VIEJA-M");
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true });
    expect(p.estado.sugerencias).toEqual(["cambiar_lugar", "trasladar"]);
    expect(p.rapidez?.vendidas).toBe(0);
    // Se midió contra su categoría SIN ella (D5): no vendió nada, así que el resto tiene las mismas ventas que la vara.
    const blusas = sede.categorias.find((c) => c.categoriaNombre === "Camisas y Blusas")!;
    expect(p.categoriaSinElla?.vendidas).toBe(blusas.vendidas);
    expect(p.categoriaSinElla?.cortes.p50).not.toBeNull();
  });

  it("la carga inicial (marca 6) nunca es Nueva: «al menos», sin edad conocida", async () => {
    const p = prendaCon(await laSede(), "ZZ-FX-CARGA-M");
    expect(p.reloj.alMenos).toBe(true);
    expect(p.estado.tipo).toBe("sin_edad_conocida");
  });

  it("la tardía se reconoce por su oid y sale de la vara, pero su prenda NO pasa a «edad desconocida» (ADR-0248): sigue Nueva", async () => {
    const sede = await laSede();
    const p = prendaCon(sede, "ZZ-FX-TARDIA-M");
    expect(p.reloj.alMenos).toBe(false);
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "nueva", alMenos: false });
    // Su venta de los 3 minutos no está en la vara: las blusas vendieron 24 (la vara) + 1 (el retiro), no 26.
    expect(sede.categorias.find((c) => c.categoriaNombre === "Camisas y Blusas")!.vendidas).toBe(25);
  });

  it("la dudosa no se juzga; la chompa de invierno avisa «Temporada pasada»; el clásico no; la sin temporada lleva su chip", async () => {
    const sede = await laSede();
    expect(prendaCon(sede, "ZZ-FX-DUDOSA-M").estado.tipo).toBe("dudosa");
    const chompa = prendaCon(sede, "ZZ-FX-CHOMPA-S");
    expect(chompa.tallas).toHaveLength(2);
    expect(chompa.temporada).toBe("invierno");
    // La pantalla dice por qué pasó: su última llegada a CAYLA (el lote de Trujillo), no la de esta tienda (D1).
    const crudaM = SEDE.prendas.find((x) => x.codigo === "ZZ-FX-CHOMPA-M") as unknown as Record<string, unknown>;
    expect(chompa.ultimaLlegadaCayla).toBe(crudaM.ultima_llegada_cayla);
    expect(chompa.ultimaLlegada).toBe(crudaM.ultima_llegada);
    // Su categoría vendió 1 de 6 (sin P50): «aún sin referencia», no «Nueva»; y como su temporada pasó, se sugiere retirarla.
    expect(chompa.estado).toMatchObject({ tipo: "sin_vara", temporadaPasada: true, quieta: true });
    expect(chompa.estado.sugerencias).toContain("retirar");
    // La única otra prenda de Chompas que entra a la vara no vendió: no hay contra qué medir su rapidez.
    expect(chompa.rapidez).toBeNull();
    const clasico = prendaCon(sede, "ZZ-FX-CLASICO-M");
    expect(clasico.estado).toMatchObject({ tipo: "clasico", temporadaPasada: false, sinTemporada: false });
    expect(prendaCon(sede, "ZZ-FX-SINTEMP-M").estado).toMatchObject({ sinTemporada: true, temporadaPasada: false });
  });

  it("el vestido apartado para una clienta (R7-1) no envejece desde que se apartó ni recibe sugerencias: colgado 10 días, no 40", async () => {
    const sede = await laSede();
    const p = prendaCon(sede, "ZZ-FX-APARTADA-M");
    expect(p).toMatchObject({ pisoHoy: 0, almacenHoy: 0, apartadasHoy: 3 });
    expect(p.reloj.segundos / 86_400).toBeCloseTo(10, 3);
    expect(p.estado).toMatchObject({ quieta: false, sugerencias: [] });
    // Lo apartado no pesa en las cifras del piso.
    expect(sede.cifras.unidadesEnPiso).toBe(SEDE.prendas.reduce((s, x) => s + x.piso_hoy, 0));
  });

  it("lo que solo está en el almacén viaja sin eventos y no pesa en las cifras del piso", async () => {
    const sede = await laSede();
    const p = prendaCon(sede, "ZZ-FX-ALMACEN-M");
    expect(p.pisoHoy).toBe(0);
    expect(p.primeraExhibicion).toBeNull();
    expect(SEDE.eventos[idDe("ZZ-FX-ALMACEN-M")]).toBeUndefined();
    expect(sede.cifras.unidadesEnPiso).toBe(SEDE.prendas.reduce((s, x) => s + x.piso_hoy, 0));
    expect(sede.cifras.porDecidir).toBeGreaterThanOrEqual(1);
  });

  it("con una sola tienda, la referencia de CAYLA es la vara de esa tienda", async () => {
    const { rpc } = rpcDesde({ [`fn_frescura_sede:${TIENDA.id}`]: () => ok(SEDE), fn_confianza_registro: () => ok(CONF) });
    const r = await armarFrescuraLider([TIENDA], rpc, 120);
    const sede = r.sedes[0].lectura.datos as FrescuraSede;
    expect(r.referenciaCayla.fallo).toBeNull();
    expect(r.referenciaCayla.datos).toEqual(sede.categorias);
  });
});

describe("caída externa: cada bloque falla por su cuenta, la referencia de CAYLA no se arma a medias", () => {
  const TALLER = { id: "u-taller", nombre: "Taller" };
  const OTRA = { id: "u-otra", nombre: "Tienda Otra" };

  it("sin permiso en una tienda, la otra se ve; la referencia dice qué tienda falta", async () => {
    const { rpc } = rpcDesde({
      [`fn_frescura_sede:${TIENDA.id}`]: () => ok(SEDE),
      [`fn_frescura_sede:${OTRA.id}`]: () => ({ data: null, error: { message: "sin permiso", hint: "frescura_sin_permiso" } }),
      fn_confianza_registro: () => ok(CONF),
    });
    const r = await armarFrescuraLider([TIENDA, OTRA], rpc, 120);
    expect(r.sedes[0].lectura.fallo).toBeNull();
    expect(r.sedes[1].lectura).toEqual({ datos: null, fallo: "No tienes acceso a la frescura de Tienda Otra." });
    expect(r.referenciaCayla).toEqual({ datos: null, fallo: "La referencia de CAYLA necesita todas las tiendas y falta Tienda Otra." });
    expect(r.confianza.datos).toHaveLength(CONF.length);
  });

  it("una respuesta con otra forma es un fallo de lectura, nunca una tienda vacía; la base caída, igual", async () => {
    const { rpc } = rpcDesde({
      [`fn_frescura_sede:${TIENDA.id}`]: () => ok({ ...SEDE, prendas: undefined }),
      [`fn_frescura_sede:${OTRA.id}`]: () => Promise.reject(new Error("timeout")),
      fn_confianza_registro: () => ({ data: null, error: { message: "caída" } }),
    });
    const r = await armarFrescuraLider([TIENDA, OTRA], rpc, 120);
    expect(r.sedes.map((s) => s.lectura.fallo)).toEqual([
      "No se pudo cargar la frescura de ZZ Tienda Frescura. Lo demás de esta pantalla sí está al día.",
      "No se pudo cargar la frescura de Tienda Otra. Lo demás de esta pantalla sí está al día.",
    ]);
    expect(r.confianza).toEqual({ datos: null, fallo: "No se pudo cargar el registro al colgar de las sedes. Lo demás de esta pantalla sí está al día." });
  });

  it("el Taller ({separa_piso: false}) no es un fallo y no tumba la referencia de CAYLA", async () => {
    const { rpc } = rpcDesde({
      [`fn_frescura_sede:${TIENDA.id}`]: () => ok(SEDE),
      [`fn_frescura_sede:${TALLER.id}`]: () => ok({ separa_piso: false }),
      fn_confianza_registro: () => ok(CONF),
    });
    const r = await armarFrescuraLider([TIENDA, TALLER], rpc, 120);
    expect(r.sedes[1].lectura).toEqual({ datos: { separaPiso: false }, fallo: null });
    expect(r.referenciaCayla.fallo).toBeNull();
    expect(r.referenciaCayla.datos?.length).toBeGreaterThan(0);
  });
});
