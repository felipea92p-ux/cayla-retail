import { describe, expect, it } from "vitest";
import {
  SEPARADO_VACIO,
  claveCostoDeNueva,
  costoDePrendaTexto,
  costosDePrendaConProblema,
  prendasConCosto,
  unidadesSinIdentificar,
  costosPropiosParaCerrar,
  argsGuardarConteo,
  argsLigarPrenda,
  ALCANCE_DE_FABRICA,
  avisoDePrecioRechazado,
  cambiosDeVentaDe,
  hoyDelPrecio,
  leerValidacionDePrecio,
  precioComoTexto,
  problemasDePrecio,
  argsResolverPendiente,
  avisoDeConfirmarHacerAhora,
  costoInicialDePrenda,
  costosDeHacerAhora,
  costosSinGuardar,
  AVISO_PRENDA_SIN_LIGAR,
  resultadoDeLigar,
  resultadoDelPrecio,
  cambiarCantidadPrenda,
  camposDelCierre,
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
  esRegaloFuera,
  faltaParaCerrar,
  leerConteosDelEnvio,
  leerCostoCierre,
  leerPrecioNuevo,
  cambioDePrecioDeCompra,
  cambioDePrecioDeVenta,
  textoCambioDePrecio,
  textoIgualaTallas,
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
  type DecisionCierre,
  type LineaParaContar,
  type Separado,
  necesitaCatalogoAlCerrar,
  resumenDelCierre,
  prendasQueEntraron,
  detalleParaDespues,
  describirNuevas,
  quitarNuevaDescrita,
  cambiarCantidadNuevaDescrita,
  prendaCreadaDeNueva,
  BOTON_DE_PENDIENTE,
  veredictoDeLaBalanza,
  subtitulosDelRiel,
  insigniaDelEnvio,
  textoResumenDelCierre,
  veredictoDelCerrado,
  lineasALaVista,
  leerContadas,
  mensajeAlGuardar,
  esEnvioSinAviso,
  marcaDeLinea,
  nombreDeLinea,
  proveedorDelSinAviso,
  prendasAnotadasDe,
  separarAnotada,
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
  prendaElegida: null,
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
      // La nota de la línea solo viaja con «Otro» (es lo que pasó): con otra causa, lo escrito antes no se manda.
      { despacho_item_id: "i1", version: 3, costo_unitario: 30, confirma_costo: false, faltante_causa: "no_vino", sobrante_causa: null, nota: null },
      { despacho_item_id: "i2", version: 1, costo_unitario: 30, confirma_costo: false, faltante_causa: null, sobrante_causa: null, nota: null },
      { extra_posicion: 1, version: 1, costo_unitario: null, confirma_costo: false, faltante_causa: null, sobrante_causa: null, nota: null },
    ]);
  });

  it("«Otro» (2026-10-28): se ofrece solo para lo de más, pide su explicación y la lleva como nota de la línea", () => {
    expect(causasDe(extra(1, 3))?.opciones.map((o) => o.valor)).toEqual(["regalo", "cobra_aparte", "proxima_compra", "otro"]);
    expect(causasDe(contada("i1", 10, 12), 2)?.opciones.map((o) => o.valor)).toEqual(["regalo", "cobra_aparte", "proxima_compra", "reposicion_faltante", "otro"]);
    expect(causasDe(contada("i1", 10, 8))?.opciones.some((o) => o.valor === "otro")).toBe(false); // lo que faltó no cambia
    const sin = faltaParaCerrar({ lineas: [extra(1, 3)], decisiones: { "extra:1": dec({ sobranteCausa: "otro" }) }, sinAviso: false, responsable: true });
    expect(sin.map((x) => x.texto)).toEqual(["Cuenta qué fue lo de más de Camisas · Marca Uno (fuera de la guía)"].map((t) => expect.stringContaining("Cuenta qué fue lo de más de")) as never);
    const con = faltaParaCerrar({ lineas: [extra(1, 3)], decisiones: { "extra:1": dec({ sobranteCausa: "otro", nota: "Muestra del proveedor" }) }, sinAviso: false, responsable: true });
    expect(con).toEqual([]);
    const [l] = lineasParaCerrar([extra(1, 3)], { "extra:1": dec({ sobranteCausa: "otro", nota: "  Muestra del proveedor " }) }, false);
    expect(l).toMatchObject({ sobrante_causa: "otro", nota: "Muestra del proveedor" });
  });

  it("un regalo de fuera de la guía no pide costo: entra a S/ 0 y no manda ni el de la línea ni el de sus prendas; uno de la guía sí lo conserva", () => {
    const r = dec({ costo: "", sobranteCausa: "regalo" });
    expect(esRegaloFuera(extra(1, 3), r)).toBe(true);
    expect(esRegaloFuera(contada("i1", 10, 12), r)).toBe(false);
    expect(faltaParaCerrar({ lineas: [extra(1, 3)], decisiones: { "extra:1": r }, sinAviso: false, responsable: true })).toEqual([]);
    // Un costo mal escrito de un regalo tampoco frena: no se lee.
    expect(faltaParaCerrar({ lineas: [extra(1, 3)], decisiones: { "extra:1": { ...r, costo: "doce" } }, sinAviso: false, responsable: true })).toEqual([]);
    // La guía de foco no ofrece la caja de costo de un regalo, y sí la de otra causa.
    const ids = (d: DecisionCierre) => camposDelCierre({ lineas: [extra(1, 3)], decisiones: { "extra:1": d }, sinAviso: false, responsable: true }).map((c) => c.id);
    expect(ids(r).some((i) => i.includes("costo"))).toBe(false);
    expect(ids(dec({ costo: "", sobranteCausa: "cobra_aparte" })).some((i) => i.includes("costo"))).toBe(true);
    const [l] = lineasParaCerrar([extra(1, 3)], { "extra:1": { ...r, costo: "99", confirmaCosto: true } }, false, { "extra:1": { "prod-1": "55" } });
    expect(l).toMatchObject({ costo_unitario: 0, confirma_costo: false, sobrante_causa: "regalo" });
    expect(l).not.toHaveProperty("costos_prendas");
    const [g] = lineasParaCerrar([contada("i1", 10, 12)], { "item:i1": dec({ sobranteCausa: "regalo" }) }, false);
    expect(g).toMatchObject({ costo_unitario: 30, sobrante_causa: "regalo" });
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

  // Felipe 2026-10-26: «Crear ahora» crea la prenda, abre «Tallas y colores» y, si la persona toca «Dejar para después», la prenda ya existía
  // pero la lista seguía diciendo «por crear». La prenda se liga al pendiente (`ligar_prenda_a_pendiente`) y la lista cambia de frase.
  describe("«Crear ahora» deja la prenda creada en «Para después»", () => {
    const conteos = (pendientes: object[]) =>
      leerConteosDelEnvio({ despacho_id: "d1", estado: "cerrado", conteos: [conteoCrudo({ despacho_item_id: "i1", contadas: 10, en_stock: 4, sin_separar: 1, pendientes })] });
    const lista = (pendientes: object[]) => paraDespues(lineasParaContar({ lineas: [linea("i1", 12)] }, conteos(pendientes)));

    it("solo un pendiente «crear» espera su prenda: un «detalle» ya la tiene y lo sin separar no es un pendiente", () => {
      const [separar, detalle, crear] = lista([
        { id: "pe1", tipo: "detalle", cantidad: 3, quedan: 3, producto: { id: "pa", nombre: "Blusa Aurora" }, estado: "pendiente" },
        { id: "pe2", tipo: "crear", cantidad: 6, quedan: 6, descripcion: "jean", estado: "pendiente" },
      ]);
      expect(argsLigarPrenda("d1", crear, "prod-jean")).toEqual({ p_despacho_id: "d1", p_pendiente_id: "pe2", p_producto_id: "prod-jean" });
      expect(argsLigarPrenda("d1", detalle, "prod-jean")).toBeNull();
      expect(argsLigarPrenda("d1", separar, "prod-jean")).toBeNull();
    });

    it("la lista deja de decir «por crear» cuando la base ya tiene la prenda ligada", () => {
      const antes = lista([{ id: "pe2", tipo: "crear", cantidad: 6, quedan: 6, descripcion: "jean", estado: "pendiente" }]).filter((p) => p.tipo !== "separar");
      const despues = lista([{ id: "pe2", tipo: "detalle", cantidad: 6, quedan: 6, producto: { id: "prod-jean", nombre: "Jean recto" }, estado: "pendiente" }]).filter((p) => p.tipo !== "separar");
      expect(antes.map((p) => [p.tipo, p.titulo, p.sub.endsWith("por crear en el catálogo")])).toEqual([["crear", "6 prendas nuevas · jean", true]]);
      expect(despues.map((p) => [p.tipo, p.titulo, p.sub.endsWith("faltan tallas y colores")])).toEqual([["detalle", "Jean recto · 6 sin tallas", true]]);
    });

    it("lee qué pasó al ligar: ligado, sin cambio, función ausente (migración sin pegar) o fallo", () => {
      expect(resultadoDeLigar({ ligado: true }, null)).toBe("ligado");
      expect(resultadoDeLigar([{ ligado: true }], null)).toBe("ligado");
      expect(resultadoDeLigar({ ligado: false }, null)).toBe("sin_cambio");
      expect(resultadoDeLigar(null, { code: "P0001", hint: "pendiente_ya_resuelto" })).toBe("sin_cambio");
      expect(resultadoDeLigar(null, { code: "PGRST202" })).toBe("no_disponible");
      expect(resultadoDeLigar(null, { code: "42883" })).toBe("no_disponible");
      expect(resultadoDeLigar(null, { code: "P0001", hint: "recepcion_prenda_ajena" })).toBe("fallo");
      expect(resultadoDeLigar(null, { code: "PGRST301" })).toBe("fallo");
      expect(resultadoDeLigar({}, null)).toBe("fallo");
      expect(resultadoDeLigar(null, null)).toBe("fallo");
    });

    it("el aviso de «no se pudo» dice qué pasó con la prenda y cómo se arregla, sin jerga", () => {
      expect(AVISO_PRENDA_SIN_LIGAR.titulo).toContain("se creó");
      expect(AVISO_PRENDA_SIN_LIGAR.detalle).toContain("Catálogo ▸ Productos");
    });
  });

  // Felipe 2026-10-26: contar «5 blusas» sin decir cuáles no deja cambiar ningún precio al cerrar; en «Para después», al identificar la prenda, sí.
  describe("el precio de venta de lo que se identifica en «Para después»", () => {
    const emma = { productoId: "pe", nombre: "Blusa Emma", codigo: "BLU-0001" };
    const valentina = { productoId: "pv", nombre: null, codigo: "BLU-0002" };
    const hoy = { desde: 79.9, hasta: 79.9 };

    it("solo cuentan las prendas cuyo precio escrito cambió, con su nombre (o su código), y una vez por prenda", () => {
      const c = cambiosDeVentaDe([emma, valentina, emma], {
        pe: { actual: hoy, valor: "89.90", alcance: "todas" },
        pv: { actual: { desde: 59, hasta: 59 }, valor: "69", alcance: "sede" },
      });
      expect(c.map((x) => [x.productoId, x.nombre, x.antes, x.despues, x.alcance])).toEqual([
        ["pe", "Blusa Emma", 79.9, 89.9, "todas"],
        ["pv", "BLU-0002", 59, 69, "sede"],
      ]);
    });

    it("sin cambio no hay nada que confirmar: igual al de hoy, vacío, mal escrito, todavía leyendo o sin escribir nada", () => {
      expect(
        cambiosDeVentaDe([emma, valentina], {
          pe: { actual: hoy, valor: "79.90", alcance: "todas" },
          pv: { actual: hoy, valor: "", alcance: "todas" },
        }),
      ).toEqual([]);
      expect(cambiosDeVentaDe([emma], { pe: { actual: hoy, valor: "mucho", alcance: "todas" } })).toEqual([]);
      expect(cambiosDeVentaDe([emma], { pe: { actual: hoy, valor: "0", alcance: "todas" } })).toEqual([]);
      expect(cambiosDeVentaDe([emma], { pe: { actual: undefined, valor: "99", alcance: "todas" } })).toEqual([]);
      expect(cambiosDeVentaDe([emma], {})).toEqual([]);
    });

    it("el precio nace para la sede donde se recibe, y lo escrito se compara con el de hoy en ESA sede (puede ser otro que el general)", () => {
      expect(ALCANCE_DE_FABRICA).toBe("sede");
      const lima = { desde: 80, hasta: 80 };
      // La prenda vale 79.90 en general y 80 en Lima: escribir 80 en «Solo Lima» no es un cambio; escribir 79.90 sí (vuelve al general).
      const e = { actual: hoy, actualSede: lima, valor: "80.00", alcance: "sede" as const };
      expect(hoyDelPrecio(e)).toEqual(lima);
      expect(hoyDelPrecio({ ...e, alcance: "todas" })).toEqual(hoy);
      expect(cambiosDeVentaDe([emma], { pe: e })).toEqual([]);
      expect(cambiosDeVentaDe([emma], { pe: { ...e, valor: "79.90" } }).map((x) => [x.antes, x.despues, x.alcance])).toEqual([[80, 79.9, "sede"]]);
      // Para todas las sedes se compara con el general.
      expect(cambiosDeVentaDe([emma], { pe: { ...e, alcance: "todas", valor: "80.00" } }).map((x) => [x.antes, x.despues, x.alcance])).toEqual([[79.9, 80, "todas"]]);
      // Si no se pudo leer el de la sede, vale el general.
      expect(hoyDelPrecio({ actual: hoy, actualSede: undefined, alcance: "sede" })).toEqual(hoy);
      expect(precioComoTexto(lima)).toBe("80.00");
      expect(precioComoTexto({ desde: 59, hasta: 79 })).toBe("");
      expect(precioComoTexto(null)).toBe("");
    });

    it("un precio escrito mal no se ignora: se dice cuál y por qué (vacío es «no lo cambio»)", () => {
      const v = (valor: string) => ({ actual: hoy, valor, alcance: "sede" as const });
      expect(problemasDePrecio([emma, valentina], { pe: v("mucho"), pv: v("0") }).map((p) => [p.productoId, p.nombre, p.texto])).toEqual([
        ["pe", "Blusa Emma", "Escribe el precio solo con números (ej. 79.90)"],
        ["pv", "BLU-0002", "El precio tiene que ser mayor que cero"],
      ]);
      expect(problemasDePrecio([emma], { pe: v("5000.01") }).map((p) => p.texto)).toEqual(["El precio va hasta S/\u00a05\u00a0000"]);
      expect(problemasDePrecio([emma, valentina], { pe: v(""), pv: v("89.90") })).toEqual([]);
      expect(problemasDePrecio([emma], {})).toEqual([]);
    });

    it("el aviso de un precio que no se puede guardar dice cuál, por qué y qué pasó, con su punto aunque el motivo no lo traiga", () => {
      expect(avisoDePrecioRechazado("Blusa Emma", "Escribe el precio solo con números (ej. 79.90)", "No se guardó nada.")).toBe(
        "Revisa el precio de venta de Blusa Emma: Escribe el precio solo con números (ej. 79.90). No se guardó nada.",
      );
      expect(avisoDePrecioRechazado("Blusa Emma", "Ese precio queda por debajo de lo que cuesta la prenda. ", "No se cerró el envío.")).toBe(
        "Revisa el precio de venta de Blusa Emma: Ese precio queda por debajo de lo que cuesta la prenda. No se cerró el envío.",
      );
    });

    it("lee lo que contestó la validación: ok, el motivo de la base (sin decir cuánto cuesta) o «no se pudo preguntar» y la base decide al guardar", () => {
      expect(leerValidacionDePrecio({ ok: true }, null)).toEqual({ estado: "ok" });
      const bajo = leerValidacionDePrecio(
        { ok: false, codigo: "P0001", hint: "precio_bajo_costo", motivo: "Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas)." },
        null,
      );
      expect(bajo).toEqual({ estado: "rechazado", texto: expect.stringContaining("por debajo de lo que cuesta la prenda") });
      expect(JSON.stringify(bajo)).not.toMatch(/S\/\s?\d/);
      expect(leerValidacionDePrecio({ ok: false, hint: "precio_invalido", motivo: "Escribe un precio mayor que cero (hasta S/ 5,000)." }, null)).toEqual({
        estado: "rechazado",
        texto: expect.stringContaining("mayor que cero"),
      });
      expect(leerValidacionDePrecio({ ok: false, hint: "precio_envio_no_abierto", motivo: "El precio se cambia cuando el envío ya se está recibiendo" }, null)).toEqual({
        estado: "rechazado",
        texto: expect.stringContaining("Todavía no se puede cambiar el precio desde aquí"),
      });
      expect(leerValidacionDePrecio({ ok: false, hint: "precio_prenda_ajena", motivo: "Esa prenda no existe." }, null)).toEqual({ estado: "rechazado", texto: "Esa prenda no existe." });
      // No se pudo preguntar: la función no está en la base todavía, un corte de red o una respuesta que no se entiende.
      expect(leerValidacionDePrecio(null, { code: "PGRST202", message: "Could not find the function" })).toEqual({ estado: "sin_respuesta" });
      expect(leerValidacionDePrecio(null, { message: "Failed to fetch" })).toEqual({ estado: "sin_respuesta" });
      expect(leerValidacionDePrecio({}, null)).toEqual({ estado: "sin_respuesta" });
      expect(leerValidacionDePrecio(null, null)).toEqual({ estado: "sin_respuesta" });
    });

    it("lee lo que contestó la base: ok, «todavía no es de este envío» (se reintenta con la prenda adentro) o el motivo", () => {
      expect(resultadoDelPrecio(null)).toBe("ok");
      expect(resultadoDelPrecio({ hint: "precio_prenda_ajena", message: "Esa prenda no es de este envío" })).toBe("ajena");
      expect(resultadoDelPrecio({ hint: "precio_envio_no_abierto", message: "El precio se cambia mientras el envío está abierto, antes de cerrarlo" })).toEqual({
        texto: "Todavía no se puede cambiar el precio desde aquí. Déjalo como estaba o cámbialo en Catálogo ▸ Productos.",
      });
      const bajo = resultadoDelPrecio({ hint: "precio_bajo_costo", message: "Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas)." });
      expect(bajo).toEqual({ texto: expect.stringContaining("por debajo de lo que cuesta") });
      expect(resultadoDelPrecio({ message: "Failed to fetch" })).toEqual({ texto: expect.stringContaining("Se cortó la conexión") });
    });

    it("una prenda que se cambió de precio pero ya no está en lo que se guarda no se toca", () => {
      const ventas = { pe: { actual: hoy, valor: "89.90", alcance: "todas" as const } };
      expect(cambiosDeVentaDe([valentina], ventas)).toEqual([]);
    });
  });

  it("en la puerta, un envío sin órdenes ni líneas es uno que llegó sin aviso", () => {
    expect(esEnvioSinAviso({ lineas: 0, ordenes: [] })).toBe(true);
    expect(esEnvioSinAviso({ lineas: 2, ordenes: [] })).toBe(false);
    expect(esEnvioSinAviso({ lineas: 0, ordenes: ["OC-000465"] })).toBe(false);
    expect(proveedorDelSinAviso(leerConteosDelEnvio({ despacho_id: "d", origen: "sin_aviso", proveedor_por_confirmar: true }))).toBe("proveedor por confirmar");
    expect(proveedorDelSinAviso(leerConteosDelEnvio({ despacho_id: "d", origen: "sin_aviso", proveedores: [PROV] }))).toBe(PROV.nombre);
    expect(proveedorDelSinAviso(null)).toBeNull();
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
    expect(textoNoSeReabre("reabrir_papel_completado")).toMatch(/Compras ya completó el papel/);
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

describe("maqueta A: «Describir ahora» las nuevas", () => {
  it("describe parte de las nuevas, junta la misma descripción y no describe más de las que hay", () => {
    let s: Separado = cambiarNuevasSinDescribir(SEPARADO_VACIO, 6);
    s = describirNuevas(s, "  Blusa con lazo,   rosada ", 2);
    expect(s.nuevas).toEqual([{ cantidad: 2, descripcion: "Blusa con lazo, rosada" }, { cantidad: 4, descripcion: null }]);
    s = describirNuevas(s, "blusa con lazo, rosada", 1);
    expect(s.nuevas).toEqual([{ cantidad: 3, descripcion: "Blusa con lazo, rosada" }, { cantidad: 3, descripcion: null }]);
    s = describirNuevas(s, "Top corto", 9);
    expect(nuevasSinDescribir(s)).toBe(0);
    expect(totalSeparado(s)).toBe(6);
    expect(describirNuevas(s, "Otra", 1)).toBe(s);
    expect(describirNuevas(cambiarNuevasSinDescribir(SEPARADO_VACIO, 2), "   ", 1).nuevas).toEqual([{ cantidad: 2, descripcion: null }]);
  });

  it("quitar una descripción devuelve esas nuevas a «sin describir»; cambiar su cantidad no baja de 1", () => {
    let s = describirNuevas(cambiarNuevasSinDescribir(SEPARADO_VACIO, 5), "Top corto", 3);
    s = cambiarCantidadNuevaDescrita(s, "Top corto", 0);
    expect(s.nuevas.find((x) => x.descripcion === "Top corto")?.cantidad).toBe(1);
    s = quitarNuevaDescrita(s, "Top corto");
    expect(s.nuevas).toEqual([{ cantidad: 3, descripcion: null }]);
  });
});

describe("«Crear ahora» una nueva ya descrita: de «por crear» a prenda conocida", () => {
  const CREADA = { productoId: "p-lazo", nombre: "Blusa lazo", codigo: "BLU-0042" };
  const conUnaDescrita = () => describirNuevas(cambiarNuevasSinDescribir(SEPARADO_VACIO, 5), "Blusa con lazo, rosada", 3);

  it("pasa a prenda sin tallas con las mismas cantidades: lo contado ni cambia ni se pierde", () => {
    const s = conUnaDescrita();
    const r = prendaCreadaDeNueva(s, "Blusa con lazo, rosada", CREADA);
    expect(r.nuevas).toEqual([{ cantidad: 2, descripcion: null }]);
    expect(r.prendas).toEqual([{ ...CREADA, cantidad: 3, variantes: null }]);
    expect(totalSeparado(r)).toBe(totalSeparado(s));
    expect(detalladas(r)).toBe(0);
  });

  it("ya creada, se detalla como cualquier prenda separada y entra al stock", () => {
    const r = prendaCreadaDeNueva(conUnaDescrita(), "Blusa con lazo, rosada", CREADA);
    const v = { varianteId: "v1", cantidad: 3, danadas: 0, solucion: null, talla: "S", color: "Rosado", codigo: "BLU-0042-S-ROS" };
    const d = ponerTallas(r, CREADA.productoId, CREADA, [v]);
    expect(d.prendas[0]?.variantes).toEqual([v]);
    expect(detalladas(d)).toBe(3);
  });

  it("si esa prenda ya estaba separada (usó una que ya existía), se juntan: una prenda va una sola vez", () => {
    const s = sumarPrenda(conUnaDescrita(), CREADA, 2);
    const r = prendaCreadaDeNueva(s, "Blusa con lazo, rosada", CREADA);
    expect(r.prendas).toEqual([{ ...CREADA, cantidad: 5, variantes: null }]);
    expect(totalSeparado(r)).toBe(totalSeparado(s));
  });

  it("una descripción que no está en lo separado no toca nada", () => {
    const s = conUnaDescrita();
    expect(prendaCreadaDeNueva(s, "Otra cosa", CREADA)).toBe(s);
    expect(prendaCreadaDeNueva(SEPARADO_VACIO, "Blusa con lazo, rosada", CREADA)).toBe(SEPARADO_VACIO);
  });

  it("lo que se guarda en la base lleva la prenda y ya no la nueva; la base no ve la descripción", () => {
    const r = prendaCreadaDeNueva(describirNuevas(cambiarNuevasSinDescribir(SEPARADO_VACIO, 3), "Blusa con lazo, rosada", 3), "Blusa con lazo, rosada", CREADA);
    expect(separadoParaBase(r)).toEqual({ prendas: [{ producto_id: "p-lazo", cantidad: 3, variantes: null }], nuevas: [] });
  });
});

describe("el botón de cada fila de «Para después»", () => {
  it("cada tipo dice lo que hace: crear, tallas y colores, o el genérico de separar", () => {
    expect(BOTON_DE_PENDIENTE).toEqual({ separar: "Hacer ahora", detalle: "Tallas y colores ahora", crear: "+ Crear ahora" });
  });

  it("cubre todos los tipos que paraDespues puede devolver", () => {
    const l = {
      clave: "item:1",
      linea: { id: "1" },
      categoria: { nombre: "Blusas" },
      marca: { nombre: "CAYLA" },
      conteo: {
        sinSeparar: 2,
        pendientes: [
          { id: "p1", tipo: "detalle", estado: "pendiente", quedan: 3, producto: { id: "x", nombre: "Emma" }, descripcion: null },
          { id: "p2", tipo: "crear", estado: "pendiente", quedan: 1, producto: null, descripcion: "Top" },
        ],
      },
    } as unknown as LineaParaContar;
    const tipos = paraDespues([l]).map((p) => p.tipo);
    expect(new Set(tipos)).toEqual(new Set(["separar", "detalle", "crear"]));
    for (const t of tipos) expect(BOTON_DE_PENDIENTE[t]).toBeTruthy();
  });
});

describe("maqueta A: lo que queda para después, línea por línea", () => {
  it("una frase por cosa: la prenda sin tallas, las nuevas y lo sin separar; nada si todo entra", () => {
    const l = (o: Record<string, unknown>): LineaParaContar => ({
      clave: "item:i1",
      linea: linea("i1", 40),
      conteo: leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ despacho_item_id: "i1", ...o })] })?.conteos[0] ?? null,
      categoria: CAT,
      marca: MARCA,
      proveedor: PROV,
      dijeron: 40,
    });
    const r = detalleParaDespues(
      l({ contadas: 40, separado: { prendas: [{ producto_id: "pa", nombre: "Blusa Lía", cantidad: 12, variantes: null }], nuevas: [{ cantidad: 6, descripcion: null }, { cantidad: 2, descripcion: "Top corto" }] } }),
    );
    expect(r).toEqual(["Blusa Lía · 12 sin tallas ni colores", `6 ${CAT.nombre.toLowerCase()} nuevas por crear`, "Top corto · 2 por crear", `20 ${CAT.nombre.toLowerCase()} sin separar`]);
    expect(detalleParaDespues(l({ contadas: 3, en_stock: 3 }))).toEqual([]);
    expect(detalleParaDespues({ ...l({}), conteo: null })).toEqual([]);
  });
});

