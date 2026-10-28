import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LecturaCancelada,
  MAX_PAGINAS_LECTURA,
  PLAZO_COMPLEMENTO_MS,
  PLAZO_LECTURA_MS,
  PRODUCTOS_POR_PAGINA_LECTURA,
  TAMANO_LOTE_IDS,
  TOPE_FILAS_POSTGREST,
  VIGENCIA_MEMORIA_MS,
  crearControlCandidatas,
  crearLectorDeLaBase,
  crearSenalConPlazo,
  type ClienteLectura,
} from "./candidatas-alta-lector";
import { useCandidatasAlta } from "./useCandidatasAlta";
import { LecturaParcial } from "./candidatas-alta-datos";
import { clasificarPeticion } from "./espera-reglas";
import type { CandidataAlta, LectorCandidatas } from "./parecidas-alta-tipos";

// ============================================================================
// Las tres piezas (el lector y el control, de `candidatas-alta-lector.ts`, y el hook, de `useCandidatasAlta.ts`), sin red ni
// navegador. Datos SINTÉTICOS con la forma real de cada lectura (las columnas y los nombres salen de producción, proyecto
// vovjyyiafkxteijimpuy, solo lectura, 2026-09-30); ninguno es un registro real.
// ============================================================================

const PRECIO_CENTINELA = 987.65;
const COSTO_CENTINELA = 432.1;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---- 1. Un cliente de juguete: registra cada lectura y responde con lo que el mundo de la prueba tenga ----

type Filtro = { op: string; col: string; valor: unknown };
type Llamada = { via: "rpc" | "from"; nombre: string; args?: Record<string, unknown>; seleccion: string; filtros: Filtro[] };
type Respuesta = { data: unknown; error: { message: string } | null };

class Consulta implements PromiseLike<Respuesta> {
  seleccion = "";
  filtros: Filtro[] = [];
  senal: AbortSignal | undefined;
  constructor(
    private readonly ejecutar: (c: Consulta) => Promise<Respuesta>,
    readonly via: "rpc" | "from",
    readonly nombre: string,
    readonly args?: Record<string, unknown>,
  ) {}
  select(s: string) {
    this.seleccion = s;
    return this;
  }
  in(col: string, valor: unknown[]) {
    this.filtros.push({ op: "in", col, valor });
    return this;
  }
  neq(col: string, valor: unknown) {
    this.filtros.push({ op: "neq", col, valor });
    return this;
  }
  eq(col: string, valor: unknown) {
    this.filtros.push({ op: "eq", col, valor });
    return this;
  }
  abortSignal(s: AbortSignal) {
    this.senal = s;
    return this;
  }
  then<T1 = Respuesta, T2 = never>(ok?: ((r: Respuesta) => T1 | PromiseLike<T1>) | null, ko?: ((e: unknown) => T2 | PromiseLike<T2>) | null) {
    // Como supabase-js: una petición cuya señal se aborta responde con un error (AbortError), no se queda colgada.
    const abortada = new Promise<Respuesta>((resolver) => {
      const responder = () => resolver({ data: null, error: { message: "AbortError: la petición se abortó" } });
      if (this.senal?.aborted) responder();
      else this.senal?.addEventListener("abort", responder, { once: true });
    });
    return Promise.race([
      Promise.resolve().then(() => this.ejecutar(this)),
      abortada,
    ]).then(ok, ko);
  }
}

type Fila = Record<string, unknown>;
type Mundo = {
  /**
   * Las prendas de cada marca: fn_productos las devuelve por página de `p_por_pagina`, una fila por variante. `origen` es la
   * sede que dice `fn_producto_origen`: un nombre, `null` (se registró pero no se sabe dónde) o «sin-fila» (anterior a la migración).
   */
  productos: { id: string; marcaId: string | null; categoriaId: string; referencia: string; variantes: Fila[]; ficha: Fila; stock: number; origen: string | null | "sin-fila" }[];
  fotos: Fila[];
  variantesDirectas: Fila[];
  fallan: Set<string>;
  /** PostgREST corta la respuesta de una consulta en este número de filas, sin avisar (`max_rows`). */
  topeFilas?: number;
};

const SEDES = [
  { id: uuid(901), nombre: "Tienda TRU", tipo: "tienda", activo: true },
  { id: uuid(902), nombre: "Tienda AQP", tipo: "tienda", activo: true },
  { id: uuid(903), nombre: "Tienda LIM", tipo: "tienda", activo: true },
  { id: uuid(904), nombre: "Taller", tipo: "taller", activo: true },
];
const TEMPORADAS = [
  { clave: "verano", nombre: "Verano", orden: 30, es_clasico: false, estacion_desde: "verano", estacion_hasta: "otono", mitad: "PV" },
  { clave: "clasico", nombre: "Clásico · todo el año", orden: 70, es_clasico: true, estacion_desde: null, estacion_hasta: null, mitad: null },
];

function prenda(n: number, marcaId: string | null, categoriaId: string, opciones: { foto?: string | null; variantes?: number; origen?: string | null | "sin-fila" } = {}): Mundo["productos"][number] {
  const id = uuid(1000 + n);
  const referencia = `Prenda de ejemplo ${n}`;
  const variantes = Array.from({ length: opciones.variantes ?? 2 }, (_, j) => ({
    total_productos: 0, // lo pone fn_productos
    producto_id: id,
    referencia,
    categoria_id: categoriaId,
    categoria_nombre: "Jeans",
    estado: "activo",
    marca_id: marcaId,
    marca_nombre: marcaId ? "Marca de ejemplo" : null,
    talla: String(28 + 2 * j),
    color_codigo: j % 2 === 0 ? "CEL" : "NEG",
    color_nombre: j % 2 === 0 ? "Celeste" : "Negro",
    color_hex: null,
    foto_url: opciones.foto ?? null,
    activo: true,
    // Lo que fn_productos entrega y este módulo NO puede dejar pasar:
    precio: PRECIO_CENTINELA,
    costo: COSTO_CENTINELA,
    codigos_barras: [`COD-${n}-${j}`],
    proveedor_nombre: "Proveedor de ejemplo",
  }));
  const ficha = {
    id,
    referencia,
    descripcion: `Descripción de ${n}`,
    temporada: "verano",
    created_at: `2026-09-29T1${n % 10}:00:00+00:00`,
    estado: "activo",
    estado_alta: "aprobado",
    categoria_id: categoriaId,
    marca_id: marcaId,
    categoria: { nombre: "Jeans" },
    marca: marcaId ? { nombre: "Marca de ejemplo" } : null,
    tejido: { nombre: "Denim" },
    patron: { nombre: "Liso" },
  };
  return { id, marcaId, categoriaId, referencia, variantes, ficha, stock: 3, origen: opciones.origen === undefined ? "Tienda TRU" : opciones.origen };
}

function mundoVacio(): Mundo {
  return { productos: [], fotos: [], variantesDirectas: [], fallan: new Set() };
}

