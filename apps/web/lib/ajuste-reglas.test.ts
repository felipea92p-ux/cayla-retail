import { describe, it, expect } from "vitest";
import {
  argumentosDeAjuste,
  candidatasDeHallazgo,
  faltantesDesdeJson,
  resolverHallazgos,
  textoFaltanteConteo,
  textoHallazgoConExceso,
  textoHallazgoSinResponder,
  armarVariantesAjuste,
  cargaInicialAlPiso,
  etiquetaCantidad,
  leerResultadoAjuste,
  TEXTO_AJUSTE_INCIERTO,
  textoExitoAjuste,
  MOTIVOS_AJUSTE,
  motivosAjusteDisponibles,
  NOTA_REPOSICION_CERRADA,
  NOTA_MINIMA_ENCONTRE,
  motivoPideNota,
  notaSuficiente,
  textoProblemaMotivo,
  reposicionCerrada,
  repartirLineasAjuste,
  textoPrendaNueva,
  apartadoEn,
  lineasDeAjuste,
  modoDeAjuste,
  pasarCantidades,
  lugarDeAjuste,
  soloDeLaPrenda,
  stockEn,
  textoApartadoTalla,
  textoTotalAjuste,
  textoQuedara,
  textoProblemaTalla,
  preguntaCantidades,
  minimoDeAjuste,
  textoTrasPaso,
  limpiarTextoAjuste,
  textoStockTalla,
  detalleDeTalla,
  type FilaAjuste,
} from "./ajuste-reglas";

const PISO = "sub-piso";
const ALMACEN = "sub-almacen";

describe("el modal abierto desde una prenda muestra solo su color (Felipe, 2026-09-28)", () => {
  // «Test de Produto 2» en TRU: la fila de Existencias (Celeste) decía 12 en el piso y el modal traía los cuatro colores, 78.
  const colorido = (id: string, talla: string, color: string | null, piso: number): FilaAjuste => ({
    id,
    sku: `SKU-${id}`,
    talla: { valor: talla },
    color: color === null ? null : { nombre: color },
    stock: [{ cantidad: piso, cantidad_apartada: 0, sububicacion_id: PISO }],
  });
  const modelo = [
    colorido("1", "S", "Celeste", 4),
    colorido("2", "S", "Esmeralda", 5),
    colorido("3", "M", "Celeste", 5),
    colorido("4", "M", "Esmeralda", 20),
    colorido("5", "L", "Celeste", 3),
    colorido("6", "U", null, 1),
  ];

  it("con prenda, solo las tallas de ese color — y su total es el de la fila", () => {
    const celeste = armarVariantesAjuste(soloDeLaPrenda(modelo, { color: "Celeste" }), PISO, ALMACEN);
    expect(celeste.map((v) => v.varianteId)).toEqual(["1", "3", "5"]);
    expect(textoTotalAjuste(celeste, "piso")).toBe("12 en el piso");
  });

  it("sin prenda (Productos), el modelo entero", () => {
    expect(soloDeLaPrenda(modelo, undefined)).toHaveLength(6);
  });

  it("una prenda sin color es la de las variantes sin color, no «todas»", () => {
    expect(soloDeLaPrenda(modelo, { color: null }).map((f) => f.id)).toEqual(["6"]);
  });

  it("incluye la talla del color que nunca estuvo en la tienda: se carga ahí como stock inicial (ADR-0235)", () => {
    const nueva: FilaAjuste = { ...colorido("7", "XL", "Celeste", 0), stock: [] };
    const [xl] = armarVariantesAjuste(soloDeLaPrenda([...modelo, nueva], { color: "Celeste" }), PISO, ALMACEN).filter((v) => v.talla === "XL");
    expect(xl.sinHistoria).toBe(true);
  });
});

describe("las líneas del ajuste: qué de lo escrito se guarda", () => {
  const [s, m] = armarVariantesAjuste(
    [
      fila("1", "S", { stock: [{ cantidad: 4, cantidad_apartada: 0, sububicacion_id: PISO }] }),
      fila("2", "M", { stock: [{ cantidad: 2, cantidad_apartada: 1, sububicacion_id: PISO }] }),
    ],
    PISO,
    ALMACEN
  );

  it("lo escrito se suma al stock del lugar y trae lo apartado", () => {
    expect(lineasDeAjuste([s, m], { "1": "+2", "2": " -1 " }, "piso", "diferencia")).toEqual([
      { variante: s, delta: 2, actual: 4, resultado: 6, apartado: 0 },
      { variante: m, delta: -1, actual: 2, resultado: 1, apartado: 1 },
    ]);
  });

  it("vacío, 0 y lo que no es entero no son un ajuste", () => {
    expect(lineasDeAjuste([s, m], { "1": "", "2": "0" }, "piso", "diferencia")).toEqual([]);
    expect(lineasDeAjuste([s], { "1": "1.5" }, "piso", "diferencia")).toEqual([]);
  });

  it("el negativo se dice en la fila de la talla, con los números y sin códigos", () => {
    const [ls, lm] = lineasDeAjuste([s, m], { "1": "-5", "2": "-3" }, "piso", "diferencia");
    expect(textoProblemaTalla(ls, "diferencia")).toBe("Solo hay 4: no se pueden restar 5.");
    expect(textoProblemaTalla(lm, "diferencia")).toBe("Solo hay 2: no se pueden restar 3.");
  });
});

