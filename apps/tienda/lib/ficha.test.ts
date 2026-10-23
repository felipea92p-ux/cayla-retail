import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import {
  avisoOtrosSepararon,
  botonDeLaFicha,
  campanaDeLaFicha,
  chipCampana,
  chipsDelCatalogo,
  colorInicial,
  combinaCon,
  dibujoDeLaCampana,
  esIdDePrenda,
  faltaParaTerminar,
  fotosDelColor,
  interpretarFicha,
  interpretarSeparadas,
  lineaAlAgregar,
  notaDeTalla,
  pistaOtraTienda,
  parecidasA,
  precioDeLaFicha,
  promesasDeCompra,
  tallaDelPrecio,
  tallasDelColor,
  tallasRapidas,
  type Ficha,
} from "./ficha";
import type { Look } from "./looks";
import { PLAZOS_SIN_DATOS } from "./ayuda";

const TRU = "f775651f-62c8-4ff4-a414-b5614026d0cd";
const LIM = "2d97d322-8a0a-4cd5-99c4-70e52b9c01db";
const T = { S: "96c0560a-1612-4fde-8ef7-d6aeab8c75c8", M: "1cfc459c-03e1-42d4-b950-a2a744da887a", L: "da3b908f-27d0-41a7-89e0-e002c79655a7" };
const FOTO = (n: string) => `https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/${n}.jpg`;
const CAMPANA = { id: "5a5a5a5a-1111-4222-8333-444444444444", nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-10-21" };
const variante = (id: string, color: string, talla: string, tru: unknown, lim: unknown, total: unknown, campana: unknown = null) => ({
  id,
  color,
  talla,
  precio: 79.9,
  precio_final: campana ? 63.9 : 79.9,
  campana,
  stock: { [TRU]: tru, [LIM]: lim },
  total,
});
// Una ficha tal como la devuelve `retail.tienda_ficha(p_producto, p_sede)` (20261015012000).
const BASE = {
  sede: null,
  umbral: 3,
  sedes: [
    { id: LIM, nombre: "Lima" },
    { id: TRU, nombre: "Trujillo" },
  ],
  prenda: {
    id: "3f0e8a8e-2f1b-4c3e-9a55-111111111111",
    codigo: "CMS-0001",
    nombre: "Blusa Emma",
    descripcion: "Lino liviano que cae bien",
    categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" },
    precio: 79.9,
    precio_final: 63.9,
    desde: true,
    campana: CAMPANA,
    colores: [
      { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: null },
      { codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: FOTO("bei") },
    ],
    tallas: [
      { id: T.S, nombre: "S" },
      { id: T.M, nombre: "M" },
      { id: T.L, nombre: "L" },
    ],
    fotos: [
      { url: FOTO("principal"), color: null },
      { url: FOTO("bei"), color: "BEI" },
    ],
    variantes: [
      variante("00000000-0000-4000-8000-000000000001", "NEG", T.S, 3, 0, 3, CAMPANA),
      variante("00000000-0000-4000-8000-000000000002", "NEG", T.M, "hay", 2, "hay", CAMPANA),
      variante("00000000-0000-4000-8000-000000000003", "NEG", T.L, 0, 0, 0, CAMPANA),
      variante("00000000-0000-4000-8000-000000000004", "BEI", T.S, 1, 0, 1),
      variante("00000000-0000-4000-8000-000000000005", "BEI", T.M, 0, 1, 1),
    ],
  },
};
const ficha = interpretarFicha(BASE) as Ficha;

describe("interpretarFicha", () => {
  it("lee lo que devuelve la base, en camelCase", () => {
    expect(ficha).toMatchObject({ nombre: "Blusa Emma", precio: 79.9, precioFinal: 63.9, desde: true, umbral: 3, sede: null });
    expect(ficha.sedes.map((s) => s.nombre)).toEqual(["Lima", "Trujillo"]);
    expect(ficha.variantes).toHaveLength(5);
    expect(ficha.variantes[1]).toMatchObject({ precioFinal: 63.9, total: "hay", stock: { [TRU]: "hay", [LIM]: 2 } });
  });

  it("null de la base es «no está»; una respuesta sin forma de ficha, null (no se pudo cargar)", () => {
    expect(interpretarFicha(null)).toBe("no_esta");
    for (const raro of [undefined, "x", 3, {}, { prenda: null }, { ...BASE, prenda: { ...BASE.prenda, colores: [] } }]) {
      expect(interpretarFicha(raro)).toBeNull();
    }
  });

  it("una talla con un dato raro —o una cifra de 4 o más— se deja fuera; las demás se ven", () => {
    const f = interpretarFicha({
      ...BASE,
      prenda: {
        ...BASE.prenda,
        variantes: [...BASE.prenda.variantes, variante("00000000-0000-4000-8000-000000000006", "BEI", T.L, 4, 0, "hay"), { id: "x" }],
      },
    }) as Ficha;
    expect(f.variantes).toHaveLength(5);
    // Sin ninguna talla que se pueda leer, no hay ficha que mostrar.
    expect(interpretarFicha({ ...BASE, prenda: { ...BASE.prenda, variantes: [{ id: "x" }] } })).toBeNull();
  });

  it("lo que llega raro y no es esencial se lee como «sin dato»: umbral 3, sin tiendas, sin descripción, una talla sin nombre es «Única»", () => {
    const f = interpretarFicha({
      ...BASE,
      umbral: 9,
      sedes: "x",
      prenda: { ...BASE.prenda, descripcion: "", tallas: [{ id: null, nombre: null }], fotos: "x" },
    }) as Ficha;
    expect(f).toMatchObject({ umbral: 3, sedes: [], descripcion: null, fotos: [], tallas: [{ id: null, nombre: "Única" }] });
  });

  it("el id de la dirección tiene que ser un uuid", () => {
    expect(esIdDePrenda("3f0e8a8e-2f1b-4c3e-9a55-111111111111")).toBe(true);
    expect(esIdDePrenda("blusa-emma")).toBe(false);
    expect(esIdDePrenda("3f0e8a8e-2f1b-4c3e-9a55-11111111111")).toBe(false);
  });
});

describe("al elegir color y talla", () => {
  it("abre con el color pedido; si no, el primero con foto y con algo; si no, el primero con foto; si no, el primero", () => {
    expect(colorInicial(ficha, "NEG")).toBe("NEG");
    expect(colorInicial(ficha, "ROS")).toBe("BEI");
    expect(colorInicial(ficha)).toBe("BEI");
    const sinStockBei = { ...ficha, variantes: ficha.variantes.map((v) => (v.color === "BEI" ? { ...v, total: 0 as const } : v)) };
    expect(colorInicial(sinStockBei)).toBe("BEI");
    // Con una tienda elegida cuenta lo que hay AHÍ (cada tienda maneja lo suyo): el negro no tiene nada en Lima, el beige sí.
    const conFotos = { ...ficha, colores: ficha.colores.map((c) => ({ ...c, foto: FOTO(c.codigo) })) };
    const sinNegroEnLima = { ...conFotos, variantes: conFotos.variantes.map((v) => (v.color === "NEG" ? { ...v, stock: { ...v.stock, [LIM]: 0 as const } } : v)) };
    expect(colorInicial(sinNegroEnLima, null, LIM)).toBe("BEI");
    expect(colorInicial(sinNegroEnLima, null, null)).toBe("NEG");
    const sinFotos = { ...ficha, colores: ficha.colores.map((c) => ({ ...c, foto: null })) };
    expect(colorInicial(sinFotos)).toBe("NEG");
  });

  it("las tallas de un color, en el orden de la tienda (BEI no tiene L)", () => {
    expect(tallasDelColor(ficha, "NEG").map((t) => t.talla.nombre)).toEqual(["S", "M", "L"]);
    expect(tallasDelColor(ficha, "BEI").map((t) => t.talla.nombre)).toEqual(["S", "M"]);
    expect(tallasDelColor(ficha, "ROS")).toEqual([]);
  });

  it("las fotos del color primero; un color sin foto propia se ve con la del modelo y lo dice", () => {
    expect(fotosDelColor(ficha, "BEI")).toEqual({ fotos: [FOTO("bei"), FOTO("principal")], enOtroColor: false });
    expect(fotosDelColor(ficha, "NEG")).toEqual({ fotos: [FOTO("principal"), FOTO("bei")], enOtroColor: true });
    expect(fotosDelColor({ ...ficha, fotos: [] }, "NEG")).toEqual({ fotos: [], enOtroColor: false });
  });

  it("la nota de la talla: «Agotada» si la tienda elegida no tiene (aunque otra sí: cada tienda maneja lo suyo); sin tienda, si ninguna; sin tiendas, nada", () => {
    const [negS, negM, negL, beiS, beiM] = ficha.variantes;
    expect(notaDeTalla(negS, LIM, true)).toBe("Agotada");
    expect(notaDeTalla(negM, LIM, true)).toBeNull();
    expect(notaDeTalla(negL, TRU, true)).toBe("Agotada");
    expect(notaDeTalla(beiS, null, true)).toBeNull();
    expect(notaDeTalla(negL, null, true)).toBe("Agotada");
    expect(notaDeTalla(beiM, TRU, true)).toBe("Agotada");
    expect(notaDeTalla(negL, null, false)).toBeNull();
  });

  it("el precio lo decide la talla elegida; sin talla, el color si todas sus tallas cuestan lo mismo; si no, el modelo (con «Desde»)", () => {
    const [negS, , , beiS] = ficha.variantes;
    // Todas las NEG cuestan lo mismo y con la misma campaña: ya es exacto sin elegir talla.
    expect(tallaDelPrecio(ficha, "NEG", null)).toBe(negS);
    expect(tallaDelPrecio(ficha, "BEI", null)).toBe(beiS);
    expect(tallaDelPrecio(ficha, "BEI", negS)).toBe(negS);
    expect(tallaDelPrecio(ficha, "ROS", null)).toBeNull();
    // Si una talla del color cuesta distinto, el precio exacto pide la talla.
    const distinta = { ...ficha, variantes: ficha.variantes.map((v, i) => (i === 1 ? { ...v, precio: 89.9, precioFinal: 71.9 } : v)) };
    expect(tallaDelPrecio(distinta, "NEG", null)).toBeNull();

    expect(precioDeLaFicha(ficha, null)).toEqual({ principal: "Desde S/ 63.90", anterior: "S/ 79.90", oferta: true });
    expect(precioDeLaFicha(ficha, negS)).toEqual({ principal: "S/ 63.90", anterior: "S/ 79.90", oferta: true });
    expect(precioDeLaFicha(ficha, beiS)).toEqual({ principal: "S/ 79.90", anterior: null, oferta: false });
  });

  it("la campaña que se ve: la de la talla que decide el precio o la del modelo; su chip", () => {
    expect(chipCampana(campanaDeLaFicha(ficha, null))).toBe("−20 % · Aniversario CAYLA");
    expect(campanaDeLaFicha(ficha, ficha.variantes[0])?.hasta).toBe("2026-10-21");
    expect(campanaDeLaFicha(ficha, ficha.variantes[3])).toBeNull();
    expect(chipCampana(null)).toBeNull();
    // Una campaña que no baja nada no se anuncia.
    expect(campanaDeLaFicha({ ...ficha, precioFinal: ficha.precio }, null)).toBeNull();
  });

  it("lo que falta para que termine la campaña: días y horas, o el reloj el último día; terminada, nada", () => {
    const lima = (fecha: string) => new Date(`${fecha}-05:00`).getTime();
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-18T10:00:00"))).toBe("3 días 13 h");
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-20T23:00:00"))).toBe("1 día 0 h");
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-21T18:47:51"))).toBe("05:12:08");
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-22T00:00:01"))).toBeNull();
  });
});

describe("los chips que salen del catálogo (actividad 5)", () => {
  it("«Nuevo» con hace cuántos días llegó (o «llegó hoy»), solo «Nuevo» si está fijado sin días, y su puesto en Más vendidos", () => {
    expect(chipsDelCatalogo({ nuevo: { dias: 4 }, vendidos: 3 })).toEqual([
      { texto: "Nuevo · llegó hace 4 días", tono: "nuevo", icono: "nuevo" },
      { texto: "N.º 3 en más vendidos" },
    ]);
    expect(chipsDelCatalogo({ nuevo: { dias: 1 }, vendidos: null })).toEqual([{ texto: "Nuevo · llegó hace 1 día", tono: "nuevo", icono: "nuevo" }]);
    expect(chipsDelCatalogo({ nuevo: { dias: 0 }, vendidos: null })).toEqual([{ texto: "Nuevo · llegó hoy", tono: "nuevo", icono: "nuevo" }]);
    expect(chipsDelCatalogo({ nuevo: { dias: null }, vendidos: null })).toEqual([{ texto: "Nuevo", tono: "nuevo", icono: "nuevo" }]);
    expect(chipsDelCatalogo({ nuevo: null, vendidos: 1 })).toEqual([{ texto: "N.º 1 en más vendidos" }]);
    // Sin la prenda en el catálogo (o sin base), ningún chip: nunca se afirma lo que no se sabe.
    expect(chipsDelCatalogo({ nuevo: null, vendidos: null })).toEqual([]);
    expect(chipsDelCatalogo(null)).toEqual([]);
  });
});

describe("las insignias de Catálogo ▸ Insignias en la ficha (ADR-0489)", () => {
  const HALLOWEEN = { id: "7b7b7b7b-1111-4222-8333-444444444441", nombre: "Halloween" };
  const REEDICION = { id: "7b7b7b7b-1111-4222-8333-444444444442", nombre: "Reedición" };
  // Lo que la ficha entrega de cada una: sin dibujo elegido ni descuento (la base vieja, o una que no los tiene), «según el nombre».
  const COMPLETAS = (i: { id: string; nombre: string }) => ({ ...i, icono: null, descuento: false });
  const conInsignias = (insignias: unknown) => interpretarFicha({ ...BASE, prenda: { ...BASE.prenda, insignias } }) as Ficha;

  it("la ficha las lee en el orden que manda la base; sin el campo, sin insignias y sin error", () => {
    expect(conInsignias([HALLOWEEN, REEDICION]).insignias).toEqual([COMPLETAS(HALLOWEEN), COMPLETAS(REEDICION)]);
    expect(ficha.insignias).toEqual([]);
    expect(conInsignias(undefined).insignias).toEqual([]);
    expect(conInsignias("raro").insignias).toEqual([]);
  });

  it("una insignia con un dato raro o repetida se deja fuera; las demás se ven (y la ficha no se cae)", () => {
    const f = conInsignias([HALLOWEEN, { id: "no-es-uuid", nombre: "Rota" }, { id: REEDICION.id, nombre: "   " }, 7, null, HALLOWEEN, REEDICION]);
    expect(f.insignias).toEqual([COMPLETAS(HALLOWEEN), COMPLETAS(REEDICION)]);
    expect(f.nombre).toBe("Blusa Emma");
  });

  it("las insignias van después de «Nuevo» y antes de «N.º … en más vendidos», con la misma cara entre ellas", () => {
    expect(chipsDelCatalogo({ nuevo: { dias: 3 }, vendidos: 2 }, [HALLOWEEN, REEDICION])).toEqual([
      { texto: "Nuevo · llegó hace 3 días", tono: "nuevo", icono: "nuevo" },
      { texto: "Halloween", tono: "insignia", icono: "halloween" },
      { texto: "Reedición", tono: "insignia", icono: "reedicion" },
      { texto: "N.º 2 en más vendidos" },
    ]);
  });

  it("sin la prenda en el catálogo se ven igual (vienen de su ficha, no del catálogo), pero «Nuevo» y el puesto no se inventan", () => {
    expect(chipsDelCatalogo(null, [HALLOWEEN])).toEqual([{ texto: "Halloween", tono: "insignia", icono: "halloween" }]);
    expect(chipsDelCatalogo({ nuevo: null, vendidos: null }, [])).toEqual([]);
  });

  it("la insignia «Nuevo» no repite a «Nuevo · llegó hace…», pero sí se ve si la tienda no lo dice (llegó hace más de 30 días)", () => {
    const nuevo = { id: "7b7b7b7b-1111-4222-8333-444444444443", nombre: "Nuevo" };
    expect(chipsDelCatalogo({ nuevo: { dias: 0 }, vendidos: null }, [nuevo, HALLOWEEN])).toEqual([
      { texto: "Nuevo · llegó hoy", tono: "nuevo", icono: "nuevo" },
      { texto: "Halloween", tono: "insignia", icono: "halloween" },
    ]);
    expect(chipsDelCatalogo({ nuevo: null, vendidos: null }, [nuevo])).toEqual([{ texto: "Nuevo", tono: "insignia", icono: "nuevo" }]);
  });

  it("«Top ventas» no repite a «N.º 3 en más vendidos», pero sí se ve si la tienda no dice el puesto; sin tildes ni mayúsculas", () => {
    const top = { id: "7b7b7b7b-1111-4222-8333-444444444444", nombre: "  TOP  Ventas " };
    const mas = { id: "7b7b7b7b-1111-4222-8333-444444444445", nombre: "Más vendidos" };
    expect(chipsDelCatalogo({ nuevo: null, vendidos: 3 }, [top, mas])).toEqual([{ texto: "N.º 3 en más vendidos" }]);
    expect(chipsDelCatalogo({ nuevo: null, vendidos: null }, [top])).toEqual([{ texto: "TOP  Ventas", tono: "insignia", icono: "top" }]);
  });

  it("cada insignia lleva su dibujo: el que se eligió al crearla manda; si no, el de su nombre (el mismo que le da el ERP); si no se reconoce, una etiqueta", () => {
    const sin = (nombre: string) => chipsDelCatalogo(null, [{ nombre }])[0].icono;
    expect(sin("Halloween")).toBe("halloween");
    expect(sin("Aniversario CAYLA")).toBe("aniversario");
    expect(sin("Día Internacional del Gato")).toBe("gato");
    expect(sin("  HALLOWEEN  ")).toBe("halloween");
    expect(sin("Estreno")).toBe("generico");
    // El elegido manda sobre el nombre: «Día del Padre» con el pastel; «Halloween» con el gato; y una clave desconocida cae al nombre.
    expect(chipsDelCatalogo(null, [{ nombre: "Día del Padre", icono: "aniversario" }])[0].icono).toBe("aniversario");
    expect(chipsDelCatalogo(null, [{ nombre: "Halloween", icono: "gato" }])[0].icono).toBe("gato");
    expect(chipsDelCatalogo(null, [{ nombre: "Estreno", icono: "generico" }])[0].icono).toBe("generico");
  });

  it("la ficha lee el dibujo elegido: una clave que no existe, o ninguna, o un dato raro, es «según el nombre» y nunca rompe", () => {
    const f = conInsignias([
      { ...HALLOWEEN, icono: "gato" },
      { ...REEDICION, icono: "ya-no-existe" },
      { id: "7b7b7b7b-1111-4222-8333-444444444447", nombre: "Estreno", icono: 7 },
      { id: "7b7b7b7b-1111-4222-8333-444444444448", nombre: "Sin campo" },
    ]);
    expect(f.insignias.map((i) => i.icono)).toEqual(["gato", null, null, null]);
    expect(chipsDelCatalogo(null, f.insignias).map((c) => c.icono)).toEqual(["gato", "reedicion", "generico", "generico"]);
  });

  it("una insignia con descuento no se dibuja aparte, pero su dibujo elegido lo toma el chip del descuento (el mismo que muestra el ERP)", () => {
    const ANIV = { id: "7b7b7b7b-1111-4222-8333-444444444449", nombre: "Día del Padre", icono: "aniversario", descuento: true };
    const f = conInsignias([HALLOWEEN, ANIV]);
    expect(f.insignias.map((i) => i.descuento)).toEqual([false, true]);
    expect(chipsDelCatalogo(null, f.insignias).map((c) => c.texto)).toEqual(["Halloween"]);
    const campana = { id: ANIV.id, nombre: "Día del Padre", pct: 25, hasta: null };
    expect(dibujoDeLaCampana(f, campana)).toBe("aniversario");
    // Sin dibujo elegido, el de su nombre; y si la lista no la trae (base vieja, campaña sin id), también.
    expect(dibujoDeLaCampana(conInsignias([{ ...ANIV, icono: null }]), campana)).toBe("generico");
    expect(dibujoDeLaCampana(conInsignias([]), { id: ANIV.id, nombre: "Aniversario CAYLA", pct: 20, hasta: null })).toBe("aniversario");
    expect(dibujoDeLaCampana(conInsignias([ANIV]), { nombre: "Navidad", pct: 10, hasta: null })).toBe("navidad");
  });

  it("una insignia que solo se parece a «Nuevo» (otro nombre) se ve siempre", () => {
    const otra = { id: "7b7b7b7b-1111-4222-8333-444444444446", nombre: "Colección nueva" };
    expect(chipsDelCatalogo({ nuevo: { dias: 1 }, vendidos: null }, [otra]).map((c) => c.texto)).toEqual(["Nuevo · llegó hace 1 día", "Colección nueva"]);
  });
});

describe("lo que la ficha conecta: el botón, la propuesta k, «Agregar» de la tarjeta y «Combínalo con»", () => {
  const [negS, negM, negL, beiS, beiM] = ficha.variantes;
  const TRUJILLO = { id: TRU, nombre: "Trujillo" };

  it("el botón: sin talla «Elige tu talla»; si hay en la tienda elegida, agregar; si ahí no hay (aunque otra tenga), «Avísame»; sin tienda, lo de todas", () => {
    expect(botonDeLaFicha(null, LIM)).toEqual({ tipo: "elige" });
    expect(botonDeLaFicha(negS, TRU)).toEqual({ tipo: "agregar", varianteId: negS.id });
    expect(botonDeLaFicha(negS, LIM)).toEqual({ tipo: "avisame", varianteId: negS.id });
    expect(botonDeLaFicha(beiM, LIM)).toEqual({ tipo: "agregar", varianteId: beiM.id });
    expect(botonDeLaFicha(beiM, TRU)).toEqual({ tipo: "avisame", varianteId: beiM.id });
    expect(botonDeLaFicha(negL, LIM)).toEqual({ tipo: "avisame", varianteId: negL.id });
    // Sin tienda elegida (la web sin tiendas): vale lo que haya en todas juntas.
    expect(botonDeLaFicha(negS)).toEqual({ tipo: "agregar", varianteId: negS.id });
    expect(botonDeLaFicha(negL)).toEqual({ tipo: "avisame", varianteId: negL.id });
  });

  it("la propuesta k: «la última» si queda una en esa tienda, «las que quedan» si hay más; nada sin tienda, sin talla o sin nada libre ahí", () => {
    const separadas = new Set([beiS.id, negM.id, beiM.id]);
    expect(avisoOtrosSepararon(beiS, TRUJILLO, separadas)).toBe(
      "Otra persona ya separó la última en Trujillo. Igual puedes separarla: la tienda te confirma o te ofrece otra opción.",
    );
    expect(avisoOtrosSepararon(negM, TRUJILLO, separadas)).toBe(
      "Otras personas ya separaron las que quedan en Trujillo. Igual puedes separarla: la tienda te confirma o te ofrece otra opción.",
    );
    // La base no dijo que sí para esa talla; nada libre en Trujillo; sin tienda («Todas») o sin talla elegida.
    expect(avisoOtrosSepararon(negS, TRUJILLO, separadas)).toBeNull();
    expect(avisoOtrosSepararon(beiM, TRUJILLO, separadas)).toBeNull();
    expect(avisoOtrosSepararon(beiS, null, separadas)).toBeNull();
    expect(avisoOtrosSepararon(null, TRUJILLO, separadas)).toBeNull();
  });

  it("una talla que no está en la tienda elegida pero sí en otra: solo una pista, «Hay en …», sin prometer que la tienda la traiga; si no, nada", () => {
    const LIMA = { id: LIM, nombre: "Lima" };
    // NEG S: Trujillo 3, Lima 0 → con Lima elegida, hay en Trujillo.
    expect(pistaOtraTienda(negS, LIMA, ficha.sedes)).toBe("Hay en Trujillo.");
    // BEI M: Trujillo 0, Lima 1 → con Trujillo elegida, hay en Lima.
    expect(pistaOtraTienda(beiM, TRUJILLO, ficha.sedes)).toBe("Hay en Lima.");
    // Con tres tiendas, las nombra todas: «Hay en Arequipa y Lima.».
    const tres = [{ id: "a", nombre: "Arequipa" }, ...ficha.sedes];
    const enDos = { ...negS, stock: { ...negS.stock, a: "hay" as const, [TRU]: "hay" as const, [LIM]: 0 as const } };
    expect(pistaOtraTienda(enDos, LIMA, tres)).toBe("Hay en Arequipa y Trujillo.");
    // Hay en la elegida; sin tienda; sin talla; en ninguna (eso es «Avísame» sin pista).
    expect(pistaOtraTienda(negM, LIMA, ficha.sedes)).toBeNull();
    expect(pistaOtraTienda(negS, null, ficha.sedes)).toBeNull();
    expect(pistaOtraTienda(null, LIMA, ficha.sedes)).toBeNull();
    expect(pistaOtraTienda(negL, LIMA, ficha.sedes)).toBeNull();
    // Nunca la promesa vieja.
    expect(pistaOtraTienda(negS, LIMA, ficha.sedes)).not.toMatch(/traer|separarla/);
  });

  it("lo que dice la ficha junto al botón al agregar: corto y con la talla; si no entró, la frase del servidor", () => {
    expect(lineaAlAgregar({ bien: true, texto: "Agregaste Blusa Emma · Negro · M a tu bolsa." }, "M", true)).toBe("La talla M ya está en tu bolsa.");
    expect(lineaAlAgregar({ bien: true, texto: "Agregaste Collar a tu bolsa." }, "Única", false)).toBe("Ya está en tu bolsa.");
    expect(lineaAlAgregar({ bien: false, texto: "Ya tienes en tu bolsa todas las que quedan de esa talla." }, "M", true)).toBe(
      "Ya tienes en tu bolsa todas las que quedan de esa talla.",
    );
  });

  it("lo que dice la base de la propuesta k: solo las tallas con sí; lo raro se lee como «nadie» (nunca frena)", () => {
    expect([...interpretarSeparadas({ [negS.id]: true, [negM.id]: false })]).toEqual([negS.id]);
    for (const raro of [null, undefined, "x", 3, [], { "no-es-un-id": true }, { [negS.id]: "sí" }, { [negS.id]: 1 }]) {
      expect(interpretarSeparadas(raro).size).toBe(0);
    }
  });

  it("«Agregar» de la tarjeta: el primer color con algo en la tienda elegida (o en alguna) y sus tallas, tachadas las que no hay ahí", () => {
    expect(tallasRapidas(ficha, null)).toEqual([
      { talla: "S", varianteId: negS.id },
      { talla: "M", varianteId: negM.id },
      { talla: "L", varianteId: null },
    ]);
    expect(tallasRapidas(ficha, LIM)).toEqual([
      { talla: "S", varianteId: null },
      { talla: "M", varianteId: negM.id },
      { talla: "L", varianteId: null },
    ]);
    // Negro sin nada: el primer color que tiene algo es el beige.
    const sinNegro = { ...ficha, variantes: ficha.variantes.map((v) => (v.color === "NEG" ? { ...v, total: 0 as const, stock: { [TRU]: 0 as const, [LIM]: 0 as const } } : v)) };
    expect(tallasRapidas(sinNegro, TRU)).toEqual([
      { talla: "S", varianteId: beiS.id },
      { talla: "M", varianteId: null },
    ]);
    // Nada en ninguna tienda: no hay «Agregar».
    expect(tallasRapidas({ ...ficha, variantes: ficha.variantes.map((v) => ({ ...v, total: 0 as const, stock: {} })) }, null)).toEqual([]);
  });

  it("«Combínalo con»: el PRIMER look que la lleva y sus otras prendas, como las trae el catálogo; sin look, nada", () => {
    const prenda = (id: string) => ({ id, nombre: `Prenda ${id.slice(-1)}` }) as Prenda;
    const pieza = (id: string, posicion: number) => ({ posicion, prenda: { id } });
    const look = (id: string, ids: string[]) => ({ id, nombre: `Look ${id}`, piezas: ids.map(pieza) }) as unknown as Look;
    const [A, B, C, D] = ["a", "b", "c", "d"].map((x) => `00000000-0000-4000-8000-00000000000${x}`);
    const catalogo = [prenda(A), prenda(B), prenda(C)];
    const looks = [look("1", [B, C]), look("2", [A, B, D]), look("3", [A, C])];
    // A está en los looks 2 y 3: manda el 2 (el primero), y D ya no se ve (no está en el catálogo).
    expect(combinaCon(looks, A, catalogo)).toEqual({ look: looks[1], prendas: [prenda(B)] });
    expect(combinaCon(looks, C, catalogo)?.prendas.map((p) => p.id)).toEqual([B]);
    expect(combinaCon(looks, D, catalogo)?.prendas.map((p) => p.id)).toEqual([A, B]);
    // Sin un look que la lleve, o si las otras prendas del look ya no se ven, la sección no sale.
    expect(combinaCon(looks, "00000000-0000-4000-8000-00000000000e", catalogo)).toBeNull();
    expect(combinaCon([look("4", [A, D])], A, catalogo)).toBeNull();
    expect(combinaCon([], A, catalogo)).toBeNull();
  });
});

describe("«También te puede gustar» llena su fila (2026-10-16)", () => {
  const FOTO_X = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/x.jpg";
  const prenda = (id: string, prefijo: string, conFoto = true) =>
    ({ id, nombre: id, categoria: { nombre: `Cat ${prefijo}`, prefijo }, colores: [], fotos: conFoto ? [FOTO_X] : [] }) as unknown as Prenda;
  const emma = { id: "emma", categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" } };
  // CMS y TOP son de «Arriba» (ropa); FAL, de «Abajo» (ropa); ARE, de «Bisutería y belleza» (accesorios).
  const catalogo = [
    prenda("aretes", "ARE"),
    prenda("falda", "FAL"),
    prenda("top", "TOP"),
    prenda("camisa-sin-foto", "CMS", false),
    prenda("emma", "CMS"),
    prenda("camisa", "CMS"),
  ];
  const ids = (r: { prendas: Prenda[] }) => r.prendas.map((p) => p.id);

  it("primero su categoría (con foto adelante), después su grupo, su menú y lo demás; nunca ella misma", () => {
    const r = parecidasA(emma, catalogo);
    expect(ids(r)).toEqual(["camisa", "camisa-sin-foto", "top", "falda", "aretes"]);
    expect(r.ceja).toBe("Sigue mirando");
  });

  it("la ceja dice de dónde salen y «Ver todo» lleva a eso mismo: su categoría, su grupo o toda la tienda", () => {
    expect(parecidasA(emma, catalogo, { cuantas: 2 })).toMatchObject({ ceja: "Camisas y Blusas", ver: { categoria: "CMS", grupo: null } });
    expect(parecidasA(emma, catalogo, { cuantas: 3 })).toMatchObject({ ceja: "Blusas/Tops", ver: { categoria: null, grupo: "arriba" } });
    expect(parecidasA(emma, catalogo)).toMatchObject({ ceja: "Sigue mirando", ver: { categoria: null, grupo: null } });
  });

  it("no repite lo que ya sale en «Combínalo con», y respeta cuántas caben", () => {
    expect(ids(parecidasA(emma, catalogo, { fuera: ["camisa", "top"] }))).toEqual(["camisa-sin-foto", "falda", "aretes"]);
    expect(parecidasA(emma, catalogo, { cuantas: 1 }).prendas).toHaveLength(1);
    expect(parecidasA(emma, [prenda("emma", "CMS")]).prendas).toEqual([]);
  });

  it("una prenda sin categoría se completa con lo demás, en el orden del catálogo y con foto adelante", () => {
    const r = parecidasA({ id: "x", categoria: null }, catalogo);
    expect(ids(r)).toEqual(["aretes", "falda", "top", "emma", "camisa", "camisa-sin-foto"]);
    expect(r.ceja).toBe("Sigue mirando");
  });
});

describe("las promesas junto al botón (2026-10-16)", () => {
  it("con los plazos de la ayuda: separar sin pagar, recoger en tu tienda y cambiar en cualquier tienda CAYLA", () => {
    const [separar, recoger, cambiar] = promesasDeCompra({ ...PLAZOS_SIN_DATOS, diasParaRecoger: 7, diasParaCambiar: 15 });
    expect(separar).toEqual({
      icono: "chat",
      titulo: "Separas sin pagar en la web",
      texto: "La tienda te confirma por WhatsApp y coordinas el pago con ella.",
    });
    expect(recoger).toEqual({ icono: "tienda", titulo: "Recoges en tu tienda", texto: "Hasta 7 días después de pagar." });
    expect(cambiar).toEqual({ icono: "traslado", titulo: "Cambias en cualquier tienda CAYLA", texto: "Tienes 15 días, con tu boleta y la etiqueta puesta." });
    expect(promesasDeCompra({ ...PLAZOS_SIN_DATOS, diasParaRecoger: 1, diasParaCambiar: 1 }).map((p) => p.texto).slice(1)).toEqual([
      "Hasta 1 día después de pagar.",
      "Tienes 1 día, con tu boleta y la etiqueta puesta.",
    ]);
  });

  it("sin la base, sin número: nunca un plazo inventado", () => {
    const textos = promesasDeCompra(PLAZOS_SIN_DATOS).map((p) => p.texto);
    expect(textos).toEqual([
      "La tienda te confirma por WhatsApp y coordinas el pago con ella.",
      "En la tienda que elegiste, después de pagar.",
      "Con tu boleta y la etiqueta puesta. El plazo va impreso en tu boleta.",
    ]);
    expect(textos.join(" ")).not.toMatch(/\d/);
  });
});
