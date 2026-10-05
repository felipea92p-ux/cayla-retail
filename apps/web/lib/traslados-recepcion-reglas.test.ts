import { describe, it, expect } from "vitest";
import {
  DIAS_LO_SIGUIENTE,
  loSiguienteDeLaRecepcion,
  anulacion,
  avisoRecepcion,
  buscarEnTraslado,
  consecuenciaAnular,
  consecuenciaCierre,
  insigniaComparacion,
  leerCasilla,
  leerConteo,
  lugarTexto,
  mensajeEscaneo,
  nombrePrenda,
  puedeTerminar,
  recorridoRecepcion,
  resolverEscaneo,
  resumenAntesDeConfirmar,
  resumirGuardado,
  sumarAlConteo,
  textoObligatorioValido,
  textoPorContar,
  valorContado,
  type LineaRecepcion,
  type TrasladoParaRecorrido,
} from "./traslados-recepcion-reglas";

function linea(p: Partial<LineaRecepcion> & { varianteId: string }): LineaRecepcion {
  return {
    referencia: "Blusa Valentina",
    talla: "S",
    color: "Blanco",
    sku: "",
    codigo: null,
    cantidadEnviada: 1,
    cantidadRecibida: null,
    ingresado: false,
    ...p,
  };
}

const VESTIDO = linea({ varianteId: "v1", referencia: "Vestido Antonella", talla: "M", color: "Rosado", codigo: "VES-0002-ROS-M", cantidadEnviada: 2 });
const BLUSA = linea({ varianteId: "b1", referencia: "Blusa Valentina", talla: "S", color: "Blanco", codigo: "BLU-0001-BLA-S", cantidadEnviada: 1 });

describe("lo contado", () => {
  it("la casilla vale lo cambiado en pantalla; si no, lo guardado; null es sin contar (no 0)", () => {
    expect(valorContado({ varianteId: "v1", cantidadRecibida: null }, {})).toBeNull();
    expect(valorContado({ varianteId: "v1", cantidadRecibida: 2 }, {})).toBe(2);
    expect(valorContado({ varianteId: "v1", cantidadRecibida: 2 }, { v1: 3 })).toBe(3);
    expect(valorContado({ varianteId: "v1", cantidadRecibida: 2 }, { v1: null })).toBeNull();
  });

  it("«−» nunca baja de 0 y sobre una casilla vacía la deja en 0", () => {
    expect(sumarAlConteo(null, -1)).toBe(0);
    expect(sumarAlConteo(null, 1)).toBe(1);
    expect(sumarAlConteo(3, -1)).toBe(2);
  });

  it("la casilla solo acepta enteros de 0 en adelante; vacía es sin contar", () => {
    expect(leerCasilla("")).toBeNull();
    expect(leerCasilla(" 4 ")).toBe(4);
    expect(leerCasilla("0")).toBe(0);
    expect(leerCasilla("2.5")).toBeUndefined();
    expect(leerCasilla("-1")).toBeUndefined();
  });

  it("nombra la prenda como se dice en tienda", () => {
    expect(nombrePrenda(BLUSA)).toBe("Blusa Valentina S blanco");
    expect(nombrePrenda({ referencia: "Pañuelo", talla: null, color: null })).toBe("Pañuelo");
  });
});

