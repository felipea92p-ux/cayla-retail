import { describe, expect, it } from "vitest";
import type { AccesoAnalisis, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { diasQueQuedan, grupoDe } from "./analisis-reglas";
import { hrefComprar, hrefLiquidar } from "./analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  chipDeGrupo,
  dineroDe,
  fraseDelModelo,
  lineaOtrasTiendas,
  type Hecho,
  hechosDe,
  iniciosDeSemana,
  SEMANAS_FICHA,
  sedeParaPedir,
  solesFicha,
  subtituloFicha,
  tablaDelModelo,
} from "./analisis-ficha";
import { llegaTarde, textoLlegaTarde } from "./analisis-acaba";
import { modeloDe } from "./analisis-modelo";
import { pedidoPorTipo } from "./analisis-pedido-en-camino-reglas";

/** El día de las pruebas (7 de octubre de 2026). */
const HOY = "2026-10-07";

// Datos inventados para la prueba (no son de producción): una red de tres tiendas y prendas de un modelo de ensayo.
const SEDES: SedeAnalisis[] = [
  { id: "s1", codigo: "TRU", nombre: "Tienda TRU", ciudad: "Trujillo" },
  { id: "s2", codigo: "AQP", nombre: "Tienda AQP", ciudad: "Arequipa" },
  { id: "s3", codigo: "LIM", nombre: "Tienda LIM", ciudad: "Lima" },
];

const TODO: AccesoAnalisis = {
  existencias: true,
  traslados: true,
  pedir: true,
  ordenes: true,
  compras: true,
  produccion: true,
  etiquetas: true,
  movimientos: true,
  regularizar: true,
  cuadrar: true,
  conteo: true,
  frescura: true,
  planCompra: true,
  catalogo: true,
};

// A dónde llega la orden de «Comprar» (la tienda que se analiza) y a quién se le pide cada modelo (sin los proveedores leídos: el de la última compra).
const DONDE = { destinoId: "s1", proveedores: null };

function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Blusa Ensayo",
    color: "Celeste",
    colorHex: null,
    talla: "S",
    categoria: "Blusas",
    categoriaPrefijo: "BLU",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 60,
    costo: 27,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [
      { sedeId: "s2", stock: 0, vendidas30: 0 },
      { sedeId: "s3", stock: 0, vendidas30: 0 },
    ],
    llega: [],
    // La vara de su tipo (inventada): se vigila desde 30 días y se liquida desde 60; sin ella no hay un número de respaldo (B1).
    umbrales: { vigila: 30, liquidar: 60, vara: "hoy", vendidas: 20 },
    ...parcial,
  };
}

/** Lo que se lee de una tarjetita: «valor · etiqueta · …las líneas de más». */
const textoDe = (h: Hecho) => [h.valor, h.etiqueta, ...(h.mas ?? [])].filter(Boolean).join(" · ");
const leer = (p: PrendaAnalisis) => hechosDe(p, grupoDe(p), SEDES, HOY).map(textoDe);

describe("el chip de la prenda (el título de su grupo)", () => {
  it("cada grupo con su estado; sin grupo, «Va bien»", () => {
    expect(chipDeGrupo("comprar")).toEqual({ est: "urg", texto: "Cómpralas" });
    expect(chipDeGrupo("enviar")).toEqual({ est: "ate", texto: "Mándalas a donde sí se venden" });
    expect(chipDeGrupo("liquidar")).toEqual({ est: "ate", texto: "Liquidar" });
    expect(chipDeGrupo("vigila")).toEqual({ est: "nd", texto: "Vigílalas" });
    expect(chipDeGrupo("duda")).toEqual({ est: "nd", texto: "Aún no se sabe" });
    expect(chipDeGrupo(null)).toEqual({ est: "bien", texto: "Va bien" });
    // Guardada y nunca colgada: no «va bien», nadie la vio (20261007120000). Un grupo manda sobre eso.
    expect(chipDeGrupo(null, true)).toEqual({ est: "ate", texto: "Nunca salió al piso" });
    expect(chipDeGrupo("comprar", true)).toEqual({ est: "urg", texto: "Cómpralas" });
  });

  it("un modelo que se acaba pero YA viene en camino a tiempo no es un «Cómpralas» en rojo: dice «Ya viene», como el carril", () => {
    expect(chipDeGrupo("comprar", false, true)).toEqual({ est: "bien", texto: "Ya viene" });
    // Solo cambia el grupo «comprar»: lo demás sigue diciendo lo suyo.
    expect(chipDeGrupo("enviar", false, true)).toEqual({ est: "ate", texto: "Mándalas a donde sí se venden" });
    expect(chipDeGrupo(null, false, true)).toEqual({ est: "bien", texto: "Va bien" });
  });
});

describe("una sola venta no grita en rojo (D6, 2026-10-16)", () => {
  it("el chip sigue siendo «Cómpralas» pero en ámbar; «Ya viene» manda sobre eso, y lo demás no cambia", () => {
    expect(chipDeGrupo("comprar", false, false, true)).toEqual({ est: "ate", texto: "Cómpralas" });
    expect(chipDeGrupo("comprar", false, true, true)).toEqual({ est: "bien", texto: "Ya viene" });
    // Con más de una venta sigue siendo el rojo de siempre; la bandera solo afecta a «comprar».
    expect(chipDeGrupo("comprar", false, false, false)).toEqual({ est: "urg", texto: "Cómpralas" });
    expect(chipDeGrupo("enviar", false, false, true)).toEqual({ est: "ate", texto: "Mándalas a donde sí se venden" });
    expect(chipDeGrupo(null, false, false, true)).toEqual({ est: "bien", texto: "Va bien" });
  });
  it("el «Ya no hay» de una sola venta va en ámbar; el de varias ventas, en rojo como siempre", () => {
    expect(hechosDe(prenda({ vendidas30: 1, diasDeVentas: 9 }), "comprar", SEDES, HOY)[0]).toMatchObject({ icono: "agotado", tono: "ambar" });
    expect(hechosDe(prenda({ vendidas30: 2, diasDeVentas: 9 }), "comprar", SEDES, HOY)[0]).toMatchObject({ icono: "agotado", tono: "rojo" });
  });
});

