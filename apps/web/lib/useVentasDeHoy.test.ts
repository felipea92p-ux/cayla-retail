// La píldora «Hoy» del Punto de venta y la sede que se mira — el hallazgo del 2026-10-10.
//
// EL PROBLEMA. Esa noche, en producción, la cabecera de Vender decía «VENTA EN TIENDA · TIENDA AQP» y la cifra «Hoy» decía S/ 5830.08:
// el total de Tienda TRU (63 ventas), no el de AQP (11 ventas, S/ 1096.50). Reproducido en local: el selector de sede solo hace
// `router.refresh()`, así que `PuntoDeVenta` NO se vuelve a montar; el servidor manda las ventas de la sede nueva como props nuevas y el
// hook se quedaba con las de la sede de antes (las tomaba solo al montar, y sin una venta nueva no volvía a leer). Ir a otra pantalla y
// volver por el menú sí monta de nuevo: por eso la captura de antes y la de después decían bien.
//
// CONTRATO
//   PROMETE: corre el hook REAL (`useVentasDeHoy`) con un mini-render de hooks (sin DOM: no hay jsdom en este árbol; el mismo método que
//            `parecidas-alta-integracion.test.ts`, reducido a `useState` y `useEffect`) y un doble de la base que responde cuando la prueba
//            dice. Las ventas son SINTÉTICAS con las cifras del hallazgo; ninguna es un registro real.
//   NO HACE: no toca la red ni la base, ni necesita un navegador.

import ReactDefault from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resumenDeHoy } from "./vender-hoy-reglas";
import { MENSAJE_FALLO_VENTAS_DE_HOY, useVentasDeHoy, type VentaDeHoy } from "./useVentasDeHoy";

// ---- El doble de la base: anota cada lectura y deja que la prueba decida cuándo y qué responde ----

type Respuesta = { data: VentaDeHoy[] | null; error: { message: string } | null };
type Lectura = { args: { p_ubicacion_id: string }; responder: (r: Respuesta) => void };
const base = vi.hoisted(() => ({ lecturas: [] as unknown[] }));

vi.mock("./supabase/client", () => ({
  createClient: () => ({
    rpc: (nombre: string, args: { p_ubicacion_id: string }) => {
      if (nombre !== "fn_ventas_del_dia") throw new Error(`Lectura inesperada: ${nombre}`);
      return new Promise<Respuesta>((responder) => base.lecturas.push({ args, responder }));
    },
  }),
}));

const lecturas = () => base.lecturas as Lectura[];
/** Deja correr las promesas ya resueltas (el `.then` del hook). */
const tic = () => new Promise((r) => setTimeout(r, 0));

// ---- El mini-render: estado y efectos (con sus limpiezas, en el orden de React), y el re-dibujo si el estado cambia al dibujar ----