describe("«Conteo físico» pregunta cuántas hay, no cuánto cambia (Felipe, 2026-09-28)", () => {
  const [s, m, l] = armarVariantesAjuste(
    [
      fila("1", "S", { stock: [{ cantidad: 4, cantidad_apartada: 0, sububicacion_id: PISO }] }),
      fila("2", "M", { stock: [{ cantidad: 2, cantidad_apartada: 1, sububicacion_id: PISO }] }),
      fila("3", "L"), // nunca estuvo en la tienda
    ],
    PISO,
    ALMACEN
  );

  it("solo «Conteo físico» cuenta; sin motivo y con los demás se suma o se resta", () => {
    expect(modoDeAjuste("conteo_fisico")).toBe("contado");
    expect((["", "reposicion", "merma", "otro"] as const).map(modoDeAjuste)).toEqual(["diferencia", "diferencia", "diferencia", "diferencia"]);
  });

  it("la trampa que cierra: con «Suma o resta», quien contó 4 y escribe 4 deja 8", () => {
    expect(lineasDeAjuste([s], { "1": "4" }, "piso", "diferencia")[0].resultado).toBe(8);
    expect(lineasDeAjuste([s], { "1": "4" }, "piso", "contado")).toEqual([]);
  });

  it("contar 3 donde el sistema dice 4 registra −1", () => {
    expect(lineasDeAjuste([s], { "1": "3" }, "piso", "contado")).toEqual([{ variante: s, delta: -1, actual: 4, resultado: 3, apartado: 0 }]);
  });

  it("vacío es «no la conté» (no cambia); 0 es «conté cero» (resta todo)", () => {
    expect(lineasDeAjuste([s], { "1": "" }, "piso", "contado")).toEqual([]);
    expect(lineasDeAjuste([s], { "1": "0" }, "piso", "contado")[0].delta).toBe(-4);
  });

  it("la talla nueva en la tienda: lo contado entra entero como stock inicial", () => {
    const lineas = lineasDeAjuste([l], { "3": "5" }, "piso", "contado");
    expect(lineas[0].delta).toBe(5);
    expect(repartirLineasAjuste(lineas).cargaInicial).toHaveLength(1);
  });

  it("cuenta contra el lugar elegido: 4 contadas con el almacén (vacío) elegido suman 4 al almacén", () => {
    expect(lineasDeAjuste([s], { "1": "4" }, "almacen", "contado")[0]).toMatchObject({ actual: 0, delta: 4 });
    expect(etiquetaCantidad("contado", "almacen")).toBe("Contaste en el almacén");
  });

  it("el rótulo dice qué se escribe y, al contar, dónde", () => {
    expect(etiquetaCantidad("contado", "piso")).toBe("Contaste en el piso");
    expect(etiquetaCantidad("contado", "sede")).toBe("Contaste");
    expect(etiquetaCantidad("diferencia", "piso")).toBe("Suma o resta");
  });

  it("cambiar el motivo cambia la forma de lo escrito, nunca lo que se guarda", () => {
    const escrito = { "1": "+2", "2": "-1", "3": "" };
    const contado = pasarCantidades([s, m, l], escrito, "piso", "diferencia", "contado");
    expect(contado).toEqual({ "1": "6", "2": "1" });
    expect(pasarCantidades([s, m, l], contado, "piso", "contado", "diferencia")).toEqual({ "1": "2", "2": "-1" });
    const deltas = (c: Record<string, string>, modo: "diferencia" | "contado") => lineasDeAjuste([s, m, l], c, "piso", modo).map((x) => x.delta);
    expect(deltas(contado, "contado")).toEqual(deltas(escrito, "diferencia"));
  });

  it("lo que no era un ajuste queda vacío al cambiar de forma; sin cambio de forma, todo queda igual", () => {
    expect(pasarCantidades([s], { "1": "4" }, "piso", "contado", "diferencia")).toEqual({});
    expect(pasarCantidades([s], { "1": "0" }, "piso", "diferencia", "contado")).toEqual({});
    expect(pasarCantidades([s], { "1": "1.5" }, "piso", "contado", "contado")).toEqual({ "1": "1.5" });
  });

  it("al contar, la talla muestra también la diferencia, que es lo que queda en Movimientos", () => {
    const [menos] = lineasDeAjuste([s], { "1": "3" }, "piso", "contado");
    const [mas] = lineasDeAjuste([s], { "1": "6" }, "piso", "contado");
    expect(textoQuedara(menos, "contado")).toBe("Quedará en 3 (−1)");
    expect(textoQuedara(mas, "contado")).toBe("Quedará en 6 (+2)");
    expect(textoQuedara(menos, "diferencia")).toBe("Quedará en 3");
    expect(textoQuedara(undefined, "contado")).toBe("");
  });

  it("las apartadas se cuentan: siguen en la tienda y en el stock (ADR-0141)", () => {
    expect(textoApartadoTalla(1, "contado")).toBe(" · 1 apartada (cuéntala)");
    expect(textoApartadoTalla(2, "contado")).toBe(" · 2 apartadas (cuéntalas)");
    const [bajo] = lineasDeAjuste([m], { "2": "0" }, "piso", "contado");
    expect(textoProblemaTalla(bajo, "contado")).toBe(
      "Contaste 0 y hay 1 apartada para clientes. Cuéntalas también; si de verdad falta, libera ese apartado primero."
    );
  });

  it("lo contado negativo se frena con su propio mensaje", () => {
    const [neg] = lineasDeAjuste([s], { "1": "-1" }, "piso", "contado");
    expect(textoProblemaTalla(neg, "contado")).toBe("Lo contado no puede ser negativo.");
  });
});

