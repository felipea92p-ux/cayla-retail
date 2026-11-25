import { describe, expect, it } from "vitest";
import type { PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { armarModelos } from "./analisis-modelo";
import { fichaDePedir, precioDeLaFicha, textoCasillaDosPisos, textoCeldaQueda } from "./analisis-ficha-pedir";

// Datos inventados (el repo es público): modelos, colores, tiendas y cifras de mentira.
let n = 0;
function prenda(p: Partial<PrendaAnalisis> = {}): PrendaAnalisis {
  n += 1;
  return {
    varianteId: `v${n}`,
    productoId: `p${n}`,
    nombre: `Modelo ${n}`,
    color: "Azul",
    colorHex: null,
    talla: "Estándar",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: "indumentaria",
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: null,
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: "2026-10-01",
    ultimaVenta: "2026-11-20",
    llego: "2026-10-01",
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    diasDeVentas: 30,
    ...p,
  };
}

const HOY = "2026-11-24";
const MIA: SedeAnalisis = { id: "mia", codigo: "UNO", nombre: "Tienda Uno", ciudad: "Ciudad Uno" };
const OTRA: SedeAnalisis = { id: "otra", codigo: "DOS", nombre: "Tienda Dos", ciudad: "Ciudad Dos" };
const ctx = (pedir = true) => ({ hoy: HOY, diasDeVentas: 30, sedes: [MIA, OTRA], miSede: MIA, acceso: { pedir } });

const tallas = [
  // Agotado: dos colores vendidos en 8 semanas, nada aquí; la otra tienda tiene 1 de Arena.
  prenda({ productoId: "ag", nombre: "Top Prueba", color: "Arena", precio: 45.9, semanas: [0, 0, 2, 3, 0, 0, 0, 0], vendidas30: 2, salioAlPiso: "2026-10-15", otras: [{ sedeId: "otra", stock: 1, vendidas30: 0 }] }),
  prenda({ productoId: "ag", nombre: "Top Prueba", color: "Chocolate", precio: 45.9, semanas: [0, 0, 1, 2, 1, 0, 0, 0], vendidas30: 3, salioAlPiso: "2026-10-15" }),
  prenda({ productoId: "ag", nombre: "Top Prueba", color: "Perla", precio: 45.9, semanas: [0, 0, 0, 0, 0, 0, 0, 0], vendidas30: 0, salioAlPiso: "2026-10-15", ultimaVenta: null }),
  // Se acaba: S agotada (se vendía), M con 4; la otra tienda tiene la S.
  prenda({ productoId: "sa", nombre: "Polo Prueba", color: "Negro", talla: "S", precio: 28, piso: 0, vendidas30: 6, semanas: [0, 0, 0, 0, 0, 0, 2, 4], otras: [{ sedeId: "otra", stock: 1, vendidas30: 0 }] }),
  prenda({ productoId: "sa", nombre: "Polo Prueba", color: "Negro", talla: "M", precio: 28, piso: 2, almacen: 2, vendidas30: 6, semanas: [0, 0, 0, 0, 0, 0, 2, 4] }),
  prenda({ productoId: "sa", nombre: "Polo Prueba", color: "Blanco", talla: "M", precio: 30, piso: 1, vendidas30: 0 }),
  // Va bien: le alcanza más allá de Navidad.
  prenda({ productoId: "vb", nombre: "Falda Prueba", piso: 40, vendidas30: 3, semanas: [0, 0, 0, 0, 1, 1, 0, 1] }),
  // No se vende.
  prenda({ productoId: "nv", nombre: "Body Prueba", piso: 5, vendidas30: 0 }),
  // Agotado con tallas: Blanco S y M vendidos, Vino solo S; la L nunca se vendió. La otra tienda tiene Blanco M y Celeste S (que aquí no se vendió).
  prenda({ productoId: "cp", nombre: "Capa Prueba", color: "Blanco", talla: "S", semanas: [0, 0, 1, 0, 0, 0, 0, 0] }),
  prenda({ productoId: "cp", nombre: "Capa Prueba", color: "Blanco", talla: "M", semanas: [0, 0, 2, 0, 0, 0, 0, 0], otras: [{ sedeId: "otra", stock: 1, vendidas30: 0 }] }),
  prenda({ productoId: "cp", nombre: "Capa Prueba", color: "Blanco", talla: "L" }),
  prenda({ productoId: "cp", nombre: "Capa Prueba", color: "Vino", talla: "S", semanas: [0, 0, 0, 2, 0, 0, 0, 0] }),
  prenda({ productoId: "cp", nombre: "Capa Prueba", color: "Vino", talla: "M" }),
  prenda({ productoId: "cp", nombre: "Capa Prueba", color: "Celeste", talla: "S", otras: [{ sedeId: "otra", stock: 2, vendidas30: 0 }] }),
];
const modelos = armarModelos(tallas, HOY);
const de = (nombre: string) => modelos.find((m) => m.nombre === nombre)!;

describe("ficha de «Qué pedir» (Felipe 2026-11-24): cuenta lo mismo que su tarjeta", () => {
  it("lo agotado: cuándo se agotó, lo vendido en 8 semanas, nada aquí y qué colores tiene la otra tienda", () => {
    const f = fichaDePedir(de("Top Prueba"), ctx())!;
    expect(f.tipo).toBe("agotado");
    expect(f.veredicto).toEqual({ est: "urg", texto: "Se agotó el 20 nov." });
    expect(f.cifras).toEqual([
      { etiqueta: "Vendiste", valor: "9", detalle: "en 37 días" },
      { etiqueta: "Tienes", valor: "0", detalle: "en Ciudad Uno" },
      { etiqueta: "Ciudad Dos tiene", valor: "1", detalle: "Arena" },
    ]);
    expect(f.pedirA?.id).toBe("otra");
  });

  it("lo agotado de una sola talla: una casilla por color (te quedan 0, vendiste) sin columnas de talla; lo de la otra tienda, aparte", () => {
    const t = fichaDePedir(de("Top Prueba"), ctx())!.tabla;
    expect(t.tipo).toBe("dosPisos");
    if (t.tipo !== "dosPisos") return;
    expect(t.titulo).toBe("Por color");
    expect(t.tallas).toEqual([]);
    // Del que más se vendió al que menos; Perla no se vendió en 8 semanas y no tiene fila.
    expect(t.filas.map((f) => [f.color, f.total.quedan, f.total.vendidas, f.casillas.length])).toEqual([
      ["Arena", 0, 5, 0],
      ["Chocolate", 0, 4, 0],
    ]);
    expect(t.otra).toEqual({ ciudad: "Ciudad Dos", total: 1, piezas: [{ color: "Arena", punto: null, talla: null, cantidad: 1 }] });
  });

  it("lo agotado por talla y color (la «B2», Felipe 2026-11-25): arriba te quedan, abajo vendiste; sin la talla que nunca se vendió", () => {
    const t = fichaDePedir(de("Capa Prueba"), ctx())!.tabla;
    expect(t.tipo).toBe("dosPisos");
    if (t.tipo !== "dosPisos") return;
    expect(t.titulo).toBe("Por talla y color");
    expect(t.nota).toBe("en Ciudad Uno");
    expect(t.tallas).toEqual(["S", "M"]);
    expect(t.filas.map((f) => [f.color, f.casillas.map((c) => `${c.quedan}/${c.vendidas}`), `${f.total.quedan}/${f.total.vendidas}`])).toEqual([
      ["Blanco", ["0/1", "0/2"], "0/3"],
      ["Vino", ["0/2", "0/0"], "0/2"],
    ]);
    // Celeste no se vendió aquí: no tiene fila, pero la otra tienda la tiene y sale en su bloque, después de los colores que más vendiste.
    expect(t.otra?.piezas.map((p) => `${p.color} ${p.talla} ${p.cantidad}`)).toEqual(["Blanco M 1", "Celeste S 2"]);
    expect(t.otra?.total).toBe(3);
    expect(textoCasillaDosPisos("Blanco", "M", t.filas[0]!.casillas[1]!)).toBe("Blanco M: te quedan 0, vendiste 2");
    expect(textoCasillaDosPisos("Vino", null, { quedan: 1, vendidas: 2 })).toBe("Vino: te queda 1, vendiste 2");
  });

  it("lo agotado que nadie más tiene: sin bloque de la otra tienda", () => {
    const sola = armarModelos([prenda({ productoId: "sl", nombre: "Falda Sola", talla: "S", semanas: [0, 0, 0, 0, 0, 3, 0, 0], vendidas30: 3 })], HOY)[0]!;
    const t = fichaDePedir(sola, ctx())!.tabla;
    expect(t.tipo === "dosPisos" && t.otra).toBeNull();
  });

  it("lo que se acaba: hasta cuándo, cuánto tienes y vendes, y cuántos de los que te faltan tiene la otra tienda", () => {
    const f = fichaDePedir(de("Polo Prueba"), ctx())!;
    expect(f.tipo).toBe("seAcaba");
    expect(f.veredicto.texto).toMatch(/^Se acaba el \d+ (nov|dic)\.$/);
    expect(f.cifras[0]).toEqual({ etiqueta: "Tienes", valor: "5", detalle: "3 en el piso" });
    expect(f.cifras[1]).toMatchObject({ etiqueta: "Vendes", detalle: "por semana" });
    expect(f.cifras[2]).toEqual({ etiqueta: "Ciudad Dos tiene", valor: "1", detalle: "y el que te falta" });
  });

  it("te quedan por talla y color: el número que queda, 0 donde se vendió y ya no hay, «nunca» donde no hubo", () => {
    const t = fichaDePedir(de("Polo Prueba"), ctx())!.tabla;
    expect(t.tipo).toBe("quedan");
    if (t.tipo !== "quedan") return;
    expect(t.tallas).toEqual(["S", "M"]);
    expect(t.encabezados).toEqual(["S", "M"]);
    expect(t.titulo).toBe("Te quedan por talla y color");
    expect(t.filas.map((f) => [f.color, f.vendio, f.celdas.map((c) => `${c.estado}:${c.quedan}`)])).toEqual([
      ["Negro", 12, ["agotada:0", "queda:4"]],
      ["Blanco", 0, ["nunca:0", "queda:1"]],
    ]);
    expect(textoCeldaQueda("Negro", t.filas[0]!.celdas[0]!)).toBe("Negro S: se vendió y ya no hay");
    expect(textoCeldaQueda("Blanco", t.filas[1]!.celdas[1]!)).toBe("Blanco M: queda 1");
    expect(textoCeldaQueda("Blanco", t.filas[1]!.celdas[0]!)).toBe("Blanco S: nunca hubo");
  });

  it("con una sola talla, la columna se llama «Te quedan» (la talla única no dice nada)", () => {
    const unica = armarModelos(
      [
        prenda({ productoId: "un", nombre: "Blusa Prueba", color: "Negro", piso: 2, vendidas30: 9, semanas: [0, 0, 0, 0, 0, 0, 4, 5] }),
        prenda({ productoId: "un", nombre: "Blusa Prueba", color: "Rojo", piso: 0, vendidas30: 4, semanas: [0, 0, 0, 0, 0, 0, 2, 2] }),
      ],
      HOY,
    )[0]!;
    const t = fichaDePedir(unica, ctx())!.tabla;
    expect(t.tipo).toBe("quedan");
    if (t.tipo !== "quedan") return;
    expect(t.titulo).toBe("Te quedan por color");
    expect(t.encabezados).toEqual(["Te quedan"]);
    expect(t.filas.map((f) => [f.color, f.celdas[0]!.quedan, f.celdas[0]!.estado])).toEqual([
      ["Negro", 2, "queda"],
      ["Rojo", 0, "agotada"],
    ]);
  });

  it("lo que no está en «Qué pedir» (le alcanza hasta Navidad o no se vende) sigue con su ficha de siempre", () => {
    expect(fichaDePedir(de("Falda Prueba"), ctx())).toBeNull();
    expect(fichaDePedir(de("Body Prueba"), ctx())).toBeNull();
  });

  it("sin permiso para pedir, no hay «Pedir a …»; sin otra tienda, «nadie más la tiene»", () => {
    expect(fichaDePedir(de("Top Prueba"), ctx(false))!.pedirA).toBeNull();
    const sinOtra = armarModelos([prenda({ productoId: "so", nombre: "Short Prueba", semanas: [0, 0, 0, 0, 0, 3, 0, 0], vendidas30: 3 })], HOY)[0]!;
    expect(fichaDePedir(sinOtra, ctx())!.cifras[2]).toEqual({ etiqueta: "Otras tiendas", valor: "0", detalle: "nadie más la tiene" });
  });

  it("lo que viene en camino va antes que la otra tienda", () => {
    const conLlegada = { ...de("Top Prueba"), llega: [{ de: "compra" as const, cantidad: 6, fecha: "2026-12-02" }] };
    expect(fichaDePedir(conLlegada, ctx())!.cifras[2]).toMatchObject({ etiqueta: "Llegan", valor: "6" });
  });

  it("el precio: el de todas sus tallas, o «desde» el menor si varían", () => {
    expect(precioDeLaFicha(de("Top Prueba"))).toBe("S/ 45.90");
    expect(precioDeLaFicha(de("Polo Prueba"))).toBe("desde S/ 28");
  });
});
