import { describe, expect, it } from "vitest";
import {
  SEPARADO_VACIO,
  argsGuardarConteo,
  argsResolverPendiente,
  cambiarCantidadPrenda,
  camposDelCierre,
  camposDelConteo,
  ID_CAMPO_AGREGAR,
  cambiarNuevasSinDescribir,
  conteoDeVariantes,
  causasDe,
  cifrasDelEnvio,
  claveDe,
  contadasParaGuardar,
  decisionInicial,
  detallarPrenda,
  detalladas,
  diasDesde,
  faltaParaCerrar,
  leerConteosDelEnvio,
  leerCostoCierre,
  leerGuardado,
  leerPendientesDeLaSede,
  leerResuelto,
  lineaVisible,
  lineasParaCerrar,
  lineasParaContar,
  nuevasSinDescribir,
  paraDespues,
  ponerTallas,
  separadoParaBase,
  sumarPrenda,
  textoAvisoPendientes,
  textoBotonCerrar,
  textoNoSeReabre,
  textoPisaste,
  textoResuelto,
  totalSeparado,
  variantesDeConteo,
  veredictoDe,
  type DecisionCierre,
  type LineaParaContar,
  type Separado,
  necesitaCatalogoAlCerrar,
  resumenDelCierre,
  textoResumenDelCierre,
  veredictoDelCerrado,
  lineasALaVista,
  leerContadas,
  mensajeAlGuardar,
  esEnvioSinAviso,
  detalleDeEnvioSinAviso,
} from "./recepcion-conteo-reglas";
import type { LineaEnvio } from "./recepcion-envio-reglas";

const DECISION_PARA_PRUEBA: DecisionCierre = { costo: "30.00", confirmaCosto: false, faltanteCausa: null, sobranteCausa: null, nota: "" };

const CAT = { id: "c1", nombre: "Chompas", prefijo: "CHO", familia: "tejidos" };
const MARCA = { id: "m1", nombre: "Lima Knit" };
const PROV = { id: "p1", nombre: "Textil Norte" };
const linea = (id: string, enviado: number, extra: Partial<LineaEnvio> = {}): LineaEnvio => ({
  id,
  orden: { id: "o1", numero: "OC-000001" },
  posicion: 1,
  proveedor: PROV,
  categoria: CAT,
  marca: MARCA,
  descripcion: null,
  enviado,
  costoUnitario: 30,
  compraItemId: null,
  precioVentaSugerido: null,
  ...extra,
});

const conteoCrudo = (o: Record<string, unknown>) => ({
  despacho_id: "d1",
  contadas: 0,
  separado: { prendas: [], nuevas: [] },
  costo_unitario: null,
  version: 1,
  contado_por: { id: "per1", nombre: "Mariana Quispe" },
  contado_en: "2026-10-13T15:00:00Z",
  en_stock: 0,
  sin_separar: 0,
  pendientes: [],
  ...o,
});