type Slot = { v?: unknown; set?: (x: unknown) => void; deps?: unknown[]; listo?: boolean; limpiar?: () => void };
const INTERNOS = (ReactDefault as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } })
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function montarHook<P, R>(hook: (p: P) => R, inicial: NoInfer<P>) {
  const slots: Slot[] = [];
  let i = 0;
  let props = inicial;
  let salida: R | undefined;
  let dibujando = false;
  let otra = false;
  let pendientes: { slot: Slot; fn: () => void | (() => void); deps: unknown[] | undefined }[] = [];
  const iguales = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => Object.is(x, b[k]));
  const slot = (): Slot => (slots[i++] ??= {});

  const despachador = {
    useState(inicialEstado: unknown) {
      const s = slot();
      if (!("v" in s)) {
        s.v = typeof inicialEstado === "function" ? (inicialEstado as () => unknown)() : inicialEstado;
        s.set = (x: unknown) => {
          const nuevo = typeof x === "function" ? (x as (p: unknown) => unknown)(s.v) : x;
          if (Object.is(nuevo, s.v)) return;
          s.v = nuevo;
          if (dibujando) otra = true;
          else dibujar();
        };
      }
      return [s.v, s.set];
    },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const s = slot();
      if (!s.listo || deps === undefined || !iguales(s.deps, deps)) {
        s.listo = true;
        pendientes.push({ slot: s, fn, deps });
      }
    },
  };

  function dibujar() {
    dibujando = true;
    try {
      let vueltas = 0;
      do {
        otra = false;
        if (++vueltas > 50) throw new Error("El hook no se estabiliza (render infinito).");
        i = 0;
        pendientes = [];
        const previo = INTERNOS.H;
        INTERNOS.H = despachador;
        try {
          salida = hook(props);
        } finally {
          INTERNOS.H = previo;
        }
        // Un estado cambiado AL DIBUJAR se vuelve a dibujar antes de correr efectos (como React).
        if (otra) continue;
        const hechos = pendientes;
        for (const e of hechos) e.slot.limpiar?.();
        for (const e of hechos) {
          e.slot.deps = e.deps;
          const r = e.fn();
          e.slot.limpiar = typeof r === "function" ? r : undefined;
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
    /** Lo que hace `router.refresh()`: el MISMO componente recibe props nuevas, sin montarse de nuevo. */
    cambiar(cambios: Partial<P>) {
      props = { ...props, ...cambios };
      dibujar();
    },
  };
}

// ---- Los datos: dos sedes con las cifras del hallazgo ----

const TRU = "00000000-0000-4000-8000-000000000001";
const AQP = "00000000-0000-4000-8000-000000000002";

/** `n` ventas sintéticas que suman `total` al centavo (la última lleva el resto). */
function ventasQueSuman(sede: string, n: number, total: number): VentaDeHoy[] {
  const centimos = Math.round(total * 100);
  const cada = Math.floor(centimos / n);
  return Array.from({ length: n }, (_, k) => ({
    venta_id: `${sede.slice(-4)}-${k}`,
    hora: "20:00",
    vendedor: "Integrante de prueba",
    comprobante_texto: null,
    metodos_pago: "efectivo",
    nota: null,
    total: (k === n - 1 ? centimos - cada * (n - 1) : cada) / 100,
  }));
}

const VENTAS_TRU = ventasQueSuman(TRU, 63, 5830.08);
const VENTAS_AQP = ventasQueSuman(AQP, 11, 1096.5);

type Props = { ubicacionId: string; inicial: VentaDeHoy[]; fallo: string | null; version: number };
const useVentasDeLaSede = (p: Props) => useVentasDeHoy(p.ubicacionId, p.inicial, p.fallo, p.version);
/** Lo que dice la píldora: el total que suma `resumenDeHoy` sobre lo que entrega el hook. */
const hoy = (r: { ventas: readonly VentaDeHoy[] }) => resumenDeHoy(r.ventas, null);

beforeEach(() => {
  base.lecturas.length = 0;
});

describe("useVentasDeHoy — la cifra «Hoy» es siempre de la sede que se mira", () => {
  it("arranca con lo que leyó el servidor, sin volver a leer", () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: TRU, inicial: VENTAS_TRU, fallo: null, version: 0 });
    expect(hoy(h.actual)).toEqual({ ventas: 63, total: 5830.08, pctMeta: null });
    expect(lecturas()).toHaveLength(0);
  });

  it("hallazgo 2026-10-10: al cambiar de sede en Vender (router.refresh, sin montar de nuevo) dice el total de la sede NUEVA", () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: TRU, inicial: VENTAS_TRU, fallo: null, version: 0 });
    // El selector cambió a AQP: el servidor volvió a leer y manda las ventas de AQP al mismo componente.
    h.cambiar({ ubicacionId: AQP, inicial: VENTAS_AQP });
    expect(hoy(h.actual)).toEqual({ ventas: 11, total: 1096.5, pctMeta: null });
  });

  it("y de vuelta a la primera sede, otra vez la suya", () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: TRU, inicial: VENTAS_TRU, fallo: null, version: 0 });
    h.cambiar({ ubicacionId: AQP, inicial: VENTAS_AQP });
    const truReleidas = ventasQueSuman(TRU, 64, 5900.08);
    h.cambiar({ ubicacionId: TRU, inicial: truReleidas });
    expect(hoy(h.actual)).toEqual({ ventas: 64, total: 5900.08, pctMeta: null });
  });

  it("tras vender en una sede y cambiar a otra, no muestra ni un instante la sede de antes", async () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: TRU, inicial: VENTAS_TRU, fallo: null, version: 0 });
    h.cambiar({ version: 1 });
    lecturas()[0].responder({ data: VENTAS_TRU, error: null });
    await tic();
    h.cambiar({ ubicacionId: AQP, inicial: VENTAS_AQP });
    expect(hoy(h.actual).total).toBe(1096.5);
  });

  it("una relectura de la sede de antes que responde tarde no pisa la sede nueva", async () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: TRU, inicial: VENTAS_TRU, fallo: null, version: 0 });
    h.cambiar({ version: 1 }); // se vendió en TRU: relee TRU…
    h.cambiar({ ubicacionId: AQP, inicial: VENTAS_AQP }); // …y antes de que responda, se cambió a AQP
    const deTru = lecturas().find((l) => l.args.p_ubicacion_id === TRU)!;
    deTru.responder({ data: ventasQueSuman(TRU, 64, 5900.08), error: null });
    await tic();
    expect(hoy(h.actual).total).toBe(1096.5);
  });

  it("tras vender relee SU sede y muestra lo releído", async () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: AQP, inicial: VENTAS_AQP, fallo: null, version: 0 });
    h.cambiar({ version: 1 });
    expect(lecturas().map((l) => l.args.p_ubicacion_id)).toEqual([AQP]);
    lecturas()[0].responder({ data: ventasQueSuman(AQP, 12, 1176.4), error: null });
    await tic();
    expect(hoy(h.actual)).toEqual({ ventas: 12, total: 1176.4, pctMeta: null });
  });

  it("si la relectura falla, conserva la lista con el aviso (la venta ya quedó en la base)", async () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: AQP, inicial: VENTAS_AQP, fallo: null, version: 0 });
    h.cambiar({ version: 1 });
    lecturas()[0].responder({ data: null, error: { message: "sin red" } });
    await tic();
    expect(hoy(h.actual).total).toBe(1096.5);
    expect(h.actual.fallo).toBe(MENSAJE_FALLO_VENTAS_DE_HOY);
  });

  it("una lectura nueva del servidor en la MISMA sede (abrir o cerrar caja) también manda", () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: AQP, inicial: VENTAS_AQP, fallo: null, version: 0 });
    // Otra caja de la sede vendió; esta abrió o cerró caja (`router.refresh()`) y el servidor ya la cuenta.
    h.cambiar({ inicial: ventasQueSuman(AQP, 12, 1176.4) });
    expect(hoy(h.actual)).toEqual({ ventas: 12, total: 1176.4, pctMeta: null });
  });

  it("el fallo del servidor de la sede nueva se ve, y no se arrastra el de la sede de antes", () => {
    const h = montarHook(useVentasDeLaSede, { ubicacionId: TRU, inicial: [], fallo: MENSAJE_FALLO_VENTAS_DE_HOY, version: 0 });
    h.cambiar({ ubicacionId: AQP, inicial: VENTAS_AQP, fallo: null });
    expect(h.actual.fallo).toBeNull();
    h.cambiar({ ubicacionId: TRU, inicial: [], fallo: MENSAJE_FALLO_VENTAS_DE_HOY });
    expect(h.actual).toEqual({ ventas: [], fallo: MENSAJE_FALLO_VENTAS_DE_HOY });
  });
});