describe("leerConteo", () => {
  it("cuenta lo que falta por contar; 0 cuenta como contado", () => {
    const l = leerConteo([VESTIDO, BLUSA], { v1: 2 });
    expect(l.porContar).toBe(1);
    expect(l.lista).toBe(false);
    const l2 = leerConteo([VESTIDO, BLUSA], { v1: 2, b1: 0 });
    expect(l2.porContar).toBe(0);
    expect(l2.lista).toBe(true);
    expect(l2.unidadesContadas).toBe(2);
  });

  it("separa lo que coincide (entra) de lo que tiene diferencia (espera a un líder)", () => {
    const l = leerConteo([VESTIDO, BLUSA], { v1: 2, b1: 0 });
    expect(l.coinciden.map((x) => x.varianteId)).toEqual(["v1"]);
    expect(l.unidadesQueCoinciden).toBe(2);
    expect(l.conDiferencia.map((x) => x.varianteId)).toEqual(["b1"]);
    expect(l.lineas.get("b1")?.comparacion).toBe("faltan");
  });

  it("lo que ya entró al stock no entra de nuevo ni espera", () => {
    const l = leerConteo([{ ...VESTIDO, cantidadRecibida: 2, ingresado: true }, { ...BLUSA, cantidadRecibida: 0 }], {});
    expect(l.yaEnStock).toBe(1);
    expect(l.coinciden).toHaveLength(0);
    expect(l.conDiferencia.map((x) => x.varianteId)).toEqual(["b1"]);
    expect(l.lineas.get("v1")?.comparacion).toBe("ya_en_stock");
  });

  it("una prenda de más no se pide contar; si se contó más de 0, es diferencia", () => {
    const extra = linea({ varianteId: "x1", cantidadEnviada: null, cantidadRecibida: 1 });
    const l = leerConteo([VESTIDO, extra], { v1: 2 });
    expect(l.enviadas).toBe(1);
    expect(l.lista).toBe(true);
    expect(l.conDiferencia.map((x) => x.varianteId)).toEqual(["x1"]);
    expect(l.lineas.get("x1")?.comparacion).toBe("sobran");
  });

  it("plural de lo que falta por contar", () => {
    expect(textoPorContar(1)).toBe("Falta 1 prenda por contar");
    expect(textoPorContar(3)).toBe("Faltan 3 prendas por contar");
  });

  it("la insignia pide volver a contar mientras se puede, y después dice qué pasó", () => {
    const l = leerConteo([VESTIDO, BLUSA], { v1: 3, b1: 0 });
    expect(insigniaComparacion(l.lineas.get("b1")!, { recontable: true }).texto).toBe("Vuelve a contarla");
    expect(insigniaComparacion(l.lineas.get("b1")!, { recontable: false }).texto).toBe("Falta 1");
    expect(insigniaComparacion(l.lineas.get("v1")!, { recontable: false }).texto).toBe("Sobra 1");
  });
});

describe("guardado línea por línea", () => {
  it("resume lo pendiente y los errores", () => {
    expect(resumirGuardado({ a: { tipo: "espera" }, b: { tipo: "guardando" }, c: { tipo: "guardado" }, d: { tipo: "error", mensaje: "x" }, f: undefined })).toEqual({
      pendientes: 2,
      errores: 1,
    });
  });

  it("«Terminé de contar» dice por qué no se puede", () => {
    const vacio = { pendientes: 0, errores: 0 };
    expect(puedeTerminar({ porContar: 2 }, vacio)).toEqual({ habilitado: false, motivo: "Faltan 2 prendas por contar" });
    expect(puedeTerminar({ porContar: 0 }, { ...vacio, errores: 1 }).motivo).toBe("1 prenda no se guardó: reintenta");
    expect(puedeTerminar({ porContar: 0 }, vacio)).toEqual({ habilitado: true, motivo: null });
  });
});

describe("escáner", () => {
  const catalogo = [
    { varianteId: "v1", sku: "VES-ANTO-ROS-M", codigosBarras: ["VES-0002-ROS-M", "7750000000011"] },
    { varianteId: "b1", sku: "", codigosBarras: ["BLU-0001-BLA-S"] },
    { varianteId: "z9", sku: "", codigosBarras: ["TOP-0009-NEG-L"] },
  ];

  it("la etiqueta completa suma a su prenda, sin mayúsculas", () => {
    expect(resolverEscaneo("ves-0002-ros-m", [VESTIDO, BLUSA], catalogo)).toEqual({ tipo: "linea", varianteId: "v1" });
  });

  it("otro código de barras de la misma prenda, o el interno, también suma", () => {
    expect(resolverEscaneo("7750000000011", [VESTIDO, BLUSA], catalogo)).toEqual({ tipo: "linea", varianteId: "v1" });
    expect(resolverEscaneo("VES-ANTO-ROS-M", [VESTIDO, BLUSA], catalogo)).toEqual({ tipo: "linea", varianteId: "v1" });
  });

  it("una prenda del catálogo que no viene: se dice así, no «no está en el catálogo»", () => {
    const r = resolverEscaneo("TOP-0009-NEG-L", [VESTIDO, BLUSA], catalogo);
    expect(r).toEqual({ tipo: "fuera", varianteId: "z9" });
    expect(mensajeEscaneo(r, "Tienda Trujillo")).toBe("Esa prenda no viene en este traslado. Apártala y avisa a Tienda Trujillo.");
  });

  it("quien escribe palabras encuentra la prenda del traslado, en cualquier orden y sin tildes", () => {
    expect(resolverEscaneo("vestido rosado m", [VESTIDO, BLUSA], catalogo)).toEqual({ tipo: "linea", varianteId: "v1" });
    expect(buscarEnTraslado("ROSADO vestido", [VESTIDO, BLUSA]).map((l) => l.varianteId)).toEqual(["v1"]);
  });

  it("una talla corta calza entera: «s» no trae todo lo que tenga una s", () => {
    expect(buscarEnTraslado("s", [VESTIDO, BLUSA]).map((l) => l.varianteId)).toEqual(["b1"]);
  });

  it("si calzan varias, pide elegir; si nada, lo dice", () => {
    const otra = linea({ varianteId: "b2", talla: "M" });
    expect(resolverEscaneo("blusa", [BLUSA, otra], catalogo)).toEqual({ tipo: "varias", varianteIds: ["b1", "b2"] });
    expect(resolverEscaneo("zapato", [BLUSA], catalogo)).toEqual({ tipo: "nada" });
    expect(mensajeEscaneo({ tipo: "nada" }, "X")).toMatch(/No encontramos esa prenda/);
  });
});