describe("el ritmo con su base en la ficha (A5) y lo que cuesta esperar (A15)", () => {
  it("con stock: UNA tarjeta con la cifra y su rango («Te dura ~14 días · entre 5 y 53 días»), no dos números para lo mismo", () => {
    // 2 ventas en 7 días con 4 en stock: la barra dice 14 días, pero cabe entre 5 y 53 (segundo pase visual, 2026-10-17: antes eran «Quedan 14 días» y «Puede acabarse en 5 días»).
    const p = prenda({ piso: 4, vendidas30: 2, diasDeVentas: 7 });
    expect(leer(p)).toEqual(["Te dura ~14 días · entre 5 y 53 días · tienes 4", "Vendiste 2 · en 7 días", "Proveedor taller"]);
    const tarjeta = hechosDe(p, "comprar", SEDES, HOY)[0]!;
    expect(tarjeta).toMatchObject({ icono: "reloj", tono: "pizarra" });
    // Es una tarjeta de la cuadrícula (no una franja de ancho completo): con ella la primera fila queda en 3.
    expect(tarjeta.ancho).toBeUndefined();
    expect(JSON.stringify(hechosDe(p, "comprar", SEDES, HOY))).not.toMatch(/Quedan 14|Puede acabarse/);
    // Sin «Poisson» ni «80 %» a la vista: ley 4 de /formidable.
    expect(JSON.stringify(hechosDe(p, "comprar", SEDES, HOY))).not.toMatch(/poisson|80 ?%|intervalo|confianza/i);
  });
  it("una sola venta: el rango entero de la tarjeta lo dice (el chip «Una sola venta» de arriba lo nombra)", () => {
    const p = prenda({ piso: 1, vendidas30: 1, diasDeVentas: 9 });
    expect(leer(p)).toEqual(["Te dura ~9 días · entre 2 y 85 días · tienes 1", "Vendiste 1 · en 9 días", "Proveedor taller"]);
  });
  it("ya no hay: cuándo fue la última venta y, de bajada de «Ya no hay», cuánto dejas de ganar al día; sin chip ni tono rojo", () => {
    // 1 venta en 9 días a S/ 60 con costo S/ 27: (60 / 1,18 − 27) = S/ 23,85 ÷ 9 = S/ 2,65 por día (~S/ 3). Fue hace 3 días (HOY = 7 de octubre).
    const p = prenda({ vendidas30: 1, diasDeVentas: 9, ultimaVenta: "2026-10-04" });
    expect(leer(p)).toEqual(["Ya no hay · dejas de ganar ~S/\u00a03 al día", "Vendiste 1 · en 9 días", "Hace 3 días · fue tu última venta", "Proveedor taller"]);
    const hechos = hechosDe(p, "comprar", SEDES, HOY);
    expect(hechos.some((h) => h.tono === "rojo")).toBe(false);
    expect(hechos[0]).toMatchObject({ icono: "agotado", tono: "ambar" });
    // Ya no es una tarjeta aparte: con ella la cuadrícula de 4 quedaba en 5 y «TRU tiene 5» caía sola a otra fila, y «~S/ 17 por día» se partía en dos líneas.
    expect(hechos.some((h) => h.icono === "etiqueta")).toBe(false);
    expect(JSON.stringify(hechos)).not.toContain("por día");
  });
  it("la cuadrícula de cifras de lo agotado no pasa de 4 tarjetas (así «TRU tiene 5» no queda sola en otra fila)", () => {
    const p = prenda({ vendidas30: 6, diasDeVentas: 23, ultimaVenta: "2026-10-04", otras: [{ sedeId: "s1", stock: 5, vendidas30: 0 }] });
    const cifras = hechosDe(p, "comprar", SEDES, HOY).filter((h) => h.ancho !== "completo");
    expect(cifras.map((h) => h.valor)).toEqual(["Ya no hay", "Vendiste 6", "Hace 3 días", "TRU tiene 5"]);
  });
  it("«hoy» y «ayer» se dicen como se dicen en tienda", () => {
    expect(leer(prenda({ vendidas30: 3, diasDeVentas: 9, ultimaVenta: HOY }))[2]).toBe("Hoy · fue tu última venta");
    expect(leer(prenda({ vendidas30: 3, diasDeVentas: 9, ultimaVenta: "2026-10-06" }))[2]).toBe("Ayer · fue tu última venta");
  });
  it("sin costo, sin precio o sin la última venta, no inventa la cifra: solo dice lo que sabe", () => {
    expect(leer(prenda({ vendidas30: 4, diasDeVentas: 9, costo: null, ultimaVenta: "2026-10-04" }))).toEqual([
      "Ya no hay · en tu tienda",
      "Vendiste 4 · en 9 días",
      "Hace 3 días · fue tu última venta",
      "Proveedor taller",
    ]);
    expect(leer(prenda({ vendidas30: 4, diasDeVentas: 9, precio: null })).some((t) => t.includes("dejas de ganar"))).toBe(false);
    expect(leer(prenda({ vendidas30: 4, diasDeVentas: 9 })).some((t) => t.includes("última venta"))).toBe(false);
    // Ganancia cero o negativa: no hay nada que se esté dejando de ganar.
    expect(leer(prenda({ vendidas30: 4, diasDeVentas: 9, precio: 20, costo: 27 })).some((t) => t.includes("dejas de ganar"))).toBe(false);
  });
  it("lo que se acaba pero tiene stock NO dice «dejas de ganar» (todavía lo estás vendiendo)", () => {
    expect(leer(prenda({ piso: 2, vendidas30: 6, diasDeVentas: 12 })).some((t) => t.includes("dejas de ganar"))).toBe(false);
  });
});

describe("el dinero, como se lee en tienda", () => {
  it("entero sin decimales; con céntimos, dos; sin dato, «—»", () => {
    expect(solesFicha(60)).toBe("S/\u00a060");
    expect(solesFicha(59.9)).toBe("S/\u00a059.90");
    expect(solesFicha(1250)).toBe("S/\u00a01,250");
    expect(solesFicha(0)).toBe("S/\u00a00");
    expect(solesFicha(null)).toBe("—");
    expect(solesFicha(Number.NaN)).toBe("—");
    expect(solesFicha(-5)).toBe("−S/\u00a05");
  });
  it("lo que se gana por cada una es precio menos costo, sin arrastrar el error de los decimales", () => {
    expect(dineroDe({ precio: 60, costo: 27 })).toEqual({ costo: "S/\u00a027", ganas: "S/\u00a033" });
    expect(dineroDe({ precio: 79.9, costo: 32.92 })).toEqual({ costo: "S/\u00a032.92", ganas: "S/\u00a046.98" });
  });
  it("si falta el precio o el costo, «—» (nunca una ganancia inventada)", () => {
    expect(dineroDe({ precio: 60, costo: null })).toEqual({ costo: "—", ganas: "—" });
    expect(dineroDe({ precio: null, costo: 27 })).toEqual({ costo: "S/\u00a027", ganas: "—" });
  });
  it("la línea bajo el nombre: color, talla y precio", () => {
    expect(subtituloFicha({ color: "Celeste", talla: "S", precio: 60 })).toBe("Celeste · talla S · S/\u00a060");
    expect(subtituloFicha({ color: "Negro", talla: "Estándar", precio: 59.9 })).toBe("Negro · talla Estándar · S/\u00a059.90");
    expect(subtituloFicha({ color: "Celeste", talla: "S", precio: null })).toBe("Celeste · talla S");
  });
});

