import { describe, expect, it } from "vitest";
import {
  agruparLineas,
  anotadasDelGrupo,
  camposDelCierrePorGrupo,
  causasDelGrupo,
  lineaDelGrupo,
  anotadasPorSepararDelGrupo,
  camposDelConteoPorGrupo,
  claveDeGrupo,
  descripcionDelGrupo,
  lineaDeLaPrenda,
  veredictoDelGrupo,
  juntarSeparado,
  minimoDelGrupo,
  repartirSeparado,
  repartirTotal,
} from "./recepcion-grupos-reglas";
import { camposDelCierre, detalleParaDespues, diferenciaDe, leerConteosDelEnvio, lineasParaCerrar, separarAnotada, totalSeparado, unidadesSinIdentificar, type LineaParaContar, type Separado } from "./recepcion-conteo-reglas";
import type { LineaEnvio } from "./recepcion-envio-reglas";

const VESTIDOS = { id: "c-vestidos", nombre: "Vestidos", prefijo: "VES", familia: "vestidos" };
const FALDAS = { id: "c-faldas", nombre: "Faldas", prefijo: "FAL", familia: "faldas" };
const CAYLA = { id: "m-cayla", nombre: "CAYLA" };
const PROV = { id: "p1", nombre: "Confecciones del Sur" };
const OTRO_PROV = { id: "p2", nombre: "Otro proveedor" };

const linea = (id: string, enviado: number, extra: Partial<LineaEnvio> = {}): LineaEnvio => ({
  id,
  orden: { id: "o1", numero: "OC-000001" },
  posicion: 1,
  proveedor: PROV,
  categoria: VESTIDOS,
  marca: CAYLA,
  descripcion: null,
  enviado,
  costoUnitario: 30,
  compraItemId: null,
  precioVentaSugerido: null,
  prendaElegida: null,
  ...extra,
});

type Cuerpo = { contadas?: number; en_stock?: number; separado?: Separado | Record<string, unknown> };
/** Una línea de la guía, contada o no. */
function deLaGuia(l: LineaEnvio, c: Cuerpo | null = null): LineaParaContar {
  const conteo = c
    ? (leerConteosDelEnvio({
        despacho_id: "d1",
        conteos: [
          {
            despacho_item_id: l.id,
            contadas: c.contadas ?? 0,
            separado: c.separado ?? { prendas: [], nuevas: [] },
            en_stock: c.en_stock ?? 0,
            version: 1,
            contado_por: { id: "per1", nombre: "Mariana" },
            pendientes: [],
          },
        ],
      })?.conteos[0] ?? null)
    : null;
  return { clave: `item:${l.id}`, linea: l, conteo, categoria: l.categoria, marca: l.marca, proveedor: l.proveedor, dijeron: l.enviado };
}

const sofia = () => linea("l-sofia", 5, { descripcion: "Vestido Sofía", prendaElegida: { productoId: "p-sofia", nombre: "Vestido Sofía", codigo: "VES-1" } });
const lima = () => linea("l-lima", 7, { descripcion: "Vestido Lima", prendaElegida: { productoId: "p-lima", nombre: "Vestido Lima", codigo: "VES-2" } });
const prendaSep = (productoId: string, nombre: string, cantidad: number) => ({ producto_id: productoId, nombre, cantidad, variantes: null });
const sep = (productoId: string, nombre: string, cantidad: number) => ({ productoId, nombre, codigo: null, cantidad, variantes: null });

const contadasDe = (r: { cambios: { linea: LineaParaContar; contadas: number }[] }, id: string) => r.cambios.find((c) => c.linea.linea?.id === id)?.contadas;