describe("lo separado: el borrador de «¿Qué blusas son?»", () => {
  const aurora = { productoId: "pa", nombre: "Blusa Aurora", codigo: "BLU-1" };

  it("suma una prenda conocida, la cambia, la quita en 0, y cuenta lo separado y lo detallado", () => {
    let s: Separado = sumarPrenda(SEPARADO_VACIO, aurora, 3);
    s = sumarPrenda(s, aurora);
    expect(s.prendas).toHaveLength(1);
    expect(s.prendas[0].cantidad).toBe(4);
    s = cambiarNuevasSinDescribir(s, 2);
    expect(totalSeparado(s)).toBe(6);
    expect(detalladas(s)).toBe(0);
    s = cambiarCantidadPrenda(s, "pa", 0);
    expect(s.prendas).toHaveLength(0);
  });

  it("detallar pone la cantidad en la suma de las tallas; cambiar el número suelta el detalle si ya no cuadra", () => {
    let s = sumarPrenda(SEPARADO_VACIO, aurora, 3);
    s = detallarPrenda(s, "pa", [
      { varianteId: "v1", cantidad: 2, danadas: 5, solucion: "pendiente", talla: "S", color: "Negro", codigo: null },
      { varianteId: "v2", cantidad: 3, danadas: 0, solucion: null, talla: "M", color: "Negro", codigo: null },
      { varianteId: "v3", cantidad: 0, danadas: 0, solucion: null, talla: "L", color: "Negro", codigo: null },
    ]);
    expect(s.prendas[0].cantidad).toBe(5);
    expect(s.prendas[0].variantes?.map((v) => [v.varianteId, v.cantidad, v.danadas])).toEqual([
      ["v1", 2, 2],
      ["v2", 3, 0],
    ]);
    expect(detalladas(s)).toBe(5);
    expect(cambiarCantidadPrenda(s, "pa", 5).prendas[0].variantes).not.toBeNull();
    expect(cambiarCantidadPrenda(s, "pa", 6).prendas[0].variantes).toBeNull();
    expect(detallarPrenda(s, "pa", []).prendas[0].variantes).toBeNull();
  });

  it("las nuevas sin describir son una sola fila, y en 0 se quitan", () => {
    let s = cambiarNuevasSinDescribir(SEPARADO_VACIO, 3);
    expect(nuevasSinDescribir(s)).toBe(3);
    expect(s.nuevas).toEqual([{ cantidad: 3, descripcion: null }]);
    s = cambiarNuevasSinDescribir(s, 0);
    expect(s.nuevas).toEqual([]);
  });

  it("lo que guarda la base: sin nombres, las tallas en 0 fuera y la solución solo con dañadas", () => {
    const s: Separado = {
      prendas: [
        { productoId: "pa", nombre: "Blusa Aurora", codigo: null, cantidad: 3, variantes: [
          { varianteId: "v1", cantidad: 3, danadas: 0, solucion: "pendiente", talla: null, color: null, codigo: null },
          { varianteId: "v2", cantidad: 0, danadas: 0, solucion: null, talla: null, color: null, codigo: null },
        ] },
        { productoId: "pb", nombre: null, codigo: null, cantidad: 2, variantes: null },
      ],
      nuevas: [{ cantidad: 1, descripcion: " " }],
    };
    expect(separadoParaBase(s)).toEqual({
      prendas: [
        { producto_id: "pa", cantidad: 3, variantes: [{ variante_id: "v1", cantidad: 3, danadas: 0, danada_solucion: null }] },
        { producto_id: "pb", cantidad: 2, variantes: null },
      ],
      nuevas: [{ cantidad: 1, descripcion: null }],
    });
  });

  it("perdonar antes que preguntar: si lo separado pasa de lo contado, el número sube; reabierto, no baja de lo que ya entró", () => {
    const s = cambiarNuevasSinDescribir(SEPARADO_VACIO, 5);
    expect(contadasParaGuardar(3, s)).toEqual({ contadas: 5, subio: true });
    expect(contadasParaGuardar(8, s)).toEqual({ contadas: 8, subio: false });
    expect(contadasParaGuardar(8, s, 4)).toEqual({ contadas: 9, subio: true });
    expect(contadasParaGuardar(-3, SEPARADO_VACIO)).toEqual({ contadas: 0, subio: false });
  });
});