describe("las tarjetitas de la ficha (como `hechos()` de la maqueta)", () => {
  it("se acaba y ya no hay: rojo, lo vendido, de dónde se repone y qué otra tienda la tiene", () => {
    const p = prenda({ vendidas30: 6, otras: [{ sedeId: "s2", stock: 3, vendidas30: 0 }, { sedeId: "s3", stock: 0, vendidas30: 0 }] });
    // A15: lo agotado también dice lo que cuesta esperar (6 en 30 días × S/ 23,85 sin IGV = S/ 4,77 por día, ~S/ 5).
    expect(leer(p)).toEqual(["Ya no hay · dejas de ganar ~S/\u00a05 al día", "Vendiste 6 · en 30 días", "Proveedor taller", "AQP tiene 3 · se podría pedir"]);
    const [agotada] = hechosDe(p, "comprar", SEDES, HOY);
    expect(agotada).toMatchObject({ icono: "agotado", tono: "rojo" });
  });

  it("se acaba con días: ámbar hasta una semana, pizarra después; «Queda 1 día» en singular", () => {
    const seis = prenda({ piso: 1, vendidas30: 5 });
    expect(leer(seis)[0]).toMatch(/^Te dura ~6 días · entre \d+ y \d+ días · tienes 1$/);
    expect(hechosDe(seis, "comprar", SEDES, HOY)[0]).toMatchObject({ icono: "reloj", tono: "ambar" });
    const diez = prenda({ piso: 2, almacen: 1, vendidas30: 9 });
    expect(leer(diez)[0]).toMatch(/^Te dura ~10 días · entre \d+ y \d+ días · tienes 3$/);
    expect(hechosDe(diez, "comprar", SEDES, HOY)[0]).toMatchObject({ tono: "pizarra" });
    // Si el rango no se separa de la cifra, no lo repite.
    expect(leer(prenda({ piso: 1, vendidas30: 30 }))[0]).toBe("Te dura ~1 día · tienes 1");
  });

  it("lo que viene en camino y el proveedor de terceros; sin origen conocido, no dice proveedor", () => {
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-10-15" },
      { de: "almacen" as const, cantidad: 2, fecha: "2026-10-08" },
      { de: "taller" as const, cantidad: 1, fecha: null },
    ];
    const p = prenda({ vendidas30: 5, origen: "terceros", llega });
    // Cada parte, de la que llega antes a la que llega después, con su fecha («pediste 10», no «compra 10»: se leía como una orden).
    // Una parte sin fecha: no se sabe cuándo llega lo primero y no se acusa de tarde (no se afirma lo que no se sabe).
    expect(leer(p)).toEqual([
      "Ya no hay · dejas de ganar ~S/\u00a04 al día",
      "Vendiste 5 · en 30 días",
      "Proveedor terceros",
      "Por llegar 13 · del almacén 2 · llega el 8 oct. · pediste 10 · llega el 15 oct. · del taller 1 · sin fecha",
    ]);
    expect(hechosDe(p, "comprar", SEDES, HOY)[2]).toMatchObject({ icono: "caja", tono: "taupe", ancho: "completo" });
    // Sin origen y sin costo no hay proveedor ni cifra de dinero que decir.
    expect(leer(prenda({ vendidas30: 5, origen: null, costo: null }))).toEqual(["Ya no hay · en tu tienda", "Vendiste 5 · en 30 días"]);
  });

  it("A quién se pide (A8): la tarjetita dice el proveedor por su nombre y de dónde se sabe; sin él, lo de siempre", () => {
    // Sin costo: esta prueba es del proveedor, no de lo que cuesta esperar (A15, que sale solo con precio y costo).
    const p = prenda({ vendidas30: 5, origen: null, costo: null });
    const con = (proveedor: Parameters<typeof hechosDe>[5]) =>
      hechosDe(p, "comprar", SEDES, HOY, null, proveedor).map((h) => [h.icono, h.tono, h.valor, h.etiqueta]);
    // Del catálogo: se dice que lo es (no es el de una compra que ya pasó).
    // Nunca «pídelo aquí»: no es un enlace y invitaba a tocar (segundo pase visual, 2026-10-17).
    expect(con({ fuente: "catalogo", id: "a", nombre: "Textil Andino" })[2]).toEqual(["caja", "taupe", "Textil Andino", "anotado en su ficha"]);
    expect(con({ fuente: "compra", id: "a", nombre: "Hilos del Sur" })[2]).toEqual(["caja", "taupe", "Hilos del Sur", "le compraste la última vez"]);
    expect(con({ fuente: "taller" })[2]).toEqual(["tijera", "taupe", "Taller de CAYLA", null]);
    expect(JSON.stringify([con({ fuente: "catalogo", id: "a", nombre: "X" }), con({ fuente: "taller" })])).not.toContain("pídelo aquí");
    // Se leyó y no tiene a quién: se dice, sin inventar uno.
    expect(con({ fuente: "ninguno" })[2]).toEqual(["caja", "taupe", "Sin proveedor", "falta elegirlo en el catálogo"]);
    // Si algo YA viene en camino a tiempo, la franja no dice «pídelo aquí» (empujaba a pedirlo dos veces): queda el nombre y de dónde se sabe.
    const viene = prenda({ vendidas30: 5, origen: null, costo: null, llega: [{ de: "compra", cantidad: 6, fecha: "2026-10-12" }] });
    const conViene = (proveedor: Parameters<typeof hechosDe>[5]) =>
      hechosDe(viene, "comprar", SEDES, HOY, null, proveedor).map((h) => [h.icono, h.tono, h.valor, h.etiqueta]);
    expect(conViene({ fuente: "catalogo", id: "a", nombre: "Textil Andino" })[2]).toEqual(["caja", "taupe", "Textil Andino", "anotado en su ficha"]);
    expect(conViene({ fuente: "compra", id: "a", nombre: "Hilos del Sur" })[2]).toEqual(["caja", "taupe", "Hilos del Sur", "le compraste la última vez"]);
    expect(conViene({ fuente: "taller" })[2]).toEqual(["tijera", "taupe", "Taller de CAYLA", null]);
    // Una llegada ATRASADA no cuenta como que viene: la franja queda igual (nombre y de dónde se sabe).
    const atrasada = prenda({ vendidas30: 5, origen: null, costo: null, llega: [{ de: "compra", cantidad: 6, fecha: "2026-09-20" }] });
    expect(hechosDe(atrasada, "comprar", SEDES, HOY, null, { fuente: "catalogo", id: "a", nombre: "Textil Andino" })[2]).toMatchObject({ etiqueta: "anotado en su ficha" });
    // Un proveedor archivado no se recomienda: «Sin proveedor», con cuál es y qué hacer (también si el modelo tiene origen conocido).
    expect(con({ fuente: "archivado", id: "v", nombre: "Tejidos Wari" })[2]).toEqual(["caja", "taupe", "Sin proveedor", "Tejidos Wari está archivado: elige otro"]);
    const deCompra = prenda({ vendidas30: 5, origen: "terceros", costo: null });
    expect(hechosDe(deCompra, "comprar", SEDES, HOY, null, { fuente: "archivado", id: "v", nombre: "Tejidos Wari" })[2]).toMatchObject({ valor: "Sin proveedor" });
    // El proveedor va en una FRANJA de ancho completo, no en la cuadrícula de cifras (un nombre largo se partía a media palabra).
    for (const q of [{ fuente: "catalogo", id: "a", nombre: "Textil Andino" }, { fuente: "taller" }, { fuente: "ninguno" }, { fuente: "archivado", id: "v", nombre: "X" }] as const)
      expect(hechosDe(p, "comprar", SEDES, HOY, null, q)[2]).toMatchObject({ ancho: "completo" });
    expect(hechosDe(p, "comprar", SEDES, HOY, null, { fuente: "catalogo", id: "a", nombre: "Textil Andino" })[0]!.ancho).toBeUndefined();
    // Sin leer los proveedores (null) o sin pasarlos: nada de «Sin proveedor» por un error, y sin origen no se dice nada.
    expect(con(null)).toHaveLength(2);
    expect(hechosDe(p, "comprar", SEDES, HOY)).toHaveLength(2);
    // Con origen conocido pero sin poder nombrarlo («ninguno»), queda la etiqueta de siempre.
    const deTerceros = prenda({ vendidas30: 5, origen: "terceros", costo: null });
    expect(hechosDe(deTerceros, "comprar", SEDES, HOY, null, { fuente: "ninguno" })[2]).toMatchObject({ valor: "Proveedor terceros" });
    // Solo es de «Cómpralas»: lo quieto no pide proveedor.
    const quieta = prenda({ piso: 3, diasSinVender: 70, otras: [] });
    expect(hechosDe(quieta, "liquidar", SEDES, HOY, null, { fuente: "catalogo", id: "a", nombre: "Textil Andino" }).some((h) => h.valor === "Textil Andino")).toBe(false);
  });

  it("lo que viene y lo atrasado van en UNA franja (no dos tarjetas, la segunda sola en otra fila): sigue por comprar (A3)", () => {
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-10-15" },
      { de: "taller" as const, cantidad: 8, fecha: "2026-09-20" },
    ];
    const p = prenda({ vendidas30: 5, origen: "terceros", llega });
    expect(leer(p)).toEqual([
      "Ya no hay · dejas de ganar ~S/\u00a04 al día",
      "Vendiste 5 · en 30 días",
      "Proveedor terceros",
      "Por llegar 10 · pediste 10 · llega el 15 oct. · Llega tarde · te quedas unos 8 días sin stock · 8 atrasadas hace 17 días",
    ]);
    const franja = hechosDe(p, "comprar", SEDES, HOY).at(-1)!;
    // Ámbar: lo atrasado pide atención, y no se esconde en una tarjeta verde.
    expect(franja).toMatchObject({ icono: "llega", tono: "ambar", ancho: "completo" });
    expect(hechosDe(p, "comprar", SEDES, HOY).filter((h) => h.valor.startsWith("Atrasada"))).toEqual([]);
    // Solo atrasada: no hay «Por llegar» verde que prometa nada, y se dice qué debía llegar y cuándo.
    const sola = prenda({ vendidas30: 5, origen: null, costo: null, llega: [llega[1]!] });
    expect(leer(sola)).toEqual(["Ya no hay · en tu tienda", "Vendiste 5 · en 30 días", "Atrasada 17 días · 8 sin llegar · del taller 8 · debía llegar el 20 set."]);
    expect(hechosDe(sola, "comprar", SEDES, HOY).at(-1)).toMatchObject({ icono: "llega", tono: "ambar", ancho: "completo" });
  });

  it("cada parte dice su fecha o que no la tiene, y lo de hoy dice «llega hoy»", () => {
    const p = prenda({
      vendidas30: 5,
      llega: [
        { de: "compra", cantidad: 6, fecha: null },
        { de: "tienda", cantidad: 2, fecha: HOY },
        { de: "compra", cantidad: 12, fecha: "2026-10-20" },
      ],
    });
    expect(leer(p).at(-1)).toBe("Por llegar 20 · de otra tienda 2 · llega hoy · pediste 12 · llega el 20 oct. · pediste 6 · sin fecha");
  });

  it("con la meta (Navidad): dice cuánto llega antes y cuánto después; sin nada después, no dice nada de más", () => {
    const META = { hasta: "2026-12-25", nombre: "Navidad" };
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-10-20" },
      { de: "compra" as const, cantidad: 6, fecha: "2027-01-05" },
      { de: "taller" as const, cantidad: 8, fecha: "2026-09-20" },
    ];
    const p = prenda({ vendidas30: 5, llega });
    const con = (x: PrendaAnalisis, meta = META) => textoDe(hechosDe(x, "comprar", SEDES, HOY, null, null, meta).at(-1)!);
    expect(con(p)).toBe("Por llegar 16 · pediste 10 · llega el 20 oct. · pediste 6 · llega el 5 ene. · Llega tarde · te quedas unos 13 días sin stock · 10 antes de Navidad, 6 después · 8 atrasadas hace 17 días");
    // Todo llega después de la meta.
    expect(con(prenda({ vendidas30: 5, piso: 100, llega: [llega[1]!] }))).toBe("Por llegar 6 · pediste 6 · llega el 5 ene. · 6 llegan después de Navidad");
    // Nada llega después: ni una palabra de la meta.
    expect(con(prenda({ vendidas30: 5, piso: 100, llega: [llega[0]!] }))).toBe("Por llegar 10 · pediste 10 · llega el 20 oct.");
    // Sin meta (no se pasa), tampoco.
    expect(textoDe(hechosDe(p, "comprar", SEDES, HOY).at(-1)!)).not.toContain("Navidad");
    // Una parte SIN fecha no se acusa de llegar tarde: cuenta como viene (la misma regla de «Qué pedir»).
    expect(con(prenda({ vendidas30: 5, piso: 100, llega: [{ de: "compra", cantidad: 4, fecha: null }, llega[1]!] }))).toBe("Por llegar 10 · pediste 6 · llega el 5 ene. · pediste 4 · sin fecha · 4 antes de Navidad, 6 después");
  });

  it("quieta para mandar: días en el piso sin venderse, cuánto hay y qué tienda sí la vende", () => {
    const p = prenda({ piso: 4, almacen: 2, diasSinVender: 64, otras: [{ sedeId: "s2", stock: 0, vendidas30: 3 }, { sedeId: "s3", stock: 1, vendidas30: 0 }] });
    expect(grupoDe(p)).toBe("enviar");
    expect(leer(p)).toEqual(["64 días · en el piso sin venderse", "60 días · tardan 9 de cada 10 de su tipo", "Tienes 6 · 4 en el piso", "AQP vendió 3 · este mes · se quedó sin stock · Lleva solo las tallas y colores que Arequipa vendió · Puedes mandar 2 de 6: las otras están en el piso, sácalas primero."]);
    expect(hechosDe(p, "enviar", SEDES, HOY).map((h) => h.icono)).toEqual(["reloj", "reloj", "caja", "camion"]);
  });

  it("para liquidar: desde 3 meses todo va en rojo; antes, en ámbar", () => {
    const vieja = prenda({ piso: 3, almacen: 2, diasSinVender: 104 });
    expect(leer(vieja)).toEqual(["104 días · en el piso sin venderse", "60 días · tardan 9 de cada 10 de su tipo", "Tienes 5 · 3 en el piso", "Liquidar · el precio lo fijas en Etiquetas"]);
    expect(hechosDe(vieja, "liquidar", SEDES, HOY).map((h) => h.tono)).toEqual(["rojo", "pizarra", "taupe", "rojo"]);
    expect(hechosDe(vieja, "liquidar", SEDES, HOY)[0]).toMatchObject({ icono: "urg" });
    const menos = prenda({ piso: 2, diasSinVender: 72 });
    expect(hechosDe(menos, "liquidar", SEDES, HOY).map((h) => h.tono)).toEqual(["ambar", "pizarra", "taupe", "ambar"]);
  });

  it("para vigilar: solo los días y cuánto hay", () => {
    expect(leer(prenda({ piso: 2, almacen: 2, diasSinVender: 38 }))).toEqual(["38 días · en el piso sin venderse", "60 días · tardan 9 de cada 10 de su tipo", "Tienes 4 · 2 en el piso"]);
  });

  it("todavía sin ritmo (B1): los días, cuánto hay y POR QUÉ, con las palabras de Frescura; sin un número de días de respaldo", () => {
    const sinRitmo = { motivo: "poca_venta" as const, desde: 7, vendidas: 7, unidades: 35 };
    const p = prenda({ piso: 3, almacen: 2, diasSinVender: 11, umbrales: undefined, sinRitmo });
    expect(grupoDe(p)).toBe("sin_ritmo");
    expect(leer(p)).toEqual([
      "11 días · en el piso sin venderse",
      "Tienes 5 · 3 en el piso",
      "Todavía sin ritmo · Su tipo todavía no tiene ventas suficientes para saber cuánto tarda en venderse: ni se rebaja ni se manda por ahora. De su tipo se vendieron 7 de 35 de los que colgaste.",
    ]);
    expect(hechosDe(p, "sin_ritmo", SEDES, HOY).at(-1)).toMatchObject({ ancho: "completo" });
    expect(chipDeGrupo("sin_ritmo", false, false, false, null, null)).toEqual({ est: "nd", texto: "Todavía sin ritmo" });
    // Sin leer Frescura, con su razón.
    const sinLeer = prenda({ piso: 3, diasSinVender: 40, umbrales: undefined, sinRitmo: { motivo: "sin_lectura", porque: "fallo" } });
    expect(leer(sinLeer).at(-1)).toContain("No se pudo leer cuánto tarda en venderse su tipo");
    // No tiene botón: no hay nada que rebajar ni mandar por ahora.
    expect(accionPrincipal(p, "sin_ritmo", SEDES, TODO, DONDE, false)).toBeNull();
  });

  it("si va bien: lo vendido y cuánto hay", () => {
    const p = prenda({ piso: 5, almacen: 4, vendidas30: 7 });
    expect(grupoDe(p)).toBeNull();
    expect(leer(p)).toEqual(["Vendiste 7 · en 30 días", "Tienes 9 · 5 en el piso"]);
    // Una tienda con 8 días de ventas en el ERP dice sus días, no 30; y a ese ritmo las 9 duran 10 días: se acaba.
    expect(leer({ ...p, piso: 50, almacen: 40, diasDeVentas: 8 })).toEqual(["Vendiste 7 · en 8 días", "Tienes 90 · 50 en el piso"]);
    expect(grupoDe({ ...p, diasDeVentas: 8 })).toBe("comprar");
  });

  it("nunca salió al piso: los días que lleva guardada y que no hay nada colgado; sin fecha de llegada, solo que nunca salió", () => {
    const p = prenda({ piso: 0, almacen: 3, salioAlPiso: null, llego: "2026-09-29" });
    const texto = (h: { valor: string; etiqueta: string | null }) => [h.valor, h.etiqueta].filter(Boolean).join(" · ");
    expect(hechosDe(p, null, SEDES, HOY, { dias: 8 }).map(texto)).toEqual(["8 días · en el almacén, sin salir al piso", "Tienes 3 · 0 en el piso"]);
    expect(hechosDe(p, null, SEDES, HOY, { dias: 8 })[0]).toMatchObject({ icono: "reloj", tono: "ambar" });
    expect(hechosDe(p, null, SEDES, HOY, { dias: null }).map(texto)).toEqual(["Nunca salió al piso", "Tienes 3 · 0 en el piso"]);
  });

  it("una tienda que no está en la red se nombra «Otra tienda» (no se cae)", () => {
    const p = prenda({ vendidas30: 4, origen: null, otras: [{ sedeId: "s9", stock: 2, vendidas30: 0 }] });
    expect(leer(p)).toContain("Otra tienda tiene 2 · se podría pedir");
  });
});

