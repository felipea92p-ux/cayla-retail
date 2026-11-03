import { describe, expect, it } from "vitest";
import {
  camposDelConteoPorModelo,
  cantidadDeModelo,
  categoriasDelEnvio,
  categoriasEnOrden,
  gruposDelFiltro,
  idCampoParada,
  modelosDelGrupo,
  necesitaTotal,
  nombreDeParada,
  opcionesDelFiltro,
  origenDelGrupo,
  paradaContada,
  paradaEnFoco,
  paradasDelGrupo,
  prendasParecidas,
  repartirModelo,
  repartirOtroCambio,
  resumenDeCategoria,
  SIN_FILTRO,
  SIN_PROVEEDOR,
} from "./recepcion-modelos-reglas";
import { agruparLineas, idCampoIdentificar, sinIdentificarDelGrupo, type GrupoDeLineas } from "./recepcion-grupos-reglas";
import { leerConteosDelEnvio, TOPES_CONTEO, totalSeparado, type LineaParaContar, type Separado } from "./recepcion-conteo-reglas";
import type { LineaEnvio } from "./recepcion-envio-reglas";

const VESTIDOS = { id: "c-vestidos", nombre: "Vestidos", prefijo: "VES", familia: "vestidos" };
const FALDAS = { id: "c-faldas", nombre: "Faldas", prefijo: "FAL", familia: "faldas" };
const CAYLA = { id: "m-cayla", nombre: "CAYLA" };
const OTRA = { id: "m-otra", nombre: "Otra Marca" };
const SUR = { id: "p-sur", nombre: "Confecciones del Sur" };
const ANDINA = { id: "p-andina", nombre: "Textiles Andina" };

