import { describe, it, expect } from "vitest";
import {
  analizarInventario,
  analizarVariante,
  calcularCobertura,
  calcularVelocidad,
  capacidadDeOrigen,
  curvasPorVariante,
  formatoCobertura,
  sugerirTraslado,
  textoAccion,
  textoCobertura,
  textoEnRed,
  unidadesNecesarias,
  MIN_DIAS_HISTORIAL,
  type FilaVarianteResumen,
  type UbicacionEnRed,
} from "./resumen-reglas";

// El Resumen decide sobre lo que `fn_resumen_variantes` trae por variante y
// sede. Estas pruebas cubren lo que Felipe pidió que NUNCA pase: velocidad
// inventada con poco historial, riesgo falso, traslados que vacían al origen,
// y curvas "rotas" por tallas que el producto nunca tuvo.

const TRU = { id: "u-tru", nombre: "Trujillo", tipo: "tienda" as const };

const base: FilaVarianteResumen = {
  varianteId: "v1",
  productoId: "p1",
  referencia: "Blusa Camila",
  categoria: "Blusas",
  sku: "BLU-0001-BLA-M",
  codigo: null,
  talla: "M",
  colorCodigo: "BLA",
  color: "Blanco",
  colorHex: "#ffffff",
  fotoUrl: null,
  stockMinimo: null,
  separaPisoAlmacen: true,
  // Piso > 7 y almacén > 10: "normal" para Existencias, así cada caso de abajo
  // cambia solo lo que quiere probar.
  piso: 8,
  almacen: 12,
  sinSububicacion: 0,
  cuarentena: 0,
  disponible: 20,
  primerIngreso: "2026-08-01T00:00:00Z",
  diasObservables: 30,
  ventasVentana: 0,
  devolucionesVentana: 0,
  ultimaVenta: null,
  entradasVentana: 0,
  mermasVentana: 0,
  trasladosSalidaVentana: 0,
  enCamino: 0,
  enCaminoATiempo: 0,
  enCaminoAtrasado: false,
  proximaLlegada: null,
  enRed: [],
};

/** Ahora fijo para las pruebas de fecha de llegada. */
const AHORA = new Date("2026-09-17T12:00:00Z");
const enDias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString();
/** Lo que viene, todo a tiempo, llegando en `dias`. */
const viene = (unidades: number, dias = 1) => ({ enCamino: unidades, enCaminoATiempo: unidades, enCaminoAtrasado: false, proximaLlegada: enDias(dias) });

const taller = (extra: Partial<UbicacionEnRed> = {}): UbicacionEnRed => ({
  ubicacionId: "u-taller",
  nombre: "Taller",
  tipo: "taller",
  separaPisoAlmacen: false,
  disponible: 9,
  almacen: 9,
  diasObservables: 30,
  ventasVentana: 0,
  devolucionesVentana: 0,
  enCamino: 0,
  ...extra,
});

const lima = (extra: Partial<UbicacionEnRed> = {}): UbicacionEnRed => ({
  ubicacionId: "u-lima",
  nombre: "Lima",
  tipo: "tienda",
  separaPisoAlmacen: true,
  disponible: 10,
  almacen: 8,
  diasObservables: 30,
  ventasVentana: 6,
  devolucionesVentana: 0,
  enCamino: 0,
  ...extra,
});

