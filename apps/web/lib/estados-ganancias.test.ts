import { describe, expect, it } from "vitest";
import { lecturaDeGanancias, libroDeGanancias, montosDeGanancias, partesDeGanancias, tituloDeLasPartes } from "./estados-ganancias";
import { altoDeColumna, anchoDeFila, chipContraAnterior, pasosDelLibro, textoDeVerMas, textoDelLibro } from "./estados-partes";
import { franjaDelPeriodo, geometriaDeLinea } from "./estados-linea";
import { periodoDe } from "./estados-periodo";
import { soles } from "./flujo-caja-reglas";
import type { FilaER } from "./resultados-reglas";

const HOY = "2026-11-05";
const fila = (o: Partial<FilaER> = {}): FilaER => ({
  ubicacionId: null,
  unidad: "consolidado",
  nombre: "CAYLA",
  orden: 0,
  ventas: 10000,
  costo: 4000,
  fletes: 100,
  mermas: 50,
  margen: 5850,
  planilla: 2000,
  depreciacion: 300,
  gastos: 1000,
  resultado: 2550,
  igvVentas: 1800,
  detalleGastos: [
    { cuenta: "635", nombre: "Alquileres", monto: 800 },
    { cuenta: "637", nombre: "Publicidad", monto: 200 },
  ],
  detalleMermas: [],
  sinCosto: 0,
  mermasSinCosto: 0,
  descuadres: 0,
  planillaVisible: true,
  planillaNota: null,
  planillaEstimada: 0,
  planillaAlCierre: 0,
  planillaPersonas: 0,
  planillaPorSede: [],
  ...o,
}) as FilaER;

const OCT = periodoDe("2026-10-01", "2026-10-31", HOY);
const params = (f: FilaER, comparadas: { etiqueta: string; fila: FilaER | null }[] = []) => ({ fila: f, ppto: [], datos: [f], veCadaSede: false, comparadas, etiquetaActual: "Oct", periodo: OCT });

describe("los montos siempre suman", () => {
  it("lo vendido menos los cuatro gastos da la ganancia", () => {
    const m = montosDeGanancias(fila());
    expect(m).toEqual({ ventas: 10000, mercaderia: 4150, sueldos: 2000, local: 800, otros: 500, resultado: 2550 });
    expect(m.ventas - m.mercaderia - m.sueldos - m.local - m.otros).toBe(m.resultado);
  });

  it("lo que no se nombra cae en otros gastos y sigue sumando", () => {
    const f = fila({ resultado: 2000 });
    const m = montosDeGanancias(f);
    expect(m.ventas - m.mercaderia - m.sueldos - m.local - m.otros).toBe(2000);
    expect(m.otros).toBe(1050);
  });

  it("el libro del contador da lo mismo", () => {
    const l = libroDeGanancias(fila());
    expect(l.map((x) => x.nombre)).toEqual(["Ventas netas", "Costo de ventas", "Utilidad bruta", "Gastos de personal", "Local y servicios", "Otros gastos", "Resultado del período"]);
    expect(l[2]!.valor).toBe(5850);
    expect(l[2]!.valor + l[3]!.valor + l[4]!.valor + l[5]!.valor).toBe(l[6]!.valor);
  });
});

