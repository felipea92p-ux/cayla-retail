import { describe, expect, it } from "vitest";
import { armarPropuesta, type PropuestaMix } from "./mix-piso";
import type { LecturaDelPiso } from "./piso-plan";
import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";
import {
  ariaDeHoy,
  ariaDeLaPropuesta,
  armarRieles,
  bloqueLibre,
  descripcionDelLlenado,
  ariaDeLasFichasDeHoy,
  detalleDeFila,
  escalaEnPerchas,
  etiquetaDeChipHoy,
  etiquetaDeCifra,
  fraseDeEstado,
  leyendaDeGrupo,
  lineaDeFicha,
  libresDelRiel,
  MAX_PERCHAS,
  MINIMO_VISIBLE,
  MIN_PERCHAS_PARA_ROTULO,
  nombreCorto,
  notaDeEscala,
  notaDeSinGrupo,
  ocupadoEs,
  panelDelPorQue,
  perchasDe,
  rotuloCabe,
  subtituloDeHoy,
  subtituloDeLaPropuesta,
  textoDelPorQue,
  unidadDePercha,
  UNIDADES_DE_PERCHA,
} from "./plan-piso-percha";

// La propuesta real de AQP (la de la captura de Felipe): 78 colgadas de 1,800, 5 ventas confirmadas y 210 sin registrar, sin cuadrar.
const GRUPOS: GrupoMix[] = [
  { clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", rol: "destino", enRiel: true, orden: 10 },
  { clave: "jeans", nombre: "Jeans", rol: "destino", enRiel: true, orden: 20 },
  { clave: "pantalones_faldas_shorts", nombre: "Pantalones, faldas y shorts", rol: "rutina", enRiel: true, orden: 30 },
  { clave: "vestidos_conjuntos", nombre: "Vestidos, conjuntos y enterizos", rol: "ocasional", enRiel: true, orden: 40 },
  { clave: "bodys_corsets_lenceria", nombre: "Bodys, corsets y lencería", rol: "ocasional", enRiel: true, orden: 50 },
  { clave: "abrigo_y_capas", nombre: "Abrigo y capas", rol: "estacional", enRiel: true, orden: 60 },
  { clave: "accesorios_de_impulso", nombre: "Accesorios de impulso y caja", rol: "conveniencia", enRiel: false, orden: 70 },
  { clave: "bolsos_y_calzado", nombre: "Bolsos y calzado", rol: "ocasional", enRiel: false, orden: 80 },
];
const CLAVES = GRUPOS.map((g) => g.clave);
const CATEGORIAS: CategoriaMix[] = CLAVES.map((clave, i) => ({ categoriaId: `c-${clave}`, categoria: `Categoría ${i}`, prefijo: null, familia: "indumentaria", grupoClave: clave, confirmada: false, confirmadaEn: null, version: 1 }));
const COLGADAS: Record<string, number> = { polos_tops_blusas: 30, jeans: 3, pantalones_faldas_shorts: 14, vestidos_conjuntos: 9, bodys_corsets_lenceria: 6, abrigo_y_capas: 16, accesorios_de_impulso: 11, bolsos_y_calzado: 4 };
const CONFIRMADAS: Record<string, number> = { polos_tops_blusas: 2, pantalones_faldas_shorts: 1, vestidos_conjuntos: 1, abrigo_y_capas: 1 };
const ANOTADAS: Record<string, number> = { polos_tops_blusas: 90, jeans: 12, pantalones_faldas_shorts: 50, vestidos_conjuntos: 30, bodys_corsets_lenceria: 8, abrigo_y_capas: 20 };

function aqp(extra: Partial<LecturaDelPiso> = {}, capacidad: number | null = 1800): PropuestaMix {
  const lectura: LecturaDelPiso = {
    ubicacionId: "sede", separaPiso: true, cuadradoEn: null, hoy: "2026-10-10", dias: 14,
    tallas: CLAVES.map((clave, i) => ({ varianteId: `v${i}`, productoId: `p${i}`, referencia: "R", categoriaId: `c-${clave}`, tallaId: null, talla: null, colorCodigo: null, color: null, colorHex: null, familiaColor: null, retirada: false, fotoUrl: null, pisoLibre: COLGADAS[clave] ?? 0, almacenLibre: 0, enCamino: 0, vendidasHoy: 0, vendidasAyer: 0, vendidas14: 0 })),
    ventas: CLAVES.map((clave) => ({ categoriaId: `c-${clave}`, tallaId: null, talla: null, familiaColor: null, escaneadas: CONFIRMADAS[clave] ?? 0, anotadas: ANOTADAS[clave] ?? 0 })),
    anotadasRecientes: [],
    curvas: [],
    ...extra,
  };
  return armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura, capacidad, codigoSede: "aqp" });
}

