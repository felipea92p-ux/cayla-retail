import { describe, expect, it } from "vitest";
import { TRAZOS_DEL_AVE } from "./login-vuelo";
import {
  BORDE_MINIMO,
  CABEZA_DEL_AVE,
  ESPERA_EN,
  ESTABLE_DURANTE,
  FIN_DE_LA_ENTRADA,
  PECHO_DEL_AVE,
  TIEMPOS,
  TOPE_DE_ESPERA,
  debeCancelarse,
  estadoDeLaEntrada,
  geometriaDeLaEntrada,
  msDelVuelo,
  revisarLaPantalla,
  type MedidasDeLaEntrada,
  type Punto,
} from "./login-entrada";

/** Los puntos de un trazo (M, C, L absolutos con pares «x,y»), muestreando cada curva de Bézier. */
function puntosDe(d: string): Punto[] {
  const pares = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  const comandos = d.match(/[MCLZ]/g) ?? [];
  const salida: Punto[] = [];
  let i = 0;
  let actual: Punto = pares[0];
  for (const c of comandos) {
    if (c === "M" || c === "L") {
      const p = pares[i++];
      if (c === "L") for (let t = 0; t <= 1; t += 0.02) salida.push({ x: actual.x + (p.x - actual.x) * t, y: actual.y + (p.y - actual.y) * t });
      actual = p;
    } else if (c === "C") {
      const [a, b, p] = [pares[i], pares[i + 1], pares[i + 2]];
      i += 3;
      for (let t = 0; t <= 1; t += 0.02) {
        const u = 1 - t;
        salida.push({
          x: u ** 3 * actual.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * p.x,
          y: u ** 3 * actual.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * p.y,
        });
      }
      actual = p;
    }
  }
  return salida;
}

/** El contorno del ala cerrada (el primer trazo del colibrí más su cierre) y el de la cabeza. */
const contornoDelAla = () => {
  const p = puntosDe(TRAZOS_DEL_AVE[0]);
  const cierre = puntosDe(`M${p[p.length - 1].x},${p[p.length - 1].y} L${p[0].x},${p[0].y}`);
  return [...p, ...cierre];
};
const contornoDeLaCabeza = () => {
  const p = puntosDe(CABEZA_DEL_AVE);
  return [...p, ...puntosDe(`M${p[p.length - 1].x},${p[p.length - 1].y} L${p[0].x},${p[0].y}`)];
};

const dentro = (p: Punto, poligono: Punto[]) => {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) adentro = !adentro;
  }
  return adentro;
};

describe("la silueta del colibrí es una ventana que cubre la pantalla", () => {
  it("el pecho cae DENTRO del ala cerrada", () => {
    expect(dentro(PECHO_DEL_AVE, contornoDelAla())).toBe(true);
  });

  it("BORDE_MINIMO no promete más de lo que mide el dibujo (distancia del pecho a cualquier contorno)", () => {
    const todos = [...contornoDelAla(), ...contornoDeLaCabeza()];
    const minima = Math.min(...todos.map((p) => Math.hypot(p.x - PECHO_DEL_AVE.x, p.y - PECHO_DEL_AVE.y)));
    expect(minima).toBeGreaterThanOrEqual(BORDE_MINIMO);
  });

  it.each([
    [1440, 900, 330],
    [1920, 1080, 330],
    [1024, 768, 280],
    [375, 812, 71], // el celular: el colibrí de la marca chica del formulario
  ])("a %i×%i el ave final deja el disco de la silueta más grande que media diagonal", (ancho, alto, anchoAve) => {
    const medidas: MedidasDeLaEntrada = { origen: { x: 40, y: 60, ancho: anchoAve, alto: (anchoAve * 150) / 223 }, ancho, alto };
    const g = geometriaDeLaEntrada(medidas);
    const radio = BORDE_MINIMO * g.k0 * g.escalaFinal;
    expect(radio).toBeGreaterThanOrEqual(Math.hypot(ancho, alto) / 2);
    // y el aleteo ya se apagó cuando eso pasa: el ave termina en la pose del logo
    expect(estadoDeLaEntrada(FIN_DE_LA_ENTRADA, 5000, medidas).angulo).toBeCloseTo(0, 6);
  });
});

