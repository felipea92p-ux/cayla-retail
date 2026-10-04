// «Prendas parecidas» en el alta — el ADVERSARIO de la integración: pruebas que buscan romper lo que une la base, la lectura y las reglas (Fase 1).
//
// EL PROBLEMA. «Crear» debe esperar exactamente cuando la base lo rechazaría, y las dos fuentes de «idéntico» (la base y el cliente), las respuestas
// tardías, los estados límite y la degradación tienen que portarse bien. Las pruebas de cada pieza ya cubren sus casos; aquí se mira la UNIÓN: lo que
// ve la persona cuando las piezas hablan a distinta hora o se contradicen.
//
// CONTRATO
//   PROMETE: (1) un ORÁCULO de la base escrito desde las definiciones de producción (`fn_clave_referencia`, `fn_dentro_de_una_edicion`,
//            `buscar_productos_parecidos`, `crear_producto_con_variantes`), validado contra producción el 2026-09-30 (huella de 14.641 pares y mapa de
//            1.037 caracteres distintos: `HUELLA_EDICION`, `APORTAN_A_LA_CLAVE`), contra el que se comparan el cliente y el candado; (2) 56 nombres
//            probados EN VIVO en producción (solo lectura), con lo que respondió la base, fijados como datos (`EN_VIVO`); (3) un barrido al azar, con semilla,
//            del candado puro: «nunca se habilita lo que la base rechazaría, nunca se frena lo que aceptaría, siempre hay una salida»; (4) los HOOKS reales
//            (`useParecidasAlta`, `useParecidos`, `useCandidatasAlta`) corridos con un mini-render de hooks y relojes falsos: carreras, reinicio, hoja, red,
//            StrictMode; (5) un MODELO de secuencias al azar contra esos hooks, con invariantes que valen en CADA instante, y cinco candados rotos a
//            propósito que el modelo tiene que cazar (la prueba se prueba a sí misma); (6) la igualdad «campo requerido sin hacer ⇔ problema de
//            `problemasAlta`» sobre todas las combinaciones alcanzables, con el orden nuevo de campos.
//   ASUME:   que producción no cambia entre la fecha de los datos y la de la prueba: los datos de producción son una FOTO (aquí no se consulta nada).
//            Si la base cambia (p. ej. `buscar_productos_parecidos` deja de ser ciega al producto especial, H1), los datos se vuelven a tomar.
//   NO HACE: no toca la red ni la base (ni la de producción ni la local), no escribe nada fuera de este archivo y no necesita un navegador.
//
// Una prueba ROJA aquí es un hallazgo y lleva su número en el título. Los del adversario (2026-09-30) quedaron corregidos y siguen aquí como vigilantes:
// H1 el producto especial «Prenda sin Registrar» (invisible para la base, que lo cuenta el índice único: la pantalla reserva el nombre) · H2 la hoja
// reaparecía sola tras un corte de red · H3 «Ninguna es mi prenda» marcaba lo que la búsqueda ocultó · H5 tras un rechazo, «Crear» quedaba libre mientras
// se volvía a comprobar · H6 un nombre sin letras ni números · H8 la cola sin conexión no reconocía el mismo nombre. H4 (hueco de «variantes» en la guía,
// anterior a este trabajo) está permitido y vigilado; H7 (decisión 3 de Felipe) es una pregunta abierta: la rama «no frena» ya es coherente y está probada.

import { createHash } from "node:crypto";
import ReactDefault from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Parecido } from "../components/alta-producto/AvisoParecidos";
import { claveReferencia, problemasAlta, tituloReferencia, type EstadoAlta } from "./alta-producto";
import { camposDelAlta, estadosDeCampos, faltanDelPaso } from "./alta-producto-guia";
import { nombreEnCola, nuevaOperacion } from "./cola-offline";
import { LecturaParcial, construirCandidatas, leerFilasFnProductos, MARCA_SIN_MARCA_ID } from "./candidatas-alta-datos";
import {
  CASI_IGUAL_FRENA_EN_BASE,
  PAUSA_ALERTA_MS,
  armarParecidasDelAlta,
  marcaEfectiva,
  nombreReservado,
  ordenarParaAlta,
  reducirParecidas,
  type BaseComprobada,
  type EntradaEstado,
  type EstadoParecidas,
  type SalidaEstado,
} from "./parecidas-alta-estado";
import { dentroDeUnaEdicion, ordenarParecidas, rotuloDeTiempo } from "./parecidas-alta-reglas";
import type { CandidataAlta, LectorCandidatas } from "./parecidas-alta-tipos";
import { armarHoja, armarTarjeta } from "./parecidas-alta-vista";
import { buscarParecidas } from "./parecidas-alta-estado";
import { useParecidasAlta, type EntradaParecidasAlta } from "./useParecidasAlta";

// ============================================================================
// El doble de la base: un cliente que solo anota las llamadas y deja que la prueba decida cuándo y qué responder.
// ============================================================================

type RespuestaRpc = { data: unknown; error: unknown };
type LlamadaRpc = { nombre: string; args: Record<string, unknown>; responder: (r: RespuestaRpc) => void; respondida: boolean };
const base = vi.hoisted(() => ({ llamadas: [] as unknown[] }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: (nombre: string, args: Record<string, unknown>) => {
      let resolver!: (r: { data: unknown; error: unknown }) => void;
      const promesa = new Promise<{ data: unknown; error: unknown }>((r) => (resolver = r));
      const llamada = {
        nombre,
        args,
        respondida: false,
        responder: (r: { data: unknown; error: unknown }) => {
          if (llamada.respondida) return;
          llamada.respondida = true;
          resolver(r);
        },
      };
      base.llamadas.push(llamada);
      return {
        abortSignal: (senal: AbortSignal) => {
          // Como supabase-js: una señal abortada NO lanza, devuelve un error.
          senal.addEventListener("abort", () => llamada.responder({ data: null, error: { message: "AbortError" } }), { once: true });
          return promesa;
        },
      };
    },
  }),
}));

const llamadasBase = () => base.llamadas as LlamadaRpc[];

/**
 * Un candado ROTO a propósito, para comprobar que el barrido lo caza (la prueba se prueba a sí misma). Con `activo = null` el pegamento real pasa tal cual;
 * los hooks y las pruebas lo importan desde «./parecidas-alta-estado», así que el cambio llega hasta el hook real.
 */
const mutante = vi.hoisted(() => ({ activo: null as null | ((s: unknown) => unknown) }));
vi.mock("./parecidas-alta-estado", async (importOriginal) => {
  const real = await importOriginal<typeof import("./parecidas-alta-estado")>();
  return {
    ...real,
    armarParecidasDelAlta: (e: Parameters<typeof real.armarParecidasDelAlta>[0], frenaCasiIgual?: boolean) => {
      const s = real.armarParecidasDelAlta(e, frenaCasiIgual);
      return mutante.activo ? (mutante.activo(s) as typeof s) : s;
    },
  };
});

// ============================================================================
// Un mini-render de hooks (sin DOM: no hay jsdom en este árbol). Corre los hooks REALES con el despachador de React cambiado por uno propio:
// estado, efectos con sus limpiezas en orden, memos, referencias y `useSyncExternalStore`. Las actualizaciones se dibujan al instante.
// ============================================================================

type Slot = Record<string, unknown>;
type Efecto = { slot: Slot; fn: () => void | (() => void); deps: unknown[] | undefined };
const INTERNOS = (ReactDefault as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function montarHook<P, R>(hook: (p: P) => R, inicial: P, opciones: { estricto?: boolean } = {}) {
  const slots: Slot[] = [];
  let i = 0;
  let props = inicial;
  let salida: R | undefined;
  let dibujando = false;
  let otra = false;
  let montado = true;
  let doble = false;
  let pendientes: Efecto[] = [];
  const iguales = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => Object.is(x, b[k]));
  const slot = (): Slot => (slots[i++] ??= {});

  function programar() {
    if (!montado) return;
    if (dibujando) otra = true;
    else dibujar();
  }

  const despachador = {
    useState(inicialEstado: unknown) {
      const s = slot();
      if (!("v" in s)) {
        s.v = typeof inicialEstado === "function" ? (inicialEstado as () => unknown)() : inicialEstado;
        s.set = (x: unknown) => {
          const nuevo = typeof x === "function" ? (x as (p: unknown) => unknown)(s.v) : x;
          if (!Object.is(nuevo, s.v)) {
            s.v = nuevo;
            programar();
          }
        };
      }
      return [s.v, s.set];
    },
    useReducer(reductor: (e: unknown, a: unknown) => unknown, inicialEstado: unknown) {
      const s = slot();
      if (!("v" in s)) {
        s.v = inicialEstado;
        s.despachar = (a: unknown) => {
          const nuevo = reductor(s.v, a);
          if (!Object.is(nuevo, s.v)) {
            s.v = nuevo;
            programar();
          }
        };
      }
      return [s.v, s.despachar];
    },
    useRef(inicialRef: unknown) {
      const s = slot();
      s.ref ??= { current: inicialRef };
      return s.ref;
    },
    useMemo(fn: () => unknown, deps: unknown[]) {
      const s = slot();
      if (!s.listo || !iguales(s.deps, deps)) {
        s.v = fn();
        s.deps = deps;
        s.listo = true;
      }
      return s.v;
    },
    useCallback(fn: unknown, deps: unknown[]) {
      return despachador.useMemo(() => fn, deps);
    },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const s = slot();
      if (!s.listo || deps === undefined || !iguales(s.deps, deps)) {
        s.listo = true;
        pendientes.push({ slot: s, fn, deps });
      }
    },
    useSyncExternalStore(suscribir: (f: () => void) => () => void, instantanea: () => unknown) {
      const s = slot();
      const v = instantanea();
      if (!s.suscrito) {
        s.suscrito = true;
        pendientes.push({
          slot: s,
          deps: undefined,
          fn: () => {
            const baja = suscribir(() => {
              if (!Object.is(instantanea(), s.ultimo)) programar();
            });
            if (!Object.is(instantanea(), s.ultimo)) programar();
            return baja;
          },
        });
      }
      s.ultimo = v;
      return v;
    },
  };

  function dibujar() {
    if (dibujando) {
      otra = true;
      return;
    }
    dibujando = true;
    try {
      let vueltas = 0;
      do {
        otra = false;
        if (++vueltas > 100) throw new Error("El hook no se estabiliza (render infinito).");
        i = 0;
        pendientes = [];
        const previo = INTERNOS.H;
        INTERNOS.H = despachador;
        try {
          salida = hook(props);
        } finally {
          INTERNOS.H = previo;
        }
        // Como React: primero las limpiezas de los efectos que cambiaron, después los efectos nuevos.
        const hechos = pendientes;
        pendientes = [];
        for (const e of hechos) {
          (e.slot.limpiar as (() => void) | undefined)?.();
          e.slot.limpiar = undefined;
        }
        for (const e of hechos) {
          e.slot.deps = e.deps;
          e.slot.efecto = e.fn;
          const r = e.fn();
          e.slot.limpiar = typeof r === "function" ? r : undefined;
        }
        // StrictMode (solo en desarrollo): los efectos de un montaje nuevo se limpian y vuelven a correr, una vez.
        if (opciones.estricto && !doble) {
          doble = true;
          for (const sl of slots) {
            (sl.limpiar as (() => void) | undefined)?.();
            sl.limpiar = undefined;
          }
          for (const sl of slots) {
            const fn = sl.efecto as (() => void | (() => void)) | undefined;
            if (!fn) continue;
            const r = fn();
            sl.limpiar = typeof r === "function" ? r : undefined;
          }
        }
      } while (otra);
    } finally {
      dibujando = false;
    }
  }
  dibujar();

  return {
    get actual(): R {
      return salida as R;
    },
    rerender(nuevas: P) {
      props = nuevas;
      dibujar();
    },
    /** Cambia solo lo que se pasa: el hook se vuelve a correr con las props de ahora más estos cambios. */
    cambiar(cambios: Partial<P>) {
      props = { ...props, ...cambios };
      dibujar();
    },
    desmontar() {
      montado = false;
      for (const s of slots) (s.limpiar as (() => void) | undefined)?.();
    },
  };
}

// ============================================================================
// El oráculo de la base, escrito desde las definiciones de producción (2026-09-30)
// ============================================================================

/** `retail.fn_clave_referencia`: lower(translate(lower(p), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), sin lo que no es a-z ni 0-9; vacío = null. */
function pgClave(p: string | null): string | null {
  const plegado = (p ?? "")
    .toLowerCase()
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => "aeiouunAEIOUUN"["áéíóúüñÁÉÍÓÚÜÑ".indexOf(c)])
    .toLowerCase();
  const clave = plegado.replace(/[^a-z0-9]+/g, "");
  return clave === "" ? null : clave;
}

/** `retail.fn_dentro_de_una_edicion(a, b)`, línea por línea (plpgsql, índices desde 1). `null` cuenta como longitud 0. */
function pgDentroDeUnaEdicion(a: string | null, b: string | null): boolean {
  const la = (a ?? "").length;
  const lb = (b ?? "").length;
  const sa = a ?? "";
  const sb = b ?? "";
  let i = 1;
  let j = 1;
  let dif = 0;
  if (Math.abs(la - lb) > 1) return false;
  while (i <= la && j <= lb) {
    if (sa.substr(i - 1, 1) === sb.substr(j - 1, 1)) {
      i++;
      j++;
    } else {
      dif++;
      if (dif > 1) return false;
      if (la === lb) {
        i++;
        j++;
      } else if (la > lb) i++;
      else j++;
    }
  }
  return dif + (la - i + 1) + (lb - j + 1) <= 1;
}

/** Una fila de `retail.productos` con lo que mira la base. `categoria = null` = el producto no tiene categoría (el `join` de la función lo deja fuera). */
type ProductoBase = {
  id: string;
  referencia: string;
  categoriaId: string | null;
  categoria: string | null;
  marcaId: string | null;
  marca: string | null;
  estado: "activo" | "descontinuado";
  estadoAlta: "aprobado" | "rechazado";
};

/** `retail.buscar_productos_parecidos(p_referencia)` SOLO con los niveles que deciden el candado (identico y una_letra), con su `limit 5`. */
function baseBuscar(nombre: string, productos: readonly ProductoBase[]): Parecido[] {
  const k = pgClave(nombre);
  if (k === null) return [];
  const filas = productos
    .filter((p) => p.categoria !== null && p.estadoAlta !== "rechazado")
    .map((p) => {
      const kp = pgClave(p.referencia);
      const nivel = kp !== null && kp === k ? "identico" : pgDentroDeUnaEdicion(kp, k) ? "una_letra" : null;
      return nivel ? ({ id: p.id, referencia: p.referencia, categoria: p.categoria ?? "", nivel } as Parecido) : null;
    })
    .filter((x): x is Parecido => x !== null);
  filas.sort((x, y) => (x.nivel === y.nivel ? x.referencia.localeCompare(y.referencia) : x.nivel === "identico" ? -1 : 1));
  return filas.slice(0, 5);
}

