import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Dos clics en el MISMO instante en un botón que guarda una orden de compra (chaos 2026-10-10, semilla 20261010): el estado `guardando` de
// React se aplica después del clic, así que las dos llamadas pasaban. La base guardaba UNA orden (el id se reusa), pero la pantalla quedaba en
// el formulario lleno, como si no hubiera guardado, y se gastaba un número. El candado es el de la casa (Ajustar inventario, Editar meta): una
// `ref` que se pone en el mismo tick, antes de llamar a la base, y se suelta al terminar. Esta prueba vigila que siga ahí.

const leer = (archivo: string) => readFileSync(join(__dirname, "..", archivo), "utf8");

function candadoAntesDe(fuente: string, llamada: string) {
  const declara = /const enVuelo = useRef\(false\)/.test(fuente);
  const revisa = fuente.indexOf("if (guardando || enVuelo.current) return;");
  const pone = fuente.indexOf("enVuelo.current = true;");
  const llama = fuente.indexOf(`await ${llamada}(`);
  const suelta = fuente.indexOf("enVuelo.current = false;");
  return { declara, revisaAntes: revisa >= 0 && revisa < pone, poneAntes: pone >= 0 && pone < llama, suelta: suelta > llama };
}

describe("órdenes de compra: un segundo clic en el mismo instante no vuelve a guardar", () => {
  it("Nueva y Editar orden ponen el candado antes de crear y de guardar los cambios", () => {
    const f = leer("components/ordenes-compra/NuevaOrdenCompra.tsx");
    expect(candadoAntesDe(f, "crearOrdenCompra")).toEqual({ declara: true, revisaAntes: true, poneAntes: true, suelta: true });
    expect(f.indexOf("enVuelo.current = true;")).toBeLessThan(f.indexOf("await editarOrdenCompra("));
  });
  it("Registrar comprobante pone el candado antes de registrar (fase 2: registra una deuda en Por pagar)", () => {
    expect(candadoAntesDe(leer("components/ordenes-compra/RegistrarComprobanteOrden.tsx"), "registrarComprobanteOrden")).toEqual({
      declara: true,
      revisaAntes: true,
      poneAntes: true,
      suelta: true,
    });
  });
  it("la hoja «Anular comprobante» pone el candado antes de anular", () => {
    expect(candadoAntesDe(leer("components/ordenes-compra/ComprobantesDeOrden.tsx"), "anularComprobanteDeOrden")).toEqual({
      declara: true,
      revisaAntes: true,
      poneAntes: true,
      suelta: true,
    });
  });
  it("Enviar a una sede pone el candado antes de crear el envío (fase 3: deja mercadería en camino hacia una sede)", () => {
    expect(candadoAntesDe(leer("components/ordenes-compra/EnviarOrdenASede.tsx"), "crearEnvioDeOrden")).toEqual({
      declara: true,
      revisaAntes: true,
      poneAntes: true,
      suelta: true,
    });
  });
  it("la hoja «Anular envío» pone el candado antes de anular", () => {
    expect(candadoAntesDe(leer("components/ordenes-compra/EnviosDeOrden.tsx"), "anularEnvioDeOrden")).toEqual({
      declara: true,
      revisaAntes: true,
      poneAntes: true,
      suelta: true,
    });
  });
  it("la hoja «Anular orden» pone el candado antes de anular", () => {
    expect(candadoAntesDe(leer("components/ordenes-compra/AccionesOrden.tsx"), "anularOrdenCompra")).toEqual({
      declara: true,
      revisaAntes: true,
      poneAntes: true,
      suelta: true,
    });
  });
});