describe("confirmar", () => {
  it("dice dónde queda lo que llega", () => {
    expect(lugarTexto("piso_venta", "Tienda Lima")).toBe("al piso de venta de Tienda Lima");
    expect(lugarTexto("almacen_tienda", "Tienda Lima")).toBe("al almacén de Tienda Lima");
    expect(lugarTexto(null, "Taller")).toBe("al stock de Taller");
  });

  it("antes de confirmar: entra lo que coincide y la diferencia espera, con nombre", () => {
    const l = leerConteo([VESTIDO, BLUSA], { v1: 2, b1: 0 });
    const r = resumenAntesDeConfirmar(l, { destino: "piso_venta", sede: "Tienda Lima" });
    expect(r.entran).toBe("Entran 2 prendas que coinciden al piso de venta de Tienda Lima.");
    expect(r.esperan).toBe("1 prenda con diferencia espera a un líder; las demás ya se pueden vender.");
    expect(r.detalleEsperan).toEqual(["Blusa Valentina S blanco: enviaron 1, contaste 0"]);
  });

  it("si todo coincide, no hay nada que espere", () => {
    const l = leerConteo([VESTIDO], { v1: 2 });
    expect(resumenAntesDeConfirmar(l, { destino: null, sede: "Taller" })).toEqual({ entran: "Entran 2 prendas que coinciden al stock de Taller.", esperan: null, detalleEsperan: [] });
  });

  it("en singular y sin nada que coincida", () => {
    const uno = leerConteo([BLUSA], { b1: 1 });
    expect(resumenAntesDeConfirmar(uno, { destino: "almacen_tienda", sede: "Tienda Lima" }).entran).toBe("Entra 1 prenda que coincide al almacén de Tienda Lima.");
    const ninguno = leerConteo([BLUSA], { b1: 0 });
    const r = resumenAntesDeConfirmar(ninguno, { destino: "piso_venta", sede: "Tienda Lima" });
    expect(r.entran).toMatch(/nada entra al stock todavía/);
    expect(r.esperan).toBe("1 prenda con diferencia espera a un líder.");
  });

  it("el aviso dice lo que de verdad entró y dónde", () => {
    expect(
      avisoRecepcion({ numero: 5, resultado: "cerrada", unidadesIngresadas: 3, lineasConDiferencia: 0, destino: "piso_venta", sede: "Tienda Lima", puedeCerrarDiferencia: false }),
    ).toEqual({ titulo: "Traslado 5 recibido", detalle: "Entraron 3 prendas al piso de venta de Tienda Lima." });
    expect(
      avisoRecepcion({ numero: 5, resultado: "recibido_con_diferencia", unidadesIngresadas: 1, lineasConDiferencia: 2, destino: "almacen_tienda", sede: "Tienda Lima", puedeCerrarDiferencia: true }),
    ).toEqual({ titulo: "Traslado 5 recibido con diferencia", detalle: "Entró 1 prenda al almacén de Tienda Lima. 2 prendas con diferencia esperan a un líder: revísalas y ciérralas abajo." });
  });
});