describe("las cinco partes", () => {
  it("con ganancia, la barra suma lo vendido", () => {
    const p = partesDeGanancias(params(fila()));
    expect(p.map((x) => x.clave)).toEqual(["mercaderia", "sueldos", "local", "otros", "resultado"]);
    expect(p.reduce((a, x) => a + x.enBarra, 0)).toBe(10000);
    expect(p[4]).toMatchObject({ nombre: "Te quedó", tono: "bien", texto: soles(2550), sub: "26 % de lo vendido" });
    expect(p[0]).toMatchObject({ sub: "42 % de lo vendido", cifra: 4150 });
    expect(p[0]!.filas.map((x) => x.nombre)).toEqual(["La ropa vendida", "Fletes de la mercadería", "Prendas perdidas o dañadas"]);
    expect(p[3]!.filas.map((x) => x.nombre)).toEqual(["Publicidad, envíos y comisiones", "Desgaste de máquinas y muebles"]);
  });

  it("con pérdida, lo que faltó tiene tarjeta pero no entra a la barra: la barra es lo que se gastó", () => {
    const f = fila({ ventas: 5000, resultado: -2450 });
    const p = partesDeGanancias(params(f));
    expect(p[4]).toMatchObject({ nombre: "Perdiste", tono: "mal", enBarra: 0, cifra: -2450, texto: soles(2450) });
    expect(p.reduce((a, x) => a + x.enBarra, 0)).toBe(7450);
    expect(tituloDeLasPartes(f)).toBe(`No alcanzó: vendiste ${soles(5000)} y gastaste ${soles(7450)}`);
  });

  it("lo que no pasó no se dibuja, salvo lo que quedó, que es la respuesta", () => {
    const f = fila({ planilla: 0, detalleGastos: [{ cuenta: "637", nombre: "Publicidad", monto: 200 }], resultado: 5350 });
    expect(partesDeGanancias(params(f)).map((x) => x.clave)).toEqual(["mercaderia", "otros", "resultado"]);
    const nada = fila({ ventas: 0, costo: 0, fletes: 0, mermas: 0, planilla: 0, depreciacion: 0, detalleGastos: [], resultado: 0 });
    expect(partesDeGanancias(params(nada)).map((x) => x.clave)).toEqual(["resultado"]);
  });

  it("lo devuelto que pasa a los gastos suma, y se dice", () => {
    const p = partesDeGanancias(params(fila({ depreciacion: 0, detalleGastos: [{ cuenta: "637", nombre: "Publicidad", monto: -200 }], resultado: 4050 })));
    expect(p.find((x) => x.clave === "otros")).toMatchObject({ nombre: "Otros a favor", enBarra: 0, texto: `+${soles(200)}`, tono: "bien", cifra: 200 });
  });

  it("sin ventas no hay porcentajes y el título habla de lo gastado", () => {
    const f = fila({ ventas: 0, costo: 0, fletes: 0, mermas: 0, resultado: -3300, unidad: "empresa" });
    expect(partesDeGanancias(params(f))[0]!.sub).toBeUndefined();
    expect(tituloDeLasPartes(f)).toBe(`En qué se gastó: ${soles(3300)}`);
  });

  it("lo que no vende no dice que le faltó: dice lo que costó", () => {
    const f = fila({ ventas: 0, costo: 0, fletes: 0, mermas: 0, resultado: -3300, unidad: "empresa" });
    expect(partesDeGanancias(params(f)).at(-1)).toMatchObject({ nombre: "Costó", tono: undefined, cifra: -3300 });
  });

  it("mirando CAYLA entera, lo que quedó y los sueldos se abren por sede", () => {
    const tienda = fila({ unidad: "tienda", nombre: "Tienda Lima", ubicacionId: "u1", resultado: 3000, planilla: 1500 });
    const empresa = fila({ unidad: "empresa", nombre: "De la empresa", resultado: -450, planilla: 500 });
    const p = partesDeGanancias({ ...params(fila()), datos: [fila(), tienda, empresa], veCadaSede: true });
    expect(p[4]!.filas).toEqual([
      { nombre: "Lima", valor: 3000 },
      { nombre: "Empresa", valor: -450 },
    ]);
    expect(p[1]!.filas).toEqual([
      { nombre: "Lima", valor: 1500 },
      { nombre: "Empresa", valor: 500 },
    ]);
  });

  it("una sede que estima sueldos separa lo pagado de lo estimado", () => {
    const f = fila({ planillaEstimada: 500, planillaNota: "Incluye lo que corresponde pagar hasta hoy." });
    const p = partesDeGanancias(params(f));
    expect(p[1]!.filas).toEqual([
      { nombre: "Ya pagado", valor: 1500 },
      { nombre: "Por pagar, estimado", valor: 500 },
    ]);
    expect(p[1]!.aviso).toBe("Incluye lo que corresponde pagar hasta hoy.");
  });

  it("prendas vendidas sin costo: se dice", () => {
    expect(partesDeGanancias(params(fila({ sinCosto: 3 })))[0]!.aviso).toBe("Hay 3 prendas vendidas sin costo: esta cifra se queda corta.");
  });

  it("las columnas van de la más vieja a la de ahora, y el chip compara con la de al lado", () => {
    const p = partesDeGanancias(params(fila(), [{ etiqueta: "Ago", fila: fila({ resultado: 1000 }) }, { etiqueta: "Sep", fila: fila({ resultado: 2000 }) }]));
    expect(p[4]!.columnas.map((c) => [c.etiqueta, c.valor, c.actual])).toEqual([
      ["Ago", 1000, false],
      ["Sep", 2000, false],
      ["Oct", 2550, true],
    ]);
    expect(p[4]!.chip).toEqual({ texto: `${soles(550)} más que septiembre`, tono: "bien" });
    // Un gasto que sube no es ni bueno ni malo por sí solo.
    expect(p[1]!.chip).toEqual({ texto: "Igual que septiembre", tono: null });
  });

  it("un período anterior que no se pudo leer no se dibuja: no es un cero", () => {
    const p = partesDeGanancias(params(fila(), [{ etiqueta: "Sep", fila: null }]));
    expect(p[4]!.columnas).toHaveLength(1);
    expect(p[4]!.chip).toBeNull();
  });
});