const linea = (id: string, enviado: number, extra: Partial<LineaEnvio> = {}): LineaEnvio => ({
  id,
  orden: { id: "o1", numero: "OC-000001" },
  posicion: 1,
  proveedor: SUR,
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

type Cuerpo = { contadas: number; separado?: Separado | Record<string, unknown>; en_stock?: number };

function deLaGuia(l: LineaEnvio, c: Cuerpo | null = null): LineaParaContar {
  const conteo = c
    ? (leerConteosDelEnvio({
        despacho_id: "d1",
        conteos: [
          {
            despacho_item_id: l.id,
            contadas: c.contadas,
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

const prendaSep = (productoId: string, nombre: string, cantidad: number, variantes: unknown = null) => ({ producto_id: productoId, nombre, cantidad, variantes });

const sofia = (extra: Partial<LineaEnvio> = {}) => linea("l-sofia", 5, { descripcion: "Vestido Sofía", prendaElegida: { productoId: "p-sofia", nombre: "Vestido Sofía", codigo: "VES-1" }, ...extra });
const antonella = (extra: Partial<LineaEnvio> = {}) => linea("l-anto", 3, { descripcion: "Vestido Antonella", prendaElegida: { productoId: "p-anto", nombre: "Vestido Antonella", codigo: "VES-2" }, ...extra });
const lima = (extra: Partial<LineaEnvio> = {}) => linea("l-lima", 7, { descripcion: "Vestido Lima", ...extra });

const grupo = (...ls: LineaParaContar[]): GrupoDeLineas => agruparLineas(ls)[0];

/** Deja lo escrito como si ya se hubiera guardado, para encadenar varios toques como los haría la persona. */
function aplicar(g: GrupoDeLineas, cambios: ReturnType<typeof repartirModelo>["cambios"]): GrupoDeLineas {
  const lineas = g.lineas.map((l) => {
    const c = cambios.find((x) => x.clave === l.clave);
    if (!c) return l;
    const base = l.conteo ?? deLaGuia(l.linea as LineaEnvio, { contadas: 0 }).conteo;
    return { ...l, conteo: { ...base!, contadas: c.contadas, separado: c.separado } };
  });
  return agruparLineas(lineas)[0];
}

describe("modelosDelGrupo", () => {
  it("lista lo anotado al comprar, sin contar todavía", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(lima()));
    expect(modelosDelGrupo(g).map((m) => [m.clave, m.nombre, m.esperadas, m.contadas, m.contado, m.estado])).toEqual([
      ["p-sofia", "Vestido Sofía", 5, 0, false, "por-contar"],
      ["nombre:vestido lima", "Vestido Lima", 7, 0, false, "por-contar"],
    ]);
  });

  it("dice cómo va cada uno: a medias, cuadra, sobran, no llegó", () => {
    const g = grupo(
      deLaGuia(sofia(), { contadas: 5, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] } }),
      deLaGuia(antonella(), { contadas: 1, separado: { prendas: [prendaSep("p-anto", "Vestido Antonella", 1)], nuevas: [] } }),
      deLaGuia(lima(), { contadas: 9, separado: { prendas: [], nuevas: [{ cantidad: 9, descripcion: "Vestido Lima" }] } }),
    );
    expect(modelosDelGrupo(g).map((m) => [m.nombre, m.estado])).toEqual([
      ["Vestido Sofía", "cuadra"],
      ["Vestido Antonella", "a-medias"],
      ["Vestido Lima", "sobran"],
    ]);
    const noLlego = grupo(deLaGuia(sofia(), { contadas: 0 }));
    expect(modelosDelGrupo(noLlego)[0].estado).toBe("no-llego");
  });

  it("un 0 no es «no llegó» si hay un número suelto de antes sin repartir, ni si algo ya entró al stock", () => {
    const suelto = grupo(deLaGuia(sofia(), { contadas: 4 }));
    expect(sinIdentificarDelGrupo(suelto)).toBe(4);
    expect(modelosDelGrupo(suelto)[0].estado).toBe("por-contar");
    const enStock = grupo(deLaGuia(sofia(), { contadas: 2, en_stock: 2 }));
    expect(modelosDelGrupo(enStock)[0].estado).toBe("por-contar");
  });

  it("suma lo que llegó sin estar anotado, del catálogo o nuevo con nombre; las nuevas sin nombre no son un modelo", () => {
    const g = grupo(
      deLaGuia(sofia(), {
        contadas: 7,
        separado: { prendas: [prendaSep("p-x", "Vestido Mar", 2)], nuevas: [{ cantidad: 1, descripcion: "Vestido floral" }, { cantidad: 4, descripcion: null }] },
      }),
    );
    expect(modelosDelGrupo(g).map((m) => [m.clave, m.esperadas, m.contadas, m.estado])).toEqual([
      ["p-sofia", 5, 0, "por-contar"],
      ["p-x", null, 2, "fuera"],
      ["nombre:vestido floral", null, 1, "fuera"],
    ]);
  });

  it("anotada por nombre y después creada en el catálogo con ese nombre, sigue siendo el mismo modelo", () => {
    const g = grupo(deLaGuia(lima(), { contadas: 7, separado: { prendas: [prendaSep("p-lima", "Vestido Lima", 7)], nuevas: [] } }));
    expect(modelosDelGrupo(g).map((m) => [m.clave, m.productoId, m.esperadas, m.contadas, m.estado])).toEqual([["nombre:vestido lima", "p-lima", 7, 7, "cuadra"]]);
  });

  it("la misma prenda comprada en dos líneas es un solo modelo, con sus cantidades sumadas", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(sofia({ id: "l-sofia2" })));
    const [m] = modelosDelGrupo(g);
    expect(modelosDelGrupo(g)).toHaveLength(1);
    expect(m.esperadas).toBe(10);
  });
});

describe("paradas: lo que el Dial puede contar", () => {
  it("con modelos anotados, cada modelo es una parada y no hay total", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(lima()));
    expect(necesitaTotal(g)).toBe(false);
    expect(paradasDelGrupo(g).map(nombreDeParada)).toEqual(["Vestido Sofía", "Vestido Lima"]);
  });

  it("sin nada anotado se cuenta el total (sin aviso, o una compra que no dijo qué prendas)", () => {
    const g = grupo(deLaGuia(linea("l1", 6)));
    expect(necesitaTotal(g)).toBe(true);
    expect(paradasDelGrupo(g).map(nombreDeParada)).toEqual(["Total de Vestidos"]);
  });

  it("si la compra anotó solo una parte, el total sigue a mano para lo demás", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(linea("l2", 4)));
    expect(necesitaTotal(g)).toBe(true);
    expect(paradasDelGrupo(g).map(nombreDeParada)).toEqual(["Total de Vestidos", "Vestido Sofía"]);
  });

  it("el foco: la elegida; si ya no está, otra de su grupo; si no, la primera sin contar", () => {
    const hecho = { contadas: 5, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] } };
    const paradas = categoriasDelEnvio(agruparLineas([deLaGuia(sofia(), hecho), deLaGuia(lima()), deLaGuia(linea("f", 2, { categoria: FALDAS }))])).flatMap((c) => c.paradas);
    expect(paradaEnFoco(paradas, paradas[1].clave)).toBe(paradas[1]);
    expect(paradaEnFoco(paradas, `${paradas[0].grupo.clave}::se-fue`)).toBe(paradas[0]);
    expect(nombreDeParada(paradaEnFoco(paradas, null)!)).toBe("Vestido Lima");
    expect(paradaEnFoco([], "x")).toBeNull();
  });

  it("una parada está contada aunque sea en 0; un modelo sin tocar, no", () => {
    const contada = paradasDelGrupo(grupo(deLaGuia(sofia(), { contadas: 0 })))[0];
    const sinTocar = paradasDelGrupo(grupo(deLaGuia(sofia())))[0];
    expect(paradaContada(contada)).toBe(true);
    expect(paradaContada(sinTocar)).toBe(false);
  });
});

