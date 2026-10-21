import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cuponAMedias,
  agruparPorPestana,
  leerCuponDelPedido,
  textoDelCupon,
  avisosDeLinea,
  cifrasDe,
  cuandoEnLima,
  datosDelCliente,
  decisionDeFabrica,
  conEmpresas,
  decisionesParaLaBase,
  empresaDeLaPrenda,
  errorDeEntrega,
  errorDePedidoWeb,
  estadoDeBoleta,
  estadoDeLinea,
  estacionesDe,
  estadoVisible,
  faltanParaEntregar,
  fechasSugeridas,
  instanteDeLlegada,
  leerDetalle,
  leerTablero,
  limpiarCodigo,
  loQueTeToca,
  MENSAJE_PREDETERMINADO_WEB,
  mensajePredeterminadoDelPedido,
  mensajeWhatsapp,
  MOTIVOS_ANULAR,
  MOTIVOS_NO_CONFIRMAR,
  plazoCorto,
  porQueSeCerraron,
  problemaDelCodigo,
  rehacerDecisiones,
  relojDeFila,
  relojDelPlazo,
  reglasDelCamino,
  sePuedeQuitar,
  sePuedeReservarYa,
  textoCierre,
  textoDisponible,
  todoAlDia,
  tramosDelCamino,
  verboDe,
  type LineaDetalle,
  type PedidoDeLista,
} from "./pedidos-web-reglas";

const TRU = "11111111-1111-4111-8111-111111111111";
const LIM = "22222222-2222-4222-8222-222222222222";
const AHORA = Date.parse("2026-10-14T15:00:00Z");

const disponible = (almacen: number, piso: number, otras: LineaDetalle["disponible"]["otras"] = []): Pick<LineaDetalle, "disponible"> => ({
  disponible: { almacen, piso, sinLugar: 0, otras },
});

function pedido(extra: Partial<PedidoDeLista>): PedidoDeLista {
  return {
    id: "p",
    codigo: "W-0001",
    numero: 1,
    estado: "por_confirmar",
    cliente: "Andrea",
    celular: null,
    total: 100,
    pagado: 0,
    falta: 100,
    prendas: 1,
    porConseguir: 0,
    porTraer: 0,
    creadoEn: "2026-10-14T10:00:00Z",
    venceEn: "2026-10-15T10:00:00Z",
    confirmadoEn: null,
    pagadoEn: null,
    entregadoEn: null,
    cerradoEn: null,
    cierreMotivo: null,
    sinPagar: false,
    listoParaRecoger: false,
    sinRecoger: false,
    prendasVista: [],
    ...extra,
  };
}

describe("Leer lo que manda la base", () => {
  it("el tablero salta la fila rota, trae los plazos de Configuración y, sin ellos, los de fábrica", () => {
    const t = leerTablero({
      plazos: { horas_para_confirmar: 12, horas_aviso_sin_pagar: 0, dias_aviso_sin_recoger: "5" },
      pedidos: [{ pedido_id: "a", codigo: "W-0007", estado: "confirmado", total: "159.9", prendas_vista: [{ referencia: "Casaca", estado: "reservada" }] }, { codigo: "sin id" }, null],
      cobrado_hoy: 40,
      para_enviar: [{ pedido_id: "b", codigo: "W-0008", tienda: "Tienda Trujillo", lineas: [] }, { pedido_id: "c", lineas: [{ linea_id: "l", lugar: "piso" }] }],
    });
    expect(t.plazos).toEqual({ horasParaConfirmar: 12, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 5 });
    expect(t.pedidos.map((p) => p.codigo)).toEqual(["W-0007"]);
    expect(t.pedidos[0]!.total).toBe(159.9);
    expect(t.pedidos[0]!.prendasVista[0]!.estado).toBe("reservada");
    // Un envío sin prendas no se ofrece.
    expect(t.paraEnviar.map((e) => e.pedidoId)).toEqual(["c"]);
    expect(t.paraEnviar[0]!.lineas[0]!.lugar).toBe("piso");
    expect(leerTablero(null)).toEqual({ plazos: { horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7 }, pedidos: [], cobradoHoy: 0, paraEnviar: [] });
  });

  it("el detalle trae los lugares de la tienda, ordena las prendas y no ofrece tiendas sin libres", () => {
    const d = leerDetalle({
      pedido_id: "p",
      codigo: "W-0009",
      estado: "confirmado",
      ubicacion_id: TRU,
      lugares: { almacen_tienda: "s-alm", piso_venta: "s-piso", otro: "x" },
      lineas: [
        { linea_id: "l2", posicion: 2, disponible: { otras_tiendas: [{ ubicacion_id: LIM, tienda: "Tienda Lima", libres: 0 }] } },
        {
          linea_id: "l1",
          posicion: 1,
          estado: "por_conseguir",
          traslado: { transferencia_id: "t", numero: 698, estado: "en_transito", desde: "Tienda Lima", desde_id: LIM, llega_el: "2026-10-15T17:00:00Z" },
          disponible: { almacen: 1, otras_tiendas: [{ ubicacion_id: LIM, tienda: "Tienda Lima", libres: 2 }] },
        },
      ],
    })!;
    expect(d.lugares).toEqual({ almacen: "s-alm", piso: "s-piso" });
    expect(d.lineas.map((l) => l.lineaId)).toEqual(["l1", "l2"]);
    expect(d.lineas[0]!.traslado?.numero).toBe(698);
    expect(d.lineas[0]!.disponible.otras).toHaveLength(1);
    expect(d.lineas[1]!.disponible.otras).toHaveLength(0);
    expect(leerDetalle({ codigo: "W-1" })).toBeNull();
    // Sin la actividad 9 en la base no se sabe de la caja: null, y la hoja no bloquea el efectivo (decide la base).
    expect(d.cajaAbierta).toBeNull();
  });

  it("el detalle trae la caja y cada pago con su origen, quién lo registró y, si se anuló, quién, cuándo y por qué (actividad 9)", () => {
    const d = leerDetalle({
      pedido_id: "p",
      codigo: "W-0010",
      estado: "confirmado",
      caja_abierta: false,
      pagos: [
        { pago_id: "g1", origen: "tienda", medio: "efectivo", monto: "30", estado: "anulado", registrado_en: "2026-10-14T10:00:00Z", registrado_por: "Rosa", en_caja: true, anulado_en: "2026-10-14T11:00:00Z", anulado_por: "Kiara", anulado_motivo: "devuelto_al_cliente" },
        { pago_id: "g2", origen: "pasarela", medio: "tarjeta", monto: 20, estado: "por_revisar", observacion: "La pasarela cobró S/\u00a020.00, pero…" },
        { pago_id: "g3", origen: "raro", medio: "yape", monto: 5, estado: "aprobado", numero_operacion: "04812793" },
      ],
    })!;
    expect(d.cajaAbierta).toBe(false);
    expect(d.pagos[0]).toMatchObject({ id: "g1", origen: "tienda", monto: 30, enCaja: true, anuladoPor: "Kiara", anuladoMotivo: "devuelto_al_cliente" });
    expect(d.pagos[1]).toMatchObject({ origen: "pasarela", estado: "por_revisar", observacion: "La pasarela cobró S/\u00a020.00, pero…", anuladoEn: null });
    // Un origen que no se entiende se lee como de la tienda (lo que la hoja deja anular lo decide la base igual).
    expect(d.pagos[2]).toMatchObject({ origen: "tienda", numeroOperacion: "04812793" });
  });
});

