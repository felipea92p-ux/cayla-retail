import { describe, expect, it } from "vitest";
import {
  argsResolverDeuda,
  avanceDeDeuda,
  borradorReposicion,
  camposReposicion,
  cantidadAnotada,
  cantidadDePrendas,
  cubrirReposiciones,
  cuandoFue,
  deudaDe,
  detalleDeReposicion,
  dondeFalto,
  leerCantidadReposicion,
  leerDeudasDelEnvio,
  leerNosDebe,
  leerResultadoResolucion,
  leerResumenNosDebe,
  limpiarCantidadReposicion,
  mensajeDeNosDebe,
  NOS_DEBE_VACIO,
  nombreDeDeuda,
  opcionReposicion,
  pendienteDe,
  problemaDeNota,
  queDebe,
  queDebeElProveedor,
  sugiereRecargarNosDebe,
  textoBotonReposicion,
  textoDeDeuda,
  textoDeResolucion,
  tituloAvisoOrden,
  TOPES_REPOSICION,
  type BorradorReposicion,
  type DeudaProveedor,
} from "./nos-debe-reglas";
import { sePuedeConfirmar } from "./guia-campos";

// «Nos debe» (ADR-0362, fase 5a): la lógica pura de la pantalla. El contrato con la base:
// docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md.

const HOY = "2026-10-15";

/** Una deuda como la del banco: ENV-000061 a Tienda Trujillo, 2 chompas CAYLA a S/ 42.00 que no vinieron. */
const FILA = {
  diferencia_id: "dif-1",
  envio: "ENV-000061",
  despacho_id: "env-61",
  sede: { id: "tru", nombre: "Tienda Trujillo" },
  fecha: "2026-10-13T00:44:59.633413+00:00", // 19:44 del 12 en Lima
  categoria: { id: "cat-chompas", nombre: "Chompas" },
  marca: { id: "m-cayla", nombre: "CAYLA" },
  descripcion: "Chompa cuello alto",
  cantidad: 2,
  resuelto: 0,
  pendiente: 2,
  costo_unitario: 42,
  monto_pendiente: 84,
  resoluciones: [],
};

const deuda = (cambios: Partial<DeudaProveedor> = {}): DeudaProveedor => ({ ...leerNosDebe({ abiertas: [FILA] })!.abiertas[0]!, ...cambios });

// ---------------------------------------------------------------------------------------------------------------------------------
// Cómo se dice
// ---------------------------------------------------------------------------------------------------------------------------------