describe("agrupar las líneas del envío por categoría", () => {
  it("junta lo que es del mismo proveedor, categoría y marca; lo demás queda aparte, y cada cosa de fuera de la guía va sola", () => {
    const fuera: LineaParaContar = {
      clave: "extra:1",
      linea: null,
      conteo: null,
      categoria: VESTIDOS,
      marca: CAYLA,
      proveedor: PROV,
      dijeron: null,
    };
    const grupos = agruparLineas([
      deLaGuia(sofia()),
      deLaGuia(linea("l-falda", 7, { categoria: FALDAS, descripcion: "Falda plisada" })),
      deLaGuia(lima()),
      deLaGuia(linea("l-otro", 3, { proveedor: OTRO_PROV })),
      fuera,
    ]);
    expect(grupos.map((g) => g.lineas.map((l) => l.clave))).toEqual([["item:l-sofia", "item:l-lima"], ["item:l-falda"], ["item:l-otro"], ["extra:1"]]);
    expect(grupos[0].dijeron).toBe(12);
    expect(grupos[3].dijeron).toBeNull();
    expect(claveDeGrupo(fuera)).toBe("extra:1");
  });

  it("suma lo contado, lo que ya entró y lo separado de todas sus líneas, y dice lo que sigue sin separar", () => {
    const g = agruparLineas([
      deLaGuia(sofia(), { contadas: 5, en_stock: 1, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 2)], nuevas: [] } }),
      deLaGuia(lima(), { contadas: 5, separado: { prendas: [], nuevas: [{ cantidad: 1, descripcion: null }] } }),
    ])[0];
    expect(g.contadas).toBe(10);
    expect(g.enStock).toBe(1);
    expect(totalSeparado(g.separado)).toBe(3);
    expect(minimoDelGrupo(g)).toBe(4);
    expect(g.contado).toBe(true);
    expect(agruparLineas([deLaGuia(sofia(), { contadas: 5 }), deLaGuia(lima())])[0].contado).toBe(false);
  });

  it("al juntar lo separado, una prenda va una sola vez y las nuevas de la misma descripción se suman", () => {
    const j = juntarSeparado([
      { prendas: [sep("p1", "A", 2)], nuevas: [{ cantidad: 1, descripcion: "Top corto" }, { cantidad: 2, descripcion: null }] },
      { prendas: [sep("p1", "A", 3), sep("p2", "B", 1)], nuevas: [{ cantidad: 4, descripcion: "top  CORTO" }, { cantidad: 1, descripcion: null }] },
    ]);
    expect(j.prendas.map((p) => [p.productoId, p.cantidad])).toEqual([["p1", 5], ["p2", 1]]);
    expect(j.nuevas).toEqual([{ cantidad: 5, descripcion: "Top corto" }, { cantidad: 3, descripcion: null }]);
  });
});