describe("lo que dice la pantalla", () => {
  it("una ganancia", () => {
    const l = lecturaDeGanancias(fila(), fila({ resultado: 2000 }), OCT);
    expect(l).toMatchObject({ valor: 2550, mal: false, frase: "Ganaste en octubre: te quedó el 26 % de lo que vendiste." });
    expect(l.chip).toEqual({ texto: `${soles(550)} más que septiembre`, tono: "bien" });
  });

  it("una pérdida", () => {
    const l = lecturaDeGanancias(fila({ resultado: -500 }), null, OCT);
    expect(l).toMatchObject({ valor: -500, mal: true, frase: `Perdiste en octubre: por cada ${soles(100)} que vendiste, faltaron ${soles(5)}.`, chip: null });
  });

  it("una pérdida mayor que lo vendido se sigue diciendo en soles, sin un porcentaje raro", () => {
    expect(lecturaDeGanancias(fila({ ventas: 100, resultado: -177 }), null, OCT).frase).toBe(`Perdiste en octubre: por cada ${soles(100)} que vendiste, faltaron ${soles(177)}.`);
  });

  it("quedó más de lo vendido: se dice por qué", () => {
    expect(lecturaDeGanancias(fila({ ventas: 100, costo: 0, fletes: 0, mermas: 0, planilla: 0, resultado: 150 }), null, OCT).frase).toBe("Ganaste en octubre: te quedó más de lo que vendiste, por ajustes a favor que no son ventas.");
  });

  it("otras fechas se dicen como son", () => {
    expect(lecturaDeGanancias(fila(), null, periodoDe("2026-10-05", "2026-10-20", HOY)).frase).toBe("Ganaste del 5 al 20 de octubre: te quedó el 26 % de lo que vendiste.");
  });

  it("sin nada no se afirma que se ganó", () => {
    const vacia = fila({ ventas: 0, costo: 0, fletes: 0, mermas: 0, planilla: 0, depreciacion: 0, detalleGastos: [], resultado: 0 });
    expect(lecturaDeGanancias(vacia, null, OCT)).toMatchObject({ valor: 0, mal: false, frase: "No hubo ventas ni gastos en octubre.", chip: null, nota: null });
    expect(lecturaDeGanancias(null, null, OCT).frase).toBe("Todavía no hay ventas ni gastos en octubre.");
  });

  it("lo que no vende no sale en rojo: es lo que costó", () => {
    const f = fila({ ventas: 0, costo: 0, fletes: 0, mermas: 0, resultado: -3300, unidad: "empresa" });
    expect(lecturaDeGanancias(f, null, OCT)).toMatchObject({ valor: -3300, mal: false, frase: "La empresa no vende: estos gastos los cubren las tiendas." });
  });

  it("el mes de hoy se compara a la misma fecha", () => {
    const l = lecturaDeGanancias(fila(), fila({ resultado: 2000 }), periodoDe("2026-11-01", HOY, HOY));
    expect(l.chip!.texto).toBe(`${soles(550)} más que octubre a esta fecha`);
  });
});