type ResultadoCrear = "ok" | "nombre_duplicado" | "nombre_casi_igual" | "indice_unico";

/** `crear_producto_con_variantes`, solo el tramo del nombre: lo que pasa con este nombre y esta confirmación (`p_confirmo_distinto`). */
function baseCrear(nombre: string, confirmo: boolean, productos: readonly ProductoBase[]): ResultadoCrear {
  const v_ref = tituloReferencia(nombre);
  const fila = baseBuscar(v_ref, productos).find((b) => b.nivel === "identico" || b.nivel === "una_letra");
  const ordenada = baseBuscar(v_ref, productos).filter((b) => b.nivel === "identico" || b.nivel === "una_letra")[0] ?? fila;
  if (ordenada?.nivel === "identico") return "nombre_duplicado";
  if (ordenada?.nivel === "una_letra" && !confirmo) return "nombre_casi_igual";
  // El índice único `productos_referencia_clave_unica` (clave de la referencia, salvo los rechazados) ve a TODOS, también al que no tiene categoría.
  const k = pgClave(v_ref);
  if (k !== null && productos.some((p) => p.estadoAlta !== "rechazado" && pgClave(p.referencia) === k)) return "indice_unico";
  return "ok";
}

// ============================================================================
// 1. El oráculo coincide con producción, y el cliente con el oráculo
// ============================================================================

/** Huella del resultado de `retail.fn_dentro_de_una_edicion` en producción (2026-09-30): las 14.641 parejas de cadenas sobre {a,b,c} de 0 a 4 letras. */
const HUELLA_EDICION = { pares: 14641, verdaderos: 1621, md5: "94d1e84912a029f6e1e4978df721e122" };

/** Los caracteres (de 1.037 distintos probados en producción: U+0020–U+024F, U+0300–U+036F, U+1E00–U+1EFF, U+FF00–U+FF5F y 20 sueltos) cuya presencia SÍ aporta a la clave. */
const APORTAN_A_LA_CLAVE: Record<string, string> = {
  ...Object.fromEntries("0123456789".split("").map((c) => [c.codePointAt(0)!, c])),
  ...Object.fromEntries("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => [c.codePointAt(0)!, c.toLowerCase()])),
  ...Object.fromEntries("abcdefghijklmnopqrstuvwxyz".split("").map((c) => [c.codePointAt(0)!, c])),
  193: "a", 201: "e", 205: "i", 209: "n", 211: "o", 218: "u", 220: "u", 225: "a", 233: "e", 237: "i", 241: "n", 243: "o", 250: "u", 252: "u",
  304: "i", // İ (U+0130)
  8490: "k", // K (U+212A, el signo Kelvin)
};

function cadenasSobreABC(): string[] {
  const salida = [""];
  let frontera = [""];
  for (let n = 1; n <= 4; n++) {
    frontera = frontera.flatMap((t) => ["a", "b", "c"].map((c) => t + c));
    salida.push(...frontera);
  }
  return salida;
}

describe("1. el oráculo de la base coincide con producción, y el cliente con el oráculo", () => {
  it("fn_dentro_de_una_edicion: el oráculo y `dentroDeUnaEdicion` dan la huella de producción en las 14.641 parejas", () => {
    const cadenas = cadenasSobreABC();
    const huella = (f: (a: string, b: string) => boolean) => {
      const verdaderos: string[] = [];
      let pares = 0;
      for (const a of [...cadenas].sort()) for (const b of [...cadenas].sort()) {
        pares++;
        if (f(a, b)) verdaderos.push(`${a}|${b}`);
      }
      return { pares, verdaderos: verdaderos.length, md5: createHash("md5").update(verdaderos.join(",")).digest("hex") };
    };
    expect(huella(pgDentroDeUnaEdicion)).toEqual(HUELLA_EDICION);
    expect(huella(dentroDeUnaEdicion)).toEqual(HUELLA_EDICION);
  });

  it("fn_clave_referencia: el cliente aporta EXACTAMENTE los mismos caracteres que producción (1.037 probados, incluidos İ y el signo Kelvin)", () => {
    const rangos: [number, number][] = [[32, 591], [768, 879], [7680, 7935], [65280, 65375]];
    const sueltos = [8490, 8491, 8544, 9398, 64256, 64257, 304, 305, 223, 7838, 453, 498, 12288, 160, 8239, 8203, 8206, 65279, 11360, 42802];
    const codigos = [...rangos.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)), ...sueltos];
    expect(new Set(codigos).size).toBe(1037); // 1.044 filas en producción: 7 sueltos caen dentro de los rangos
    const aportanCliente: Record<string, string> = {};
    const aportanOraculo: Record<string, string> = {};
    for (const n of codigos) {
      const texto = `x${String.fromCodePoint(n)}y`;
      if (claveReferencia(texto) !== "xy") aportanCliente[n] = claveReferencia(texto).slice(1, -1);
      if (pgClave(texto) !== "xy") aportanOraculo[n] = (pgClave(texto) ?? "").slice(1, -1);
    }
    expect(aportanOraculo).toEqual(APORTAN_A_LA_CLAVE);
    expect(aportanCliente).toEqual(APORTAN_A_LA_CLAVE);
  });

  it("el cliente y el oráculo dan la misma clave y la misma «una letra» en 20.000 nombres al azar (con tildes, signos y espacios)", () => {
    const azar = semilla(7);
    const alfabeto = "abcAB12 -.,ñÑáÉüç+()!/'\"_·°";
    const nombre = () => Array.from({ length: Math.floor(azar() * 9) }, () => alfabeto[Math.floor(azar() * alfabeto.length)]).join("");
    for (let n = 0; n < 20_000; n++) {
      const a = nombre();
      const b = nombre();
      expect(claveReferencia(a)).toBe(pgClave(a) ?? "");
      const ka = claveReferencia(a);
      const kb = claveReferencia(b);
      if (ka !== "" && kb !== "") expect(dentroDeUnaEdicion(ka, kb)).toBe(pgDentroDeUnaEdicion(ka, kb));
    }
  });
});

// ============================================================================
// 2. Producción: los nombres probados EN VIVO el 2026-09-30 con `buscar_productos_parecidos` (solo lectura)
// ============================================================================

/** Lo que había en `retail.productos` (proyecto vovjyyiafkxteijimpuy) al probar: 11 prendas con categoría + el producto especial «Prenda sin Registrar» (sin categoría). */
const PRODUCCION: ProductoBase[] = [
  ["adelle", "Adelle Wide Leg", "Jeans", "Pilar"],
  ["bonita", "Body Bonita", "Bodys", "Lasak"],
  ["lavie", "Body Lavie", "Bodys", "Lasak"],
  ["lara", "Camisa Lara", "Camisas y Blusas", "La Femme 21"],
  ["chaleco", "Conjunto Chaleco + Pantalon Sastre", "Conjuntos", "nervus"],
  ["culotte", "Culotte Petit Yani", "Jeans", "Wayi"],
  ["billie", "Palazo Billie", "Jeans", "Wayi"],
  ["evaluna", "Polo Evaluna", "Polos", "Krisstell"],
  ["g44", "Polo G44", "Polos", "Krisstell"],
  ["wide", "Wide Leg", "Jeans", "Jirish"],
  ["corto", "Wide Leg Corto Comfo", "Jeans", "Jirish"],
].map(([id, referencia, categoria, marca]) => ({
  id, referencia, categoria, categoriaId: `c-${categoria}`, marca, marcaId: `m-${marca}`, estado: "activo" as const, estadoAlta: "aprobado" as const,
}));
const PRENDA_SIN_REGISTRAR: ProductoBase = {
  id: "11111111-1111-4111-8111-111111111111", referencia: "Prenda sin Registrar", categoria: null, categoriaId: null, marca: null, marcaId: null, estado: "activo", estadoAlta: "aprobado",
};

/** [nombre probado, lo que respondió producción: nombres de las prendas «identico» y «una_letra», en ese orden]. Las «parecido» no deciden el candado y no se anotan. */
const EN_VIVO: [string, { identico?: string; una_letra?: string }][] = [
  ["Camisa Lara", { identico: "Camisa Lara" }],
  ["Palazo Billie", { identico: "Palazo Billie" }],
  ["Culotte Petit Yani", { identico: "Culotte Petit Yani" }],
  ["Adelle Wide Leg", { identico: "Adelle Wide Leg" }],
  ["Wide Leg Corto Comfo", { identico: "Wide Leg Corto Comfo" }],
  ["Polo G44", { identico: "Polo G44" }],
  ["Wide Leg", { identico: "Wide Leg" }],
  ["Polo Evaluna", { identico: "Polo Evaluna" }],
  ["Body Bonita", { identico: "Body Bonita" }],
  ["Body Lavie", { identico: "Body Lavie" }],
  ["Conjunto Chaleco + Pantalon Sastre", { identico: "Conjunto Chaleco + Pantalon Sastre" }],
  ["Polo G-44", { identico: "Polo G44" }],
  ["polo g 44", { identico: "Polo G44" }],
  ["POLO G44", { identico: "Polo G44" }],
  ["Polo G45", { una_letra: "Polo G44" }],
  ["Polo G4", { una_letra: "Polo G44" }],
  ["Polo G444", { una_letra: "Polo G44" }],
  ["Polo G 4 4", { identico: "Polo G44" }],
  ["Polo G44.", { identico: "Polo G44" }],
  ["Wide Leg.", { identico: "Wide Leg" }],
  ["Wide Leg Corto", {}],
  ["WIDE LEG CORTO COMFO", { identico: "Wide Leg Corto Comfo" }],
  ["Wide Leg Cortó Comfo", { identico: "Wide Leg Corto Comfo" }],
  ["Wide Lég", { identico: "Wide Leg" }],
  ["Wide Leg!", { identico: "Wide Leg" }],
  ["Wide  Leg", { identico: "Wide Leg" }],
  ["Wide Leg Comfo", {}],
  ["Wide Legs", { una_letra: "Wide Leg" }],
  ["Wide Lleg", { una_letra: "Wide Leg" }],
  ["Wdie Leg", {}],
  ["Camisa Lára", { identico: "Camisa Lara" }],
  ["Camisa Lara 2", { una_letra: "Camisa Lara" }],
  ["Camisa Lar", { una_letra: "Camisa Lara" }],
  ["Camisas Lara", { una_letra: "Camisa Lara" }],
  ["Palazo Bilie", { una_letra: "Palazo Billie" }],
  ["Palazzo Billie", { una_letra: "Palazo Billie" }],
  ["Culotte Petit Yanni", { una_letra: "Culotte Petit Yani" }],
  ["Culote Petit Yani", { una_letra: "Culotte Petit Yani" }],
  ["Polo Evalunaa", { una_letra: "Polo Evaluna" }],
  ["Body Bonit", { una_letra: "Body Bonita" }],
  ["Wide Leg ç", { identico: "Wide Leg" }],
  ["Wìde Leg", { una_letra: "Wide Leg" }],
  ["Polo G4 4", { identico: "Polo G44" }],
  ["Polo G-45", { una_letra: "Polo G44" }],
  ["Polo Evaluña", { identico: "Polo Evaluna" }],
  ["Adelle Wide Leg.", { identico: "Adelle Wide Leg" }],
  ["Adele Wide Leg", { una_letra: "Adelle Wide Leg" }],
  ["Wide Leg Jirish", {}],
  ["Jirish Wide Leg", {}],
  ["   ", {}],
  ["...", {}],
  ["Polo", {}],
  // El producto especial (sin categoría): la base NO lo ve, y el índice único sí lo cuenta.
  ["Prenda sin Registrar", {}],
  ["Prenda Sin Registrar.", {}],
  ["Prenda sin Registrar 2", {}],
  ["Prenda sin Registra", {}],
];

const candidataDe = (p: ProductoBase, extra: Partial<CandidataAlta> = {}): CandidataAlta => ({
  id: p.id,
  referencia: p.referencia,
  categoriaId: p.categoriaId,
  categoria: p.categoria,
  marcaId: p.marcaId,
  marca: p.marca,
  estado: p.estado,
  descripcion: null,
  tejido: null,
  patron: null,
  temporada: null,
  creadoEn: "2026-09-29T17:00:00Z",
  fotoUrl: null,
  colores: [],
  tallas: [],
  disponible: { total: 2, porSede: [{ sede: "Tienda TRU", disponible: 2 }] },
  cargadaEn: null,
  ...extra,
});
const AHORA = Date.parse("2026-09-30T15:00:00Z");
const rotuloTiempo = (iso: string) => rotuloDeTiempo(iso, AHORA) ?? "";

