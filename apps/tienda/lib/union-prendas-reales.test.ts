import { describe, expect, it } from "vitest";
import reales from "./union-prendas-reales.json";
import { cajasDeLaFigura, CUERPO_CREIBLE_MAXIMO_CM, CUERPO_CREIBLE_MINIMO_CM, cuerpoDibujadoCm, huecoDeLaUnion, type PerfilDePixeles } from "./union-auditoria-pixeles";
import { type MedidaDelRecorte, medidaDesdeDato } from "./union-prendas";

// La unión con prendas REALES del catálogo publicado (ADR-0449, act. 2026-11-17). `union-prendas-reales.json` guarda, de 20 prendas (11 de arriba y 9 de abajo,
// elegidas por la forma de su bajo: en V, en diagonal, curvo con hundido, de camisa corta con mangas largas, corsé, sudadera, y los pantalones y faldas con que
// peor calzaban), lo que mide la tienda de cada recorte y su perfil por columnas. Es el mismo dato que da `GET /api/medida/<recorte>`: pasa por
// `medidaDesdeDato`, como en la figura. Se mide en píxeles de la escena cuánto aire queda entre el bajo de arriba y la pretina de abajo, en cada combinación.
// Para auditar TODO el catálogo (no solo estas 19): `pnpm --filter tienda union:auditar`.

type Real = { id: string; nombre: string; zona: "arriba" | "abajo"; largo: number; proporcion: number; porTorso: boolean; falda: boolean; medida: unknown; primera: number[]; ultima: number[] };
const prendas = reales as Real[];
const perfilDe = (p: Real): PerfilDePixeles => ({ primera: p.primera.map((v) => (v < 0 ? null : v / 1000)), ultima: p.ultima.map((v) => (v < 0 ? null : v / 1000)) });
const medidaDe = (p: Real): MedidaDelRecorte => {
  const m = medidaDesdeDato(p.medida);
  if (!m) throw new Error(`la medida de ${p.id} no se lee`);
  return m;
};
const arribas = prendas.filter((p) => p.zona === "arriba");
const abajos = prendas.filter((p) => p.zona === "abajo");
const huecoDe = (a: Real, b: Real, sinContorno = false) => {
  const ma = medidaDe(a);
  const mb = medidaDe(b);
  const cajas = cajasDeLaFigura(a, sinContorno ? { ...ma, contorno: null } : ma, b, sinContorno ? { ...mb, contorno: null } : mb);
  if (!cajas) throw new Error("la unión no aplica");
  return { ...huecoDeLaUnion({ caja: cajas.arriba, perfil: perfilDe(a) }, { caja: cajas.abajo, perfil: perfilDe(b) }), cajas };
};
/** Lo que el ojo empieza a notar en una figura de ~420 px: aire de más de 2 px de alto sobre la línea de la pretina, sostenido en 4 columnas. */
const TOLERANCIA_PX = 2;