describe("la unidad de una percha (cuántas prendas vale cada una)", () => {
  it("las tres sedes: AQP 50, TRU 20 y LIM 5, siempre con 40 perchas o menos", () => {
    expect(unidadDePercha(1800)).toBe(50);
    expect(unidadDePercha(600)).toBe(20);
    expect(unidadDePercha(180)).toBe(5);
  });

  it("es la MENOR unidad con la que el riel cabe en el máximo de perchas, y el riel entero nunca pasa de ese máximo si hay unidad que lo logre", () => {
    for (const cap of [1, 40, 41, 100, 180, 600, 1000, 1800, 2000, 2500, 3999, 4000]) {
      const u = unidadDePercha(cap);
      expect(UNIDADES_DE_PERCHA as readonly number[]).toContain(u);
      expect(cap / u).toBeLessThanOrEqual(MAX_PERCHAS);
      const menor = UNIDADES_DE_PERCHA.filter((x) => x < u).pop();
      if (menor !== undefined) expect(cap / menor).toBeGreaterThan(MAX_PERCHAS);
    }
  });

  it("un riel enorme usa la unidad mayor (aunque pase del máximo), y lo que no es una cuenta usa 50", () => {
    expect(unidadDePercha(100000)).toBe(100);
    expect(unidadDePercha(0)).toBe(50);
    expect(unidadDePercha(-5)).toBe(50);
    expect(unidadDePercha(Number.NaN)).toBe(50);
    expect(unidadDePercha(Number.POSITIVE_INFINITY)).toBe(50);
  });
});