describe("la línea de tiempo espera a la pantalla de destino", () => {
  it("corre igual hasta que el ave llega al centro", () => {
    expect(msDelVuelo(0, null)).toBe(0);
    expect(msDelVuelo(800, null)).toBe(800);
    expect(msDelVuelo(ESPERA_EN, null)).toBe(ESPERA_EN);
  });

  it("si la pantalla no está lista, se queda flotando en el centro, por mucho que pase el tiempo", () => {
    expect(msDelVuelo(ESPERA_EN + 5000, null)).toBe(ESPERA_EN);
  });

  it("cuando la pantalla llega, sigue desde donde se quedó (no salta)", () => {
    expect(msDelVuelo(ESPERA_EN + 3000, ESPERA_EN + 3000)).toBe(ESPERA_EN);
    expect(msDelVuelo(ESPERA_EN + 3400, ESPERA_EN + 3000)).toBe(ESPERA_EN + 400);
  });

  it("si la pantalla ya estaba lista antes de llegar al centro, no espera nada", () => {
    expect(msDelVuelo(ESPERA_EN + 500, 600)).toBe(ESPERA_EN + 500);
  });

  it("nunca retrocede", () => {
    let anterior = -1;
    for (let ms = 0; ms <= 9000; ms += 50) {
      const v = msDelVuelo(ms, 3000);
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
  });
});

describe("el recorrido del colibrí", () => {
  const medidas: MedidasDeLaEntrada = { origen: { x: 360, y: 70, ancho: 330, alto: 222 }, ancho: 1440, alto: 900 };
  const g = geometriaDeLaEntrada(medidas);

  it("empieza exactamente donde está el colibrí del login: en su lugar, a su tamaño, sin velo y sin ventana", () => {
    const e = estadoDeLaEntrada(0, 0, medidas);
    expect(e.pecho.x).toBeCloseTo(g.pechoInicial.x, 6);
    expect(e.pecho.y).toBeCloseTo(g.pechoInicial.y, 6);
    expect(e.k).toBeCloseTo(g.k0, 9);
    expect(e.kVentana).toBe(0);
    expect(e.velo).toBe(0);
    expect(e.angulo).toBe(0); // la pose del logo
    expect(e.terminado).toBe(false);
  });

  it("al llegar se queda en el CENTRO de la pantalla", () => {
    const e = estadoDeLaEntrada(ESPERA_EN, 6000, medidas);
    expect(Math.abs(e.pecho.x - 720)).toBeLessThan(3); // el meceo es de unos px
    expect(Math.abs(e.pecho.y - 450)).toBeLessThan(3);
    expect(e.velo).toBe(1);
    expect(e.kVentana).toBe(0); // la ventana todavía no abre: espera a la pantalla
  });

  it("la ventana se abre, acompaña al ave y la entrada termina cuando la cubre toda", () => {
    const abierta = estadoDeLaEntrada(TIEMPOS.abre[1], 2000, medidas);
    expect(abierta.kVentana).toBeCloseTo(abierta.k, 9);
    const fin = estadoDeLaEntrada(FIN_DE_LA_ENTRADA, 4000, medidas);
    expect(fin.terminado).toBe(true);
    expect(fin.pecho.x).toBeCloseTo(720, 6);
    expect(fin.pecho.y).toBeCloseTo(450, 6);
  });

  it("crece parejo y sin rebote: nunca se achica y nunca se pasa de su tamaño final", () => {
    let anterior = 0;
    for (let ms = 0; ms <= FIN_DE_LA_ENTRADA; ms += 20) {
      const k = estadoDeLaEntrada(ms, ms, medidas).k;
      expect(k).toBeGreaterThanOrEqual(anterior - 1e-9);
      anterior = k;
    }
    expect(anterior).toBeCloseTo(g.k0 * g.escalaFinal, 6);
  });

  it("aletea mientras vuela y flota, y deja de aletear al terminar", () => {
    const amplitudes = [0, 300, 700, 1100, 1700, 2400].map((ms) => Math.abs(estadoDeLaEntrada(ms, ms + 40, medidas).angulo));
    expect(Math.max(...amplitudes)).toBeGreaterThan(5);
    expect(Math.abs(estadoDeLaEntrada(FIN_DE_LA_ENTRADA, 3200, medidas).angulo)).toBeLessThan(1e-9);
  });

  it("en el celular el ave flota a un tamaño que cabe en la pantalla", () => {
    const celular = geometriaDeLaEntrada({ origen: { x: 150, y: 40, ancho: 71, alto: 48 }, ancho: 375, alto: 812 });
    expect(71 * celular.escalaAlFlotar).toBeLessThanOrEqual(375 * 0.55 + 1e-9);
    expect(celular.escalaAlFlotar).toBeGreaterThan(2);
  });
});

describe("¿ya se puede abrir la ventana?", () => {
  it("no mientras la dirección siga siendo el login o el loader tenga algo en curso", () => {
    expect(revisarLaPantalla({ ruta: "/login", ocupada: false }, null, 1000).lista).toBe(false);
    expect(revisarLaPantalla({ ruta: "/", ocupada: true }, null, 1000).lista).toBe(false);
  });

  it("solo cuando se mantiene libre un rato (un refresco encadenado no la da por lista a medias)", () => {
    const a = revisarLaPantalla({ ruta: "/", ocupada: false }, null, 1000);
    expect(a).toEqual({ libreDesde: 1000, lista: false });
    const b = revisarLaPantalla({ ruta: "/", ocupada: false }, a.libreDesde, 1000 + ESTABLE_DURANTE);
    expect(b.lista).toBe(true);
  });

  it("si se ocupa de nuevo, empieza a contar otra vez", () => {
    const a = revisarLaPantalla({ ruta: "/", ocupada: false }, null, 1000);
    const b = revisarLaPantalla({ ruta: "/", ocupada: true }, a.libreDesde, 1100);
    expect(b).toEqual({ libreDesde: null, lista: false });
  });

  it("se deshace si te devolvieron al login con un motivo, o si tardó demasiado", () => {
    expect(debeCancelarse({ ruta: "/login", busqueda: "?error=sin_persona" }, 1000, false)).toBe(true);
    expect(debeCancelarse({ ruta: "/login", busqueda: "" }, 1000, false)).toBe(false); // el push todavía no llegó
    expect(debeCancelarse({ ruta: "/", busqueda: "" }, 1000, false)).toBe(false);
    expect(debeCancelarse({ ruta: "/login", busqueda: "" }, TOPE_DE_ESPERA + 1, false)).toBe(true);
    expect(debeCancelarse({ ruta: "/", busqueda: "" }, TOPE_DE_ESPERA + 1, true)).toBe(false);
  });
});