describe("2. producción (2026-09-30): lo que respondió la base y lo que calcula el cliente dicen lo mismo", () => {
  it.each(EN_VIVO)("«%s»: el oráculo repite lo que respondió producción, y el cliente también", (nombre, esperado) => {
    // 1. El oráculo (escrito desde las definiciones) da lo mismo que la base real.
    const dela = baseBuscar(tituloReferencia(nombre), [...PRODUCCION, PRENDA_SIN_REGISTRAR]);
    const real = { identico: dela.find((p) => p.nivel === "identico")?.referencia, una_letra: dela.find((p) => p.nivel === "una_letra")?.referencia };
    expect({ ...(real.identico ? { identico: real.identico } : {}), ...(real.una_letra ? { una_letra: real.una_letra } : {}) }).toEqual(esperado);

    // 2. El cliente (las reglas, con las prendas que lee la pantalla: las 11 con categoría), con el nombre tal cual y con el nombre ya en formato único.
    for (const tecleado of [nombre, tituloReferencia(nombre)]) {
      const r = ordenarParecidas({ marcaId: null, categoriaId: "c-Jeans", nombre: tecleado, descripcion: "", tejido: null, patron: null, ahora: AHORA }, PRODUCCION.map((p) => candidataDe(p)));
      const identico = r.lista.find((x) => x.nivel === "identico")?.candidata.referencia;
      const casi = r.lista.filter((x) => x.nivel === "casi_igual").map((x) => x.candidata.referencia);
      expect(identico).toBe(esperado.identico);
      expect(casi).toEqual(esperado.una_letra ? [esperado.una_letra] : []);
    }
  });

  it("cada nombre probado decide igual el candado: lo que la base rechazaría, la pantalla lo espera (con la alerta al día y la lectura completa)", () => {
    const productos = [...PRODUCCION];
    for (const [nombre] of EN_VIVO) {
      const items = baseBuscar(tituloReferencia(nombre), productos);
      const base: BaseComprobada = { items, fallo: false, comprobando: false, hayIdentico: items.some((p) => p.nivel === "identico"), hayUnaLetra: items.some((p) => p.nivel === "una_letra"), confirmo: false };
      const nombreFinal = tituloReferencia(nombre);
      const resultado = ordenarParaAlta({ candidatas: productos.map((p) => candidataDe(p)), marcaId: null, marca: null, categoriaId: "c-Jeans", categoria: "Jeans", nombre: nombreFinal, descripcion: "", tejido: null, patron: null, ahora: AHORA });
      const s = armarParecidasDelAlta({ activo: true, enLinea: true, base, cargando: false, falloLectura: false, resultado, marca: null, categoria: "Jeans", nombreVigente: nombreFinal, atrasada: false, revisadas: [], rotuloTiempo });
      const espera = s.nombreBloqueado || (s.hayUnaLetra && !s.confirmo);
      const laBaseRechaza = baseCrear(nombre, s.confirmo, productos) !== "ok";
      expect(espera, nombre).toBe(base.hayIdentico || base.hayUnaLetra);
      // Sin responder nada, lo que la base rechazaría sin confirmación, la pantalla lo espera; y si la pantalla no espera, la base lo acepta.
      if (!espera) expect(laBaseRechaza, nombre).toBe(false);
    }
  });

  it("H1 (la base es ciega). «Prenda sin Registrar»: `buscar_productos_parecidos` NO ve el producto especial, pero el índice único sí lo cuenta", () => {
    // Evidencia de producción: `buscar_productos_parecidos('Prenda sin Registrar')` devolvió [] (el `join categorias` deja fuera a un producto sin categoría),
    // y `productos_referencia_clave_unica` cuenta la clave «prendasinregistrar». El nombre es tan natural que una integrante puede escribirlo.
    const productos = [...PRODUCCION, PRENDA_SIN_REGISTRAR];
    expect(baseBuscar("Prenda Sin Registrar", productos)).toEqual([]);
    expect(EN_VIVO.find(([n]) => n === "Prenda sin Registrar")?.[1]).toEqual({});
    expect(baseCrear("Prenda sin Registrar", false, productos)).toBe("indice_unico");
    // El candado que sale SOLO de la base no puede esperar aquí (no hay qué esperar: la base no ve al producto). Por eso la pantalla reserva el nombre por su
    // cuenta (`nombreReservado`, probado con el hook real en la sección 4); el arreglo de fondo —`left join categorias` en la función— es de una fase posterior.
    expect(baseBuscar("Prenda Sin Registrar", productos).some((p) => p.nivel === "identico")).toBe(false);
  });

  it("H1. el nombre reservado es el que la base rechaza por el índice único, con la misma clave (tildes, mayúsculas, espacios y puntuación no lo disimulan)", () => {
    const productos = [...PRODUCCION, PRENDA_SIN_REGISTRAR];
    for (const n of ["Prenda sin Registrar", "prenda SIN registrar", "Prenda  Sin  Registrar.", "PRENDA-SIN-REGISTRAR", "Prenda sin Registrár"]) {
      expect(nombreReservado(n), n).toBe("Prenda sin Registrar");
      expect(baseCrear(n, false, productos), n).toBe("indice_unico");
    }
    // Lo que NO tiene esa clave no se frena: la base lo acepta (otra clave) y la pantalla no inventa un bloqueo.
    for (const n of ["Prenda sin Registrar 2", "Prenda Registrada", "Prenda", "", "   "]) {
      expect(nombreReservado(n), n).toBeNull();
      if (n.trim()) expect(baseCrear(n, false, productos), n).toBe("ok");
    }
  });
});

// ============================================================================
// Utilidades del barrido
// ============================================================================

