import { describe, it, expect } from "vitest";
import { traducirError } from "./error-escritura";

// Este traductor solo se ve cuando algo sale mal, o sea justo cuando nadie está mirando el
// código. Si un día alguien renombra una restricción en una migración y no toca esta lista,
// el error vuelve a salir en inglés y nadie se entera hasta que una Encargada lo lee en el
// mostrador. Estas pruebas fijan las dos mitades del contrato: lo que traduce y —más
// importante— lo que deja pasar tal cual.

describe("traduce lo que escribe Postgres por su cuenta", () => {
  it("el check de stock negativo se vuelve una instrucción, no una restricción", () => {
    const salida = traducirError(
      {
        message: 'new row for relation "stock" violates check constraint "stock_cantidad_no_negativa"',
        code: "23514",
      },
      "registrar la venta"
    );
    expect(salida).not.toContain("constraint");
    expect(salida).not.toContain("stock_cantidad_no_negativa");
    expect(salida).toContain("No hay suficiente stock");
  });

  it("el almacén tiene su propia red, y su frase distingue almacén de piso", () => {
    const salida = traducirError(
      {
        message:
          'new row for relation "stock_almacen" violates check constraint "stock_almacen_cantidad_no_negativa"',
        code: "23514",
      },
      "bajar la prenda a tienda"
    );
    expect(salida).toContain("almacén de esta sede");
    // La huella del piso NO debe ganarle a la del almacén: son dos avisos distintos.
    expect(salida).not.toContain("todavía no bajó a piso");
  });

  it("un movimiento de cero explica que solo el ajuste lleva signo", () => {
    const salida = traducirError(
      { message: 'new row for relation "movimientos" violates check constraint "movimientos_cantidad_coherente"', code: "23514" },
      "registrar el movimiento"
    );
    expect(salida).toContain("mayor que cero");
    expect(salida).toContain("ajuste");
  });

  it("la referencia duplicada dice A DÓNDE ir, no solo qué falló", () => {
    const salida = traducirError(
      { message: 'duplicate key value violates unique constraint "productos_sku_padre_key"', code: "23505" },
      "crear el producto"
    );
    expect(salida).toContain("¿Reingreso de algo que ya existe?");
  });

  it("el rechazo de RLS explica el cambio de sede en vez de hablar de políticas", () => {
    const salida = traducirError(
      { message: 'new row violates row-level security policy for table "movimientos"', code: "42501" },
      "registrar el movimiento"
    );
    expect(salida).toContain("permiso");
    expect(salida).toContain("cambia de sede");
  });

  it("la caja duplicada por índice único queda en una sola frase", () => {
    const salida = traducirError(
      { message: 'duplicate key value violates unique constraint "cajas_sede_abierta_unique"', code: "23505" },
      "abrir la caja"
    );
    expect(salida).toBe("Esta sede ya tiene una caja abierta. Ciérrala antes de abrir otra.");
  });
});

describe("no re-traduce lo que las RPC ya dicen bien", () => {
  it("un raise exception nuestro pasa palabra por palabra", () => {
    const delaRpc = "Esta caja ya está cerrada — no se pueden registrar más ventas ahí";
    expect(traducirError({ message: delaRpc, code: "P0001" }, "registrar la venta")).toBe(delaRpc);
  });

  it("también el de permisos, que ya nombra la sede", () => {
    const delaRpc = "No tienes permiso para vender en esa caja";
    expect(traducirError({ message: delaRpc, code: "P0001" }, "registrar la venta")).toBe(delaRpc);
  });
});

describe("los bordes de red y el fallback", () => {
  it("si no se llegó al servidor, lo dice y aclara que no se guardó nada", () => {
    const salida = traducirError({ message: "TypeError: Failed to fetch" }, "registrar la venta");
    expect(salida).toContain("No se guardó nada");
  });

  it("lo desconocido no se traga: cae con el texto crudo detrás de «Código:»", () => {
    const raro = 'relation "tabla_que_nadie_espera" does not exist';
    const salida = traducirError({ message: raro, code: "42P01" }, "registrar la venta");
    expect(salida).toContain("Código:");
    expect(salida).toContain(raro);
  });

  it("sin error, la frase sigue nombrando la acción del negocio", () => {
    expect(traducirError(null, "cerrar la caja")).toBe("No se pudo cerrar la caja.");
  });
});