describe("cantidadDePrendas: el nombre de la categoría en plural, y en singular con una sola", () => {
  // Las categorías activas del catálogo el 2026-10-12 (banco de pruebas): el nombre se escribe en plural; una prenda se dice en singular.
  const CATEGORIAS: [string, string, string][] = [
    ["Abrigos", "1 abrigo", "2 abrigos"],
    ["Anillos", "1 anillo", "2 anillos"],
    ["Aretes", "1 arete", "2 aretes"],
    ["Bailarinas", "1 bailarina", "2 bailarinas"],
    ["Blazers", "1 blazer", "2 blazers"],
    ["Bodys", "1 body", "2 bodys"],
    ["Bolsos y Carteras", "1 bolso o cartera", "2 bolsos y carteras"],
    ["Botas", "1 bota", "2 botas"],
    ["Botines", "1 botín", "2 botines"],
    ["Camisas y Blusas", "1 camisa o blusa", "2 camisas y blusas"],
    ["Casacas", "1 casaca", "2 casacas"],
    ["Chalecos", "1 chaleco", "2 chalecos"],
    ["Chompas", "1 chompa", "2 chompas"],
    ["Cinturones", "1 cinturón", "2 cinturones"],
    ["Collares", "1 collar", "2 collares"],
    ["Colores", "1 color", "2 colores"],
    ["Conjuntos", "1 conjunto", "2 conjuntos"],
    ["Enterizos", "1 enterizo", "2 enterizos"],
    ["Faldas", "1 falda", "2 faldas"],
    ["Gorros y Sombreros", "1 gorro o sombrero", "2 gorros y sombreros"],
    ["Jeans", "1 jean", "2 jeans"],
    ["Lapiceros", "1 lapicero", "2 lapiceros"],
    ["Lentes de sol", "1 lente de sol", "2 lentes de sol"],
    ["Libretas/Cuadernos", "1 libreta/cuaderno", "2 libretas/cuadernos"],
    ["Maquillaje", "1 unidad de maquillaje", "2 unidades de maquillaje"],
    ["Mocasines", "1 mocasín", "2 mocasines"],
    ["Mochilas", "1 mochila", "2 mochilas"],
    ["Pantalones", "1 pantalón", "2 pantalones"],
    ["Pañuelos y Pañoletas", "1 pañuelo o pañoleta", "2 pañuelos y pañoletas"],
    ["Poleras", "1 polera", "2 poleras"],
    ["Polos", "1 polo", "2 polos"],
    ["Pulseras", "1 pulsera", "2 pulseras"],
    ["Relojes", "1 reloj", "2 relojes"],
    ["Riñoneras", "1 riñonera", "2 riñoneras"],
    ["Ropa interior/Lencería", "1 unidad de ropa interior/lencería", "2 unidades de ropa interior/lencería"],
    ["Sandalias", "1 sandalia", "2 sandalias"],
    ["Shorts", "1 short", "2 shorts"],
    ["Tops", "1 top", "2 tops"],
    ["Útiles de oficina", "1 útil de oficina", "2 útiles de oficina"],
    ["Vestidos", "1 vestido", "2 vestidos"],
    ["Zapatillas", "1 zapatilla", "2 zapatillas"],
    ["Zapatos formales", "1 zapato formal", "2 zapatos formales"],
  ];

  it.each(CATEGORIAS)("%s", (categoria, una, dos) => {
    expect(cantidadDePrendas(1, categoria)).toBe(una);
    expect(cantidadDePrendas(2, categoria)).toBe(dos);
  });

  it("sin categoría, prendas; las cantidades grandes llevan su coma de miles", () => {
    expect(cantidadDePrendas(1, null)).toBe("1 prenda");
    expect(cantidadDePrendas(3, "")).toBe("3 prendas");
    expect(cantidadDePrendas(1200, "Polos")).toBe("1,200 polos");
  });

  it("lo que un líder crea sin deploy cae bien casi siempre (una regla de tienda, no un diccionario)", () => {
    expect(cantidadDePrendas(1, "Trajes de baño")).toBe("1 traje de baño");
    expect(cantidadDePrendas(1, "Calcetines")).toBe("1 calcetín");
    expect(cantidadDePrendas(1, "Lápices")).toBe("1 lápiz");
  });
});

