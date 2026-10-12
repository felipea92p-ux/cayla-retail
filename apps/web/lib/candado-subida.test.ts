import { describe, expect, it } from "vitest";
import { conCandadoDeSubida, type Candados } from "./candado-subida";

// El candado entre pestañas: solo UNA sube la cola. El `LockManager` se simula (un candado por nombre, `ifAvailable`).

function candadosSimulados() {
  const tomados = new Set<string>();
  const llamadas: string[] = [];
  const candados: Candados = {
    request: async (nombre, _opciones, trabajo) => {
      llamadas.push(nombre);
      if (tomados.has(nombre)) return trabajo(null); // otra pestaña lo tiene: `ifAvailable` entrega null
      tomados.add(nombre);
      try {
        return await trabajo({ name: nombre });
      } finally {
        tomados.delete(nombre);
      }
    },
  };
  return { candados, tomados, llamadas };
}

describe("conCandadoDeSubida", () => {
  it("sube cuando nadie más lo tiene, con el candado propio de esa cola", async () => {
    const { candados, llamadas } = candadosSimulados();
    let corrio = 0;
    expect(await conCandadoDeSubida("cayla:vender:sede-1:cola", async () => void corrio++, candados)).toBe(true);
    expect(corrio).toBe(1);
    expect(llamadas).toEqual(["cayla:subida:cayla:vender:sede-1:cola"]);
  });

  it("si OTRA pestaña está subiendo esa cola, esta no hace nada (ni espera)", async () => {
    const { candados } = candadosSimulados();
    let soltarPrimera!: () => void;
    const primera = conCandadoDeSubida("c", () => new Promise<void>((r) => (soltarPrimera = r)), candados);
    let corrioSegunda = false;
    const segunda = await conCandadoDeSubida("c", async () => void (corrioSegunda = true), candados);
    expect(segunda).toBe(false);
    expect(corrioSegunda).toBe(false);
    soltarPrimera();
    expect(await primera).toBe(true);
  });

  it("dos colas distintas no se bloquean entre sí", async () => {
    const { candados } = candadosSimulados();
    let soltar!: () => void;
    const lenta = conCandadoDeSubida("recibir", () => new Promise<void>((r) => (soltar = r)), candados);
    expect(await conCandadoDeSubida("productos", async () => {}, candados)).toBe(true);
    soltar();
    await lenta;
  });

  it("al terminar suelta el candado: la pasada siguiente (otro latido) sí sube", async () => {
    const { candados, tomados } = candadosSimulados();
    await conCandadoDeSubida("c", async () => {}, candados);
    expect(tomados.size).toBe(0);
    let corrio = false;
    await conCandadoDeSubida("c", async () => void (corrio = true), candados);
    expect(corrio).toBe(true);
  });

  it("si el trabajo lanza, el error sube y el candado se suelta igual", async () => {
    const { candados, tomados } = candadosSimulados();
    await expect(conCandadoDeSubida("c", async () => { throw new Error("boom"); }, candados)).rejects.toThrow("boom");
    expect(tomados.size).toBe(0);
  });

  it("sin navigator.locks (navegador viejo) se sube como antes, sin candado", async () => {
    let corrio = false;
    expect(await conCandadoDeSubida("c", async () => void (corrio = true), undefined)).toBe(true);
    expect(corrio).toBe(true);
  });

  it("si el candado mismo falla (SecurityError), se sube igual: el candado es una mejora, no un requisito", async () => {
    const roto: Candados = { request: async () => { throw new DOMException("sin permiso", "SecurityError"); } };
    let corrio = 0;
    expect(await conCandadoDeSubida("c", async () => void corrio++, roto)).toBe(true);
    expect(corrio).toBe(1);
  });
});