describe("las perchas de un grupo", () => {
  it("entera cuando es justa, y una angosta proporcional cuando sobra", () => {
    expect(perchasDe(100, 50)).toEqual({ perchas: 2, llenas: 2, resto: 0 });
    const r = perchasDe(30, 50);
    expect(r.llenas).toBe(0);
    expect(r.resto).toBeCloseTo(0.6, 9);
    expect(r.perchas).toBeCloseTo(0.6, 9);
    const m = perchasDe(788, 50);
    expect(m.llenas).toBe(15);
    expect(m.resto).toBeCloseTo(0.76, 9);
  });

  it("una sobra muy chica no dibuja una percha de 1 px, pero un grupo con prendas nunca desaparece", () => {
    expect(perchasDe(52, 50).resto).toBe(0); // 0.04 de una percha: ruido
    expect(perchasDe(52, 50).llenas).toBe(1);
    expect(perchasDe(1, 50).resto).toBe(MINIMO_VISIBLE); // la única prenda del grupo se ve
    expect(perchasDe(1, 50).llenas).toBe(0);
  });

  it("más prendas nunca dibujan un tramo MÁS angosto: 1, 2 o 3 prendas no son más anchas que 6 (revisión 2026-10-11)", () => {
    let anterior = 0;
    for (let prendas = 1; prendas <= 50; prendas++) {
      const { perchas, llenas, resto } = perchasDe(prendas, 50);
      const dibujada = llenas + resto;
      expect(dibujada, `${prendas} prendas`).toBeGreaterThanOrEqual(anterior);
      anterior = dibujada;
      expect(perchas).toBeCloseTo(prendas / 50, 9);
    }
  });

  it("sin prendas no hay percha, y lo que no es una cuenta cuenta cero", () => {
    for (const x of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(perchasDe(x, 50)).toEqual({ perchas: 0, llenas: 0, resto: 0 });
  });

  it("las 788 de Polos con la unidad de AQP suman casi 16 perchas y 1,800 son 36", () => {
    expect(perchasDe(1800, 50).llenas).toBe(36);
    expect(perchasDe(788, 50).perchas).toBeCloseTo(15.76, 9);
  });
});

describe("contra qué se miden los dos rieles, y lo que queda libre", () => {
  it("la capacidad, si ninguno suma más que ella", () => {
    expect(escalaEnPerchas(1800, [78, 1800], 50)).toBe(36);
  });

  it("si hoy cuelga más de lo que cabe, los dos rieles se miden contra eso", () => {
    expect(escalaEnPerchas(1800, [2340, 1800], 50)).toBeCloseTo(46.8, 9);
  });

  it("lo que no es una cuenta no cambia la escala", () => {
    expect(escalaEnPerchas(600, [Number.NaN, -4, 100], 20)).toBe(30);
  });

  it("libres y de más: nunca los dos a la vez", () => {
    expect(libresDelRiel(1800, 78)).toEqual({ libres: 1722, deMas: 0 });
    expect(libresDelRiel(1800, 1800)).toEqual({ libres: 0, deMas: 0 });
    expect(libresDelRiel(1800, 2340)).toEqual({ libres: 0, deMas: 540 });
    expect(libresDelRiel(1800, -5)).toEqual({ libres: 1800, deMas: 0 });
  });
});

describe("la frase del estado, en palabras de tienda y sin afirmar lo que nadie ha contado", () => {
  it("sin cuadrar dice «estaría» y aclara que falta contar (AQP: 78 de 1,800 = 4 %)", () => {
    expect(fraseDeEstado({ colgadas: 78, capacidad: 1800, cuadrado: false })).toEqual({
      antes: "Tu riel estaría casi vacío (",
      destacado: "4\u00a0%",
      despues: " ocupado).",
      aclaracion: "Falta contar tu piso: lo que cuelga de verdad puede ser mucho más.",
    });
  });

  it("cuadrada dice «está» y no trae aclaración", () => {
    const f = fraseDeEstado({ colgadas: 450, capacidad: 600, cuadrado: true });
    expect(f.antes).toBe("Tu riel está bastante lleno (");
    expect(f.destacado).toBe("75\u00a0%");
    expect(f.aclaracion).toBeNull();
  });

  it("el número de la frase es siempre lo OCUPADO («mucho lugar libre (23 % ocupado)», nunca «23 % libre»); lleno de verdad no es «casi lleno»; y 1 prenda no es «0 %»", () => {
    const mucho = fraseDeEstado({ colgadas: 138, capacidad: 600, cuadrado: true });
    expect([mucho.antes, mucho.destacado, mucho.despues].join("")).toBe("Tu riel está con mucho lugar libre (23\u00a0% ocupado).");
    expect(fraseDeEstado({ colgadas: 1800, capacidad: 1800, cuadrado: true }).antes).toBe("Tu riel está lleno (");
    expect(fraseDeEstado({ colgadas: 1790, capacidad: 1800, cuadrado: true }).antes).toBe("Tu riel está casi lleno (");
    expect(fraseDeEstado({ colgadas: 1, capacidad: 1800, cuadrado: false }).destacado).toBe("menos de 1\u00a0%");
    expect(ocupadoEs(0, 1800)).toBe("0\u00a0%");
    expect(ocupadoEs(1, 1800)).toBe("menos de 1\u00a0%");
    expect(ocupadoEs(78, 1800)).toBe("4\u00a0%");
    expect(ocupadoEs(5, 0)).toBe("0\u00a0%");
    expect(subtituloDeHoy({ colgadas: 1, capacidad: 1800, cuadrado: true })).toBe("menos de 1\u00a0% del riel");
  });

  it("lo que cuelga de categorías sin grupo no entra en la cuenta del riel y se dice (y con cero no se dice nada)", () => {
    expect(notaDeSinGrupo(0)).toBeNull();
    expect(notaDeSinGrupo(-2)).toBeNull();
    expect(notaDeSinGrupo(1)).toBe("No cuenta 1 prenda de categorías sin grupo: no se sabe si cuelgan en el riel.");
    expect(notaDeSinGrupo(200)).toBe("No cuenta 200 prendas de categorías sin grupo: no se sabe si cuelgan en el riel.");
  });

  it("cada tramo de llenado tiene su palabra", () => {
    expect(descripcionDelLlenado(0)).toBe("casi vacío");
    expect(descripcionDelLlenado(9)).toBe("casi vacío");
    expect(descripcionDelLlenado(10)).toBe("con mucho lugar libre");
    expect(descripcionDelLlenado(34)).toBe("con mucho lugar libre");
    expect(descripcionDelLlenado(35)).toBe("a medio llenar");
    expect(descripcionDelLlenado(64)).toBe("a medio llenar");
    expect(descripcionDelLlenado(65)).toBe("bastante lleno");
    expect(descripcionDelLlenado(89)).toBe("bastante lleno");
    expect(descripcionDelLlenado(90)).toBe("casi lleno");
    expect(descripcionDelLlenado(100)).toBe("casi lleno");
  });

  it("si cuelga más de lo que cabe lo dice con la cifra, en singular y en plural, y pide cuadrar o revisar según el caso", () => {
    const sin = fraseDeEstado({ colgadas: 2340, capacidad: 1800, cuadrado: false });
    expect(sin.antes).toBe("Según el sistema cuelgan ");
    expect(sin.destacado).toBe("540 prendas más");
    expect(sin.aclaracion).toBe("Cuadra tu piso y revisa la capacidad.");
    const con = fraseDeEstado({ colgadas: 601, capacidad: 600, cuadrado: true });
    expect(con.antes).toBe("Cuelgan ");
    expect(con.destacado).toBe("1 prenda más");
    expect(con.aclaracion).toBe("Revisa la capacidad del riel.");
  });

  it("los textos sueltos del encabezado y de cada riel", () => {
    expect(etiquetaDeCifra(false)).toBe("Según el sistema, hoy cuelgan");
    expect(etiquetaDeCifra(true)).toBe("Hoy cuelgan");
    expect(subtituloDeHoy({ colgadas: 78, capacidad: 1800, cuadrado: false })).toBe("según el sistema · 4\u00a0% del riel");
    expect(subtituloDeHoy({ colgadas: 78, capacidad: 1800, cuadrado: true })).toBe("4\u00a0% del riel");
    expect(subtituloDeLaPropuesta(1800, true)).toBe("así se repartirían tus 1,800 lugares (provisional)");
    expect(subtituloDeLaPropuesta(1800, false)).toBe("así se repartirían tus 1,800 lugares");
    expect(notaDeEscala(50)).toEqual({ antes: "Cada percha = ", unidad: "50", despues: " prendas. Una percha angosta es menos de 50." });
  });

  it("el bloque libre dice lo que queda, lo que sobra o que está lleno", () => {
    expect(bloqueLibre({ capacidad: 1800, colgadas: 78, cuadrado: false })).toEqual({ cifra: "1,722", etiqueta: "lugares libres", nota: "según el sistema · falta contar tu piso" });
    expect(bloqueLibre({ capacidad: 1800, colgadas: 78, cuadrado: true }).nota).toBe("cabe más ropa");
    expect(bloqueLibre({ capacidad: 1800, colgadas: 1799, cuadrado: true }).etiqueta).toBe("lugar libre");
    expect(bloqueLibre({ capacidad: 1800, colgadas: 1800, cuadrado: true })).toEqual({ cifra: "0", etiqueta: "lugares libres", nota: "el riel está lleno" });
    expect(bloqueLibre({ capacidad: 1800, colgadas: 2340, cuadrado: false })).toEqual({ cifra: "540", etiqueta: "prendas de más", nota: "no caben en el riel" });
  });

  it("la línea que cambia al pasar por un grupo", () => {
    const polos = { nombre: "Polos, tops y blusas", hoy: 30, propuesta: 788, propuestaPct: 43.8 };
    expect(leyendaDeGrupo(polos, true)).toEqual({ nombre: "Polos, tops y blusas", resto: " · hoy 30 → quedaría 788 (43.8\u00a0%)" });
    expect(leyendaDeGrupo({ nombre: "Jeans", hoy: 3, propuesta: 0, propuestaPct: null }, true).resto).toBe(" · hoy 3 → quedaría 0");
  });

  it("sin cuadrar, «hoy» es lo que el sistema cree y no lleva flecha (la flecha insinuaría una diferencia que la tabla no da)", () => {
    const polos = { nombre: "Polos, tops y blusas", hoy: 30, propuesta: 788, propuestaPct: 43.8 };
    expect(leyendaDeGrupo(polos, false).resto).toBe(" · según el sistema hoy 30, quedaría 788 (43.8\u00a0%)");
    expect(leyendaDeGrupo({ nombre: "Jeans", hoy: 3, propuesta: 0, propuestaPct: null }, false).resto).not.toContain("→");
  });

  it("lo que oye quien usa lector en cada ficha de «Hoy»: empieza por lo que se ve y lleva la propuesta (la línea viva ya no se anuncia sola)", () => {
    const polos = { nombre: "Polos, tops y blusas", corto: "Polos", hoy: 30, propuesta: 788, propuestaPct: 43.8 };
    expect(etiquetaDeChipHoy(polos, true)).toBe("Polos 30: Polos, tops y blusas, 30 prendas hoy; propuesta 788");
    expect(etiquetaDeChipHoy(polos, false)).toBe("Polos 30: Polos, tops y blusas, 30 prendas hoy según el sistema; propuesta 788");
    expect(etiquetaDeChipHoy({ ...polos, hoy: 1, propuesta: 0, propuestaPct: null }, true)).toBe("Polos 1: Polos, tops y blusas, 1 prenda hoy; sin propuesta");
    expect(ariaDeLasFichasDeHoy(true)).toBe("Prendas de hoy por grupo");
    expect(ariaDeLasFichasDeHoy(false)).toContain("según el sistema");
  });
});

describe("el botón «¿Por qué?» dice cuánto cuentan las ventas, sin la palabra «peso»", () => {
  it("con pocas ventas dice «casi no usa»", () => {
    expect(textoDelPorQue({ ventasConfirmadas: 5, pesoPct: 6 })).toBe("Casi no usa tus 5 ventas (6\u00a0%) · ¿Por qué?");
  });
  it("con una sola venta, en singular", () => {
    expect(textoDelPorQue({ ventasConfirmadas: 1, pesoPct: 3 })).toBe("Casi no usa tu venta (3\u00a0%) · ¿Por qué?");
  });
  it("con ventas de sobra dice «usa»", () => {
    expect(textoDelPorQue({ ventasConfirmadas: 400, pesoPct: 75 })).toBe("Usa tus 400 ventas (75\u00a0%) · ¿Por qué?");
  });
  it("las ventas sin registrar se dicen: son la razón por la que una sede con 215 ventas casi no usa las suyas", () => {
    expect(textoDelPorQue({ ventasConfirmadas: 5, pesoPct: 6, ventasSinRegistrar: 210 })).toBe("Casi no usa tus 5 ventas confirmadas (6\u00a0%): faltan registrar 210 · ¿Por qué?");
    expect(textoDelPorQue({ ventasConfirmadas: 1, pesoPct: 3, ventasSinRegistrar: 1 })).toBe("Casi no usa tu venta confirmada (3\u00a0%): faltan registrar 1 · ¿Por qué?");
    expect(textoDelPorQue({ ventasConfirmadas: 0, pesoPct: 0, ventasSinRegistrar: 40 })).toBe("Todavía sin ventas confirmadas (faltan registrar 40) · ¿Por qué?");
    expect(textoDelPorQue({ ventasConfirmadas: 5, pesoPct: 6, ventasSinRegistrar: 0 })).toBe("Casi no usa tus 5 ventas (6\u00a0%) · ¿Por qué?");
  });

  it("sin ventas lo dice claro y no inventa un porcentaje", () => {
    expect(textoDelPorQue({ ventasConfirmadas: 0, pesoPct: 0 })).toBe("Todavía sin ventas confirmadas · ¿Por qué?");
  });
});

describe("«cómo se calcula», en palabras y con los números de la propuesta real de AQP", () => {
  const p = aqp();

  it("la propuesta de prueba es la de la captura (78 colgadas, 5 confirmadas, 210 sin registrar, 6 % de peso)", () => {
    expect(p.colgadasEnElRiel).toBe(78);
    expect(p.ventasConfirmadasDelRiel).toBe(5);
    expect(p.ventasAnotadasDelRiel).toBe(210);
    expect(Math.round(p.pesoDeLaVenta * 100)).toBe(6);
    expect(p.enRiel.reduce((s, f) => s + (f.propuestaPrendas ?? 0), 0)).toBe(1800);
  });

  it("tres párrafos: de qué se mezcla, por qué las ventas pesan poco y qué todavía no se sabe", () => {
    const { parrafos } = panelDelPorQue(p, true);
    expect(parrafos).toHaveLength(3);
    expect(parrafos[0]).toBe("Cada grupo se lleva una parte de los 1,800 lugares del riel. Esa parte mezcla dos cosas: el punto de partida —lo que ofrecen Topitop, Estilos y Oechsle en ropa de mujer, ajustado al clima de tu sede— (94\u00a0%) y lo que vendiste tú (6\u00a0%).");
    expect(parrafos[1]).toContain("Tus ventas pesan poco porque solo hay 5 ventas confirmadas en 14 días.");
    expect(parrafos[1]).toContain("Las 210 ventas sin registrar todavía no cuentan.");
    expect(parrafos[1]).toContain("Con 2 ventas, «Polos, tops y blusas» saldría 40\u00a0%, pero podría ser desde 9.1\u00a0% hasta 81.6\u00a0%: casi no sabemos.");
    expect(parrafos[2]).toContain("Los 1,800 lugares son provisionales (falta contar el riel).");
    expect(parrafos[2]).toContain("Las 78 prendas de «Hoy» son lo que el sistema cree que cuelga, no lo que hay de verdad.");
  });

  it("no usa la jerga de antes: ni «industria», ni «peso de la venta», ni «muestra», ni «independientes»", () => {
    const todo = panelDelPorQue(p, true).parrafos.join(" ").toLowerCase();
    for (const jerga of ["industria", "peso de la venta", "muestra", "independientes", "wilson", "tope"]) expect(todo).not.toContain(jerga);
  });

  it("una fila por grupo del riel, con su detalle en palabras", () => {
    const { filas } = panelDelPorQue(p, true);
    expect(filas).toHaveLength(6);
    expect(filas[0]).toEqual({ clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", propuestaPct: 43.8, partidaPct: 44, ventaPct: 40, ventas: 2 });
    expect(detalleDeFila(filas[0]!)).toBe("punto de partida 44\u00a0% · tus ventas 40\u00a0% (2 ventas)");
    expect(detalleDeFila(filas[1]!)).toBe("punto de partida 10\u00a0% · tus ventas 0\u00a0% (0 ventas)");
    expect(detalleDeFila({ ...filas[0]!, ventaPct: null, ventas: 0 })).toBe("punto de partida 44\u00a0% · tus ventas: todavía ninguna");
    expect(detalleDeFila({ ...filas[2]!, ventas: 1 })).toContain("(1 venta)");
  });

  it("una sede cuadrada y con capacidad contada no dice que las cifras son provisionales ni «por cuadrar»", () => {
    const cuadrada = aqp({ cuadradoEn: "2026-10-01T15:00:00+00:00" });
    const { parrafos } = panelDelPorQue(cuadrada, false);
    expect(parrafos).toHaveLength(2);
    expect(parrafos.join(" ")).not.toContain("provisional");
    expect(parrafos.join(" ")).not.toContain("lo que el sistema cree");
  });

  it("sin ventas confirmadas lo dice y no inventa un ejemplo", () => {
    const sinVentas = aqp({ ventas: [] });
    const { parrafos } = panelDelPorQue(sinVentas, true);
    expect(parrafos[1]).toContain("Tus ventas todavía no cuentan: no hay ventas confirmadas en 14 días.");
    expect(parrafos[1]).not.toContain("pesan poco");
    expect(parrafos[1]).not.toContain("casi no sabemos");
  });

  it("la cola «casi no sabemos» solo sale cuando el rango es ancho (≥ 40 puntos); si es medio dice que ya hay una idea; si es angosto, nada", () => {
    const ancho = (desde: number, hasta: number) => {
      const base = aqp();
      const enRiel = base.enRiel.map((f, i) => (i === 0 ? { ...f, ventasConfirmadas: 30, ventaPct: 36.1, rangoDeVenta: { desde, hasta } } : f));
      return panelDelPorQue({ ...base, enRiel }, true).parrafos[1]!;
    };
    expect(ancho(9.1, 81.6)).toContain("hasta 81.6\u00a0%: casi no sabemos.");
    expect(ancho(24.8, 49.3)).toContain("hasta 49.3\u00a0%: ya hay una idea, aunque podría variar.");
    expect(ancho(30, 42)).toMatch(/hasta 42\u00a0%\.$/);
    expect(ancho(30, 42)).not.toContain("casi no sabemos");
    expect(ancho(30, 42)).not.toContain("ya hay una idea");
  });

  it("el panel nombra el punto de partida con su fuente y no afirma que «suele funcionar»", () => {
    const todo = panelDelPorQue(p, true).parrafos.join(" ");
    expect(todo).toContain("Topitop, Estilos y Oechsle");
    expect(todo).not.toContain("suele funcionar");
    expect(todo).not.toContain("lo habitual");
  });

  it("con una sola venta confirmada habla en singular y tampoco inventa un ejemplo", () => {
    const una = aqp({ ventas: [{ categoriaId: "c-jeans", tallaId: null, talla: null, familiaColor: null, escaneadas: 1, anotadas: 1 }] });
    const { parrafos } = panelDelPorQue(una, true);
    expect(parrafos[1]).toContain("hay 1 venta confirmada");
    expect(parrafos[1]).toContain("La venta sin registrar todavía no cuenta.");
    expect(parrafos[1]).not.toContain("casi no sabemos");
  });

  it("sin capacidad (la sede no la tiene medida) no escribe «de los undefined lugares»", () => {
    const sinCap = aqp({}, null);
    const { parrafos } = panelDelPorQue(sinCap, true);
    expect(parrafos.join(" ")).not.toContain("undefined");
    expect(parrafos.join(" ")).not.toContain("null");
    expect(parrafos[0]).toContain("Cada grupo se lleva una parte del riel.");
  });
});

describe("los dos rieles de una sede, listos para dibujar", () => {
  const grupos = [
    { clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", hoy: 30, propuesta: 788 },
    { clave: "jeans", nombre: "Jeans", hoy: 3, propuesta: 169 },
    { clave: "pantalones_faldas_shorts", nombre: "Pantalones, faldas y shorts", hoy: 0, propuesta: 326 },
  ];

  it("AQP: unidad 50, escala de 36 perchas, y cada tramo con su grupo y su posición", () => {
    const r = armarRieles(grupos, 1800);
    expect(r.unidad).toBe(50);
    expect(r.escala).toBe(36);
    expect(r.propuesta.map((b) => [b.clave, b.indice])).toEqual([["polos_tops_blusas", 0], ["jeans", 1], ["pantalones_faldas_shorts", 2]]);
    expect(r.propuesta[0]!.llenas).toBe(15);
    expect(r.hoy[0]!.perchas).toBeCloseTo(0.6, 9);
  });

  it("un grupo sin prendas en un riel no dibuja un poste solo, pero los demás conservan su posición (su color)", () => {
    const r = armarRieles(grupos, 1800);
    expect(r.hoy.map((b) => b.clave)).toEqual(["polos_tops_blusas", "jeans"]);
    expect(r.hoy[1]!.indice).toBe(1);
    expect(r.propuesta).toHaveLength(3);
  });

  it("los dos rieles comparten escala aunque cuelgue más de lo que cabe", () => {
    const r = armarRieles([{ clave: "a", nombre: "A", hoy: 2340, propuesta: 1800 }], 1800);
    expect(r.escala).toBeCloseTo(46.8, 9);
  });

  it("sin grupos o sin nada que dibujar devuelve rieles vacíos y no se rompe", () => {
    expect(armarRieles([], 1800)).toMatchObject({ unidad: 50, escala: 36, hoy: [], propuesta: [] });
    const r = armarRieles([{ clave: "a", nombre: "A", hoy: Number.NaN, propuesta: -3 }], 600);
    expect(r.hoy).toEqual([]);
    expect(r.propuesta).toEqual([]);
    expect(r.unidad).toBe(20);
  });
});

describe("el tramo más largo y qué tramos llevan rótulo", () => {
  it("`mayor` es el tramo más largo de los dos rieles (al menos 1) y deja que el celular achique la percha si no cabe en una fila", () => {
    const aqp1 = armarRieles([{ clave: "a", nombre: "A", hoy: 30, propuesta: 788 }, { clave: "b", nombre: "B", hoy: 3, propuesta: 169 }], 1800);
    expect(aqp1.mayor).toBeCloseTo(788 / 50, 9);
    expect(armarRieles([], 1800).mayor).toBe(1);
    expect(armarRieles([{ clave: "a", nombre: "A", hoy: 2, propuesta: 3 }], 1800).mayor).toBe(1);
  });

  it("un tramo angosto no lleva rótulo (no cabe y se vería cortado); su nombre sigue en la leyenda, el title y el aria", () => {
    expect(rotuloCabe(MIN_PERCHAS_PARA_ROTULO)).toBe(true);
    expect(rotuloCabe(MIN_PERCHAS_PARA_ROTULO - 0.01)).toBe(false);
    expect(rotuloCabe(15.76)).toBe(true);
    expect(rotuloCabe(0.1)).toBe(false);
  });
});

describe("el nombre corto con el que se rotula cada tramo", () => {
  it("lo que va antes de la primera coma o de «y»", () => {
    expect(nombreCorto("Polos, tops y blusas")).toBe("Polos");
    expect(nombreCorto("Pantalones, faldas y shorts")).toBe("Pantalones");
    expect(nombreCorto("Vestidos, conjuntos y enterizos")).toBe("Vestidos");
    expect(nombreCorto("Bodys, corsets y lencería")).toBe("Bodys");
    expect(nombreCorto("Abrigo y capas")).toBe("Abrigo");
    expect(nombreCorto("Jeans")).toBe("Jeans");
  });
  it("un nombre raro no queda vacío", () => {
    expect(nombreCorto(", algo")).toBe(", algo");
    expect(nombreCorto("  Jeans  ")).toBe("Jeans");
    expect(nombreCorto("")).toBe("");
  });
});

describe("lo que lee un lector de pantalla de cada riel (el dibujo es una imagen)", () => {
  it("«Hoy» dice las cifras y que son del sistema mientras la sede no cuadre", () => {
    expect(ariaDeHoy({ colgadas: 78, capacidad: 1800, cuadrado: false })).toBe("Hoy, según el sistema: 78 de 1,800 lugares ocupados y 1,722 libres. Falta contar el piso.");
    expect(ariaDeHoy({ colgadas: 78, capacidad: 1800, cuadrado: true })).toBe("Hoy: 78 de 1,800 lugares ocupados y 1,722 libres.");
  });
  it("si cuelga más de lo que cabe lo dice, sin «libres»", () => {
    expect(ariaDeHoy({ colgadas: 2340, capacidad: 1800, cuadrado: true })).toBe("Hoy: 2,340 de 1,800 lugares ocupados, 540 de más.");
  });
  it("«Cómo quedaría» lista los grupos con prendas y el total repartido", () => {
    expect(ariaDeLaPropuesta([{ nombre: "Polos", propuesta: 788 }, { nombre: "Jeans", propuesta: 0 }, { nombre: "Abrigo", propuesta: 1012 }], 1800)).toBe("Cómo quedaría: Polos 788, Abrigo 1,012. En total 1,800 de 1,800 lugares repartidos.");
  });
});

describe("la línea de cada ficha de «Fuera del riel»", () => {
  it("cuánto cuelga, cuánto se vende y la meta", () => {
    expect(lineaDeFicha({ colgadas: 11, ventaPct: 0, meta: { desde: 16, hasta: 18 }, noLoLleva: false })).toBe("11 prendas · vende 0\u00a0% · meta 16–18\u00a0% de la venta");
  });
  it("el porcentaje de venta lleva las ventas en que se apoya, como la tabla: un 0 sin su muestra diría «no se vende» sin saberlo", () => {
    expect(lineaDeFicha({ colgadas: 11, ventaPct: 0, ventasConfirmadas: 0, meta: { desde: 16, hasta: 18 }, noLoLleva: false })).toBe("11 prendas · vende 0\u00a0% (0 ventas) · meta 16–18\u00a0% de la venta");
    expect(lineaDeFicha({ colgadas: 4, ventaPct: 16.7, ventasConfirmadas: 1, meta: null, noLoLleva: false })).toBe("4 prendas · vende 16.7\u00a0% (1 venta)");
  });
  it("sin ventas confirmadas no inventa un porcentaje, y una sola prenda va en singular", () => {
    expect(lineaDeFicha({ colgadas: 1, ventaPct: null, meta: { desde: 6, hasta: 8 }, noLoLleva: false })).toBe("1 prenda · meta 6–8\u00a0% de la venta");
  });
  it("una sede que no lo lleva lo dice (LIM no tiene bolsos ni calzado)", () => {
    expect(lineaDeFicha({ colgadas: 0, ventaPct: null, meta: null, noLoLleva: true })).toBe("0 prendas · esta sede no lo lleva");
    // «vende 0 %» junto a «no lo lleva» es ruido: la sede ni lo tiene
    expect(lineaDeFicha({ colgadas: 0, ventaPct: 0, ventasConfirmadas: 0, meta: { desde: 6, hasta: 8 }, noLoLleva: true })).toBe("0 prendas · esta sede no lo lleva");
  });
  it("sin meta ni «no lo lleva» solo dice lo que hay", () => {
    expect(lineaDeFicha({ colgadas: 4, ventaPct: 12.5, meta: null, noLoLleva: false })).toBe("4 prendas · vende 12.5\u00a0%");
  });
});