describe("leer lo contado de un envío (fn_envio_conteos)", () => {
  it("lee líneas, lo de fuera de la guía, pendientes, el rastro y si se puede reabrir; descarta lo que no se entiende", () => {
    const c = leerConteosDelEnvio({
      despacho_id: "d1",
      estado: "cerrado",
      origen: "sin_aviso",
      proveedores: [PROV, { id: "x" }],
      conteos: [
        conteoCrudo({ despacho_item_id: "i1", contadas: 10, en_stock: 4, sin_separar: 1, separado: { prendas: [{ producto_id: "pa", cantidad: 3, nombre: "Blusa Aurora", variantes: null }, { producto_id: "pz", cantidad: 0 }], nuevas: [{ cantidad: 2, descripcion: "con lazo" }] }, pendientes: [
          { id: "pe1", tipo: "detalle", cantidad: 3, quedan: 2, producto: { id: "pa", nombre: "Blusa Aurora", codigo: "BLU-1" }, estado: "pendiente" },
          { id: "pe2", tipo: "raro", cantidad: 1, quedan: 1, estado: "pendiente" },
        ] }),
        conteoCrudo({ extra_posicion: 1, contadas: 3, proveedor: PROV, categoria: CAT, marca: MARCA }),
        { contadas: 4 },
      ],
      cierres: [{ tipo: "cierre", resultado: { por_detallar: 8, faltan: 2 }, hecho_por: { id: "per1", nombre: "Mariana" } }, { tipo: "otro" }],
      reabrir: { se_puede: false, por_que_no: "reabrir_deuda_resuelta" },
    });
    expect(c?.origen).toBe("sin_aviso");
    expect(c?.proveedores).toEqual([PROV]);
    expect(c?.conteos).toHaveLength(2);
    expect(c?.conteos[0].separado.prendas.map((p) => p.productoId)).toEqual(["pa"]);
    expect(c?.conteos[0].pendientes.map((p) => [p.id, p.quedan])).toEqual([["pe1", 2]]);
    expect(c?.conteos[1].extraPosicion).toBe(1);
    expect(c?.cierres).toEqual([{ tipo: "cierre", motivo: null, hechoPor: { id: "per1", nombre: "Mariana" }, hechoEn: null, porDetallar: 8, faltan: 2 }]);
    expect(c?.reabrir).toEqual({ sePuede: false, porQueNo: "reabrir_deuda_resuelta" });
    expect(leerConteosDelEnvio(null)).toBeNull();
    expect(leerConteosDelEnvio({ estado: "abierto" })).toBeNull();
  });

  it("las líneas de la guía primero (aunque nadie las haya contado) y lo de fuera de la guía después, por posición; lo quitado en 0 no se ve", () => {
    const c = leerConteosDelEnvio({
      despacho_id: "d1",
      conteos: [
        conteoCrudo({ extra_posicion: 2, contadas: 0, proveedor: PROV, categoria: CAT, marca: MARCA }),
        conteoCrudo({ extra_posicion: 1, contadas: 3, proveedor: PROV, categoria: CAT, marca: MARCA }),
        conteoCrudo({ despacho_item_id: "i2", contadas: 4 }),
      ],
    });
    const ls = lineasParaContar({ lineas: [linea("i1", 10), linea("i2", 4)] }, c);
    expect(ls.map((l) => [l.clave, l.dijeron, l.conteo?.contadas ?? null])).toEqual([
      ["item:i1", 10, null],
      ["item:i2", 4, 4],
      ["extra:1", null, 3],
      ["extra:2", null, 0],
    ]);
    expect(ls.filter(lineaVisible).map((l) => l.clave)).toEqual(["item:i1", "item:i2", "extra:1"]);
    expect(claveDe({ despachoItemId: null, extraPosicion: 3 })).toBe("extra:3");
  });

  it("el veredicto del contador: sin contar, cuadra, faltan, sobran y sin guía", () => {
    const l = (contadas: number | null, dijeron: number | null): LineaParaContar => ({
      clave: "item:i1",
      linea: dijeron == null ? null : linea("i1", dijeron),
      conteo: contadas == null ? null : (leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ despacho_item_id: "i1", contadas })] })?.conteos[0] ?? null),
      categoria: CAT,
      marca: MARCA,
      proveedor: PROV,
      dijeron,
    });
    expect(veredictoDe(l(null, 10))).toEqual({ texto: "Dijeron 10. Cuenta y escribe el número.", tono: "neutro" });
    expect(veredictoDe(l(10, 10)).tono).toBe("verde");
    expect(veredictoDe(l(8, 10)).texto).toMatch(/^Faltan 2\./);
    expect(veredictoDe(l(12, 10)).texto).toMatch(/^Sobran 2\./);
    expect(veredictoDe(l(5, null))).toEqual({ texto: "5 contadas", tono: "neutro" });
  });
});

describe("guardar una línea", () => {
  it("la de la guía por su id y su versión; lo nuevo de fuera de la guía por su categoría y marca; uno ya anotado por su posición", () => {
    const deLaGuia = argsGuardarConteo({ despachoId: "d1", linea: { linea: linea("i1", 10), conteo: null }, contadas: 10, separado: SEPARADO_VACIO });
    expect(deLaGuia).toMatchObject({ p_despacho_item_id: "i1", p_extra_posicion: null, p_version: null, p_categoria_id: null });
    const nuevo = argsGuardarConteo({ despachoId: "d1", linea: { linea: null, conteo: null }, contadas: 2, separado: SEPARADO_VACIO, nuevo: { proveedorId: null, categoriaId: "c2", marcaId: "m1" } });
    expect(nuevo).toMatchObject({ p_despacho_item_id: null, p_extra_posicion: null, p_categoria_id: "c2", p_marca_id: "m1", p_proveedor_id: null });
    const ya = leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ extra_posicion: 2, contadas: 3, version: 4, proveedor: PROV, categoria: CAT, marca: MARCA })] })?.conteos[0] ?? null;
    expect(argsGuardarConteo({ despachoId: "d1", linea: { linea: null, conteo: ya }, contadas: 5, separado: SEPARADO_VACIO })).toMatchObject({
      p_extra_posicion: 2,
      p_version: 4,
      p_categoria_id: null,
    });
  });

  it("lee lo guardado y lo que se pisó: «Lucía había puesto 38: quedó tu 40»", () => {
    const g = leerGuardado(conteoCrudo({ despacho_item_id: "i1", contadas: 40, pisaste: { contadas: 38, contado_por: { id: "x", nombre: "Lucía Paredes" } } }));
    expect(g?.pisaste).toEqual({ contadas: 38, quien: "Lucía Paredes" });
    expect(textoPisaste(g!.pisaste!, 40)).toBe("Lucía había puesto 38: quedó tu 40");
    expect(textoPisaste({ contadas: 3, quien: null }, 5)).toBe("Otra persona había puesto 3: quedó tu 5");
    expect(leerGuardado(conteoCrudo({ despacho_item_id: "i1" }))?.pisaste).toBeNull();
  });
});