/** Un generador con semilla (mulberry32): el barrido es el mismo en cada corrida. */
function semilla(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 3. El barrido del candado
// ============================================================================

type Lectura = "ok" | "sin_extras" | "cargando" | "fallo";
type Marca = { id: string; nombre: string };
const MARCAS: Marca[] = [
  { id: "m1", nombre: "Jirish" },
  { id: "m2", nombre: "Krisstell" },
];
const CATEGORIAS = [
  { id: "c1", nombre: "Jeans" },
  { id: "c2", nombre: "Polos" },
  { id: "c3", nombre: "Camisas y Blusas" },
];
const NOMBRES = ["Polo G44", "Polo G45", "Wide Leg", "Wide Leg Corto", "Camisa Lara", "Camisa Lari", "Body Bonita", "Polo Evaluna", "Jean Mom", "Jean Mon", "Ab", "A", "Wide Legs"];

type Escenario = {
  productos: ProductoBase[];
  nombre: string;
  nombreVigente: string;
  atrasada: boolean;
  marcaId: string;
  marcaNombre: string;
  categoria: { id: string; nombre: string };
  lectura: Lectura;
  lecturaParcial: string[];
  revisadas: string[];
  casilla: boolean;
  enLinea: boolean;
};

function mutar(azar: () => number, t: string): string {
  const letras = "abcdeghilmnoprstuw 4-5.";
  const r = azar();
  const i = Math.floor(azar() * (t.length + 1));
  if (r < 0.2) return t;
  if (r < 0.3) return t.toUpperCase();
  if (r < 0.4) return t.slice(0, i) + letras[Math.floor(azar() * letras.length)] + t.slice(i);
  if (r < 0.5) return t.slice(0, Math.max(0, i - 1)) + t.slice(i);
  if (r < 0.6) return t.slice(0, Math.max(0, i - 1)) + letras[Math.floor(azar() * letras.length)] + t.slice(i);
  if (r < 0.65 && t.length > 1) return t.slice(0, i - 1) + t[i] + t[i - 1] + t.slice(i + 1); // dos contiguas cambiadas
  if (r < 0.75) return t.replace(/ /g, "-");
  if (r < 0.8) return `${t}.`;
  if (r < 0.85) return t.replace(/[aeo]/g, (c) => ({ a: "á", e: "é", o: "ó" })[c] ?? c);
  if (r < 0.9) return `${t} 2`;
  return NOMBRES[Math.floor(azar() * NOMBRES.length)];
}

function escenario(azar: () => number): Escenario {
  const cuantos = Math.floor(azar() * 7);
  const productos: ProductoBase[] = Array.from({ length: cuantos }, (_, n) => {
    const cat = CATEGORIAS[Math.floor(azar() * CATEGORIAS.length)];
    const marca = azar() < 0.2 ? null : MARCAS[Math.floor(azar() * MARCAS.length)];
    return {
      id: `p${n}`,
      referencia: mutar(azar, NOMBRES[Math.floor(azar() * NOMBRES.length)]),
      categoria: azar() < 0.05 ? null : cat.nombre,
      categoriaId: cat.id,
      marca: marca?.nombre ?? null,
      marcaId: marca?.id ?? null,
      estado: azar() < 0.15 ? "descontinuado" : "activo",
      estadoAlta: azar() < 0.05 ? "rechazado" : "aprobado",
    };
  });
  const base = productos.length > 0 && azar() < 0.7 ? productos[Math.floor(azar() * productos.length)].referencia : NOMBRES[Math.floor(azar() * NOMBRES.length)];
  const nombre = azar() < 0.05 ? "" : tituloReferencia(mutar(azar, base));
  const atrasada = azar() < 0.25 && nombre !== "";
  const nombreVigente = atrasada ? tituloReferencia(mutar(azar, base)) : nombre;
  const marca = azar() < 0.3 ? { id: "", nombre: "" } : azar() < 0.1 ? { id: "mi", nombre: "Importado" } : MARCAS[Math.floor(azar() * MARCAS.length)];
  const r = azar();
  return {
    productos,
    nombre,
    nombreVigente,
    atrasada: atrasada && nombreVigente !== nombre,
    marcaId: marca.id,
    marcaNombre: marca.nombre,
    categoria: CATEGORIAS[Math.floor(azar() * CATEGORIAS.length)],
    lectura: r < 0.55 ? "ok" : r < 0.72 ? "sin_extras" : r < 0.82 ? "cargando" : "fallo",
    lecturaParcial: productos.filter(() => azar() < 0.5).map((p) => p.id),
    revisadas: [...productos.filter(() => azar() < 0.35).map((p) => p.id), ...(azar() < 0.1 ? ["id-que-no-existe"] : [])],
    casilla: azar() < 0.3,
    enLinea: azar() < 0.9,
  };
}

/** Arma lo que el hook le entrega a `armarParecidasDelAlta`, como lo haría: la base con el nombre de ahora, las reglas con el nombre de la pausa. */
function entradaDe(e: Escenario, cambios: { revisadas?: string[]; casilla?: boolean; atrasada?: boolean } = {}): { entrada: EntradaEstado; base: BaseComprobada; items: Parecido[] } {
  const items = baseBuscar(e.nombre, e.productos);
  const base: BaseComprobada = {
    items,
    fallo: false,
    comprobando: false,
    hayIdentico: items.some((p) => p.nivel === "identico"),
    hayUnaLetra: items.some((p) => p.nivel === "una_letra"),
    confirmo: cambios.casilla ?? e.casilla,
  };
  const marca = marcaEfectiva(e.marcaId, e.marcaNombre);
  const visibles = e.productos.filter((p) => p.categoria !== null && p.estadoAlta !== "rechazado");
  const delAlcance = visibles.filter((p) => (marca.id ? p.marcaId === marca.id : p.categoriaId === e.categoria.id));
  const extras = visibles.filter((p) => items.some((i) => i.id === p.id));
  let leidas: ProductoBase[] = [];
  if (e.lectura === "ok") leidas = [...delAlcance, ...extras];
  else if (e.lectura === "sin_extras") leidas = delAlcance;
  else if (e.lectura === "fallo") leidas = visibles.filter((p) => e.lecturaParcial.includes(p.id));
  const unicas = [...new Map(leidas.map((p) => [p.id, p])).values()];
  const enLinea = e.enLinea;
  const resultado = enLinea
    ? ordenarParaAlta({ candidatas: unicas.map((p) => candidataDe(p)), marcaId: marca.id, marca: marca.nombre, categoriaId: e.categoria.id, categoria: e.categoria.nombre, nombre: e.nombreVigente, descripcion: "", tejido: null, patron: null, ahora: AHORA })
    : null;
  return {
    items,
    base,
    entrada: {
      activo: true,
      enLinea,
      base,
      cargando: e.lectura === "cargando",
      falloLectura: e.lectura === "fallo",
      resultado,
      marca: marca.nombre,
      categoria: e.categoria.nombre,
      nombreVigente: e.nombreVigente,
      atrasada: cambios.atrasada ?? e.atrasada,
      revisadas: cambios.revisadas ?? e.revisadas,
      rotuloTiempo,
    },
  };
}

/** Lo que espera «Crear» por el nombre, como lo arma el formulario (`nombreBloqueado` y `nombreSinConfirmar`). */
const espera = (s: SalidaEstado) => s.nombreBloqueado || (s.hayUnaLetra && !s.confirmo);

describe("3. el barrido del candado: «Crear» espera exactamente cuando la base lo rechazaría", () => {
  const N = 8_000;

  it(`invariantes sobre ${N} escenarios al azar (semilla fija)`, () => {
    const azar = semilla(20260930);
    const falla = new Map<string, { escenario: Escenario; salida: SalidaEstado; detalle?: string }>();
    const anotar = (clave: string, e: Escenario, s: SalidaEstado, detalle?: string) => {
      if (!falla.has(clave)) falla.set(clave, { escenario: e, salida: s, detalle });
    };
    let hayIdentico = 0;
    let hayUnaLetra = 0;
    const cobertura = { respaldoIdentico: 0, respaldoUnaLetra: 0, confirmadaPorRespuestas: 0, confirmadaPorCasilla: 0, esperaPorTarjeta: 0, idenicoOtraMarca: 0, atrasadaConBase: 0, sinRed: 0 };
    for (let n = 0; n < N; n++) {
      const e = escenario(azar);
      if (e.nombre === "") continue;
      const { entrada, base, items } = entradaDe(e);
      const s = armarParecidasDelAlta(entrada);
      const dbIdentico = items.some((p) => p.nivel === "identico");
      const dbUnaLetra = items.some((p) => p.nivel === "una_letra");
      if (dbIdentico) hayIdentico++;
      if (dbUnaLetra) hayUnaLetra++;
      const pantallaEspera = espera(s);
      const creacion = baseCrear(e.nombre, s.confirmo, e.productos);
      if (s.respaldo.some((p) => p.nivel === "identico")) cobertura.respaldoIdentico++;
      if (s.respaldo.some((p) => p.nivel === "una_letra")) cobertura.respaldoUnaLetra++;
      if (s.hayUnaLetra && s.confirmo && items.some((p) => p.nivel === "una_letra" && e.revisadas.includes(p.id))) cobertura.confirmadaPorRespuestas++;
      if (s.hayUnaLetra && s.confirmo && base.confirmo && s.respaldo.length > 0) cobertura.confirmadaPorCasilla++;
      if (s.hayUnaLetra && !s.confirmo && !s.nombreBloqueado && s.alerta) cobertura.esperaPorTarjeta++;
      if (items.some((p) => p.nivel === "identico" && e.marcaId !== "" && e.productos.find((q) => q.id === p.id)?.marcaId !== e.marcaId)) cobertura.idenicoOtraMarca++;
      if (e.atrasada && (dbIdentico || dbUnaLetra)) cobertura.atrasadaConBase++;
      if (!e.enLinea) cobertura.sinRed++;

      // A. lo que la pantalla deja pasar, la base lo acepta (salvo el índice único, que no ve a los productos sin categoría: H1)
      if (!pantallaEspera && (creacion === "nombre_duplicado" || creacion === "nombre_casi_igual")) anotar("A. habilita lo que la base rechaza", e, s, creacion);
      // B. lo que la base aceptaría sin pedir nada, la pantalla no lo frena
      if (!dbIdentico && !dbUnaLetra && pantallaEspera) anotar("B. frena lo que la base aceptaría", e, s);
      // C. el idéntico frena siempre
      if (dbIdentico && !s.nombreBloqueado) anotar("C. idéntico sin frenar", e, s);
      // D. si espera, dice por qué
      if (pantallaEspera && s.motivoBloqueo === null) anotar("D. espera sin decir por qué", e, s);
      if (!pantallaEspera && s.motivoBloqueo !== null) anotar("D2. dice que espera y no espera", e, s, s.motivoBloqueo ?? "");
      // H. «una letra» de la pantalla = «una letra» de la base
      if (s.hayUnaLetra !== (CASI_IGUAL_FRENA_EN_BASE && dbUnaLetra)) anotar("H. hayUnaLetra distinto de la base", e, s);
      // I. la confirmación no se regala: cada «una letra» de la base está respondida, o es una sin tarjeta y la casilla está marcada
      if (s.hayUnaLetra && s.confirmo) {
        const respondidas = new Set(e.revisadas);
        const sinRespuesta = items.filter((p) => p.nivel === "una_letra" && !respondidas.has(p.id));
        if (sinRespuesta.length > 0 && !base.confirmo) anotar("I. confirmo sin respuesta ni casilla", e, s, sinRespuesta.map((p) => p.id).join());
      }
      // S. sin conexión y sin nada respondido, el candado es EXACTAMENTE el de antes (el de `useParecidos`: lo que dice la base y la casilla)
      if (!e.enLinea && e.revisadas.length === 0 && !e.atrasada) {
        if (s.nombreBloqueado !== base.hayIdentico) anotar("S. sin red: el idéntico no es el de la base", e, s);
        if (s.hayUnaLetra !== base.hayUnaLetra) anotar("S2. sin red: «una letra» no es la de la base", e, s);
        if (s.confirmo !== base.confirmo) anotar("S3. sin red: «confirmo» no es la casilla de siempre", e, s);
        if (s.alerta !== null || s.avisoNombre !== null) anotar("S4. sin red: se dibuja alerta", e, s);
      }
      // F. un idéntico de la base siempre se DICE (aviso bajo el nombre o respaldo con la casilla de siempre), con la alerta al día
      if (dbIdentico && !e.atrasada && e.enLinea && !s.avisoNombre && !s.respaldo.some((p) => p.nivel === "identico")) anotar("F. idéntico callado", e, s);
      // G. la pantalla no dice «ya existe» si la base no lo dice
      if (s.alerta?.tipo === "identico" && !e.atrasada && !dbIdentico) anotar("G. dice «ya existe» y la base no", e, s);
      // E. no hay callejón sin salida: con la alerta al día, toda «una letra» pendiente tiene tarjeta o casilla; y contestándolas se destraba
      if (s.hayUnaLetra && !s.confirmo && !s.nombreBloqueado && !e.atrasada && e.enLinea) {
        const pendientes = items.filter((p) => p.nivel === "una_letra" && !new Set(e.revisadas).has(p.id));
        const conTarjeta = pendientes.filter((p) => entrada.resultado?.lista.some((x) => x.candidata.id === p.id && x.nivel === "casi_igual") && !entrada.cargando && !entrada.falloLectura);
        const enRespaldo = pendientes.filter((p) => s.respaldo.some((r) => r.id === p.id));
        if (conTarjeta.length + enRespaldo.length < pendientes.length) anotar("E. una letra sin tarjeta ni casilla", e, s);
        // contestar: el reductor con cada tarjeta, y la casilla para las del respaldo
        let estado: EstadoParecidas = { revisadas: [...e.revisadas], hoja: null };
        for (const p of conTarjeta) estado = reducirParecidas(estado, { tipo: "revisada", id: p.id, resultado: entrada.resultado });
        const despues = armarParecidasDelAlta({ ...entrada, revisadas: estado.revisadas, base: { ...base, confirmo: enRespaldo.length > 0 ? true : base.confirmo } });
        if (despues.hayUnaLetra && !despues.confirmo) anotar("E2. contestar todo no destraba", e, s);
      }
    }
    // El barrido tiene que tocar de verdad los dos casos que vigila.
    expect(hayIdentico).toBeGreaterThan(300);
    expect(hayUnaLetra).toBeGreaterThan(300);
    for (const [caso, veces] of Object.entries(cobertura)) expect(veces, `el barrido no tocó el caso «${caso}»`).toBeGreaterThan(20);
    const informe = [...falla].map(([k, v]) => `${k}\n  nombre=${JSON.stringify(v.escenario.nombre)} vigente=${JSON.stringify(v.escenario.nombreVigente)} lectura=${v.escenario.lectura} atrasada=${v.escenario.atrasada} enLinea=${v.escenario.enLinea} marca=${v.escenario.marcaNombre || "-"} revisadas=${JSON.stringify(v.escenario.revisadas)} casilla=${v.escenario.casilla}\n  productos=${JSON.stringify(v.escenario.productos.map((p) => [p.id, p.referencia, p.categoria, p.marcaId, p.estadoAlta]))}\n  ${v.detalle ?? ""}`);
    expect(informe, informe.join("\n")).toEqual([]);
  }, 120_000);
});

// ============================================================================
// 4. Los hooks REALES: carreras, reinicio, hoja, degradación y sin conexión
// ============================================================================

type PedidoLectura = {
  marcaId: string | null;
  categoriaId: string | null;
  idsExtra: readonly string[];
  senal: AbortSignal;
  resuelto: boolean;
  resolver: (c: CandidataAlta[]) => void;
  rechazar: (e: unknown) => void;
};

/** Una lectura de lo que ya existe que responde cuando la prueba quiere (y se rechaza si la cancelan, como el lector de verdad). */
function lectorManual(opciones: { rechazaAlAbortar?: boolean } = {}) {
  const rechazaAlAbortar = opciones.rechazaAlAbortar ?? true;
  const pedidos: PedidoLectura[] = [];
  const leer: LectorCandidatas = (p) =>
    new Promise<CandidataAlta[]>((resolve, reject) => {
      const pedido: PedidoLectura = {
        ...p,
        resuelto: false,
        resolver: (c) => {
          if (pedido.resuelto) return;
          pedido.resuelto = true;
          resolve(c);
        },
        rechazar: (e) => {
          if (pedido.resuelto) return;
          pedido.resuelto = true;
          reject(e);
        },
      };
      // Un lector descuidado ignora la señal y responde tarde: el control tiene que descartarlo igual.
      if (rechazaAlAbortar) p.senal.addEventListener("abort", () => pedido.rechazar(new Error("abortada")), { once: true });
      pedidos.push(pedido);
    });
  return { leer, pedidos };
}

const COMO_FILA = (p: Parecido) => ({ id: p.id, referencia: p.referencia, categoria_id: "c", categoria: p.categoria, nivel: p.nivel, similitud: 1 });
const responderBase = (l: LlamadaRpc, items: Parecido[]) => l.responder({ data: items.map(COMO_FILA), error: null });
const fallarBase = (l: LlamadaRpc) => l.responder({ data: null, error: { message: "falló" } });
const avanzar = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const POLOS = { id: "c-polos", nombre: "Polos" };
const KRISS = { id: "m-krisstell", nombre: "Krisstell" };
const JIRISH = { id: "m-jirish", nombre: "Jirish" };
const prod = (id: string, referencia: string, extra: Partial<ProductoBase> = {}): ProductoBase => ({
  id, referencia, categoria: "Polos", categoriaId: "c-polos", marca: "Krisstell", marcaId: "m-krisstell", estado: "activo", estadoAlta: "aprobado", ...extra,
});
const parecidoDe = (p: ProductoBase, nivel: Parecido["nivel"]): Parecido => ({ id: p.id, referencia: p.referencia, categoria: p.categoria ?? "", nivel });

function armarEntrada(leer: LectorCandidatas, cambios: Partial<EntradaParecidasAlta> = {}): EntradaParecidasAlta {
  return { nombre: "", descripcion: "", tejido: null, patron: null, categoriaId: POLOS.id, categoriaNombre: POLOS.nombre, marcaId: KRISS.id, marcaNombre: KRISS.nombre, enLinea: true, leer, ...cambios };
}

describe("4. los hooks reales (mini-render de hooks, relojes falsos)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    base.llamadas.length = 0;
    // `abrirHoja` mira qué elemento tenía el foco para devolvérselo al cerrar; sin DOM, un foco vacío.
    vi.stubGlobal("HTMLElement", class {});
    vi.stubGlobal("document", { activeElement: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const G44 = prod("g44", "Polo G44");
  const EVA = prod("eva", "Polo Evaluna");

  it("una respuesta vieja de la base no pisa a la nueva (otro nombre)", async () => {
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G4" }));
    await avanzar(400);
    h.cambiar({ nombre: "Polo G45" });
    await avanzar(400);
    expect(llamadasBase().map((l) => l.args.p_referencia)).toEqual(["Polo G4", "Polo G45"]);
    responderBase(llamadasBase()[1], [parecidoDe(G44, "una_letra")]);
    await avanzar(0);
    responderBase(llamadasBase()[0], [{ id: "x", referencia: "Polo G4", categoria: "Polos", nivel: "identico" }]); // llega tarde
    await avanzar(0);
    expect(h.actual.hayIdentico).toBe(false);
    expect(h.actual.hayUnaLetra).toBe(true);
    expect(h.actual.items.map((p) => p.id)).toEqual(["g44"]);
    h.desmontar();
  });

  it("mientras la base contesta, `comprobando` dice que no se sabe; el resultado de otro nombre nunca se muestra", async () => {
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G44" }));
    expect(h.actual.comprobando).toBe(true);
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "identico")]);
    await avanzar(0);
    expect(h.actual.comprobando).toBe(false);
    expect(h.actual.hayIdentico).toBe(true);
    h.cambiar({ nombre: "Polo G45" });
    expect(h.actual.comprobando).toBe(true);
    expect(h.actual.hayIdentico).toBe(false); // el idéntico era de OTRO nombre
    h.desmontar();
  });

  it("el candado no espera la pausa de la alerta: a los 350 ms + la respuesta ya frena, aunque la alerta siga en blanco", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer));
    await avanzar(10);
    pedidos.forEach((p) => p.resolver([candidataDe(G44), candidataDe(EVA)]));
    await avanzar(0);
    h.cambiar({ nombre: "Polo G44" });
    await avanzar(360);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "identico")]);
    await avanzar(0);
    expect(h.actual.hayIdentico).toBe(true); // frena a los ~360 ms
    expect(h.actual.ficha.alerta?.tipo).not.toBe("identico"); // la alerta todavía dibuja el nombre de la pausa (vacío)
    expect(h.actual.motivoBloqueo).not.toBeNull(); // y aun así dice por qué espera
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.ficha.alerta?.tipo).toBe("identico");
    expect(h.actual.motivoBloqueo).toContain("Polo G44");
    h.desmontar();
  });

  it("una lectura vieja de otra marca no pisa a la vigente", async () => {
    const { leer, pedidos } = lectorManual();
    const deJirish = candidataDe(prod("wide", "Wide Leg", { categoria: "Polos", categoriaId: "c-polos", marca: "Jirish", marcaId: "m-jirish" }));
    const deKriss = candidataDe(G44);
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { marcaId: JIRISH.id, marcaNombre: JIRISH.nombre }));
    await avanzar(10);
    h.cambiar({ marcaId: KRISS.id, marcaNombre: KRISS.nombre });
    await avanzar(10);
    const [deJ, deK] = pedidos.filter((p) => p.categoriaId === null && p.marcaId !== null);
    expect([deJ.marcaId, deK.marcaId]).toEqual(["m-jirish", "m-krisstell"]);
    deK.resolver([deKriss]);
    await avanzar(0);
    deJ.resolver([deJirish]); // tarde: ya se cambió de marca (y la señal se abortó, pero el lector la ignora)
    await avanzar(0);
    const alerta = h.actual.ficha.alerta;
    expect(alerta?.titulo).toContain("Krisstell");
    expect(alerta?.titulo).not.toContain("Jirish");
    expect(alerta?.filas.map((f) => f.nombre)).toEqual(["Polo G44"]);
    h.desmontar();
  });

  it("«Crear otro parecido» (`reiniciar`) borra lo respondido, cierra la hoja y vuelve a LEER lo que ya existe", async () => {
    const { leer, pedidos } = lectorManual();
    const g45 = prod("g45", "Polo G45");
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G4" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "una_letra"), parecidoDe(g45, "una_letra")]);
    pedidos.forEach((p) => p.resolver([candidataDe(G44), candidataDe(g45)]));
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.hayUnaLetra && !h.actual.confirmo).toBe(true);
    h.actual.ficha.onVer("g44");
    h.actual.ficha.hoja?.onRevisada("g44");
    h.actual.ficha.hoja?.onRevisada("g45");
    expect(h.actual.confirmo).toBe(true);
    const lecturasAntes = pedidos.length;
    // El formulario vacía el nombre al mismo tiempo (`setReferencia("")`).
    h.cambiar({ nombre: "" });
    h.actual.reiniciar();
    await avanzar(0);
    expect(h.actual.ficha.hoja).toBeNull();
    expect(h.actual.items).toEqual([]);
    expect(pedidos.length).toBeGreaterThan(lecturasAntes); // volvió a leer: la prenda recién creada no está en la memoria de 3 min
    // Escribe el mismo nombre otra vez: la base se vuelve a preguntar y lo respondido ya no vale.
    h.cambiar({ nombre: "Polo G4" });
    expect(h.actual.comprobando).toBe(true);
    await avanzar(400);
    expect(llamadasBase().length).toBe(2);
    responderBase(llamadasBase()[1], [parecidoDe(G44, "una_letra"), parecidoDe(g45, "una_letra")]);
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.confirmo).toBe(false);
    h.desmontar();
  });

  it("lo respondido por prenda sobrevive al cambio de nombre, de marca y de categoría (contrato decidido, no un fallo)", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G45" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "una_letra")]);
    pedidos.forEach((p) => p.resolver([candidataDe(G44)]));
    await avanzar(PAUSA_ALERTA_MS);
    h.actual.ficha.onVer("g44");
    h.actual.ficha.hoja?.onRevisada("g44");
    expect(h.actual.confirmo).toBe(true);
    h.cambiar({ nombre: "Polo G46", categoriaId: "c-otra", categoriaNombre: "Otra", marcaId: "", marcaNombre: "" });
    await avanzar(400);
    responderBase(llamadasBase().at(-1)!, [parecidoDe(G44, "una_letra")]);
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.hayUnaLetra).toBe(true);
    expect(h.actual.confirmo).toBe(true);
    h.desmontar();
  });

  it("H2. la hoja abierta no reaparece sola cuando la conexión se corta y vuelve (nadie la pidió)", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G45" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "una_letra")]);
    pedidos.forEach((p) => p.resolver([candidataDe(G44)]));
    await avanzar(PAUSA_ALERTA_MS);
    h.actual.ficha.onVer("g44");
    expect(h.actual.ficha.hoja).not.toBeNull();
    h.cambiar({ enLinea: false });
    expect(h.actual.ficha.hoja).toBeNull(); // sin red no hay hoja
    h.cambiar({ enLinea: true });
    await avanzar(0);
    // La persona no volvió a tocar «Ver y comparar»: la hoja no debería abrirse sola.
    expect(h.actual.ficha.hoja, "H2: la hoja se reabrió sola al volver la conexión").toBeNull();
    h.desmontar();
  });

  it("H1. «Prenda sin Registrar» frena «Crear» al instante, aunque la base no lo vea (sin categoría, no entra en su comprobación), y dice por qué", async () => {
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Prenda Sin Registrar" }));
    // Sin esperar ni a la base (350 ms) ni a la alerta (600 ms): el nombre reservado se sabe con lo tecleado.
    expect(h.actual.hayIdentico).toBe(true);
    expect(h.actual.motivoBloqueo).toContain("Prenda sin Registrar");
    expect(h.actual.bajoNombre.nombreReservado).toContain("ya usa el sistema");
    await avanzar(400);
    responderBase(llamadasBase()[0], []); // la base, ciega al producto especial, dice «no hay nada parecido»
    await avanzar(0);
    expect(h.actual.hayIdentico, "H1: la respuesta vacía de la base no destraba el nombre reservado").toBe(true);
    // Otro nombre cualquiera la destraba (y no queda el aviso).
    h.cambiar({ nombre: "Prenda Sin Registrar 2" });
    expect(h.actual.hayIdentico).toBe(false);
    expect(h.actual.bajoNombre.nombreReservado).toBeNull();
    expect(h.actual.motivoBloqueo).toBeNull();
    h.desmontar();
  });

  it("«casi igual»: el aviso ámbar bajo «Nombre» aparece con la alerta al día, abre la hoja en esa prenda y se va al responder; la región del resumen no repite lo dicho", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G45" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "una_letra")]);
    pedidos.forEach((p) => p.resolver([candidataDe(G44)]));
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.hayUnaLetra).toBe(true);
    expect(h.actual.confirmo).toBe(false);
    expect(h.actual.bajoNombre.avisoUnaLetra).toEqual({ id: "g44", texto: expect.stringContaining("Polo G44") });
    expect(h.actual.ficha.avisoEnLinea).toBe(true);
    h.actual.bajoNombre.onComparar("g44");
    expect(h.actual.ficha.hoja?.idEnfocado).toBe("g44");
    h.actual.ficha.hoja?.onRevisada("g44");
    await avanzar(0);
    expect(h.actual.confirmo).toBe(true);
    expect(h.actual.bajoNombre.avisoUnaLetra).toBeNull();
    expect(h.actual.ficha.avisoEnLinea).toBe(false);
    h.desmontar();
  });

  it("lectura caída con una «casi igual» de la base: la alerta no dice «Puedes seguir» (no es cierto: «Crear» espera) y manda al aviso bajo el nombre", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G45" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "una_letra")]);
    pedidos.forEach((p) => p.rechazar(new Error("falló la lectura")));
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.ficha.alerta?.tipo).toBe("fallo");
    expect(h.actual.ficha.alerta?.texto).not.toMatch(/puedes seguir/i);
    expect(h.actual.hayUnaLetra && !h.actual.confirmo).toBe(true);
    // Con la lectura caída y nada que frene, en cambio, sí se puede seguir.
    h.cambiar({ nombre: "Polo Nuevo" });
    await avanzar(400);
    responderBase(llamadasBase()[1], []);
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.ficha.alerta?.texto).toMatch(/puedes seguir/i);
    h.desmontar();
  });

  it("degradación: la lectura Y la comprobación del nombre fallan a la vez → se dice, no se frena y no se inventa «todo bien»", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G44" }));
    await avanzar(400);
    fallarBase(llamadasBase()[0]);
    pedidos.forEach((p) => p.rechazar(new Error("sin servicio")));
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.fallo).toBe(true);
    expect(h.actual.bajoNombre.noSePudoComprobar).toBe(true);
    expect(h.actual.ficha.alerta?.tipo).toBe("fallo");
    expect(h.actual.hayIdentico).toBe(false); // la base vuelve a comprobar al guardar (principio 9)
    expect(h.actual.hayUnaLetra).toBe(false);
    expect(h.actual.comprobando).toBe(false); // y «Crear» no queda esperando para siempre
    expect(h.actual.motivoBloqueo).toBeNull();
    h.desmontar();
  });

  it("una comprobación que nunca contesta vence a los 6 s y `comprobando` no queda colgado", async () => {
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G44" }));
    await avanzar(400);
    expect(h.actual.comprobando).toBe(true);
    await avanzar(6100);
    expect(h.actual.comprobando).toBe(false);
    expect(h.actual.fallo).toBe(true);
    h.desmontar();
  });

  it("sin conexión: sin alerta ni hoja, y el candado y el respaldo son los de siempre (lo que la base ya había dicho)", async () => {
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G45" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(G44, "una_letra")]);
    await avanzar(0);
    h.cambiar({ enLinea: false });
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.ficha.alerta).toBeNull();
    expect(h.actual.ficha.hoja).toBeNull();
    expect(h.actual.hayUnaLetra).toBe(true);
    expect(h.actual.confirmo).toBe(false);
    expect(h.actual.bajoNombre.respaldo.map((p) => p.id)).toEqual(["g44"]); // la casilla de siempre
    h.actual.bajoNombre.onConfirmo(true);
    expect(h.actual.confirmo).toBe(true);
    // Y la lectura no se pidió sin conexión.
    h.desmontar();
  });

  it("el idéntico de OTRA marca: frena de inmediato, con la casilla/aviso de siempre, y la alerta lo nombra cuando llega la lectura de esa prenda", async () => {
    const { leer, pedidos } = lectorManual();
    const wide = prod("wide", "Wide Leg", { categoria: "Jeans", categoriaId: "c-jeans", marca: "Jirish", marcaId: "m-jirish" });
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Wide Leg" })); // la persona eligió Krisstell
    await avanzar(400);
    responderBase(llamadasBase()[0], [parecidoDe(wide, "identico")]);
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.hayIdentico).toBe(true);
    // La lista de Krisstell todavía no llegó: el aviso de siempre (respaldo) cubre el hueco.
    expect(h.actual.bajoNombre.respaldo.map((p) => p.id)).toEqual(["wide"]);
    pedidos.filter((p) => p.marcaId !== null).forEach((p) => p.resolver([candidataDe(G44)]));
    await avanzar(0);
    // La lista llegó; el extra (prenda de otra marca) se pide aparte.
    const extra = pedidos.find((p) => p.marcaId === null && p.categoriaId === null);
    expect(extra?.idsExtra).toEqual(["wide"]);
    extra?.resolver([candidataDe(wide)]);
    await avanzar(0);
    expect(h.actual.ficha.alerta?.tipo).toBe("identico");
    expect(h.actual.ficha.alerta?.titulo).toContain("Jirish");
    expect(h.actual.ficha.alerta?.bloqueaCrear).toBe(true);
    expect(h.actual.ficha.avisoEnLinea).toBe(true);
    expect(h.actual.bajoNombre.respaldo).toEqual([]);
    expect(h.actual.hayIdentico).toBe(true);
    h.desmontar();
  });

  it("StrictMode (en desarrollo los efectos corren, se limpian y vuelven a correr): la lectura no queda colgada y la comprobación sigue funcionando", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer), { estricto: true });
    await avanzar(10);
    pedidos.filter((p) => !p.resuelto).forEach((p) => p.resolver([candidataDe(G44)]));
    await avanzar(0);
    expect(h.actual.ficha.alerta?.tipo).toBe("lista_de_marca");
    h.cambiar({ nombre: "Polo G44" });
    await avanzar(400);
    responderBase(llamadasBase().at(-1)!, [parecidoDe(G44, "identico")]);
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.hayIdentico).toBe(true);
    expect(h.actual.ficha.alerta?.tipo).toBe("identico");
    h.desmontar();
  });

  it("H5 (baja). tras un rechazo de la base, `reintentar()` deja «Crear» libre mientras la comprobación se repite", async () => {
    // El formulario llama `parecidos.reintentar()` cuando la base dijo «duplicado» al guardar (otra sede lo creó mientras se llenaba). Hasta que la base conteste
    // de nuevo, el resultado de ANTES (sin idéntico) sigue valiendo para ese nombre y `comprobando` es falso: un segundo clic a «Crear» llega a la base y vuelve a fallar.
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G44" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], []);
    await avanzar(0);
    expect(h.actual.comprobando).toBe(false);
    h.actual.reintentar();
    await avanzar(0);
    expect(h.actual.comprobando, "H5: tras `reintentar()` la pantalla no espera la nueva respuesta").toBe(true);
    h.desmontar();
  });

  it("nombre vacío o de solo espacios: no se pregunta nada a la base y nada queda «comprobando»", async () => {
    const { leer } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "" }));
    await avanzar(1000);
    expect(llamadasBase()).toEqual([]);
    expect(h.actual.comprobando).toBe(false);
    expect(h.actual.hayIdentico || h.actual.hayUnaLetra).toBe(false);
    expect(h.actual.motivoBloqueo).toBeNull();
    h.desmontar();
  });

  it("una lectura que falla a MITAD (`LecturaParcial`): se ve lo que sí llegó, se dice que falta y la hoja lo avisa; nada frena por eso", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer, { nombre: "Polo G44" }));
    await avanzar(400);
    responderBase(llamadasBase()[0], []);
    pedidos.forEach((p) => p.rechazar(new LecturaParcial([candidataDe(G44)], "no se leyeron las fotos de algunas prendas")));
    await avanzar(PAUSA_ALERTA_MS);
    expect(h.actual.ficha.alerta?.tipo).toBe("fallo"); // se dice, no se inventa «todo bien»
    h.actual.ficha.onVer("g44");
    expect(h.actual.ficha.hoja?.fallo).toBe(true);
    expect(h.actual.ficha.hoja?.resultado.lista.map((x) => x.candidata.id)).toEqual(["g44"]); // lo leído se conserva
    expect(h.actual.hayIdentico).toBe(false); // la base dijo que no hay idéntico y la pantalla no lo contradice
    expect(h.actual.comprobando).toBe(false);
    h.desmontar();
  });

  it("los dos relojes (350 ms la base, 600 ms la alerta) no dejan «Crear» libre a mitad de camino: nombre idéntico tecleado letra por letra", async () => {
    const { leer, pedidos } = lectorManual();
    const h = montarHook(useParecidasAlta, armarEntrada(leer));
    await avanzar(10);
    pedidos.forEach((p) => p.resolver([candidataDe(G44)]));
    await avanzar(0);
    const esperaCrear = () => h.actual.comprobando || h.actual.hayIdentico || (h.actual.hayUnaLetra && !h.actual.confirmo);
    for (const nombre of ["P", "Po", "Pol", "Polo", "Polo ", "Polo G", "Polo G4", "Polo G44"]) {
      h.cambiar({ nombre });
      await avanzar(120);
    }
    // Al terminar de teclear el idéntico: en ningún instante «Crear» quedó libre con la respuesta pendiente.
    expect(esperaCrear()).toBe(true);
    await avanzar(400);
    for (const l of llamadasBase().filter((x) => !x.respondida)) responderBase(l, baseBuscar(String(l.args.p_referencia), [G44]));
    await avanzar(0);
    expect(h.actual.hayIdentico).toBe(true);
    h.desmontar();
  });
});