describe("una deuda en palabras de tienda", () => {
  it("el texto exacto del contrato: «2 chompas · S/ 84.00 · ENV-000061 · Tienda Trujillo · hace 3 días»", () => {
    expect(textoDeDeuda(deuda(), HOY)).toBe("2 chompas · S/ 84.00 · ENV-000061 · Tienda Trujillo · hace 3 días");
    expect(queDebe(deuda())).toBe("2 chompas");
    expect(nombreDeDeuda(deuda())).toBe("Chompas · CAYLA · Chompa cuello alto");
    expect(dondeFalto(deuda(), HOY)).toBe("ENV-000061 · Tienda Trujillo · hace 3 días");
  });

  it("la fecha es la de Lima: lo recibido a las 7:44 pm del 12 es del 12, aunque en UTC ya sea el 13", () => {
    expect(cuandoFue("2026-10-13T00:44:59+00:00", "2026-10-12")).toBe("hoy");
    expect(cuandoFue("2026-10-13T00:44:59+00:00", "2026-10-13")).toBe("ayer");
    expect(cuandoFue("2026-10-01", "2026-10-15")).toBe("hace 14 días");
    expect(cuandoFue("2026-07-01", "2026-10-15")).toBe("hace 3 meses");
    expect(cuandoFue(null, HOY)).toBeNull();
    expect(cuandoFue("no es fecha", HOY)).toBeNull();
  });

  it("lo que ya llegó de una deuda a medias", () => {
    expect(avanceDeDeuda(deuda())).toBeNull();
    expect(avanceDeDeuda(deuda({ cantidad: 3, resuelto: 1, pendiente: 2 }))).toBe("ya llegó 1 de 3");
    expect(avanceDeDeuda(deuda({ cantidad: 5, resuelto: 2, pendiente: 3 }))).toBe("ya llegaron 2 de 5");
    expect(avanceDeDeuda(deuda({ cantidad: 2, resuelto: 2, pendiente: 0 }))).toBeNull();
  });

  it("cómo se cerró: en un envío o a mano", () => {
    expect(textoDeResolucion({ forma: "repuesta", cantidad: 2, envio: "ENV-000075", nota: null, por: "Sandra Ruiz", fecha: "2026-10-15T15:00:00Z" }, HOY)).toBe(
      "Llegaron 2 en ENV-000075 · Sandra Ruiz · hoy",
    );
    expect(textoDeResolucion({ forma: "repuesta", cantidad: 1, envio: null, nota: "La trajo el chofer", por: null, fecha: "2026-10-14" }, HOY)).toBe(
      "Llegó 1, anotado a mano («La trajo el chofer») · ayer",
    );
    expect(textoDeResolucion({ forma: "repuesta", cantidad: 3, envio: null, nota: null, por: "Felipe Alvarez", fecha: null }, HOY)).toBe("Llegaron 3, anotado a mano · Felipe Alvarez");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que contesta la base
// ---------------------------------------------------------------------------------------------------------------------------------

describe("leerNosDebe: tolerante a la forma", () => {
  it("abiertas y cerradas: lo pendiente manda, no el cajón; la más antigua primero, las cerradas la más reciente primero", () => {
    const n = leerNosDebe({
      abiertas: [
        { ...FILA, diferencia_id: "nueva", fecha: "2026-10-14T15:00:00Z" },
        FILA,
        { ...FILA, diferencia_id: "ya-cerrada", pendiente: 0, resuelto: 2 },
      ],
      cerradas: [
        { ...FILA, diferencia_id: "c-vieja", fecha: "2026-09-20T15:00:00Z", pendiente: 0, resuelto: 2, resoluciones: [{ forma: "repuesta", cantidad: 2, creado_en: "2026-10-01T15:00:00Z" }] },
        { ...FILA, diferencia_id: "c-nueva", fecha: "2026-09-20T15:00:00Z", pendiente: 0, resuelto: 2, resoluciones: [{ forma: "repuesta", cantidad: 2, creado_en: "2026-10-10T15:00:00+00:00" }] },
      ],
    })!;
    expect(n.abiertas.map((d) => d.diferenciaId)).toEqual(["dif-1", "nueva"]);
    // «ya-cerrada» no trae sus resoluciones: cuenta la fecha de la deuda (13/10), la más reciente.
    expect(n.cerradas.map((d) => d.diferenciaId)).toEqual(["ya-cerrada", "c-nueva", "c-vieja"]);
    expect(n.unidadesPendientes).toBe(4);
    expect(n.montoPendiente).toBe(168);
  });

  it("lee lo que manda la base de verdad (fn_proveedor_nos_debe en el banco, 2026-10-12)", () => {
    const real = {
      proveedor: { id: "677256f3", nombre: "Textiles Andina SAC" },
      deudas: 1,
      unidades: 2,
      monto: 84.0,
      monto_con_igv: 84.0,
      abiertas: [
        {
          nota: null,
          sede: { id: "1553ad0b", nombre: "Tienda Trujillo" },
          envio: "ENV-000061",
          fecha: "2026-10-13T00:44:59.633413+00:00",
          marca: { id: "b582e5ee", nombre: "CAYLA" },
          monto: 84.0,
          orden: { id: "2f8bb7e5", numero: "OC-000129" },
          papel: null,
          estado: "por_reponer",
          con_igv: false,
          cantidad: 2,
          resuelto: 0,
          categoria: { id: "e7572f6f", nombre: "Chompas", familia: "indumentaria", prefijo: "CMP" },
          pendiente: 2,
          proveedor: { id: "677256f3", nombre: "Textiles Andina SAC" },
          saldada_en: null,
          anotado_por: "Sandra Quispe",
          descripcion: "Chompa cuello alto",
          despacho_id: "a865a54a",
          resoluciones: [],
          diferencia_id: "82d5f1f7",
          costo_unitario: 42.0,
          monto_pendiente: 84.0,
          monto_pendiente_con_igv: null,
        },
      ],
      cerradas: [],
    };
    const n = leerNosDebe(real)!;
    expect(n).toMatchObject({ unidadesPendientes: 2, montoPendiente: 84, montoConIgv: null, cerradas: [] });
    expect(n.abiertas[0]).toMatchObject({ diferenciaId: "82d5f1f7", envio: "ENV-000061", sede: "Tienda Trujillo", orden: "OC-000129", categoria: "Chompas", categoriaId: "e7572f6f", marca: "CAYLA", pendiente: 2, conIgv: false });
    expect(textoDeDeuda(n.abiertas[0]!, HOY)).toBe("2 chompas · S/ 84.00 · ENV-000061 · Tienda Trujillo · hace 3 días");
  });

  it("con alguna factura con IGV, el total con IGV se dice; sin ninguna, no", () => {
    const conIgv = leerNosDebe({ monto_con_igv: 113.04, abiertas: [{ ...FILA, con_igv: true, monto_pendiente_con_igv: 99.12 }, { ...FILA, diferencia_id: "otra", monto_pendiente: 13.92, cantidad: 1, pendiente: 1 }] })!;
    expect(conIgv.montoConIgv).toBe(113.04);
    expect(leerNosDebe({ abiertas: [{ ...FILA, con_igv: true, monto_pendiente_con_igv: 99.12 }] })!.montoConIgv).toBe(99.12);
    expect(leerNosDebe({ abiertas: [FILA] })!.montoConIgv).toBeNull();
  });

  it("una lista suelta, `{ deudas }` o la lista de una función que devuelve filas: lo mismo", () => {
    const deLista = leerNosDebe([FILA])!;
    expect(deLista.abiertas).toHaveLength(1);
    expect(leerNosDebe({ deudas: [FILA] })!.abiertas).toEqual(deLista.abiertas);
    expect(leerNosDebe([{ abiertas: [FILA], cerradas: [] }])!.abiertas).toEqual(deLista.abiertas);
  });

  it("lo que falta se calcula: pendiente, resuelto y monto (sin el monto, pendiente × costo, en céntimos exactos)", () => {
    const d = leerNosDebe([{ id: "d1", cantidad: 3, costo: 33.3, resoluciones: [{ forma: "repuesta", cantidad: 1, envio: { numero: 75 } }] }])!.abiertas[0]!;
    expect(d).toMatchObject({ diferenciaId: "d1", cantidad: 3, resuelto: 1, pendiente: 2, montoPendiente: 66.6 });
    expect(d.resoluciones[0]).toMatchObject({ forma: "repuesta", cantidad: 1, envio: "ENV-000075" });
  });

  it("la forma plana (texto e id al lado) y el IGV de una factura", () => {
    const d = leerNosDebe([
      { diferencia_id: "d2", numero_envio: 61, sede_nombre: "Tienda Lima", creado_en: "2026-10-10", categoria: "Polos", categoria_id: "c", marca: "Kero", marca_id: "m", cantidad: 1, costo_unitario: 20, con_igv: true, monto_pendiente_con_igv: 23.6 },
    ])!.abiertas[0]!;
    expect(d).toMatchObject({ envio: "ENV-000061", sede: "Tienda Lima", categoria: "Polos", categoriaId: "c", marca: "Kero", marcaId: "m", conIgv: true, montoConIgv: 23.6, montoPendiente: 20 });
  });

  it("una fila rara se descarta; una repetida cuenta una vez; nada es «no te debe nada»; algo que no se entiende es null", () => {
    const n = leerNosDebe({ abiertas: [FILA, FILA, { cantidad: 2 }, { diferencia_id: "x", cantidad: 0 }, "basura", null] })!;
    expect(n.abiertas).toHaveLength(1);
    expect(leerNosDebe(null)).toEqual(NOS_DEBE_VACIO);
    expect(leerNosDebe({})).toEqual(NOS_DEBE_VACIO);
    expect(leerNosDebe("hola")).toBeNull();
    expect(leerNosDebe(42)).toBeNull();
  });

  it("lo pendiente nunca pasa de lo que faltó ni baja de cero", () => {
    expect(leerNosDebe([{ ...FILA, pendiente: 9 }])!.abiertas[0]!.pendiente).toBe(2);
    expect(leerNosDebe([{ ...FILA, pendiente: -1 }])!.cerradas[0]!.pendiente).toBe(0);
  });
});

describe("leerResumenNosDebe y el aviso de la orden nueva", () => {
  it("por proveedor; el que no debe nada no entra", () => {
    const r = leerResumenNosDebe([
      { proveedor_id: "p1", proveedor: "Textiles Andina SAC", unidades: 2, monto: 50, detalle: [{ categoria: "Polos", unidades: 2 }] },
      { proveedor: { id: "p2", nombre: "Kero" }, unidades_pendientes: 0, monto_pendiente: 0 },
      { proveedor_id: "p3", pendiente: "3", monto_pendiente: "60.5" },
      "basura",
    ]);
    expect(Object.keys(r)).toEqual(["p1", "p3"]);
    expect(r.p1).toEqual({ proveedorId: "p1", nombre: "Textiles Andina SAC", unidades: 2, monto: 50, detalle: [{ categoria: "Polos", unidades: 2 }] });
    expect(r.p3).toMatchObject({ unidades: 3, monto: 60.5, detalle: [] });
    expect(leerResumenNosDebe({ proveedores: [{ proveedor_id: "p1", unidades: 1 }] })).toHaveProperty("p1");
    expect(leerResumenNosDebe(null)).toEqual({});
  });

  it("la base lo detalla por categoría y marca: el aviso junta por categoría, la que más debe primero", () => {
    const r = leerResumenNosDebe([
      {
        proveedor_id: "p1",
        proveedor: "Textiles Andina SAC",
        unidades: 4,
        monto: 120,
        detalle: [
          { categoria_id: "c1", categoria: "Polos", marca_id: "m1", marca: "CAYLA", unidades: 1, monto: 20 },
          { categoria_id: "c2", categoria: "Chompas", marca_id: "m1", marca: "CAYLA", unidades: 2, monto: 84 },
          { categoria_id: "c1", categoria: "Polos", marca_id: "m2", marca: "Kero", unidades: 1, monto: 16 },
        ],
      },
    ]);
    expect(r.p1!.detalle).toEqual([
      { categoria: "Chompas", unidades: 2 },
      { categoria: "Polos", unidades: 2 },
    ]);
    expect(tituloAvisoOrden("Textiles Andina SAC", r.p1!)).toBe("Textiles Andina SAC te debe 2 chompas y 2 polos (S/ 120.00) por reponer");
  });

  it("el texto del contrato: «Textiles Andina te debe 2 polos (S/ 50.00) por reponer»", () => {
    expect(tituloAvisoOrden("Textiles Andina", { unidades: 2, monto: 50, detalle: [{ categoria: "Polos", unidades: 2 }] })).toBe(
      "Textiles Andina te debe 2 polos (S/ 50.00) por reponer",
    );
  });

  it("varias categorías, y sin el detalle: en prendas", () => {
    expect(queDebeElProveedor({ unidades: 3, detalle: [{ categoria: "Chompas", unidades: 2 }, { categoria: "Polos", unidades: 1 }] })).toBe("2 chompas y 1 polo");
    expect(queDebeElProveedor({ unidades: 7, detalle: [{ categoria: "Chompas", unidades: 2 }, { categoria: "Polos", unidades: 1 }, { categoria: "Tops", unidades: 4 }] })).toBe(
      "2 chompas, 1 polo y 4 prendas más",
    );
    expect(queDebeElProveedor({ unidades: 1, detalle: [] })).toBe("1 prenda");
    expect(tituloAvisoOrden("Kero", { unidades: 2, monto: 0, detalle: [] })).toBe("Kero te debe 2 prendas por reponer");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La hoja «Llegó la reposición»
// ---------------------------------------------------------------------------------------------------------------------------------

describe("la cantidad y la nota de la hoja", () => {
  it("un entero de 1 a lo pendiente", () => {
    expect(leerCantidadReposicion("2", 2)).toEqual({ n: 2, problema: null });
    expect(leerCantidadReposicion(" 1 ", 2)).toEqual({ n: 1, problema: null });
    expect(leerCantidadReposicion("", 2).problema).toBe("Escribe cuántas llegaron.");
    expect(leerCantidadReposicion("0", 2).problema).toBe("Tiene que haber llegado al menos 1.");
    expect(leerCantidadReposicion("3", 2).problema).toBe("Te debía 2 prendas: no pueden haber llegado más.");
    expect(leerCantidadReposicion("3", 2, "Chompas").problema).toBe("Te debía 2 chompas: no pueden haber llegado más.");
    expect(leerCantidadReposicion("1.5", 2).problema).toMatch(/solo el número/);
    expect(leerCantidadReposicion("-1", 2).problema).toMatch(/solo el número/);
  });

  it("al tipear solo entran dígitos, hasta 4", () => {
    expect(limpiarCantidadReposicion("2a")).toBe("2");
    expect(limpiarCantidadReposicion("123456")).toBe("1234");
  });

  it("la nota es obligatoria y va hasta 300 letras", () => {
    expect(problemaDeNota("")).toMatch(/Escribe cómo llegó/);
    expect(problemaDeNota("   ")).toMatch(/Escribe cómo llegó/);
    expect(problemaDeNota("La trajo el chofer")).toBeNull();
    expect(problemaDeNota("x".repeat(TOPES_REPOSICION.nota))).toBeNull();
    expect(problemaDeNota("x".repeat(TOPES_REPOSICION.nota + 1))).toMatch(/300/);
  });

  it("viene puesto todo lo que se debía", () => {
    expect(borradorReposicion(deuda())).toEqual({ cantidad: "2", nota: "" });
  });
});

describe("la guía de la hoja (ADR-0284)", () => {
  const listo: { listo: boolean; motivo: string | null } = { listo: true, motivo: null };
  const ids = (b: BorradorReposicion, d: DeudaProveedor, tocada = false, r = listo) => camposReposicion(b, d, r, { cantidad: tocada });

  it("la cantidad que viene puesta es «sugerida» hasta que se toca: nunca bloquea", () => {
    const campos = ids({ cantidad: "2", nota: "" }, deuda());
    expect(campos.map((c) => [c.id, c.requerido, c.sugerido ?? false, c.hecho])).toEqual([
      ["cantidad", false, true, false],
      ["nota", true, false, false],
      ["responsable", true, false, true],
    ]);
    const tocada = ids({ cantidad: "1", nota: "" }, deuda(), true);
    expect(tocada[0]).toMatchObject({ id: "cantidad", requerido: true, hecho: true });
  });

  it("puesta mal, la cantidad bloquea aunque no se haya tocado", () => {
    expect(ids({ cantidad: "", nota: "ok" }, deuda())[0]).toMatchObject({ id: "cantidad", requerido: true, hecho: false, pendiente: "Escribe cuántas llegaron." });
  });

  it("con una sola pendiente no se pregunta cuántas", () => {
    const una = deuda({ cantidad: 1, pendiente: 1 });
    expect(ids(borradorReposicion(una), una).map((c) => c.id)).toEqual(["nota", "responsable"]);
    expect(cantidadAnotada({ cantidad: "", nota: "" }, una)).toBe(1);
  });

  it("sin responsable no se puede", () => {
    const campos = ids({ cantidad: "2", nota: "ok" }, deuda(), false, { listo: false, motivo: "Marca tu entrada primero." });
    expect(sePuedeConfirmar(campos)).toBe(false);
    expect(campos.at(-1)).toMatchObject({ id: "responsable", pendiente: "Marca tu entrada primero." });
  });
});

/**
 * `resolver_deuda_proveedor` tal como la escribe el contrato: forma «repuesta», cantidad entera de 1 a lo pendiente, nota obligatoria (hasta
 * 300). Lo que la guía deja pasar, la base lo acepta; lo que la base rechaza, la guía lo bloquea.
 */
function rechazoDeLaBase(args: ReturnType<typeof argsResolverDeuda>, pendiente: number): string | null {
  if (args.p_forma !== "repuesta") return "forma";
  if (!Number.isInteger(args.p_cantidad) || args.p_cantidad < 1 || args.p_cantidad > pendiente) return "cantidad";
  if (args.p_nota.trim() === "" || args.p_nota.length > TOPES_REPOSICION.nota) return "nota";
  if (!args.p_token) return "token";
  return null;
}

describe("espejo de resolver_deuda_proveedor: la guía y la base dicen lo mismo", () => {
  const escenarios: { nombre: string; d: DeudaProveedor; b: BorradorReposicion }[] = [
    { nombre: "todo lo pendiente, con nota", d: deuda(), b: { cantidad: "2", nota: "La trajo el chofer" } },
    { nombre: "una parte", d: deuda(), b: { cantidad: "1", nota: "Llegó una en la caja del 14" } },
    { nombre: "sin nota", d: deuda(), b: { cantidad: "2", nota: "" } },
    { nombre: "nota de espacios", d: deuda(), b: { cantidad: "2", nota: "   " } },
    { nombre: "nota muy larga", d: deuda(), b: { cantidad: "2", nota: "x".repeat(301) } },
    { nombre: "más de lo pendiente", d: deuda(), b: { cantidad: "3", nota: "ok" } },
    { nombre: "cero", d: deuda(), b: { cantidad: "0", nota: "ok" } },
    { nombre: "vacía", d: deuda(), b: { cantidad: "", nota: "ok" } },
    { nombre: "una sola pendiente", d: deuda({ cantidad: 1, pendiente: 1 }), b: { cantidad: "", nota: "ok" } },
    { nombre: "a medias: queda 1", d: deuda({ cantidad: 3, resuelto: 2, pendiente: 1 }), b: { cantidad: "1", nota: "ok" } },
  ];

  it.each(escenarios.map((e) => [e.nombre, e] as const))("%s", (_, { d, b }) => {
    const guiaDejaPasar = sePuedeConfirmar(camposReposicion(b, d, { listo: true, motivo: null }, { cantidad: true }));
    const rechazo = rechazoDeLaBase(argsResolverDeuda(d, b, "tok"), d.pendiente);
    expect(guiaDejaPasar, `${_}: la guía y la base no dicen lo mismo (${rechazo ?? "la base acepta"})`).toBe(rechazo === null);
  });

  it("los argumentos: forma «repuesta», la nota limpia y el token de la hoja", () => {
    expect(argsResolverDeuda(deuda(), { cantidad: "1", nota: "  La trajo el chofer \u0007 " }, "tok-1")).toEqual({
      p_diferencia_id: "dif-1",
      p_forma: "repuesta",
      p_cantidad: 1,
      p_nota: "La trajo el chofer",
      p_token: "tok-1",
    });
  });
});

describe("lo que vuelve y lo que se dice", () => {
  it("el botón dice cuántas se anotan", () => {
    expect(textoBotonReposicion(2)).toBe("Anotar que llegaron 2");
    expect(textoBotonReposicion(1)).toBe("Anotar que llegó 1");
    expect(textoBotonReposicion(null)).toBe("Anotar que llegó");
  });

  it("lo que queda pendiente, si la base lo dice; si no, la cuenta", () => {
    expect(leerResultadoResolucion({ diferencia_id: "dif-1", pendiente: 1 })).toEqual({ pendiente: 1 });
    expect(leerResultadoResolucion([{ deuda: { pendiente: 0 } }])).toEqual({ pendiente: 0 });
    expect(leerResultadoResolucion({})).toEqual({ pendiente: null });
    expect(leerResultadoResolucion(null)).toBeNull();
    expect(detalleDeReposicion("Textiles Andina SAC", deuda(), 2, { pendiente: 0 })).toBe("Textiles Andina SAC ya no te debe nada de esto.");
    expect(detalleDeReposicion("Textiles Andina SAC", deuda(), 1, null)).toBe("Todavía te debe 1 chompa de esto.");
  });

  it("si la deuda cambió mientras la hoja estaba abierta, se ofrece recargar", () => {
    expect(sugiereRecargarNosDebe({ hint: "nos_debe_pasa_de_lo_debido" })).toBe(true);
    expect(sugiereRecargarNosDebe({ hint: "nos_debe_saldada" })).toBe(true);
    expect(sugiereRecargarNosDebe({ hint: "nos_debe_otros_datos" })).toBe(true);
    expect(sugiereRecargarNosDebe({ hint: "nos_debe_nota" })).toBe(false);
    expect(sugiereRecargarNosDebe(null)).toBe(false);
  });

  it("los avisos de la base de esta fase se dicen tal cual; los demás siguen su camino", () => {
    expect(mensajeDeNosDebe({ message: "Esa deuda ya se cerró", hint: "deuda_cerrada" })).toBe("Esa deuda ya se cerró");
    expect(mensajeDeNosDebe({ message: "Todavía no: lo decide Felipe con el contador", hint: "nos_debe_todavia_no" })).toBe("Todavía no: lo decide Felipe con el contador");
    expect(mensajeDeNosDebe({ message: "Sin el módulo", hint: "proveedores_sin_modulo" })).toBeNull();
    expect(mensajeDeNosDebe({ message: "x", hint: "nos_debe_sin_modulo" })).toBeNull();
    expect(mensajeDeNosDebe({ message: "x", hint: null })).toBeNull();
    expect(mensajeDeNosDebe(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La recepción: «Es la reposición de lo que faltó»
// ---------------------------------------------------------------------------------------------------------------------------------

describe("las deudas del envío (fn_envio_detalle.deudas_del_proveedor)", () => {
  it("una fila por deuda o por categoría y marca: se juntan por proveedor, categoría y marca", () => {
    const deudas = leerDeudasDelEnvio([
      { proveedor_id: "p1", categoria_id: "c1", marca_id: "m1", pendiente: 2, costo_unitario: 42 },
      { proveedor: { id: "p1" }, categoria: { id: "c1", nombre: "Chompas" }, marca: { id: "m1" }, pendiente: 1, costo_unitario: 40 },
      { proveedor_id: "p1", categoria_id: "c2", marca_id: "m1", unidades: 3 },
      { proveedor_id: "p1", categoria_id: "c3", marca_id: "m1", pendiente: 0 },
      { categoria_id: "c1", marca_id: "m1", pendiente: 5 },
      null,
    ])!;
    // El costo es el de la deuda más antigua (la primera fila de su clave).
    expect(deudas).toEqual([
      { proveedorId: "p1", categoriaId: "c1", marcaId: "m1", pendiente: 3, costoUnitario: 42 },
      { proveedorId: "p1", categoriaId: "c2", marcaId: "m1", pendiente: 3, costoUnitario: null },
    ]);
    expect(deudaDe(deudas, "p1", "c1", "m1")).toMatchObject({ pendiente: 3, costoUnitario: 42 });
    expect(deudaDe(deudas, "p1", "c3", "m1")).toBeNull();
    expect(pendienteDe(deudas, "p1", "c1", "m1")).toBe(3);
    expect(pendienteDe(deudas, "p2", "c1", "m1")).toBe(0);
    expect(pendienteDe(deudas, null, "c1", "m1")).toBe(0);
    expect(pendienteDe(null, "p1", "c1", "m1")).toBe(0);
  });

  it("sin la lista (la base de antes de la fase 5), null: la recepción no ofrece la reposición", () => {
    expect(leerDeudasDelEnvio(undefined)).toBeNull();
    expect(leerDeudasDelEnvio({})).toBeNull();
    expect(leerDeudasDelEnvio([])).toEqual([]);
  });

  it("la opción dice cuánto se debe, antes y después de elegirla", () => {
    const o = opcionReposicion(1, "Textiles Andina SAC", { categoria: "Polos", marca: "CAYLA" });
    expect(o.valor).toBe("reposicion_faltante");
    expect(o.texto).toBe("Es la reposición de lo que faltó");
    expect(o.aviso).toBe("Textiles Andina SAC te debe 1 polo CAYLA de un envío anterior. Si es lo que faltó, elige «Es la reposición de lo que faltó».");
    expect(o.ayuda).toBe("Se descuentan de lo que Textiles Andina SAC te debe (1 polo CAYLA por reponer).");
    // Sin nombres (algo fuera de la guía que la pantalla no sabe nombrar): en prendas.
    expect(opcionReposicion(2, null).aviso).toBe("Este proveedor te debe 2 prendas de un envío anterior. Si es lo que faltó, elige «Es la reposición de lo que faltó».");
  });
});

describe("cubrirReposiciones: cuántas puede cubrir cada una (espejo de recibir_despacho)", () => {
  const deudas = [{ proveedorId: "p1", categoriaId: "c1", marcaId: "m1", pendiente: 3, costoUnitario: 42 }];

  it("dentro de lo debido, sin problema; lo que toma una ya no está para la siguiente", () => {
    const r = cubrirReposiciones(deudas, [
      { id: "a", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 2 },
      { id: "b", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 1 },
      { id: "c", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 1 },
    ]);
    expect(r.get("a")).toEqual({ disponible: 3, problema: null });
    expect(r.get("b")).toEqual({ disponible: 1, problema: null });
    expect(r.get("c")!.disponible).toBe(0);
    expect(r.get("c")!.problema).toMatch(/no te debe nada de esta categoría y marca/);
  });

  it("con los nombres, el problema dice qué se debe", () => {
    const r = cubrirReposiciones(deudas, [{ id: "a", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 5, categoria: "Chompas", marca: "CAYLA" }]);
    expect(r.get("a")!.problema).toBe("Te debe 3 chompas CAYLA y aquí hay 5 de más: la reposición cubre hasta 3. Elige otra opción.");
  });

  it("pasar de lo debido se rechaza y no gasta lo que queda", () => {
    const r = cubrirReposiciones(deudas, [
      { id: "a", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 4 },
      { id: "b", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 3 },
    ]);
    expect(r.get("a")).toEqual({ disponible: 3, problema: "Te debe 3 prendas y aquí hay 4 de más: la reposición cubre hasta 3. Elige otra opción." });
    expect(r.get("b")).toEqual({ disponible: 3, problema: null });
  });

  it("otro proveedor, otra marca o sin proveedor: no hay nada que cubrir", () => {
    const r = cubrirReposiciones(deudas, [
      { id: "a", proveedorId: "p2", categoriaId: "c1", marcaId: "m1", cantidad: 1 },
      { id: "b", proveedorId: "p1", categoriaId: "c1", marcaId: "m2", cantidad: 1 },
      { id: "c", proveedorId: null, categoriaId: "c1", marcaId: "m1", cantidad: 1 },
    ]);
    expect([...r.values()].every((x) => x.problema !== null)).toBe(true);
    expect(cubrirReposiciones(null, [{ id: "a", proveedorId: "p1", categoriaId: "c1", marcaId: "m1", cantidad: 1 }]).get("a")!.problema).not.toBeNull();
  });
});