describe("las semanas: las mismas 8 que cuenta la lectura, la última termina hoy", () => {
  it("cada semana empieza 6 días antes de su último día; la última va de hace 6 días a hoy", () => {
    // `fn_analisis_sede` (20261006214000): la semana k son los 7 días que terminan hoy − 7·(7−k).
    expect(iniciosDeSemana("2026-10-06")).toEqual(["2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"]);
    expect(iniciosDeSemana("2026-01-03").slice(-2)).toEqual(["2025-12-21", "2025-12-28"]); // cruzando el año
  });

  it("cada barra con su fecha corta, su alto y su tooltip; la última, marcada", () => {
    const barras = barrasSemanas([0, 1, 0, 1, 1, 1, 2, 2], "2026-10-06");
    expect(barras).toHaveLength(SEMANAS_FICHA);
    expect(barras.map((b) => b.etiqueta)).toEqual(["12 ago.", "19 ago.", "26 ago.", "2 set.", "9 set.", "16 set.", "23 set.", "30 set."]);
    expect(barras.map((b) => b.alto)).toEqual([0, 31, 0, 31, 31, 31, 62, 62]);
    expect(barras.map((b) => b.ultima)).toEqual([false, false, false, false, false, false, false, true]);
    expect(barras[7].tip).toBe("Semana del 30 set.: 2 vendidas");
    expect(barras[1].tip).toBe("Semana del 19 ago.: 1 vendida");
    expect(barras[0].tip).toBe("Semana del 12 ago.: 0 vendidas");
  });

  it("sin ventas: todas a ras (sin dividir entre 0)", () => {
    expect(barrasSemanas([0, 0, 0, 0, 0, 0, 0, 0], "2026-10-06").every((b) => b.alto === 0 && b.vendidas === 0)).toBe(true);
  });

  it("si la lectura trae menos semanas, las que faltan al principio valen 0; si trae más, cuentan las últimas 8", () => {
    expect(barrasSemanas([3, 1], "2026-10-06").map((b) => b.vendidas)).toEqual([0, 0, 0, 0, 0, 0, 3, 1]);
    expect(barrasSemanas([9, 9, 1, 2, 3, 4, 5, 6, 7, 8], "2026-10-06").map((b) => b.vendidas)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(barrasSemanas([-2, Number.NaN, 1, 1, 1, 1, 1, 1], "2026-10-06").map((b) => b.vendidas)).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
  });
});

describe("los botones del pie", () => {
  it("se acaba: Comprar (lo mismo que su carril); sin el módulo, sin botón", () => {
    const p = prenda({ vendidas30: 4, origen: "terceros", proveedorId: "prov-1" });
    expect(accionPrincipal(p, "comprar", SEDES, TODO, DONDE)).toEqual({ texto: "Comprar", href: hrefComprar(p, TODO, DONDE)! });
    // Si ya viene algo a tiempo, «Comprar» sigue ahí pero no es el botón principal (la fila lo dibuja secundario).
    expect(accionPrincipal(p, "comprar", SEDES, TODO, DONDE, false, true)).toEqual({ texto: "Comprar", href: hrefComprar(p, TODO, DONDE)!, secundaria: true });
    // Y solo en «comprar»: «Liquidar» sigue siendo el paso aunque algo viniera.
    expect(accionPrincipal(prenda({ piso: 3, diasSinVender: 100 }), "liquidar", SEDES, TODO, DONDE, false, true)?.secundaria).toBeUndefined();
    // Con Órdenes de compra, «Comprar» es la orden con su proveedor, la tienda y el modelo (A9); sin ellas ni Facturas, sin botón.
    expect(accionPrincipal(p, "comprar", SEDES, TODO, DONDE)?.href).toBe("/compras/ordenes/nueva?prov=prov-1&destino=s1&modelos=p1&desde=analisis");
    expect(accionPrincipal(p, "comprar", SEDES, { ...TODO, ordenes: false, compras: false }, DONDE)).toBeNull();
  });

  it("para mandar: a la ciudad que más la vende, con ella ya elegida", () => {
    const p = prenda({ piso: 2, almacen: 2, diasSinVender: 70, otras: [{ sedeId: "s2", stock: 0, vendidas30: 1 }, { sedeId: "s3", stock: 0, vendidas30: 4 }] });
    const a = accionPrincipal(p, "enviar", SEDES, TODO, DONDE)!;
    expect(a.texto).toBe("Enviar a Lima");
    expect(a.href).toContain("destino=s3");
    // Todo lo que allá se vendió está en el piso: el botón abriría un traslado vacío, así que no se dibuja.
    expect(accionPrincipal({ ...p, piso: 2, almacen: 0 }, "enviar", SEDES, TODO, DONDE)).toBeNull();
    expect(accionPrincipal(p, "enviar", SEDES, { ...TODO, traslados: false }, DONDE)).toBeNull();
    expect(accionPrincipal(p, "enviar", [SEDES[0]], TODO, DONDE)).toBeNull(); // la tienda que la vende ya no está en la red
  });

  it("para liquidar: sus etiquetas; vigilar o ir bien no tienen botón principal", () => {
    const p = prenda({ piso: 2, diasSinVender: 80 });
    expect(accionPrincipal(p, "liquidar", SEDES, TODO, DONDE)).toEqual({ texto: "Liquidar", href: hrefLiquidar([p], TODO)! });
    expect(accionPrincipal(p, "liquidar", SEDES, { ...TODO, etiquetas: false }, DONDE)).toBeNull();
    expect(accionPrincipal(p, "vigila", SEDES, TODO, DONDE)).toBeNull();
    expect(accionPrincipal(p, null, SEDES, TODO, DONDE)).toBeNull();
  });

  it("lo quieto con la vara de su tipo dice contra qué se juzgó (ADR-0357, act. 2026-10-14)", () => {
    const p = prenda({ piso: 2, diasSinVender: 8, umbrales: { vigila: 3, liquidar: 6, vara: "hoy", vendidas: 30 } });
    expect(hechosDe(p, "liquidar", SEDES, HOY).map((h) => [h.valor, h.etiqueta].join(" · "))).toEqual([
      "8 días · en el piso sin venderse",
      "6 días · tardan 9 de cada 10 de su tipo",
      "Tienes 2 · 2 en el piso",
      "Liquidar · el precio lo fijas en Etiquetas",
    ]);
  });

  it("lo que puede haberse vendido sin registrar: «Registrar ventas» (Por regularizar), y sus tarjetitas lo dicen; sin Existencias, sin botón", () => {
    const p = prenda({ piso: 2, diasSinVender: 80, enDuda: 1 });
    expect(accionPrincipal(p, "duda", SEDES, TODO, DONDE)).toEqual({ texto: "Registrar ventas", href: "/inventario/por-regularizar" });
    expect(accionPrincipal(p, "duda", SEDES, { ...TODO, regularizar: false }, DONDE)).toBeNull();
    expect(leer(p)).toEqual(["80 días · sin una venta registrada", "1 en duda · puede ser una venta sin registrar", "Tienes 2 · 2 en el piso"]);
  });

  it("nunca salió al piso: «Bajar al piso» (Reponer a piso con ella); sin Existencias, sin botón", () => {
    const p = prenda({ varianteId: "g44", piso: 0, almacen: 2, salioAlPiso: null });
    expect(accionPrincipal(p, null, SEDES, TODO, DONDE, true)).toEqual({ texto: "Bajar al piso", href: "/inventario/bajar?lineas=g44:1" });
    expect(accionPrincipal(p, null, SEDES, { ...TODO, existencias: false }, DONDE, true)).toBeNull();
  });

  it("«Pedir a …»: solo si se acaba, otra tienda la tiene y la cuenta puede pedir (la que más tiene)", () => {
    const p = prenda({ vendidas30: 5, otras: [{ sedeId: "s2", stock: 1, vendidas30: 0 }, { sedeId: "s3", stock: 4, vendidas30: 0 }] });
    expect(sedeParaPedir(p, "comprar", SEDES, TODO)?.ciudad).toBe("Lima");
    expect(sedeParaPedir(p, "comprar", SEDES, { pedir: false })).toBeNull();
    expect(sedeParaPedir(p, "liquidar", SEDES, TODO)).toBeNull();
    expect(sedeParaPedir(prenda({ vendidas30: 5 }), "comprar", SEDES, TODO)).toBeNull();
  });
});

describe("el modelo en tu tienda: frase, tabla y otras tiendas (opción B, Felipe 2026-10-10)", () => {
  const HOY_FICHA = "2026-10-10";
  // La forma de la captura de Felipe (TRU, 11 días): 6 colores × S y M, 10 vendidas y 1 que queda. Nombres de color inventados.
  const v = (varianteId: string, color: string, talla: string, vendidas30: number, piso = 0) => prenda({ varianteId, color, talla, vendidas30, piso });
  const m = modeloDe(
    [
      v("a", "Verde agua", "S", 0, 1),
      v("b", "Blanco", "S", 1),
      v("c", "Blanco", "M", 2),
      v("d", "Chocolate", "S", 1),
      v("e", "Chocolate", "M", 2),
      v("f", "Negro", "S", 1),
      v("g", "Vainilla", "M", 1),
      v("h", "Vino", "S", 2),
    ],
    HOY_FICHA,
  );

  it("la frase responde: cuánto vendiste en tus días y cuánto te queda", () => {
    // «tus últimos N días»: son los de la TIENDA (la tarjeta de arriba cuenta desde que se colgó la prenda).
    expect(fraseDelModelo(m, 11)).toBe("Vendiste 10 en tus últimos 11 días y te queda 1.");
    expect(fraseDelModelo(modeloDe([v("x", "Rosa", "S", 0, 3)], HOY_FICHA), 1)).toBe("No vendiste ninguna en tu último día; te quedan 3.");
    expect(fraseDelModelo(modeloDe([v("x", "Rosa", "S", 2)], HOY_FICHA), 30)).toBe("Vendiste 2 en tus últimos 30 días y no te queda ninguna.");
  });

  it("los colores que más se venden arriba, quede o no (a igual venta, por nombre); las tallas en orden de tienda", () => {
    const t = tablaDelModelo(m)!;
    expect(t.tallas).toEqual(["S", "M"]);
    expect(t.filas.map((f) => [f.color, f.vendio])).toEqual([
      ["Blanco", 3],
      ["Chocolate", 3],
      ["Vino", 2],
      ["Negro", 1],
      ["Vainilla", 1],
      ["Verde agua", 0],
    ]);
    expect(t.vendioPorTalla).toEqual([5, 5]);
    expect(t.vendio).toBe(10);
  });

  it("cada celda dice con palabras qué pasó: vendido y sin stock, te queda, o no hay; la fila de un color sin stock lo alerta", () => {
    const t = tablaDelModelo(m)!;
    const celda = (color: string, talla: string) => t.filas.find((f) => f.color === color)!.celdas.find((c) => c.talla === talla)!;
    expect(celda("Blanco", "M")).toMatchObject({ estado: "pedir", fuerte: "2 vendidas", suave: "sin stock", tip: "Blanco · M: 2 vendidas, sin stock" });
    expect(t.filas.find((f) => f.color === "Blanco")!.sinStock).toBe(true);
    expect(t.filas.find((f) => f.color === "Verde agua")!.sinStock).toBe(false);
    expect(celda("Negro", "S")).toMatchObject({ estado: "pedir", fuerte: "1 vendida" });
    expect(celda("Verde agua", "S")).toMatchObject({ estado: "queda", fuerte: "sin ventas", suave: "queda 1" });
    expect(celda("Vino", "M")).toMatchObject({ estado: "nada", fuerte: "no hay", suave: null });
    const vende = tablaDelModelo(modeloDe([v("x", "Rosa", "S", 2, 3), v("y", "Rosa", "M", 0, 0)], HOY_FICHA))!;
    // Arriba siempre lo vendido y abajo lo que queda, haya stock o no (Felipe 2026-10-12).
    expect(vende.filas[0].celdas[0]).toMatchObject({ estado: "queda", fuerte: "2 vendidas", suave: "quedan 3", tip: "Rosa · S: 2 vendidas, quedan 3" });
    expect(vende.filas[0].celdas[1]).toMatchObject({ estado: "nada", fuerte: "no hay" });
  });

  it("a igual venta no importa si queda: el orden es solo por lo vendido y después por nombre", () => {
    const t = tablaDelModelo(modeloDe([v("a", "Rosa", "S", 2, 3), v("b", "Azul", "S", 2, 0), v("c", "Azul", "M", 0, 0), v("d", "Rosa", "M", 0, 0)], HOY_FICHA))!;
    expect(t.filas.map((f) => [f.color, f.sinStock])).toEqual([["Azul", true], ["Rosa", false]]);
  });

  it("lo que ni se vendió ni tienes va al final, debajo de lo que no se vendió pero tienes", () => {
    const t = tablaDelModelo(
      modeloDe([v("a", "Azul", "Estándar", 0, 0), v("b", "Rosa", "Estándar", 0, 2), v("c", "Negro", "Estándar", 1, 0), v("d", "Beige", "Estándar", 0, 3)], HOY_FICHA),
    )!;
    expect(t.filas.map((f) => f.color)).toEqual(["Negro", "Beige", "Rosa", "Azul"]);
    expect(t.filas[3].celdas[0].fuerte).toBe("no hay");
    // Solo se alerta lo que se vendió y se quedó sin stock: «Azul» nunca se vendió y su celda ya dice «no hay».
    expect(t.filas.map((f) => f.sinStock)).toEqual([true, false, false, false]);
  });

  it("una sola talla de un solo color no lleva tabla: la frase ya lo dice", () => {
    expect(tablaDelModelo(modeloDe([v("x", "Rosa", "S", 2, 1)], HOY_FICHA))).toBeNull();
  });

  it("las otras tiendas en una línea, con sus propios 30 días", () => {
    expect(lineaOtrasTiendas(m, SEDES, "s1")).toBe("Arequipa y Lima no tienen este modelo.");
    const conOtras = { piso: 0, almacen: 0, otras: [{ sedeId: "s2", stock: 3, vendidas30: 2 }, { sedeId: "s3", stock: 0, vendidas30: 0 }] };
    expect(lineaOtrasTiendas(conOtras, SEDES, "s1")).toBe("Arequipa tiene 3 (vendió 2 en sus últimos 30 días). Lima no tiene.");
    expect(lineaOtrasTiendas({ piso: 0, almacen: 0, otras: [] }, [SEDES[0]], "s1")).toBeNull();
  });

  it("una tienda que no se pudo leer no es «no tiene este modelo»: se dice que no se pudo leer (B2, D7)", () => {
    const sinLeer = { piso: 0, almacen: 0, otras: [{ sedeId: "s2", stock: 0, vendidas30: 0, sinLeer: true }, { sedeId: "s3", stock: 0, vendidas30: 0 }] };
    expect(lineaOtrasTiendas(sinLeer, SEDES, "s1")).toBe("Lima no tiene este modelo. No se pudo leer Arequipa.");
    expect(lineaOtrasTiendas({ piso: 0, almacen: 0, otras: [{ sedeId: "s2", stock: 0, vendidas30: 0, sinLeer: true }] }, [SEDES[0], SEDES[1]!], "s1")).toBe("No se pudo leer Arequipa.");
    const conStock = { piso: 0, almacen: 0, otras: [{ sedeId: "s2", stock: 0, vendidas30: 0, sinLeer: true }, { sedeId: "s3", stock: 2, vendidas30: 1 }] };
    expect(lineaOtrasTiendas(conStock, SEDES, "s1")).toBe("Lima tiene 2 (vendió 1 en sus últimos 30 días). No se pudo leer Arequipa.");
  });

  it("«Aún no se sabe» por una tienda sin leer: lo dice con su razón y no ofrece «Registrar ventas» (no hay nada que registrar)", () => {
    const p = prenda({ piso: 3, diasSinVender: 80, otras: [{ sedeId: "s2", stock: 0, vendidas30: 0, sinLeer: true }, { sedeId: "s3", stock: 0, vendidas30: 0 }] });
    expect(grupoDe(p)).toBe("duda");
    expect(leer(p)).toEqual(["80 días · en el piso sin venderse", "Tienes 3 · 3 en el piso", "Aún no se sabe · No se pudo leer Arequipa: no se sabe si allá se vende."]);
    expect(accionPrincipal(p, "duda", SEDES, TODO, DONDE)).toBeNull();
    // Con una venta sin registrar, sí.
    const conVenta = { ...p, enDuda: 1 };
    expect(accionPrincipal(conVenta, "duda", SEDES, TODO, DONDE)?.texto).toBe("Registrar ventas");
    expect(leer(conVenta)[1]).toBe("1 en duda · puede ser una venta sin registrar");
  });

  it("una tienda que lo vendió y quedó en cero no «no tiene este modelo»: «se quedó sin stock»; «no tiene» solo si nunca lo tuvo", () => {
    // La mía también está en cero: «también».
    const sinStockAqui = { piso: 0, almacen: 0 };
    // Arequipa lo vendió (5) y quedó en 0; Lima nunca lo tuvo.
    const agotadaAlla = { ...sinStockAqui, otras: [{ sedeId: "s2", stock: 0, vendidas30: 5 }] };
    expect(lineaOtrasTiendas(agotadaAlla, SEDES, "s1")).toBe("Arequipa también se quedó sin stock (vendió 5 en sus últimos 30 días). Lima no tiene.");
    // Las dos se quedaron sin stock: ninguna «no tiene este modelo».
    const ambas = { ...sinStockAqui, otras: [{ sedeId: "s2", stock: 0, vendidas30: 5 }, { sedeId: "s3", stock: 0, vendidas30: 1 }] };
    expect(lineaOtrasTiendas(ambas, SEDES, "s1")).toBe("Arequipa también se quedó sin stock (vendió 5 en sus últimos 30 días). Lima también se quedó sin stock (vendió 1 en sus últimos 30 días).");
    // Una la tiene y otra se quedó sin stock: primero la que sí tiene.
    const mezcla = { ...sinStockAqui, otras: [{ sedeId: "s2", stock: 0, vendidas30: 4 }, { sedeId: "s3", stock: 2, vendidas30: 0 }] };
    expect(lineaOtrasTiendas(mezcla, SEDES, "s1")).toBe("Lima tiene 2. Arequipa también se quedó sin stock (vendió 4 en sus últimos 30 días).");
    // Nunca lo tuvieron (sin fila, o fila en 0 sin ventas): la frase de siempre.
    expect(lineaOtrasTiendas({ ...sinStockAqui, otras: [{ sedeId: "s2", stock: 0, vendidas30: 0 }] }, SEDES, "s1")).toBe("Arequipa y Lima no tienen este modelo.");
  });

  it("el «también» es solo si la mía también está en cero: en un modelo que mandas o liquidas (yo sí lo tengo) no se dice", () => {
    // Mi tienda tiene 4 en el piso y 2 guardadas; Arequipa lo vendió (5) y se quedó sin stock: a Arequipa le falta, a mí no.
    const mandas = { piso: 4, almacen: 2, otras: [{ sedeId: "s2", stock: 0, vendidas30: 5 }] };
    const linea = lineaOtrasTiendas(mandas, SEDES, "s1")!;
    expect(linea).toBe("Arequipa se quedó sin stock (vendió 5 en sus últimos 30 días). Lima no tiene.");
    expect(linea).not.toContain("también");
    // Con una sola unidad guardada en el almacén ya tengo: no es «también».
    expect(lineaOtrasTiendas({ piso: 0, almacen: 1, otras: [{ sedeId: "s2", stock: 0, vendidas30: 5 }] }, SEDES, "s1")).not.toContain("también");
    // Ya no dice «sin ella»: no tenía a qué referirse (un Polo, un Chaleco).
    expect(lineaOtrasTiendas({ piso: 0, almacen: 0, otras: [{ sedeId: "s2", stock: 0, vendidas30: 5 }] }, SEDES, "s1")).not.toContain("ella");
  });

  it("el subtítulo dice sus colores y tallas, y el precio «desde» el menor si varía", () => {
    const conPrecios = modeloDe([prenda({ varianteId: "p1", color: "Arena", talla: "S", precio: 100 }), prenda({ varianteId: "p2", color: "Tostado", talla: "M", precio: 90 })], HOY_FICHA);
    expect(subtituloFicha(conPrecios)).toBe("2 colores · S, M · desde S/\u00a090");
  });
});

// ───────── Segundo pase visual (2026-10-17) ─────────

describe("el rojo de «Cómpralas» es de lo que se agotó o queda una semana o menos (como la barra del carril)", () => {
  it("con más de una semana, ámbar; una semana o menos, rojo; sin el dato, como siempre", () => {
    // El Bolso del segundo pase: 13 días y el chip salía rojo con ⚠ junto a una barra ámbar.
    expect(chipDeGrupo("comprar", false, false, false, 13)).toEqual({ est: "ate", texto: "Cómpralas" });
    expect(chipDeGrupo("comprar", false, false, false, 8)).toEqual({ est: "ate", texto: "Cómpralas" });
    expect(chipDeGrupo("comprar", false, false, false, 7)).toEqual({ est: "urg", texto: "Cómpralas" });
    expect(chipDeGrupo("comprar", false, false, false, 1)).toEqual({ est: "urg", texto: "Cómpralas" });
    expect(chipDeGrupo("comprar", false, false, false, 0)).toEqual({ est: "urg", texto: "Cómpralas" });
    expect(chipDeGrupo("comprar", false, false, false, null)).toEqual({ est: "urg", texto: "Cómpralas" });
    // Solo es de «comprar».
    expect(chipDeGrupo("liquidar", false, false, false, 13)).toEqual({ est: "ate", texto: "Liquidar" });
    expect(chipDeGrupo("enviar", false, false, false, 3)).toEqual({ est: "ate", texto: "Mándalas a donde sí se venden" });
  });
  it("lo que viene llega TARDE no puede decir «Ya viene» en verde: «Ya viene, pero tarde», en ámbar", () => {
    const tarde = { unos: 4 };
    expect(chipDeGrupo("comprar", false, true, false, 6, tarde)).toEqual({ est: "ate", texto: "Ya viene, pero tarde" });
    expect(chipDeGrupo("comprar", false, true, false, 6, null)).toEqual({ est: "bien", texto: "Ya viene" });
    // Tarde sin que venga nada a tiempo no inventa nada.
    expect(chipDeGrupo("comprar", false, false, false, 6, tarde)).toEqual({ est: "urg", texto: "Cómpralas" });
  });
  it("si a tiempo llega al ritmo de la cifra y SOLO el peor caso la pasa (`unos` 0), la franja duda («Puede llegar tarde») y el chip no lo afirma: sigue en «Ya viene»", () => {
    // Con la lógica real: 1 en stock, 2 ventas en 28 días, 5 que llegan en 8 días. La cifra principal dice ~14 días; el peor caso, 5.
    const hoy = "2026-10-17";
    const p = prenda({ piso: 1, almacen: 0, vendidas30: 2, diasDeVentas: 28, llega: [{ de: "compra", cantidad: 5, fecha: "2026-10-25" }] });
    const tarde = llegaTarde(p, hoy);
    expect(tarde).toMatchObject({ llegaEn: 8, unos: 0 });
    expect(textoLlegaTarde(tarde!)).toBe("Puede llegar tarde");
    expect(chipDeGrupo("comprar", false, true, false, diasQueQuedan(p), tarde)).toEqual({ est: "bien", texto: "Ya viene" });
    // Y la franja de la ficha dice la duda, no un hecho.
    const franja = hechosDe(p, "comprar", SEDES, hoy).find((h) => h.valor.startsWith("Por llegar"));
    expect(franja?.mas ?? []).toContain("Puede llegar tarde");
  });
});

describe("una sola ventana en la ficha: cada plazo dice de dónde sale", () => {
  it("la prenda lleva menos días colgada que la tienda vendiendo: «en 23 días, desde que se colgó»; la frase de abajo, «en tus últimos 30 días»", () => {
    const p = prenda({ vendidas30: 6, diasDeVentas: 23, diasDeVentasTienda: 30 });
    expect(hechosDe(p, "comprar", SEDES, HOY)[1]).toMatchObject({ valor: "Vendiste 6", etiqueta: "en 23 días, desde que se colgó" });
    expect(fraseDelModelo(modeloDe([p], HOY), 30)).toBe("Vendiste 6 en tus últimos 30 días y no te queda ninguna.");
  });
  it("misma ventana que la tienda: «en 30 días», sin explicación de más", () => {
    expect(hechosDe(prenda({ vendidas30: 6, diasDeVentas: 30, diasDeVentasTienda: 30 }), "comprar", SEDES, HOY)[1]).toMatchObject({ etiqueta: "en 30 días" });
    // Sin los días de la tienda (un cargador viejo), como antes.
    expect(hechosDe(prenda({ vendidas30: 6, diasDeVentas: 23 }), "comprar", SEDES, HOY)[1]).toMatchObject({ etiqueta: "en 23 días" });
  });
  it("en el mínimo de una semana no dice «desde que se colgó» (una colgada hace 3 días también se mide en 7)", () => {
    expect(hechosDe(prenda({ vendidas30: 2, diasDeVentas: 7, diasDeVentasTienda: 30 }), "comprar", SEDES, HOY)[1]).toMatchObject({ etiqueta: "en 7 días" });
    expect(hechosDe(prenda({ vendidas30: 2, diasDeVentas: 8, diasDeVentasTienda: 30 }), "comprar", SEDES, HOY)[1]).toMatchObject({ etiqueta: "en 8 días, desde que se colgó" });
  });
});

describe("el ritmo de la última semana, junto a la cifra", () => {
  // El Bolso del segundo pase: 1 → 2 → 4 por semana, 7 vendidas, le quedan 3.
  const bolso = prenda({ piso: 3, vendidas30: 7, diasDeVentas: 30, semanas: [0, 0, 0, 0, 0, 1, 2, 4] });

  it("«La última semana vendiste 4: a ese paso te quedan ~5 días», en una franja; la cifra principal no cambia", () => {
    const hechos = hechosDe(bolso, "comprar", SEDES, HOY);
    expect(hechos[0]).toMatchObject({ valor: "Te dura ~13 días" });
    const franja = hechos.find((h) => h.valor.startsWith("La última semana"))!;
    expect(textoDe(franja)).toBe("La última semana vendiste 4 · a ese paso te quedan ~5 días");
    expect(franja).toMatchObject({ icono: "reloj", tono: "ambar", ancho: "completo" });
  });
  it("con un ritmo parejo, con menos de 3 ventas en la semana o ya agotada, no dice nada", () => {
    const sin = (p: PrendaAnalisis) => hechosDe(p, "comprar", SEDES, HOY).some((h) => h.valor.startsWith("La última semana"));
    expect(sin(prenda({ piso: 3, vendidas30: 7, diasDeVentas: 30, semanas: [0, 0, 1, 1, 2, 1, 1, 1] }))).toBe(false);
    expect(sin(prenda({ piso: 3, vendidas30: 4, diasDeVentas: 30, semanas: [0, 0, 0, 0, 0, 0, 2, 2] }))).toBe(false);
    expect(sin(prenda({ vendidas30: 7, diasDeVentas: 30, semanas: [0, 0, 0, 0, 0, 1, 2, 4] }))).toBe(false);
  });
  it("«~1 día» en singular, y solo en lo que se acaba (no en lo quieto)", () => {
    const uno = hechosDe(prenda({ piso: 1, vendidas30: 8, diasDeVentas: 30, semanas: [0, 0, 0, 0, 0, 1, 3, 7] }), "comprar", SEDES, HOY).find((h) => h.valor.startsWith("La última semana"))!;
    expect(textoDe(uno)).toBe("La última semana vendiste 7 · a ese paso te quedan ~1 día");
    expect(hechosDe(prenda({ piso: 3, diasSinVender: 70, semanas: [0, 0, 0, 0, 0, 1, 2, 4] }), "liquidar", SEDES, HOY).some((h) => h.valor.startsWith("La última semana"))).toBe(false);
  });
});

describe("«Llega tarde» en la ficha: la franja de lo que viene pasa a ámbar y lo dice", () => {
  // 6 en el piso y 30 vendidas en 30 días: la barra dice 6 días, el peor caso 5. Llega en 10 días (HOY = 7 de octubre).
  const vestido = (fecha: string | null) => prenda({ piso: 6, vendidas30: 30, diasDeVentas: 30, llega: [{ de: "compra", cantidad: 15, fecha }] });

  it("llega después de que se acaba: ámbar y «Llega tarde · te quedas unos 4 días sin stock»", () => {
    const franja = hechosDe(vestido("2026-10-17"), "comprar", SEDES, HOY).at(-1)!;
    expect(textoDe(franja)).toBe("Por llegar 15 · pediste 15 · llega el 17 oct. · Llega tarde · te quedas unos 4 días sin stock");
    expect(franja).toMatchObject({ icono: "llega", tono: "ambar", ancho: "completo" });
  });
  it("llega a tiempo (o sin fecha): verde y sin «tarde»", () => {
    expect(hechosDe(vestido("2026-10-10"), "comprar", SEDES, HOY).at(-1)).toMatchObject({ tono: "verde" });
    const sinFecha = hechosDe(vestido(null), "comprar", SEDES, HOY).at(-1)!;
    expect(sinFecha).toMatchObject({ tono: "verde" });
    expect(textoDe(sinFecha)).not.toContain("tarde");
  });
});

describe("lo ya pedido de su TIPO en la ficha (una orden no dice a qué modelo irá)", () => {
  const polos = (partes: Parameters<typeof pedidoPorTipo>[0]) => pedidoPorTipo(partes, HOY).get("Blusas") ?? null;
  const orden = { de: "orden" as const, categoria: "Blusas", prefijo: "BLU", marca: "Marca Uno", cantidad: 40, fecha: "2026-10-29", numeros: [12] };
  const con = (p: PrendaAnalisis, delTipo: ReturnType<typeof polos>) => hechosDe(p, "comprar", SEDES, HOY, null, null, null, delTipo);

  it("«Ya pedido: 40 blusas» y la razón por la que no se sabe a qué modelo, en una franja de ancho completo", () => {
    const f = con(prenda({ vendidas30: 4, costo: null }), polos([orden])).find((h) => h.valor.startsWith("Ya pedido"))!;
    expect(textoDe(f)).toBe("Ya pedido: 40 blusas · llegan el 29 oct. · la orden no dice a qué modelo irá");
    expect(f).toMatchObject({ icono: "llega", tono: "pizarra", ancho: "completo" });
  });
  it("lo que no suma también se dice sin prometer que llega (sin fecha, atrasado)", () => {
    const sinFecha = con(prenda({ vendidas30: 4 }), polos([{ ...orden, fecha: null }])).find((h) => h.valor.startsWith("Ya pedido"))!;
    expect(textoDe(sinFecha)).toContain("sin fecha de entrega");
    const atrasada = con(prenda({ vendidas30: 4 }), polos([{ ...orden, fecha: "2026-10-01" }])).find((h) => h.valor.startsWith("Pedido atrasado"))!;
    expect(textoDe(atrasada)).toContain("6 días sin llegar");
  });
  it("no dice nada si no hay pedido de su tipo, si ya viene algo a tiempo, o si no es lo que se acaba", () => {
    const dice = (hechos: Hecho[]) => hechos.some((h) => /Ya pedido|Pedido atrasado/.test(h.valor));
    expect(dice(con(prenda({ vendidas30: 4 }), null))).toBe(false);
    expect(dice(con(prenda({ vendidas30: 4, llega: [{ de: "compra", cantidad: 6, fecha: "2026-10-12" }] }), polos([orden])))).toBe(false);
    expect(dice(hechosDe(prenda({ piso: 3, diasSinVender: 70 }), "liquidar", SEDES, HOY, null, null, null, polos([orden])))).toBe(false);
    // Sin la categoría de la prenda no se adivina el tipo.
    expect(dice(con(prenda({ vendidas30: 4, categoria: null }), polos([orden])))).toBe(false);
  });
});