describe("cerrar", () => {
  const contada = (id: string, enviado: number, contadas: number, version = 1): LineaParaContar => {
    const c = leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ despacho_item_id: id, contadas, version })] })?.conteos[0] ?? null;
    return { clave: `item:${id}`, linea: linea(id, enviado), conteo: c, categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: enviado };
  };
  const extra = (pos: number, contadas: number): LineaParaContar => {
    const c = leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ extra_posicion: pos, contadas, proveedor: PROV, categoria: CAT, marca: MARCA })] })?.conteos[0] ?? null;
    return { clave: `extra:${pos}`, linea: null, conteo: c, categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: null };
  };
  const dec = (o: Partial<DecisionCierre> = {}): DecisionCierre => ({ costo: "30.00", confirmaCosto: false, faltanteCausa: null, sobranteCausa: null, nota: "", ...o });

  it("lo que frena, con las reglas de cerrar_conteo_envio: contar toda línea, la causa, el costo de lo de fuera de la guía y quién cierra", () => {
    const sinContar: LineaParaContar = { ...contada("i3", 4, 0), conteo: null };
    const f = faltaParaCerrar({
      lineas: [contada("i1", 10, 8), contada("i2", 4, 4), sinContar, extra(1, 3), extra(2, 0)],
      decisiones: { "item:i1": dec(), "extra:1": dec({ costo: "" }) },
      sinAviso: false,
      responsable: false,
    });
    expect(f.map((x) => [x.clave, x.linea])).toEqual([
      ["causa", "item:i1"],
      ["contar", "item:i3"],
      ["causa", "extra:1"],
      ["costo", "extra:1"],
      ["responsable", null],
    ]);
    expect(f[0].texto).toBe("Di por qué faltan 2 de Chompas · Lima Knit");
  });

  it("sin aviso: lo de fuera de la guía no pide causa ni costo; separar y detallar nunca frenan", () => {
    const f = faltaParaCerrar({ lineas: [extra(1, 3)], decisiones: { "extra:1": dec({ costo: "" }) }, sinAviso: true, responsable: true });
    expect(f).toEqual([]);
    expect(faltaParaCerrar({ lineas: [extra(1, 3)], decisiones: { "extra:1": dec({ costo: "doce" }) }, sinAviso: true, responsable: true }).map((x) => x.clave)).toEqual(["costo"]);
  });

  it("p_lineas: una por conteo con la versión vista; las causas que ya no aplican se sueltan; sin aviso sin costo va vacío", () => {
    const ls = lineasParaCerrar(
      [contada("i1", 10, 8, 3), contada("i2", 4, 4), extra(1, 3), { ...contada("i9", 1, 0), conteo: null }],
      { "item:i1": dec({ faltanteCausa: "no_vino", sobranteCausa: "regalo", nota: "  bolsa rota " }), "item:i2": dec({ faltanteCausa: "no_vino" }), "extra:1": dec({ costo: "", sobranteCausa: "regalo" }) },
      true,
    );
    expect(ls).toEqual([
      { despacho_item_id: "i1", version: 3, costo_unitario: 30, confirma_costo: false, faltante_causa: "no_vino", sobrante_causa: null, nota: "bolsa rota" },
      { despacho_item_id: "i2", version: 1, costo_unitario: 30, confirma_costo: false, faltante_causa: null, sobrante_causa: null, nota: null },
      { extra_posicion: 1, version: 1, costo_unitario: null, confirma_costo: false, faltante_causa: null, sobrante_causa: null, nota: null },
    ]);
  });

  it("las causas que se ofrecen: faltante, sobrante y la reposición solo si el proveedor debe", () => {
    expect(causasDe(contada("i1", 10, 8))?.tipo).toBe("faltante");
    expect(causasDe(contada("i1", 10, 10))).toBeNull();
    expect(causasDe(contada("i1", 10, 12))?.opciones.some((o) => o.valor === "reposicion_faltante")).toBe(false);
    expect(causasDe(contada("i1", 10, 12), 2)?.opciones.some((o) => o.valor === "reposicion_faltante")).toBe(true);
    expect(causasDe(extra(1, 3))?.tipo).toBe("sobrante");
    // Sin aviso: lo que llegó no sobra ni falta, no se pregunta qué pasó (la base tampoco lo pide).
    expect(causasDe(extra(1, 3), 0, true)).toBeNull();
  });

  it("el costo escrito: vacío es sin costo; con coma decimal; lo que no es un monto es un problema", () => {
    expect(leerCostoCierre("")).toEqual({ valor: null, problema: null });
    expect(leerCostoCierre("25.50").valor).toBe(25.5);
    expect(leerCostoCierre("doce").problema).not.toBeNull();
    expect(decisionInicial(contada("i1", 10, 8)).costo).toBe("30.00");
  });

  it("el botón dice cuántas y dónde", () => {
    expect(textoBotonCerrar(40, "Tienda Trujillo", false)).toBe("Cerrar el envío · 40 contadas en Tienda Trujillo");
    expect(textoBotonCerrar(1, null, true)).toBe("Cerrar de nuevo · 1 contada");
  });
});