describe("categoriasDelEnvio: cada categoría una sola vez", () => {
  const delEnvio = () =>
    agruparLineas([
      deLaGuia(sofia()),
      deLaGuia(linea("f1", 2, { categoria: FALDAS, descripcion: "Falda Ariana" })),
      deLaGuia(antonella({ proveedor: ANDINA, marca: OTRA })),
    ]);

  it("no repite la categoría aunque venga de dos proveedores o marcas, y conserva el orden del envío", () => {
    const grupos = delEnvio();
    expect(grupos).toHaveLength(3);
    const categorias = categoriasDelEnvio(grupos);
    expect(categorias.map((c) => c.categoria?.nombre)).toEqual(["Vestidos", "Faldas"]);
    expect(categorias[0].paradas.map(nombreDeParada)).toEqual(["Vestido Sofía", "Vestido Antonella"]);
    expect(categorias[0].variosOrigenes).toBe(true);
    expect(categorias[1].variosOrigenes).toBe(false);
    expect(categorias[0].dijeron).toBe(8);
  });

  it("cada modelo sigue siendo de su grupo: contar uno no toca al otro proveedor", () => {
    const [vestidos] = categoriasDelEnvio(delEnvio());
    const anto = vestidos.paradas[1];
    expect(origenDelGrupo(anto.grupo)).toBe("Textiles Andina · Otra Marca");
    const r = repartirModelo(anto.grupo, anto.modelo!, 3);
    expect(r.cambios.map((c) => c.clave)).toEqual(["item:l-anto"]);
  });

  it("resume lo contado y cuántos modelos trae", () => {
    const sinContar = categoriasDelEnvio(agruparLineas([deLaGuia(sofia())]))[0];
    expect(resumenDeCategoria(sinContar)).toBe("sin contar · 1 modelo");
    const contada = categoriasDelEnvio(agruparLineas([deLaGuia(sofia(), { contadas: 3 }), deLaGuia(lima())]))[0];
    expect(resumenDeCategoria(contada)).toBe("3 de 12 · 2 modelos");
    const grande = categoriasDelEnvio(agruparLineas([deLaGuia(linea("g", 12000, { descripcion: "Vestido Paula" }), { contadas: 9500 })]))[0];
    expect(resumenDeCategoria(grande)).toBe("9,500 de 12,000 · 1 modelo");
  });

  it("está hecha solo con todo contado y sin nada por identificar", () => {
    const sep = { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] };
    expect(categoriasDelEnvio(agruparLineas([deLaGuia(sofia(), { contadas: 5, separado: sep })]))[0].hecha).toBe(true);
    expect(categoriasDelEnvio(agruparLineas([deLaGuia(sofia(), { contadas: 5 })]))[0].hecha).toBe(false);
    expect(categoriasDelEnvio(agruparLineas([deLaGuia(sofia(), { contadas: 5, separado: sep }), deLaGuia(lima())]))[0].hecha).toBe(false);
  });
});

