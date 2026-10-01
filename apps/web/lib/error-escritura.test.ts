import { describe, it, expect } from "vitest";
import { debeEncolarse, esErrorPasajero, esRespuestaIncierta, esSinModulo, esVersionCambiada, traducirError } from "./error-escritura";

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

  it("una etiqueta repetida (aunque esté pendiente o desactivada) dice a dónde ir, sin nombrar el índice", () => {
    const salida = traducirError({ message: 'duplicate key value violates unique constraint "etiquetas_clave_unica"', code: "23505" }, "agregar la etiqueta");
    expect(salida).not.toContain("etiquetas_clave_unica");
    expect(salida).toContain("Ya existe una etiqueta con ese nombre");
    expect(salida).toContain("Catálogo → Atributos → Etiquetas");
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

  it("descuento pasado el 15 % sin argumento: pide escribirlo", () => {
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

describe("esErrorPasajero / debeEncolarse — qué se reintenta solo (ADR-0210)", () => {
  it("un 5xx, un 429 o un 408 se reintentan", () => {
    expect(esErrorPasajero({ message: "Internal Server Error" }, 500)).toBe(true);
    expect(esErrorPasajero({ message: "Service Unavailable" }, 503)).toBe(true);
    expect(esErrorPasajero({ message: "Too Many Requests" }, 429)).toBe(true);
    expect(esErrorPasajero({ message: "Request Timeout" }, 408)).toBe(true);
  });

  it("un choque de transacciones, un bloqueo o un tiempo agotado de la base se reintentan", () => {
    for (const code of ["40001", "40P01", "55P03", "57014", "PGRST002"]) expect(esErrorPasajero({ message: "x", code }, 400)).toBe(true);
  });

  it("un rechazo de negocio NO: reintentarlo repetiría el mismo rechazo", () => {
    expect(esErrorPasajero({ message: "No hay una caja abierta", code: "P0001" }, 400)).toBe(false);
    expect(esErrorPasajero({ message: "duplicate key", code: "23505" }, 409)).toBe(false);
    expect(esErrorPasajero({ message: "permission denied", code: "42501" }, 403)).toBe(false);
    expect(esErrorPasajero(null)).toBe(false);
  });

  it("se encola si no hay red o si el servidor está momentáneamente mal", () => {
    expect(debeEncolarse({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(debeEncolarse({ message: "Bad Gateway" }, 502)).toBe(true);
    expect(debeEncolarse({ message: "No hay una caja abierta", code: "P0001" }, 400)).toBe(false);
  });
});

// Con marca, reenviar es seguro SOLO si no se cambió nada; por eso la pantalla congela lo enviado mientras no sabe qué
// pasó. Confundir un rechazo de la base con una respuesta perdida dejaría la pantalla congelada sin motivo, y al revés
// soltaría la cifra cuando la base quizá ya guardó.
describe("esRespuestaIncierta — ¿se sabe si la base guardó?", () => {
  it("un corte de red o un envío cortado por tiempo: no se sabe", () => {
    for (const message of ["TypeError: Failed to fetch", "TypeError: Load failed", "AbortError: signal is aborted without reason"]) {
      expect(esRespuestaIncierta({ message, code: "" })).toBe(true);
    }
  });
  it("un error sin código de Postgres (un 502 del camino): no se sabe", () => {
    expect(esRespuestaIncierta({ message: "Bad Gateway", code: "" })).toBe(true);
  });
  it("un rechazo con código de la base: se sabe (la transacción se deshizo)", () => {
    expect(esRespuestaIncierta({ message: "Stock insuficiente", code: "P0001" })).toBe(false);
    expect(esRespuestaIncierta({ message: "responsable", code: "42501", hint: "responsable_no_presente" })).toBe(false);
  });
  it("sin error: nada que dudar", () => {
    expect(esRespuestaIncierta(null)).toBe(false);
  });
});

describe("temporadas (ADR-0246): la lista cerrada y sus funciones", () => {
  const FRASE = "Esa temporada no está en la lista. Elige una del desplegable.";

  it("las tres llaves foráneas hacia la lista dicen qué hacer, no «recarga la pantalla»", () => {
    const errores = [
      { tabla: "productos", llave: "productos_temporada_fk" },
      { tabla: "categorias", llave: "categorias_temporada_fk" },
      // La del color se declaró en línea (`references`): Postgres le pone `_fkey`.
      { tabla: "producto_color_temporadas", llave: "producto_color_temporadas_temporada_fkey" },
    ];
    for (const { tabla, llave } of errores) {
      const salida = traducirError(
        {
          message: `insert or update on table "${tabla}" violates foreign key constraint "${llave}"`,
          details: 'Key (temporada)=(Verano 26) is not present in table "temporadas".',
          code: "23503",
        },
        "guardar el producto",
      );
      expect(salida).toBe(FRASE);
    }
  });

  it("otra llave foránea del color (el producto o el color que ya no existe) sigue en el genérico", () => {
    const salida = traducirError(
      { message: 'insert or update on table "producto_color_temporadas" violates foreign key constraint "producto_color_temporadas_color_codigo_fkey"', code: "23503" },
      "guardar la temporada de los colores",
    );
    expect(salida).not.toBe(FRASE);
    expect(salida).toContain("Falta un dato");
  });

  it("los rechazos de las RPC (P0001) pasan tal cual", () => {
    const casos = [
      { message: "La nueva fecha tiene que ser futura: lo que ya empezó queda fijo.", hint: "calendario_pasado" },
      { message: "Solo se ajusta el calendario de este año o del siguiente.", hint: "calendario_fuera_de_rango" },
      { message: "Esa fecha deja la estación fuera de orden: tiene que quedar entre el inicio de la anterior y el de la siguiente.", hint: "calendario_orden" },
      { message: "Una de las prendas ya no existe. No se cambió nada.", hint: "temporada_producto_inexistente" },
      { message: "Ese color no es de esta prenda.", hint: "color_no_es_de_la_prenda" },
    ];
    for (const c of casos) expect(traducirError({ ...c, code: "P0001" }, "guardar la temporada")).toBe(c.message);
  });

  it("los de permiso llegan con 42501 y también pasan tal cual (antes caían al genérico con «Código:»)", () => {
    const calendario = { message: "Solo el líder puede cambiar el calendario de temporadas.", code: "42501", hint: "calendario_sin_permiso" };
    const prendas = { message: "No tienes permiso para cambiar la temporada de las prendas.", code: "42501", hint: "temporada_sin_permiso" };
    expect(traducirError(calendario, "cambiar la fecha")).toBe(calendario.message);
    expect(traducirError(prendas, "guardar la temporada")).toBe(prendas.message);
  });

  it("un 42501 de otro origen no se cuela por la regla de temporadas", () => {
    const salida = traducirError({ message: "permission denied for table temporadas", code: "42501", hint: null }, "guardar la temporada");
    expect(salida).toContain("Código:");
  });

  it("las dos redes del calendario (sin hint) se dicen en palabras de tienda, no con «Código:»", () => {
    const lejos = traducirError(
      { code: "23514", message: 'new row for relation "temporada_fechas" violates check constraint "temporada_fechas_cerca_de_su_estacion"' },
      "guardar la fecha de la estación",
    );
    expect(lejos).toMatch(/demasiado lejos del inicio normal de su estación/);
    expect(lejos).not.toMatch(/\d+ días/); // sin el número: si la base cambia la holgura, la frase no miente
    const repetida = traducirError(
      { code: "23505", message: 'duplicate key value violates unique constraint "temporada_fechas_inicio_unico"' },
      "guardar la fecha de la estación",
    );
    expect(repetida).toBe("Otra estación ya empieza en ese mismo instante. Elige otra hora.");
  });
});

// ADR-0263 (20260929045000): corregir el color y la talla de una variante que ya existe. Las funciones dicen qué pasó y
// qué hacer, con el código de la variante que ya está; dos de sus rechazos llegan con 42501 (permiso) y no deben caer al
// genérico con «Código:».
describe("corregir color y talla de una variante (ADR-0263)", () => {
  it("los rechazos con hint pasan tal cual, también los de permiso (42501)", () => {
    const casos = [
      { message: "El color, la talla y el código de una variante se corrigen desde su ficha, no directo.", code: "42501", hint: "identidad_variante" },
      { message: "No tienes permiso para corregir el color o la talla de una prenda.", code: "42501", hint: "catalogo_sin_permiso" },
      {
        message: "La variante BOD-0003-S ya salió con una clienta (venta, separación en Apartados o cambio): solo un líder puede corregir su color o su talla.",
        code: "42501",
        hint: "correccion_solo_lider",
      },
      {
        message: "Ya existe Negro S en esta prenda (BOD-0003-NEG-S), pero está desactivada: reactívala en vez de corregir esta.",
        code: "P0001",
        hint: "variante_ya_existe",
      },
      {
        message: "Esta prenda quedaría con variantes «Sin color» junto a otras con color. Ponle color a las que no lo tienen o desactívalas.",
        code: "P0001",
        hint: "mezcla_sin_color",
      },
    ];
    for (const c of casos) expect(traducirError(c, "guardar el producto")).toBe(c.message);
  });

  it("el candado de identidad (nulls not distinct) dice que «Sin color» cuenta como un color, sin citar a Postgres", () => {
    const salida = traducirError(
      { message: 'duplicate key value violates unique constraint "variantes_identidad_unica"', code: "23505" },
      "guardar el producto",
    );
    expect(salida).toContain("«Sin color» cuenta como un color");
    expect(salida).not.toContain("variantes_identidad_unica");
    // La talla ya no se compara por texto («M» = «m»): es de la lista cerrada.
    expect(salida).not.toContain("Única");
  });

  it("un 42501 sin esos hints sigue sin colarse", () => {
    expect(traducirError({ message: "permission denied for table variantes", code: "42501", hint: "otra_cosa" }, "guardar el producto")).toContain("Código:");
  });
});

describe("sin el módulo (hint `<módulo>_sin_modulo`, ADR-0249 actualización 2026-09-28)", () => {
  // Lo que escribe `retail.fn_exigir_modulo('clientas')` en las 11 funciones de la ficha de clienta.
  const clientas = {
    message: "Tu rol no tiene el módulo «Clientas». Pídele al líder que lo active en Roles y accesos.",
    code: "42501",
    hint: "clientas_sin_modulo",
  };

  it("buscar o guardar una clienta sin el módulo dice qué pedir, tal cual lo dice la base, y no manda a reintentar", () => {
    const salida = traducirError(clientas, "buscar la clienta");
    expect(salida).toBe(clientas.message);
    expect(salida).not.toContain("Vuelve a intentar");
    expect(salida).not.toContain("Código:");
  });

  it("vale para cualquier módulo con la misma forma de hint: el de «Ajustar stock», que llega con 42501, deja de caer al genérico", () => {
    const ajuste = { message: "Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste", code: "42501", hint: "ajuste_sin_modulo" };
    expect(traducirError(ajuste, "ajustar el stock")).toBe(ajuste.message);
  });

  it("no gana sobre el responsable: un 42501 del combo sigue diciendo qué elegir", () => {
    const salida = traducirError({ message: "falta el responsable", code: "42501", hint: "responsable_requerido" }, "registrar la clienta");
    expect(salida).toContain("Responsable");
  });

  it("un 42501 sin ese hint (o con uno que solo se le parece) sigue cayendo al genérico, con su código", () => {
    expect(traducirError({ message: "permission denied for table clientas", code: "42501", hint: null }, "buscar la clienta")).toContain("Código:");
    expect(traducirError({ message: "x", code: "42501", hint: "clientas_sin_modulo_viejo" }, "buscar la clienta")).toContain("Código:");
    expect(traducirError({ message: "x", code: "42501", hint: "Clientas_sin_modulo" }, "buscar la clienta")).toContain("Código:");
  });

  it("esSinModulo: sí con el hint y un mensaje; no sin mensaje, sin hint, con otro hint, ni sin error", () => {
    expect(esSinModulo(clientas)).toBe(true);
    expect(esSinModulo({ ...clientas, message: "" })).toBe(false);
    expect(esSinModulo({ ...clientas, hint: null })).toBe(false);
    expect(esSinModulo({ ...clientas, hint: "responsable_requerido" })).toBe(false);
    expect(esSinModulo(null)).toBe(false);
  });
});

// ADR-0288 (20260930160000): el documento de la clienta tiene tipo, y la venta se liga a su ficha. Dos de los rechazos no
// llegan como P0001 (22023 el formato, 23505 el documento de otra ficha): sin su hint caerían al genérico con «Código:».
describe("documento de la clienta y venta ligada a su ficha (ADR-0288)", () => {
  it("los rechazos con hint pasan tal cual, también los que no son P0001", () => {
    const casos = [
      { message: "El DNI tiene 8 dígitos.", code: "22023", hint: "documento_invalido" },
      { message: "El pasaporte tiene de 6 a 12 letras o números, sin guiones.", code: "22023", hint: "documento_invalido" },
      {
        message: "Ese documento ya es de otra ficha. Si son la misma clienta, únelas con «Unir con otra ficha».",
        code: "23505",
        hint: "documento_de_otra_ficha",
      },
      {
        message: "Esta clienta pidió borrar sus datos: la venta no se puede guardar a su nombre. Quítala del ticket y vende sin clienta.",
        code: "P0001",
        hint: "clienta_anonimizada",
      },
      { message: "Esa clienta ya no está en la libreta. Quítala del ticket y vuelve a buscarla.", code: "P0001", hint: "clienta_no_existe" },
    ];
    for (const c of casos) {
      const salida = traducirError(c, "guardar la clienta");
      expect(salida).toBe(c.message);
      expect(salida).not.toContain("Código:");
    }
  });

  it("sin mensaje de la base, cada hint tiene su frase de respaldo (nunca el genérico)", () => {
    for (const hint of ["documento_invalido", "documento_de_otra_ficha", "clienta_anonimizada", "clienta_no_existe"]) {
      const salida = traducirError({ message: "", code: "22023", hint }, "registrar la venta");
      expect(salida, hint).not.toContain("Código:");
      expect(salida.length, hint).toBeGreaterThan(20);
    }
  });

  it("el único por documento, si algún camino inserta directo, se explica sin citar el índice", () => {
    const salida = traducirError(
      { message: 'duplicate key value violates unique constraint "clientas_documento_unico"', code: "23505" },
      "registrar la clienta",
    );
    expect(salida).toContain("Ya hay una clienta con ese documento");
    expect(salida).not.toContain("clientas_documento_unico");
  });

  it("un 23505 cualquiera con otro hint no se hace pasar por documento repetido", () => {
    expect(traducirError({ message: "duplicate key value", code: "23505", hint: "otra_cosa" }, "registrar la clienta")).toContain("Código:");
  });
});

// ADR-0288 tanda 1c (20260930230200): el canje del cumpleaños en `registrar_venta`. Llegan como P0001 con su frase; si la
// frase no llega, cada hint tiene la suya (nunca el genérico con «Código:»).
describe("club de clientas: el canje del cumpleaños (ADR-0288 tanda 1c)", () => {
  const HINTS = [
    "cumple_sin_clienta",
    "cumple_no_socia",
    "cumple_fuera_de_mes",
    "cumple_ya_canjeado",
    "cumple_descuento_distinto",
    "cumple_sin_canje",
    "cumple_sin_monto",
  ];

  it("el mensaje de la base pasa tal cual", () => {
    for (const hint of HINTS) {
      const message = `Mensaje de la base para ${hint}.`;
      expect(traducirError({ message, code: "P0001", hint }, "registrar la venta"), hint).toBe(message);
    }
  });

  it("sin mensaje de la base, cada hint tiene su frase de respaldo en castellano", () => {
    for (const hint of HINTS) {
      const salida = traducirError({ message: "", code: "P0001", hint }, "registrar la venta");
      expect(salida, hint).not.toContain("Código:");
      expect(salida, hint).toMatch(/cumpleaños/);
    }
  });
});

// ADR-0288 tanda 1b (20260930200000): el club, sus dos permisos y el WhatsApp de cada tienda. Sus rechazos traen un hint
// estable; algunos llegan con 22023 o 23514 y sin él caerían al genérico con «Código:».
describe("club de clientas: socia, publicidad y WhatsApp de la tienda (ADR-0288 tanda 1b)", () => {
  const HINTS = [
    "club_sin_texto",
    "celular_invalido",
    "no_es_socia",
    "socia_sin_celular",
    "whatsapp_tienda_invalido",
    "socia_sin_documento",
    "club_texto_cambio",
    // Camino B (ADR-0288 act. c).
    "ya_tiene_publicidad",
    "celular_con_publicidad",
  ];

  it("el mensaje de la base pasa tal cual, con cualquier código", () => {
    for (const [hint, code] of [
      ["club_sin_texto", "P0001"],
      ["celular_invalido", "22023"],
      ["no_es_socia", "P0001"],
      ["socia_sin_celular", "23514"],
      ["whatsapp_tienda_invalido", "22023"],
      ["socia_sin_documento", "23514"],
      ["club_texto_cambio", "P0001"],
      ["ya_tiene_publicidad", "P0001"],
      ["celular_con_publicidad", "P0001"],
    ] as const) {
      const message = `Mensaje de la base para ${hint}.`;
      const salida = traducirError({ message, code, hint }, "unirla al club");
      expect(salida, hint).toBe(message);
      expect(salida, hint).not.toContain("Código:");
    }
  });

  it("sin mensaje de la base, cada hint tiene su frase de respaldo (nunca el genérico)", () => {
    for (const hint of HINTS) {
      const salida = traducirError({ message: "", code: "22023", hint }, "guardar el WhatsApp de la tienda");
      expect(salida, hint).not.toContain("Código:");
      expect(salida.length, hint).toBeGreaterThan(20);
    }
  });

  it("camino B: las dos frases nuevas dicen qué pasa con su publicidad", () => {
    expect(traducirError({ message: "", code: "P0001", hint: "ya_tiene_publicidad" }, "mostrar su QR")).toMatch(/Ya recibe novedades/);
    expect(traducirError({ message: "", code: "P0001", hint: "celular_con_publicidad" }, "editar la ficha")).toBe(
      "Cambió su celular: pierde la publicidad hasta que la vuelva a pedir desde el número nuevo."
    );
  });
});