describe("lo que queda para después", () => {
  it("lo sin separar, cada detalle y cada crear con lo que todavía no entró; las cifras del envío", () => {
    const c = leerConteosDelEnvio({
      despacho_id: "d1",
      estado: "cerrado",
      conteos: [
        conteoCrudo({ despacho_item_id: "i1", contadas: 10, en_stock: 4, sin_separar: 1, pendientes: [
          { id: "pe1", tipo: "detalle", cantidad: 3, quedan: 2, producto: { id: "pa", nombre: "Blusa Aurora" }, estado: "pendiente" },
          { id: "pe2", tipo: "crear", cantidad: 2, quedan: 2, descripcion: "con lazo", estado: "pendiente" },
          { id: "pe3", tipo: "detalle", cantidad: 1, quedan: 0, producto: { id: "pb" }, estado: "resuelto" },
          { id: "pe4", tipo: "crear", cantidad: 2, quedan: 1, estado: "pendiente" },
        ] }),
      ],
    });
    const ls = lineasParaContar({ lineas: [linea("i1", 12)] }, c);
    expect(paraDespues(ls).map((p) => [p.tipo, p.cantidad, p.titulo])).toEqual([
      ["separar", 1, "Separar 1 prenda"],
      ["detalle", 2, "Blusa Aurora · 2 sin tallas"],
      ["crear", 2, "2 prendas nuevas · con lazo"],
      ["crear", 1, "1 prenda nueva"],
    ]);
    expect(cifrasDelEnvio(ls)).toEqual({ contadas: 10, enStock: 4, porDetallar: 6, dijeron: 12 });
  });
});

describe("«Hacer ahora», reabrir y el aviso de la sede", () => {
  it("arma resolver_pendiente_envio y lee lo que entró", () => {
    const a = argsResolverPendiente({ despachoId: "d1", linea: { linea: linea("i1", 10), conteo: null }, pendienteId: "pe1", separado: SEPARADO_VACIO, token: "t" });
    expect(a).toMatchObject({ p_despacho_item_id: "i1", p_extra_posicion: null, p_pendiente_id: "pe1", p_confirma_costo: false, p_token: "t" });
    const r = leerResuelto({ entraron: 4, quedaron_pendientes: 1, repetido: false, linea: conteoCrudo({ despacho_item_id: "i1", contadas: 10 }) });
    expect(r?.conteo?.contadas).toBe(10);
    expect(textoResuelto(r!)).toBe("4 prendas entraron al stock · 1 quedó para después");
    expect(textoResuelto({ entraron: 0, quedaronPendientes: 0 })).toBe("Listo");
  });

  it("en la puerta, un envío sin órdenes ni líneas es uno que llegó sin aviso", () => {
    expect(esEnvioSinAviso({ lineas: 0, ordenes: [] })).toBe(true);
    expect(esEnvioSinAviso({ lineas: 2, ordenes: [] })).toBe(false);
    expect(esEnvioSinAviso({ lineas: 0, ordenes: ["OC-000465"] })).toBe(false);
    expect(detalleDeEnvioSinAviso({ numeroGuia: "T001-9" })).toBe("Llegó sin aviso: se sigue contando · guía T001-9");
    expect(detalleDeEnvioSinAviso({ numeroGuia: null })).toBe("Llegó sin aviso: se sigue contando");
  });

  it("con el envío cerrado, el catálogo se lee solo si queda algo pendiente", () => {
    const con = (estado: string, pendiente: string) =>
      leerConteosDelEnvio({
        despacho_id: "d1",
        estado,
        conteos: [conteoCrudo({ despacho_item_id: "i1", contadas: 3, pendientes: [{ id: "pe1", tipo: "crear", cantidad: 3, quedan: 3, estado: pendiente }] })],
      });
    expect(necesitaCatalogoAlCerrar(con("cerrado", "pendiente"))).toBe(true);
    expect(necesitaCatalogoAlCerrar(con("cerrado", "resuelto"))).toBe(false);
    expect(necesitaCatalogoAlCerrar(con("abierto", "pendiente"))).toBe(false);
    expect(necesitaCatalogoAlCerrar(null)).toBe(false);
  });

  it("por qué no se reabre, en palabras de tienda", () => {
    expect(textoNoSeReabre("reabrir_deuda_resuelta")).toMatch(/Compras ya resolvió/);
    expect(textoNoSeReabre("reabrir_reposicion_saldo")).toMatch(/saldó/);
    expect(textoNoSeReabre(null)).toBe("Ya no se puede reabrir");
  });

  it("el número de la sede, su texto y desde cuándo", () => {
    const p = leerPendientesDeLaSede({ por_separar: 3, por_detallar: 3, por_crear: 2, total: 8, desde: "2026-10-01T10:00:00Z", envios: [{ despacho_id: "d1", numero: "ENV-000061" }, {}] });
    expect(p.envios).toHaveLength(1);
    expect(textoAvisoPendientes(p)).toBe("8 prendas para terminar");
    expect(textoAvisoPendientes({ total: 1, envios: [p.envios[0], p.envios[0]] })).toBe("1 prenda para terminar en 2 envíos");
    expect(textoAvisoPendientes(leerPendientesDeLaSede(null))).toBeNull();
    expect(diasDesde("2026-10-01T10:00:00Z", new Date("2026-10-09T09:00:00Z"))).toBe(7);
    expect(diasDesde(null)).toBeNull();
  });
});