// ============================================================================
// 5. El modelo: secuencias al azar de eventos contra los hooks reales
// ============================================================================
//
// En cada instante (no solo cuando todo se asentó) se comprueba que lo que ve el formulario —`comprobando`, `hayIdentico`, `hayUnaLetra`,
// `confirmo`— nunca contradice a la base, por mucho que las respuestas lleguen tarde, desordenadas o no lleguen: se teclea, se cambia la marca y
// la categoría, se corta la red, se responden (o no) las lecturas y la comprobación, se contesta en la hoja, se marca la casilla, se reintenta y
// se reinicia («Crear otro parecido»).

type Evento = string;
type Violacion = { invariante: string; semilla: number; detalle: string; traza: Evento[] };

type CoberturaModelo = { pasos: number; identico: number; unaLetra: number; confirmada: number; falloBase: number; hoja: number; respuestaTardia: number; lecturaTardia: number; sinRed: number; asentados: number };
const COBERTURA_CERO = (): CoberturaModelo => ({ pasos: 0, identico: 0, unaLetra: 0, confirmada: 0, falloBase: 0, hoja: 0, respuestaTardia: 0, lecturaTardia: 0, sinRed: 0, asentados: 0 });

async function correrSecuencia(semillaN: number, pasos: number, violaciones: Map<string, Violacion>, cobertura: CoberturaModelo = COBERTURA_CERO()) {
  const azar = semilla(semillaN);
  const elegir = <T,>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)];
  base.llamadas.length = 0;

  // La base de datos de esta corrida: fija (lo que cambia es lo que llega y cuándo).
  const universo = escenario(azar).productos;
  const visibles = universo.filter((p) => p.categoria !== null && p.estadoAlta !== "rechazado");
  const datosDeLectura = (p: PedidoLectura): CandidataAlta[] => {
    const lista = p.marcaId ? visibles.filter((x) => x.marcaId === p.marcaId) : p.categoriaId ? visibles.filter((x) => x.categoriaId === p.categoriaId) : [];
    const extras = visibles.filter((x) => p.idsExtra.includes(x.id));
    return [...new Map([...lista, ...extras].map((x) => [x.id, x])).values()].map((x) => candidataDe(x));
  };

  const { leer, pedidos } = lectorManual({ rechazaAlAbortar: false });
  let marca = elegir<Marca>([{ id: "", nombre: "" }, ...MARCAS, { id: "mi", nombre: "Importado" }]);
  let categoria = elegir(CATEGORIAS);
  let nombre = "";
  const respondidas = new Set<string>(); // lo que la persona contestó en la hoja (por prenda)
  let casillaPara: string | null = null; // el nombre para el que marcó la casilla de siempre
  let tNombre = Date.now(); // cuándo se cambió el nombre por última vez: la alerta se pone al día 0,6 s después (la base, a los 0,35 s)
  let enLinea = true;
  const traza: Evento[] = [];
  const entrada = (): EntradaParecidasAlta => ({ nombre, descripcion: "", tejido: null, patron: null, categoriaId: categoria.id, categoriaNombre: categoria.nombre, marcaId: marca.id, marcaNombre: marca.nombre, enLinea, leer });
  const h = montarHook(useParecidasAlta, entrada());

  const anotar = (invariante: string, detalle: string) => {
    if (!violaciones.has(invariante)) violaciones.set(invariante, { invariante, semilla: semillaN, detalle, traza: [...traza] });
  };

  const revisar = (paso: string) => {
    const a = h.actual;
    const items = baseBuscar(nombre, universo);
    const hayId = items.some((p) => p.nivel === "identico");
    const hayUna = items.some((p) => p.nivel === "una_letra");
    const espera = a.comprobando || a.hayIdentico || (a.hayUnaLetra && !a.confirmo);
    cobertura.pasos++;
    if (a.hayIdentico) cobertura.identico++;
    if (a.hayUnaLetra) cobertura.unaLetra++;
    if (a.hayUnaLetra && a.confirmo) cobertura.confirmada++;
    if (a.fallo) cobertura.falloBase++;
    if (a.ficha.hoja) cobertura.hoja++;
    if (!enLinea) cobertura.sinRed++;
    const contexto = `nombre=${JSON.stringify(nombre)} items=${JSON.stringify(a.items.map((p) => [p.id, p.nivel]))} oraculo=${JSON.stringify(items.map((p) => [p.id, p.nivel]))} comprobando=${a.comprobando} fallo=${a.fallo} confirmo=${a.confirmo} hayIdentico=${a.hayIdentico} hayUnaLetra=${a.hayUnaLetra} enLinea=${enLinea} tras=${paso}`;
    if (nombre === "") return;
    // D. lo que la base dijo de OTRO nombre nunca se muestra
    if (a.items.some((p) => !items.some((o) => o.id === p.id && o.nivel === p.nivel))) anotar("D. se muestra lo que la base dijo de otro nombre", contexto);
    // I. la confirmación no se regala: cada «una letra» está respondida (en la hoja) o la casilla de ese nombre está marcada
    if (!a.comprobando && a.hayUnaLetra && a.confirmo) {
      const sinRespuesta = items.filter((p) => p.nivel === "una_letra" && !respondidas.has(p.id));
      if (sinRespuesta.length > 0 && casillaPara !== nombre) anotar("I2. «confirmo» sin que la persona respondiera", `${contexto} sinRespuesta=${sinRespuesta.map((p) => p.id).join()}`);
    }
    if (a.fallo) return; // sin respuesta no hay nada que contradecir: la base comprueba al guardar (principio 9)
    // A. lo que la pantalla deja pasar, la base lo acepta
    if (!espera) {
      const r = baseCrear(nombre, a.confirmo, universo);
      if (r === "nombre_duplicado" || r === "nombre_casi_igual") anotar("A. «Crear» libre y la base lo rechaza", `${contexto} base=${r}`);
    }
    if (!a.comprobando) {
      // B. lo que la base aceptaría sin pedir nada, la pantalla no lo frena
      if (!hayId && !hayUna && espera) anotar("B. «Crear» frenado y la base lo aceptaría", contexto);
      // C. un idéntico siempre frena; una letra espera
      if (hayId && !a.hayIdentico) anotar("C. idéntico sin frenar", contexto);
      if (hayUna && !a.hayUnaLetra) anotar("C2. una letra sin marcar", contexto);
      // E. si espera, dice por qué (lector de pantalla y pie)
      if ((a.hayIdentico || (a.hayUnaLetra && !a.confirmo)) && a.motivoBloqueo === null) anotar("E. espera sin decir por qué", contexto);
      if (!(a.hayIdentico || (a.hayUnaLetra && !a.confirmo)) && a.motivoBloqueo !== null) anotar("E2. dice que espera y no espera", `${contexto} motivo=${a.motivoBloqueo}`);
    }
    // G. la lista de la alerta es de la marca (o categoría) de AHORA, nunca de la anterior
    const mEf = marcaEfectiva(marca.id, marca.nombre);
    const alerta = a.ficha.alerta;
    // La alerta dibuja el nombre de la pausa: durante 0,6 s después de teclear puede ir un paso atrás de la base (por diseño, maqueta aprobada).
    const alertaAlDia = Date.now() - tNombre >= PAUSA_ALERTA_MS;
    if (alertaAlDia && alerta && !["identico", "casi_igual", "cargando", "fallo"].includes(alerta.tipo)) {
      for (const f of alerta.filas) {
        const p = universo.find((x) => x.id === f.id);
        const delAlcance = p && (mEf.id ? p.marcaId === mEf.id : p.categoriaId === categoria.id);
        if (!delAlcance && !items.some((i) => i.id === f.id)) anotar("G. la alerta lista una prenda de otra marca o categoría", `${contexto} alerta=${alerta.tipo} fila=${f.id}`);
      }
    }
    if (alertaAlDia && alerta?.tipo === "identico" && !hayId && !a.comprobando) anotar("F. la alerta dice «ya existe» y la base no", contexto);
  };

  const dejarCorrer = async (ms: number) => {
    await avanzar(ms);
  };
  const pendientesBase = () => llamadasBase().filter((l) => !l.respondida);
  const pendientesLectura = () => pedidos.filter((p) => !p.resuelto);

  const accion = async (): Promise<Evento> => {
    const r = azar();
    if (r < 0.2) {
      nombre = azar() < 0.12 ? "" : tituloReferencia(mutar(azar, azar() < 0.7 && universo.length > 0 ? elegir(universo).referencia : elegir(NOMBRES)));
      tNombre = Date.now();
      h.cambiar({ nombre });
      return `teclear ${JSON.stringify(nombre)}`;
    }
    if (r < 0.28) {
      marca = elegir<Marca>([{ id: "", nombre: "" }, ...MARCAS, { id: "mi", nombre: "Importado" }]);
      h.cambiar({ marcaId: marca.id, marcaNombre: marca.nombre });
      return `marca ${marca.nombre || "(ninguna)"}`;
    }
    if (r < 0.33) {
      categoria = elegir(CATEGORIAS);
      h.cambiar({ categoriaId: categoria.id, categoriaNombre: categoria.nombre });
      return `categoría ${categoria.nombre}`;
    }
    if (r < 0.5) {
      const ms = elegir([0, 50, 200, 349, 350, 351, 500, 599, 600, 601, 1500, 3100, 6500]);
      await dejarCorrer(ms);
      return `tiempo +${ms} ms`;
    }
    if (r < 0.64) {
      const p = pendientesBase();
      if (p.length === 0) return "responder base (nada pendiente)";
      const l = elegir(p);
      const q = azar();
      const nombrePedido = String(l.args.p_referencia);
      if (nombrePedido !== nombre) cobertura.respuestaTardia++;
      if (q < 0.1) fallarBase(l);
      else responderBase(l, baseBuscar(nombrePedido, universo));
      await dejarCorrer(0);
      return `responder base de ${JSON.stringify(nombrePedido)}${q < 0.1 ? " (falla)" : ""}`;
    }
    if (r < 0.78) {
      const p = pendientesLectura();
      if (p.length === 0) return "responder lectura (nada pendiente)";
      const l = elegir(p);
      const q = azar();
      if ((l.marcaId ?? "") !== marcaEfectiva(marca.id, marca.nombre).id && l.marcaId !== null) cobertura.lecturaTardia++;
      if (q < 0.1) l.rechazar(new Error("sin servicio"));
      else l.resolver(datosDeLectura(l));
      await dejarCorrer(0);
      return `responder lectura marca=${l.marcaId} cat=${l.categoriaId} extras=${l.idsExtra.length}${q < 0.1 ? " (falla)" : ""}`;
    }
    if (r < 0.84) {
      const f = h.actual.ficha.alerta?.filas[0];
      if (f) h.actual.ficha.onVer(f.id);
      else h.actual.abrirHoja();
      return `abrir hoja${f ? ` en ${f.id}` : ""}`;
    }
    if (r < 0.9) {
      const hoja = h.actual.ficha.hoja;
      if (!hoja) return "contestar (no hay hoja)";
      const q = azar();
      const ids = hoja.resultado.lista.filter((x) => x.nivel !== "identico").map((x) => x.candidata.id);
      if (q < 0.4 && ids.length > 0) {
        const id = elegir(ids);
        hoja.onRevisada(id);
        respondidas.add(id);
      } else if (q < 0.6) {
        hoja.onNinguna(ids);
        ids.forEach((id) => respondidas.add(id));
      } else if (q < 0.75 && ids.length > 0) {
        const id = elegir(ids);
        hoja.onDeshacer(id);
        respondidas.delete(id);
      } else hoja.onCerrar();
      return `contestar en la hoja (${q.toFixed(2)})`;
    }
    if (r < 0.93) {
      const v = azar() < 0.7;
      h.actual.bajoNombre.onConfirmo(v);
      casillaPara = v ? nombre : null;
      return `casilla ${v}`;
    }
    if (r < 0.96) {
      enLinea = !enLinea;
      h.cambiar({ enLinea });
      return enLinea ? "vuelve la red" : "se corta la red";
    }
    if (r < 0.98) {
      h.actual.reintentar();
      await dejarCorrer(0);
      return "reintentar";
    }
    nombre = "";
    tNombre = Date.now();
    respondidas.clear();
    casillaPara = null;
    h.cambiar({ nombre });
    h.actual.reiniciar();
    await dejarCorrer(0);
    return "reiniciar (Crear otro parecido)";
  };

  for (let n = 0; n < pasos; n++) {
    const e = await accion();
    traza.push(e);
    revisar(e);
  }

  // Asentar: todo lo pendiente responde bien y pasa el tiempo. Ahí el candado tiene que ser exacto, y debe haber una salida para cada «una letra».
  enLinea = true;
  h.cambiar({ enLinea });
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    await dejarCorrer(700);
    for (const l of pendientesBase()) responderBase(l, baseBuscar(String(l.args.p_referencia), universo));
    for (const l of pendientesLectura()) l.resolver(datosDeLectura(l));
    await dejarCorrer(0);
  }
  await dejarCorrer(1000);
  traza.push("(todo se asienta)");
  cobertura.asentados++;
  revisar("asentado");
  const a = h.actual;
  if (nombre !== "") {
    if (a.comprobando) anotar("H. «comprobando» no se apaga con todo respondido", `nombre=${JSON.stringify(nombre)}`);
    const items = baseBuscar(nombre, universo);
    const pendientes = items.filter((p) => p.nivel === "una_letra");
    if (!a.hayIdentico && a.hayUnaLetra && !a.confirmo) {
      // Toda «una letra» pendiente tiene dónde responderse: tarjeta en la hoja, o la casilla de siempre. Se contesta y se destraba.
      h.actual.abrirHoja();
      const hoja = h.actual.ficha.hoja;
      for (const p of pendientes) {
        const tarjeta = hoja?.resultado.lista.find((x) => x.candidata.id === p.id && x.nivel === "casi_igual");
        if (tarjeta) hoja?.onRevisada(p.id);
      }
      h.actual.ficha.hoja?.onCerrar();
      if (h.actual.bajoNombre.respaldo.some((p) => p.nivel === "una_letra")) h.actual.bajoNombre.onConfirmo(true);
      if (h.actual.hayUnaLetra && !h.actual.confirmo) anotar("I. una letra que no se puede responder (sin tarjeta ni casilla)", `nombre=${JSON.stringify(nombre)} pendientes=${JSON.stringify(pendientes.map((p) => p.id))} respaldo=${JSON.stringify(h.actual.bajoNombre.respaldo.map((p) => p.id))}`);
    }
  }
  h.desmontar();
  vi.clearAllTimers();
}