describe("repartir el total que se escribe, cambiando lo mínimo", () => {
  const grupo = (a: number | null, b: number | null, sepA = 0, sepB = 0) =>
    agruparLineas([
      deLaGuia(sofia(), a === null ? null : { contadas: a, separado: { prendas: sepA ? [prendaSep("p-sofia", "Vestido Sofía", sepA)] : [], nuevas: [] } }),
      deLaGuia(lima(), b === null ? null : { contadas: b, separado: { prendas: sepB ? [prendaSep("p-lima", "Vestido Lima", sepB)] : [], nuevas: [] } }),
    ])[0];

  it("de cero: llena las líneas en el orden de la compra y lo que sobra va a la última; las dos quedan guardadas", () => {
    const g = grupo(null, null);
    for (const [total, a, b] of [[10, 5, 5], [12, 5, 7], [13, 5, 8], [0, 0, 0], [3, 3, 0]] as const) {
      const r = repartirTotal(g, total);
      expect([contadasDe(r, "l-sofia"), contadasDe(r, "l-lima")], `total ${total}`).toEqual([a, b]);
      expect(r.contadas).toBe(total);
      expect(r.subio).toBe(false);
    }
  });

  it("al subir llena primero lo que tiene lugar; al bajar quita desde la última hacia atrás", () => {
    const g = grupo(5, 5);
    const sube = repartirTotal(g, 12);
    expect(contadasDe(sube, "l-lima")).toBe(7);
    expect(sube.cambios).toHaveLength(1);
    const baja = repartirTotal(g, 6);
    expect([contadasDe(baja, "l-sofia"), contadasDe(baja, "l-lima")]).toEqual([undefined, 1]);
    const mas = repartirTotal(g, 3);
    expect([contadasDe(mas, "l-sofia"), contadasDe(mas, "l-lima")]).toEqual([3, 0]);
    expect(repartirTotal(g, 10).cambios).toEqual([]);
  });

  it("es siempre el mismo para los mismos datos: no arrastra un reparto de antes", () => {
    // Un reparto viejo (7 y 3 sobre una categoría de 5 y 7 sin nada separado) se vuelve a acomodar solo: nunca una línea de más y otra de menos.
    const r = repartirTotal(grupo(7, 3), 10);
    expect([contadasDe(r, "l-sofia"), contadasDe(r, "l-lima")]).toEqual([5, 5]);
    // Con lo separado puesto en su línea, el resto llena lo que queda.
    const sep = repartirTotal(grupo(5, 5, 6, 0), 10);
    expect([contadasDe(sep, "l-sofia"), contadasDe(sep, "l-lima")]).toEqual([6, 4]);
  });
  it("nunca baja de lo separado ni de lo que ya entró al stock: pasa a lo mínimo y lo dice", () => {
    const g = grupo(5, 5, 4, 5);
    const r = repartirTotal(g, 6);
    // Pidió 6 pero ya hay 9 separadas: la categoría queda en 9 (Sofía baja de 5 a 4, que es lo suyo; Lima no puede bajar de 5).
    expect(r.contadas).toBe(9);
    expect(r.subio).toBe(true);
    expect(r.cambios.map((c) => [c.linea.linea?.id, c.contadas])).toEqual([["l-sofia", 4]]);
    const conStock = agruparLineas([deLaGuia(sofia(), { contadas: 5, en_stock: 5 }), deLaGuia(lima(), { contadas: 5 })])[0];
    expect(repartirTotal(conStock, 5).cambios.map((c) => [c.linea.linea?.id, c.contadas])).toEqual([["l-lima", 0]]);
  });

  it("una categoría de una sola línea se porta como siempre", () => {
    const g = agruparLineas([deLaGuia(linea("solo", 12), { contadas: 4 })])[0];
    const r = repartirTotal(g, 20);
    expect(contadasDe(r, "solo")).toBe(20);
    expect(repartirTotal(g, 2).cambios[0].contadas).toBe(2);
  });

  it("siempre cuadra: la suma es el total (o lo mínimo) y ninguna línea baja de lo suyo", () => {
    // Un recorrido con números repetibles: de lo que haya, a cualquier total.
    let semilla = 393;
    const azar = (n: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % n;
    };
    for (let i = 0; i < 400; i++) {
      const sa = azar(4);
      const sb = azar(4);
      const g = grupo(sa + azar(6), sb + azar(9), sa, sb);
      const total = azar(20);
      const r = repartirTotal(g, total);
      const minimos = [sa, sb];
      const despues = g.lineas.map((l) => r.cambios.find((c) => c.linea === l)?.contadas ?? l.conteo?.contadas ?? 0);
      expect(despues.reduce((a, x) => a + x, 0)).toBe(Math.max(total, minimos[0] + minimos[1]));
      despues.forEach((c, k) => expect(c).toBeGreaterThanOrEqual(minimos[k]));
    }
  });
});