describe("lo apartado: la fila de Existencias muestra lo libre, el modal lo físico", () => {
  const gris = armarVariantesAjuste(
    [
      fila("1", "S", { stock: [{ cantidad: 5, cantidad_apartada: 0, sububicacion_id: PISO }] }),
      fila("2", "M", {
        stock: [
          { cantidad: 2, cantidad_apartada: 1, sububicacion_id: PISO },
          { cantidad: 3, cantidad_apartada: 2, sububicacion_id: ALMACEN },
        ],
      }),
      fila("3", "L", { stock: [{ cantidad: 2, cantidad_apartada: 0, sububicacion_id: PISO }] }),
    ],
    PISO,
    ALMACEN
  );

  it("parte lo apartado por lugar, igual que el stock", () => {
    const m = gris[1];
    expect([apartadoEn(m, "piso"), apartadoEn(m, "almacen"), apartadoEn(m, "sede")]).toEqual([1, 2, 3]);
    expect([stockEn(m, "piso"), stockEn(m, "almacen"), stockEn(m, "sede")]).toEqual([2, 3, 5]);
  });

  it("el total dice lo físico y lo libre: «8» es la cifra de la fila, «9» la de las tallas", () => {
    expect(textoTotalAjuste(gris, "piso")).toBe("9 en el piso · 1 apartada · 8 libres");
    expect(textoTotalAjuste(gris, "almacen")).toBe("3 en el almacén · 2 apartadas · 1 libre");
  });

  it("cada talla lleva lo suyo al lado del stock, y nada si no tiene", () => {
    expect(textoApartadoTalla(1, "diferencia")).toBe(" · 1 apartada");
    expect(textoApartadoTalla(0, "diferencia")).toBe("");
  });

  it("el ajuste que deja menos que lo apartado se frena en la fila, sin el código de la etiqueta", () => {
    const linea = { variante: {} as never, delta: -1, actual: 1, resultado: 0, apartado: 1 };
    expect(textoProblemaTalla(linea, "diferencia")).toBe("Quedarían 0 y hay 1 apartada para clientes. Libera o resuelve esos apartados primero.");
  });

  it("sin la columna de apartados (filas viejas de las pruebas), cuenta 0", () => {
    const [v] = armarVariantesAjuste([fila("1", "M", { stock: [{ cantidad: 4, sububicacion_id: PISO }] })], PISO, ALMACEN);
    expect(v.apartadoPiso).toBe(0);
  });

  it("donde no se separa piso y almacén, el lugar es la sede entera", () => {
    expect(lugarDeAjuste("piso", false)).toBe("sede");
    expect(lugarDeAjuste("almacen", true)).toBe("almacen");
  });
});

function fila(id: string, talla: string | null, extra: Partial<FilaAjuste> = {}): FilaAjuste {
  return {
    id,
    sku: `SKU-${id}`,
    talla: talla === null ? null : { valor: talla },
    color: { nombre: "Beige" },
    stock: [],
    ...extra,
  };
}

describe("armarVariantesAjuste — talla", () => {
  // Regresión: `variantes.talla` (texto) se eliminó en 20260917100500; la talla ahora
  // llega anidada como `talla:tallas ( valor )`. Si el mapeo lee la forma vieja, el
  // modal muestra todas las prendas como «Única» sin dar error.
  it("la talla sale de `talla.valor` (columna talla_id → tallas), no de una columna de texto", () => {
    const [v] = armarVariantesAjuste([fila("1", "M")], PISO, ALMACEN);
    expect(v.talla).toBe("M");
  });

  it("sin talla asignada queda en null (la pantalla la rotula «Única»)", () => {
    const [v] = armarVariantesAjuste([fila("1", null)], PISO, ALMACEN);
    expect(v.talla).toBeNull();
  });

  it("ordena como se cuenta una curva, no alfabéticamente: XS · S · M · L · XL", () => {
    const filas = ["L", "XS", "M", "XL", "S"].map((t, i) => fila(String(i), t));
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.talla)).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("las tallas numéricas van en orden numérico: 28 · 30 · 32 · 34", () => {
    const filas = ["32", "28", "34", "30"].map((t, i) => fila(String(i), t));
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.talla)).toEqual(["28", "30", "32", "34"]);
  });

  it("una variante sin talla va al final, después de las que sí la tienen", () => {
    const filas = [fila("a", null), fila("b", "L"), fila("c", "S")];
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.talla)).toEqual(["S", "L", null]);
  });

  it("dentro de una misma talla respeta el orden en que llegaron (estable)", () => {
    const filas = [
      fila("1", "M", { color: { nombre: "Beige" } }),
      fila("2", "S", { color: { nombre: "Beige" } }),
      fila("3", "M", { color: { nombre: "Negro" } }),
      fila("4", "S", { color: { nombre: "Negro" } }),
    ];
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.varianteId)).toEqual(["2", "4", "1", "3"]);
  });

  it("no altera el arreglo que recibe", () => {
    const filas = [fila("1", "L"), fila("2", "S")];
    armarVariantesAjuste(filas, PISO, ALMACEN);
    expect(filas.map((f) => f.id)).toEqual(["1", "2"]);
  });
});