describe("calcularVelocidad — nunca inventa un ritmo que no se observó", () => {
  it("sin primer ingreso a la sede: sin historial, velocidad null", () => {
    expect(calcularVelocidad(null, 0, 0)).toMatchObject({ estado: "sin_historial", unidadesDia: null });
  });

  it("prenda que llegó hace 3 días: historial corto aunque haya vendido", () => {
    const v = calcularVelocidad(3, 4, 0);
    expect(v.estado).toBe("historial_corto");
    expect(v.unidadesDia).toBeNull();
    expect(v.ventasNetas).toBe(4);
  });

  it("con historial suficiente divide entre los días OBSERVADOS, no entre 30", () => {
    const v = calcularVelocidad(10, 5, 0);
    expect(v.estado).toBe("ok");
    expect(v.unidadesDia).toBeCloseTo(0.5);
  });

  it("las devoluciones corrigen la demanda y nunca la dejan negativa", () => {
    expect(calcularVelocidad(30, 3, 5)).toMatchObject({ estado: "sin_ventas", unidadesDia: 0, ventasNetas: 0 });
  });

  it("umbral de historial: justo en el mínimo ya cuenta", () => {
    expect(calcularVelocidad(MIN_DIAS_HISTORIAL, 7, 0).estado).toBe("ok");
    expect(calcularVelocidad(MIN_DIAS_HISTORIAL - 1, 7, 0).estado).toBe("historial_corto");
  });
});

describe("calcularCobertura — sin ritmo no hay número", () => {
  it("cobertura = unidades / velocidad, a un decimal", () => {
    expect(calcularCobertura(15, calcularVelocidad(30, 30, 0))).toBe(15);
    expect(calcularCobertura(3, calcularVelocidad(30, 60, 0))).toBe(1.5);
  });

  it("null con historial corto, sin historial o sin ventas — nunca Infinity", () => {
    expect(calcularCobertura(15, calcularVelocidad(2, 5, 0))).toBeNull();
    expect(calcularCobertura(15, calcularVelocidad(null, 0, 0))).toBeNull();
    expect(calcularCobertura(15, calcularVelocidad(30, 0, 0))).toBeNull();
  });
});