async function correrModelo(semillas: number, pasos: number, cobertura = COBERTURA_CERO()) {
  const violaciones = new Map<string, Violacion>();
  for (let n = 1; n <= semillas; n++) await correrSecuencia(n, pasos, violaciones, cobertura);
  return violaciones;
}
const informeDe = (v: Map<string, Violacion>) => [...v.values()].map((x) => `${x.invariante}\n  semilla=${x.semilla}\n  ${x.detalle}\n  traza: ${x.traza.join(" › ")}`);

describe("5. el modelo de secuencias: nunca se contradice a la base, en ningún instante", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    vi.stubGlobal("HTMLElement", class {});
    vi.stubGlobal("document", { activeElement: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mutante.activo = null;
  });

  it("600 secuencias de 60 eventos (teclear, marca, categoría, tiempo, respuestas tardías y fallidas, hoja, casilla, red, reintentar, reiniciar)", async () => {
    const cobertura = COBERTURA_CERO();
    const violaciones = await correrModelo(600, 60, cobertura);
    // El modelo tiene que tocar de verdad lo que vigila.
    for (const [caso, veces] of Object.entries(cobertura)) expect(veces, `el modelo no tocó «${caso}»`).toBeGreaterThan(50);
    const informe = informeDe(violaciones);
    expect(informe, informe.join("\n\n")).toEqual([]);
  }, 300_000);

  // La prueba se prueba a sí misma: con un candado roto a propósito el modelo TIENE que acusarlo.
  it.each([
    ["confirmo siempre verdadero (se regala la confirmación)", (s: SalidaEstado) => ({ ...s, confirmo: true }), /^I2\./],
    ["el idéntico nunca frena", (s: SalidaEstado) => ({ ...s, nombreBloqueado: false }), /^C\./],
    ["«una letra» nunca se marca", (s: SalidaEstado) => ({ ...s, hayUnaLetra: false }), /^C2\./],
    ["confirmo siempre falso (callejón sin salida)", (s: SalidaEstado) => ({ ...s, confirmo: false }), /^I\./],
    ["frena siempre", (s: SalidaEstado) => ({ ...s, nombreBloqueado: true }), /^B\./],
  ])("el modelo caza un candado roto: %s", async (_nombre, roto, esperada) => {
    mutante.activo = roto as (s: unknown) => unknown;
    const violaciones = await correrModelo(80, 40);
    expect([...violaciones.keys()].some((k) => esperada.test(k)), `el modelo no acusó el candado roto; acusó: ${[...violaciones.keys()].join(" | ") || "nada"}`).toBe(true);
  }, 120_000);
});

// ============================================================================
// 6. Estados límite: lo que ve la persona en cada borde
// ============================================================================

const BASE_SIN_NADA: BaseComprobada = { items: [], fallo: false, comprobando: false, hayIdentico: false, hayUnaLetra: false, confirmo: false };