describe("la unión con prendas reales no deja aire entre el bajo de arriba y la pretina de abajo", () => {
  it("el catálogo de prueba es el que se dice: 11 prendas de arriba, 9 de abajo, y cada medida trae su contorno fino", () => {
    expect(arribas).toHaveLength(11);
    expect(abajos).toHaveLength(9);
    for (const p of prendas) expect(medidaDe(p).contorno, p.id).toBeTruthy();
  });

  it("ninguna de las 99 combinaciones deja un hueco que se vea (más de 2 px sostenido)", () => {
    const malas = arribas.flatMap((a) => abajos.map((b) => ({ par: `${a.id} + ${b.id}`, hueco: huecoDe(a, b).maxHueco }))).filter((x) => x.hueco > TOLERANCIA_PX);
    expect(malas).toEqual([]);
  });

  it("el caso de Felipe (2026-11-17): el Top Glitters, de bajo en V, sobre el Pantalón Camelia: la pretina queda bajo el top, sin muescas de fondo en las esquinas", () => {
    const top = arribas.find((p) => p.id === "POL-0071.CHO");
    const pantalon = abajos.find((p) => p.id === "PAN-0031.CHO");
    if (!top || !pantalon) throw new Error("faltan las prendas del caso");
    expect(huecoDe(top, pantalon).maxHueco).toBeLessThanOrEqual(TOLERANCIA_PX);
  });

  it("el detector no está ciego: el corsé sobre el Pantalón Sastre dejaba la pretina al aire con la estimación de antes (sin contorno fino)", () => {
    const top = arribas.find((p) => p.id === "COR-0001.BLA");
    const pantalon = abajos.find((p) => p.id === "PAN-0025.BLA");
    if (!top || !pantalon) throw new Error("faltan las prendas del caso");
    expect(huecoDe(top, pantalon, true).maxHueco).toBeGreaterThan(5);
    expect(huecoDe(top, pantalon).maxHueco).toBeLessThanOrEqual(TOLERANCIA_PX);
  });

  it("el detector no está ciego: sin el contorno fino (la estimación de antes) varias combinaciones sí dejaban aire", () => {
    const conAire = arribas.flatMap((a) => abajos.map((b) => huecoDe(a, b, true).maxHueco)).filter((h) => h > TOLERANCIA_PX);
    expect(conAire.length).toBeGreaterThanOrEqual(10);
  });

  it("el pantalón no sube sin límite: nunca por encima del 30 % del alto de la prenda de arriba sobre su bajo", () => {
    for (const a of arribas) {
      for (const b of abajos) {
        const { cajas } = huecoDe(a, b);
        const bajo = cajas.arriba.y + cajas.arriba.h * (medidaDe(a).filaDelBorde ?? 1);
        expect(cajas.abajo.y, `${a.id} + ${b.id}`).toBeGreaterThanOrEqual(bajo - 0.3 * cajas.arriba.h - 4);
      }
    }
  });

  it("una medida recordada de antes (sin contorno) sigue sirviendo: la unión usa el perfil de siempre y no se rompe", () => {
    const top = arribas[0];
    const pantalon = abajos[0];
    const sin = (p: Real) => {
      const m = medidaDe(p);
      return { ...m, contorno: undefined } as MedidaDelRecorte;
    };
    expect(() => cajasDeLaFigura(top, sin(top), pantalon, sin(pantalon))).not.toThrow();
    expect(cajasDeLaFigura(top, sin(top), pantalon, sin(pantalon))).not.toBeNull();
  });

  it("el caso de Felipe (2026-11-17, b): el Top Glitters ya no sale más grande que una persona: su cuerpo mide como el de las demás blusas, no 53 cm", () => {
    const top = arribas.find((p) => p.id === "POL-0071.CHO");
    const pantalon = abajos.find((p) => p.id === "PAN-0031.CHO");
    if (!top || !pantalon) throw new Error("faltan las prendas del caso");
    const cuerpo = cuerpoDibujadoCm(top, medidaDe(top));
    expect(cuerpo).not.toBeNull();
    expect(cuerpo ?? 99).toBeLessThanOrEqual(43);
    // Y calza con la cintura del pantalón: el top entero no mide más de ×1,25 la pretina (antes, ×1,45).
    const { cajas } = huecoDe(top, pantalon);
    const pretina = cajas.abajo.w * (medidaDe(pantalon).pretina ?? 1);
    expect(cajas.arriba.w / pretina).toBeLessThanOrEqual(1.25);
  });

  it("toda blusa, polo o top real se dibuja con un cuerpo de ancho creíble (la misma escala que las demás)", () => {
    const fuera = arribas
      .filter((p) => p.porTorso)
      .map((p) => ({ id: p.id, cm: cuerpoDibujadoCm(p, medidaDe(p)) }))
      .filter((x) => x.cm === null || x.cm < CUERPO_CREIBLE_MINIMO_CM || x.cm > CUERPO_CREIBLE_MAXIMO_CM);
    expect(fuera).toEqual([]);
  });
});