/** `cliente` + el registro de todo lo que se le pidió. `fallan` apaga una lectura por nombre (`fn_productos`, `from:productos`, …). */
function crearCliente(mundo: Mundo, extra: { alResponder?: (c: Consulta) => Promise<void> } = {}) {
  const llamadas: Llamada[] = [];
  const responder = async (c: Consulta): Promise<Respuesta> => {
    const clave = c.via === "rpc" ? c.nombre : `from:${c.nombre}`;
    llamadas.push({ via: c.via, nombre: c.nombre, args: c.args, seleccion: c.seleccion, filtros: c.filtros });
    if (extra.alResponder) await extra.alResponder(c);
    const fallaN = [...mundo.fallan].find((f) => f === clave || f.startsWith(`${clave}#`));
    if (fallaN) {
      // «fn_productos#2» = falla solo desde la segunda llamada.
      const desde = Number(fallaN.split("#")[1] ?? 1);
      const cuantas = llamadas.filter((l) => (l.via === "rpc" ? l.nombre : `from:${l.nombre}`) === clave).length;
      if (cuantas >= desde) return { data: null, error: { message: `falla simulada de ${clave}` } };
    }
    const enLote = (col: string) => (c.filtros.find((f) => f.op === "in" && f.col === col)?.valor as string[] | undefined) ?? [];
    switch (clave) {
      case "fn_productos": {
        const { p_marca_id, p_categoria_id, p_pagina = 1, p_por_pagina = 24 } = c.args as { p_marca_id?: string; p_categoria_id?: string; p_pagina?: number; p_por_pagina?: number };
        const coinciden = mundo.productos.filter((p) => (p_marca_id ? p.marcaId === p_marca_id : p.categoriaId === p_categoria_id));
        const pagina = coinciden.slice((p_pagina - 1) * p_por_pagina, p_pagina * p_por_pagina);
        const filas = pagina.flatMap((p) => p.variantes.map((v) => ({ ...v, total_productos: coinciden.length })));
        return { data: mundo.topeFilas ? filas.slice(0, mundo.topeFilas) : filas, error: null };
      }
      case "from:productos": {
        const ids = enLote("id");
        const sinRechazadas = c.filtros.some((f) => f.op === "neq" && f.col === "estado_alta" && f.valor === "rechazado");
        return { data: mundo.productos.filter((p) => ids.includes(p.id) && (!sinRechazadas || p.ficha.estado_alta !== "rechazado")).map((p) => p.ficha), error: null };
      }
      case "from:variantes":
        return { data: mundo.variantesDirectas.filter((v) => enLote("producto_id").includes(v.producto_id as string)), error: null };
      case "from:producto_fotos":
        return { data: mundo.fotos.filter((f) => enLote("producto_id").includes(f.producto_id as string)), error: null };
      case "fn_existencias_productos": {
        const { p_producto_ids } = c.args as { p_producto_ids: string[] };
        return {
          data: mundo.productos
            .filter((p) => p_producto_ids.includes(p.id) && p.stock > 0)
            .map((p) => ({ producto_id: p.id, aqui: 0, apartado_aqui: 0, danado_aqui: 0, en_camino_aqui: 0, en_otras_tiendas: p.stock, en_taller: 0, otras: [{ ubicacion_id: uuid(901), sede: "Tienda TRU", disponible: p.stock }], en_tallas_retiradas: 0 })),
          error: null,
        };
      }
      case "fn_producto_origen": {
        const { p_producto_ids } = c.args as { p_producto_ids: string[] };
        return {
          data: mundo.productos
            .filter((p) => p_producto_ids.includes(p.id) && p.origen !== "sin-fila")
            .map((p) => ({ producto_id: p.id, ubicacion_id: p.origen ? uuid(901) : null, ubicacion_nombre: p.origen })),
          error: null,
        };
      }
      case "fn_temporadas":
        return { data: TEMPORADAS, error: null };
      case "from:ubicaciones":
        return { data: SEDES, error: null };
    }
    return { data: null, error: { message: `lectura inesperada: ${clave}` } };
  };
  const cliente = {
    rpc: (nombre: string, args?: Record<string, unknown>) => new Consulta(responder, "rpc", nombre, args),
    from: (tabla: string) => new Consulta(responder, "from", tabla),
  };
  return { cliente: cliente as unknown as ClienteLectura, llamadas };
}

const nombresDe = (llamadas: Llamada[]) => llamadas.map((l) => (l.via === "rpc" ? l.nombre : `from:${l.nombre}`));
const cuantas = (llamadas: Llamada[], nombre: string) => nombresDe(llamadas).filter((n) => n === nombre).length;
const senalNueva = () => new AbortController().signal;
const leerMarca = (lector: LectorCandidatas, marcaId: string | null, categoriaId: string | null = null, idsExtra: string[] = [], senal = senalNueva()) =>
  lector({ marcaId, categoriaId, idsExtra, senal });

// ============================================================================

