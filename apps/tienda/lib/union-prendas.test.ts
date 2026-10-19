import { describe, expect, it } from "vitest";
import {
  ANCHO_ESTANDAR_DE_LA_UNION,
  ANCHO_PARA_MEDIR,
  AJUSTE_MAXIMO_DE_ARRIBA,
  anchoDelBajo,
  cajaDeArribaAjustada,
  cajaDeAbajoUnida,
  direccionParaMedir,
  filaAltaDelBorde,
  FRANJAS_DEL_BAJO,
  HOLGURA_DE_LA_UNION,
  LARGO_MAXIMO_DE_ABAJO,
  LARGO_MINIMO_DE_ABAJO,
  MEDIDAS_QUE_SE_RECUERDAN,
  type MedidaDelRecorte,
  medidasATexto,
  medidasDesdeTexto,
  medirRecorte,
  SIN_MEDIDA,
  SOLAPE_DE_LA_UNION,
} from "./union-prendas";
import { ESCENA, PX_POR_CM } from "./probador";

/** Una imagen RGBA de `ancho × alto`: `prenda(x, y)` dice si ese píxel es prenda (alfa 255) o no (alfa 0). */
function imagen(ancho: number, alto: number, prenda: (x: number, y: number) => boolean): Uint8ClampedArray {
  const d = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) d[(y * ancho + x) * 4 + 3] = prenda(x, y) ? 255 : 0;
  return d;
}

/** Un polo de 100×100: el torso de x 30 a 70 hasta la fila 80, y dos mangas sueltas de 15 de ancho a cada lado que llegan hasta la fila 99. */
const polo = (x: number, y: number) => (x >= 30 && x < 70 && y < 80) || (x < 15 && y < 100) || (x >= 85 && y < 100);

describe("medirRecorte: dónde termina el torso y cuánto mide ahí", () => {
  it("el borde de abajo es el del torso, no el de las mangas sueltas que llegan más abajo", () => {
    const m = medirRecorte(imagen(100, 100, polo), 100, 100);
    expect(m.borde).toBeCloseTo(0.4, 5);
    expect(m.filaDelBorde).toBeCloseTo(0.8, 5);
  });

  it("las mangas sueltas no se suman al torso", () => {
    const m = medirRecorte(imagen(100, 100, polo), 100, 100);
    expect(m.borde).toBeLessThan(0.5);
  });

  it("la pretina de una falda es lo ancho de su parte de arriba", () => {
    // Una falda de 100×60 que se abre: la pretina mide 60 y el bajo, 100.
    const falda = (x: number, y: number) => {
      const mitad = 30 + (y / 60) * 20;
      return Math.abs(x - 50) < mitad;
    };
    const m = medirRecorte(imagen(100, 60, falda), 100, 60);
    expect(m.pretina).toBeGreaterThan(0.58);
    expect(m.pretina).toBeLessThan(0.72);
  });

  it("el cuello de una blusa no es una pretina", () => {
    // Un cuello de 10 de ancho sobre un torso de 60.
    const blusa = (x: number, y: number) => (y < 10 ? x >= 45 && x < 55 : x >= 20 && x < 80);
    expect(medirRecorte(imagen(100, 100, blusa), 100, 100).pretina).toBeNull();
  });

  it("un bajo redondeado se mide donde es más ancho, no en su última fila", () => {
    const redondeado = (x: number, y: number) => (y < 90 ? x >= 20 && x < 80 : y < 100 && Math.abs(x - 50) < 30 - (y - 89) * 3);
    const m = medirRecorte(imagen(100, 100, redondeado), 100, 100);
    expect(m.borde).toBeCloseTo(0.6, 2);
  });

  it("una imagen vacía o una que no tiene torso no se puede medir", () => {
    expect(medirRecorte(imagen(50, 50, () => false), 50, 50)).toEqual(SIN_MEDIDA);
    // Solo un hilo de 5 px de ancho: no llega a ser un torso, pero la pretina tampoco existe.
    const hilo = medirRecorte(imagen(100, 100, (x) => x >= 48 && x < 53), 100, 100);
    expect(hilo.borde).toBeNull();
    expect(hilo.pretina).toBeNull();
  });

  it("una imagen con menos bytes de los que dice no rompe nada", () => {
    expect(medirRecorte(new Uint8ClampedArray(10), 100, 100)).toEqual(SIN_MEDIDA);
    expect(medirRecorte(new Uint8ClampedArray(0), 0, 0)).toEqual(SIN_MEDIDA);
  });
});