describe("La lista", () => {
  it("cada pedido va a su pestaña; lo que más espera arriba y, en cerrados, lo último arriba", () => {
    const g = agruparPorPestana([
      pedido({ id: "1", numero: 1, creadoEn: "2026-10-14T12:00:00Z" }),
      pedido({ id: "2", numero: 2, creadoEn: "2026-10-14T09:00:00Z" }),
      pedido({ id: "3", estado: "confirmado", confirmadoEn: "2026-10-14T11:00:00Z" }),
      pedido({ id: "4", estado: "pagado", pagadoEn: "2026-10-14T11:00:00Z" }),
      pedido({ id: "5", estado: "anulado", cerradoEn: "2026-10-13T11:00:00Z" }),
      pedido({ id: "6", estado: "vencido", cerradoEn: "2026-10-14T11:00:00Z" }),
    ]);
    expect(g.confirmar.map((p) => p.id)).toEqual(["2", "1"]);
    expect(g.cobrar.map((p) => p.id)).toEqual(["3"]);
    expect(g.entregar.map((p) => p.id)).toEqual(["4"]);
    expect(g.cerrados.map((p) => p.id)).toEqual(["6", "5"]);
  });

  it("las cifras: lo que vence primero, lo que falta cobrar (sin errores de centavos) y los avisos", () => {
    const c = cifrasDe(
      {
        pedidos: [
          pedido({ venceEn: new Date(AHORA + 5 * 3_600_000).toISOString() }),
          pedido({ venceEn: new Date(AHORA + 2 * 3_600_000).toISOString() }),
          pedido({ estado: "confirmado", falta: 0.1, sinPagar: true }),
          pedido({ estado: "confirmado", falta: 0.2 }),
          pedido({ estado: "pagado", sinRecoger: true }),
        ],
        cobradoHoy: 50,
      },
      AHORA,
    );
    expect(c).toMatchObject({ porConfirmar: 2, proximoVenceEnMs: 2 * 3_600_000, porCobrar: 0.3, confirmados: 2, sinPagar: 1, porEntregar: 1, sinRecoger: 1, cobradoHoy: 50 });
    expect(c).toMatchObject({ porDevolver: 0, pedidosPorDevolver: 0 });
  });

  it("lo que hay que devolver: la plata de los pedidos anulados que ya habían pagado (sin errores de centavos)", () => {
    const c = cifrasDe(
      {
        pedidos: [
          pedido({ estado: "anulado", pagado: 0.1 }),
          pedido({ estado: "anulado", pagado: 0.2 }),
          pedido({ estado: "anulado", pagado: 0 }),
          pedido({ estado: "confirmado", pagado: 40, falta: 60 }),
        ],
        cobradoHoy: 0,
      },
      AHORA,
    );
    expect(c).toMatchObject({ porDevolver: 0.3, pedidosPorDevolver: 2 });
    expect(estadoVisible(pedido({ estado: "anulado", pagado: 30 }), AHORA)).toMatchObject({
      texto: "Anulado · por devolver S/\u00a030.00",
      tono: "rojo",
      accion: "Devuélvele lo que pagó",
    });
    expect(estadoVisible(pedido({ estado: "anulado", pagado: 0 }), AHORA)).toMatchObject({ texto: "Anulado", tono: "apagado" });
  });

  it("en qué está: a menos de 3 horas de cerrarse solo, en rojo y latiendo; sin pagar, en rojo", () => {
    expect(estadoVisible(pedido({ venceEn: new Date(AHORA + 2 * 3_600_000).toISOString() }), AHORA)).toMatchObject({ tono: "rojo", vivo: true, texto: "Por confirmar · vence en 2 h" });
    expect(estadoVisible(pedido({ venceEn: new Date(AHORA + 20 * 3_600_000).toISOString() }), AHORA)).toMatchObject({ tono: "ambar", vivo: false });
    expect(estadoVisible(pedido({ estado: "confirmado", sinPagar: true, confirmadoEn: new Date(AHORA - 50 * 3_600_000).toISOString() }), AHORA).tono).toBe("rojo");
    expect(estadoVisible(pedido({ estado: "confirmado", falta: 69.9 }), AHORA).texto).toBe("Por cobrar · falta S/\u00a069.90");
    expect(estadoVisible(pedido({ estado: "pagado", listoParaRecoger: false }), AHORA).texto).toBe("Pagado · espera una prenda");
    expect(plazoCorto(30_000)).toBe("1 min");
  });

  // Los motivos son los mismos que acepta la base (el CHECK de `pedidos_web` y las dos funciones que cierran).
  it("los motivos de cerrar y de anular son exactamente los de la base", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261014235000_pedidos_web_modelo.sql"), "utf8");
    const enLaBase = (antes: string) => {
      const m = sql.match(new RegExp(`${antes} in \\(([^)]*)\\)`));
      return (m?.[1] ?? "").split(",").map((x) => x.trim().replace(/'/g, ""));
    };
    expect(MOTIVOS_NO_CONFIRMAR.map((m) => m.clave)).toEqual(enLaBase("confirmado_en is null and cierre_motivo"));
    expect(MOTIVOS_ANULAR.map((m) => m.clave)).toEqual(enLaBase("confirmado_en is not null and cierre_motivo"));
    expect(textoCierre("sin_confirmar")).toMatch(/se cerró solo/);
    expect(textoCierre("cliente_no_pago")).toBe("El cliente no pagó");
  });
});

describe("Confirmar: la decisión de cada prenda", () => {
  it("de fábrica, el almacén primero; si no hay aquí, sin decidir", () => {
    expect(decisionDeFabrica(disponible(1, 2), TRU)).toEqual({ tipo: "reservar", ubicacionId: TRU, lugar: "almacen" });
    expect(decisionDeFabrica(disponible(0, 2), TRU)).toEqual({ tipo: "reservar", ubicacionId: TRU, lugar: "piso" });
    expect(decisionDeFabrica(disponible(0, 0, [{ ubicacionId: LIM, tienda: "Tienda Lima", libres: 3 }]), TRU)).toBeNull();
  });

  it("a la base: el lugar solo en la tienda del pedido; en otra, la base elige (el almacén primero)", () => {
    const lineas = [{ lineaId: "a" }, { lineaId: "b" }, { lineaId: "c" }, { lineaId: "d" }, { lineaId: "e" }];
    expect(
      decisionesParaLaBase(
        lineas,
        {
          a: { tipo: "reservar", ubicacionId: TRU, lugar: "piso" },
          b: { tipo: "reservar", ubicacionId: LIM, lugar: "piso" },
          c: { tipo: "por_conseguir", fecha: "2026-10-21" },
          d: { tipo: "quitar" },
        },
        { almacen: "s-alm", piso: "s-piso" },
        TRU,
      ),
    ).toEqual([
      { linea_id: "a", decision: "reservar", ubicacion_id: TRU, sububicacion_id: "s-piso" },
      { linea_id: "b", decision: "reservar", ubicacion_id: LIM, sububicacion_id: null },
      { linea_id: "c", decision: "por_conseguir", fecha: "2026-10-21" },
      { linea_id: "d", decision: "quitar" },
      { linea_id: "e", decision: null },
    ]);
  });

  it("lo que hay, en palabras de tienda", () => {
    expect(textoDisponible(disponible(1, 1), "Tienda Trujillo")).toBe("Hay 2 en Tienda Trujillo (1 en almacén, 1 en piso)");
    expect(textoDisponible(disponible(0, 0, [{ ubicacionId: LIM, tienda: "Tienda Lima", libres: 3 }]), "Tienda Trujillo")).toBe("No hay en Tienda Trujillo. Hay 3 en Tienda Lima.");
    expect(textoDisponible(disponible(0, 0), "Tienda Trujillo")).toBe("No hay en ninguna tienda.");
  });

  // Cuenta la tienda entera, no el lugar: con 1 en el almacén y 3 en el piso no es la última (antes lo decía, ADR-0430 corrección c).
  it("avisa la última de la tienda (no del lugar elegido) y quién más la pidió (quién la separó antes)", () => {
    const l = { ...disponible(1, 3), compiten: [{ codigo: "W-0003", separoAntes: true }] };
    expect(avisosDeLinea(l, { tipo: "reservar", ubicacionId: TRU, lugar: "almacen" }, TRU, "Tienda Trujillo")).toEqual([
      "También la pidió W-0003 (la separó antes). Tú decides a quién confirmarla.",
    ]);
    expect(avisosDeLinea({ ...disponible(1, 1), compiten: [] }, { tipo: "reservar", ubicacionId: TRU, lugar: "almacen" }, TRU, "Tienda Trujillo")).toEqual([]);
    expect(avisosDeLinea({ ...disponible(0, 1), compiten: [] }, { tipo: "reservar", ubicacionId: TRU, lugar: "piso" }, TRU, "Tienda Trujillo")).toEqual([
      "Es la última en Tienda Trujillo: al confirmar, ya no se puede vender en la tienda.",
    ]);
    const enLima = { ...disponible(0, 0, [{ ubicacionId: LIM, tienda: "Tienda Lima", libres: 1 }]), compiten: [] };
    expect(avisosDeLinea(enLima, { tipo: "reservar", ubicacionId: LIM, lugar: null }, TRU, "Tienda Trujillo")).toEqual(["Es la última en Tienda Lima."]);
    expect(avisosDeLinea(l, { tipo: "quitar" }, TRU, "Tienda Trujillo")).toEqual([]);
  });

  it("«Quitar del pedido» solo si queda otra prenda sin quitar (quitarlas todas no se puede confirmar)", () => {
    const lineas = [{ lineaId: "a" }, { lineaId: "b" }];
    expect(sePuedeQuitar([{ lineaId: "a" }], { a: null }, "a")).toBe(false);
    expect(sePuedeQuitar(lineas, { a: null, b: null }, "a")).toBe(true);
    expect(sePuedeQuitar(lineas, { a: null, b: { tipo: "quitar" } }, "a")).toBe(false);
    expect(sePuedeQuitar(lineas, { a: { tipo: "quitar" }, b: null }, "b")).toBe(false);
  });

  it("fechas para conseguirla: en 3, 7 y 14 días", () => {
    expect(fechasSugeridas("2026-10-14").map((f) => f.fecha)).toEqual(["2026-10-17", "2026-10-21", "2026-10-28"]);
    expect(fechasSugeridas("2026-10-14")[0]!.etiqueta).toBe("17 oct · en 3 días");
  });
});

describe("Lo que la base rechaza", () => {
  const linea = "33333333-3333-4333-8333-333333333333";

  it("«ya no está libre» trae la prenda a releer; las demás negativas, no", () => {
    expect(errorDePedidoWeb({ hint: "pedido_web_sin_stock", message: "No queda.", details: linea })).toMatchObject({ titulo: "Esa prenda ya no está libre", releer: linea, yaEstaba: false });
    expect(errorDePedidoWeb({ hint: "pedido_web_descontinuada", details: linea })?.releer).toBe(linea);
    expect(errorDePedidoWeb({ hint: "pedido_web_fecha", details: linea })?.releer).toBeNull();
    expect(errorDePedidoWeb({ hint: "pedido_web_sin_stock", details: "no es un id" })?.releer).toBeNull();
    expect(errorDePedidoWeb({ hint: "pedido_web_estado" })?.yaEstaba).toBe(true);
    expect(errorDePedidoWeb({ hint: "otra_cosa" })).toBeNull();
  });

  it("al releer, solo esa prenda se decide de nuevo con lo fresco; lo demás queda como estaba", () => {
    const antes = { a: { tipo: "reservar", ubicacionId: TRU, lugar: "almacen" } as const, b: { tipo: "quitar" } as const };
    const frescas = [
      { lineaId: "a", ...disponible(0, 0) },
      { lineaId: "b", ...disponible(4, 0) },
    ];
    expect(rehacerDecisiones(antes, frescas, ["a"], TRU)).toEqual({ a: null, b: { tipo: "quitar" } });
    // Si volvió a haber (otra caja lo anuló), vuelve a reservarse de aquí.
    expect(rehacerDecisiones(antes, [{ lineaId: "a", ...disponible(0, 1) }], ["a"], TRU).a).toEqual({ tipo: "reservar", ubicacionId: TRU, lugar: "piso" });
  });
});

describe("Después de confirmar: en qué está cada prenda", () => {
  const base = { ubicacionId: TRU, tiendaReserva: "Tienda Trujillo", lugar: "almacen" as const, fechaCompromiso: null, traslado: null };

  it("reservada aquí, por traer de otra tienda, en camino, o el envío que se anuló", () => {
    expect(estadoDeLinea({ ...base, estado: "reservada" }, TRU)).toEqual({ texto: "Reservada", tono: "verde", detalle: "En el almacén" });
    expect(estadoDeLinea({ ...base, estado: "reservada", ubicacionId: LIM, tiendaReserva: "Tienda Lima" }, TRU).texto).toBe("Por traer");
    const traslado = { transferenciaId: "t", numero: 698, estado: "en_transito" as const, desde: "Tienda Lima", desdeId: LIM, llegaEl: "2026-10-15T17:00:00Z" };
    expect(estadoDeLinea({ ...base, estado: "por_conseguir", traslado }, TRU)).toEqual({ texto: "En camino", tono: "pizarra", detalle: "Desde Tienda Lima · traslado N.º 698 · llega el 15 oct" });
    expect(estadoDeLinea({ ...base, estado: "por_conseguir", traslado: { ...traslado, estado: "anulada" } }, TRU).detalle).toMatch(/se anuló/);
    expect(estadoDeLinea({ ...base, estado: "por_conseguir", fechaCompromiso: "2026-10-21" }, TRU).detalle).toBe("Prometida para el 21 oct");
  });

  it("«Reservarla»: una prenda por conseguir que ya está en la tienda y no viene en camino", () => {
    const base = { estado: "por_conseguir" as const, traslado: null, ...disponible(1, 0) };
    expect(sePuedeReservarYa(base)).toBe(true);
    expect(sePuedeReservarYa({ ...base, ...disponible(0, 0) })).toBe(false);
    expect(sePuedeReservarYa({ ...base, estado: "reservada" })).toBe(false);
    const traslado = { transferenciaId: "t", numero: 1, estado: "en_transito" as const, desde: "Tienda Lima", desdeId: LIM, llegaEl: null };
    // Lo que viaja se reserva solo al llegar; un envío que se cerró sin ella deja reservar lo que haya aquí.
    expect(sePuedeReservarYa({ ...base, traslado })).toBe(false);
    expect(sePuedeReservarYa({ ...base, traslado: { ...traslado, estado: "cerrada" } })).toBe(true);
  });

  it("la llegada se manda a mediodía de Lima", () => {
    expect(instanteDeLlegada("2026-10-15")).toBe("2026-10-15T12:00:00-05:00");
  });
});

describe("El cliente y WhatsApp", () => {
  const p = {
    codigo: "W-0012",
    total: 229.8,
    falta: 229.8,
    pagado: 50,
    cliente: { nombre: "Andrea Demo Web", celular: "900000440", documento: "••••4415", miembroDelClub: true },
    tiendaWeb: { nombre: "Trujillo", direccion: "Jr. Pizarro 123", horario: null },
  };

  it("los datos a la vista: DNI a medias, celular y club", () => {
    expect(datosDelCliente(p.cliente)).toBe("DNI ••••4415 · Cel. 900 000 440 · Miembro del club");
  });

  it("los mensajes de la maqueta, con el primer nombre y la dirección de Configuración", () => {
    expect(mensajeWhatsapp(p, "confirmado")).toBe(
      "Hola Andrea, confirmamos tu pedido W-0012 en CAYLA Trujillo (S/\u00a0229.80). ¿Cómo prefieres pagar: Yape, Plin, transferencia o en tienda? Lo recoges en Jr. Pizarro 123.",
    );
    expect(mensajeWhatsapp(p, "cobro")).toMatch(/Falta pagar S\/\u00a0229\.80/);
    expect(mensajeWhatsapp(p, "sinstock")).toMatch(/una prenda ya no está/);
    // Actividad 9: un pedido anulado que ya había pagado.
    expect(mensajeWhatsapp(p, "devolucion")).toBe(
      "Hola Andrea, te escribimos de CAYLA Trujillo por tu pedido W-0012: quedó anulado y te devolvemos S/\u00a050.00. ¿Cómo prefieres recibirlo?",
    );
    // Actividad 10: listo para recoger, y el que no viene. Nunca dicen el código (lo ve el cliente en su pedido).
    expect(mensajeWhatsapp(p, "listo")).toBe(
      "Hola Andrea, tu pedido W-0012 ya está listo para recoger en CAYLA Trujillo (Jr. Pizarro 123). Muestra en caja el código de tu pedido: lo ves en «Mis pedidos».",
    );
    expect(mensajeWhatsapp(p, "norecoge")).toBe("Hola Andrea, tu pedido W-0012 te espera en CAYLA Trujillo. ¿Cuándo pasas a recogerlo? Muestra en caja el código de tu pedido.");
  });

  it("el mensaje de fábrica llena sus marcas con el pedido y coincide con el de antes", () => {
    expect(mensajePredeterminadoDelPedido(p, null)).toBe("Hola Andrea, te escribimos de CAYLA Trujillo por tu pedido W-0012.");
    expect(mensajePredeterminadoDelPedido(p, "   ")).toBe(mensajePredeterminadoDelPedido(p, MENSAJE_PREDETERMINADO_WEB));
  });

  it("el mensaje propio de la persona usa sus marcas y deja intacto lo demás", () => {
    expect(mensajePredeterminadoDelPedido(p, "¡Hola {nombre}! 👋 Tu pedido {codigo} de {tienda} ya casi está.")).toBe(
      "¡Hola Andrea! 👋 Tu pedido W-0012 de CAYLA Trujillo ya casi está.",
    );
  });

  it("con cupón del Club, el mensaje de confirmado dice por qué bajó el total, con el código a medias (Felipe, 2026-10-19)", () => {
    const cupon = { codigo: "CAY-4K7P-9H2M", valor: 10, descuento: 10, estado: "reservado" as const, liberadoMotivo: null };
    const conCupon = { ...p, total: 219.8, cupon };
    expect(mensajeWhatsapp(conCupon, "confirmado")).toBe(
      "Hola Andrea, confirmamos tu pedido W-0012 en CAYLA Trujillo (S/\u00a0219.80, ya con tu cupón CAY-••••-9H2M de − S/\u00a010.00). ¿Cómo prefieres pagar: Yape, Plin, transferencia o en tienda? Lo recoges en Jr. Pizarro 123.",
    );
    // El código entero nunca viaja por WhatsApp.
    expect(mensajeWhatsapp(conCupon, "confirmado")).not.toContain("4K7P");
    // Un cupón que volvió al cliente ya no descuenta: el mensaje no lo nombra.
    expect(mensajeWhatsapp({ ...p, cupon: { ...cupon, estado: "liberado", descuento: 0, liberadoMotivo: "compra_minima" } }, "confirmado")).not.toContain("cupón");
    expect(cuponAMedias("cay-4k7p-9h2m")).toBe("CAY-••••-9H2M");
  });
});

describe("Entregar con el código de 4 cifras (actividad 10)", () => {
  const ENTREGAR = readFileSync(join(__dirname, "../../../supabase/migrations/20261015052000_pedidos_web_entregar.sql"), "utf8");

  it("el código como lo dicta el cliente: solo cifras, hasta 4", () => {
    expect(limpiarCodigo("20 94")).toBe("2094");
    expect(limpiarCodigo("2-0-9-4-5")).toBe("2094");
    expect(limpiarCodigo("ab12")).toBe("12");
    expect(limpiarCodigo("")).toBe("");
  });
  it("a la pantalla le basta la forma (4 cifras), la misma que exige la base; si es EL del pedido lo dice la base", () => {
    expect(problemaDelCodigo("")).toBe("Escribe el código que el cliente ve en su pedido.");
    expect(problemaDelCodigo("209")).toBe("El código tiene 4 cifras.");
    expect(problemaDelCodigo("2094")).toBeNull();
    expect(ENTREGAR).toContain("if v_codigo !~ '^[0-9]{4}$' then");
  });
  it("se entrega solo con todo reservado en la tienda del pedido: lo que falta se nombra", () => {
    const l = (estado: LineaDetalle["estado"], ubicacionId: string | null, referencia = "Blusa Emma", talla: string | null = "M") =>
      ({ estado, ubicacionId, referencia, talla }) as Pick<LineaDetalle, "estado" | "ubicacionId" | "referencia" | "talla">;
    expect(faltanParaEntregar([l("reservada", TRU), l("quitada", null)], TRU)).toEqual([]);
    expect(faltanParaEntregar([l("reservada", TRU), l("por_conseguir", null, "Casaca Luna", "S")], TRU)).toEqual(["Casaca Luna · S"]);
    expect(faltanParaEntregar([l("reservada", LIM, "Palazo", null)], TRU)).toEqual(["Palazo"]);
    expect(faltanParaEntregar([l("entregada", TRU)], TRU)).toEqual([]);
  });
  it("la boleta dice en qué va su envío a SUNAT, para cada estado que admite la base", () => {
    const estados = ["pendiente", "enviado", "aceptado", "rechazado", "anulado", "no_emitido", "pendiente_reintento", "interna"];
    for (const e of estados) expect(estadoDeBoleta(e).texto, e).not.toBe("");
    expect(estadoDeBoleta("pendiente")).toEqual({ texto: "En cola para SUNAT", tono: "pizarra" });
    expect(estadoDeBoleta("pendiente_reintento")).toEqual({ texto: "En cola para SUNAT", tono: "pizarra" });
    expect(estadoDeBoleta("aceptado")).toEqual({ texto: "Aceptada por SUNAT", tono: "verde" });
    expect(estadoDeBoleta("rechazado").tono).toBe("rojo");
  });
  it("un código mal escrito o de otro pedido va bajo el código; lo que todavía no llega, en la hoja", () => {
    expect(errorDeEntrega({ hint: "pedido_web_codigo_incorrecto", message: "Ese código no es el del pedido W-0007." })).toEqual({
      enElCodigo: true,
      titulo: "Revisa el código",
      detalle: "Ese código no es el del pedido W-0007.",
    });
    expect(errorDeEntrega({ hint: "pedido_web_codigo", message: "4 cifras" })?.enElCodigo).toBe(true);
    expect(errorDeEntrega({ hint: "pedido_web_no_listo", message: "falta" })?.enElCodigo).toBe(false);
    expect(errorDeEntrega({ hint: "otra_cosa", message: "x" })).toBeNull();
    expect(errorDePedidoWeb({ hint: "pedido_web_por_entregar", message: "x" })?.titulo).toBe("El pedido todavía no se entrega");
    // «Ya se entregó» (otra caja, un doble clic con otra marca) no es un error de verdad: se refresca.
    expect(errorDePedidoWeb({ hint: "pedido_web_estado", message: "ya se entregó" })?.yaEstaba).toBe(true);
  });
  it("lee la venta, la boleta y quién lo entregó; sin ellas (una base sin la actividad 10), nada", () => {
    const d = leerDetalle({
      pedido_id: "p",
      codigo: "W-0009",
      estado: "entregado",
      venta_id: "v-1",
      entregado_por: "Rosa",
      boleta: { comprobante_id: "c-1", texto: "B002-000004", estado: "pendiente_reintento" },
    });
    expect(d?.ventaId).toBe("v-1");
    expect(d?.entregadoPor).toBe("Rosa");
    expect(d?.boleta).toEqual({ comprobanteId: "c-1", texto: "B002-000004", estado: "pendiente_reintento" });
    const viejo = leerDetalle({ pedido_id: "p", codigo: "W-0009", estado: "pagado" });
    expect([viejo?.ventaId, viejo?.boleta, viejo?.entregadoPor]).toEqual([null, null, null]);
  });
  it("en la lista, lo pagado y listo se entrega con su código", () => {
    expect(estadoVisible(pedido({ estado: "pagado", listoParaRecoger: true, pagadoEn: "2026-10-14T10:00:00Z" }), AHORA).accion).toBe("Entrégalo con su código");
  });
});

describe("el reloj del plazo de cada pedido (Tienda web ▸ Pedidos, ADR-0430)", () => {
  const PLAZOS = { horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7 };
  const hace = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();
  const en = (h: number) => new Date(AHORA + h * 3_600_000).toISOString();
  it("por confirmar: cuánto va de las 24 h, y rojo a menos de 3 h de cerrarse solo", () => {
    expect(relojDelPlazo(pedido({ estado: "por_confirmar", creadoEn: hace(6), venceEn: en(18) }), PLAZOS, AHORA)).toEqual({ pct: 25, tono: "tinta", texto: "Lleva 25 % del plazo para confirmar" });
    expect(relojDelPlazo(pedido({ estado: "por_confirmar", creadoEn: hace(15), venceEn: en(9) }), PLAZOS, AHORA)?.tono).toBe("ambar");
    expect(relojDelPlazo(pedido({ estado: "por_confirmar", creadoEn: hace(22), venceEn: en(2) }), PLAZOS, AHORA)?.tono).toBe("rojo");
  });
  it("confirmado: de las 48 h sin pagar; rojo cuando ya está «sin pagar»", () => {
    expect(relojDelPlazo(pedido({ estado: "confirmado", confirmadoEn: hace(12) }), PLAZOS, AHORA)).toMatchObject({ pct: 25, tono: "tinta" });
    expect(relojDelPlazo(pedido({ estado: "confirmado", confirmadoEn: hace(60), sinPagar: true }), PLAZOS, AHORA)).toMatchObject({ pct: 100, tono: "rojo" });
  });
  it("pagado: de los 7 días para recoger; lo cerrado no tiene reloj", () => {
    expect(relojDelPlazo(pedido({ estado: "pagado", pagadoEn: hace(84) }), PLAZOS, AHORA)).toMatchObject({ pct: 50, tono: "ambar" });
    expect(relojDelPlazo(pedido({ estado: "entregado" }), PLAZOS, AHORA)).toBeNull();
    expect(relojDelPlazo(pedido({ estado: "confirmado", confirmadoEn: null }), PLAZOS, AHORA)).toBeNull();
  });
});

// ADR-0430, actualización 2026-10-17: el camino es el único filtro, la lista abre con «Lo que te toca» y cada fila dice su plazo una vez
// y su verbo. AHORA es el 14 de octubre a las 10:00 de Lima.
describe("el camino y «Lo que te toca» (ADR-0430, act. 2026-10-17)", () => {
  const PLAZOS = { horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7 };
  const hace = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();
  const en = (h: number) => new Date(AHORA + h * 3_600_000).toISOString();

  it("las cuatro estaciones cuentan pedidos; la plata va en el pie y lo cerrado avisa lo que falta devolver", () => {
    const c = cifrasDe(
      {
        pedidos: [
          pedido({ venceEn: en(2) }),
          pedido({ estado: "confirmado", falta: 79, pagado: 80, sinPagar: true, confirmadoEn: hace(60) }),
          pedido({ estado: "confirmado", falta: 100, confirmadoEn: hace(46) }),
          pedido({ estado: "pagado", listoParaRecoger: true }),
          pedido({ estado: "pagado", listoParaRecoger: false }),
          pedido({ estado: "entregado" }),
          pedido({ estado: "anulado", pagado: 30 }),
        ],
        cobradoHoy: 0,
      },
      AHORA,
    );
    const [confirmar, cobrar, entregar, cerrados] = estacionesDe(c, PLAZOS);
    expect(confirmar).toMatchObject({ valor: 1, pie: "El primero se cierra en 2 h", punto: "rojo", vivo: true });
    expect(cobrar).toMatchObject({ valor: 2, pie: "Faltan S/\u00a0179.00 · el primero sin pago se anula en 2 h · 1 sin pagar hace más de 48 h", punto: "rojo", vivo: true });
    expect(entregar).toMatchObject({ valor: 2, pie: "1 listo para recoger · 1 espera una prenda", punto: "verde" });
    expect(cerrados).toMatchObject({ valor: 2, pie: "S/\u00a030.00 por devolver", punto: "rojo" });
    const vacio = estacionesDe(cifrasDe({ pedidos: [], cobradoHoy: 0 }, AHORA), PLAZOS);
    expect(vacio.map((e) => [e.valor, e.pie, e.punto])).toEqual([
      [0, "Nada esperando", "neutro"],
      [0, "Nada por cobrar", "neutro"],
      [0, "Nada por entregar", "neutro"],
      [0, "Últimos 30 días", "neutro"],
    ]);
  });

  // Sin confirmar se cierra solo y sin ningún pago se anula solo (`fn_anular_pedidos_web_sin_pagar`): los dos pierden la venta.
  it("los tramos dicen cuál pierde la venta y cuál solo avisa, con los plazos de Datos y plazos", () => {
    expect(tramosDelCamino({ horasParaConfirmar: 12, horasAvisoSinPagar: 36, diasAvisoSinRecoger: 5 })).toEqual([
      { verbo: "Confirmas", plazo: "se cierra a las 12 h", cierra: true },
      { verbo: "Te paga", plazo: "sin pago, se anula a las 36 h", cierra: true },
      { verbo: "Lo recoge", plazo: "aviso a los 5 días", cierra: false },
    ]);
    expect(reglasDelCamino({ ...PLAZOS, horasParaConfirmar: 12 }).confirmar).toContain("en 12 h, se cierra solo");
    expect(reglasDelCamino({ ...PLAZOS, horasAvisoSinPagar: 36 }).cobrar).toContain("Si no paga nada en 36 h, se anula solo");
  });

  it("«Lo que te toca»: lo que se pierde arriba; lo cerrado sin plata no aparece", () => {
    const lista = loQueTeToca(
      [
        pedido({ id: "espera", estado: "pagado", pagadoEn: hace(3), listoParaRecoger: false }),
        pedido({ id: "listo", estado: "pagado", pagadoEn: hace(24), listoParaRecoger: true }),
        pedido({ id: "confirmado", estado: "confirmado", confirmadoEn: hace(6) }),
        pedido({ id: "confirmar-19h", venceEn: en(19) }),
        pedido({ id: "sin-pagar", estado: "confirmado", confirmadoEn: hace(50), sinPagar: true, pagado: 30 }),
        pedido({ id: "sin-pago-1h", estado: "confirmado", confirmadoEn: hace(47) }),
        pedido({ id: "devolver", estado: "anulado", pagado: 30, cerradoEn: hace(1) }),
        pedido({ id: "confirmar-2h", venceEn: en(2) }),
        pedido({ id: "entregado", estado: "entregado" }),
        pedido({ id: "anulado", estado: "anulado", pagado: 0 }),
      ],
      PLAZOS,
      AHORA,
    );
    // El confirmado sin ningún pago a 1 h de anularse va con lo que se cierra pronto; el que pagó una parte solo avisa.
    expect(lista.map((p) => p.id)).toEqual(["sin-pago-1h", "confirmar-2h", "sin-pagar", "devolver", "confirmar-19h", "confirmado", "listo", "espera"]);
  });

  it("el reloj de cada fila: qué pasa y cuándo, una sola vez", () => {
    expect(relojDeFila(pedido({ creadoEn: hace(22), venceEn: en(2) }), PLAZOS, AHORA)).toMatchObject({
      texto: "Se cierra solo en 2 h",
      detalle: "Si nadie lo confirma, se pierde",
      tono: "rojo",
    });
    expect(relojDeFila(pedido({ creadoEn: hace(6), venceEn: en(18) }), PLAZOS, AHORA)).toMatchObject({
      texto: "Se cierra solo en 18 h",
      detalle: "Hasta mañana a las 04:00",
      tono: "tinta",
      barra: { pct: 25, tono: "tinta" },
    });
    // Sin ningún pago: se anula solo a las 48 h (pierde la venta). Con un pago parcial: solo avisa.
    expect(relojDeFila(pedido({ estado: "confirmado", confirmadoEn: hace(6) }), PLAZOS, AHORA)).toMatchObject({
      texto: "Sin pago, se anula en 42 h",
      detalle: "Si no paga nada hasta el 16 oct a las 04:00",
      tono: "tinta",
    });
    expect(relojDeFila(pedido({ estado: "confirmado", confirmadoEn: hace(46) }), PLAZOS, AHORA)).toMatchObject({
      texto: "Sin pago, se anula en 2 h",
      detalle: "Si no paga nada, se pierde",
      tono: "rojo",
    });
    expect(relojDeFila(pedido({ estado: "confirmado", confirmadoEn: hace(49), sinPagar: true }), PLAZOS, AHORA)).toMatchObject({
      texto: "Se anula en minutos",
      tono: "rojo",
    });
    expect(relojDeFila(pedido({ estado: "confirmado", confirmadoEn: hace(6), total: 159, pagado: 80 }), PLAZOS, AHORA)).toMatchObject({
      texto: "Pagó S/\u00a080.00 de S/\u00a0159.00",
      detalle: "Pagó una parte: no se anula solo",
      barra: null,
    });
    expect(relojDeFila(pedido({ estado: "confirmado", confirmadoEn: hace(50), sinPagar: true, total: 159, pagado: 80 }), PLAZOS, AHORA)).toMatchObject({
      texto: "Falta S/\u00a079.00 · confirmado hace 2 días",
      tono: "rojo",
    });
    expect(relojDeFila(pedido({ estado: "pagado", pagadoEn: hace(24), listoParaRecoger: true }), PLAZOS, AHORA)).toMatchObject({ texto: "Listo para recoger", tono: "verde" });
    expect(relojDeFila(pedido({ estado: "pagado", pagadoEn: hace(3), porTraer: 1, porConseguir: 1 }), PLAZOS, AHORA)).toMatchObject({ texto: "Espera 2 prendas", barra: null });
    expect(relojDeFila(pedido({ estado: "anulado", pagado: 30, cierreMotivo: "cliente_desistio" }), PLAZOS, AHORA)).toMatchObject({
      texto: "Por devolver S/\u00a030.00",
      detalle: "Anulado: el cliente desistió",
      tono: "rojo",
    });
  });

  it("el verbo de la fila: lo que toca ahora; lo cerrado no tiene", () => {
    expect(verboDe(pedido({}))).toBe("Confirmar");
    expect(verboDe(pedido({ estado: "confirmado" }))).toBe("Registrar pago");
    expect(verboDe(pedido({ estado: "confirmado", sinPagar: true, pagado: 30 }))).toBe("Escribirle");
    expect(verboDe(pedido({ estado: "confirmado", sinPagar: true, pagado: 0 }))).toBe("Registrar pago");
    expect(verboDe(pedido({ estado: "pagado", listoParaRecoger: true }))).toBe("Entregar");
    expect(verboDe(pedido({ estado: "pagado", listoParaRecoger: false }))).toBe("Ver pedido");
    expect(verboDe(pedido({ estado: "pagado", listoParaRecoger: true, sinRecoger: true }))).toBe("Escribirle");
    expect(verboDe(pedido({ estado: "anulado", pagado: 30 }))).toBe("Devolver");
    expect(verboDe(pedido({ estado: "anulado", pagado: 0 }))).toBeNull();
    expect(verboDe(pedido({ estado: "entregado" }))).toBeNull();
  });

  it("por qué se cerraron: lo entregado primero, después lo que perdió la tienda y después lo del cliente", () => {
    const motivos = porQueSeCerraron([
      pedido({ estado: "anulado", cierreMotivo: "cliente_desistio" }),
      pedido({ estado: "anulado", cierreMotivo: "sin_stock" }),
      pedido({ estado: "anulado", cierreMotivo: "cliente_desistio" }),
      pedido({ estado: "vencido", cierreMotivo: "sin_confirmar" }),
      pedido({ estado: "entregado" }),
      pedido({ estado: "por_confirmar" }),
    ]);
    expect(motivos.map((m) => [m.clave, m.cuantos])).toEqual([
      ["entregado", 1],
      ["sin_confirmar", 1],
      ["sin_stock", 1],
      ["cliente_desistio", 2],
    ]);
    expect(motivos[1]!.texto).toBe("Nadie lo confirmó a tiempo");
  });

  it("todo al día: en una línea, con lo último que pasó", () => {
    expect(todoAlDia([], "Tienda TRU", AHORA)).toBe("No hay pedidos web esperando en Tienda TRU. Todavía no llegó ninguno.");
    expect(
      todoAlDia(
        [
          pedido({ codigo: "W-0008", estado: "entregado", creadoEn: hace(30) }),
          pedido({ codigo: "W-0009", estado: "anulado", cierreMotivo: "cliente_desistio", creadoEn: hace(1) }),
        ],
        "Tienda TRU",
        AHORA,
      ),
    ).toBe("No hay pedidos web esperando en Tienda TRU. El último (W-0009) llegó hoy a las 09:00 y se cerró: el cliente desistió.");
  });

  it("los instantes, como se dicen en la tienda (en hora de Lima, también de noche)", () => {
    expect(cuandoEnLima(en(13), AHORA)).toBe("hoy a las 23:00");
    expect(cuandoEnLima(en(15), AHORA)).toBe("mañana a las 01:00");
    expect(cuandoEnLima(hace(20), AHORA)).toBe("ayer a las 14:00");
    expect(cuandoEnLima(en(72), AHORA)).toBe("el 17 oct a las 10:00");
  });
});

describe("El cupón del Club del pedido (20261019224000)", () => {
  const NBSP = String.fromCharCode(0xa0);
  it("lee el cupón del detalle; sin código, no hay cupón", () => {
    expect(leerCuponDelPedido({ codigo: "CAY-4K7P-9H2M", valor: 5, descuento: 5, estado: "reservado", liberado_motivo: null })).toEqual({
      codigo: "CAY-4K7P-9H2M",
      valor: 5,
      descuento: 5,
      estado: "reservado",
      liberadoMotivo: null,
    });
    expect(leerCuponDelPedido(null)).toBeNull();
    expect(leerCuponDelPedido({ valor: 5 })).toBeNull();
    // Un estado que la web no conoce se lee reservado; un motivo raro, sin motivo.
    expect(leerCuponDelPedido({ codigo: "CAY-4K7P-9H2M", estado: "otro" })?.estado).toBe("reservado");
    expect(leerCuponDelPedido({ codigo: "CAY-4K7P-9H2M", estado: "liberado", liberado_motivo: "raro" })?.liberadoMotivo).toBeNull();
  });
  it("«Cupón CAY-… · − S/ 5.00» y en qué quedó, en palabras de tienda", () => {
    const reservado = textoDelCupon({ codigo: "CAY-4K7P-9H2M", valor: 5, descuento: 5, estado: "reservado", liberadoMotivo: null });
    expect(reservado.titulo).toBe(`Cupón CAY-4K7P-9H2M · − S/${NBSP}5.00`);
    expect(reservado.chip).toBe("Reservado");
    expect(textoDelCupon({ codigo: "CAY-4K7P-9H2M", valor: 5, descuento: 5, estado: "usado", liberadoMotivo: null }).detalle).toMatch(/boleta/);
    const liberado = textoDelCupon({ codigo: "CAY-4K7P-9H2M", valor: 5, descuento: 0, estado: "liberado", liberadoMotivo: "compra_minima" });
    expect(liberado.titulo).toBe("Cupón CAY-4K7P-9H2M");
    expect(liberado.detalle).toMatch(/compra mínima/);
    expect(textoDelCupon({ codigo: "CAY-4K7P-9H2M", valor: 5, descuento: 5, estado: "liberado", liberadoMotivo: "pedido_anulado" }).detalle).toMatch(/se cerró/);
  });
});

describe("la empresa de cada prenda en el detalle (ADR-0463)", () => {
  const detalle = () =>
    leerDetalle({
      pedido_id: "p",
      codigo: "W-1",
      estado: "por_confirmar",
      lineas: [
        { linea_id: "a", referencia: "Casaca", producto_id: "p1" },
        { linea_id: "b", referencia: "Blusa", producto_id: "p2" },
        { linea_id: "c", referencia: "Pantalón", producto_id: "p3" },
        { linea_id: "d", referencia: "Sin producto" },
      ],
    })!;
  const empresas = [
    { id: "e1", clave: "cayla", nombre: "CAYLA" },
    { id: "e2", clave: "claure", nombre: "CLAURE" },
  ];

  it("sin empresas leídas, ninguna prenda trae empresa", () => {
    expect(detalle().lineas.map((l) => l.empresa)).toEqual([null, null, null, null]);
  });

  it("le pone a cada prenda la empresa de su producto, y no inventa una cuando no la conoce", () => {
    const d = conEmpresas(detalle(), empresas, new Map([["p1", "e2"], ["p2", "e1"], ["p3", "e9"]]));
    expect(d.lineas.map((l) => [l.empresa, l.empresaClave])).toEqual([["CLAURE", "claure"], ["CAYLA", "cayla"], [null, null], [null, null]]);
  });

  it("solo la dice donde conviven dos empresas (Lima): en las demás sedes no se nombra", () => {
    const claure = { empresa: "CLAURE", empresaClave: "claure" };
    expect(empresaDeLaPrenda(claure, true)).toEqual({ texto: "CLAURE", tono: "pizarra" });
    expect(empresaDeLaPrenda(claure, false)).toBeNull();
  });

  it("CAYLA va en neutro, y una prenda sin empresa no inventa una", () => {
    expect(empresaDeLaPrenda({ empresa: "CAYLA", empresaClave: "cayla" }, true)).toEqual({ texto: "CAYLA", tono: "neutro" });
    expect(empresaDeLaPrenda({ empresa: null, empresaClave: null }, true)).toBeNull();
  });
});