describe("analizarVariante — situaciones", () => {
  it("empresa nueva sin ventas y con stock: normal, con historial corto explicado", () => {
    const a = analizarVariante({ ...base, diasObservables: 2 }, TRU, null);
    expect(a.situacion).toBe("normal");
    expect(a.motivos.join(" ")).toMatch(/Historial corto/);
  });

  it("riesgo de quiebre por cobertura baja con demanda real", () => {
    // 15 unidades, 60 vendidas en 30 días = 2/día → 7.5 días... bajemos stock.
    const a = analizarVariante({ ...base, piso: 2, almacen: 2, disponible: 4, ventasVentana: 60 }, TRU, null);
    expect(a.situacion).toBe("riesgo_quiebre");
    expect(a.coberturaDias).toBe(2);
    expect(a.critico).toBe(true);
  });

  it("sin stock pero sin ninguna venta observada: NO es riesgo (no hay evidencia)", () => {
    const a = analizarVariante({ ...base, piso: 0, almacen: 0, disponible: 0, ventasVentana: 0 }, TRU, null);
    expect(a.situacion).not.toBe("riesgo_quiebre");
  });

  it("sin stock con ventas recientes aunque el historial sea corto: sí es riesgo", () => {
    const a = analizarVariante({ ...base, piso: 0, almacen: 0, disponible: 0, diasObservables: 3, ventasVentana: 2 }, TRU, null);
    expect(a.situacion).toBe("riesgo_quiebre");
    expect(a.critico).toBe(true);
  });

  it("mejora en camino: lo que viene llega antes de agotarse y saca a la prenda del riesgo → esperar recepción", () => {
    const a = analizarVariante({ ...base, piso: 1, almacen: 2, disponible: 3, ventasVentana: 60, ...viene(21, 1) }, TRU, null, AHORA);
    expect(a.situacion).toBe("mejora_en_camino");
    expect(a.accion).toBe("esperar_recepcion");
    expect(a.coberturaDias).toBe(1.5);
    expect(a.coberturaProyectadaDias).toBe(12);
  });

  it("lo que viene NO es mejora si llega después de que se agote lo que hay", () => {
    // 1.5 días de stock, el traslado llega en 13 días.
    const a = analizarVariante({ ...base, piso: 1, almacen: 2, disponible: 3, ventasVentana: 60, ...viene(21, 13), enRed: [taller()] }, TRU, null, AHORA);
    expect(a.situacion).toBe("riesgo_quiebre");
    expect(a.accion).toBe("sugerir_traslado");
    expect(a.motivos.join(" ")).toMatch(/después de agotarse/);
  });

  it("en camino ATRASADO no salva a nadie ni se descuenta de lo que hace falta", () => {
    const f = { ...base, piso: 1, almacen: 2, disponible: 3, ventasVentana: 60, enCamino: 21, enCaminoATiempo: 0, enCaminoAtrasado: true, enRed: [taller({ disponible: 40, almacen: 40 })] };
    const a = analizarVariante(f, TRU, null, AHORA);
    expect(a.situacion).toBe("riesgo_quiebre");
    expect(a.accion).toBe("sugerir_traslado");
    // 2/día × 14 días = 28 − 3 en stock − 0 a tiempo = 25 (lo atrasado no cuenta).
    expect(unidadesNecesarias(f, a.velocidad, "demanda")).toBe(25);
  });

  it("el umbral se compara con la cobertura exacta, no con la redondeada", () => {
    // 7.04 días se muestra como 7 pero NO es riesgo (> 7).
    const a = analizarVariante({ ...base, piso: 8, almacen: 12, disponible: 20, diasObservables: 30, ventasVentana: 85 }, TRU, null);
    expect(a.coberturaDias).toBe(7.1);
    expect(a.situacion).not.toBe("riesgo_quiebre");
  });

  it("reponer piso es reposición INTERNA: no se confunde con reponer tienda", () => {
    const a = analizarVariante({ ...base, piso: 2, almacen: 20, disponible: 22, ventasVentana: 3 }, TRU, null);
    expect(a.situacion).toBe("reponer_piso");
    expect(a.accion).toBe("mover_a_piso");
    expect(a.estadoTienda).toBe("reponer_piso");
  });

  it("stock bajo de Existencias con demanda lenta NO es riesgo de quiebre, pero tampoco es saludable: es reponer TIENDA", () => {
    // Existencias dice "stock bajo" (almacén ≤ 10); 0.2/día con 13 uds = 65 días de cobertura, así que no es riesgo.
    const a = analizarVariante({ ...base, piso: 8, almacen: 5, disponible: 13, ventasVentana: 6 }, TRU, null);
    expect(a.estadoTienda).toBe("stock_bajo");
    expect(a.situacion).toBe("reponer_tienda");
    expect(a.accion).toBe("reponer"); // sin otra sede con stock
  });

  it("reponer tienda pide a otra sede lo que falta para volver sobre el umbral de reserva", () => {
    // Almacén 5, umbral 10 → faltan 6; el Taller tiene 9.
    const a = analizarVariante({ ...base, piso: 8, almacen: 5, disponible: 13, ventasVentana: 6, enRed: [taller()] }, TRU, null);
    expect(a.situacion).toBe("reponer_tienda");
    expect(a.accion).toBe("sugerir_traslado");
    expect(a.sugerencia!.cantidad).toBe(6);
  });

  it("reponer tienda con mercadería ya en camino: esperar la recepción, no pedir más", () => {
    const a = analizarVariante({ ...base, piso: 8, almacen: 5, disponible: 13, ventasVentana: 6, ...viene(10, 2), enRed: [taller()] }, TRU, null, AHORA);
    expect(a.situacion).toBe("reponer_tienda");
    expect(a.accion).toBe("esperar_recepcion");
    expect(a.sugerencia).toBeNull();
  });

  it("reponer tienda con en camino insuficiente: sugiere solo el resto", () => {
    // Faltan 6 para pasar el umbral; vienen 2 → pide 4.
    const a = analizarVariante({ ...base, piso: 8, almacen: 5, disponible: 13, ventasVentana: 6, ...viene(2, 2), enRed: [taller()] }, TRU, null, AHORA);
    expect(a.accion).toBe("sugerir_traslado");
    expect(a.sugerencia!.cantidad).toBe(4);
  });

  it("reponer tienda SIN evidencia de venta (historial corto) no sugiere traslado: revisar", () => {
    const a = analizarVariante({ ...base, piso: 2, almacen: 5, disponible: 7, ventasVentana: 0, diasObservables: 3, enRed: [taller()] }, TRU, null);
    expect(a.situacion).toBe("reponer_tienda");
    expect(a.accion).toBe("revisar");
    expect(a.sugerencia).toBeNull();
  });

  it("unidades sin ubicar (reingreso de anulación) no son 'sin stock': revisar, no pedir", () => {
    const a = analizarVariante({ ...base, piso: 0, almacen: 0, sinSububicacion: 3, disponible: 3, ventasVentana: 0, diasObservables: 10, enRed: [taller()] }, TRU, null);
    expect(a.situacion).toBe("reponer_tienda");
    expect(a.accion).toBe("revisar");
    expect(a.motivos.join(" ")).toMatch(/sin ubicar/);
  });

  it("30 días sin vender con reserva baja: sobrestock gana, no se pide traer más", () => {
    const a = analizarVariante({ ...base, piso: 0, almacen: 8, disponible: 8, ventasVentana: 0, diasObservables: 30, enRed: [taller()] }, TRU, null);
    expect(a.estadoTienda).toBe("stock_bajo");
    expect(a.situacion).toBe("posible_sobrestock");
    expect(a.sugerencia).toBeNull();
  });

  it("reponer tienda y reponer piso conviven: el chip es tienda, el detalle recuerda bajar lo que queda", () => {
    const a = analizarVariante({ ...base, piso: 2, almacen: 5, disponible: 7, ventasVentana: 0, diasObservables: 10 }, TRU, null);
    expect(a.situacion).toBe("reponer_tienda");
    expect(a.reponerPiso).toBe(true);
    expect(a.motivos.join(" ")).toMatch(/bajar al piso/);
  });

  it("posible sobrestock por cobertura ≥ 12 semanas", () => {
    const a = analizarVariante({ ...base, piso: 8, almacen: 92, disponible: 100, ventasVentana: 30 }, TRU, null);
    expect(a.situacion).toBe("posible_sobrestock");
    expect(a.accion).toBe("vigilar");
  });

  it("posible sobrestock por 30 días observados sin ninguna venta y stock", () => {
    const a = analizarVariante({ ...base, ventasVentana: 0, diasObservables: 30 }, TRU, null);
    expect(a.situacion).toBe("posible_sobrestock");
  });

  it("sin ventas pero con solo 20 días observados: todavía no se afirma sobrestock", () => {
    const a = analizarVariante({ ...base, ventasVentana: 0, diasObservables: 20 }, TRU, null);
    expect(a.situacion).toBe("normal");
  });

  it("el Taller (sin piso/almacén) nunca recibe estado de tienda ni reponer piso", () => {
    const a = analizarVariante({ ...base, separaPisoAlmacen: false, piso: 0, almacen: 0, sinSububicacion: 15 }, TRU, null);
    expect(a.estadoTienda).toBeNull();
    expect(a.reponerPiso).toBe(false);
  });

  it("una prenda sin historial en la sede se lee como 'sin historial', nunca con un ritmo inventado", () => {
    const a = analizarVariante({ ...base, primerIngreso: null, diasObservables: null, piso: 0, almacen: 0, disponible: 0 }, TRU, null);
    expect(a.velocidad.estado).toBe("sin_historial");
    expect(a.coberturaDias).toBeNull();
  });
});