describe("categoriasEnOrden: por cantidad, de menos a más o de más a menos", () => {
  const modelo = (id: string, enviado: number, categoria = VESTIDOS) => linea(id, enviado, { categoria, descripcion: `Modelo ${id}`, prendaElegida: { productoId: `p-${id}`, nombre: `Modelo ${id}`, codigo: null } });
  const envio = (...conteos: Cuerpo[]) =>
    categoriasDelEnvio(
      agruparLineas([
        deLaGuia(modelo("a", 50), conteos[0] ?? null),
        deLaGuia(modelo("b", 900), conteos[1] ?? null),
        deLaGuia(modelo("c", 200), conteos[2] ?? null),
        deLaGuia(modelo("f1", 5000, FALDAS)),
        deLaGuia(modelo("f2", 3000, FALDAS)),
      ]),
    );
  const nombres = (c: { paradas: Parameters<typeof nombreDeParada>[0][] }) => c.paradas.map(nombreDeParada);

  it("sin orden deja todo como viene en la compra", () => {
    const categorias = envio();
    expect(categoriasEnOrden(categorias, null)).toBe(categorias);
  });

  it("de menos a más ordena las categorías por su total y, dentro, sus modelos", () => {
    const [primera, segunda] = categoriasEnOrden(envio(), "asc");
    expect(primera.categoria?.nombre).toBe("Vestidos");
    expect(nombres(primera)).toEqual(["Modelo a", "Modelo c", "Modelo b"]);
    expect(segunda.categoria?.nombre).toBe("Faldas");
    expect(nombres(segunda)).toEqual(["Modelo f2", "Modelo f1"]);
  });

  it("de más a menos, al revés", () => {
    const [primera, segunda] = categoriasEnOrden(envio(), "desc");
    expect(primera.categoria?.nombre).toBe("Faldas");
    expect(nombres(primera)).toEqual(["Modelo f1", "Modelo f2"]);
    expect(nombres(segunda)).toEqual(["Modelo b", "Modelo c", "Modelo a"]);
  });

  it("con la misma cantidad queda el orden de la compra", () => {
    const iguales = categoriasDelEnvio(agruparLineas([deLaGuia(modelo("a", 10)), deLaGuia(modelo("b", 10)), deLaGuia(modelo("c", 10))]));
    expect(nombres(categoriasEnOrden(iguales, "asc")[0])).toEqual(["Modelo a", "Modelo b", "Modelo c"]);
    expect(nombres(categoriasEnOrden(iguales, "desc")[0])).toEqual(["Modelo a", "Modelo b", "Modelo c"]);
  });

  it("va por lo que anotó Compras: contar no mueve las filas bajo el dedo de quien cuenta", () => {
    const antes = categoriasEnOrden(envio(), "desc");
    const contando = categoriasEnOrden(envio({ contadas: 40000 }, { contadas: 1 }), "desc");
    expect(contando.map((c) => nombres(c))).toEqual(antes.map((c) => nombres(c)));
  });

  it("lo que Compras no anotó va por lo contado", () => {
    const sep = { prendas: [prendaSep("p-otra", "Vestido Otro", 500)], nuevas: [] };
    const [vestidos] = categoriasEnOrden(categoriasDelEnvio(agruparLineas([deLaGuia(modelo("a", 50), { contadas: 550, separado: sep }), deLaGuia(modelo("b", 900))])), "desc");
    expect(nombres(vestidos)).toEqual(["Modelo b", "Vestido Otro", "Modelo a"]);
  });

  it("no pierde nada ni toca la lista original", () => {
    const categorias = envio();
    const original = categorias.map((c) => nombres(c));
    const ordenadas = categoriasEnOrden(categorias, "asc");
    expect(ordenadas.flatMap((c) => nombres(c)).sort()).toEqual(original.flat().sort());
    expect(categorias.map((c) => nombres(c))).toEqual(original);
  });

  it("«Falta: …» de la guía dice los modelos en el orden en que se ven", () => {
    const campos = camposDelConteoPorModelo(categoriasEnOrden(envio(), "desc"));
    expect(campos.map((c) => c.nombre)).toEqual(["Modelo f1", "Modelo f2", "Modelo b", "Modelo c", "Modelo a"]);
  });
});