describe("la razón de la cifra", () => {
  const nota = (f: FilaER, a: FilaER | null) => lecturaDeGanancias(f, a, OCT).nota;
  it("cuánto hacía falta para no perder", () => {
    expect(nota(fila({ ventas: 5000, costo: 2500, fletes: 0, mermas: 0, resultado: -300 }), null)).toBe(`Para no perder hacía falta vender unos ${soles(5600)}. Vendiste ${soles(5000)}.`);
  });
  it("cuando la mercadería ya se comió lo vendido", () => {
    expect(nota(fila({ ventas: 1000, costo: 1200, fletes: 0, mermas: 0, resultado: -1800 }), null)).toBe(`Lo que costó la mercadería ya pasa lo que vendiste: ${soles(1200)} contra ${soles(1000)}.`);
  });
  it("sin nada con qué comparar", () => {
    expect(nota(fila(), null)).toBe(`Te quedaron ${soles(2550)} de ${soles(10000)} vendidos.`);
  });
  it("ventas contra mercadería", () => {
    const antes = fila({ ventas: 8000, costo: 3500, fletes: 0, mermas: 0 });
    expect(nota(fila(), antes)).toBe("Las ventas subieron 25 % y la mercadería 19 %: cada sol vendido te dejó un poco más.");
    expect(nota(fila({ costo: 5000, fletes: 0, mermas: 0 }), antes)).toBe("Las ventas subieron 25 % y la mercadería 43 %: cada sol vendido te costó un poco más.");
    expect(nota(fila({ costo: 3000, fletes: 0, mermas: 0 }), antes)).toBe("Las ventas subieron 25 % y la mercadería bajó 14 %.");
    expect(nota(fila({ costo: 4375, fletes: 0, mermas: 0 }), antes)).toBe("Las ventas y la mercadería subieron lo mismo: 25 %.");
    expect(nota(fila({ ventas: 6000 }), antes)).toBe("Las ventas bajaron 25 % frente a septiembre.");
    expect(nota(fila({ ventas: 8000 }), antes)).toBe("Las ventas se mantuvieron frente a septiembre.");
    expect(lecturaDeGanancias(fila({ ventas: 8000 }), antes, periodoDe("2026-10-05", "2026-10-20", HOY)).nota).toBe("Las ventas se mantuvieron frente al período anterior.");
  });
});

it("lo que ofrece «Ver más» se dice", () => {
  expect(textoDeVerMas([])).toBeNull();
  expect(textoDeVerMas(["las sedes"])).toBe("Ver más: las sedes");
  expect(textoDeVerMas(["lo planeado", "las sedes", "las campañas"])).toBe("Ver más: lo planeado, las sedes y las campañas");
});