describe("sugerirTraslado — otra sede ayuda solo si no se crea su propio problema", () => {
  const enRiesgo = { ...base, piso: 1, almacen: 1, disponible: 2, ventasVentana: 30 }; // 1/día, 2 días

  it("el Taller cede todo lo que tiene: no vende a clientas", () => {
    const s = sugerirTraslado({ ...enRiesgo, enRed: [taller({ disponible: 9, almacen: 9 })] }, calcularVelocidad(30, 30, 0), TRU);
    expect(s).toMatchObject({ origenNombre: "Taller", origenTipo: "taller", destinoNombre: "Trujillo" });
    // necesita 14 días × 1/día − 2 en stock = 12; el Taller tiene 9.
    expect(s!.cantidad).toBe(9);
  });

  it("una tienda que vende conserva 7 días de cobertura propia Y su reserva de almacén", () => {
    // Lima: 30 disponibles (20 en almacén), vende 0.2/día → reserva 2 por venta; por
    // almacén se queda con 11 → puede dar 20 − 11 = 9.
    const s = sugerirTraslado({ ...enRiesgo, enRed: [lima({ disponible: 30, almacen: 20, ventasVentana: 6 })] }, calcularVelocidad(30, 30, 0), TRU);
    expect(s!.cantidad).toBe(9);
  });

  it("una tienda con la reserva en el umbral no cede: su propio Resumen la pediría de vuelta", () => {
    expect(capacidadDeOrigen(lima({ disponible: 14, almacen: 10, ventasVentana: 0 })).unidades).toBe(0);
  });

  it("una tienda no cede lo que tiene en el PISO: solo lo que sobra en su almacén", () => {
    const s = sugerirTraslado({ ...enRiesgo, enRed: [lima({ disponible: 40, almacen: 14, ventasVentana: 0 })] }, calcularVelocidad(30, 30, 0), TRU);
    expect(s!.cantidad).toBe(3);
  });

  it("una tienda que vende más rápido que lo que tiene no cede nada", () => {
    // Lima: 5 disponibles, vende 1/día → reserva 7 > 5 → 0.
    expect(capacidadDeOrigen(lima({ disponible: 5, almacen: 5, ventasVentana: 30 })).unidades).toBe(0);
    expect(sugerirTraslado({ ...enRiesgo, enRed: [lima({ disponible: 5, almacen: 5, ventasVentana: 30 })] }, calcularVelocidad(30, 30, 0), TRU)).toBeNull();
  });

  it("una tienda sin historial suficiente no se toca", () => {
    expect(capacidadDeOrigen(lima({ diasObservables: 2 })).unidades).toBe(0);
  });

  it("entre dos orígenes gana el que más puede dar", () => {
    const s = sugerirTraslado(
      { ...enRiesgo, enRed: [taller({ disponible: 2, almacen: 2 }), lima({ disponible: 40, almacen: 30, ventasVentana: 0 })] },
      calcularVelocidad(30, 30, 0),
      TRU,
    );
    expect(s!.origenNombre).toBe("Lima");
  });

  it("sin otras sedes con stock: no hay sugerencia, la acción es reponer", () => {
    const a = analizarVariante(enRiesgo, TRU, null);
    expect(a.sugerencia).toBeNull();
    expect(a.accion).toBe("reponer");
  });
});

