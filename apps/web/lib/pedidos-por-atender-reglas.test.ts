import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HORAS_SIN_RESPUESTA,
  ahoraSinRespuesta,
  contarTePiden,
  esperaVisible,
  filaPorAtenderDeFila,
  horasEsperando,
  leAvisaSinRespuesta,
  numeroDelMenuTraslados,
  pedidosSinRespuesta,
  sinRespuestaEnLaRed,
  textoEspera,
  textoSinRespuesta,
  type FilaPorAtender,
} from "./pedidos-por-atender-reglas";

const AHORA = "2026-10-05T15:00:00.000Z";
const haceHoras = (h: number) => new Date(Date.parse(AHORA) - h * 3_600_000).toISOString();
const fila = (p: Partial<FilaPorAtender> & Pick<FilaPorAtender, "id">): FilaPorAtender => ({
  direccion: "me_piden",
  conCliente: false,
  creadoEn: haceHoras(1),
  otraSede: "Tienda Arequipa",
  otraSedeId: "aqp",
  prendas: 1,
  ...p,
});

describe("filaPorAtenderDeFila", () => {
  it("lee la fila de fn_pedidos_por_atender", () => {
    expect(
      filaPorAtenderDeFila({ id: "g1", direccion: "me_piden", con_cliente: true, created_at: AHORA, otra_sede: "Tienda Lima", otra_sede_id: "lim", prendas: 2 }),
    ).toEqual({ id: "g1", direccion: "me_piden", conCliente: true, creadoEn: AHORA, otraSede: "Tienda Lima", otraSedeId: "lim", prendas: 2 });
  });
  it("una fila sin id o sin hora no se cuenta (no inventa un pedido)", () => {
    expect(filaPorAtenderDeFila({ id: "", created_at: AHORA })).toBeNull();
    expect(filaPorAtenderDeFila({ id: "g1", created_at: "no es fecha" })).toBeNull();
  });
  it("una dirección desconocida se lee como «pedí» (nunca suma al número de otra sede)", () => {
    expect(filaPorAtenderDeFila({ id: "g1", direccion: "rara", created_at: AHORA })?.direccion).toBe("pedi");
  });
});

describe("contarTePiden — el número del menú", () => {
  it("cuenta solo lo que OTRAS sedes le pidieron a esta (un pedido para un cliente y un grupo valen 1 cada uno)", () => {
    const filas = [fila({ id: "a" }), fila({ id: "b", conCliente: true, prendas: 3 }), fila({ id: "c", direccion: "pedi" })];
    expect(contarTePiden(filas)).toBe(2);
  });
  it("sin pedidos, 0", () => {
    expect(contarTePiden([])).toBe(0);
  });
});

describe("numeroDelMenuTraslados — el menú suma lo que llega y lo que te piden", () => {
  const filas = [fila({ id: "a" }), fila({ id: "b", conCliente: true }), fila({ id: "c", direccion: "pedi" })];
  it("lo que llega + lo que otras sedes le piden a esta (lo que esta pidió no suma)", () => {
    expect(numeroDelMenuTraslados(3, filas)).toBe(5);
    expect(numeroDelMenuTraslados(0, [fila({ id: "c", direccion: "pedi" })])).toBe(0);
  });
  it("si no se pudo leer lo que llega, no hay número (nunca uno inventado)", () => {
    expect(numeroDelMenuTraslados(null, filas)).toBeNull();
  });
  it("si falla la lectura de pedidos, sale solo con lo que llega", () => {
    expect(numeroDelMenuTraslados(2, null)).toBe(2);
  });
});