describe("formidable 2026-10-13: el veredicto al cerrar y lo que pasa al cerrar", () => {
  const conteo = (o: Record<string, unknown>) => leerConteosDelEnvio({ despacho_id: "d", estado: "cerrado", conteos: [conteoCrudo(o)] })?.conteos[0] ?? null;
  const extra = (o: Record<string, unknown>): LineaParaContar => ({
    clave: "extra:1",
    linea: null,
    conteo: conteo({ extra_posicion: 1, proveedor: PROV, categoria: CAT, marca: MARCA, ...o }),
    categoria: CAT,
    marca: MARCA,
    proveedor: PROV,
    dijeron: null,
  });

  it("cambio 1: sin nada en el stock, dice que están guardadas pero no se pueden vender, qué falta y el botón que lo resuelve", () => {
    const l = extra({ contadas: 5, en_stock: 0, sin_separar: 5 });
    const v = veredictoDelCerrado([l], paraDespues([l]));
    expect(v).toEqual({
      titulo: "Las 5 prendas están guardadas, pero todavía no se pueden vender",
      texto: "Están en el almacén. Para venderlas falta decir qué modelo es cada una, con su talla y su color.",
      chip: null,
      accion: "Separarlas ahora",
    });
    const una = extra({ contadas: 1, en_stock: 0, pendientes: [{ id: "p", tipo: "crear", cantidad: 1, quedan: 1, estado: "pendiente" }] });
    expect(veredictoDelCerrado([una], paraDespues([una]))).toMatchObject({
      titulo: "La prenda está guardada, pero todavía no se puede vender",
      texto: "Está en el almacén. Para venderla falta crearla en el catálogo, con su talla y su color.",
      accion: "Crearla ahora",
    });
  });

  it("cambio 1: con algo en el stock, listas para etiquetar; sin nada contado, lo dice", () => {
    const l = extra({ contadas: 5, en_stock: 3, sin_separar: 2 });
    expect(veredictoDelCerrado([l], paraDespues([l]))).toMatchObject({ titulo: "3 prendas ya están en el stock del almacén", chip: { tono: "verde" }, accion: null });
    expect(veredictoDelCerrado([], [])).toMatchObject({ titulo: "Nada entró al stock", accion: null });
  });

  it("cambio 3: al cerrar, cuántas se pueden vender ya y cuántas quedan guardadas", () => {
    const l = extra({ contadas: 5, en_stock: 0, sin_separar: 5 });
    expect(resumenDelCierre([l])).toEqual({ sePuedenVender: 0, guardadas: 5 });
    expect(textoResumenDelCierre({ sePuedenVender: 0, guardadas: 5 })).toBe("Al cerrar: 0 se pueden vender ya · 5 quedan guardadas para terminar después.");
    expect(textoResumenDelCierre({ sePuedenVender: 1, guardadas: 1 })).toBe("Al cerrar: 1 se puede vender ya · 1 queda guardada para terminar después.");
    expect(textoResumenDelCierre({ sePuedenVender: 4, guardadas: 0 })).toBe("Al cerrar: 4 se pueden vender ya.");
  });
});