describe("curvasPorVariante — la curva esperada son las tallas dadas de alta", () => {
  const camila = (talla: string, disponible: number, color = "BLA"): FilaVarianteResumen => ({
    ...base,
    varianteId: `v-${color}-${talla}`,
    talla,
    colorCodigo: color,
    disponible,
    piso: disponible,
    almacen: 0,
  });

  it("M en cero entre S y L con stock: curva incompleta en la M", () => {
    const curvas = curvasPorVariante([camila("S", 3), camila("M", 0), camila("L", 5)]);
    expect([...curvas.keys()]).toEqual(["v-BLA-M"]);
    expect(curvas.get("v-BLA-M")!.tallasConStock).toEqual(["S", "L"]);
  });

  it("cada color es su propia curva: el negro completo no tapa el hueco del blanco", () => {
    const curvas = curvasPorVariante([camila("S", 3), camila("M", 0), camila("L", 5), camila("S", 1, "NEG"), camila("M", 1, "NEG"), camila("L", 1, "NEG")]);
    expect(curvas.size).toBe(1);
  });

  it("una talla que el producto nunca tuvo no cuenta: solo hay hueco entre variantes reales", () => {
    // Producto con S y L nada más: no existe M, así que no hay hueco posible.
    expect(curvasPorVariante([camila("S", 3), camila("L", 5)]).size).toBe(0);
  });

  it("agotarse en la punta (XL) no es hueco", () => {
    expect(curvasPorVariante([camila("S", 3), camila("M", 2), camila("L", 5), camila("XL", 0)]).size).toBe(0);
  });

  it("la variante del hueco sale como curva incompleta con acción de redistribución si otra sede la tiene", () => {
    const hueco = { ...camila("M", 0), enRed: [taller({ disponible: 4, almacen: 4 })] };
    const curvas = curvasPorVariante([camila("S", 3), hueco, camila("L", 5)]);
    const a = analizarVariante(hueco, TRU, curvas.get(hueco.varianteId) ?? null);
    expect(a.situacion).toBe("curva_incompleta");
    expect(a.accion).toBe("revisar_redistribucion");
    expect(a.sugerencia!.cantidad).toBe(1);
  });

  it("si la talla del hueco ya viene en camino, se espera la recepción en vez de pedir otra", () => {
    const hueco = { ...camila("M", 0), ...viene(5, 2), enRed: [taller({ disponible: 4, almacen: 4 })] };
    const curvas = curvasPorVariante([camila("S", 3), hueco, camila("L", 5)]);
    const a = analizarVariante(hueco, TRU, curvas.get(hueco.varianteId) ?? null, AHORA);
    expect(a.situacion).toBe("curva_incompleta");
    expect(a.accion).toBe("esperar_recepcion");
    expect(a.sugerencia).toBeNull();
  });
});