describe("el filtro por proveedor y marca", () => {
  const grupos = () =>
    agruparLineas([
      deLaGuia(sofia()),
      deLaGuia(linea("f1", 2, { categoria: FALDAS, descripcion: "Falda Ariana", marca: OTRA })),
      deLaGuia(antonella({ proveedor: ANDINA, marca: OTRA })),
    ]);

  it("deja solo las categorías y modelos de ese proveedor o marca", () => {
    const delSur = gruposDelFiltro(grupos(), { ...SIN_FILTRO, proveedorId: SUR.id });
    expect(categoriasDelEnvio(delSur).flatMap((c) => c.paradas).map(nombreDeParada)).toEqual(["Vestido Sofía", "Falda Ariana"]);
    const deOtra = gruposDelFiltro(grupos(), { ...SIN_FILTRO, marcaId: OTRA.id });
    expect(categoriasDelEnvio(deOtra).map((c) => c.categoria?.nombre)).toEqual(["Faldas", "Vestidos"]);
    const ambos = gruposDelFiltro(grupos(), { proveedorId: ANDINA.id, marcaId: OTRA.id });
    expect(categoriasDelEnvio(ambos).flatMap((c) => c.paradas).map(nombreDeParada)).toEqual(["Vestido Antonella"]);
  });

  it("cada filtro ofrece lo que queda con el otro puesto, para no llegar a una lista vacía", () => {
    const todas = opcionesDelFiltro(grupos(), SIN_FILTRO);
    expect(todas.proveedores.map((o) => o.etiqueta)).toEqual(["Confecciones del Sur", "Textiles Andina"]);
    expect(todas.marcas.map((o) => o.etiqueta)).toEqual(["CAYLA", "Otra Marca"]);
    const conAndina = opcionesDelFiltro(grupos(), { ...SIN_FILTRO, proveedorId: ANDINA.id });
    expect(conAndina.marcas.map((o) => o.etiqueta)).toEqual(["Otra Marca"]);
    const conCayla = opcionesDelFiltro(grupos(), { ...SIN_FILTRO, marcaId: CAYLA.id });
    expect(conCayla.proveedores.map((o) => o.etiqueta)).toEqual(["Confecciones del Sur"]);
  });

  it("con un solo proveedor o marca en el envío, ese filtro no hace falta", () => {
    const uno = opcionesDelFiltro(agruparLineas([deLaGuia(sofia()), deLaGuia(lima())]), SIN_FILTRO);
    expect(uno.hayQueFiltrarProveedor).toBe(false);
    expect(uno.hayQueFiltrarMarca).toBe(false);
    expect(opcionesDelFiltro(grupos(), SIN_FILTRO).hayQueFiltrarProveedor).toBe(true);
  });

  it("lo que llegó sin proveedor se puede filtrar como «Por confirmar»", () => {
    const g = agruparLineas([deLaGuia(sofia({ proveedor: null as never })), deLaGuia(antonella())]);
    const o = opcionesDelFiltro(g, SIN_FILTRO);
    expect(o.proveedores).toContainEqual({ valor: SIN_PROVEEDOR, etiqueta: "Por confirmar" });
    expect(gruposDelFiltro(g, { ...SIN_FILTRO, proveedorId: SIN_PROVEEDOR })).toHaveLength(1);
  });
});