/** Arma la salida como el hook, con lo mínimo: las reglas reales con lo dicho y la base con sus items. */
function salidaDe(o: {
  candidatas?: CandidataAlta[];
  marca?: Marca | null;
  categoria?: { id: string; nombre: string } | null;
  nombre?: string;
  base?: BaseComprobada;
  cargando?: boolean;
  falloLectura?: boolean;
  enLinea?: boolean;
  activo?: boolean;
  revisadas?: string[];
  frenaCasiIgual?: boolean;
}): SalidaEstado {
  const marca = o.marca === undefined ? MARCAS[1] : o.marca;
  const categoria = o.categoria === undefined ? CATEGORIAS[1] : o.categoria;
  const nombre = o.nombre ?? "";
  const activo = o.activo ?? true;
  const enLinea = o.enLinea ?? true;
  const efectiva = marcaEfectiva(marca?.id ?? "", marca?.nombre ?? "");
  const resultado =
    activo && enLinea
      ? ordenarParaAlta({ candidatas: o.candidatas ?? [], marcaId: efectiva.id, marca: efectiva.nombre, categoriaId: categoria?.id ?? null, categoria: categoria?.nombre ?? null, nombre, descripcion: "", tejido: null, patron: null, ahora: AHORA })
      : null;
  return armarParecidasDelAlta({ activo, enLinea, base: o.base ?? BASE_SIN_NADA, cargando: o.cargando ?? false, falloLectura: o.falloLectura ?? false, resultado, marca: efectiva.nombre, categoria: categoria?.nombre ?? null, nombreVigente: nombre, atrasada: false, revisadas: o.revisadas ?? [], rotuloTiempo }, o.frenaCasiIgual);
}

const polo = (id: string, referencia: string, extra: Partial<ProductoBase> = {}) => candidataDe(prod(id, referencia, extra));

describe("6. estados límite", () => {
  it("sin categoría elegida: no hay alerta, ni respaldo, ni «Revisa»; el candado es solo el de la base", () => {
    const s = salidaDe({ activo: false, categoria: null, nombre: "Polo G44", candidatas: [polo("g44", "Polo G44")] });
    expect(s.alerta).toBeNull();
    expect(s.avisoNombre).toBeNull();
    expect(s.respaldo).toEqual([]);
    expect(s.pieRevisa).toBeNull();
    expect(espera(s)).toBe(false);
  });

  it("sin marca y sin nombre: no dice nada (no hay con qué comparar), aunque la lista de la categoría esté cargada", () => {
    expect(salidaDe({ marca: null, nombre: "", candidatas: [polo("g44", "Polo G44")] }).alerta).toBeNull();
    // espacios solos llegan al hook ya recortados a «»
    expect(tituloReferencia("   ")).toBe("");
  });

  it("marca nula, con el uuid nulo o «Importado»: manda la categoría (D5) y la lista no trae prendas de otras categorías", () => {
    expect(marcaEfectiva(MARCA_SIN_MARCA_ID, "Algo")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("  ", "Krisstell")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("m", "  ")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("m", "IMPORTADO ")).toEqual({ id: null, nombre: null });
    expect(marcaEfectiva("m", "Importada")).toEqual({ id: "m", nombre: "Importada" }); // solo «Importado» es comodín
    const s = salidaDe({ marca: { id: "mi", nombre: "Importado" }, nombre: "Polo Nuevo", candidatas: [polo("g44", "Polo G44")] });
    expect(s.alerta?.tipo).toBe("sin_marca");
  });

  it("categoría sin prendas: con marca, una línea neutra que no promete ni juzga; sin marca y con nombre, lo mismo", () => {
    expect(salidaDe({ candidatas: [] }).alerta).toMatchObject({ tipo: "vacia", formaTitulo: "linea", titulo: "No hay prendas de Krisstell en Polos todavía." });
    expect(salidaDe({ marca: null, nombre: "Polo Nuevo", candidatas: [] }).alerta).toMatchObject({ tipo: "sin_marca" });
  });

  it("0, 1 y 200 candidatas: 0 = vacía; 1 = singular; 200 = «búscala» y nunca más de 2 filas en el resumen", () => {
    expect(salidaDe({ candidatas: [] }).alerta?.tipo).toBe("vacia");
    const una = salidaDe({ candidatas: [polo("g44", "Polo G44")] }).alerta;
    expect(una).toMatchObject({ tipo: "lista_de_marca", titulo: "Ya hay 1 prenda de Krisstell en Polos" });
    const muchas = Array.from({ length: 200 }, (_, n) => polo(`p${n}`, `Polo Modelo ${n}`));
    const s = salidaDe({ candidatas: muchas });
    expect(s.alerta?.filas.length).toBeLessThanOrEqual(2);
    expect(s.alerta?.masFilas).toBe(198);
    expect(s.alerta?.resumenAvance).toBe("Hay 200 prendas de Krisstell: búscala");
    expect(espera(s)).toBe(false); // lo informativo nunca frena
  });

  it("300 candidatas (el tope de la lectura): ordenar y armar la alerta cabe en el tiempo de una pausa de tecleo", () => {
    const muchas = Array.from({ length: 300 }, (_, n) =>
      polo(`p${n}`, `Polo ${["Wide", "Corto", "Largo", "Mom", "Recto"][n % 5]} Modelo ${n}`, { id: `p${n}` }),
    ).map((c, n) => ({ ...c, descripcion: n % 3 === 0 ? `SS25 ${300 + n} corte recto` : null, tejido: n % 2 ? "Denim" : "Rib", patron: "Liso" }));
    const medir = () => {
      const t0 = performance.now();
      const r = ordenarParaAlta({ candidatas: muchas, marcaId: KRISS.id, marca: KRISS.nombre, categoriaId: POLOS.id, categoria: POLOS.nombre, nombre: "Polo Wide Modelo 12", descripcion: "SS25 311", tejido: "Denim", patron: "Liso", ahora: AHORA });
      expect(r.lista.length).toBe(300);
      return performance.now() - t0;
    };
    medir(); // calentar
    const tiempos = [medir(), medir(), medir()].sort((a, b) => a - b);
    // Cada pausa de tecleo ordena una vez (y otra con la hoja en «toda la marca»): por debajo de unos 100 ms no se nota. El tope es holgado a propósito.
    expect(tiempos[1], `ordenar 300 prendas tardó ${tiempos.map((t) => t.toFixed(1)).join(" / ")} ms`).toBeLessThan(400);
  });

  it("una prenda descontinuada con el mismo nombre también frena (la base no mira el estado) y su ficha dice cómo volver a usarla", () => {
    const g44 = polo("g44", "Polo G44", { estado: "descontinuado" });
    const s = salidaDe({ nombre: "Polo G44", candidatas: [g44], base: { ...BASE_SIN_NADA, items: [{ id: "g44", referencia: "Polo G44", categoria: "Polos", nivel: "identico" }], hayIdentico: true } });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.alerta?.tipo).toBe("identico");
    expect(s.alerta?.filas[0].descontinuada).toBe(true);
    const hoja = armarHoja({ resultado: ordenarParaAlta({ candidatas: [g44], marcaId: KRISS.id, marca: KRISS.nombre, categoriaId: POLOS.id, categoria: POLOS.nombre, nombre: "Polo G44", descripcion: "", tejido: null, patron: null, ahora: AHORA }), marca: "Krisstell", categoria: "Polos", alcance: "lista", revisadas: [], busqueda: "", buscar: buscarParecidas, rotuloTiempo, fallo: false });
    expect(hoja.tarjetas[0].frase).toContain("«Estado»");
  });

  it("una prenda sin categoría en la lista no rompe nada ni se cuenta como «de la categoría»", () => {
    const sinCat = polo("x", "Polo Suelto", { categoria: null, categoriaId: null });
    const s = salidaDe({ nombre: "Polo Suelto", candidatas: [sinCat, polo("g44", "Polo G44")] });
    expect(s.alerta?.tipo).toBe("identico");
    const hoja = armarHoja({ resultado: ordenarParaAlta({ candidatas: [sinCat], marcaId: KRISS.id, marca: "Krisstell", categoriaId: POLOS.id, categoria: "Polos", nombre: "Polo Otro", descripcion: "", tejido: null, patron: null, ahora: AHORA }), marca: "Krisstell", categoria: "Polos", alcance: "lista", revisadas: [], busqueda: "", buscar: buscarParecidas, rotuloTiempo, fallo: false });
    expect(hoja.tarjetas.length).toBe(0); // sin categoría no es «de Polos»: va a «otra categoría», no a la lista
  });

  it("lectura que falla: no frena por su cuenta, pide reintentar y lo que la base ya vio sigue a la vista", () => {
    const base: BaseComprobada = { ...BASE_SIN_NADA, items: [{ id: "g44", referencia: "Polo G44", categoria: "Polos", nivel: "parecido" }] };
    const s = salidaDe({ nombre: "Polo G4", falloLectura: true, base });
    expect(s.alerta).toMatchObject({ tipo: "fallo", accion: { tipo: "reintentar" } });
    expect(s.respaldo.map((p) => p.id)).toEqual(["g44"]);
    expect(espera(s)).toBe(false);
  });

  it("el idéntico en OTRA marca frena, se ve (alerta y aviso bajo el nombre) y dice qué cambiar: no es la prenda de la marca elegida", () => {
    const wide = polo("wide", "Wide Leg", { categoria: "Jeans", categoriaId: "c-jeans", marca: "Jirish", marcaId: "m-jirish" });
    const s = salidaDe({ nombre: "Wide Leg", candidatas: [polo("g44", "Polo G44"), wide], base: { ...BASE_SIN_NADA, items: [{ id: "wide", referencia: "Wide Leg", categoria: "Jeans", nivel: "identico" }], hayIdentico: true } });
    expect(s.nombreBloqueado).toBe(true);
    expect(s.alerta?.titulo).toBe("Ya existe «Wide Leg» en Jirish");
    expect(s.alerta?.motivoBloqueo).toContain("agrégale el modelo o la marca");
    expect(s.avisoNombre?.texto).toContain("Jirish");
    expect(s.alerta?.accion).toMatchObject({ tipo: "ver_ficha", href: "/productos/wide/editar" });
  });

  it("«Polo G-44» contra «Polo G44»: la clave de la base quita la puntuación, así que es el mismo nombre (idéntico, no «casi igual»)", () => {
    const g44 = polo("g44", "Polo G44");
    const s = salidaDe({ nombre: "Polo G-44", candidatas: [g44], base: { ...BASE_SIN_NADA, items: [{ id: "g44", referencia: "Polo G44", categoria: "Polos", nivel: "identico" }], hayIdentico: true } });
    expect(s.alerta?.tipo).toBe("identico");
    expect(s.alerta?.titulo).toBe("Ya existe «Polo G44»");
  });

  it("H3. «Ninguna es mi prenda» con una búsqueda activa NO marca lo que la búsqueda ocultó (la persona no vio esas tarjetas)", () => {
    // «Polo G44» (casi igual al nombre tecleado, y la base espera una respuesta) y dos prendas con código en la descripción. Se busca un código: la
    // tarjeta de «Polo G44» queda oculta, pero el botón del pie marcaría TAMBIÉN esa y destrabaría «Crear» sin que la persona la haya visto.
    const g44 = polo("g44", "Polo G44");
    const a = polo("a", "Polo Aurora", { id: "a" } as never);
    const b = polo("b", "Polo Brisa");
    const conCodigo = [{ ...a, descripcion: "SS25 311" }, { ...b, descripcion: "SS25 312" }];
    const resultado = ordenarParaAlta({ candidatas: [g44, ...conCodigo], marcaId: KRISS.id, marca: "Krisstell", categoriaId: POLOS.id, categoria: "Polos", nombre: "Polo G45", descripcion: "", tejido: null, patron: null, ahora: AHORA });
    expect(resultado.lista.find((x) => x.candidata.id === "g44")?.nivel).toBe("casi_igual");
    const hoja = armarHoja({ resultado, marca: "Krisstell", categoria: "Polos", alcance: "lista", revisadas: [], busqueda: "SS25 311", buscar: buscarParecidas, rotuloTiempo, fallo: false });
    const visibles = hoja.tarjetas.map((t) => t.id);
    // Con un código buscado la lista solo se ORDENA (no oculta): para ocultar de verdad hace falta un texto que no coincida.
    const hojaTexto = armarHoja({ resultado, marca: "Krisstell", categoria: "Polos", alcance: "lista", revisadas: [], busqueda: "aurora", buscar: buscarParecidas, rotuloTiempo, fallo: false });
    const visiblesTexto = hojaTexto.tarjetas.map((t) => t.id);
    expect(visiblesTexto).toEqual(["a"]);
    expect(visibles.length).toBeGreaterThan(0);
    const noVistas = hojaTexto.idsNinguna.filter((id) => !visiblesTexto.includes(id));
    expect(noVistas, `H3: «Ninguna es mi prenda» marcaría ${noVistas.join(", ")} sin que su tarjeta se haya visto`).toEqual([]);
  });

  it("la bandera `CASI_IGUAL_FRENA_EN_BASE` es verdadera mientras la base siga rechazando «una letra» sin `p_confirmo_distinto` (ver H7: la rama falsa está incompleta)", () => {
    expect(CASI_IGUAL_FRENA_EN_BASE).toBe(true);
  });

  // Decisión 3 de Felipe («solo frena el idéntico exacto») contra lo integrado: hoy «una letra» frena hasta que la persona abre la hoja y contesta, porque la base
  // la rechaza sin `p_confirmo_distinto`. «Polo G45» frente a «Polo G44» es el caso real de tienda (numeración de proveedor, prendas DISTINTAS): cada alta obliga a
  // abrir la hoja. Es la pregunta 1 del integrador y la decide Felipe; mientras tanto la rama «no frena» queda completa y probada.
  it("H7. con «no frena» (`frenaCasiIgual = false`) «una letra» solo avisa y `confirmo` sale en `true`: la base que aún lo exija no rechaza en un bucle sin salida", () => {
    const g44 = polo("g44", "Polo G44");
    const base = { ...BASE_SIN_NADA, items: [{ id: "g44", referencia: "Polo G44", categoria: "Polos", nivel: "una_letra" as const }], hayUnaLetra: true };
    const frena = salidaDe({ nombre: "Polo G45", candidatas: [g44], base });
    expect(frena.hayUnaLetra).toBe(true);
    expect(frena.confirmo).toBe(false);
    expect(frena.avisoUnaLetra).not.toBeNull();
    const noFrena = salidaDe({ nombre: "Polo G45", candidatas: [g44], base, frenaCasiIgual: false });
    expect(noFrena.hayUnaLetra).toBe(false); // «Crear» no espera
    expect(noFrena.confirmo).toBe(true); // y lo que viaja como `p_confirmo_distinto` es «sí»: la persona ya vio la alerta
    expect(noFrena.avisoUnaLetra).toBeNull();
    expect(noFrena.alerta?.tipo).toBe("casi_igual"); // la alerta del resumen sigue avisando
    // Sin «una letra» la bandera no cambia nada: `confirmo` sigue siendo la casilla.
    expect(salidaDe({ nombre: "Polo Nuevo", frenaCasiIgual: false }).confirmo).toBe(false);
  });
});