describe("el libro", () => {
  const pasos = pasosDelLibro([
    { nombre: "Ventas", valor: 100, tipo: "normal" },
    { nombre: "Costo", valor: -40, tipo: "normal" },
    { nombre: "Bruta", valor: 60, tipo: "total" },
    { nombre: "Gastos", valor: -80, tipo: "normal" },
    { nombre: "Resultado", valor: -20, tipo: "total" },
  ]);
  it("cada paso empieza donde terminó el anterior", () => {
    const escala = (x: number) => ((x + 20) / 120) * 100;
    expect(pasos[0]).toMatchObject({ desde: escala(0), ancho: escala(100) - escala(0) });
    expect(pasos[1]!.desde).toBeCloseTo(escala(60));
    expect(pasos[1]!.ancho).toBeCloseTo(escala(100) - escala(60));
    expect(pasos[3]!.desde).toBeCloseTo(escala(-20));
  });
  it("un total nace en cero y su color dice cómo terminó", () => {
    expect(pasos[4]!.desde).toBeCloseTo(0);
    expect(pasos[4]!.color).toBe("var(--color-rojo)");
    expect(pasos[2]!.color).toBe("var(--color-verde)");
    expect(pasos[1]!.color).toBe("var(--color-rojo)");
  });
  it("sin movimiento no se rompe", () => {
    expect(pasosDelLibro([{ nombre: "Ventas", valor: 0, tipo: "normal" }])[0]!.ancho).toBe(0);
  });
  it("las cifras", () => {
    expect(textoDelLibro(1234.4)).toBe("1,234");
    expect(textoDelLibro(-1234.4)).toBe("−1,234");
  });
});

describe("el detalle", () => {
  it("las barritas", () => {
    expect(anchoDeFila(50, [{ nombre: "a", valor: 100 }, { nombre: "b", valor: -50 }])).toBe(50);
    expect(anchoDeFila(0, [])).toBe(0);
    expect(altoDeColumna(100, [{ etiqueta: "a", valor: 100, actual: true }])).toBe(72);
    expect(altoDeColumna(0, [{ etiqueta: "a", valor: 100, actual: true }])).toBe(4);
  });
  it("el chip sin nada con qué comparar", () => {
    expect(chipContraAnterior([{ etiqueta: "a", valor: 1, actual: true }], "x", true, soles)).toBeNull();
    expect(chipContraAnterior([{ etiqueta: "a", valor: 5, actual: false }, { etiqueta: "b", valor: 1, actual: true }], "x", true, soles)).toEqual({ texto: `${soles(4)} menos que x`, tono: "mal" });
    expect(chipContraAnterior([{ etiqueta: "a", valor: 5, actual: false }, { etiqueta: "b", valor: 1, actual: true }], "x", false, soles)!.tono).toBe("bien");
  });
});

describe("la línea", () => {
  it("con menos de dos meses no hay línea", () => {
    expect(geometriaDeLinea([])).toBeNull();
    expect(geometriaDeLinea([5])).toBeNull();
  });
  it("cada mes cae en su lugar y más arriba cuanto más vale", () => {
    const g = geometriaDeLinea([100, 300, 200])!;
    expect(g.puntos.map((p) => Math.round(p.x))).toEqual([17, 50, 83]);
    expect(g.puntos[1]!.y).toBeLessThan(g.puntos[2]!.y);
    expect(g.puntos[2]!.y).toBeLessThan(g.puntos[0]!.y);
    expect(g.cero).toBeNull();
    expect(g.trazo.startsWith("M0,")).toBe(true);
    expect(g.area.endsWith("Z")).toBe(true);
  });
  it("con un mes en pérdida se dibuja el cero", () => {
    const g = geometriaDeLinea([-100, 300])!;
    expect(g.cero).toBeGreaterThan(g.puntos[1]!.y);
    expect(g.cero).toBeLessThan(g.puntos[0]!.y);
  });
  it("todos iguales no rompen la cuenta", () => {
    for (const p of geometriaDeLinea([0, 0, 0])!.puntos) expect(Number.isFinite(p.y)).toBe(true);
  });
  it("la franja de unas fechas", () => {
    const meses = ["2026-09", "2026-10", "2026-11"];
    const f = franjaDelPeriodo(meses, "2026-10-01", "2026-10-31")!;
    expect(f.de).toBeCloseTo(100 / 3);
    expect(f.a).toBeCloseTo(200 / 3);
    expect(franjaDelPeriodo(meses, "2025-01-01", "2026-09-30")!.de).toBe(0);
    expect(franjaDelPeriodo(meses, "2025-01-01", "2025-02-01")).toBeNull();
  });
});
