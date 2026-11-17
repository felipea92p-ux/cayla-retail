import { describe, expect, it } from "vitest";
import { claveDeCompraEnCurso, compraRecuperada, detalleDeRecuperada, fotoYaGuardada, queHacerConLaCompra, type FotoDeCompra } from "./compra-en-curso";
import { PAGO_DE_FABRICA, type LineaCompra } from "./compra-rapida-reglas";

// ADR-0674, Fase 2 · la compra que se está anotando en «Compré ropa» sobrevive a que Android cierre la pestaña.

const linea = (clave: string, cantidad = 2, extra: Partial<LineaCompra> = {}): LineaCompra => ({
  clave,
  productoId: "p1",
  categoriaId: "blusas",
  marcaId: null,
  nombre: "Blusa Emma",
  categoria: "Blusas",
  marca: null,
  cantidad,
  costo: 30,
  venta: 79.9,
  precioPorDefinir: false,
  destinoId: "tru",
  ...extra,
});

const foto = (extra: Partial<FotoDeCompra> = {}): FotoDeCompra => ({
  id: "compra-1",
  proveedorId: "prov-1",
  marcaElegida: null,
  porMarca: true,
  lineas: [linea("a")],
  paso: "revisar",
  tipo: null,
  monto: "",
  serie: "",
  numero: "",
  pago: PAGO_DE_FABRICA,
  pagadoPropio: false,
  pagoParcial: false,
  teniaFoto: false,
  ...extra,
});

const hoy = { proveedores: new Set(["prov-1"]), tiendas: new Set(["tru", "aqp"]), categorias: new Set(["blusas"]) };

describe("queHacerConLaCompra: cuándo se guarda la foto", () => {
  const base = { paso: "revisar" as const, hayProveedor: true, prendas: 1, yaEstaEnLaBase: false };

  it("con proveedor y prendas, se guarda en cualquier paso menos «listo»", () => {
    expect(queHacerConLaCompra(base)).toBe("guardar");
    expect(queHacerConLaCompra({ ...base, paso: "habituales" })).toBe("guardar");
    expect(queHacerConLaCompra({ ...base, paso: "papel" })).toBe("guardar");
  });

  it("sin proveedor o sin prendas no hay nada que recuperar", () => {
    expect(queHacerConLaCompra({ ...base, hayProveedor: false })).toBe("borrar");
    expect(queHacerConLaCompra({ ...base, prendas: 0 })).toBe("borrar");
  });

  it("guardada, se borra: una compra hecha no vuelve", () => {
    expect(queHacerConLaCompra({ ...base, paso: "listo" })).toBe("borrar");
  });

  it("si la base ya dijo que esa compra existe, NUNCA más: recargar no la puede traer de vuelta", () => {
    expect(queHacerConLaCompra({ ...base, yaEstaEnLaBase: true })).toBe("borrar");
    expect(queHacerConLaCompra({ ...base, paso: "papel", yaEstaEnLaBase: true })).toBe("borrar");
  });
});