describe("el Taller como sede seleccionada", () => {
  const TALLER = { id: "u-taller", nombre: "Taller", tipo: "taller" as const };

  it("30 días sin vender NO es sobrestock en el Taller: no vende a clientas", () => {
    const a = analizarVariante({ ...base, separaPisoAlmacen: false, piso: 0, almacen: 0, sinSububicacion: 15, ventasVentana: 0, diasObservables: 30 }, TALLER, null);
    expect(a.situacion).toBe("normal");
    expect(a.motivos.join(" ")).toMatch(/no vende a clientas/);
  });
});

describe("analizarInventario — las tarjetas salen de los mismos análisis", () => {
  it("empresa recién llegada: la RPC no devuelve nada para la sede → salud null y todo en cero", () => {
    const r = analizarInventario([], TRU);
    expect(r.salud).toBeNull();
    expect(r.riesgo).toEqual({ total: 0, criticas: 0 });
    expect(r.traslados.total).toBe(0);
    expect(r.decisiones).toHaveLength(0);
    expect(r.vigilar).toHaveLength(0);
  });

  it("salud = variantes relevantes sin ninguna situación", () => {
    const r = analizarInventario(
      [
        { ...base, varianteId: "ok", ventasVentana: 3 }, // 20 uds, 0.1/día → 200 días ≥ 84 → posible sobrestock, cuenta como alerta
        { ...base, varianteId: "ok2", disponible: 20, piso: 8, almacen: 12, ventasVentana: 12 }, // 0.4/día → 50 días, reserva sana → normal
        { ...base, varianteId: "riesgo", piso: 1, almacen: 1, disponible: 2, ventasVentana: 30, enRed: [taller()] },
      ],
      TRU,
    );
    expect(r.salud).toEqual({ porcentaje: 33, sinAlerta: 1, relevantes: 3 });
    expect(r.riesgo).toEqual({ total: 1, criticas: 1 });
    expect(r.traslados).toEqual({ total: 1, entreTiendas: 0, desdeTaller: 1 });
    expect(r.reposicionAhora).toEqual({ total: 1, sinStock: 0, coberturaCritica: 1 });
    expect(r.sobrestock.total).toBe(1);
    expect(r.decisiones.map((a) => a.situacion)).toEqual(["riesgo_quiebre", "posible_sobrestock"]);
    expect(r.vigilar[0].analisis.fila.varianteId).toBe("riesgo");
  });

  it("importar 12 meses de historia se usa tal cual: la ventana mira lo observado, no la fecha de despliegue", () => {
    // La RPC ya recorta a los últimos 30 días; acá solo importa que 30 días
    // observados con 15 ventas den 0.5/día sin ningún ajuste especial.
    const a = analizarVariante({ ...base, primerIngreso: "2025-09-01T00:00:00Z", diasObservables: 30, ventasVentana: 15 }, TRU, null);
    expect(a.velocidad.unidadesDia).toBeCloseTo(0.5);
    expect(a.coberturaDias).toBe(40);
  });
});