describe("el bajo de la prenda: no siempre es recto", () => {
  // Una blusa de 100×100 con el bajo en diagonal: a la izquierda termina en la fila 70 y a la derecha, en la 90 (como la «Blusa Cuadros Coreana»).
  const diagonal = (x: number, y: number) => x >= 20 && x < 80 && y < 70 + ((x - 20) / 60) * 20;
  const recta = (x: number, y: number) => x >= 20 && x < 80 && y < 80;

  it("el perfil tiene una franja por cada pedazo del ancho y dice dónde termina la prenda ahí", () => {
    const m = medirRecorte(imagen(100, 100, diagonal), 100, 100);
    expect(m.bajo).toHaveLength(FRANJAS_DEL_BAJO);
    const con = m.bajo!.filter((v): v is number => v !== null);
    expect(Math.min(...con)).toBeLessThan(0.75);
    expect(Math.max(...con)).toBeGreaterThan(0.85);
    // A la izquierda de la prenda (x < 20) y a la derecha (x ≥ 80) no hay prenda.
    expect(m.bajo![0]).toBeNull();
    expect(m.bajo![FRANJAS_DEL_BAJO - 1]).toBeNull();
  });

  it("un bajo recto da el mismo punto alto que el bajo", () => {
    const m = medirRecorte(imagen(100, 100, recta), 100, 100);
    expect(filaAltaDelBorde(m, 0.6)).toBeCloseTo(m.filaDelBorde!, 1);
  });

  it("un bajo en diagonal: el punto alto es más alto que el bajo, y el bajo sigue siendo su punto más bajo", () => {
    const m = medirRecorte(imagen(100, 100, diagonal), 100, 100);
    // El bajo (el torso) llega hasta donde el tramo ocupa el 30 % del ancho; el punto alto, donde el bajo sube del todo.
    expect(m.filaDelBorde).toBeGreaterThan(0.78);
    expect(filaAltaDelBorde(m, 0.6)!).toBeLessThan(m.filaDelBorde! - 0.05);
  });

  it("solo mira el ancho central que se le pide: un lado más alto fuera de ese ancho no cuenta", () => {
    const m = medirRecorte(imagen(100, 100, diagonal), 100, 100);
    const angosta = filaAltaDelBorde(m, 0.3)!;
    const ancha = filaAltaDelBorde(m, 0.6)!;
    expect(ancha).toBeLessThanOrEqual(angosta);
  });

  it("una franja que termina muy arriba (un hombro, una manga) no cuenta como el bajo", () => {
    // Torso hasta la fila 90, y a la izquierda una manga corta que termina en la 30.
    const conManga = (x: number, y: number) => (x >= 35 && x < 75 && y < 90) || (x >= 20 && x < 35 && y < 30);
    const m = medirRecorte(imagen(100, 100, conManga), 100, 100);
    expect(filaAltaDelBorde(m, 0.6)!).toBeGreaterThan(0.85);
  });

  it("sin perfil o sin torso no hay punto alto: se queda el bajo de siempre", () => {
    expect(filaAltaDelBorde(SIN_MEDIDA, 0.6)).toBeNull();
    expect(filaAltaDelBorde({ filaDelBorde: 0.8, borde: 0.4, pretina: null, bajo: null }, 0.6)).toBeNull();
  });
});