describe("contar un modelo", () => {
  const modelo = (g: GrupoDeLineas, clave: string) => modelosDelGrupo(g).find((m) => m.clave === clave)!;

  it("contar un modelo escribe solo su línea y las demás siguen sin contar", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(antonella()), deLaGuia(lima()));
    const r = repartirModelo(g, modelo(g, "p-sofia"), 5);
    expect(r.cambios.map((c) => [c.clave, c.contadas, totalSeparado(c.separado)])).toEqual([["item:l-sofia", 5, 5]]);
    expect(r.contadas).toBe(5);
    const despues = aplicar(g, r.cambios);
    expect(modelo(despues, "p-sofia").estado).toBe("cuadra");
    expect(modelo(despues, "p-anto").contado).toBe(false);
    expect(despues.contado).toBe(false);
  });

  it("un modelo anotado solo por nombre se guarda como nueva con su descripción", () => {
    const g = grupo(deLaGuia(lima()));
    const r = repartirModelo(g, modelo(g, "nombre:vestido lima"), 6);
    expect(r.cambios[0].separado.nuevas).toEqual([{ cantidad: 6, descripcion: "Vestido Lima" }]);
    expect(r.cambios[0].contadas).toBe(6);
    const despues = aplicar(g, r.cambios);
    const otra = repartirModelo(despues, modelo(despues, "nombre:vestido lima"), 4);
    expect(otra.cambios[0].separado.nuevas).toEqual([{ cantidad: 4, descripcion: "Vestido Lima" }]);
    expect(otra.cambios[0].contadas).toBe(4);
  });

  it("bajar un modelo baja el total; en 0 queda dicho que no llegó", () => {
    const g = grupo(
      deLaGuia(sofia(), { contadas: 5, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] } }),
      deLaGuia(antonella(), { contadas: 3, separado: { prendas: [prendaSep("p-anto", "Vestido Antonella", 3)], nuevas: [] } }),
    );
    const r = repartirModelo(g, modelo(g, "p-sofia"), 2);
    expect(r.contadas).toBe(5);
    expect(sinIdentificarDelGrupo(aplicar(g, r.cambios))).toBe(0);
    const cero = repartirModelo(g, modelo(g, "p-sofia"), 0);
    const quedo = aplicar(g, cero.cambios);
    expect(cero.contadas).toBe(3);
    expect(modelo(quedo, "p-sofia").estado).toBe("no-llego");
    expect(modelosDelGrupo(quedo).map((m) => m.nombre)).toContain("Vestido Sofía");
  });

  it("decir que no llegó nada de un modelo sin tocar deja su línea contada en 0", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(antonella()));
    const r = repartirModelo(g, modelo(g, "p-sofia"), 0);
    expect(r.cambios.map((c) => [c.clave, c.contadas])).toEqual([["item:l-sofia", 0]]);
    expect(modelo(aplicar(g, r.cambios), "p-sofia").contado).toBe(true);
  });

  it("subir primero usa lo contado sin saber qué era (un conteo de antes); después sube el total", () => {
    const g = grupo(deLaGuia(sofia(), { contadas: 25 }));
    expect(sinIdentificarDelGrupo(g)).toBe(25);
    const r = repartirModelo(g, modelo(g, "p-sofia"), 20);
    expect(r.contadas).toBe(25);
    expect(sinIdentificarDelGrupo(aplicar(g, r.cambios))).toBe(5);
    const mas = repartirModelo(g, modelo(g, "p-sofia"), 30);
    expect(mas.contadas).toBe(30);
  });

  it("lo que llegó sin estar anotado, en 0 sale de la lista", () => {
    const g = grupo(deLaGuia(sofia(), { contadas: 2, separado: { prendas: [prendaSep("p-x", "Vestido Mar", 2)], nuevas: [] } }));
    const r = repartirModelo(g, modelo(g, "p-x"), 0);
    expect(modelosDelGrupo(aplicar(g, r.cambios)).map((m) => m.clave)).toEqual(["p-sofia"]);
    const nueva = grupo(deLaGuia(sofia(), { contadas: 1, separado: { prendas: [], nuevas: [{ cantidad: 1, descripcion: "Vestido floral" }] } }));
    const q = repartirModelo(nueva, modelo(nueva, "nombre:vestido floral"), 0);
    const quedo = aplicar(nueva, q.cambios);
    expect(quedo.separado.nuevas).toEqual([]);
    expect(quedo.contadas).toBe(0);
  });

  it("una cifra absurda se queda en el tope de lo que la base acepta, también la primera vez", () => {
    const g = grupo(deLaGuia(sofia()));
    const tope = TOPES_CONTEO.contadas;
    expect(repartirModelo(g, modelo(g, "p-sofia"), 99_999_999).contadas).toBe(tope);
    const conUna = grupo(deLaGuia(sofia(), { contadas: 1, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 1)], nuevas: [] } }));
    expect(repartirModelo(conUna, modelo(conUna, "p-sofia"), 99_999_999).contadas).toBe(tope);
  });

  it("lo que ya entró al stock no se puede bajar: es el piso de lo contado", () => {
    const g = grupo(deLaGuia(sofia(), { contadas: 5, en_stock: 3, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 2)], nuevas: [] } }));
    const r = repartirModelo(g, modelo(g, "p-sofia"), 0);
    expect(r.contadas).toBe(3);
  });

  it("cambiar el número suelta las tallas de ese modelo, nunca las de otro", () => {
    const variantes = [{ variante_id: "v1", talla: "S", color: "Negro", cantidad: 2 }];
    const s = { prendas: [prendaSep("p-sofia", "Vestido Sofía", 2, variantes), prendaSep("p-anto", "Vestido Antonella", 2, variantes)], nuevas: [] };
    const g = grupo(deLaGuia(sofia(), { contadas: 4, separado: s }));
    const nuevo = cantidadDeModelo(g.separado, modelo(g, "p-sofia"), 3);
    expect(nuevo.prendas.find((p) => p.productoId === "p-sofia")?.variantes).toBeNull();
    expect(nuevo.prendas.find((p) => p.productoId === "p-anto")?.variantes).not.toBeNull();
  });

  it("llegó otra prenda: se escribe en la línea principal, sube lo contado y las demás siguen sin contar", () => {
    const g = grupo(deLaGuia(sofia()), deLaGuia(antonella()));
    const r = repartirOtroCambio(g, { prendas: [{ productoId: "p-x", nombre: "Vestido Mar", codigo: null, cantidad: 1, variantes: null }], nuevas: [] });
    expect(r.cambios.map((c) => [c.clave, c.contadas])).toEqual([["item:l-sofia", 1]]);
    expect(modelo(aplicar(g, r.cambios), "p-anto").contado).toBe(false);
  });

  it("bajar las que no tienen nombre baja lo contado, no deja «sin identificar»", () => {
    const g = grupo(deLaGuia(sofia(), { contadas: 3, separado: { prendas: [], nuevas: [{ cantidad: 3, descripcion: null }] } }));
    const r = repartirOtroCambio(g, { prendas: [], nuevas: [{ cantidad: 1, descripcion: null }] });
    expect(r.contadas).toBe(1);
  });

  describe("la misma prenda comprada en dos líneas", () => {
    const dos = () => grupo(deLaGuia(sofia({ id: "l-a", enviado: 48 })), deLaGuia(sofia({ id: "l-b", enviado: 250 })));
    const porLinea = (cambios: ReturnType<typeof repartirModelo>["cambios"]) => cambios.map((c) => [c.clave, c.contadas, totalSeparado(c.separado)]);

    it("contarla completa deja cada línea con lo suyo: cuadra y «Cerrar» no pide explicar nada", () => {
      const g = dos();
      const r = repartirModelo(g, modelo(g, "p-sofia"), 298);
      expect(porLinea(r.cambios)).toEqual([["item:l-a", 48, 48], ["item:l-b", 250, 250]]);
      const quedo = aplicar(g, r.cambios);
      expect(quedo.lineas.map((l) => (l.conteo?.contadas ?? 0) - (l.dijeron ?? 0))).toEqual([0, 0]);
      expect(modelo(quedo, "p-sofia").contadas).toBe(298);
      expect(modelo(quedo, "p-sofia").estado).toBe("cuadra");
    });

    it("con menos, llena en el orden de la compra; con más, lo que sobra va a la última", () => {
      const g = dos();
      expect(porLinea(repartirModelo(g, modelo(g, "p-sofia"), 100).cambios)).toEqual([["item:l-a", 48, 48], ["item:l-b", 52, 52]]);
      expect(porLinea(repartirModelo(g, modelo(g, "p-sofia"), 30).cambios)).toEqual([["item:l-a", 30, 30], ["item:l-b", 0, 0]]);
      expect(porLinea(repartirModelo(g, modelo(g, "p-sofia"), 400).cambios)).toEqual([["item:l-a", 48, 48], ["item:l-b", 352, 352]]);
    });

    it("sirve igual si está anotada solo por nombre, y bajar a 0 deja las dos dichas", () => {
      const g = grupo(deLaGuia(lima({ id: "l-a", enviado: 10 })), deLaGuia(lima({ id: "l-b", enviado: 5 })));
      const clave = "nombre:vestido lima";
      const r = repartirModelo(g, modelo(g, clave), 15);
      expect(r.cambios.map((c) => c.separado.nuevas)).toEqual([[{ cantidad: 10, descripcion: "Vestido Lima" }], [{ cantidad: 5, descripcion: "Vestido Lima" }]]);
      const quedo = aplicar(g, r.cambios);
      expect(modelo(quedo, clave).contadas).toBe(15);
      const cero = aplicar(quedo, repartirModelo(quedo, modelo(quedo, clave), 0).cambios);
      expect(cero.lineas.map((l) => l.conteo?.contadas)).toEqual([0, 0]);
      expect(modelo(cero, clave).estado).toBe("no-llego");
    });

    it("no toca lo de otro modelo que esté en esas líneas", () => {
      const conOtra = { prendas: [prendaSep("p-x", "Vestido Mar", 2)], nuevas: [] };
      const g = grupo(deLaGuia(sofia({ id: "l-a", enviado: 48 }), { contadas: 2, separado: conOtra }), deLaGuia(sofia({ id: "l-b", enviado: 250 })));
      const r = repartirModelo(g, modelo(g, "p-sofia"), 298);
      const a = r.cambios.find((c) => c.clave === "item:l-a");
      expect(a?.separado.prendas.map((p) => [p.productoId, p.cantidad]).sort()).toEqual([["p-sofia", 48], ["p-x", 2]]);
      expect(a?.contadas).toBe(50);
      expect(aplicar(g, r.cambios).contadas).toBe(300);
    });
  });

  // El CHECK `separado_cabe` de la base: en una fila, lo separado más lo que ya entró al stock nunca pasa de lo contado.
  it("después de cualquier secuencia de toques, ninguna línea queda en un estado que la base rechace, y todo sigue identificado", () => {
    const toques: [string, number][] = [["p-sofia", 5], ["nombre:vestido lima", 9], ["p-anto", 2], ["p-sofia", 0], ["p-anto", 7], ["nombre:vestido lima", 0], ["p-sofia", 12], ["p-sofia", 1]];
    let g = grupo(deLaGuia(sofia()), deLaGuia(antonella()), deLaGuia(lima()));
    for (const [clave, n] of toques) {
      g = aplicar(g, repartirModelo(g, modelo(g, clave), n).cambios);
      for (const l of g.lineas) {
        if (!l.conteo) continue;
        expect(l.conteo.contadas).toBeGreaterThanOrEqual(l.conteo.enStock + totalSeparado(l.conteo.separado));
      }
      expect(sinIdentificarDelGrupo(g)).toBe(0);
      expect(g.contadas).toBe(totalSeparado(g.separado));
    }
    expect(modelo(g, "p-sofia").contadas).toBe(1);
    expect(modelo(g, "p-anto").contadas).toBe(7);
    expect(g.contadas).toBe(8);
  });
});