// Revisión adversarial (ADR-0328 act. 17): sumar «Te piden» DENTRO de `getTrasladosPorAtender` hacía que Conteo dijera
// «hay 1 traslado hacia esta sede, recíbelo primero» y Caja «1 traslado por recibir» por un pedido que había que ENVIAR.
// Este candado deja a cada pantalla con su número: el menú y el Inicio suman los pedidos; Conteo y Caja, solo lo que llega.
describe("cada pantalla lee su número de traslados", () => {
  const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
  it("el menú (layout) y el aviso del Inicio usan el número que suma los pedidos", () => {
    for (const ruta of ["app/(app)/layout.tsx", "app/(app)/page.tsx"]) {
      const fuente = leer(ruta);
      expect(fuente, ruta).toContain("getNumeroDelMenuTraslados(");
      expect(fuente, ruta).not.toContain("getTrasladosPorAtender(");
    }
  });
  it("Conteo y Caja cuentan solo lo que llega (un pedido por enviar no es un traslado por recibir)", () => {
    for (const ruta of ["app/(app)/inventario/conteo/page.tsx", "lib/caja-tablero.ts"]) {
      const fuente = leer(ruta);
      expect(fuente, ruta).toContain("getTrasladosPorAtender(");
      expect(fuente, ruta).not.toContain("getNumeroDelMenuTraslados(");
    }
  });
  it("getTrasladosPorAtender no lee pedidos: solo lo que llega a la sede", () => {
    const fuente = leer("lib/traslados.ts");
    const cuerpo = fuente.slice(fuente.indexOf("export const getTrasladosPorAtender"), fuente.indexOf("export const getNumeroDelMenuTraslados"));
    expect(cuerpo).not.toMatch(/getPedidosPorAtender|contarTePiden|numeroDelMenuTraslados\(/);
  });
});

describe("pedidosSinRespuesta — el aviso de las 48 h", () => {
  it("47 h no avisa; 48 h justas sí (el borde cuenta)", () => {
    expect(pedidosSinRespuesta([fila({ id: "a", creadoEn: haceHoras(47) })], AHORA).tePiden).toHaveLength(0);
    expect(pedidosSinRespuesta([fila({ id: "a", creadoEn: haceHoras(48) })], AHORA).tePiden).toHaveLength(1);
    expect(HORAS_SIN_RESPUESTA).toBe(48);
  });
  it("separa los dos lados y ordena del más antiguo al más nuevo", () => {
    const s = pedidosSinRespuesta(
      [
        fila({ id: "nuevo", creadoEn: haceHoras(50) }),
        fila({ id: "viejo", creadoEn: haceHoras(100) }),
        fila({ id: "mio", direccion: "pedi", creadoEn: haceHoras(60) }),
        fila({ id: "reciente", creadoEn: haceHoras(2) }),
      ],
      AHORA,
    );
    expect(s.tePiden.map((f) => f.id)).toEqual(["viejo", "nuevo"]);
    expect(s.pediste.map((f) => f.id)).toEqual(["mio"]);
    expect(s.horasMasAntiguo).toBe(100);
  });
  it("sin nada viejo: listas vacías y sin horas", () => {
    expect(pedidosSinRespuesta([fila({ id: "a" })], AHORA)).toEqual({ tePiden: [], pediste: [], horasMasAntiguo: null });
  });
  it("un reloj adelantado no da horas negativas", () => {
    expect(horasEsperando(haceHoras(-5), AHORA)).toBe(0);
  });
});

describe("esperaVisible — la fila de Traslados", () => {
  it("antes de 48 h, «Espera»; desde 48 h, «Sin respuesta» y marcada", () => {
    expect(esperaVisible(haceHoras(5), AHORA)).toEqual({ texto: "Espera hace 5 h", tarde: false });
    expect(esperaVisible(haceHoras(48), AHORA)).toEqual({ texto: "Sin respuesta hace 48 h", tarde: true });
    expect(esperaVisible(haceHoras(100), AHORA)).toEqual({ texto: "Sin respuesta hace 4 días", tarde: true });
  });
});

describe("textos del aviso", () => {
  it("la espera en horas hasta 72 y en días después", () => {
    expect(textoEspera(0)).toBe("hace un momento");
    expect(textoEspera(50)).toBe("hace 50 h");
    expect(textoEspera(71)).toBe("hace 71 h");
    expect(textoEspera(72)).toBe("hace 3 días");
  });
  it("una de cada lado: quién pidió, hace cuánto y si es para un cliente", () => {
    const s = pedidosSinRespuesta(
      [fila({ id: "a", conCliente: true, creadoEn: haceHoras(50) }), fila({ id: "b", direccion: "pedi", otraSede: "Tienda Lima", creadoEn: haceHoras(80) })],
      AHORA,
    );
    expect(textoSinRespuesta(s, AHORA)).toBe("Tienda Arequipa te pidió hace 50 h para un cliente y nadie respondió · Tu pedido a Tienda Lima lleva 3 días sin respuesta.");
  });
  it("varias: las cuenta", () => {
    const s = pedidosSinRespuesta([fila({ id: "a", creadoEn: haceHoras(50) }), fila({ id: "b", creadoEn: haceHoras(60) })], AHORA);
    expect(textoSinRespuesta(s, AHORA)).toBe("2 pedidos que te hicieron siguen sin respuesta.");
    expect(ahoraSinRespuesta(s)).toBe("Responde 2 pedidos de otras sedes");
  });
  it("al día: lo dice, y «Sigue ahora» queda vacío", () => {
    const s = pedidosSinRespuesta([], AHORA);
    expect(textoSinRespuesta(s, AHORA)).toBe("Ningún pedido entre sedes lleva 48 h sin respuesta.");
    expect(ahoraSinRespuesta(s)).toBe("");
  });
  it("solo lo que pedí: pregunta por ellos", () => {
    const s = pedidosSinRespuesta([fila({ id: "b", direccion: "pedi", creadoEn: haceHoras(49) })], AHORA);
    expect(ahoraSinRespuesta(s)).toBe("Pregunta por 1 pedido que no responden");
  });
});

describe("sinRespuestaEnLaRed — el Observatorio", () => {
  it("cada pedido se cuenta UNA vez (desde la sede a la que le pidieron) y suma a las DOS sedes", () => {
    const pedido = { id: "p1", creadoEn: haceHoras(50), prendas: 1, conCliente: true };
    const r = sinRespuestaEnLaRed(
      [
        { tiendaId: "aqp", filas: [fila({ ...pedido, direccion: "me_piden", otraSede: "Tienda Trujillo", otraSedeId: "tru" })] },
        { tiendaId: "tru", filas: [fila({ ...pedido, direccion: "pedi", otraSede: "Tienda Arequipa", otraSedeId: "aqp" })] },
      ],
      AHORA,
    );
    expect(r.pedidos.map((p) => p.id)).toEqual(["p1"]);
    expect(r.pedidos[0].origenId).toBe("aqp");
    expect(r.porTienda).toEqual({ aqp: 1, tru: 1 });
  });
  it("lo que no llega a 48 h no entra; el más antiguo va primero", () => {
    const r = sinRespuestaEnLaRed(
      [{ tiendaId: "aqp", filas: [fila({ id: "a", creadoEn: haceHoras(10), otraSedeId: "tru" }), fila({ id: "b", creadoEn: haceHoras(60), otraSedeId: "tru" }), fila({ id: "c", creadoEn: haceHoras(90), otraSedeId: "lim" })] }],
      AHORA,
    );
    expect(r.pedidos.map((p) => p.id)).toEqual(["c", "b"]);
    expect(r.porTienda).toEqual({ aqp: 2, tru: 1, lim: 1 });
  });
});

describe("leAvisaSinRespuesta — a los líderes de las DOS sedes, cada uno en el Inicio de la suya (decisión del 2026-10-04)", () => {
  it("el líder de la sede lo ve en el Inicio de su sede", () => {
    expect(leAvisaSinRespuesta({ esLider: true, sedePropiaId: "tru" }, "tru")).toBe(true);
  });
  it("un líder parado en otra sede con el selector no lo recibe por ella (les llega a los líderes de allá)", () => {
    expect(leAvisaSinRespuesta({ esLider: true, sedePropiaId: "lim" }, "tru")).toBe(false);
  });
  it("quien no es líder, o una cuenta sin sede propia, nunca", () => {
    expect(leAvisaSinRespuesta({ esLider: false, sedePropiaId: "tru" }, "tru")).toBe(false);
    expect(leAvisaSinRespuesta({ esLider: true, sedePropiaId: null }, "tru")).toBe(false);
    expect(leAvisaSinRespuesta({ esLider: true, sedePropiaId: "" }, "")).toBe(false);
  });
  it("el Inicio lo pregunta antes de leer: el candado está en la lectura, no solo en la regla", () => {
    const inicio = readFileSync(new URL("./inicio.ts", import.meta.url), "utf8");
    expect(inicio).toMatch(/leAvisaSinRespuesta\(cuenta, ubicacionId\)\s*\?\s*getPedidosPorAtender\(ubicacionId\)/);
  });
});