describe("calcularSellThrough — conservación de unidades", () => {
  it("lo que se mandó a otra sede entra al denominador: no es venta ni pérdida", () => {
    const a = analizarVariante({ ...base, disponible: 5, piso: 5, almacen: 0, ventasVentana: 5, trasladosSalidaVentana: 15 }, TRU, null);
    // 5 vendidas / (5 + 5 + 0 + 15) = 20 %
    expect(a.sellThroughPct).toBe(20);
  });
});

describe("textos de la tabla", () => {
  it("cobertura: días cortos con decimal, largos en semanas, proyectada con flecha", () => {
    expect(formatoCobertura(1.5)).toBe("1.5 días");
    expect(formatoCobertura(2)).toBe("2 días");
    expect(formatoCobertura(1)).toBe("1 día");
    expect(formatoCobertura(0.4)).toBe("< 1 día");
    expect(formatoCobertura(98)).toBe("14 sem.");
    const a = analizarVariante({ ...base, piso: 1, almacen: 2, disponible: 3, ventasVentana: 60, ...viene(7, 1) }, TRU, null, AHORA);
    expect(textoCobertura(a)).toBe("1.5 días → 5 días");
  });

  it("cobertura honesta cuando no hay base", () => {
    expect(textoCobertura(analizarVariante({ ...base, diasObservables: 2 }, TRU, null))).toBe("Historial corto");
    expect(textoCobertura(analizarVariante({ ...base, primerIngreso: null, diasObservables: null }, TRU, null))).toBe("Sin historial");
    expect(textoCobertura(analizarVariante({ ...base, ventasVentana: 0 }, TRU, null))).toBe("Sin ventas");
  });

  it("en la red muestra dónde hay cuánto; la cantidad a mandar va en la acción", () => {
    const riesgo = analizarVariante({ ...base, piso: 1, almacen: 1, disponible: 2, ventasVentana: 30, enRed: [taller({ disponible: 9, almacen: 9 })] }, TRU, null);
    expect(textoEnRed(riesgo)).toBe("Taller: 9");
    expect(textoAccion(riesgo)).toBe("Sugerir traslado · 9 uds");
    expect(textoEnRed(analizarVariante({ ...base, piso: 2, almacen: 20, disponible: 22, ventasVentana: 3 }, TRU, null))).toBe("Almacén tienda");
    expect(textoEnRed(analizarVariante({ ...base, ventasVentana: 3, enRed: [lima()] }, TRU, null))).toBe("Lima: 10");
    expect(textoEnRed(analizarVariante({ ...base, ventasVentana: 3, enRed: [lima(), taller()] }, TRU, null))).toBe("Red estable");
  });
});