describe("prendasParecidas", () => {
  const catalogo = [
    { productoId: "a", nombre: "Vestido Sofía Lino" },
    { productoId: "b", nombre: "Vestido Mar" },
    { productoId: "c", nombre: "Falda Ariana" },
    { productoId: "d", nombre: "Vestido Antonella" },
  ];

  it("ordena por palabras en común, pesando más el modelo que se está contando", () => {
    expect(prendasParecidas(catalogo, ["Vestido Sofía"], new Set()).map((p) => p.productoId)).toEqual(["a", "d", "b"]);
    expect(prendasParecidas(catalogo, ["Vestido Antonella", "Vestido Sofía"], new Set())[0].productoId).toBe("d");
  });

  it("no ofrece lo que ya está en la lista ni lo que no se parece en nada", () => {
    expect(prendasParecidas(catalogo, ["Vestido Sofía"], new Set(["a"])).map((p) => p.productoId)).toEqual(["d", "b"]);
    expect(prendasParecidas(catalogo, ["Chompa"], new Set())).toEqual([]);
  });

  it("no le importan las tildes ni las mayúsculas; sin nada que comparar, las primeras", () => {
    expect(prendasParecidas(catalogo, ["VESTIDO SOFIA"], new Set())[0].productoId).toBe("a");
    expect(prendasParecidas(catalogo, [], new Set(), 2).map((p) => p.productoId)).toEqual(["a", "b"]);
  });
});

