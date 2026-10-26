import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import type { Guia } from "../guias/tipos";
import { anclaDeArranque, direccionDelTramo, guiaDelTramo, leerRecorrido, type Tramo } from "./recorrido";

const guia: Guia = {
  id: "vender.comprobantes",
  ruta: "/vender/comprobantes",
  titulo: "Comprobantes",
  resumen: "Lo emitido.",
  alSalir: [{ tipo: "escape" }],
  pasos: [
    { id: "hola", ancla: null, titulo: "Bienvenida", texto: "." },
    { id: "lista", ancla: "c.lista", titulo: "La lista", texto: "." },
    { id: "detalle", ancla: "c.detalle", titulo: "El detalle", texto: ".", preparar: [{ tipo: "clic", ancla: "c.fila" }], opcional: true },
    { id: "anular", ancla: "c.anular", titulo: "Anular", texto: ".", requiere: ["c.detalle"] },
    { id: "cerrar", ancla: "c.lista", titulo: "De vuelta", texto: ".", preparar: [{ tipo: "escape" }] },
  ],
};

describe("guiaDelTramo: la guía corta que arranca en el paso que responde", () => {
  it("un paso suelto, con lo que necesita abierto: el `preparar` del último paso de antes que lo tenía", () => {
    const g = guiaDelTramo(guia, "anular");
    expect(g.pasos.map((p) => p.id)).toEqual(["anular"]);
    expect(g.pasos[0]?.preparar).toEqual([{ tipo: "clic", ancla: "c.fila" }]);
    expect(g.alSalir).toEqual([{ tipo: "escape" }]);
  });

  it("si el paso tiene su `preparar`, ese; si nadie antes lo tenía, nada", () => {
    expect(guiaDelTramo(guia, "cerrar").pasos[0]?.preparar).toEqual([{ tipo: "escape" }]);
    expect(guiaDelTramo(guia, "lista").pasos[0]?.preparar).toEqual([]);
  });

  it("se le quitan las condiciones que lo harían saltar en silencio: la persona preguntó por ESE paso", () => {
    const [detalle] = guiaDelTramo(guia, "detalle").pasos;
    const [anular] = guiaDelTramo(guia, "anular").pasos;
    expect(detalle?.opcional).toBeUndefined();
    expect(anular?.requiere).toBeUndefined();
  });

  it("sin paso, con uno que no existe o con la bienvenida (sin ancla): la guía entera", () => {
    expect(guiaDelTramo(guia, null)).toBe(guia);
    expect(guiaDelTramo(guia, "inventado")).toBe(guia);
    expect(guiaDelTramo(guia, "hola")).toBe(guia);
  });

  it("con las guías de verdad: todo paso con ancla da un tramo de un paso, con su misma ancla", () => {
    for (const g of GUIAS) {
      for (const p of g.pasos.filter((x) => x.ancla !== null)) {
        const t = guiaDelTramo(g, p.id);
        expect(t.pasos, `${g.id} ▸ ${p.id}`).toHaveLength(1);
        expect(t.pasos[0]?.ancla).toBe(p.ancla);
      }
    }
  });
});

describe("anclaDeArranque: lo que tiene que estar a la vista antes de arrancar", () => {
  it("la primera pieza que el piloto toca; sin nada que tocar, la del paso", () => {
    expect(anclaDeArranque(guiaDelTramo(guia, "anular"))).toBe("c.fila");
    expect(anclaDeArranque(guiaDelTramo(guia, "lista"))).toBe("c.lista");
  });

  it("un Escape o un toque «si está» no se esperan: se espera la pieza del paso", () => {
    expect(anclaDeArranque(guiaDelTramo(guia, "cerrar"))).toBe("c.lista");
  });
});

describe("direccionDelTramo", () => {
  it("la entrada del menú con demo=1, el paso y la vez, sin perder su consulta", () => {
    expect(direccionDelTramo({ guiaId: "g", pasoId: "anular", href: "/vender/comprobantes" }, "7")).toBe("/vender/comprobantes?demo=1&paso=anular&vez=7");
    expect(direccionDelTramo({ guiaId: "g", pasoId: null, href: "/configuracion?tab=caja" }, "7")).toBe("/configuracion?tab=caja&demo=1&vez=7");
  });
});

describe("leerRecorrido: lo guardado se lee con desconfianza", () => {
  const tramo: Tramo = { guiaId: "caja", pasoId: "cerrar", href: "/caja" };
  const guardado = (x: unknown) => JSON.stringify(x);

  it("un recorrido de hace un rato se lee", () => {
    expect(leerRecorrido(guardado({ tramos: [tramo], creado: 1000 }), 1000 + 60_000)).toEqual({ tramos: [tramo], creado: 1000 });
  });

  it("vencido, del futuro, vacío, roto o con un tramo mal hecho: no hay recorrido", () => {
    expect(leerRecorrido(guardado({ tramos: [tramo], creado: 0 }), 16 * 60_000)).toBeNull();
    expect(leerRecorrido(guardado({ tramos: [tramo], creado: 5000 }), 1000)).toBeNull();
    expect(leerRecorrido(guardado({ tramos: [], creado: 0 }), 0)).toBeNull();
    expect(leerRecorrido("{roto", 0)).toBeNull();
    expect(leerRecorrido(null, 0)).toBeNull();
    expect(leerRecorrido(guardado({ tramos: [{ ...tramo, href: 5 }], creado: 0 }), 0)).toBeNull();
  });

  it("nunca lleva fuera del ERP: una dirección que no empieza en «/» (o empieza en «//») no vale", () => {
    expect(leerRecorrido(guardado({ tramos: [{ ...tramo, href: "https://otro.com" }], creado: 0 }), 0)).toBeNull();
    expect(leerRecorrido(guardado({ tramos: [{ ...tramo, href: "//otro.com" }], creado: 0 }), 0)).toBeNull();
  });

  it("como mucho tres tramos", () => {
    expect(leerRecorrido(guardado({ tramos: [tramo, tramo, tramo, tramo], creado: 0 }), 0)?.tramos).toHaveLength(3);
  });
});