describe("repartir lo separado: cada prenda va a su línea y los números se acomodan", () => {
  const g = (a: number | null, b: number | null) =>
    agruparLineas([deLaGuia(sofia(), a === null ? null : { contadas: a }), deLaGuia(lima(), b === null ? null : { contadas: b })])[0];

  it("separar Sofía 7 y Lima 3 con 10 contadas deja 7 y 3, cada prenda en la línea que la anotó", () => {
    const r = repartirSeparado(g(5, 5), { prendas: [sep("p-lima", "Vestido Lima", 3), sep("p-sofia", "Vestido Sofía", 7)], nuevas: [] }, 10);
    const sofiaL = r.cambios.find((c) => c.linea.linea?.id === "l-sofia");
    const limaL = r.cambios.find((c) => c.linea.linea?.id === "l-lima");
    expect([sofiaL?.contadas, limaL?.contadas]).toEqual([7, 3]);
    expect(sofiaL?.separado.prendas.map((p) => p.productoId)).toEqual(["p-sofia"]);
    expect(limaL?.separado.prendas.map((p) => p.productoId)).toEqual(["p-lima"]);
    expect(r.contadas).toBe(10);
  });

  it("separar de más sube lo contado de la categoría, y quitar lo separado devuelve la línea a su reparto", () => {
    const sube = repartirSeparado(g(5, 0), { prendas: [sep("p-lima", "Vestido Lima", 9)], nuevas: [] }, 5);
    expect(sube.contadas).toBe(9);
    expect(sube.subio).toBe(true);
    expect(sube.cambios.find((c) => c.linea.linea?.id === "l-lima")?.contadas).toBe(9);
    const vuelve = repartirSeparado(
      agruparLineas([deLaGuia(sofia(), { contadas: 5 }), deLaGuia(lima(), { contadas: 5, separado: { prendas: [prendaSep("p-lima", "Vestido Lima", 5)], nuevas: [] } })])[0],
      { prendas: [], nuevas: [] },
      10,
    );
    expect(vuelve.cambios.map((c) => [c.linea.linea?.id, c.separado.prendas.length])).toEqual([["l-lima", 0]]);
    expect(vuelve.contadas).toBe(10);
  });

  it("una prenda anotada solo por nombre va a la línea de ese nombre; una que nadie anotó, a la primera", () => {
    const l1 = linea("l-midi", 12, { descripcion: "Vestido midi" });
    const l2 = linea("l-largo", 4, { descripcion: "Vestido largo" });
    const grupo = agruparLineas([deLaGuia(l1), deLaGuia(l2)])[0];
    const r = repartirSeparado(
      grupo,
      { prendas: [sep("p-otra", "Vestido Rosa", 1)], nuevas: [{ cantidad: 4, descripcion: "vestido LARGO" }, { cantidad: 2, descripcion: null }] },
      12,
    );
    const en = (id: string) => r.cambios.find((c) => c.linea.linea?.id === id)?.separado;
    expect(en("l-largo")?.nuevas).toEqual([{ cantidad: 4, descripcion: "vestido LARGO" }]);
    expect(en("l-midi")?.prendas.map((p) => p.productoId)).toEqual(["p-otra"]);
    expect(en("l-midi")?.nuevas).toEqual([{ cantidad: 2, descripcion: null }]);
  });

  it("lo que ya estaba separado en una línea se queda donde estaba, aunque otra la hubiera anotado", () => {
    const grupo = agruparLineas([
      deLaGuia(sofia(), { contadas: 5, separado: { prendas: [prendaSep("p-lima", "Vestido Lima", 2)], nuevas: [] } }),
      deLaGuia(lima(), { contadas: 5 }),
    ])[0];
    const r = repartirSeparado(grupo, { prendas: [sep("p-lima", "Vestido Lima", 3)], nuevas: [] }, 10);
    expect(r.cambios.find((c) => c.linea.linea?.id === "l-sofia")?.separado.prendas[0].cantidad).toBe(3);
    expect(r.cambios.find((c) => c.linea.linea?.id === "l-lima")).toBeUndefined();
  });
});