describe("chaos 2026-10-13 (semilla 393): lo que la persona escribe es lo que se guarda", () => {
  it("ENT-02/ENT-06: el contador solo admite dígitos (hasta 4) y lo vacío no es 0: no se guarda nada mientras se escribe", () => {
    expect(leerContadas("")).toEqual({ texto: "", contadas: null });
    expect(leerContadas("   ")).toEqual({ texto: "", contadas: null });
    expect(leerContadas("12")).toEqual({ texto: "12", contadas: 12 });
    expect(leerContadas("999999999999")).toEqual({ texto: "9999", contadas: 9999 });
    expect(leerContadas("-5")).toEqual({ texto: "5", contadas: 5 });
    expect(leerContadas("٣")).toEqual({ texto: "", contadas: null });
    expect(leerContadas("0")).toEqual({ texto: "0", contadas: 0 });
  });

  it("ENT-02: la categoría que se está contando no desaparece de la lista aunque quede en 0", () => {
    const extra = (pos: number, contadas: number): LineaParaContar => ({
      clave: `extra:${pos}`,
      linea: null,
      conteo: leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ extra_posicion: pos, contadas, proveedor: PROV, categoria: CAT, marca: MARCA })] })?.conteos[0] ?? null,
      categoria: CAT,
      marca: MARCA,
      proveedor: PROV,
      dijeron: null,
    });
    const ls = [extra(1, 0), extra(2, 0), extra(3, 4)];
    expect(lineasALaVista(ls, new Set(), "extra:1").map((l) => l.clave)).toEqual(["extra:1", "extra:3"]);
    expect(lineasALaVista(ls, new Set(["extra:2"]), null).map((l) => l.clave)).toEqual(["extra:2", "extra:3"]);
  });

  it("ENT-07: sin aviso, un costo mal escrito frena el cierre (no se descarta en silencio)", () => {
    const l: LineaParaContar = {
      clave: "extra:1",
      linea: null,
      conteo: leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ extra_posicion: 1, contadas: 3, proveedor: PROV, categoria: CAT, marca: MARCA })] })?.conteos[0] ?? null,
      categoria: CAT,
      marca: MARCA,
      proveedor: PROV,
      dijeron: null,
    };
    const campos = camposDelCierre({ lineas: [l], decisiones: { "extra:1": { ...DECISION_PARA_PRUEBA, costo: "1.299,50" } }, sinAviso: true, responsable: true });
    expect(campos.find((c) => c.id === "costo-extra-1")).toMatchObject({ requerido: true, hecho: false });
    const faltan = faltaParaCerrar({ lineas: [l], decisiones: { "extra:1": { ...DECISION_PARA_PRUEBA, costo: "1.299,50" } }, sinAviso: true, responsable: true });
    expect(campos.filter((c) => c.requerido && !c.hecho).length).toBe(faltan.length);
  });

  it("RS-01/RS-03: la red caída no se muestra cruda; como cada guardado lleva su token, se puede volver a intentar sin repetir", () => {
    const red = mensajeAlGuardar({ message: "TypeError: Failed to fetch" }, "cerrar el envío");
    expect(red).not.toMatch(/TypeError|fetch/);
    expect(red).toMatch(/no se repite/);
    expect(mensajeAlGuardar({ message: "De este pendiente quedan 1 y pusiste 2", hint: "recepcion_pendiente_excede" }, "guardar")).toMatch(/quedan 1/);
  });
});