describe("anchoDelBajo: el ancho de toda la zona del bajo", () => {
  it("un bajo recto ocupa el ancho de la prenda", () => {
    const m = medirRecorte(imagen(100, 100, (x, y) => x >= 20 && x < 80 && y < 80), 100, 100);
    expect(anchoDelBajo(m)!).toBeGreaterThan(0.5);
    expect(anchoDelBajo(m)!).toBeLessThanOrEqual(0.6);
  });
  it("dos piezas separadas no se suman: solo cuenta el tramo seguido más ancho", () => {
    const m: MedidaDelRecorte = { filaDelBorde: 0.9, borde: 0.2, pretina: null, bajo: Array.from({ length: FRANJAS_DEL_BAJO }, (_, i) => (i < 6 || (i >= 12 && i < 14) ? 0.9 : null)) };
    expect(anchoDelBajo(m)).toBeCloseTo(6 / FRANJAS_DEL_BAJO, 5);
  });
  it("sin perfil no hay medida", () => {
    expect(anchoDelBajo(SIN_MEDIDA)).toBeNull();
  });
});

describe("cajaDeArribaAjustada: solo crece lo dibujado demasiado chico, lo demás no se mueve", () => {
  const MINIMO = ANCHO_ESTANDAR_DE_LA_UNION * (1 - HOLGURA_DE_LA_UNION) * PX_POR_CM; // 76,5 px: la cintura más angosta de la unión
  // Una prenda de arriba de 160 px de ancho cuyo bajo ocupa `fraccion` de su ancho.
  const con = (fraccion: number, metida = false) => ({
    caja: { x: 110, y: 44, w: 160, h: 160 },
    medida: { filaDelBorde: 0.9, borde: fraccion, pretina: null, bajo: null } as MedidaDelRecorte,
    metida,
  });

  it("un bajo que ya llega a la cintura mínima no se toca: ni un píxel", () => {
    for (const bajoPx of [MINIMO, MINIMO + 0.5, 90, 100, 120, 160, 200]) expect(cajaDeArribaAjustada(con(bajoPx / 160))).toBeNull();
  });

  it("nunca encoge: una prenda ancha (oversize, casaca, cardigan) queda como está", () => {
    expect(cajaDeArribaAjustada(con(1))).toBeNull();
  });

  it("un bajo demasiado angosto hace crecer la prenda, sin pasar del tope", () => {
    const c = cajaDeArribaAjustada(con(0.25))!; // 40 px de bajo contra 76,5 de mínimo
    expect(c.w).toBeGreaterThan(160);
    expect(c.w).toBeLessThanOrEqual(Math.round(160 * AJUSTE_MAXIMO_DE_ARRIBA));
    expect(cajaDeArribaAjustada(con(0.05))!.w).toBe(Math.round(160 * AJUSTE_MAXIMO_DE_ARRIBA));
  });

  it("crece parejo (no se deforma), desde el centro de los hombros y sin subir", () => {
    const c = cajaDeArribaAjustada(con(0.3))!;
    expect(c.w / c.h).toBeCloseTo(1, 1);
    expect(Math.abs(c.x + c.w / 2 - (110 + 80))).toBeLessThanOrEqual(1);
    expect(c.y).toBe(44);
  });

  it("es continuo: justo debajo del umbral casi no cambia, y más angosto crece más", () => {
    const casi = cajaDeArribaAjustada(con((MINIMO - 1) / 160))!;
    expect(casi.w - 160).toBeLessThanOrEqual(2);
    const anchos = [0.45, 0.4, 0.35, 0.3, 0.25, 0.2].map((f) => cajaDeArribaAjustada(con(f))!.w);
    for (let i = 1; i < anchos.length; i++) expect(anchos[i]).toBeGreaterThanOrEqual(anchos[i - 1]);
  });

  it("una prenda metida, sin medida o con datos raros no se ajusta", () => {
    expect(cajaDeArribaAjustada(con(0.25, true))).toBeNull();
    expect(cajaDeArribaAjustada({ ...con(0.25), medida: null })).toBeNull();
    expect(cajaDeArribaAjustada({ ...con(0.25), medida: SIN_MEDIDA })).toBeNull();
    expect(cajaDeArribaAjustada({ ...con(0.25), caja: { x: 0, y: 0, w: 0, h: 0 } })).toBeNull();
  });

  it("usa el ancho de toda la zona del bajo, no solo el de su punta", () => {
    // Punta angosta (borde 0,2) pero zona del bajo ancha (60 % del ancho): 96 px, ya en rango: no cambia.
    const bajo = Array.from({ length: FRANJAS_DEL_BAJO }, (_, i) => (i >= 5 && i < 19 ? 0.9 : null));
    expect(cajaDeArribaAjustada({ ...con(0.2), medida: { filaDelBorde: 0.9, borde: 0.2, pretina: null, bajo } })).toBeNull();
  });
});