describe("crearLectorDeLaBase — lo que lee y cuántas veces", () => {
  it("una marca de pocas prendas: fn_productos, fichas, stock y origen, más lo de contexto la primera vez", async () => {
    const mundo = mundoVacio();
    mundo.productos = [1, 2, 3].map((n) => prenda(n, "m1", "c1", { foto: "https://fotos.example/a.jpg" }));
    const { cliente, llamadas } = crearCliente(mundo);
    const lector = crearLectorDeLaBase(cliente);

    const candidatas = await leerMarca(lector, "m1", "c1");

    expect(candidatas).toHaveLength(3);
    // 6 lecturas: fn_productos · (fn_temporadas, ubicaciones: una vez por hook) · productos · fn_existencias_productos ·
    // fn_producto_origen. Sin lectura de fotos: a ninguna variante le faltaba. Y SIN `colaboradores`: la sede donde se cargó
    // sale de fn_producto_origen (un Integrante no puede leer colaboradores, y antes la tarjeta nunca decía dónde se cargó).
    expect(nombresDe(llamadas).sort()).toEqual(
      ["fn_existencias_productos", "fn_producto_origen", "fn_productos", "fn_temporadas", "from:productos", "from:ubicaciones"].sort(),
    );
    expect(llamadas).toHaveLength(6);
  });

  it("la segunda vez (otra marca, mismo hook) el contexto no se vuelve a leer: 4 lecturas", async () => {
    const mundo = mundoVacio();
    mundo.productos = [...[1, 2].map((n) => prenda(n, "m1", "c1", { foto: "x" })), ...[3, 4].map((n) => prenda(n, "m2", "c1", { foto: "x" }))];
    const { cliente, llamadas } = crearCliente(mundo);
    const lector = crearLectorDeLaBase(cliente);
    await leerMarca(lector, "m1");
    const antes = llamadas.length;
    await leerMarca(lector, "m2");
    expect(llamadas.length - antes).toBe(4);
    expect(nombresDe(llamadas.slice(antes)).sort()).toEqual(["fn_existencias_productos", "fn_producto_origen", "fn_productos", "from:productos"]);
  });

  it("con marca pide SOLO la marca (todas sus categorías); los parámetros de fn_productos van literales", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1"), prenda(2, "m1", "c2")];
    const { cliente, llamadas } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1", "c1");
    const fn = llamadas.find((l) => l.nombre === "fn_productos")!;
    expect(fn.args).toEqual({ p_marca_id: "m1", p_orden: "recientes", p_pagina: 1, p_por_pagina: PRODUCTOS_POR_PAGINA_LECTURA });
    expect(candidatas).toHaveLength(2); // la categoría no acotó: las dos categorías de la marca
  });

  it("sin marca pide la categoría (D5)", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1"), prenda(2, null, "c1"), prenda(3, "m2", "c2")];
    const { cliente, llamadas } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), null, "c1");
    expect(llamadas.find((l) => l.nombre === "fn_productos")!.args).toEqual({ p_categoria_id: "c1", p_orden: "recientes", p_pagina: 1, p_por_pagina: PRODUCTOS_POR_PAGINA_LECTURA });
    expect(candidatas.map((c) => c.referencia)).toEqual(["Prenda de ejemplo 1", "Prenda de ejemplo 2"]);
    expect(candidatas[1].marcaId).toBeNull(); // la prenda sin marca (ADR-0083) aparece, sin marca
  });

  it("el uuid nulo de «sin marca» no lista todo lo que no tiene marca: va por la categoría", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, null, "c1")];
    const { cliente, llamadas } = crearCliente(mundo);
    await leerMarca(crearLectorDeLaBase(cliente), "00000000-0000-0000-0000-000000000000", "c1");
    const args = llamadas.find((l) => l.nombre === "fn_productos")!.args!;
    expect(args).toHaveProperty("p_categoria_id", "c1");
    expect(args).not.toHaveProperty("p_marca_id");
  });

  it("sin marca ni categoría ni ids no lee nada", async () => {
    const { cliente, llamadas } = crearCliente(mundoVacio());
    expect(await leerMarca(crearLectorDeLaBase(cliente), null, null)).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });

  it("precio y costo no salen del lector (aunque fn_productos los trajo en cada fila)", async () => {
    const mundo = mundoVacio();
    mundo.productos = [1, 2, 3].map((n) => prenda(n, "m1", "c1"));
    const { cliente } = crearCliente(mundo);
    const salida = JSON.stringify(await leerMarca(crearLectorDeLaBase(cliente), "m1"));
    for (const c of [String(PRECIO_CENTINELA), String(COSTO_CENTINELA), "precio", "costo", "COD-", "Proveedor de ejemplo"]) expect(salida).not.toContain(c);
  });

  it("ninguna consulta directa pide precio ni costo (variantes.costo además la niega la base)", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1"), prenda(2, "m2", "c2")];
    mundo.variantesDirectas = [{ producto_id: uuid(1002), color_codigo: "CEL", activo: true, talla: { valor: "28" }, color: { nombre: "Celeste", hex: "#A9CADA" } }];
    const { cliente, llamadas } = crearCliente(mundo);
    await leerMarca(crearLectorDeLaBase(cliente), "m1", null, [uuid(1002)]);
    const directas = llamadas.filter((l) => l.via === "from" && ["productos", "variantes", "producto_fotos", "ubicaciones"].includes(l.nombre));
    expect(directas.length).toBeGreaterThan(0);
    for (const l of directas) {
      expect(l.seleccion).not.toMatch(/precio|costo|\*/);
      expect(l.seleccion).not.toBe("");
    }
    // Y de las fichas tampoco se pide quién las propuso: la sede donde se cargó sale de fn_producto_origen, no de una persona.
    expect(llamadas.find((l) => l.nombre === "productos")!.seleccion).not.toContain("propuesto_por");
  });

  it("stock: pide fn_existencias_productos SIN sede (p_ubicacion_id null) y arma todas las sedes, con ceros", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1")];
    const { cliente, llamadas } = crearCliente(mundo);
    const [c] = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(llamadas.find((l) => l.nombre === "fn_existencias_productos")!.args).toEqual({ p_producto_ids: [uuid(1001)], p_ubicacion_id: null });
    expect(c.disponible).toEqual({
      total: 3,
      porSede: [
        { sede: "Tienda AQP", disponible: 0 },
        { sede: "Tienda LIM", disponible: 0 },
        { sede: "Tienda TRU", disponible: 3 },
        { sede: "Taller", disponible: 0 },
      ],
    });
  });

  it("cargadaEn: la sede desde la que se operó el alta (fn_producto_origen); temporada con su nombre legible", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1")];
    const { cliente } = crearCliente(mundo);
    const [c] = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(c.cargadaEn).toBe("Tienda TRU");
    expect(c.temporada).toBe("Verano");
  });

  it("páginas: 130 prendas son 3 páginas de 50 (la 2.ª y la 3.ª juntas); nunca más de 6 (300 prendas), y lo cortado es lo más antiguo", async () => {
    const mundo = mundoVacio();
    mundo.productos = Array.from({ length: 130 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    const a = crearCliente(mundo);
    expect(await leerMarca(crearLectorDeLaBase(a.cliente), "m1")).toHaveLength(130);
    expect(a.llamadas.filter((l) => l.nombre === "fn_productos").map((l) => l.args!.p_pagina)).toEqual([1, 2, 3]);

    mundo.productos = Array.from({ length: 350 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    const b = crearCliente(mundo);
    const leidas = await leerMarca(crearLectorDeLaBase(b.cliente), "m1");
    expect(leidas).toHaveLength(MAX_PAGINAS_LECTURA * PRODUCTOS_POR_PAGINA_LECTURA);
    expect(b.llamadas.filter((l) => l.nombre === "fn_productos").map((l) => l.args!.p_pagina)).toEqual([1, 2, 3, 4, 5, 6]);
    // Lo leído son las 300 más recientes, en orden: la página 2 sigue a la 1.
    expect(leidas[0].referencia).toBe("Prenda de ejemplo 1");
    expect(leidas[299].referencia).toBe("Prenda de ejemplo 300");
  });

  it("la primera página va SOLA (de ella sale el total) y las demás salen juntas, no una tras otra", async () => {
    const mundo = mundoVacio();
    mundo.productos = Array.from({ length: 250 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    const momentos: { pagina: number; vuelo: number }[] = [];
    let enVuelo = 0;
    const { cliente } = crearCliente(mundo, {
      alResponder: async (c) => {
        if (c.nombre !== "fn_productos") return;
        momentos.push({ pagina: (c.args as { p_pagina: number }).p_pagina, vuelo: ++enVuelo });
        await new Promise((r) => setTimeout(r, 5));
        enVuelo--;
      },
    });
    expect(await leerMarca(crearLectorDeLaBase(cliente), "m1")).toHaveLength(250);
    expect(momentos.find((m) => m.pagina === 1)!.vuelo).toBe(1); // sola
    expect(Math.max(...momentos.map((m) => m.vuelo))).toBe(4); // las páginas 2 a 5, juntas
  });

  it(`PostgREST corta la respuesta en ${TOPE_FILAS_POSTGREST} filas: con 50 prendas de 16 variantes (lo más que tiene una hoy) NO se corta nada`, async () => {
    const mundo = mundoVacio();
    mundo.topeFilas = TOPE_FILAS_POSTGREST;
    mundo.productos = Array.from({ length: 50 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 16 }));
    const { cliente } = crearCliente(mundo);
    expect(await leerMarca(crearLectorDeLaBase(cliente), "m1")).toHaveLength(50); // 800 filas
  });

  it("y si una marca tiene tantas variantes por prenda que PostgREST corta la página, la lectura sale PARCIAL (antes se perdían prendas sin avisar)", async () => {
    const mundo = mundoVacio();
    mundo.topeFilas = TOPE_FILAS_POSTGREST;
    mundo.productos = Array.from({ length: 50 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 25 })); // 1.250 filas: llegan 1.000
    const { cliente } = crearCliente(mundo);
    const error = await leerMarca(crearLectorDeLaBase(cliente), "m1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    expect((error as LecturaParcial).message).toContain("faltan prendas del catálogo");
    expect((error as LecturaParcial).candidatas).toHaveLength(40); // 1.000 / 25: lo que sí llegó se muestra
  });

  it("una prenda que la página trae a medias (cortada justo en su mitad) también avisa: no se da por completa", async () => {
    const mundo = mundoVacio();
    mundo.topeFilas = 1000;
    mundo.productos = Array.from({ length: 20 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 60 })); // 1.200 filas: corta en la prenda 17
    const { cliente } = crearCliente(mundo);
    const error = await leerMarca(crearLectorDeLaBase(cliente), "m1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    expect((error as LecturaParcial).candidatas).toHaveLength(17); // 16 completas y la 17.ª a medias
  });

  it("los ids se piden por tandas de 50 (una URL con 130 uuids no cabe) y ninguno se pierde", async () => {
    const mundo = mundoVacio();
    mundo.productos = Array.from({ length: 130 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    const { cliente, llamadas } = crearCliente(mundo);
    await leerMarca(crearLectorDeLaBase(cliente), "m1");
    const tandas = llamadas.filter((l) => l.nombre === "productos").map((l) => l.filtros.find((f) => f.op === "in")!.valor as string[]);
    expect(tandas).toHaveLength(3);
    expect(Math.max(...tandas.map((t) => t.length))).toBeLessThanOrEqual(TAMANO_LOTE_IDS);
    expect(new Set(tandas.flat()).size).toBe(130);
  });

  it("fotos: solo se piden si a alguna variante le falta, y solo de esas prendas", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1", { foto: "https://fotos.example/a.jpg" }), prenda(2, "m1", "c1", { foto: null })];
    mundo.fotos = [{ producto_id: uuid(1002), url: "https://fotos.example/general.jpg", orden: 0, es_principal: true, color_codigo: null }];
    const { cliente, llamadas } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    const pedidas = llamadas.filter((l) => l.nombre === "producto_fotos");
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0].filtros[0].valor).toEqual([uuid(1002)]);
    expect(candidatas[0].fotoUrl).toBe("https://fotos.example/a.jpg");
    expect(candidatas[1].fotoUrl).toBe("https://fotos.example/general.jpg"); // la general de respaldo

    const todas = crearCliente({ ...mundo, productos: [prenda(1, "m1", "c1", { foto: "x" })] });
    await leerMarca(crearLectorDeLaBase(todas.cliente), "m1");
    expect(cuantas(todas.llamadas, "from:producto_fotos")).toBe(0);
  });

  it("si la lectura de fotos falla, la lista sale (parcial) pero AVISA: «sin foto» no es lo mismo que «no se pudo leer»", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1")];
    mundo.fallan.add("from:producto_fotos");
    const { cliente } = crearCliente(mundo);
    const error = await leerMarca(crearLectorDeLaBase(cliente), "m1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    expect((error as LecturaParcial).message).toContain("fotos");
    const c = (error as LecturaParcial).candidatas;
    expect(c).toHaveLength(1); // lo demás se ve
    expect(c[0].fotoUrl).toBeNull();
  });

  it("y si las fotos NO hizo falta pedirlas (todas las variantes traen la suya), no hay nada que avisar aunque esa lectura fallara", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1", { foto: "https://fotos.example/a.jpg" })];
    mundo.fallan.add("from:producto_fotos");
    const { cliente } = crearCliente(mundo);
    const [c] = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(c.fotoUrl).toBe("https://fotos.example/a.jpg");
  });
});

describe("crearLectorDeLaBase — cuando algo falla no se pierde lo que sí se leyó", () => {
  const dosPrendas = () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1", { foto: "x" }), prenda(2, "m1", "c1", { foto: "x" })];
    return mundo;
  };

  it("la primera página de fn_productos falla: la lectura falla (no hay nada que mostrar)", async () => {
    const mundo = dosPrendas();
    mundo.fallan.add("fn_productos");
    const { cliente } = crearCliente(mundo);
    await expect(leerMarca(crearLectorDeLaBase(cliente), "m1")).rejects.toThrow(/falla simulada/);
  });

  it("las páginas siguientes fallan: LecturaParcial con las 50 de la primera", async () => {
    const mundo = mundoVacio();
    mundo.productos = Array.from({ length: 130 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    mundo.fallan.add("fn_productos#2");
    const { cliente } = crearCliente(mundo);
    const error = await leerMarca(crearLectorDeLaBase(cliente), "m1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    expect((error as LecturaParcial).candidatas).toHaveLength(50);
  });

  it("una sola página intermedia falla: lo de las demás se queda (2 de 3 páginas = 80 prendas) y se avisa", async () => {
    const mundo = mundoVacio();
    mundo.productos = Array.from({ length: 130 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    const { cliente } = crearCliente(mundo, {
      alResponder: async (c) => {
        if (c.nombre === "fn_productos" && (c.args as { p_pagina: number }).p_pagina === 2) throw new Error("se cayó la página 2");
      },
    });
    const error = await leerMarca(crearLectorDeLaBase(cliente), "m1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    const c = (error as LecturaParcial).candidatas;
    expect(c).toHaveLength(80); // 50 de la página 1 + 30 de la 3
    expect(c.map((x) => x.referencia)).toContain("Prenda de ejemplo 101");
    expect(c.map((x) => x.referencia)).not.toContain("Prenda de ejemplo 60");
  });

  it("las fichas (productos) fallan: LecturaParcial con la lista armada solo con fn_productos", async () => {
    const mundo = dosPrendas();
    mundo.fallan.add("from:productos");
    const { cliente } = crearCliente(mundo);
    const error = await leerMarca(crearLectorDeLaBase(cliente), "m1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    const c = (error as LecturaParcial).candidatas;
    expect(c).toHaveLength(2);
    // La sede donde se cargó no sale de las fichas: sigue sabiéndose aunque las fichas fallen.
    expect(c[0]).toMatchObject({ referencia: "Prenda de ejemplo 1", marca: "Marca de ejemplo", descripcion: null, tejido: null, cargadaEn: "Tienda TRU" });
    expect(c[0].colores.length).toBeGreaterThan(0); // lo de las variantes sí está
  });

  it("el stock falla: NO es un fallo de la lista; disponible queda en null, sin ceros inventados", async () => {
    const mundo = dosPrendas();
    mundo.fallan.add("fn_existencias_productos");
    const { cliente } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(candidatas).toHaveLength(2);
    expect(candidatas.every((c) => c.disponible === null)).toBe(true);
  });

  it("una cuenta que NO puede leer colaboradores (un Integrante) igual ve «Cargada en Tienda TRU»: el dato sale de fn_producto_origen", async () => {
    const mundo = dosPrendas(); // el mundo de la prueba ni siquiera sabe responder a `colaboradores`: si se pidiera, daría error
    const { cliente, llamadas } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(candidatas.every((c) => c.cargadaEn === "Tienda TRU")).toBe(true);
    expect(cuantas(llamadas, "from:colaboradores")).toBe(0);
    expect(cuantas(llamadas, "fn_producto_origen")).toBe(1);
    expect(llamadas.find((l) => l.nombre === "fn_producto_origen")!.args).toEqual({ p_producto_ids: [uuid(1001), uuid(1002)] });
  });

  it("una prenda anterior a la migración (sin fila) o con fila sin sede: cargadaEn null; las demás siguen sabiéndose", async () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1", { foto: "x", origen: "Tienda AQP" }), prenda(2, "m1", "c1", { foto: "x", origen: "sin-fila" }), prenda(3, "m1", "c1", { foto: "x", origen: null })];
    const { cliente } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(candidatas.map((c) => c.cargadaEn)).toEqual(["Tienda AQP", null, null]);
  });

  it("fn_producto_origen falla: cargadaEn null, sin fallo (es un extra), y la lista sale completa", async () => {
    const mundo = dosPrendas();
    mundo.fallan.add("fn_producto_origen");
    const { cliente } = crearCliente(mundo);
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(candidatas).toHaveLength(2);
    expect(candidatas.every((c) => c.cargadaEn === null)).toBe(true);
  });

  it("temporadas falla: el nombre sale legible igual, y se vuelve a intentar", async () => {
    const mundo = dosPrendas();
    mundo.fallan.add("fn_temporadas");
    const { cliente } = crearCliente(mundo);
    const lector = crearLectorDeLaBase(cliente);
    expect((await leerMarca(lector, "m1"))[0].temporada).toBe("Verano");
    mundo.fallan.delete("fn_temporadas");
    expect((await leerMarca(lector, "m1"))[0].temporada).toBe("Verano");
  });

  it("la lista de sedes falla: el stock lista solo las sedes con algo, y el total cuadra igual", async () => {
    const mundo = dosPrendas();
    mundo.fallan.add("from:ubicaciones");
    const { cliente } = crearCliente(mundo);
    const [c] = await leerMarca(crearLectorDeLaBase(cliente), "m1");
    expect(c.disponible).toEqual({ total: 3, porSede: [{ sede: "Tienda TRU", disponible: 3 }] });
  });

  it("una prenda rechazada no se ofrece", async () => {
    const mundo = dosPrendas();
    mundo.productos[1].ficha.estado_alta = "rechazado";
    const { cliente } = crearCliente(mundo);
    expect((await leerMarca(crearLectorDeLaBase(cliente), "m1")).map((c) => c.referencia)).toEqual(["Prenda de ejemplo 1"]);
  });

  it("una señal ya cancelada detiene la lectura: no sigue pidiendo", async () => {
    const control = new AbortController();
    const mundo = dosPrendas();
    const { cliente, llamadas } = crearCliente(mundo, { alResponder: async (c) => { if (c.nombre === "fn_productos") control.abort(); } });
    await expect(leerMarca(crearLectorDeLaBase(cliente), "m1", null, [], control.signal)).rejects.toBeInstanceOf(LecturaCancelada);
    expect(cuantas(llamadas, "from:productos")).toBe(0);
  });
});

describe("crearLectorDeLaBase — lo que COMPLEMENTA y se cuelga no tumba la lista (un plazo por lectura)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const clave = (c: Consulta) => (c.via === "rpc" ? c.nombre : `from:${c.nombre}`);
  /** Una lectura que NO responde nunca (la base no contesta): solo la señal abortada la saca de ahí. */
  const colgar = (esta: (c: Consulta) => boolean) => async (c: Consulta) => {
    if (esta(c)) await new Promise<void>(() => {});
  };
  const armar = (mundo: Mundo, cuelga: (c: Consulta) => boolean) => {
    const { cliente, llamadas } = crearCliente(mundo, { alResponder: colgar(cuelga) });
    const control = crearControlCandidatas({ crearLector: () => crearLectorDeLaBase(cliente) });
    return { control, llamadas };
  };
  const tresPrendas = (foto: string | null = "https://fotos.example/a.jpg") => {
    const mundo = mundoVacio();
    mundo.productos = [1, 2, 3].map((n) => prenda(n, "m1", "c1", { foto }));
    return mundo;
  };
  /** Avanza el reloj hasta el tope de un complemento (y un poco más) y deja correr lo que quedó pendiente. */
  const hastaElTope = async () => {
    await vi.advanceTimersByTimeAsync(PLAZO_COMPLEMENTO_MS - 1);
  };
  const pasoElTope = async () => {
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
  };

  it("una lectura de CONTEXTO colgada (la lista de temporadas) no deja la lista en «no pude ver»: sale a los 2,5 s, no a los 6 s", async () => {
    // Antes: una sola lectura opcional colgada hacía vencer el plazo del control (6 s) y la pantalla quedaba con fallo = true
    // y cero candidatas aunque fn_productos, las fichas y el stock ya hubieran llegado.
    const { control } = armar(tresPrendas(), (c) => clave(c) === "fn_temporadas");
    control.sincronizar(peticion("m1"));
    await hastaElTope();
    expect(control.instantanea()).toMatchObject({ cargando: true, fallo: false }); // espera, pero acotado
    await pasoElTope();
    const s = control.instantanea();
    expect(s).toMatchObject({ cargando: false, fallo: false });
    expect(s.candidatas).toHaveLength(3);
    expect(s.candidatas[0].temporada).toBe("Verano"); // sin la lista de temporadas se humaniza la clave: legible igual
    expect(vi.getTimerCount()).toBe(0); // ni el plazo del control ni los de cada lectura quedaron vivos
  });

  it("la lista de sedes colgada: el stock lista solo las sedes con algo, y la lista sale igual", async () => {
    const { control } = armar(tresPrendas(), (c) => clave(c) === "from:ubicaciones");
    control.sincronizar(peticion("m1"));
    await vi.advanceTimersByTimeAsync(PLAZO_COMPLEMENTO_MS);
    const s = control.instantanea();
    expect(s).toMatchObject({ cargando: false, fallo: false });
    expect(s.candidatas[0].disponible).toEqual({ total: 3, porSede: [{ sede: "Tienda TRU", disponible: 3 }] });
  });

  it("el STOCK colgado: disponible = null («Stock sin leer»), sin ceros inventados y sin fallo", async () => {
    const { control } = armar(tresPrendas(), (c) => clave(c) === "fn_existencias_productos");
    control.sincronizar(peticion("m1"));
    await vi.advanceTimersByTimeAsync(PLAZO_COMPLEMENTO_MS);
    const s = control.instantanea();
    expect(s).toMatchObject({ cargando: false, fallo: false });
    expect(s.candidatas.map((c) => c.disponible)).toEqual([null, null, null]);
  });

  it("la sede de ORIGEN colgada: cargadaEn = null y sin fallo", async () => {
    const { control } = armar(tresPrendas(), (c) => clave(c) === "fn_producto_origen");
    control.sincronizar(peticion("m1"));
    await vi.advanceTimersByTimeAsync(PLAZO_COMPLEMENTO_MS);
    const s = control.instantanea();
    expect(s).toMatchObject({ cargando: false, fallo: false });
    expect(s.candidatas.map((c) => c.cargadaEn)).toEqual([null, null, null]);
  });

  it("las FOTOS colgadas: se ve todo lo demás, y se AVISA (fallo) en vez de decir «sin foto todavía»", async () => {
    const { control } = armar(tresPrendas(null), (c) => clave(c) === "from:producto_fotos");
    control.sincronizar(peticion("m1"));
    await vi.advanceTimersByTimeAsync(PLAZO_COMPLEMENTO_MS);
    const s = control.instantanea();
    expect(s).toMatchObject({ cargando: false, fallo: true });
    expect(s.candidatas).toHaveLength(3);
    expect(s.candidatas[0].colores.length).toBeGreaterThan(0);
  });

  it("una PÁGINA de fn_productos colgada: fallo = true Y las prendas de las otras páginas (antes se perdía todo lo leído)", async () => {
    const mundo = mundoVacio();
    mundo.productos = Array.from({ length: 130 }, (_, i) => prenda(i + 1, "m1", "c1", { foto: "x", variantes: 1 }));
    const { control } = armar(mundo, (c) => clave(c) === "fn_productos" && (c.args as { p_pagina: number }).p_pagina === 2);
    control.sincronizar(peticion("m1"));
    await vi.advanceTimersByTimeAsync(PLAZO_COMPLEMENTO_MS);
    const s = control.instantanea();
    expect(s).toMatchObject({ cargando: false, fallo: true });
    expect(s.candidatas).toHaveLength(80); // la página 1 (50) y la 3 (30)
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lo ESENCIAL colgado (las fichas) sí agota el plazo de la lectura entera: fallo = true y nada que mostrar (límite conocido)", async () => {
    const { control } = armar(tresPrendas(), (c) => clave(c) === "from:productos");
    control.sincronizar(peticion("m1"));
    await vi.advanceTimersByTimeAsync(PLAZO_LECTURA_MS - 1);
    expect(control.instantanea()).toMatchObject({ cargando: true, fallo: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(control.instantanea()).toMatchObject({ cargando: false, fallo: true, candidatas: [] });
  });

  it("cada tope es más corto que el plazo de la lectura: dos rondas de complementos caben dentro de él", () => {
    expect(PLAZO_COMPLEMENTO_MS * 2).toBeLessThan(PLAZO_LECTURA_MS);
  });
});

describe("crearSenalConPlazo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("se aborta sola a los ms pedidos, y `limpiar` la deja sin temporizador", async () => {
    const a = crearSenalConPlazo(1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(a.senal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(a.senal.aborted).toBe(true);
    const b = crearSenalConPlazo(1000);
    b.limpiar();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("con padre: se aborta con él (la lectura cancelada arrastra a sus complementos) y `limpiar` suelta al padre", async () => {
    const padre = new AbortController();
    const hija = crearSenalConPlazo(1000, padre.signal);
    expect(hija.senal.aborted).toBe(false);
    padre.abort();
    expect(hija.senal.aborted).toBe(true);
    hija.limpiar();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("con padre ya abortado nace abortada; y con su propio plazo no aborta al padre", async () => {
    const abortado = new AbortController();
    abortado.abort();
    expect(crearSenalConPlazo(1000, abortado.signal).senal.aborted).toBe(true);
    const padre = new AbortController();
    const hija = crearSenalConPlazo(500, padre.signal);
    await vi.advanceTimersByTimeAsync(500);
    expect(hija.senal.aborted).toBe(true);
    expect(padre.signal.aborted).toBe(false);
  });
});

describe("crearLectorDeLaBase — prendas de otra marca (idsExtra)", () => {
  const conAjena = () => {
    const mundo = mundoVacio();
    mundo.productos = [prenda(1, "m1", "c1", { foto: "x" }), prenda(2, "m1", "c1", { foto: "x" }), prenda(9, "m2", "c2")];
    mundo.variantesDirectas = [
      { producto_id: uuid(1009), color_codigo: "CEL", activo: true, talla: { valor: "30" }, color: { nombre: "Celeste", hex: "#A9CADA" } },
      { producto_id: uuid(1009), color_codigo: "NEG", activo: true, talla: { valor: "28" }, color: { nombre: "Negro", hex: null } },
    ];
    mundo.fotos = [{ producto_id: uuid(1009), url: "https://fotos.example/ajena.jpg", orden: 0, es_principal: true, color_codigo: null }];
    return mundo;
  };

  it("se cargan con foto, colores, tallas, su propia marca y su categoría", async () => {
    const { cliente, llamadas } = crearCliente(conAjena());
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1", "c1", [uuid(1009)]);
    expect(candidatas.map((c) => c.referencia)).toEqual(["Prenda de ejemplo 1", "Prenda de ejemplo 2", "Prenda de ejemplo 9"]);
    const ajena = candidatas[2];
    expect(ajena).toMatchObject({ marcaId: "m2", categoriaId: "c2", fotoUrl: "https://fotos.example/ajena.jpg", tallas: ["28", "30"] });
    expect(ajena.colores.map((c) => c.nombre)).toEqual(["Celeste", "Negro"]);
    expect(ajena.disponible?.total).toBe(3);
    expect(cuantas(llamadas, "from:variantes")).toBe(1);
    // Las fichas y el stock se piden UNA vez para todas (las de la marca y la ajena juntas).
    expect(cuantas(llamadas, "from:productos")).toBe(1);
    expect(cuantas(llamadas, "fn_existencias_productos")).toBe(1);
  });

  it("un id que ya viene en la lista de la marca no se pide dos veces", async () => {
    const { cliente, llamadas } = crearCliente(conAjena());
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), "m1", "c1", [uuid(1001)]);
    expect(candidatas).toHaveLength(2);
    expect(cuantas(llamadas, "from:variantes")).toBe(0);
  });

  it("sin marca ni categoría, lee SOLO los ids extra (no hay lista que pedir)", async () => {
    const { cliente, llamadas } = crearCliente(conAjena());
    const candidatas = await leerMarca(crearLectorDeLaBase(cliente), null, null, [uuid(1009)]);
    expect(candidatas.map((c) => c.referencia)).toEqual(["Prenda de ejemplo 9"]);
    expect(cuantas(llamadas, "fn_productos")).toBe(0);
  });

  it("si las variantes de la otra marca no se pueden leer: LecturaParcial, y la prenda sale sin colores ni tallas", async () => {
    const mundo = conAjena();
    mundo.fallan.add("from:variantes");
    const { cliente } = crearCliente(mundo);
    const error = await leerMarca(crearLectorDeLaBase(cliente), null, null, [uuid(1009)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LecturaParcial);
    expect((error as LecturaParcial).candidatas[0]).toMatchObject({ referencia: "Prenda de ejemplo 9", colores: [], tallas: [] });
  });
});

describe("el loader global no se entera de estas lecturas (ADR-0149)", () => {
  it("ninguna de las lecturas del lector abre el loader: son GET o RPC fn_* de solo lectura", () => {
    const origen = "https://erp.cayla.example";
    const hostSupabase = "proyecto.supabase.co";
    const peticion = (metodo: string, ruta: string) => ({
      url: new URL(`https://${hostSupabase}${ruta}`),
      metodo,
      cabecera: () => null,
      origen,
      hostSupabase,
    });
    const rutas: [string, string][] = [
      ["POST", "/rest/v1/rpc/fn_productos"],
      ["POST", "/rest/v1/rpc/fn_existencias_productos"],
      ["POST", "/rest/v1/rpc/fn_temporadas"],
      ["POST", "/rest/v1/rpc/fn_producto_origen"],
      ["GET", "/rest/v1/productos?select=id&id=in.(a,b)"],
      ["GET", "/rest/v1/variantes?select=producto_id"],
      ["GET", "/rest/v1/producto_fotos?select=url"],
      ["GET", "/rest/v1/ubicaciones?select=id"],
    ];
    for (const [metodo, ruta] of rutas) expect(clasificarPeticion(peticion(metodo, ruta))).toBeNull();
  });

  it("y las RPC que el código llama sí están en la lista de lectura: si una se renombrara, este aviso salta", () => {
    const fuente = readFileSync(new URL("./candidatas-alta-lector.ts", import.meta.url), "utf8");
    const rpcs = [...fuente.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(rpcs)).toEqual(new Set(["fn_productos", "fn_existencias_productos", "fn_temporadas", "fn_producto_origen"]));
    // Todas llevan el prefijo de lectura (`fn_`): el loader global (`espera-reglas.ts`) no las toma por un guardado.
    for (const r of rpcs) expect(r).toMatch(/^fn_/);
  });
});

// ============================================================================
// 2. El control: la carrera, el plazo y la memoria
// ============================================================================

type Diferida<T> = { promesa: Promise<T>; resolver: (v: T) => void; rechazar: (e: unknown) => void };
const diferida = <T,>(): Diferida<T> => {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
};

const cand = (id: string, extra: Partial<CandidataAlta> = {}): CandidataAlta => ({
  id,
  referencia: `Prenda ${id}`,
  categoriaId: "c1",
  categoria: "Jeans",
  marcaId: "m1",
  marca: "Marca",
  estado: "activo",
  descripcion: null,
  tejido: null,
  patron: null,
  temporada: null,
  creadoEn: null,
  fotoUrl: null,
  colores: [],
  tallas: [],
  disponible: null,
  cargadaEn: null,
  ...extra,
});

/** Un lector de juguete: cada llamada queda pendiente hasta que la prueba la resuelva. */
function lectorManual() {
  const llamadas: { p: Parameters<LectorCandidatas>[0]; d: Diferida<CandidataAlta[]> }[] = [];
  const leer: LectorCandidatas = (p) => {
    const d = diferida<CandidataAlta[]>();
    llamadas.push({ p, d });
    return d.promesa;
  };
  return { leer, llamadas };
}

const vaciar = () => vi.advanceTimersByTimeAsync(0);
const peticion = (marcaId: string | null, categoriaId: string | null = null, idsExtra: string[] = [], activo = true) => ({ marcaId, categoriaId, idsExtra, activo });

describe("crearControlCandidatas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no lee nada si no está activo, o si no hay ni marca ni categoría", async () => {
    const { leer, llamadas } = lectorManual();
    const control = crearControlCandidatas({ leer });
    control.sincronizar(peticion("m1", "c1", [], false));
    control.sincronizar(peticion(null, null));
    control.sincronizar(peticion("", ""));
    await vaciar();
    expect(llamadas).toHaveLength(0);
    expect(control.instantanea()).toMatchObject({ candidatas: [], cargando: false, fallo: false });
  });

  it("al elegir marca lee una vez (con marca y sin extras) y queda «cargando» hasta que llega", async () => {
    const { leer, llamadas } = lectorManual();
    const control = crearControlCandidatas({ leer });
    control.sincronizar(peticion("m1", "c1"));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].p).toMatchObject({ marcaId: "m1", categoriaId: null, idsExtra: [] });
    expect(control.instantanea()).toMatchObject({ cargando: true, candidatas: [] });
    llamadas[0].d.resolver([cand("a")]);
    await vaciar();
    expect(control.instantanea()).toMatchObject({ cargando: false, fallo: false });
    expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
  });

  it("sincronizar lo mismo dos veces mientras vuela no lanza otra lectura", () => {
    const { leer, llamadas } = lectorManual();
    const control = crearControlCandidatas({ leer });
    control.sincronizar(peticion("m1", "c1"));
    control.sincronizar(peticion("m1", "c1"));
    control.sincronizar(peticion("m1", "c2")); // otra categoría de la MISMA marca: es la misma lectura
    expect(llamadas).toHaveLength(1);
  });

  it("sin marca lee la categoría", () => {
    const { leer, llamadas } = lectorManual();
    crearControlCandidatas({ leer }).sincronizar(peticion(null, "c1"));
    expect(llamadas[0].p).toMatchObject({ marcaId: null, categoriaId: "c1" });
  });

  it("el uuid nulo de «sin marca» lee la categoría", () => {
    const { leer, llamadas } = lectorManual();
    crearControlCandidatas({ leer }).sincronizar(peticion("00000000-0000-0000-0000-000000000000", "c1"));
    expect(llamadas[0].p).toMatchObject({ marcaId: null, categoriaId: "c1" });
  });

  describe("la carrera: lo de una marca anterior NUNCA pisa a la vigente", () => {
    it("llega primero la vigente y después la vieja: se queda la vigente", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      control.sincronizar(peticion("m2"));
      llamadas[1].d.resolver([cand("de-m2")]);
      await vaciar();
      llamadas[0].d.resolver([cand("de-m1")]);
      await vaciar();
      const s = control.instantanea();
      expect(s.clave).toBe("marca:m2");
      expect(s.candidatas.map((c) => c.id)).toEqual(["de-m2"]);
      expect(s.cargando).toBe(false);
    });

    it("llega primero la vieja y después la vigente: lo de la vieja no se ve nunca", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      const vistos: string[][] = [];
      control.suscribir(() => vistos.push(control.instantanea().candidatas.map((c) => c.id)));
      control.sincronizar(peticion("m1"));
      control.sincronizar(peticion("m2"));
      llamadas[0].d.resolver([cand("de-m1")]);
      await vaciar();
      expect(control.instantanea()).toMatchObject({ clave: "marca:m2", cargando: true, candidatas: [] });
      llamadas[1].d.resolver([cand("de-m2")]);
      await vaciar();
      expect(vistos.flat()).not.toContain("de-m1");
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["de-m2"]);
    });

    it("llega en el MISMO instante en que se cambia de marca (antes de que corran las continuaciones): tampoco pisa", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("de-m1")]); // ya resuelta...
      control.sincronizar(peticion("m2")); // ...pero la persona cambia de marca antes de que se entregue
      await vaciar();
      expect(control.instantanea()).toMatchObject({ clave: "marca:m2", cargando: true, candidatas: [] });
      llamadas[1].d.resolver([cand("de-m2")]);
      await vaciar();
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["de-m2"]);
    });

    it("un fallo tardío de la marca anterior tampoco pisa a la vigente", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      control.sincronizar(peticion("m2"));
      llamadas[1].d.resolver([cand("de-m2")]);
      await vaciar();
      llamadas[0].d.rechazar(new Error("se cayó"));
      await vaciar();
      expect(control.instantanea()).toMatchObject({ fallo: false, candidatas: [expect.objectContaining({ id: "de-m2" })] });
    });

    it("al cambiar de marca se cancela la lectura anterior (su señal se aborta)", () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      expect(llamadas[0].p.senal.aborted).toBe(false);
      control.sincronizar(peticion("m2"));
      expect(llamadas[0].p.senal.aborted).toBe(true);
      expect(llamadas[1].p.senal.aborted).toBe(false);
    });

    it("al apagar (activo = false) se cancela lo que vuela y nada llega después", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      control.sincronizar(peticion("m1", null, [], false));
      expect(llamadas[0].p.senal.aborted).toBe(true);
      llamadas[0].d.resolver([cand("tarde")]);
      await vaciar();
      expect(control.instantanea()).toMatchObject({ candidatas: [], cargando: false, clave: "" });
    });
  });

  describe("memoria por marca (o categoría)", () => {
    it("al volver atrás no relee: lo de la marca ya leída está al instante", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.sincronizar(peticion("m2"));
      llamadas[1].d.resolver([cand("b")]);
      await vaciar();
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(2); // no hubo tercera lectura
      expect(control.instantanea()).toMatchObject({ clave: "marca:m1", cargando: false });
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
    });

    it("cambiar de categoría dentro de la misma marca no relee (con marca se lee toda la marca)", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1", "c1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.sincronizar(peticion("m1", "c2"));
      expect(llamadas).toHaveLength(1);
    });

    it("lo guardado vence a los 3 minutos: pasado ese tiempo, al volver se relee", async () => {
      let t = 1_000_000;
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer, ahora: () => t });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.sincronizar(peticion("m2"));
      llamadas[1].d.resolver([cand("b")]);
      await vaciar();
      t += VIGENCIA_MEMORIA_MS - 1;
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(2); // aún vale
      control.sincronizar(peticion("m2"));
      t += VIGENCIA_MEMORIA_MS;
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(3); // venció: relee
    });

    it("una lectura fallida NO se guarda: al volver atrás se vuelve a intentar", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.rechazar(new Error("sin red"));
      await vaciar();
      control.sincronizar(peticion("m2"));
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(3);
    });

    it("una lectura parcial tampoco se guarda", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.rechazar(new LecturaParcial([cand("a")], "faltó el detalle"));
      await vaciar();
      control.sincronizar(peticion("m2"));
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(3);
    });
  });

  describe("fallo, plazo y reintentar", () => {
    it("si la lectura falla: fallo = true, sin candidatas inventadas, y deja de cargar", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.rechazar(new Error("se cayó"));
      await vaciar();
      expect(control.instantanea()).toMatchObject({ fallo: true, cargando: false, candidatas: [] });
    });

    it("si falla a medias: fallo = true Y las candidatas que sí se pudieron leer (degrada sin perder datos)", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.rechazar(new LecturaParcial([cand("a"), cand("b")], "faltó el detalle"));
      await vaciar();
      const s = control.instantanea();
      expect(s.fallo).toBe(true);
      expect(s.cargando).toBe(false);
      expect(s.candidatas.map((c) => c.id)).toEqual(["a", "b"]);
    });

    it("reintentar() vuelve a leer, limpia el fallo al llegar y muestra mientras tanto lo que había", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.rechazar(new LecturaParcial([cand("a")], "a medias"));
      await vaciar();
      control.reintentar();
      expect(llamadas).toHaveLength(2);
      expect(control.instantanea()).toMatchObject({ cargando: true, fallo: false });
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]); // no parpadea a vacío
      llamadas[1].d.resolver([cand("a"), cand("b")]);
      await vaciar();
      expect(control.instantanea()).toMatchObject({ cargando: false, fallo: false });
      expect(control.instantanea().candidatas).toHaveLength(2);
    });

    it("reintentar() ignora la memoria: relee aunque lo guardado estuviera vigente", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.reintentar();
      expect(llamadas).toHaveLength(2);
    });

    it("si el reintento también falla, lo viejo no queda guardado como vigente: al volver atrás se relee", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.reintentar();
      llamadas[1].d.rechazar(new Error("sin red"));
      await vaciar();
      control.sincronizar(peticion("m2"));
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(4); // m2 y otra vez m1: la memoria de m1 ya no valía
    });

    it("reintentar() sin nada elegido no hace nada", () => {
      const { leer, llamadas } = lectorManual();
      crearControlCandidatas({ leer }).reintentar();
      expect(llamadas).toHaveLength(0);
    });

    it(`vence a los ${PLAZO_LECTURA_MS} ms aunque el lector ignore la señal: fallo = true y deja de cargar`, async () => {
      const { leer, llamadas } = lectorManual(); // nunca resuelve
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      await vi.advanceTimersByTimeAsync(PLAZO_LECTURA_MS - 1);
      expect(control.instantanea()).toMatchObject({ cargando: true, fallo: false });
      await vi.advanceTimersByTimeAsync(1);
      expect(control.instantanea()).toMatchObject({ cargando: false, fallo: true });
      expect(llamadas[0].p.senal.aborted).toBe(true);
    });

    it("una lectura que llega ANTES del plazo no deja un temporizador vivo que la tumbe después", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      await vi.advanceTimersByTimeAsync(PLAZO_LECTURA_MS * 3);
      expect(control.instantanea()).toMatchObject({ fallo: false, cargando: false });
      expect(llamadas[0].p.senal.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("el plazo no usa AbortSignal.timeout (no existe en el Safari viejo de las tablets): funciona sin él", async () => {
      const original = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
      Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
      try {
        const { leer, llamadas } = lectorManual();
        const control = crearControlCandidatas({ leer });
        control.sincronizar(peticion("m1"));
        await vi.advanceTimersByTimeAsync(PLAZO_LECTURA_MS);
        expect(control.instantanea().fallo).toBe(true);
        expect(llamadas[0].p.senal.aborted).toBe(true);
        const { senal, limpiar } = crearSenalConPlazo(1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(senal.aborted).toBe(true);
        limpiar();
      } finally {
        if (original) Object.defineProperty(AbortSignal, "timeout", original);
        else delete (AbortSignal as unknown as Record<string, unknown>).timeout;
      }
    });

    it("el código fuente tampoco lo llama (quien lo reintroduzca rompe la tablet sin que nada avise)", () => {
      const fuente = readFileSync(new URL("./candidatas-alta-lector.ts", import.meta.url), "utf8");
      const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(sinComentarios).not.toMatch(/AbortSignal\.(timeout|any)/);
    });

    it("un lector que lanza de inmediato (síncrono) es un fallo, no un error sin atender", async () => {
      const leer: LectorCandidatas = () => {
        throw new Error("explotó al armar la petición");
      };
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      await vaciar();
      expect(control.instantanea()).toMatchObject({ fallo: true, cargando: false });
    });
  });

  describe("prendas de otra marca (idsExtra)", () => {
    it("esperan a la lista, no piden lo que ya vino en ella, y se suman a las candidatas", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1", "c1", ["a", "x"]));
      expect(llamadas).toHaveLength(1); // solo la lista: los extras esperan
      llamadas[0].d.resolver([cand("a"), cand("b")]);
      await vaciar();
      expect(llamadas).toHaveLength(2);
      expect(llamadas[1].p).toMatchObject({ marcaId: null, categoriaId: null, idsExtra: ["x"] }); // «a» ya venía en la lista
      llamadas[1].d.resolver([cand("x", { marcaId: "m9", marca: "Otra" })]);
      await vaciar();
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a", "b", "x"]);
      expect(control.instantanea()).toMatchObject({ cargando: false, fallo: false });
    });

    it("un id nuevo pide solo ese; los ya leídos (y los que la base no tiene) no se vuelven a pedir", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[1].d.resolver([cand("x")]);
      await vaciar();
      control.sincronizar(peticion("m1", null, ["x", "y"]));
      expect(llamadas[2].p.idsExtra).toEqual(["y"]);
      llamadas[2].d.resolver([]); // la base no la tiene (o no se ve)
      await vaciar();
      control.sincronizar(peticion("m1", null, ["x", "y"]));
      control.sincronizar(peticion("m1", null, ["y"]));
      expect(llamadas).toHaveLength(3);
      // Solo se muestran los extras que la comprobación marca AHORA.
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
    });

    it("los extras VENCEN como la lista (3 min): pasado ese tiempo se releen, y mientras llega lo nuevo se sigue viendo lo viejo", async () => {
      let t = 1_000_000;
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer, ahora: () => t });
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      llamadas[1].d.resolver([cand("x", { disponible: { total: 5, porSede: [] } })]);
      await vaciar();
      t += VIGENCIA_MEMORIA_MS - 1;
      control.sincronizar(peticion("m1", null, ["x"])); // aún vale: no se vuelve a pedir
      expect(llamadas).toHaveLength(2);
      t += 2;
      control.sincronizar(peticion("m1", null, ["x"])); // venció: se relee (su stock pudo cambiar)
      expect(llamadas).toHaveLength(3);
      expect(llamadas[2].p.idsExtra).toEqual(["x"]);
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a", "x"]); // lo viejo sigue a la vista
      llamadas[2].d.resolver([cand("x", { disponible: { total: 1, porSede: [] } })]);
      await vaciar();
      expect(control.instantanea().candidatas.find((c) => c.id === "x")!.disponible!.total).toBe(1);
    });

    it("un extra que la base ya no tiene también se vuelve a preguntar al vencer, y deja de mostrarse", async () => {
      let t = 1_000_000;
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer, ahora: () => t });
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      llamadas[1].d.resolver([cand("x")]);
      await vaciar();
      t += VIGENCIA_MEMORIA_MS + 1;
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[2].d.resolver([]); // ya no está (la rechazaron)
      await vaciar();
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
    });

    it("reintentar() NO vacía los extras (no parpadean): se siguen viendo mientras se releen", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      llamadas[1].d.resolver([cand("x", { disponible: { total: 5, porSede: [] } })]);
      await vaciar();
      control.reintentar();
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a", "x"]); // sin parpadeo a vacío
      llamadas[2].d.resolver([cand("a")]); // la lista vuelta a leer...
      await vaciar();
      expect(llamadas).toHaveLength(4); // ...y el extra, releído aunque su lectura anterior siguiera vigente
      expect(llamadas[3].p.idsExtra).toEqual(["x"]);
      llamadas[3].d.resolver([cand("x", { disponible: { total: 2, porSede: [] } })]);
      await vaciar();
      expect(control.instantanea().candidatas.find((c) => c.id === "x")!.disponible!.total).toBe(2);
    });

    it("mostrar un extra no prende «cargando» (cada tecla parpadearía): solo la lista lo hace", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.sincronizar(peticion("m1", null, ["x"]));
      expect(control.instantanea().cargando).toBe(false);
    });

    it("los extras que siguen cargando al cambiar de marca no se pierden: se guardan por id", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      llamadas[1].d.resolver([cand("x", { marcaId: "m9" })]);
      await vaciar();
      control.sincronizar(peticion("m2", null, ["x"]));
      llamadas[2].d.resolver([cand("b")]);
      await vaciar();
      expect(llamadas).toHaveLength(3); // «x» ya estaba
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["b", "x"]);
    });

    it("si falla la lectura de los extras: fallo = true, la lista de la marca sigue en pie, y reintentar() los vuelve a pedir", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      llamadas[1].d.rechazar(new Error("sin red"));
      await vaciar();
      expect(control.instantanea()).toMatchObject({ fallo: true, cargando: false });
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
      control.reintentar();
      llamadas[2].d.resolver([cand("a")]);
      await vaciar();
      expect(llamadas[3].p.idsExtra).toEqual(["x"]);
      llamadas[3].d.resolver([cand("x")]);
      await vaciar();
      expect(control.instantanea()).toMatchObject({ fallo: false });
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a", "x"]);
    });

    it("extras leídos a medias se muestran, pero el fallo sigue hasta reintentar", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1", null, ["x"]));
      llamadas[0].d.resolver([]);
      await vaciar();
      llamadas[1].d.rechazar(new LecturaParcial([cand("x")], "sin variantes"));
      await vaciar();
      expect(control.instantanea().fallo).toBe(true);
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["x"]);
    });
  });

  describe("el lector: inyectado, cambiable, o el de la base al primer uso", () => {
    it("el lector de la base se arma UNA vez y solo cuando hay algo que leer (renderizar no toca la red)", () => {
      const manual = lectorManual();
      const crearLector = vi.fn(() => manual.leer);
      const control = crearControlCandidatas({ crearLector });
      control.sincronizar(peticion(null, null));
      control.sincronizar(peticion("m1", "c1", [], false));
      expect(crearLector).not.toHaveBeenCalled();
      control.sincronizar(peticion("m1"));
      control.sincronizar(peticion("m2"));
      expect(crearLector).toHaveBeenCalledTimes(1);
      expect(manual.llamadas).toHaveLength(2);
    });

    it("usarLector cambia el lector desde la próxima lectura, sin tocar la memoria", async () => {
      const a = lectorManual();
      const b = lectorManual();
      const control = crearControlCandidatas({ leer: a.leer });
      control.sincronizar(peticion("m1"));
      a.llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      control.usarLector(b.leer);
      control.sincronizar(peticion("m2"));
      expect(a.llamadas).toHaveLength(1);
      expect(b.llamadas).toHaveLength(1);
      control.sincronizar(peticion("m1")); // sigue en memoria
      expect(b.llamadas).toHaveLength(1);
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
    });

    it("sin ningún lector la lectura falla con claridad (no se cuelga esperando)", async () => {
      const control = crearControlCandidatas({});
      control.sincronizar(peticion("m1"));
      await vaciar();
      expect(control.instantanea()).toMatchObject({ fallo: true, cargando: false });
    });
  });

  describe("cerrar y suscribir", () => {
    it("cerrar cancela lo que vuela y lo tardío no llega; el control sigue sirviendo (StrictMode monta dos veces)", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      control.cerrar();
      expect(llamadas[0].p.senal.aborted).toBe(true);
      llamadas[0].d.resolver([cand("tarde")]);
      await vaciar();
      expect(control.instantanea().candidatas).toEqual([]);
      control.sincronizar(peticion("m1"));
      expect(llamadas).toHaveLength(2);
      llamadas[1].d.resolver([cand("a")]);
      await vaciar();
      expect(control.instantanea().candidatas.map((c) => c.id)).toEqual(["a"]);
    });

    it("avisa a quien escucha en cada cambio, y deja de avisar al darse de baja", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      const aviso = vi.fn();
      const baja = control.suscribir(aviso);
      control.sincronizar(peticion("m1"));
      const tras = aviso.mock.calls.length;
      expect(tras).toBeGreaterThan(0);
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      expect(aviso.mock.calls.length).toBeGreaterThan(tras);
      baja();
      const fijo = aviso.mock.calls.length;
      control.sincronizar(peticion("m2"));
      expect(aviso.mock.calls.length).toBe(fijo);
    });

    it("la instantánea es la misma referencia mientras nada cambia (lo exige useSyncExternalStore)", async () => {
      const { leer, llamadas } = lectorManual();
      const control = crearControlCandidatas({ leer });
      control.sincronizar(peticion("m1"));
      llamadas[0].d.resolver([cand("a")]);
      await vaciar();
      expect(control.instantanea()).toBe(control.instantanea());
    });
  });
});