describe("compraRecuperada: al volver a «Compré ropa»", () => {
  it("vuelve con el MISMO identificador: es lo que impide guardarla dos veces", () => {
    expect(compraRecuperada(foto(), hoy)?.foto.id).toBe("compra-1");
  });

  it("vuelve a «revisar»; al papel solo si estaba en el papel", () => {
    expect(compraRecuperada(foto({ paso: "habituales" }), hoy)?.paso).toBe("revisar");
    expect(compraRecuperada(foto({ paso: "revisar" }), hoy)?.paso).toBe("revisar");
    expect(compraRecuperada(foto({ paso: "papel", tipo: "boleta", monto: "60.00" }), hoy)?.paso).toBe("papel");
  });

  it("sobrevive al viaje por el almacén del navegador (JSON)", () => {
    const ida = foto({ paso: "papel", tipo: "factura", monto: "60.00", serie: "F001", numero: "123", pago: { forma: "ahora", pagado: "20", medio: "yape" }, pagadoPropio: true, pagoParcial: true });
    expect(compraRecuperada(JSON.parse(JSON.stringify(ida)), hoy)).toEqual({ foto: ida, paso: "papel", perdidas: 0 });
  });

  it("si el proveedor ya no está en la lista, no se recupera", () => {
    expect(compraRecuperada(foto({ proveedorId: "otro" }), hoy)).toBeNull();
  });

  it("una prenda cuya tienda o categoría ya no existe se saca y se cuenta, y se vuelve a «revisar» aunque estuviera en el papel", () => {
    const r = compraRecuperada(foto({ paso: "papel", lineas: [linea("a", 2), linea("b", 3, { destinoId: "cerrada" }), linea("c", 1, { categoriaId: "borrada" })] }), hoy);
    expect(r?.foto.lineas.map((l) => l.clave)).toEqual(["a"]);
    expect(r?.perdidas).toBe(4);
    expect(r?.paso).toBe("revisar");
  });

  it("una prenda con la categoría por definir (ADR-0660) se recupera", () => {
    expect(compraRecuperada(foto({ lineas: [linea("a", 1, { categoriaId: null, venta: null, precioPorDefinir: true })] }), hoy)?.perdidas).toBe(0);
  });

  it("si no queda ninguna prenda, no hay compra que recuperar", () => {
    expect(compraRecuperada(foto({ lineas: [linea("a", 2, { destinoId: "cerrada" })] }), hoy)).toBeNull();
  });

  it("nada, basura o una foto de otra versión de la pantalla: no se recupera y no se cae", () => {
    for (const roto of [null, undefined, "x", 7, [], {}, { ...foto(), lineas: [] }, { ...foto(), lineas: [{ clave: "a" }] }, { ...foto(), paso: "listo" }, { ...foto(), paso: "proveedor" }])
      expect(compraRecuperada(roto, hoy)).toBeNull();
    expect(compraRecuperada({ ...foto(), id: "" }, hoy)).toBeNull();
    expect(compraRecuperada({ ...foto(), pago: { forma: "ahora", pagado: 20, medio: "yape" } }, hoy)).toBeNull();
    expect(compraRecuperada({ ...foto(), pago: { forma: "ahora", pagado: "20", medio: "bitcoin" } }, hoy)).toBeNull();
    expect(compraRecuperada({ ...foto(), tipo: "recibo" }, hoy)).toBeNull();
    expect(compraRecuperada({ ...foto(), lineas: [linea("a", 0)] }, hoy)).toBeNull();
    expect(compraRecuperada({ ...foto(), lineas: [linea("a", Number.NaN)] }, hoy)).toBeNull();
  });
});

describe("fotoYaGuardada: la pestaña murió justo al guardar", () => {
  it("si la compra de la foto ya está entre las guardadas, no se recupera (su plata se restaría dos veces en pantalla)", () => {
    expect(fotoYaGuardada(foto(), new Set(["compra-1"]))).toBe(true);
  });

  it("si no está, es una compra a medias de verdad", () => {
    expect(fotoYaGuardada(foto(), new Set(["otra"]))).toBe(false);
    expect(fotoYaGuardada(foto(), new Set())).toBe(false);
  });

  it("basura no es una compra guardada", () => {
    expect(fotoYaGuardada(null, new Set(["compra-1"]))).toBe(false);
    expect(fotoYaGuardada({ id: "compra-1" }, new Set(["compra-1"]))).toBe(false);
  });
});

describe("detalleDeRecuperada: lo que dice el aviso", () => {
  const de = (extra: Partial<FotoDeCompra>) => detalleDeRecuperada(compraRecuperada(foto(extra), hoy)!, "Textiles Gamarra");

  it("a quién y cuántas prendas (unidades)", () => {
    expect(de({})).toBe("Textiles Gamarra · 2 prendas.");
    expect(de({ lineas: [linea("a", 1)] })).toBe("Textiles Gamarra · 1 prenda.");
  });

  it("si ya había tomado la foto del papel, dice que la tome otra vez", () => {
    expect(de({ paso: "papel", teniaFoto: true })).toBe("Textiles Gamarra · 2 prendas. Toma otra vez la foto del papel.");
  });

  it("si se perdió una prenda, lo dice", () => {
    expect(de({ lineas: [linea("a", 2), linea("b", 1, { destinoId: "cerrada" })] })).toBe("Textiles Gamarra · 2 prendas. 1 prenda no se pudo recuperar: revísala.");
    expect(de({ lineas: [linea("a", 2), linea("b", 3, { destinoId: "cerrada" })] })).toContain("3 prendas no se pudieron recuperar: revísalas");
  });
});

describe("claveDeCompraEnCurso: de quién es la foto", () => {
  it("una llave por persona; una terminal, por su sede", () => {
    expect(claveDeCompraEnCurso("persona-1", "tru")).toBe("cayla:mis-compras:persona-1:en-curso");
    expect(claveDeCompraEnCurso(null, "tru")).toBe("cayla:mis-compras:terminal:tru:en-curso");
    expect(claveDeCompraEnCurso("persona-1", "tru")).not.toBe(claveDeCompraEnCurso("persona-2", "tru"));
  });
});