describe("cerrar con diferencia", () => {
  it("escribe qué se da por perdido, con el nombre de la prenda y el plural bien", () => {
    const c = consecuenciaCierre([{ ...VESTIDO, cantidadRecibida: 2, ingresado: true }, { ...BLUSA, cantidadRecibida: 0 }], {}, { destino: "piso_venta", sede: "Tienda Lima" });
    expect(c.perdidas).toBe("Se da por perdida 1 prenda: Blusa Valentina S blanco.");
    expect(c.entran).toBe("No entra ninguna prenda más al stock.");
    expect(c.deMas).toBeNull();
    expect(c.unidadesPerdidas).toBe(1);
  });

  it("varias perdidas y lo de más", () => {
    const jean = linea({ varianteId: "j1", referencia: "Jean Mom", talla: "30", color: "Azul", cantidadEnviada: 3, cantidadRecibida: 1 });
    const top = linea({ varianteId: "t1", referencia: "Top Aurora", talla: "M", color: "Negro", cantidadEnviada: 1, cantidadRecibida: 2 });
    const c = consecuenciaCierre([jean, { ...BLUSA, cantidadRecibida: 0 }, top], {}, { destino: "piso_venta", sede: "Tienda Lima" });
    expect(c.perdidas).toBe("Se dan por perdidas 3 prendas: Jean Mom 30 azul (2), Blusa Valentina S blanco (1).");
    expect(c.deMas).toBe("Llegó 1 prenda de más y también entra: Top Aurora M negro.");
    expect(c.entran).toBe("Entran 3 prendas al piso de venta de Tienda Lima.");
  });

  it("la nota y el motivo son obligatorios", () => {
    expect(textoObligatorioValido("  ok ")).toBe(false);
    expect(textoObligatorioValido("No llegó")).toBe(true);
  });
});

describe("anular", () => {
  const base = { estado: "en_transito", esOrigen: true, esLider: false, lineas: [{ cantidadRecibida: null }], destinoNombre: "Tienda Lima" };

  it("lo ofrece a quien envió o a un líder, solo en camino", () => {
    expect(anulacion(base)).toEqual({ mostrar: true, habilitado: true, porQueNo: null });
    expect(anulacion({ ...base, esOrigen: false, esLider: true }).mostrar).toBe(true);
    expect(anulacion({ ...base, esOrigen: false }).mostrar).toBe(false);
    expect(anulacion({ ...base, estado: "recibido_con_diferencia" }).mostrar).toBe(false);
  });

  it("si la otra sede ya empezó a contar, se ve apagado y dice por qué", () => {
    expect(anulacion({ ...base, lineas: [{ cantidadRecibida: null }, { cantidadRecibida: 0 }] })).toEqual({
      mostrar: true,
      habilitado: false,
      porQueNo: "Tienda Lima ya empezó a contar: que registre lo que llegó.",
    });
  });

  it("escribe la consecuencia en singular y plural", () => {
    expect(consecuenciaAnular(5, "Tienda Trujillo", "Tienda Lima")).toBe("Las 5 prendas vuelven al stock de Tienda Trujillo. Tienda Lima ya no verá este traslado por recibir.");
    expect(consecuenciaAnular(1, "Tienda Trujillo", "Tienda Lima")).toMatch(/^La prenda vuelve/);
  });
});