describe("armarVariantesAjuste — stock y datos de la fila", () => {
  it("separa piso y almacén y suma el total", () => {
    const [v] = armarVariantesAjuste(
      [
        fila("1", "M", {
          stock: [
            { cantidad: 5, sububicacion_id: PISO },
            { cantidad: 12, sububicacion_id: ALMACEN },
          ],
        }),
      ],
      PISO,
      ALMACEN
    );
    expect(v.stockPiso).toBe(5);
    expect(v.stockAlmacen).toBe(12);
    expect(v.stockSinDividir).toBe(17);
  });

  it("sin fila de stock en una sububicación, esa cantidad es 0 y no rompe", () => {
    const [v] = armarVariantesAjuste([fila("1", "M", { stock: [{ cantidad: 4, sububicacion_id: PISO }] })], PISO, ALMACEN);
    expect(v.stockAlmacen).toBe(0);
    expect(v.stockPiso).toBe(4);
  });

  it("una variante que nunca tuvo stock en la sede (stock null o vacío) queda en 0", () => {
    const filas = armarVariantesAjuste([fila("1", "S", { stock: null }), fila("2", "M", { stock: [] })], PISO, ALMACEN);
    expect(filas.map((v) => [v.stockPiso, v.stockAlmacen, v.stockSinDividir])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("en una sede que no separa piso de almacén, el total sigue saliendo de la suma", () => {
    const [v] = armarVariantesAjuste(
      [fila("1", "M", { stock: [{ cantidad: 9, sububicacion_id: null }] })],
      undefined,
      undefined
    );
    expect(v.stockPiso).toBe(0);
    expect(v.stockAlmacen).toBe(0);
    expect(v.stockSinDividir).toBe(9);
  });

  it("sku ausente pasa a texto vacío y color ausente a null", () => {
    const [v] = armarVariantesAjuste([fila("1", "M", { sku: null, color: null })], PISO, ALMACEN);
    expect(v.sku).toBe("");
    expect(v.color).toBeNull();
  });

  it("sin sku pero con código de etiqueta, muestra el código (así están 128 de 130 variantes en producción)", () => {
    const [v] = armarVariantesAjuste([fila("1", "L", { sku: null, codigo: "POL-0004-VIO-L" })], PISO, ALMACEN);
    expect(v.sku).toBe("POL-0004-VIO-L");
  });
});

describe("motivos del ajuste — «Reposición» no toca el piso (ADR-0208)", () => {
  const valores = (xs: readonly { valor: string }[]) => xs.map((m) => m.valor);

  it("en el piso de una tienda que separa piso y almacén, «Reposición» no se ofrece", () => {
    expect(valores(motivosAjusteDisponibles("piso", true))).toEqual(["merma", "conteo_fisico", "otro"]);
    expect(reposicionCerrada("piso", true)).toBe(true);
  });

  it("en el almacén sigue disponible", () => {
    expect(valores(motivosAjusteDisponibles("almacen", true))).toContain("reposicion");
    expect(reposicionCerrada("almacen", true)).toBe(false);
  });

  it("en una sede que no separa piso y almacén (el Taller) no cambia nada", () => {
    expect(valores(motivosAjusteDisponibles("piso", false))).toEqual(valores(MOTIVOS_AJUSTE));
    expect(reposicionCerrada("piso", false)).toBe(false);
  });

  it("la nota nombra los dos caminos que mueven prendas entre piso y almacén y el motivo para lo encontrado de más", () => {
    expect(NOTA_REPOSICION_CERRADA).toContain("«Colgar en el piso»");
    expect(NOTA_REPOSICION_CERRADA).toContain("«Subir a almacén»");
    expect(NOTA_REPOSICION_CERRADA).toContain("«Conteo físico»");
  });

  it("y el camino de vuelta es «Subir a almacén», en Existencias, y no manda a un módulo que no existe; ya no manda al menú «⋯» que no existe", () => {
    // Sin esta frase, quien quiere guardar entra a Ajustar y arma a mano «Otro» −N en el piso y «Reposición» +N en el
    // almacén: un retiro sin rastro ni nota (revisión del bloque 2 de ADR-0208).
    expect(NOTA_REPOSICION_CERRADA).toContain("Guardar en el almacén: «Subir a almacén».");
    expect(NOTA_REPOSICION_CERRADA).toContain("en Existencias");
    expect(NOTA_REPOSICION_CERRADA).not.toContain("Bajada al piso"); // ADR-0306: ya no es un módulo
    expect(NOTA_REPOSICION_CERRADA).not.toContain("Retirar del piso");
    // Corta a propósito: la nota ocupa su lugar aunque esté invisible en «Almacén» (ADR-0185).
    expect(NOTA_REPOSICION_CERRADA.length).toBeLessThan(260);
  });
});

describe("una prenda sin historia en la tienda no se ajusta: entra como stock inicial (ADR-0235)", () => {
  it("sin ninguna fila de stock en la sede es «sin historia»; con una fila (aunque esté en 0), no", () => {
    const filas = armarVariantesAjuste(
      [fila("1", "S", { stock: [] }), fila("2", "M", { stock: null }), fila("3", "L", { stock: [{ cantidad: 0, sububicacion_id: PISO }] })],
      PISO,
      ALMACEN
    );
    expect(filas.map((v) => [v.varianteId, v.sinHistoria])).toEqual([
      ["1", true],
      ["2", true],
      ["3", false],
    ]);
  });

  it("reparte las líneas: las nuevas con cantidad positiva van a stock inicial, el resto se ajusta", () => {
    const nueva = { sinHistoria: true };
    const conHistoria = { sinHistoria: false };
    const { ajustes, cargaInicial } = repartirLineasAjuste([
      { variante: nueva, delta: 3 },
      { variante: conHistoria, delta: -1 },
      { variante: conHistoria, delta: 2 },
      { variante: nueva, delta: -2 },
    ]);
    expect(cargaInicial.map((l) => l.delta)).toEqual([3]);
    expect(ajustes.map((l) => l.delta)).toEqual([-1, 2]);
  });
});

describe("la carga inicial «en el piso» es una bajada: pide el módulo «Bajada al piso» (ADR-0212, ADR-0235)", () => {
  it("con el módulo, lo nuevo elegido en Piso queda en el piso", () => {
    expect(cargaInicialAlPiso("piso", true, true)).toBe(true);
    expect(textoPrendaNueva("piso", true, true)).toBe("Nueva en esta tienda · entra como stock inicial");
  });

  it("sin el módulo, lo nuevo elegido en Piso entra al almacén, y la fila lo dice antes de confirmar", () => {
    expect(cargaInicialAlPiso("piso", true, false)).toBe(false);
    expect(textoPrendaNueva("piso", true, false)).toMatch(/entra al almacén/);
  });

  it("en Almacén, o en una sede que no separa piso y almacén, nunca se baja nada y el módulo no importa", () => {
    for (const puede of [true, false]) {
      expect(cargaInicialAlPiso("almacen", true, puede)).toBe(false);
      expect(cargaInicialAlPiso("piso", false, puede)).toBe(false);
      expect(textoPrendaNueva("almacen", true, puede)).toBe("Nueva en esta tienda · entra como stock inicial");
      expect(textoPrendaNueva("piso", false, puede)).toBe("Nueva en esta tienda · entra como stock inicial");
    }
  });
});

describe("«Ajustar» de una vez, con marca (ADR-0240)", () => {
  const nueva = { variante: { varianteId: "v-nueva" }, delta: 3 };
  const conHistoria = { variante: { varianteId: "v-vieja" }, delta: -1 };
  const base = { ubicacionId: "tru", sububicacionId: "alm", alPiso: false, token: "tok" };

  it("arma UNA llamada con las dos listas, el motivo solo si hay ajustes y la nota vacía como null", () => {
    expect(argumentosDeAjuste({ ...base, ajustes: [conHistoria], cargaInicial: [nueva], motivo: "conteo_fisico", nota: "  " })).toEqual({
      p_ubicacion_id: "tru",
      p_sububicacion_id: "alm",
      p_ajustes: [{ variante_id: "v-vieja", cantidad: -1 }],
      p_motivo: "conteo_fisico",
      p_cargas: [{ variante_id: "v-nueva", cantidad: 3 }],
      p_al_piso: false,
      p_nota: null,
      p_token: "tok",
    });
    const soloCarga = argumentosDeAjuste({ ...base, ajustes: [], cargaInicial: [nueva], motivo: "conteo_fisico", nota: "caja 3" });
    expect(soloCarga.p_motivo).toBeNull();
    expect(soloCarga.p_nota).toBe("caja 3");
  });

  it("el éxito dice qué se hizo, y si era un reintento de algo ya guardado", () => {
    expect(textoExitoAjuste({ ajustes: 2, cargas: 1 })).toBe("2 variantes ajustadas · 1 cargada como stock inicial");
    expect(textoExitoAjuste({ ajustes: 1, cargas: 0, ya_registrado: true })).toBe("Ya estaba guardado: 1 variante ajustada");
  });

  it("lee la respuesta de la base, y no inventa nada si no calza", () => {
    expect(leerResultadoAjuste({ ajustes: 2, cargas: 0, unidades_cargadas: 0, ya_registrado: false })).toEqual({ ajustes: 2, cargas: 0, enlazados: 0, ya_registrado: false });
    expect(leerResultadoAjuste({ ajustes: "2" })).toBeNull();
    expect(leerResultadoAjuste(null)).toBeNull();
  });

  it("el mensaje de respuesta incierta manda a reenviar lo mismo, no a rehacer", () => {
    expect(TEXTO_AJUSTE_INCIERTO).toMatch(/no se repite/);
  });
});


describe("la prenda que faltó en un conteo y apareció (ADR-0291)", () => {
  const fila = (p: Record<string, unknown> = {}) => ({
    variante_id: "v1",
    conteo_item_id: "item-13",
    conteo_id: "c13",
    conteo_numero: 13,
    cerrado_en: "2026-09-30T14:31:00+00:00",
    faltaron: 1,
    encontradas: 0,
    pendientes: 1,
    ...p,
  });
  const linea = (varianteId: string, delta: number) => ({ variante: { varianteId }, delta });

  it("lee lo que devuelve la base y se queda con UN faltante por prenda: el del conteo más reciente (llegan más recientes primero)", () => {
    const m = faltantesDesdeJson([fila(), fila({ conteo_item_id: "item-9", conteo_numero: 9 }), fila({ variante_id: "v2", conteo_item_id: "item-x", conteo_numero: 5 })]);
    expect(m.size).toBe(2);
    expect(m.get("v1")).toMatchObject({ conteoItemId: "item-13", conteoNumero: 13, faltaron: 1, pendientes: 1 });
    expect(m.get("v2")?.conteoNumero).toBe(5);
  });

  it("una respuesta rota, vacía o sin pendientes no pregunta nada (el ajuste sigue como cualquier otro)", () => {
    expect(faltantesDesdeJson(null).size).toBe(0);
    expect(faltantesDesdeJson({}).size).toBe(0);
    expect(faltantesDesdeJson([fila({ conteo_numero: "13" })]).size).toBe(0);
    expect(faltantesDesdeJson([fila({ pendientes: 0 })]).size).toBe(0);
    expect(faltantesDesdeJson([null, 3, "x"]).size).toBe(0);
  });

  it("solo pregunta a las líneas que SUMAN una prenda con falta: una resta o una prenda sin falta no preguntan", () => {
    const faltantes = faltantesDesdeJson([fila()]);
    const c = candidatasDeHallazgo([linea("v1", 1), linea("v1b", 1)], faltantes);
    expect(c.map((x) => x.linea.variante.varianteId)).toEqual(["v1"]);
    expect(candidatasDeHallazgo([linea("v1", -1)], faltantes)).toHaveLength(0);
    expect(candidatasDeHallazgo([linea("v1", 1)], new Map())).toHaveLength(0);
  });

  it("«Sí» enlaza a la línea del conteo; «No» no enlaza; sin responder queda pendiente de responder", () => {
    const faltantes = faltantesDesdeJson([fila(), fila({ variante_id: "v2", conteo_item_id: "item-v2" }), fila({ variante_id: "v3", conteo_item_id: "item-v3" })]);
    const c = candidatasDeHallazgo([linea("v1", 1), linea("v2", 1), linea("v3", 1)], faltantes);
    const r = resolverHallazgos(c, { v1: "si", v2: "no" });
    expect([...r.enlaces]).toEqual([["v1", "item-13"]]);
    expect(r.sinResponder.map((x) => x.linea.variante.varianteId)).toEqual(["v3"]);
    expect(r.conExceso).toHaveLength(0);
  });

  it("enlazar más de lo que faltó no se deja: dice cuánto se puede", () => {
    const faltantes = faltantesDesdeJson([fila({ faltaron: 2, encontradas: 1, pendientes: 1 })]);
    const c = candidatasDeHallazgo([linea("v1", 2)], faltantes);
    const r = resolverHallazgos(c, { v1: "si" });
    expect(r.enlaces.size).toBe(0);
    expect(r.conExceso).toHaveLength(1);
    expect(textoHallazgoConExceso("Camisa Lara Gris / Estándar", c[0].faltante)).toBe(
      "En el Conteo 13 solo faltaron 1 de Camisa Lara Gris / Estándar: suma 1 para enlazarla y registra el resto en otro ajuste."
    );
    // «No, es otra cosa» sí deja sumar lo que sea.
    expect(resolverHallazgos(c, { v1: "no" }).conExceso).toHaveLength(0);
  });

  it("los textos: el faltante dice el conteo y la fecha; el aviso nombra la prenda", () => {
    expect(textoFaltanteConteo({ conteoNumero: 13, cerradoEn: "2026-09-30T14:31:00+00:00", faltaron: 1, encontradas: 0, pendientes: 1 })).toBe("Faltó 1 en el Conteo 13 (30/09).");
    expect(textoFaltanteConteo({ conteoNumero: 13, cerradoEn: null, faltaron: 3, encontradas: 1, pendientes: 2 })).toBe("Faltó 3 en el Conteo 13. Ya se encontró 1: quedan 2 por encontrar.");
    expect(textoHallazgoSinResponder("Gris antracita / Estándar", { conteoNumero: 13 })).toBe("Indica si Gris antracita / Estándar es la prenda que faltó en el Conteo 13.");
  });

  it("al enviar, el enlace viaja solo en la línea enlazada; sin enlaces el envío es idéntico al de siempre", () => {
    const base = { ubicacionId: "u", sububicacionId: null, cargaInicial: [], motivo: "otro", alPiso: false, nota: "", token: "t" };
    const con = argumentosDeAjuste({ ...base, ajustes: [{ variante: { varianteId: "v1" }, delta: 1, conteoItemId: "item-13" }, { variante: { varianteId: "v2" }, delta: 2 }] });
    expect(con.p_ajustes).toEqual([{ variante_id: "v1", cantidad: 1, conteo_item_id: "item-13" }, { variante_id: "v2", cantidad: 2 }]);
    const sin = argumentosDeAjuste({ ...base, ajustes: [{ variante: { varianteId: "v1" }, delta: 1, conteoItemId: null }] });
    expect(sin.p_ajustes).toEqual([{ variante_id: "v1", cantidad: 1 }]);
  });

  it("el aviso de éxito cuenta lo enlazado", () => {
    expect(textoExitoAjuste({ ajustes: 1, cargas: 0, enlazados: 1 })).toBe("1 variante ajustada · 1 enlazada al conteo donde faltaba");
    expect(leerResultadoAjuste({ ajustes: 1, cargas: 0, enlazados: 1, ya_registrado: false })?.enlazados).toBe(1);
  });
});

describe("las filas del modal, en voz de tienda y sin códigos (Felipe, 2026-10-01)", () => {
  const [s, m, l] = armarVariantesAjuste(
    [
      fila("1", "S", { stock: [{ cantidad: 2, cantidad_apartada: 0, sububicacion_id: ALMACEN }] }),
      fila("2", "M", { stock: [{ cantidad: 5, cantidad_apartada: 2, sububicacion_id: ALMACEN }] }),
      fila("3", "L"), // nunca estuvo en la tienda
    ],
    PISO,
    ALMACEN
  );

  it("la pregunta sobre las tallas cambia con el motivo y, al contar, nombra el lugar", () => {
    expect(preguntaCantidades("diferencia", "almacen")).toBe("¿Cuántas sumas o restas de cada talla?");
    expect(preguntaCantidades("contado", "piso")).toBe("¿Cuántas contaste en el piso de cada talla?");
    expect(preguntaCantidades("contado", "almacen")).toBe("¿Cuántas contaste en el almacén de cada talla?");
    expect(preguntaCantidades("contado", "sede")).toBe("¿Cuántas contaste de cada talla?");
  });

  it("la primera línea dice cuánto hay en el lugar; con varios colores a la vez, el color va delante", () => {
    expect(textoStockTalla(s, "almacen", false)).toBe("2 en el almacén");
    expect(textoStockTalla(l, "almacen", false)).toBe("Nada en el almacén");
    expect(textoStockTalla(s, "piso", false)).toBe("Nada en el piso");
    expect(textoStockTalla({ ...s, color: "Blanco" }, "sede", true)).toBe("Blanco · 2 en la sede");
    expect(textoStockTalla({ ...s, color: null }, "almacen", true)).toBe("2 en el almacén");
  });

  it("el tope de los botones «−»: no baja del stock libre, ni de lo apartado al contar, ni de cero en una prenda nueva", () => {
    expect(minimoDeAjuste(s, "almacen", "diferencia")).toBe(-2);
    expect(minimoDeAjuste(m, "almacen", "diferencia")).toBe(-3); // 5 en el almacén, 2 apartadas: se pueden restar 3
    expect(minimoDeAjuste(m, "almacen", "contado")).toBe(2);
    expect(minimoDeAjuste(s, "almacen", "contado")).toBe(0);
    expect(minimoDeAjuste(l, "almacen", "diferencia")).toBe(0);
    expect(minimoDeAjuste(l, "almacen", "contado")).toBe(0);
  });

  it("«+» y «−» al sumar o restar: parten de cero, vuelven a vacío en cero y se detienen en el tope", () => {
    expect(textoTrasPaso("", 1, "diferencia", 2, -2)).toBe("1");
    expect(textoTrasPaso("1", -1, "diferencia", 2, -2)).toBe(""); // volver a 0 deja la talla sin ajuste
    expect(textoTrasPaso("", -1, "diferencia", 2, -2)).toBe("-1");
    expect(textoTrasPaso("-2", -1, "diferencia", 2, -2)).toBeNull();
    expect(textoTrasPaso("-", 1, "diferencia", 2, -2)).toBe("1"); // un «−» a medio escribir no es un número
  });

  it("«+» y «−» al contar: el primer toque parte de lo que dice el sistema, y no baja de lo apartado", () => {
    expect(textoTrasPaso("", 1, "contado", 5, 2)).toBe("6");
    expect(textoTrasPaso("", -1, "contado", 5, 2)).toBe("4");
    expect(textoTrasPaso("2", -1, "contado", 5, 2)).toBeNull();
    expect(textoTrasPaso("0", 1, "contado", 5, 0)).toBe("1");
  });

  it("al teclear: al contar solo dígitos; al sumar o restar, un «−» al comienzo y dígitos", () => {
    expect(limpiarTextoAjuste("a4b", "contado")).toBe("4");
    expect(limpiarTextoAjuste("-4", "contado")).toBe("4");
    expect(limpiarTextoAjuste("-12", "diferencia")).toBe("-12");
    expect(limpiarTextoAjuste("−3", "diferencia")).toBe("-3"); // el menos tipográfico que escribe un teclado en español
    expect(limpiarTextoAjuste("+2", "diferencia")).toBe("2");
    expect(limpiarTextoAjuste("1-2", "diferencia")).toBe("12");
    expect(limpiarTextoAjuste("-", "diferencia")).toBe("-");
  });

  it("la segunda línea junta cómo queda, lo apartado y, en una prenda nueva, dónde entra; sin nada que decir, queda vacía", () => {
    const base = { ubicado: "almacen", separaPisoAlmacen: true, puedeBajarAlPiso: true, lugar: "almacen" } as const;
    const [linea] = lineasDeAjuste([m], { "2": "-1" }, "almacen", "diferencia");
    expect(detalleDeTalla({ ...base, variante: m, linea, texto: "-1", modo: "diferencia" })).toBe("Quedará en 4 · 2 apartadas");
    expect(detalleDeTalla({ ...base, variante: s, linea: undefined, texto: "", modo: "diferencia" })).toBe("");
    expect(detalleDeTalla({ ...base, variante: l, linea: undefined, texto: "", modo: "diferencia" })).toBe("Nueva en esta tienda · entra como stock inicial");
  });

  it("al contar lo mismo que dice el sistema, la talla dice que coincide (y no queda como «no la conté»)", () => {
    const base = { ubicado: "almacen", separaPisoAlmacen: true, puedeBajarAlPiso: true, lugar: "almacen" } as const;
    expect(detalleDeTalla({ ...base, variante: s, linea: undefined, texto: "2", modo: "contado" })).toBe("Coincide con el sistema");
    expect(detalleDeTalla({ ...base, variante: s, linea: undefined, texto: "", modo: "contado" })).toBe("");
  });
});

describe("«Encontré prendas» y la carga inicial cerrada (ADR-0328, actividad 4)", () => {
  const nueva = { sinHistoria: true };
  const conHistoria = { sinHistoria: false };

  it("«Reposición» se llama «Encontré prendas»; el código del motivo no cambia (la historia de Movimientos tampoco)", () => {
    expect(MOTIVOS_AJUSTE.find((m) => m.valor === "reposicion")?.texto).toBe("Encontré prendas");
    expect(MOTIVOS_AJUSTE.map((m) => m.texto)).not.toContain("Reposición");
    expect(NOTA_REPOSICION_CERRADA).toContain("«Encontré prendas» se registra en el almacén");
  });

  it("pide una nota de 3 letras o más, y solo «Encontré prendas» (la misma regla que la base)", () => {
    expect(motivoPideNota("reposicion")).toBe(true);
    for (const m of ["", "merma", "conteo_fisico", "otro"] as const) {
      expect(motivoPideNota(m)).toBe(false);
      expect(notaSuficiente(m, "")).toBe(true);
    }
    expect(notaSuficiente("reposicion", "")).toBe(false);
    expect(notaSuficiente("reposicion", "  ab  ")).toBe(false);
    expect(notaSuficiente("reposicion", "en una caja")).toBe(true);
    expect(NOTA_MINIMA_ENCONTRE).toBe(3);
  });

  it("solo suma: restar con «Encontré prendas» se dice en la talla, y su «−» no baja de lo que hay", () => {
    expect(textoProblemaMotivo({ variante: conHistoria, delta: -1 }, "reposicion", true)).toMatch(/solo suma/);
    expect(textoProblemaMotivo({ variante: conHistoria, delta: 2 }, "reposicion", true)).toBeNull();
    const s = armarVariantesAjuste([fila("1", "S", { stock: [{ cantidad: 4, sububicacion_id: ALMACEN }] })], PISO, ALMACEN)[0]!;
    expect(minimoDeAjuste(s, "almacen", "diferencia", "reposicion")).toBe(0);
    expect(minimoDeAjuste(s, "almacen", "diferencia", "merma")).toBe(-4);
  });

  it("con la carga ABIERTA, lo nuevo en la tienda sigue entrando como stock inicial", () => {
    const { ajustes, cargaInicial } = repartirLineasAjuste([{ variante: nueva, delta: 3 }, { variante: conHistoria, delta: 1 }], true);
    expect(cargaInicial.map((l) => l.delta)).toEqual([3]);
    expect(ajustes.map((l) => l.delta)).toEqual([1]);
    expect(textoProblemaMotivo({ variante: nueva, delta: 3 }, "conteo_fisico", true)).toBeNull();
  });

  it("con la carga CERRADA no hay stock inicial: todo es ajuste, y lo nuevo entra solo con «Encontré prendas»", () => {
    const { ajustes, cargaInicial } = repartirLineasAjuste([{ variante: nueva, delta: 3 }, { variante: conHistoria, delta: 1 }], false);
    expect(cargaInicial).toEqual([]);
    expect(ajustes.map((l) => l.delta)).toEqual([3, 1]);
    expect(textoProblemaMotivo({ variante: nueva, delta: 3 }, "conteo_fisico", false)).toMatch(/elige «Encontré prendas»/);
    expect(textoProblemaMotivo({ variante: nueva, delta: 3 }, "reposicion", false)).toBeNull();
    // Sin motivo todavía no se marca la talla: la guía pide primero el motivo.
    expect(textoProblemaMotivo({ variante: nueva, delta: 3 }, "", false)).toBeNull();
    // Una prenda con historia no depende de la carga inicial.
    expect(textoProblemaMotivo({ variante: conHistoria, delta: 1 }, "merma", false)).toBeNull();
  });

  it("la fila de una prenda nueva dice por dónde entra, abierta o cerrada", () => {
    expect(textoPrendaNueva("almacen", true, true, true)).toBe("Nueva en esta tienda · entra como stock inicial");
    expect(textoPrendaNueva("almacen", true, true, false)).toBe("Nueva en esta tienda · la carga inicial se cerró: entra con «Encontré prendas»");
    // Revisión adversarial: en el PISO de una tienda que separa piso y almacén «Encontré prendas» no se ofrece; la salida es el almacén.
    for (const puede of [true, false]) {
      expect(textoPrendaNueva("piso", true, puede, false)).toBe("Nueva en esta tienda · la carga inicial se cerró: entra por el almacén con «Encontré prendas»");
    }
    // Una tienda sin piso separado no tiene «piso cerrado»: la frase es la de siempre.
    expect(textoPrendaNueva("piso", false, true, false)).toBe("Nueva en esta tienda · la carga inicial se cerró: entra con «Encontré prendas»");
  });

  it("en el piso cerrado, el problema de la talla manda al almacén, no a un motivo que ahí no está", () => {
    for (const m of ["merma", "conteo_fisico", "otro"] as const) {
      expect(motivosAjusteDisponibles("piso", true).some((x) => x.valor === "reposicion")).toBe(false);
      expect(textoProblemaMotivo({ variante: nueva, delta: 2 }, m, false, true)).toBe(
        "Nunca estuvo en esta tienda y su carga inicial ya se cerró: si la encontraste, anótala en el almacén con «Encontré prendas»."
      );
      expect(textoProblemaMotivo({ variante: nueva, delta: 2 }, m, false, false)).toMatch(/elige «Encontré prendas»\.$/);
    }
    // Abierta, o con historia, el piso no cambia nada.
    expect(textoProblemaMotivo({ variante: nueva, delta: 2 }, "merma", true, true)).toBeNull();
    expect(textoProblemaMotivo({ variante: conHistoria, delta: 2 }, "merma", false, true)).toBeNull();
  });
});