describe("lo que muestra la pantalla de una categoría", () => {
  const dosVestidos = (a: Cuerpo | null = null, b: Cuerpo | null = null) => agruparLineas([deLaGuia(sofia(), a), deLaGuia(lima(), b)])[0];

  it("las anotadas al comprar son las de todas sus líneas; al separarse salen de la lista, y si se quitan de ahí vuelven solas", () => {
    expect(anotadasDelGrupo(dosVestidos()).map((a) => [a.linea.linea?.id, a.prenda.nombre, a.prenda.cantidad])).toEqual([
      ["l-sofia", "Vestido Sofía", 5],
      ["l-lima", "Vestido Lima", 7],
    ]);
    expect(anotadasPorSepararDelGrupo(dosVestidos()).map((a) => a.prenda.nombre)).toEqual(["Vestido Sofía", "Vestido Lima"]);
    // Sofía separada en la línea de Lima (se eligió desde el buscador): igual sale de la lista de la categoría.
    const separada = dosVestidos({ contadas: 5 }, { contadas: 7, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 2)], nuevas: [] } });
    expect(anotadasPorSepararDelGrupo(separada).map((a) => a.prenda.nombre)).toEqual(["Vestido Lima"]);
    // Lo anotado solo por su nombre se reconoce por su descripción, sin mayúsculas.
    const midi = agruparLineas([deLaGuia(linea("l-midi", 12, { descripcion: "Vestido midi" }), { contadas: 12, separado: { prendas: [], nuevas: [{ cantidad: 12, descripcion: "vestido MIDI" }] } })])[0];
    expect(anotadasDelGrupo(midi)).toHaveLength(1);
    expect(anotadasPorSepararDelGrupo(midi)).toEqual([]);
    // La misma prenda comprada en dos líneas es una sola, con las cantidades sumadas.
    const repetida = agruparLineas([deLaGuia(linea("a", 3, { descripcion: "Blusa manga corta" })), deLaGuia(linea("b", 1, { descripcion: "blusa  MANGA corta" }))])[0];
    expect(anotadasDelGrupo(repetida).map((a) => [a.linea.linea?.id, a.prenda.nombre, a.prenda.cantidad])).toEqual([["a", "Blusa manga corta", 4]]);
    // Lo que no venía en la guía no tiene nada anotado.
    expect(anotadasDelGrupo(agruparLineas([{ clave: "extra:1", linea: null, conteo: null, categoria: VESTIDOS, marca: CAYLA, proveedor: PROV, dijeron: null }])[0])).toEqual([]);
  });

  it("separar las anotadas con sus cantidades esperadas aunque se hayan contado menos: lo contado sube a lo separado", () => {
    // Contadas 5 de 12: Sofía (5) entra y no cambia el conteo; después Lima (7) entra entera y la categoría queda en 12.
    const g1 = dosVestidos({ contadas: 5 }, { contadas: 0 });
    const [a, b] = anotadasDelGrupo(g1);
    const r1 = repartirSeparado(g1, separarAnotada(g1.separado, a.prenda, a.prenda.cantidad), g1.contadas);
    expect([r1.contadas, r1.subio]).toEqual([5, false]);
    const g2 = dosVestidos({ contadas: 5, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] } }, { contadas: 0 });
    const r2 = repartirSeparado(g2, separarAnotada(g2.separado, b.prenda, b.prenda.cantidad), g2.contadas);
    expect([r2.contadas, r2.subio]).toEqual([12, true]); // subió de 5 a 12: la pantalla lo avisa
    expect(r2.cambios.map((c) => [c.linea.linea?.id, c.contadas, c.separado.prendas.map((p) => p.cantidad)])).toEqual([["l-lima", 7, [7]]]);
    // En el orden contrario también entran con lo esperado (la que no cabe en lo contado sube el conteo).
    const g3 = dosVestidos({ contadas: 5 }, { contadas: 0 });
    const r3 = repartirSeparado(g3, separarAnotada(g3.separado, b.prenda, b.prenda.cantidad), g3.contadas);
    expect([r3.contadas, r3.subio]).toEqual([7, true]);
    expect(r3.cambios.find((c) => c.linea.linea?.id === "l-lima")?.separado.prendas[0].cantidad).toBe(7);
  });

  it("el chip dice lo que falta o sobra de toda la categoría, no de una línea", () => {
    expect(veredictoDelGrupo(dosVestidos())).toEqual({ texto: "Dijeron 12. Cuenta y escribe el número.", tono: "neutro" });
    expect(veredictoDelGrupo(dosVestidos({ contadas: 5 }, { contadas: 7 }))).toEqual({ texto: "Cuadra: llegaron las 12", tono: "verde" });
    expect(veredictoDelGrupo(dosVestidos({ contadas: 5 }, { contadas: 5 })).texto).toMatch(/^Faltan 2\./);
    expect(veredictoDelGrupo(dosVestidos({ contadas: 5 }, { contadas: 9 })).texto).toMatch(/^Sobran 2\./);
  });

  it("la guía de foco pide un número por categoría: hecha cuando todas sus líneas lo tienen", () => {
    const campos = camposDelConteoPorGrupo([...agruparLineas([deLaGuia(sofia(), { contadas: 5 }), deLaGuia(lima())]), ...agruparLineas([deLaGuia(linea("l-f", 3, { categoria: FALDAS }), { contadas: 3 })])]);
    expect(campos.map((c) => [c.id, c.hecho, c.requerido])).toEqual([
      ["contar-item-l-sofia", false, true],
      ["contar-item-l-f", true, true],
    ]);
    expect(campos[0].nombre).toBe("Vestidos · CAYLA");
    // Un envío sin aviso recién abierto: lo único que falta es agregar lo que llegó.
    expect(camposDelConteoPorGrupo([]).map((c) => [c.id, c.hecho])).toEqual([["contar-agregar", false]]);
    // Lo de fuera de la guía no pide nada (es lo que se agrega).
    expect(camposDelConteoPorGrupo(agruparLineas([{ clave: "extra:1", linea: null, conteo: null, categoria: VESTIDOS, marca: CAYLA, proveedor: PROV, dijeron: null }]))).toEqual([]);
  });

  it("describe la categoría con los nombres de la compra, sin repetirlos", () => {
    expect(descripcionDelGrupo(dosVestidos())).toBe("Vestido Sofía, Vestido Lima");
    expect(descripcionDelGrupo(agruparLineas([deLaGuia(linea("a", 1, { descripcion: "Blusa" })), deLaGuia(linea("b", 2, { descripcion: "Blusa" }))])[0])).toBe("Blusa");
    expect(descripcionDelGrupo(agruparLineas([deLaGuia(linea("c", 1))])[0])).toBeNull();
  });

  it("una prenda se guarda en la línea donde estaba, en la que la anotó, o en la primera", () => {
    const g = dosVestidos({ contadas: 5, separado: { prendas: [prendaSep("p-lima", "Vestido Lima", 2)], nuevas: [] } }, { contadas: 5 });
    expect(lineaDeLaPrenda(g, { productoId: "p-lima" }).linea?.id).toBe("l-sofia");
    expect(lineaDeLaPrenda(dosVestidos(), { productoId: "p-lima" }).linea?.id).toBe("l-lima");
    expect(lineaDeLaPrenda(dosVestidos(), { productoId: "otra" }).linea?.id).toBe("l-sofia");
  });
});