describe("recorridoRecepcion", () => {
  const AHORA = "2026-09-26T18:00:00.000Z";
  const t: TrasladoParaRecorrido = {
    estado: "en_transito",
    ubicacionOrigenNombre: "Tienda Trujillo",
    ubicacionDestinoNombre: "Tienda Lima",
    fechaEstimadaLlegada: "2026-09-26T20:00:00.000Z",
    creadoEn: "2026-09-26T15:00:00.000Z",
    confirmadoEn: null,
    cerradoEn: null,
    anuladoEn: null,
    creadoPorNombre: "Ana",
    confirmadoPorNombre: null,
    cerradoPorNombre: null,
    anuladoPorNombre: null,
  };
  const ctx = { esDestino: true, meTocaCerrar: false, contadas: 0, enviadas: 2, huboDiferencia: false, ahoraIso: AHORA };

  it("anulado es el final: salió y anulado, con quién", () => {
    const pasos = recorridoRecepcion({ ...t, estado: "anulada", anuladoEn: "2026-09-26T16:00:00.000Z", anuladoPorNombre: "Ana" }, ctx);
    expect(pasos.map((p) => p.clave)).toEqual(["salio", "anulado"]);
    expect(pasos[1].estado).toBe("anulado");
    expect(pasos[1].lineas).toContain("Anuló Ana");
  });

  it("contando: dice cuántas lleva, sin depender de que alguien haya confirmado", () => {
    const pasos = recorridoRecepcion(t, { ...ctx, contadas: 1 });
    expect(pasos[2]).toMatchObject({ estado: "actual", lineas: ["Contando: 1 de 2 prendas"] });
  });

  it("atrasado es urgente solo para quien recibe", () => {
    const atrasado = { ...t, fechaEstimadaLlegada: "2026-09-26T16:00:00.000Z" };
    expect(recorridoRecepcion(atrasado, ctx)[1].estado).toBe("urgente");
    expect(recorridoRecepcion(atrasado, { ...ctx, esDestino: false })[1].estado).toBe("actual");
  });

  it("recibido con diferencia: lo que coincidió ya está en stock y la diferencia espera", () => {
    const pasos = recorridoRecepcion({ ...t, estado: "recibido_con_diferencia", confirmadoEn: AHORA, confirmadoPorNombre: "Luz" }, { ...ctx, meTocaCerrar: true });
    expect(pasos[2]).toMatchObject({ estado: "alerta" });
    expect(pasos[2].lineas).toContain("Confirmó Luz");
    expect(pasos[3].lineas).toEqual(["Lo que coincidió ya está en stock", "Te toca cerrar la diferencia"]);
  });
});