describe("6b. nombres raros", () => {
  const completo: EstadoAlta = {
    categoriaId: "c", referencia: "Blusa Camila", comprobandoNombre: false, nombreBloqueado: false, nombreSinConfirmar: false, categoriaSinTallas: false, tallasElegidas: 3, exigeTejidoPatron: false,
    hayTejidosEnCategoria: false, hayPatronesEnCategoria: false, tejidoId: "", patronId: "", celdasIncluidas: 3, precioBase: "89.9", costoBase: "32", stockTotal: 6, stockInvalidas: 0, sinStock: false, separaPiso: true, lugarCarga: "almacen",
  };

  it("H6 (baja). un nombre sin ni una letra ni un número («...», «---», «¿?», «✨») lo rechaza la base DESPUÉS de los 4 pasos: `problemasAlta` debería pedir corregirlo", () => {
    // `fn_clave_referencia` da null → `crear_producto_con_variantes` lanza «El nombre del producto necesita al menos una letra o un número.».
    const sinPedir = ["...", "---", "+ +", "¿?", "( )", "✨", "—"].filter((referencia) => {
      expect(claveReferencia(tituloReferencia(referencia))).toBe("");
      return !problemasAlta({ ...completo, referencia }).some((p) => p.bloque === "nombre");
    });
    expect(sinPedir, "H6: problemasAlta deja «Crear» habilitado con estos nombres").toEqual([]);
  });

  it("H8 (baja, ya estaba en HEAD). sin conexión, dos altas con el MISMO nombre para la base («Polo G44», «Polo G-44», «Polo G 44», «Polo G44.») no se reconocen en la cola", () => {
    // `nombreEnCola` compara con un pliegue propio (sin puntuación ni espacios interiores no): la base, con `fn_clave_referencia`. La segunda alta la rechazaría la base
    // al subir, días después, cuando la persona ya no está delante (justo lo que `nombreEnCola` dice evitar).
    const op = nuevaOperacion({ token: "t1", rpc: "crear_producto_con_stock_inicial", params: { p_referencia: "Polo G44" }, firma: null, resumen: "Polo G44 · 1 variante" });
    expect(nombreEnCola([op], "Polo G44")).toBe(true);
    const sinDetectar = ["polo g44", "Polo G-44", "Polo G 44", "Polo G44."].filter((n) => claveReferencia(n) === claveReferencia("Polo G44") && !nombreEnCola([op], n));
    expect(sinDetectar, "H8: la cola sin conexión no detecta estos nombres, que son el mismo para la base").toEqual([]);
  });

  it("Unicode raro (emoji, letras fuera de a-z, marcas combinantes, cadenas largas) no rompe las reglas ni cambia el nivel respecto de la base", () => {
    const azar = semilla(4242);
    const piezas = ["Polo", "G44", "wide", "leg", "😀", "ñ", "Ü", "é", "ç", "ø", "я", "中", "\u0301", "\u200b", "\u0000", "  ", "-", "+", ".", "%", "\\", "'", "\"", "İ", "K"];
    const prods: ProductoBase[] = ["Polo G44", "Wide Leg", "Camisa Lara", "Polo Ñandú", "Ølm", "Polo 😀"].map((r, n) => ({ ...prod(`p${n}`, r), categoria: "Polos" }));
    const t0 = performance.now();
    for (let n = 0; n < 1500; n++) {
      const largo = 1 + Math.floor(azar() * (n % 50 === 0 ? 400 : 8));
      const nombre = Array.from({ length: largo }, () => piezas[Math.floor(azar() * piezas.length)]).join(azar() < 0.5 ? " " : "");
      const titulado = tituloReferencia(nombre);
      const r = ordenarParecidas({ marcaId: null, categoriaId: "c-polos", nombre: titulado, descripcion: "", tejido: null, patron: null, ahora: AHORA }, prods.map((p) => candidataDe(p)));
      expect(r.lista.length).toBe(prods.length);
      const base = baseBuscar(titulado, prods);
      expect(r.lista.filter((x) => x.nivel === "identico").map((x) => x.candidata.id).sort(), JSON.stringify(nombre)).toEqual(base.filter((x) => x.nivel === "identico").map((x) => x.id).sort());
      expect(r.lista.filter((x) => x.nivel === "casi_igual").map((x) => x.candidata.id).sort(), JSON.stringify(nombre)).toEqual(base.filter((x) => x.nivel === "una_letra").map((x) => x.id).sort());
    }
    expect(performance.now() - t0, "las reglas se quedaron pensando con un nombre raro").toBeLessThan(10_000);
  });
});

// ============================================================================
// 7. Ninguna salida lleva precio ni costo, ni jerga, ni veredictos
// ============================================================================

describe("7. sin precio ni costo, sin jerga y sin veredictos", () => {
  it("las filas de `fn_productos` traen precio y costo: el lector los deja afuera y ninguna candidata los conserva", () => {
    const fila = {
      total_productos: 1, producto_id: "G44", referencia: "Polo G44", categoria_id: "c-polos", categoria_nombre: "Polos", estado: "activo", variante_id: "v1", talla: "S",
      color_codigo: "BEI", color_nombre: "Beige", color_hex: "#eee", foto_url: null, precio: 123.45, costo: 67.89, activo: true, codigos_barras: ["7750001"], marca_id: "m-krisstell", marca_nombre: "Krisstell",
      proveedor_id: "pr", proveedor_nombre: "Proveedor Secreto", stock_total: 9, demanda_diaria: 1.5, lead_time_dias: 7, punto_reorden: 3,
    };
    const candidatas = construirCandidatas({ variantes: leerFilasFnProductos([fila]), productos: null, existencias: null });
    const json = JSON.stringify(candidatas);
    for (const prohibido of ["123.45", "67.89", "precio", "costo", "7750001", "Proveedor Secreto", "demanda", "margen"]) expect(json, `la candidata lleva «${prohibido}»`).not.toContain(prohibido);
  });

  it("recorriendo lo que se dibuja en 3.000 escenarios al azar: ni cifras de dinero, ni «precio/costo/margen», ni jerga, ni veredictos", () => {
    const azar = semilla(99);
    const PROHIBIDO = /precio|costo|margen|\bS\/\s?\d|\$\s?\d|umbral|duplicad|coincidencia|la base\b|base de datos|es la misma|son distintas|son la misma|es nueva/i;
    const textos = (x: unknown, acc: string[] = []): string[] => {
      if (typeof x === "string") acc.push(x);
      else if (Array.isArray(x)) x.forEach((y) => textos(y, acc));
      else if (x && typeof x === "object") Object.values(x as Record<string, unknown>).forEach((y) => textos(y, acc));
      return acc;
    };
    const malos = new Map<string, string>();
    for (let n = 0; n < 3000; n++) {
      const e = escenario(azar);
      if (e.nombre === "") continue;
      const { entrada } = entradaDe(e);
      const s = armarParecidasDelAlta(entrada);
      const r = entrada.resultado;
      const extra: unknown[] = [];
      if (r) {
        const hoja = armarHoja({ resultado: r, marca: entrada.marca, categoria: entrada.categoria, alcance: "lista", revisadas: entrada.revisadas, busqueda: "", buscar: buscarParecidas, rotuloTiempo, fallo: entrada.falloLectura });
        extra.push(hoja);
        for (const p of r.lista) extra.push(armarTarjeta({ parecida: p, rotuloTiempo }));
      }
      for (const t of textos([s, extra])) {
        // los nombres de las prendas pueden llevar cualquier palabra: se quitan antes de mirar
        const limpio = e.productos.reduce((acc, p) => acc.split(p.referencia).join(""), t);
        if (PROHIBIDO.test(limpio) && !malos.has(limpio)) malos.set(limpio, e.nombre);
      }
    }
    expect([...malos.keys()]).toEqual([]);
  });
});

// ============================================================================
// 8. La guía (`camposDelAlta`) y `problemasAlta`: la igualdad «requerido sin hacer ⇔ problema», sobre TODAS las combinaciones
// ============================================================================

describe("8. la guía y `problemasAlta` dicen lo mismo, con la marca antes del nombre", () => {
  const BLOQUE_DE: Partial<Record<string, string>> = { categoria: "categoria", nombre: "nombre", tejido: "tela", patron: "tela", tallas: "tallas", precio: "precio", stock: "stock" };

  it("el orden de pantalla: la marca va antes del nombre y nunca está por hacer; sin elegirla, la guía pausa ahí antes del nombre (Felipe, 2026-10-02)", () => {
    const estado: EstadoAlta = {
      categoriaId: "c", referencia: "", comprobandoNombre: false, nombreBloqueado: false, nombreSinConfirmar: false, categoriaSinTallas: false, tallasElegidas: 3, exigeTejidoPatron: true,
      hayTejidosEnCategoria: true, hayPatronesEnCategoria: true, tejidoId: "", patronId: "", celdasIncluidas: 3, precioBase: "", costoBase: "", stockTotal: 0, stockInvalidas: 0, sinStock: false, separaPiso: true, lugarCarga: null,
    };
    for (const marcaElegida of [false, true]) {
      const campos = camposDelAlta(estado, { coloresElegidos: 0, descripcionEscrita: false, marcaElegida, responsableListo: false });
      const paso2 = campos.filter((c) => c.paso === 2).map((c) => c.id);
      expect(paso2.slice(0, 2)).toEqual(["marca", "nombre"]);
      expect(faltanDelPaso(campos, 2).map((c) => c.id)).toEqual(["nombre", "tejido", "patron"]);
      if (marcaElegida) {
        // Ya elegida: no hay pausa, «Sigue aquí» va directo al nombre.
        expect(estadosDeCampos(campos, 2).marca).toBe("hecho");
        expect(estadosDeCampos(campos, 2).nombre).toBe("ahora");
      } else {
        // Sin elegir y el paso intacto: la guía se detiene en marca y proveedor antes de seguir al nombre.
        expect(estadosDeCampos(campos, 2).marca).toBe("ahora");
        expect(estadosDeCampos(campos, 2).nombre).toBe("falta");
        // Apenas se teclea en el nombre, la pausa termina: la luz no le gana a la persona.
        expect(estadosDeCampos(campos, 2, "nombre").nombre).toBe("ahora");
      }
    }
  });

  it("todas las combinaciones (~250.000 alcanzables): la guía bloquea ⇔ `problemasAlta` tiene algo, campo por campo; lo que sobra se enumera", () => {
    const si = [false, true];
    const desajustes = new Map<string, { estado: EstadoAlta; cuantas: number }>();
    let total = 0;
    const anotar = (clave: string, estado: EstadoAlta) => {
      const previo = desajustes.get(clave);
      if (previo) previo.cuantas++;
      else desajustes.set(clave, { estado, cuantas: 1 });
    };
    for (const categoriaId of ["", "c"]) for (const referencia of ["", "Blusa"]) for (const comprobandoNombre of si) for (const nombreBloqueado of si) for (const nombreSinConfirmar of si)
      for (const categoriaSinTallas of si) for (const tallasElegidas of [0, 3]) for (const exigeTejidoPatron of si) for (const hayTejidosEnCategoria of si) for (const hayPatronesEnCategoria of si)
        for (const tejidoId of ["", "t"]) for (const patronId of ["", "p"]) for (const celdasIncluidas of [0, 3]) for (const stockTotal of [0, 6]) for (const stockInvalidas of [0, 2])
          for (const sinStock of si) for (const precioBase of ["", "0", "89.9"]) for (const costoBase of ["", "-1", "32"]) for (const lugarCarga of [null, "almacen"] as const) {
            // dónde están solo importa con unidades que cargar (sin respuesta de fábrica, ADR-0328)
            if (stockTotal === 0 && lugarCarga !== null) continue;
            // estados imposibles: un tejido elegido donde la categoría no ofrece ninguno (al cambiar de categoría se vacía: líneas 323 y 342 del formulario)
            if ((tejidoId && !hayTejidosEnCategoria) || (patronId && !hayPatronesEnCategoria)) continue;
            // categoría sin tallas ⇒ no hay tallas elegidas
            if (categoriaSinTallas && tallasElegidas > 0) continue;
            total++;
            const estado: EstadoAlta = { categoriaId, referencia, comprobandoNombre, nombreBloqueado, nombreSinConfirmar, categoriaSinTallas, tallasElegidas, exigeTejidoPatron, hayTejidosEnCategoria, hayPatronesEnCategoria, tejidoId, patronId, celdasIncluidas, precioBase, costoBase, stockTotal, stockInvalidas, sinStock, separaPiso: true, lugarCarga };
            const campos = camposDelAlta(estado, { coloresElegidos: 0, descripcionEscrita: false, marcaElegida: false, responsableListo: true });
            const problemas = problemasAlta(estado);
            const guiaBloquea = campos.some((c) => c.requerido && !c.hecho);
            if (guiaBloquea !== problemas.length > 0) anotar(`la guía ${guiaBloquea ? "bloquea" : "no bloquea"} y problemasAlta ${problemas.length > 0 ? "sí" : "no"} (${problemas.map((p) => p.bloque).join("+") || "—"})`, estado);
            if (categoriaId) {
              const bloquesGuia = new Set(campos.filter((c) => c.requerido && !c.hecho).map((c) => BLOQUE_DE[c.id]).filter(Boolean));
              const bloquesProblemas = new Set(problemas.map((p) => p.bloque).filter((b) => b !== "variantes"));
              for (const b of bloquesGuia) if (!bloquesProblemas.has(b as never)) anotar(`la guía pide «${b}» y problemasAlta no`, estado);
              for (const b of bloquesProblemas) if (!bloquesGuia.has(b)) anotar(`problemasAlta pide «${b}» y la guía no`, estado);
            }
          }
    expect(total).toBeGreaterThan(200_000);
    // H4 (ya estaba en HEAD, no lo causa el orden nuevo): el ÚNICO desajuste de hoy es «variantes» (`celdasIncluidas = 0`, o sea, la persona desmarcó TODAS
    // las filas de la tabla, con todo lo demás en orden): `problemasAlta` lo pide («Deja al menos una variante en la tabla.») y la guía no tiene campo para
    // él, así que «Sigue aquí» y «Falta: …» callan mientras «Crear» sigue apagado. Se permite aquí para que esta prueba vigile lo DEMÁS.
    const permitidos = /\(variantes\)$/;
    const inesperados = [...desajustes].filter(([k]) => !permitidos.test(k));
    const informe = inesperados.map(([k, v]) => `${k}: ${v.cuantas} combinaciones, p. ej. ${JSON.stringify(v.estado)}`);
    expect(informe, informe.join("\n")).toEqual([]);
    expect([...desajustes.keys()].filter((k) => permitidos.test(k)).length, "H4: el hueco de «variantes» se cerró: quita el permiso de esta prueba").toBeGreaterThan(0);
  }, 120_000);
});