describe("maqueta A: las prendas que ya se pueden vender", () => {
  it("se juntan por nombre, sin las dañadas, de más a menos", () => {
    expect(
      prendasQueEntraron([
        { prenda: "Blusa Nina", cantidad: 5, danadas: 0 },
        { prenda: "Blusa Aurora", cantidad: 6, danadas: 0 },
        { prenda: "Blusa Aurora", cantidad: 7, danadas: 1 },
        { prenda: "Falda Plisada", cantidad: 2, danadas: 2 },
      ]),
    ).toEqual([
      { nombre: "Blusa Aurora", cantidad: 12 },
      { nombre: "Blusa Nina", cantidad: 5 },
    ]);
    expect(prendasQueEntraron(null)).toEqual([]);
  });
});

describe("maqueta A: la balanza, el riel y la insignia", () => {
  it("la balanza se inclina hacia donde hay más, con tope, y dice el veredicto", () => {
    expect(veredictoDeLaBalanza(120, 121)).toEqual({ estado: "ambar", texto: "Sobran 1", angulo: 1.6 });
    expect(veredictoDeLaBalanza(120, 100)).toMatchObject({ estado: "ambar", texto: "Faltan 20", angulo: -9 });
    expect(veredictoDeLaBalanza(64, 64)).toEqual({ estado: "verde", texto: "Cuadra con lo que dijeron", angulo: 0 });
    expect(veredictoDeLaBalanza(40, 0)).toMatchObject({ estado: "neutro", texto: "Todavía no contaste" });
    expect(veredictoDeLaBalanza(null, 7)).toEqual({ estado: "neutro", texto: "Llegó sin aviso: no hay con qué comparar", angulo: 0 });
  });

  it("el riel dice qué pasó en cada paso", () => {
    const base = { estado: "abierto", numero: "ENV-000118", enviado: 120, sinAviso: false, proveedor: null, contadas: 121, paraDespues: 6 };
    expect(subtitulosDelRiel(base)).toEqual({ "1": "ENV-000118 · 120 prendas", "2": "121 contadas · 6 para después", "3": "Lo que no cuadró y quién cerró" });
    expect(subtitulosDelRiel({ ...base, estado: "en_camino", contadas: 0, paraDespues: 0 })["2"]).toBe("Por categoría");
    expect(subtitulosDelRiel({ ...base, sinAviso: true, proveedor: "Confecciones del Sur", estado: "cerrado", contadas: 1, paraDespues: 0 })).toEqual({ "1": "Confecciones del Sur · sin aviso", "2": "1 contada", "3": "Cerrado" });
  });

  it("la insignia de la cabecera", () => {
    expect(insigniaDelEnvio("en_camino", 0)).toEqual({ tono: "pizarra", texto: "En camino" });
    expect(insigniaDelEnvio("cerrado", 6)).toEqual({ tono: "pizarra", texto: "6 pendientes del envío" });
    expect(insigniaDelEnvio("cerrado", 0)).toEqual({ tono: "verde", texto: "Recibido" });
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

  it("cambio 1: sin nada en el stock, dice que están guardadas pero no se pueden vender y qué falta; con un solo pendiente, sin botón propio", () => {
    const l = extra({ contadas: 5, en_stock: 0, sin_separar: 5 });
    const v = veredictoDelCerrado([l], paraDespues([l]));
    expect(v).toEqual({
      titulo: "Las 5 prendas están guardadas, pero todavía no se pueden vender",
      texto: "Están en el almacén. Para venderlas falta decir qué modelo es cada una, con su talla y su color. Se hace abajo, con «Hacer ahora».",
      chip: null,
      accion: null,
    });
    const una = extra({ contadas: 1, en_stock: 0, pendientes: [{ id: "p", tipo: "crear", cantidad: 1, quedan: 1, estado: "pendiente" }] });
    expect(veredictoDelCerrado([una], paraDespues([una]))).toMatchObject({
      titulo: "La prenda está guardada, pero todavía no se puede vender",
      texto: "Está en el almacén. Para venderla falta crearla en el catálogo, con su talla y su color. Se hace abajo, con «Hacer ahora».",
      accion: null,
    });
  });

  it("lista aparte (2026-10-14): con dos o más pendientes, el botón lleva al primero", () => {
    const dos = extra({ contadas: 6, en_stock: 0, sin_separar: 4, pendientes: [{ id: "p", tipo: "crear", cantidad: 2, quedan: 2, estado: "pendiente" }] });
    const v = veredictoDelCerrado([dos], paraDespues([dos]));
    expect(paraDespues([dos]).length).toBe(2);
    expect(v.accion).not.toBeNull();
    expect(v.texto).not.toMatch(/Se hace abajo/);
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

  it("sin aviso: el costo de lo de fuera de la guía es opcional", () => {
    const campos = camposDelCierre({ lineas: [ls[2]], decisiones: { "extra:1": { ...DECISION_PARA_PRUEBA, costo: "" } }, sinAviso: true, responsable: false });
    expect(campos.map((c) => [c.id, c.requerido, c.hecho])).toEqual([
      ["costo-extra-1", false, false],
      ["responsable", true, false],
    ]);
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

describe("Felipe 2026-10-14: sin proveedor y sin marca", () => {
  const sinMarca: LineaParaContar = {
    clave: "extra:1",
    linea: null,
    conteo: leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ extra_posicion: 1, contadas: 3, proveedor: null, categoria: CAT, marca: null })] })?.conteos[0] ?? null,
    categoria: CAT,
    marca: null,
    proveedor: null,
    dijeron: null,
  };

  it("el envío dice si se abrió sin saber de quién es", () => {
    expect(leerConteosDelEnvio({ despacho_id: "d", origen: "sin_aviso", proveedor_por_confirmar: true, proveedores: [] })?.proveedorPorConfirmar).toBe(true);
    expect(leerConteosDelEnvio({ despacho_id: "d", origen: "sin_aviso" })?.proveedorPorConfirmar).toBe(false);
  });

  it("una línea sin marca se nombra «Sin marca» y lleva su id vacío (la base recibe null)", () => {
    expect(marcaDeLinea(sinMarca)).toEqual({ id: null, nombre: "Sin marca" });
    expect(marcaDeLinea({ marca: MARCA })).toEqual(MARCA);
    expect(nombreDeLinea(sinMarca)).toMatch(/Sin marca/);
  });

  it("el número de guía es opcional en la guía de foco: hecho si tiene algo escrito, nunca un candado", () => {
    const base = { lineas: [sinMarca], decisiones: {}, sinAviso: true, responsable: true };
    expect(camposDelCierre({ ...base, guia: "" }).find((c) => c.id === "guia")).toMatchObject({ requerido: false, hecho: false });
    expect(camposDelCierre({ ...base, guia: "T001-9" }).find((c) => c.id === "guia")).toMatchObject({ requerido: false, hecho: true });
    expect(camposDelCierre(base).some((c) => c.id === "guia")).toBe(false);
  });

  it("al cerrar, «De quién llegó» se pide solo si se abrió sin saberlo, y la guía coincide con lo que frena la base", () => {
    const base = { lineas: [sinMarca], decisiones: {}, sinAviso: true, responsable: true };
    expect(camposDelCierre(base).some((c) => c.id === "proveedor")).toBe(false);
    expect(camposDelCierre({ ...base, proveedorPorConfirmar: true }).find((c) => c.id === "proveedor")).toMatchObject({ requerido: true, hecho: false });
    expect(camposDelCierre({ ...base, proveedorPorConfirmar: true, proveedorElegido: true }).find((c) => c.id === "proveedor")).toMatchObject({ hecho: true });
  });
});

describe("precio de venta desde la recepción", () => {
  it("lee el precio: vacío aún no es un problema; cero, mal escrito y sobre el tope sí", () => {
    expect(leerPrecioNuevo("")).toEqual({ valor: null, problema: null });
    expect(leerPrecioNuevo("159.90").valor).toBe(159.9);
    expect(leerPrecioNuevo("159,90").valor).toBe(159.9);
    expect(leerPrecioNuevo("0").problema).toMatch(/mayor que cero/);
    expect(leerPrecioNuevo("abc").problema).toMatch(/solo con números/);
    expect(leerPrecioNuevo("5000.01").problema).toMatch(/hasta/);
    expect(leerPrecioNuevo("5000").valor).toBe(5000);
  });
  it("detecta el cambio de compra y de venta, y dice qué cambió y dónde", () => {
    expect(cambioDePrecioDeCompra("Blusas", "18.50", "18.50")).toBeNull();
    expect(cambioDePrecioDeCompra("Blusas", "18.50", "19.80")).toMatchObject({ tipo: "compra", antes: 18.5, despues: 19.8 });
    expect(cambioDePrecioDeCompra("Blusas", "", "19.80")).toMatchObject({ antes: null, despues: 19.8 });
    expect(cambioDePrecioDeCompra("Blusas", "18.50", "abc")).toBeNull();
    expect(cambioDePrecioDeVenta("Ivana", { desde: 149.9, hasta: 149.9 }, "149.90", "todas")).toBeNull();
    expect(cambioDePrecioDeVenta("Ivana", { desde: 149.9, hasta: 149.9 }, "159.90", "sede")).toMatchObject({ tipo: "venta", antes: 149.9, despues: 159.9, alcance: "sede" });
    expect(cambioDePrecioDeVenta("Ivana", { desde: 69.9, hasta: 79.9 }, "", "todas")).toBeNull();
    expect(cambioDePrecioDeVenta("Ivana", { desde: 69.9, hasta: 79.9 }, "75", "todas")).toMatchObject({ antes: null, despues: 75 });
    expect(cambioDePrecioDeVenta("Ivana", undefined, "75", "todas")).toBeNull();
    expect(textoCambioDePrecio({ tipo: "venta", nombre: "Ivana", antes: 149.9, despues: 159.9, alcance: "todas" }, "Tienda Lima")).toBe("S/\u00a0149.90 → S/\u00a0159.90 · todas las sedes");
    expect(textoCambioDePrecio({ tipo: "venta", nombre: "Ivana", antes: null, despues: 89.9, alcance: "sede" }, "Tienda Lima")).toBe("sin precio → S/\u00a089.90 · solo Tienda Lima");
    expect(textoCambioDePrecio({ tipo: "compra", nombre: "Blusas", antes: 18.5, despues: 19.8, alcance: null }, "Tienda Lima")).toBe("S/\u00a018.50 → S/\u00a019.80");
  });
  it("con tallas de precios distintos dice el rango (no «sin precio») y avisa que el precio nuevo las iguala", () => {
    const rango = cambioDePrecioDeVenta("Ivana", { desde: 69.9, hasta: 79.9 }, "75", "todas");
    expect(rango).toMatchObject({ antes: null, despues: 75, rango: { desde: 69.9, hasta: 79.9 } });
    expect(textoCambioDePrecio(rango!, "Tienda Lima")).toBe("S/\u00a069.90 a S/\u00a079.90 → S/\u00a075.00 · todas las sedes");
    expect(textoIgualaTallas(rango!, "Tienda Lima")).toBe("Hoy las tallas valen distinto: todas pasan a valer este precio.");
    const enSede = cambioDePrecioDeVenta("Ivana", { desde: 69.9, hasta: 79.9 }, "75", "sede");
    expect(textoCambioDePrecio(enSede!, "Tienda Lima")).toBe("S/\u00a069.90 a S/\u00a079.90 → S/\u00a075.00 · solo Tienda Lima");
    expect(textoIgualaTallas(enSede!, "Tienda Lima")).toBe("Hoy las tallas valen distinto: en Tienda Lima todas pasan a venderse a este precio.");
    // Un precio de hoy único, sin precio o el de compra: nada que avisar, y el cambio no trae rango.
    const unico = cambioDePrecioDeVenta("Ivana", { desde: 149.9, hasta: 149.9 }, "159.90", "todas");
    expect(unico).not.toHaveProperty("rango");
    expect(textoIgualaTallas(unico!, "Tienda Lima")).toBeNull();
    expect(textoIgualaTallas({ tipo: "compra", nombre: "Blusas", antes: 18.5, despues: 19.8, alcance: null }, "Tienda Lima")).toBeNull();
    expect(cambiosDeVentaDe([{ productoId: "p1", nombre: "Ivana", codigo: null }], { p1: { actual: { desde: 69.9, hasta: 79.9 }, valor: "75", alcance: "todas" } })[0]).toMatchObject({ productoId: "p1", rango: { desde: 69.9, hasta: 79.9 } });
  });
});

describe("lo que anotó la compra: las prendas exactas de una línea, de un toque a «¿Qué prendas son?»", () => {
  const deLaGuia = (extra: Partial<LineaEnvio>, conteo: Record<string, unknown> | null = null, dijeron = 12): LineaParaContar => ({
    clave: "item:i1",
    linea: linea("i1", dijeron, extra),
    conteo: conteo ? (leerConteosDelEnvio({ despacho_id: "d", conteos: [conteoCrudo({ despacho_item_id: "i1", ...conteo })] })?.conteos[0] ?? null) : null,
    categoria: CAT,
    marca: MARCA,
    proveedor: PROV,
    dijeron,
  });
  const ELEGIDA = { productoId: "pa", nombre: "Chompa Aurora", codigo: "CHO-1" };

  it("una línea trae su prenda: la elegida del catálogo, o la que se anotó por su nombre; nada si no hay ni una ni otra", () => {
    expect(prendasAnotadasDe(deLaGuia({ prendaElegida: ELEGIDA, descripcion: "otro nombre" }))).toEqual([{ productoId: "pa", nombre: "Chompa Aurora", codigo: "CHO-1", cantidad: 12 }]);
    expect(prendasAnotadasDe(deLaGuia({ descripcion: "  Vestido   midi " }))).toEqual([{ productoId: null, nombre: "Vestido midi", codigo: null, cantidad: 12 }]);
    expect(prendasAnotadasDe(deLaGuia({ prendaElegida: { ...ELEGIDA, nombre: null }, descripcion: "Chompa gris" }))[0].nombre).toBe("Chompa gris");
    expect(prendasAnotadasDe(deLaGuia({ descripcion: null }))).toEqual([]);
    expect(prendasAnotadasDe(deLaGuia({ descripcion: "   " }))).toEqual([]);
    // Lo que no venía en la guía no tiene qué se anotó; y una línea de 0 tampoco.
    expect(prendasAnotadasDe({ linea: null, dijeron: null })).toEqual([]);
    expect(prendasAnotadasDe(deLaGuia({ descripcion: "Vestido midi" }, null, 0))).toEqual([]);
  });

  it("separar una del catálogo la suma como prenda conocida (sin tallas); una solo por nombre, como nueva ya descrita", () => {
    const a = separarAnotada(SEPARADO_VACIO, { productoId: "pa", nombre: "Chompa Aurora", codigo: "CHO-1", cantidad: 12 }, 12);
    expect(a.prendas).toEqual([{ productoId: "pa", nombre: "Chompa Aurora", codigo: "CHO-1", cantidad: 12, variantes: null }]);
    const b = separarAnotada(SEPARADO_VACIO, { productoId: null, nombre: "Vestido midi", codigo: null, cantidad: 12 }, 12);
    expect(b.nuevas).toEqual([{ cantidad: 12, descripcion: "Vestido midi" }]);
    expect(totalSeparado(b)).toBe(12);
    // Las nuevas sin describir que ya había se usan primero: solo se suman las que faltan.
    const c = separarAnotada(cambiarNuevasSinDescribir(SEPARADO_VACIO, 2), { productoId: null, nombre: "Vestido midi", codigo: null, cantidad: 5 }, 5);
    expect(c.nuevas).toEqual([{ cantidad: 5, descripcion: "Vestido midi" }]);
    expect(totalSeparado(c)).toBe(5);
    const mas = separarAnotada(cambiarNuevasSinDescribir(SEPARADO_VACIO, 9), { productoId: null, nombre: "Vestido midi", codigo: null, cantidad: 5 }, 5);
    expect(mas.nuevas).toEqual([{ cantidad: 5, descripcion: "Vestido midi" }, { cantidad: 4, descripcion: null }]);
    // Pasarla, sacarla y volver a pasarla deja lo mismo: no se duplica.
    const ida = separarAnotada(SEPARADO_VACIO, { productoId: null, nombre: "Vestido midi", codigo: null, cantidad: 12 }, 12);
    const vuelta = quitarNuevaDescrita(ida, "Vestido midi");
    expect(totalSeparado(vuelta)).toBe(12);
    expect(totalSeparado(separarAnotada(vuelta, { productoId: null, nombre: "Vestido midi", codigo: null, cantidad: 12 }, 12))).toBe(12);
    // Nunca menos de una.
    expect(separarAnotada(SEPARADO_VACIO, { productoId: "pa", nombre: "Chompa Aurora", codigo: null, cantidad: 12 }, 0).prendas[0].cantidad).toBe(1);
  });
});

describe("ADR-0519: el costo propio de cada prenda al cerrar", () => {
  // Una línea de 10 contadas con dos prendas ya identificadas: Sofía (6) y Antonella (4); el costo de la línea, S/ 58.
  const sofia = { producto_id: "p-sofia", nombre: "Vestido Sofía", codigo: "VES-1", cantidad: 6 };
  const antonella = { producto_id: "p-antonella", nombre: "Vestido Antonella", codigo: "VES-2", cantidad: 4 };
  const lineaCon = (extraCrudo: Record<string, unknown> = {}): LineaParaContar => {
    const c = leerConteosDelEnvio({
      despacho_id: "d",
      conteos: [conteoCrudo({ despacho_item_id: "i1", contadas: 10, costo_unitario: 58, separado: { prendas: [sofia, antonella], nuevas: [] }, ...extraCrudo })],
    })?.conteos[0] ?? null;
    return { clave: "item:i1", linea: linea("i1", 10), conteo: c, categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: 10 };
  };
  const dec = (o: Partial<DecisionCierre> = {}): DecisionCierre => ({ costo: "58.00", confirmaCosto: false, faltanteCausa: null, sobranteCausa: null, nota: "", ...o });

  it("la lectura del conteo trae el costo propio de las prendas; sin él (o con basura), nada", () => {
    expect(lineaCon({ costos_prendas: { "p-sofia": 55.5, "p-antonella": "x", vacio: null } }).conteo?.costosPrendas).toEqual({ "p-sofia": 55.5 });
    expect(lineaCon().conteo?.costosPrendas).toEqual({});
    expect(lineaCon({ costos_prendas: [1, 2] }).conteo?.costosPrendas).toEqual({});
  });

  it("lo que dice el campo de una prenda: lo suyo si lo tocó (aunque sea vacío); si no, el de su línea", () => {
    expect(costoDePrendaTexto("58.00", undefined, "p-sofia")).toBe("58.00");
    expect(costoDePrendaTexto("58.00", { "p-sofia": "55.50" }, "p-sofia")).toBe("55.50");
    expect(costoDePrendaTexto("58.00", { "p-sofia": "55.50" }, "p-antonella")).toBe("58.00");
    expect(costoDePrendaTexto("58.00", { "p-sofia": "" }, "p-sofia")).toBe("");
  });

  it("lo que se manda: solo lo que cuesta distinto de la línea y es un monto; vacío, igual a la línea o mal escrito, no", () => {
    const l = lineaCon();
    expect(costosPropiosParaCerrar(l, "58.00", { "p-sofia": "55.5", "p-antonella": "58" })).toEqual({ "p-sofia": 55.5 });
    expect(costosPropiosParaCerrar(l, "58.00", { "p-sofia": "", "p-antonella": "doce" })).toEqual({});
    expect(costosPropiosParaCerrar(l, "58.00", undefined)).toEqual({});
    // Una prenda que ya no está separada en la línea no se manda (la base también la ignora).
    expect(costosPropiosParaCerrar(l, "58.00", { "p-otra": "10" })).toEqual({});
  });

  it("p_lineas lleva costos_prendas solo si hay algo propio, y no cambia lo demás", () => {
    const l = lineaCon();
    const sin = lineasParaCerrar([l], { "item:i1": dec() }, false);
    expect(sin[0]).not.toHaveProperty("costos_prendas");
    const con = lineasParaCerrar([l], { "item:i1": dec() }, false, { "item:i1": { "p-sofia": "55.50" } });
    expect(con[0]).toMatchObject({ despacho_item_id: "i1", costo_unitario: 58, costos_prendas: { "p-sofia": 55.5 } });
    // Si la línea cambia de costo, lo propio sigue siendo lo propio y las demás siguen a la línea.
    const nueva = lineasParaCerrar([l], { "item:i1": dec({ costo: "60" }) }, false, { "item:i1": { "p-sofia": "55.50", "p-antonella": "60" } });
    expect(nueva[0]).toMatchObject({ costo_unitario: 60, costos_prendas: { "p-sofia": 55.5 } });
  });

  it("solo se costea lo que tiene nombre: las prendas identificadas y las nuevas ya descritas; lo demás se cuenta aparte como «sin identificar»", () => {
    // 12 contadas: Sofía 6 + Antonella 4 identificadas, «holaa» 2 nuevas descritas, 0 sin describir… y 0 sueltas.
    const l = lineaCon({ contadas: 12, separado: { prendas: [sofia, antonella], nuevas: [{ cantidad: 2, descripcion: "holaa" }] } });
    expect(prendasConCosto(l).map((p) => [p.clave, p.nombre, p.unidades, p.nueva])).toEqual([
      ["p-sofia", "Vestido Sofía", 6, false],
      ["p-antonella", "Vestido Antonella", 4, false],
      [claveCostoDeNueva("holaa"), "holaa", 2, true],
    ]);
    expect(unidadesSinIdentificar(l)).toBe(0);
    // Las nuevas sin describir y lo sin separar NO tienen fila: entran con el costo de la línea y se avisan como «sin identificar».
    const sueltas = lineaCon({ contadas: 14, separado: { prendas: [sofia], nuevas: [{ cantidad: 4, descripcion: "holaa" }, { cantidad: 2, descripcion: null }] } });
    expect(prendasConCosto(sueltas).map((p) => p.nombre)).toEqual(["Vestido Sofía", "holaa"]);
    expect(unidadesSinIdentificar(sueltas)).toBe(4);
    expect(unidadesSinIdentificar(lineaCon({ contadas: 7, separado: { prendas: [], nuevas: [] } }))).toBe(7);
    expect(unidadesSinIdentificar({ conteo: null })).toBe(0);
  });

  it("el costo de una prenda nueva descrita viaja por su descripción, igual que lo lee la base", () => {
    const l = lineaCon({ contadas: 10, separado: { prendas: [sofia], nuevas: [{ cantidad: 4, descripcion: "Chompa con capucha" }] } });
    expect(costosPropiosParaCerrar(l, "58.00", { [claveCostoDeNueva("Chompa con capucha")]: "41.5", "p-sofia": "58" })).toEqual({ "nueva:Chompa con capucha": 41.5 });
    // Una descripción que ya no está en la línea no se manda.
    expect(costosPropiosParaCerrar(l, "58.00", { "nueva:Otra": "10" })).toEqual({});
    const sin = lineasParaCerrar([l], { "item:i1": dec() }, false, { "item:i1": { "nueva:Chompa con capucha": "41.50" } });
    expect(sin[0]).toMatchObject({ costos_prendas: { "nueva:Chompa con capucha": 41.5 } });
    const malos = costosDePrendaConProblema([l], { "item:i1": { "nueva:Chompa con capucha": "mucho" } });
    expect(malos).toHaveLength(1);
    expect(malos[0]).toMatchObject({ productoId: "nueva:Chompa con capucha", nombre: "Chompa con capucha" });
  });

  it("un costo mal escrito se avisa antes de ir a la base, con el nombre de la prenda", () => {
    const l = lineaCon();
    expect(costosDePrendaConProblema([l], { "item:i1": { "p-sofia": "55.50" } })).toEqual([]);
    const malos = costosDePrendaConProblema([l], { "item:i1": { "p-antonella": "-3", "p-sofia": "" } });
    expect(malos).toHaveLength(1);
    expect(malos[0]).toMatchObject({ linea: "item:i1", productoId: "p-antonella", nombre: "Vestido Antonella" });
    expect(malos[0].problema).toMatch(/negativo/);
  });
});

describe("ADR-0519 sobre ADR-0393: el costo de cada prenda en «Hacer ahora»", () => {
  const sofia = { producto_id: "p-sofia", nombre: "Vestido Sofía", codigo: "VES-1", cantidad: 6 };
  // Una línea contada en 10, a S/ 58 la unidad; `extra` pisa lo que trae el conteo (el costo propio de las prendas, por ejemplo).
  const lineaDe = (extra: Record<string, unknown> = {}): LineaParaContar => {
    const c = leerConteosDelEnvio({
      despacho_id: "d",
      conteos: [conteoCrudo({ despacho_item_id: "i1", contadas: 10, costo_unitario: 58, separado: { prendas: [sofia], nuevas: [] }, ...extra })],
    })?.conteos[0] ?? null;
    return { clave: "item:i1", linea: linea("i1", 10), conteo: c, categoria: CAT, marca: MARCA, proveedor: PROV, dijeron: 10 };
  };
  const prendas = [{ productoId: "p-sofia", nombre: "Vestido Sofía", codigo: "VES-1" }, { productoId: "p-otra", nombre: null, codigo: "VES-9" }];

  it("sin tocar, la prenda sale con el costo que ya tenía: el suyo propio, el que se le puso por su descripción, o el de su línea", () => {
    const l = lineaDe({ costos_prendas: { "p-sofia": 55.5, "nueva:Chompa con capucha": 41.5 } });
    expect(costoInicialDePrenda(l, "p-sofia")).toBe("55.50");
    expect(costoInicialDePrenda(l, "p-otra")).toBe("58.00");
    // Una prenda recién creada para un «crear»: todavía no tiene el suyo, pero su descripción sí.
    expect(costoInicialDePrenda(l, "p-nueva", "Chompa con capucha")).toBe("41.50");
    expect(costoInicialDePrenda(l, "p-nueva", "Otra descripción")).toBe("58.00");
    // Sin conteo (una línea que solo está en la guía) sale el costo de la orden; sin nada, vacío.
    expect(costoInicialDePrenda({ linea: linea("i1", 10, { costoUnitario: 30 }), conteo: null }, "p-sofia")).toBe("30.00");
    expect(costoInicialDePrenda(null, "p-sofia")).toBe("");
  });

  it("lo que se manda y se confirma: solo un monto válido y distinto de lo que costaba; vacío, igual o sin tocar, no", () => {
    const inicial = (id: string) => costoInicialDePrenda(lineaDe({ costos_prendas: { "p-sofia": 55.5 } }), id);
    const r = costosDeHacerAhora(prendas, { "p-sofia": "52", "p-otra": "58" }, inicial);
    expect(r.costos).toEqual({ "p-sofia": 52 });
    expect(r.cambios).toEqual([{ tipo: "compra", nombre: "Vestido Sofía", antes: 55.5, despues: 52, alcance: null, productoId: "p-sofia" }]);
    expect(r.problemas).toEqual([]);
    // Igual a lo que ya costaba (aunque se escriba con otro formato), vacío o sin tocar: nada.
    expect(costosDeHacerAhora(prendas, { "p-sofia": "55.5", "p-otra": "" }, inicial)).toEqual({ costos: {}, cambios: [], problemas: [] });
    expect(costosDeHacerAhora(prendas, {}, inicial)).toEqual({ costos: {}, cambios: [], problemas: [] });
  });

  it("un costo mal escrito se dice con el nombre de la prenda y no se manda; una prenda repetida cuenta una vez", () => {
    const inicial = () => "58.00";
    const r = costosDeHacerAhora([...prendas, prendas[0]], { "p-sofia": "-3", "p-otra": "doce" }, inicial);
    expect(r.costos).toEqual({});
    expect(r.cambios).toEqual([]);
    expect(r.problemas.map((p) => [p.productoId, p.nombre])).toEqual([["p-sofia", "Vestido Sofía"], ["p-otra", "VES-9"]]);
    expect(r.problemas[0].texto).toMatch(/negativo/);
    expect(costosDeHacerAhora([{ productoId: "p-x", nombre: null, codigo: null }], { "p-x": "100000" }, inicial).problemas[0]).toMatchObject({ nombre: "La prenda" });
  });

  it("resolver_pendiente_envio lleva `costos` dentro de lo separado solo si hay algo, y no cambia lo demás", () => {
    const base = { despachoId: "d1", linea: { linea: linea("i1", 10), conteo: null }, pendienteId: "pe1", separado: SEPARADO_VACIO, token: "t" };
    expect(argsResolverPendiente(base).p_separado).not.toHaveProperty("costos");
    expect(argsResolverPendiente({ ...base, costos: {} }).p_separado).not.toHaveProperty("costos");
    const con = argsResolverPendiente({ ...base, costos: { "p-sofia": 52 } });
    expect(con.p_separado).toMatchObject({ prendas: [], nuevas: [], costos: { "p-sofia": 52 } });
    expect(con).toMatchObject({ p_despacho_item_id: "i1", p_pendiente_id: "pe1", p_confirma_costo: false, p_token: "t" });
  });

  it("un costo que la base no dejó anotado no se da por hecho: lo dice la respuesta con el costo de cada prenda del conteo", () => {
    const cambios = [{ productoId: "p-sofia", despues: 52 }, { productoId: "p-otra", despues: 40 }];
    // La base lo anotó: nada que avisar. No lo anotó (la migración sin pegar lo ignora): se dice cuál. Sin respuesta, no se alarma.
    expect(costosSinGuardar(cambios, lineaDe({ costos_prendas: { "p-sofia": 52, "p-otra": 40 } }).conteo)).toEqual([]);
    expect(costosSinGuardar(cambios, lineaDe({ costos_prendas: { "p-sofia": 52 } }).conteo)).toEqual([cambios[1]]);
    expect(costosSinGuardar(cambios, lineaDe().conteo)).toEqual(cambios);
    expect(costosSinGuardar(cambios, null)).toEqual([]);
  });

  it("la confirmación dice lo que hay que saber de cada dinero que cambia, y solo de ese", () => {
    const costo = { tipo: "compra" as const, nombre: "Vestido Sofía", antes: 55.5, despues: 52, alcance: null };
    const venta = { tipo: "venta" as const, nombre: "Vestido Sofía", antes: 99.9, despues: 105, alcance: "sede" as const };
    expect(avisoDeConfirmarHacerAhora([costo])).toMatch(/^El costo cambia lo que cuesta lo que entra ahora/);
    expect(avisoDeConfirmarHacerAhora([costo])).not.toMatch(/precio de venta/i);
    expect(avisoDeConfirmarHacerAhora([venta])).toMatch(/^El precio de venta rige desde ahora/);
    expect(avisoDeConfirmarHacerAhora([venta])).not.toMatch(/costo/i);
    expect(avisoDeConfirmarHacerAhora([costo, venta])).toMatch(/costo[\s\S]*precio de venta/i);
  });
});