describe("Lo siguiente: después de recibir (ADR-0242 D-6.1)", () => {
  const AHORA = "2026-10-03T20:00:00.000Z";
  const AYER = "2026-10-02T20:00:00.000Z";
  const base = {
    esDestino: true,
    lugarRecibido: "almacen_tienda" as const,
    lineas: [
      { varianteId: "v1", cantidadRecibida: 3, ingresado: true },
      { varianteId: "v2", cantidadRecibida: 1, ingresado: true },
    ],
    trasladoId: "tr-1",
    ultimoIngresoIso: AYER,
    ahoraIso: AHORA,
    veExistencias: true,
    sede: "Tienda Lima",
  };

  it("si quedó en el almacén: «Colgar estas en el piso» (principal) con las prendas que entraron, y las etiquetas de justo esas unidades", () => {
    const r = loSiguienteDeLaRecepcion(base)!;
    expect(r.intro).toBe("Lo que llegó quedó en el almacén de Tienda Lima. Para venderlo, hay que colgarlo en el piso.");
    expect(r.acciones).toEqual([
      { clave: "bajar", texto: "Colgar estas en el piso", href: "/inventario/bajar?lineas=v1:3,v2:1", principal: true },
      { clave: "etiquetas", texto: "Imprimir etiquetas", href: "/etiquetas-de-precio?unidades=v1:3,v2:1&traslado=tr-1", principal: false },
    ]);
  });

  it("si quedó en el piso: solo etiquetas (no hay nada que bajar)", () => {
    const r = loSiguienteDeLaRecepcion({ ...base, lugarRecibido: "piso_venta" })!;
    expect(r.intro).toBe("Lo que llegó ya está en el piso de Tienda Lima.");
    expect(r.acciones.map((a) => a.clave)).toEqual(["etiquetas"]);
    expect(r.acciones[0]!.principal).toBe(true);
  });

  it("solo cuenta lo que ENTRÓ: una prenda con diferencia que espera al líder no va en la lista", () => {
    const r = loSiguienteDeLaRecepcion({ ...base, lineas: [{ varianteId: "v1", cantidadRecibida: 3, ingresado: true }, { varianteId: "v2", cantidadRecibida: 1, ingresado: false }, { varianteId: "v3", cantidadRecibida: 0, ingresado: true }] })!;
    expect(r.acciones[0]!.href).toBe("/inventario/bajar?lineas=v1:3");
  });

  it("sin el módulo Existencias no se ofrece «Colgar en el piso» (llevaría a «Sin acceso»), pero las etiquetas sí", () => {
    const r = loSiguienteDeLaRecepcion({ ...base, veExistencias: false })!;
    expect(r.acciones.map((a) => a.clave)).toEqual(["etiquetas"]);
    expect(r.acciones[0]!.principal).toBe(true);
  });

  it("nada para quien envió, ni en una sede sin piso y almacén (el Taller), ni si no entró ninguna prenda", () => {
    expect(loSiguienteDeLaRecepcion({ ...base, esDestino: false })).toBeNull();
    expect(loSiguienteDeLaRecepcion({ ...base, lugarRecibido: null })).toBeNull();
    expect(loSiguienteDeLaRecepcion({ ...base, lineas: [{ varianteId: "v1", cantidadRecibida: 3, ingresado: false }] })).toBeNull();
    expect(loSiguienteDeLaRecepcion({ ...base, lineas: [] })).toBeNull();
  });

  it("dura una semana desde que entró lo último; pasado ese día, ya es ruido", () => {
    const dentro = new Date(new Date(AHORA).getTime() - DIAS_LO_SIGUIENTE * 86_400_000).toISOString();
    const fuera = new Date(new Date(AHORA).getTime() - (DIAS_LO_SIGUIENTE * 86_400_000 + 60_000)).toISOString();
    expect(loSiguienteDeLaRecepcion({ ...base, ultimoIngresoIso: dentro })).not.toBeNull();
    expect(loSiguienteDeLaRecepcion({ ...base, ultimoIngresoIso: fuera })).toBeNull();
  });

  it("si ya se bajó TODO lo que llegó, no pide bajar nada (el botón llevaría a una lista vacía) y lo dice", () => {
    const r = loSiguienteDeLaRecepcion({ ...base, bajables: new Set() })!;
    expect(r.intro).toBe("Lo que llegó ya salió del almacén de Tienda Lima.");
    expect(r.acciones.map((a) => a.clave)).toEqual(["etiquetas"]);
    expect(r.acciones[0]!.principal).toBe(true);
  });

  it("si queda PARTE en el almacén, «Bajar» lleva solo esa parte; las etiquetas, las unidades que entraron", () => {
    const r = loSiguienteDeLaRecepcion({ ...base, bajables: new Set(["v2"]) })!;
    expect(r.intro).toContain("quedó en el almacén");
    expect(r.acciones[0]!.href).toBe("/inventario/bajar?lineas=v2:1");
    expect(r.acciones[1]!.href).toBe("/etiquetas-de-precio?unidades=v1:3,v2:1&traslado=tr-1");
  });

  it("una prenda apartada para una clienta no está «bajable»: tampoco se pide bajarla", () => {
    expect(loSiguienteDeLaRecepcion({ ...base, bajables: new Set(["v1"]) })!.acciones[0]!.href).toBe("/inventario/bajar?lineas=v1:3");
  });

  it("si no se pudo leer el stock, se ofrece como antes (la pantalla de bajar descarta lo que no se puede)", () => {
    expect(loSiguienteDeLaRecepcion({ ...base, bajables: undefined })!.acciones[0]!.href).toBe("/inventario/bajar?lineas=v1:3,v2:1");
  });

  it("las etiquetas llevan el id del traslado: así «Volver» regresa a su detalle", () => {
    expect(loSiguienteDeLaRecepcion({ ...base, trasladoId: "abc" })!.acciones.find((a) => a.clave === "etiquetas")!.href).toContain("&traslado=abc");
  });

  it("sin fecha de ingreso (dato viejo) no se inventa: nada", () => {
    expect(loSiguienteDeLaRecepcion({ ...base, ultimoIngresoIso: null })).toBeNull();
  });

  it("con más prendas distintas que el tope de una URL: «Colgar en el piso» se abre sin lista y no se ofrecen etiquetas", () => {
    const muchas = Array.from({ length: 101 }, (_, i) => ({ varianteId: `v${i}`, cantidadRecibida: 1, ingresado: true }));
    const r = loSiguienteDeLaRecepcion({ ...base, lineas: muchas })!;
    expect(r.acciones).toEqual([{ clave: "bajar", texto: "Colgar en el piso", href: "/inventario/bajar", principal: true }]);
    expect(loSiguienteDeLaRecepcion({ ...base, lugarRecibido: "piso_venta", lineas: muchas })).toBeNull();
  });
});