describe("la categoría en el cierre", () => {
  const dos = (a: Cuerpo | null, b: Cuerpo | null) => agruparLineas([deLaGuia(sofia(), a), deLaGuia(lima(), b)])[0];

  it("sin separar nada, la categoría solo falta o solo sobra, y se explica UNA vez para todas sus líneas", () => {
    // Contadas 8 de 12: faltan 4, y en el orden de la compra caen en Lima (Sofía llena).
    const g = dos({ contadas: 5 }, { contadas: 3 });
    const causas = causasDelGrupo(g, 0, false);
    expect(causas.map((c) => [c.tipo, c.cantidad, c.lineas.map((l) => l.linea?.id)])).toEqual([["faltante", 4, ["l-lima"]]]);
    // Se pasó: sobran, y van a la última.
    const mas = causasDelGrupo(dos({ contadas: 5 }, { contadas: 9 }), 0, false);
    expect(mas.map((c) => [c.tipo, c.cantidad])).toEqual([["sobrante", 2]]);
    // Cuadra: nada que explicar. Sin contar: tampoco (se pide «Contarla»).
    expect(causasDelGrupo(dos({ contadas: 5 }, { contadas: 7 }), 0, false)).toEqual([]);
    expect(causasDelGrupo(dos(null, null), 0, false)).toEqual([]);
  });

  it("si una prenda sobra y otra falta (lo dijo la separación), se explican las dos por separado", () => {
    // Sofía 7 de 5 (+2) y Lima 3 de 7 (−4), todo separado: dos causas, cada una con su línea.
    const g = dos({ contadas: 7, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 7)], nuevas: [] } }, { contadas: 3, separado: { prendas: [prendaSep("p-lima", "Vestido Lima", 3)], nuevas: [] } });
    const causas = causasDelGrupo(g, 0, false);
    expect(causas.map((c) => [c.tipo, c.cantidad, c.lineas.map((l) => l.linea?.id)])).toEqual([
      ["faltante", 4, ["l-lima"]],
      ["sobrante", 2, ["l-sofia"]],
    ]);
  });

  it("la categoría se ve como una sola línea: lo que dijeron, lo contado y lo que queda para después", () => {
    const g = dos(
      { contadas: 5, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] } },
      { contadas: 5, separado: { prendas: [], nuevas: [{ cantidad: 2, descripcion: "Vestido midi" }] } },
    );
    const v = lineaDelGrupo(g);
    expect([v.dijeron, v.conteo?.contadas, diferenciaDe(v)]).toEqual([12, 10, -2]);
    expect(detalleParaDespues(v)).toEqual(["Vestido Sofía · 5 sin tallas ni colores", "Vestido midi · 2 por crear", "3 vestidos sin separar"]);
    expect(unidadesSinIdentificar(v)).toBe(3);
    // Sin ningún conteo no inventa uno.
    expect(lineaDelGrupo(dos(null, null)).conteo).toBeNull();
  });

  it("la guía del cierre pide una causa y un «cuéntala» por categoría, no por línea", () => {
    const base = { sinAviso: false, responsable: true, decisiones: {} };
    const g = dos({ contadas: 5 }, { contadas: 3 });
    const lineas = g.lineas;
    const campos = camposDelCierrePorGrupo(camposDelCierre({ ...base, lineas }), [g]);
    expect(campos.filter((c) => c.id.startsWith("causa")).map((c) => [c.id, c.hecho, c.nombre])).toEqual([["causa-item-l-lima", false, "Qué pasó · Vestidos · CAYLA"]]);
    // Una categoría sin contar: un solo «cuéntala» aunque falten las dos líneas.
    const sin = dos(null, null);
    const camposSin = camposDelCierrePorGrupo(camposDelCierre({ ...base, lineas: sin.lineas }), [sin]);
    expect(camposSin.filter((c) => c.id.startsWith("contar")).map((c) => c.id)).toEqual(["contar-item-l-sofia"]);
    // Lo demás de la guía (responsable…) se queda como estaba.
    expect(camposSin.at(-1)?.id).toBe("responsable");
    // Y con la causa elegida en las líneas que faltaron, queda hecho.
    const decisiones = { "item:l-lima": { costo: "", confirmaCosto: false, faltanteCausa: "no_vino" as const, sobranteCausa: null, nota: "" } };
    const hechas = camposDelCierrePorGrupo(camposDelCierre({ ...base, lineas, decisiones }), [g]);
    expect(hechas.find((c) => c.id === "causa-item-l-lima")?.hecho).toBe(true);
  });

  it("lo que se manda a cerrar sigue siendo por línea, con la misma causa en las que faltaron", () => {
    const g = dos({ contadas: 5 }, { contadas: 3 });
    const decisiones = { "item:l-sofia": { costo: "30", confirmaCosto: false, faltanteCausa: null, sobranteCausa: null, nota: "" }, "item:l-lima": { costo: "45", confirmaCosto: false, faltanteCausa: "no_vino" as const, sobranteCausa: null, nota: "" } };
    const enviadas = lineasParaCerrar(g.lineas, decisiones, false);
    expect(enviadas.map((l) => [l.despacho_item_id, l.faltante_causa, l.sobrante_causa])).toEqual([
      ["l-sofia", null, null],
      ["l-lima", "no_vino", null],
    ]);
  });
});
