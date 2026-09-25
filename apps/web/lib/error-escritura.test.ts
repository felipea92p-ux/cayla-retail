import { describe, it, expect } from "vitest";
import { esVersionCambiada, traducirError } from "./error-escritura";

// Este traductor solo se ve cuando algo sale mal, o sea justo cuando nadie está mirando el
// código. Si un día alguien renombra una restricción en una migración y no toca esta lista,
// el error vuelve a salir en inglés y nadie se entera hasta que una Encargada lo lee en el
// mostrador. Estas pruebas fijan las dos mitades del contrato: lo que traduce y —más
// importante— lo que deja pasar tal cual.

describe("traduce lo que escribe Postgres por su cuenta", () => {
  it("una RPC rechazada por falta de sesión pide volver a entrar, no cita a Postgres", () => {
    const salida = traducirError({ message: "permission denied for function registrar_venta", code: "42501" }, "registrar la venta", { confirmarAntesDeRepetir: true });
    expect(salida).not.toContain("permission denied");
    expect(salida).toContain("vuelve a entrar");
  });

  it("renombrar una marca a un nombre existente se explica, no cita el índice", () => {
    const salida = traducirError({ message: 'duplicate key value violates unique constraint "marcas_nombre_unico"', code: "23505" }, "renombrar la marca");
    expect(salida).not.toContain("marcas_nombre_unico");
    expect(salida).toContain("Ya existe una marca con ese nombre");
  });

  it("reactivar una prenda rechazada dice qué hacer, sin citar la restricción", () => {
    const salida = traducirError({ message: 'new row for relation "productos" violates check constraint "productos_rechazado_descontinuado_check"', code: "23514" }, "guardar el producto");
    expect(salida).not.toContain("productos_rechazado_descontinuado_check");
    expect(salida).toContain("no se puede reactivar");
    expect(salida).toContain("Nuevo producto");
  });

  it("una pareja marca-proveedor inválida dice cómo arreglarla", () => {
    const salida = traducirError({ message: 'insert or update on table "productos" violates foreign key constraint "productos_marca_proveedor_fk"', code: "23503" }, "guardar el producto");
    expect(salida).not.toContain("productos_marca_proveedor_fk");
    expect(salida).toContain("no trae esa marca");
  });

  it("un nombre de producto repetido dice a dónde ir, sin nombrar el índice", () => {
    const salida = traducirError(
      {
        message: 'duplicate key value violates unique constraint "productos_referencia_clave_unica"',
        code: "23505",
      },
      "crear el producto"
    );
    expect(salida).not.toContain("productos_referencia_clave_unica");
    expect(salida).toContain("Ya existe un producto con ese nombre");
  });

  it("una talla y color repetidos en un producto se explican, no se citan", () => {
    const salida = traducirError(
      {
        message: 'duplicate key value violates unique constraint "variantes_producto_talla_color_unico"',
        code: "23505",
      },
      "dar de alta esta prenda"
    );
    expect(salida).not.toContain("variantes_producto_talla_color_unico");
    expect(salida).toContain("ya tiene esa talla y ese color");
  });

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
      { message: 'duplicate key value violates unique constraint "variantes_sku_key"', code: "23505" },
      "crear la variante"
    );
    expect(salida).toContain("revisa el catálogo");
  });

  it("el rechazo de RLS explica el permiso por ubicación en vez de hablar de políticas", () => {
    const salida = traducirError(
      { message: 'new row violates row-level security policy for table "movimientos"', code: "42501" },
      "registrar el movimiento"
    );
    expect(salida).toContain("permiso");
    expect(salida).toContain("ubicación");
  });

  it("la caja duplicada por índice único queda en una sola frase", () => {
    const salida = traducirError(
      { message: 'duplicate key value violates unique constraint "cajas_ubicacion_abierta_unica"', code: "23505" },
      "abrir la caja"
    );
    expect(salida).toBe("Esta ubicación ya tiene una caja abierta. Ciérrala antes de abrir otra.");
  });

  it("una colaboradora cargando una cotización de maquila recibe el mensaje de líder, no el genérico de ubicación", () => {
    const salida = traducirError(
      { message: 'new row violates row-level security policy for table "cotizaciones_maquila"', code: "42501" },
      "cargar la cotización"
    );
    expect(salida).toBe("Solo un líder de equipo puede cargar o corregir una cotización de maquila.");
    expect(salida).not.toContain("ubicación");
  });

  it("una cotización de maquila con vigencia al revés dice qué revisar, no cita el constraint", () => {
    const salida = traducirError(
      {
        message: 'new row for relation "cotizaciones_maquila" violates check constraint "cotizaciones_maquila_vigencia_coherente"',
        code: "23514",
      },
      "cargar la cotización"
    );
    expect(salida).not.toContain("constraint");
    expect(salida).toContain("no puede terminar antes");
  });

  it("un precio de maquila negativo se explica, no se cita la restricción", () => {
    const salida = traducirError(
      {
        message: 'new row for relation "cotizaciones_maquila" violates check constraint "cotizaciones_maquila_precio_maquila_check"',
        code: "23514",
      },
      "cargar la cotización"
    );
    expect(salida).not.toContain("constraint");
    expect(salida).toContain("no puede ser negativo");
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

  it("con dinero de por medio no afirma que no se guardó: pide revisar antes de repetir", () => {
    const salida = traducirError({ message: "TypeError: Failed to fetch" }, "registrar el pago", { confirmarAntesDeRepetir: true });
    expect(salida).not.toContain("No se guardó nada");
    expect(salida).toContain("no podemos confirmar");
    expect(salida).toContain("registrar el pago");
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

// ---- Candado de precio y códigos de descuento en `registrar_venta` (2026-09-14). La RPC
// levanta un NOMBRE estable (como las restricciones) y pone el dato humano en `details`;
// acá se arma la frase. Si el nombre cambia en la migración y no acá, la colaboradora vuelve
// a leer `venta_precio_cambiado` crudo en el mostrador.

describe("traduce los candados de la venta con el dato que trae el detalle", () => {
  it("precio cambiado: nombra la prenda y dice qué hacer", () => {
    const salida = traducirError(
      { message: "venta_precio_cambiado", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toBe("El precio de Blusa Emma (BLU-EMMA-BEI-S) cambió: quítala del ticket y vuelve a agregarla.");
  });

  it("variante restringida a otra sede en la venta: nombra la prenda, no el código crudo", () => {
    const salida = traducirError(
      { message: "venta_variante_restringida_a_otra_sede", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toBe("Blusa Emma (BLU-EMMA-BEI-S) está restringida a otra sede — no se puede vender desde acá.");
  });

  it("variante restringida a otra sede en un traslado: misma frase, del lado de trasladar", () => {
    const salida = traducirError(
      { message: "traslado_variante_restringida_a_otra_sede", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar el traslado"
    );
    expect(salida).toBe("Blusa Emma (BLU-EMMA-BEI-S) está restringida a otra sede — no se puede trasladar desde acá.");
  });

  it("descuento sin código: dice a quién pedírselo", () => {
    const salida = traducirError({ message: "venta_descuento_requiere_codigo", code: "P0001" }, "registrar la venta");
    expect(salida).not.toContain("venta_descuento_requiere_codigo");
    expect(salida).toContain("código");
    expect(salida).toContain("Líder");
  });

  it("código inválido: repite el código que se escribió", () => {
    const salida = traducirError(
      { message: "venta_codigo_descuento_invalido", details: "CAYLA10", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("CAYLA10");
    expect(salida).toContain("no es válido");
  });

  it("descuento por encima del código: dice el tope", () => {
    const salida = traducirError(
      { message: "venta_descuento_supera_codigo", details: "15", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("hasta un 15 %");
  });

  it("descuento sin motivo: nombra la prenda y pide elegir por qué", () => {
    const salida = traducirError(
      { message: "venta_descuento_requiere_motivo", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("Blusa Emma (BLU-EMMA-BEI-S)");
    expect(salida).toContain("por qué");
  });

  it('motivo "Otro" sin detalle: pide contar por qué', () => {
    const salida = traducirError(
      { message: "venta_descuento_otro_sin_detalle", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("Blusa Emma (BLU-EMMA-BEI-S)");
    expect(salida).toContain("Otro");
  });

  it("descuento bajo el costo: no revela ningún número", () => {
    const salida = traducirError(
      { message: "venta_descuento_bajo_costo", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("Blusa Emma (BLU-EMMA-BEI-S)");
    expect(salida).not.toMatch(/\d/);
  });

  it("descuento entre 20 % y 35 % sin argumento: pide escribirlo", () => {
    const salida = traducirError(
      { message: "venta_descuento_requiere_argumento", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("Blusa Emma (BLU-EMMA-BEI-S)");
    expect(salida).toContain("argumento");
  });

  it("descuento por encima de 35 %: nadie puede aplicarlo, sin excepción", () => {
    const salida = traducirError(
      { message: "venta_descuento_supera_autorizacion", details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" },
      "registrar la venta"
    );
    expect(salida).toContain("Blusa Emma (BLU-EMMA-BEI-S)");
    expect(salida).toContain("nadie");
  });
});

describe("descuento de campaña (paso 3 de ADR-0107)", () => {
  it.each([
    ["venta_campana_omitida", "campaña vigente"],
    ["venta_campana_no_vigente", "ya no está vigente"],
    ["venta_campana_monto_no_coincide", "cambió"],
    ["venta_campana_sin_etiqueta", "incompleto"],
    ["venta_descuento_no_supera_campana", "igual o más descuento"],
  ])("%s se lee como una frase con la prenda y sin el nombre técnico", (marca, pista) => {
    const salida = traducirError({ message: marca, details: "Blusa Emma (BLU-EMMA-BEI-S)", code: "P0001" }, "registrar la venta");
    expect(salida).toContain("Blusa Emma (BLU-EMMA-BEI-S)");
    expect(salida).toContain(pista);
    expect(salida).not.toContain(marca);
  });
});

describe("la nota del ticket", () => {
  it("el check de largo se vuelve una frase con el tope", () => {
    const salida = traducirError(
      { message: 'new row for relation "ventas" violates check constraint "ventas_nota_corta"', code: "23514" },
      "registrar la venta"
    );
    expect(salida).not.toContain("ventas_nota_corta");
    expect(salida).toContain("200");
  });
});

describe("otra persona cambió la ficha mientras se editaba (ADR-0193)", () => {
  const conflicto = {
    code: "PT409",
    message: "Otra persona cambió esta prenda mientras la editabas. Recarga para ver sus cambios.",
    details: null,
    hint: "version_cambiada",
  };

  it("se reconoce por el código PT409 y pasa el mensaje de la base tal cual", () => {
    expect(esVersionCambiada(conflicto)).toBe(true);
    expect(traducirError(conflicto, "guardar el producto")).toBe(conflicto.message);
  });

  it("un P0001 cualquiera no es un conflicto de versión", () => {
    expect(esVersionCambiada({ code: "P0001", message: "Falta la referencia del producto." })).toBe(false);
    expect(esVersionCambiada(null)).toBe(false);
  });
});