describe("la guía de foco del conteo y del cierre", () => {
  const crudo = (o: Record<string, unknown>) => leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo(o)] })?.conteos[0] ?? null;
  const ls: LineaParaContar[] = [
    { clave: "item:i1", linea: linea("i1", 10), conteo: crudo({ despacho_item_id: "i1", contadas: 8 }), categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: 10 },
    { clave: "item:i2", linea: linea("i2", 4), conteo: null, categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: 4 },
    { clave: "extra:1", linea: null, conteo: crudo({ extra_posicion: 1, contadas: 3, proveedor: PROV, categoria: CAT, marca: MARCA }), categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: null },
  ];

  it("cierre: los mismos campos que lo que frena, y los hechos con su ✓; lo pendiente coincide con faltaParaCerrar", () => {
    const decisiones = { "item:i1": { ...DECISION_PARA_PRUEBA, faltanteCausa: "no_vino" as const }, "extra:1": { ...DECISION_PARA_PRUEBA, costo: "" } };
    const campos = camposDelCierre({ lineas: ls, decisiones, sinAviso: false, responsable: true });
    expect(campos.map((c) => [c.id, c.requerido, c.hecho])).toEqual([
      ["causa-item-i1", true, true],
      ["contar-item-i2", true, false],
      ["causa-extra-1", true, false],
      ["costo-extra-1", true, false],
      ["responsable", true, true],
    ]);
    const faltan = faltaParaCerrar({ lineas: ls, decisiones, sinAviso: false, responsable: true });
    expect(campos.filter((c) => c.requerido && !c.hecho).length).toBe(faltan.length);
  });

  it("sin aviso: el costo de lo de fuera de la guía es opcional; conteo: cada línea de la guía hecha cuando tiene su número", () => {
    const campos = camposDelCierre({ lineas: [ls[2]], decisiones: { "extra:1": { ...DECISION_PARA_PRUEBA, costo: "" } }, sinAviso: true, responsable: false });
    expect(campos.map((c) => [c.id, c.requerido, c.hecho])).toEqual([
      ["costo-extra-1", false, false],
      ["responsable", true, false],
    ]);
    expect(camposDelConteo(ls).map((c) => [c.id, c.hecho])).toEqual([
      ["contar-item-i1", true],
      ["contar-item-i2", false],
    ]);
    // Un envío sin aviso recién abierto: lo único que falta es agregar lo que llegó.
    expect(camposDelConteo([]).map((c) => [c.id, c.hecho])).toEqual([[ID_CAMPO_AGREGAR, false]]);
  });
});

describe("la matriz y lo separado", () => {
  it("de la matriz a las tallas separadas y de vuelta, con dañadas y su arreglo", () => {
    const prenda = { variantes: [
      { id: "v1", tallaId: "t1", talla: "S", colorCodigo: "NEG", color: "Negro", codigo: "X-S", costo: null, precio: null },
      { id: "v2", tallaId: "t2", talla: "M", colorCodigo: "NEG", color: "Negro", codigo: "X-M", costo: null, precio: null },
      { id: "v3", tallaId: "t3", talla: "L", colorCodigo: "NEG", color: "Negro", codigo: "X-L", costo: null, precio: null },
    ] };
    const vs = variantesDeConteo({ cantidades: { v1: "3", v2: "", v3: "2" }, danadas: { v1: "5", v3: "1" }, conDanadas: true, arreglo: "pendiente" }, prenda);
    expect(vs.map((v) => [v.varianteId, v.cantidad, v.danadas, v.solucion, v.talla])).toEqual([
      ["v1", 3, 3, "pendiente", "S"],
      ["v3", 2, 1, "pendiente", "L"],
    ]);
    expect(conteoDeVariantes(vs)).toEqual({ cantidades: { v1: "3", v3: "2" }, danadas: { v1: "3", v3: "1" }, conDanadas: true, arreglo: "pendiente" });
    expect(variantesDeConteo({ cantidades: { v1: "3" }, danadas: { v1: "2" }, conDanadas: false, arreglo: null }, prenda)[0].danadas).toBe(0);
  });
});

describe("poner las tallas desde la hoja", () => {
  const v = (id: string, n: number) => ({ varianteId: id, cantidad: n, danadas: 0, solucion: null, talla: null, color: null, codigo: null });
  it("la misma prenda: queda detallada con la suma; otra prenda: la fila cambia; una que ya estaba: se juntan", () => {
    let s = sumarPrenda(sumarPrenda(SEPARADO_VACIO, { productoId: "pa", nombre: "Aurora", codigo: null }, 3), { productoId: "pb", nombre: "Lina", codigo: null }, 2);
    expect(ponerTallas(s, "pa", { productoId: "pa", nombre: "Aurora", codigo: null }, [v("a1", 2), v("a2", 2)]).prendas[0]).toMatchObject({ productoId: "pa", cantidad: 4 });
    const otra = ponerTallas(s, "pa", { productoId: "pc", nombre: "Nueva", codigo: null }, [v("c1", 3)]);
    expect(otra.prendas.map((p) => [p.productoId, p.cantidad, p.variantes?.length ?? null])).toEqual([
      ["pb", 2, null],
      ["pc", 3, 1],
    ]);
    s = detallarPrenda(s, "pb", [v("b1", 2)]);
    const juntas = ponerTallas(s, "pa", { productoId: "pb", nombre: "Lina", codigo: null }, [v("b1", 1), v("b2", 2)]);
    expect(juntas.prendas.map((p) => [p.productoId, p.cantidad, p.variantes?.map((x) => [x.varianteId, x.cantidad])])).toEqual([
      ["pb", 5, [["b1", 3], ["b2", 2]]],
    ]);
  });
});