// ============================================================================
// 3. El hook: lo único que no se prueba con datos es el cableado con React; lo que sí se puede ver sin navegador es el primer
//    render (el del servidor y el de antes de que corra el efecto), que es donde se vería un parpadeo con lo de otra marca.
// ============================================================================

describe("useCandidatasAlta — el primer render", () => {
  function primero(parametros: Parameters<typeof useCandidatasAlta>[0]) {
    let visto: ReturnType<typeof useCandidatasAlta> | null = null;
    function Pantalla() {
      visto = useCandidatasAlta(parametros);
      return null;
    }
    renderToString(createElement(Pantalla));
    return visto as unknown as ReturnType<typeof useCandidatasAlta>;
  }
  const leer: LectorCandidatas = () => new Promise(() => {});

  it("con marca elegida arranca «cargando», sin candidatas ni fallo (no muestra nada de otra marca)", () => {
    const e = primero({ marcaId: "m1", categoriaId: "c1", idsExtra: [], activo: true, leer });
    expect(e).toMatchObject({ candidatas: [], cargando: true, fallo: false });
    expect(typeof e.reintentar).toBe("function");
  });

  it("inactivo, o sin marca ni categoría: no carga", () => {
    expect(primero({ marcaId: "m1", categoriaId: "c1", idsExtra: [], activo: false, leer })).toMatchObject({ cargando: false, candidatas: [] });
    expect(primero({ marcaId: null, categoriaId: null, idsExtra: [], activo: true, leer })).toMatchObject({ cargando: false, candidatas: [] });
  });

  it("renderizar no toca la red: el cliente de la base se crea solo cuando hay que leer", () => {
    // Sin `leer` inyectado, el primer render (el del servidor) no debe intentar crear el cliente del navegador.
    expect(() => primero({ marcaId: "m1", categoriaId: "c1", idsExtra: [], activo: true })).not.toThrow();
  });
});
