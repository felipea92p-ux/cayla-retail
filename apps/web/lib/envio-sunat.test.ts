import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarVentaASunat, leerPasada, primeraVez, vaciarColaSunat } from "./envio-sunat";

// ADR-0378: al abrir Comprobantes la cola se vacía en varias pasadas (antes, 3 por visita: con 41 atascados el aviso
// rojo tardaba 14 visitas en irse). Lo que importa: que pare sola, que no le insista a un Lucode caído y que deje de
// pedir si la persona se fue.

afterEach(() => vi.unstubAllGlobals());

/** El servidor falso: devuelve las respuestas en orden y cuenta cuántas veces lo llamaron. */
function servidor(respuestas: unknown[]) {
  let i = 0;
  const llamadas = { n: 0 };
  vi.stubGlobal("fetch", async () => {
    llamadas.n++;
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    return r === "error" ? new Response("{}", { status: 403 }) : new Response(JSON.stringify(r), { status: 200 });
  });
  return llamadas;
}

const ok = (tomados: number, consultados = 0) => ({ tomados, consultados, actualizados: 0, resultados: Array.from({ length: tomados }, () => ({ status: 200 })) });

describe("leerPasada", () => {
  it("lee los números y si Lucode estaba disponible", () => {
    expect(leerPasada(ok(3, 1))).toEqual({ tomados: 3, consultados: 1, actualizados: 0, lucodeNoDisponible: false });
    expect(leerPasada({ tomados: 1, resultados: [{ status: 502, motivo: "sin_respuesta" }] }).lucodeNoDisponible).toBe(true);
    expect(leerPasada({ tomados: 1, resultados: [{ status: 502, motivo: "credenciales_invalidas" }] }).lucodeNoDisponible).toBe(true);
    // Un problema de UN comprobante (número ocupado, ya emitido sin confirmar) no es que Lucode esté caído.
    expect(leerPasada({ tomados: 2, resultados: [{ status: 409, motivo: "numero_ocupado" }, { status: 502, motivo: "ya_emitido" }] }).lucodeNoDisponible).toBe(false);
  });
  it("tolera una respuesta rara sin romperse", () => {
    expect(leerPasada(null)).toEqual({ tomados: 0, consultados: 0, actualizados: 0, lucodeNoDisponible: false });
    expect(leerPasada({ tomados: "3", resultados: "x" })).toEqual({ tomados: 0, consultados: 0, actualizados: 0, lucodeNoDisponible: false });
  });
});

describe("vaciarColaSunat", () => {
  it("sigue mientras haya trabajo y para en la primera pasada vacía, refrescando tras cada una que movió algo", async () => {
    const llamadas = servidor([ok(3), ok(3), ok(1, 2), ok(0)]);
    const alCambiar = vi.fn();
    expect(await vaciarColaSunat(null, { alCambiar })).toBe(4);
    expect(llamadas.n).toBe(4);
    expect(alCambiar).toHaveBeenCalledTimes(3);
  });

  it("no pasa del tope aunque siempre haya trabajo", async () => {
    const llamadas = servidor([ok(3)]);
    await vaciarColaSunat(null, { alCambiar: () => {}, pasadas: 10 });
    expect(llamadas.n).toBe(10);
  });

  it("con Lucode caído para después de esa pasada (refresca, pero no insiste)", async () => {
    const llamadas = servidor([{ tomados: 3, consultados: 0, actualizados: 0, resultados: [{ status: 502, motivo: "sin_respuesta" }] }, ok(3)]);
    const alCambiar = vi.fn();
    await vaciarColaSunat(null, { alCambiar });
    expect(llamadas.n).toBe(1);
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it("si el servidor se niega (o no hay red) para sin refrescar", async () => {
    const llamadas = servidor(["error"]);
    const alCambiar = vi.fn();
    await vaciarColaSunat(null, { alCambiar });
    expect(llamadas.n).toBe(1);
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("si la persona se fue de la pantalla, deja de pedir", async () => {
    const llamadas = servidor([ok(3)]);
    let vivo = true;
    const alCambiar = vi.fn(() => {
      vivo = false;
    });
    await vaciarColaSunat(null, { alCambiar, seguir: () => vivo });
    expect(llamadas.n).toBe(1);
  });
});

// /chaos 2026-10-13 (DC-02): una ráfaga de clics en «Cobrar» devuelve la misma venta varias veces; a Lucode sale una sola.
describe("un solo envío a SUNAT por venta", () => {
  it("primeraVez dice sí una vez por venta", () => {
    const enviadas = new Set<string>();
    expect(primeraVez("v1", enviadas)).toBe(true);
    expect(primeraVez("v1", enviadas)).toBe(false);
    expect(primeraVez("v2", enviadas)).toBe(true);
  });
  it("cinco respuestas con la misma venta mandan un solo pedido a /api/lucode/emitir", () => {
    const llamadas = servidor([{}]);
    for (let i = 0; i < 5; i++) enviarVentaASunat("venta-rafaga");
    expect(llamadas.n).toBe(1);
  });
});