describe("cajaDeAbajoUnida: la pretina sigue al borde del torso, dentro de la cintura estándar", () => {
  const ESTANDAR = ANCHO_ESTANDAR_DE_LA_UNION * PX_POR_CM; // 90 px
  // La prenda de arriba, con la caja que se le da y su torso: ancho de la caja × `borde` = lo que mide su borde de abajo.
  const arribaCon = (bordePx: number) => ({ caja: { x: 66, y: 44, w: 150, h: 150 }, medida: { filaDelBorde: 0.86, borde: bordePx / 150, pretina: null, bajo: null }, metida: false });
  // La falda: su pretina mide el 80 % del ancho de su recorte, que es 1,13 veces más ancho que alto.
  const falda = { proporcion: 1.13, medida: { filaDelBorde: 0.1, borde: 0.9, pretina: 0.8, bajo: null } };

  it("un borde dentro del rango: la pretina de la falda mide lo mismo que el borde del torso", () => {
    const c = cajaDeAbajoUnida(arribaCon(90), falda)!;
    expect(Math.abs(c.w * 0.8 - 90)).toBeLessThan(1.5);
  });

  it("una blusa muy ajustada no encoge la falda más de 15 %, y una oversize no la agranda más de 15 %", () => {
    const ajustada = cajaDeAbajoUnida(arribaCon(40), falda)!;
    const oversize = cajaDeAbajoUnida(arribaCon(200), falda)!;
    expect(ajustada.w * 0.8).toBeCloseTo(ESTANDAR * (1 - HOLGURA_DE_LA_UNION), 0);
    expect(oversize.w * 0.8).toBeCloseTo(ESTANDAR * (1 + HOLGURA_DE_LA_UNION), 0);
  });

  it("la misma falda varía poco de largo al cambiar de blusa (nunca más de ±15 %)", () => {
    const largos = [30, 60, 90, 120, 160].map((b) => cajaDeAbajoUnida(arribaCon(b), falda)!.h);
    expect(Math.max(...largos) / Math.min(...largos)).toBeLessThanOrEqual((1 + HOLGURA_DE_LA_UNION) / (1 - HOLGURA_DE_LA_UNION) + 0.02);
  });

  it("la falda no se deforma: su ancho sigue siendo su proporción por su alto", () => {
    const c = cajaDeAbajoUnida(arribaCon(90), falda)!;
    expect(c.w / c.h).toBeCloseTo(1.13, 1);
  });

  it("queda centrada y arranca donde termina el torso, con un poco de solape", () => {
    const c = cajaDeAbajoUnida(arribaCon(90), falda)!;
    expect(Math.abs(c.x + c.w / 2 - ESCENA.ancho / 2)).toBeLessThanOrEqual(1); // x y w se redondean cada uno
    expect(c.y).toBe(Math.round(44 + 150 * 0.86 - SOLAPE_DE_LA_UNION));
  });

  it("con el bajo de arriba en diagonal la pretina arranca en su punto más alto, sin aire en ese lado", () => {
    const bajo = Array.from({ length: FRANJAS_DEL_BAJO }, (_, i) => (i < 4 || i >= 20 ? null : 0.7 + ((i - 4) / 15) * 0.2));
    const arriba = { caja: { x: 66, y: 44, w: 150, h: 150 }, medida: { filaDelBorde: 0.9, borde: 0.45, pretina: null, bajo }, metida: false };
    const diagonal = cajaDeAbajoUnida(arriba, falda)!;
    const recta = cajaDeAbajoUnida({ ...arriba, medida: { ...arriba.medida, bajo: null } }, falda)!;
    // Sin perfil: arranca en el punto más bajo (0,9). Con perfil: más arriba, por donde el bajo sube.
    expect(recta.y).toBe(Math.round(44 + 150 * 0.9 - SOLAPE_DE_LA_UNION));
    expect(diagonal.y).toBeLessThan(recta.y - 10);
    // El ancho de la pretina no cambia: solo dónde empieza.
    expect(diagonal.w).toBe(recta.w);
  });

  it("un bajo que termina en una punta angosta no encoge la cintura del pantalón: cuenta el ancho de toda la zona del bajo", () => {
    // Torso de 100 de ancho que termina en diagonal: la fila más baja mide poco (la punta), pero la zona del bajo ocupa casi todo el ancho.
    const bajo = Array.from({ length: FRANJAS_DEL_BAJO }, (_, i) => (i < 3 || i >= 21 ? null : 0.8 + (i / FRANJAS_DEL_BAJO) * 0.18));
    const punta = { caja: { x: 66, y: 44, w: 150, h: 150 }, medida: { filaDelBorde: 0.98, borde: 0.35, pretina: null, bajo }, metida: false };
    const sinPerfil = { ...punta, medida: { ...punta.medida, bajo: null } };
    const conZona = cajaDeAbajoUnida(punta, falda)!;
    const conPunta = cajaDeAbajoUnida(sinPerfil, falda)!;
    // Con solo la punta (35 % de 150 px = 52 px) la pretina cae al mínimo; con la zona del bajo, más cerca de la cintura estándar.
    expect(conPunta.w * 0.8).toBeCloseTo(ESTANDAR * (1 - HOLGURA_DE_LA_UNION), 0);
    expect(conZona.w).toBeGreaterThan(conPunta.w);
  });

  it("una pretina ancha para su largo (una mini) sale corta; una angosta (una maxi), larga", () => {
    const mini = cajaDeAbajoUnida(arribaCon(90), { proporcion: 1.5, medida: { filaDelBorde: 0.1, borde: 0.9, pretina: 0.9, bajo: null } })!;
    const maxi = cajaDeAbajoUnida(arribaCon(90), { proporcion: 0.7, medida: { filaDelBorde: 0.1, borde: 0.9, pretina: 0.35, bajo: null } })!;
    expect(mini.h).toBeLessThan(maxi.h);
  });

  it("el largo no se sale del rango: ni un pantalón de 20 cm ni uno de 3 metros", () => {
    const angosta = cajaDeAbajoUnida(arribaCon(90), { proporcion: 0.2, medida: { filaDelBorde: 0.1, borde: 0.9, pretina: 0.2, bajo: null } })!;
    expect(angosta.h).toBe(Math.round(LARGO_MAXIMO_DE_ABAJO * PX_POR_CM));
    const ancha = cajaDeAbajoUnida(arribaCon(90), { proporcion: 4, medida: { filaDelBorde: 0.1, borde: 0.9, pretina: 1, bajo: null } })!;
    expect(ancha.h).toBe(Math.round(LARGO_MINIMO_DE_ABAJO * PX_POR_CM));
    // Al acotar el largo, el ancho acompaña (la prenda no se deforma).
    expect(ancha.w / ancha.h).toBeCloseTo(4, 1);
  });

  it("sin medidas de alguna de las dos, o con un body metido, no se ajusta: queda la caja de siempre", () => {
    expect(cajaDeAbajoUnida({ ...arribaCon(90), medida: undefined }, falda)).toBeNull();
    expect(cajaDeAbajoUnida({ ...arribaCon(90), medida: null }, falda)).toBeNull();
    expect(cajaDeAbajoUnida(arribaCon(90), { ...falda, medida: null })).toBeNull();
    expect(cajaDeAbajoUnida(arribaCon(90), { ...falda, medida: SIN_MEDIDA })).toBeNull();
    expect(cajaDeAbajoUnida({ ...arribaCon(90), medida: SIN_MEDIDA }, falda)).toBeNull();
    expect(cajaDeAbajoUnida({ ...arribaCon(90), metida: true }, falda)).toBeNull();
  });

  it("datos raros no producen una caja rota", () => {
    expect(cajaDeAbajoUnida(arribaCon(90), { ...falda, proporcion: 0 })).toBeNull();
    expect(cajaDeAbajoUnida({ ...arribaCon(90), caja: { x: 0, y: 0, w: 0, h: 0 } }, falda)).toBeNull();
    const c = cajaDeAbajoUnida(arribaCon(90), falda)!;
    for (const v of [c.x, c.y, c.w, c.h]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("direccionParaMedir: se mide una copia chica, no el PNG entero", () => {
  it("una foto del almacén pasa por el optimizador, al ancho que ya sirve", () => {
    const d = direccionParaMedir({ url: "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/a b.png", optimizar: true });
    expect(d.startsWith("/_next/image?url=")).toBe(true);
    expect(d).toContain(`w=${ANCHO_PARA_MEDIR}`);
    expect(d).toContain(encodeURIComponent("a b.png"));
  });
  it("cualquier otra foto se baja tal cual", () => {
    expect(direccionParaMedir({ url: "https://otro.com/a.png", optimizar: false })).toBe("https://otro.com/a.png");
  });
});

describe("las medidas que se recuerdan entre visitas", () => {
  const m: MedidaDelRecorte = { filaDelBorde: 0.8, borde: 0.4, pretina: null, bajo: Array.from({ length: FRANJAS_DEL_BAJO }, (_, i) => (i < 4 ? null : 0.8)) };
  it("lo que se guarda se lee igual", () => {
    const texto = medidasATexto(new Map([["u1", m]]));
    expect(medidasDesdeTexto(texto).get("u1")).toEqual(m);
  });
  it("lo que se recordó sin perfil de bajo (de otra versión) se lee sin él, y un perfil mal formado se descarta", () => {
    const sinPerfil = JSON.stringify({ a: { filaDelBorde: 0.8, borde: 0.4, pretina: null } });
    expect(medidasDesdeTexto(sinPerfil).get("a")).toEqual({ filaDelBorde: 0.8, borde: 0.4, pretina: null, bajo: null });
    const malo = JSON.stringify({ a: { filaDelBorde: 0.8, borde: 0.4, pretina: null, bajo: [0.5, 2] } });
    expect(medidasDesdeTexto(malo).size).toBe(0);
  });
  it("no se guarda lo que no se pudo medir", () => {
    const texto = medidasATexto(new Map<string, MedidaDelRecorte | null>([["roto", null], ["vacio", SIN_MEDIDA], ["bueno", m]]));
    expect([...medidasDesdeTexto(texto).keys()]).toEqual(["bueno"]);
  });
  it("se queda con los más nuevos", () => {
    const muchas = new Map(Array.from({ length: MEDIDAS_QUE_SE_RECUERDAN + 5 }, (_, i) => [`u${i}`, m] as const));
    const leidas = medidasDesdeTexto(medidasATexto(muchas));
    expect(leidas.size).toBe(MEDIDAS_QUE_SE_RECUERDAN);
    expect(leidas.has("u0")).toBe(false);
    expect(leidas.has(`u${MEDIDAS_QUE_SE_RECUERDAN + 4}`)).toBe(true);
  });
  it("un texto roto, de otra forma o con números fuera de rango no rompe nada", () => {
    expect(medidasDesdeTexto(null).size).toBe(0);
    expect(medidasDesdeTexto("{no es json").size).toBe(0);
    expect(medidasDesdeTexto("[1,2]").size).toBe(0);
    expect(medidasDesdeTexto(JSON.stringify({ a: { filaDelBorde: 3, borde: 0.4, pretina: null }, b: 5, c: { borde: 0.4 } })).size).toBe(0);
  });
});