describe("la guía de foco", () => {
  it("sin nada en la lista, lo que sigue es agregar lo que llegó", () => {
    expect(camposDelConteoPorModelo([]).map((c) => [c.id, c.hecho])).toEqual([["contar-agregar", false]]);
  });

  it("pide cada modelo anotado; lo que no venía anotado no pide nada", () => {
    const g = agruparLineas([
      deLaGuia(sofia(), { contadas: 7, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5), prendaSep("p-x", "Vestido Mar", 2)], nuevas: [] } }),
      deLaGuia(antonella()),
    ]);
    const categorias = categoriasDelEnvio(g);
    const campos = camposDelConteoPorModelo(categorias);
    expect(campos.map((c) => [c.nombre, c.hecho])).toEqual([
      ["Vestido Sofía", true],
      ["Vestido Antonella", false],
    ]);
    const parada = categorias[0].paradas.find((p) => p.modelo?.clave === "p-anto")!;
    expect(campos[1].id).toBe(idCampoParada(parada));
  });

  it("pide identificar lo que quedó contado sin saber qué es, y lo lleva a la placa", () => {
    const categorias = categoriasDelEnvio(agruparLineas([deLaGuia(sofia(), { contadas: 8 })]));
    const campos = camposDelConteoPorModelo(categorias);
    const identificar = campos.find((c) => c.id === idCampoIdentificar(categorias[0].grupos[0].clave));
    expect(identificar?.hecho).toBe(false);
    expect(identificar?.pendiente).toMatch(/^Faltan 8 prendas por identificar en Vestidos/);
  });

  it("sin aviso: lo de fuera de la guía no pide su número, pero sí que se sepa qué es", () => {
    const extra: LineaParaContar = { ...deLaGuia(linea("x", 0), { contadas: 4 }), clave: "extra:1", linea: null, dijeron: null };
    const categorias = categoriasDelEnvio(agruparLineas([extra]));
    expect(camposDelConteoPorModelo(categorias).map((c) => c.id)).toEqual([idCampoIdentificar("extra:1")]);
  });
});
