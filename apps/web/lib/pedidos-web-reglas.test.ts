import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agruparPorPestana,
  avisosDeLinea,
  cifrasDe,
  datosDelCliente,
  decisionDeFabrica,
  decisionesParaLaBase,
  errorDePedidoWeb,
  estadoDeLinea,
  estadoVisible,
  fechasSugeridas,
  instanteDeLlegada,
  leerDetalle,
  leerTablero,
  mensajeWhatsapp,
  MOTIVOS_ANULAR,
  MOTIVOS_NO_CONFIRMAR,
  plazoCorto,
  rehacerDecisiones,
  sePuedeReservarYa,
  textoCierre,
  textoDisponible,
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
  });

  it("en qué está: a menos de 3 horas de cerrarse solo, en rojo y latiendo; sin pagar, en rojo", () => {
    expect(estadoVisible(pedido({ venceEn: new Date(AHORA + 2 * 3_600_000).toISOString() }), AHORA)).toMatchObject({ tono: "rojo", vivo: true, texto: "Por confirmar · vence en 2 h" });
    expect(estadoVisible(pedido({ venceEn: new Date(AHORA + 20 * 3_600_000).toISOString() }), AHORA)).toMatchObject({ tono: "ambar", vivo: false });
    expect(estadoVisible(pedido({ estado: "confirmado", sinPagar: true, confirmadoEn: new Date(AHORA - 50 * 3_600_000).toISOString() }), AHORA).tono).toBe("rojo");
    expect(estadoVisible(pedido({ estado: "confirmado", falta: 69.9 }), AHORA).texto).toBe("Por cobrar · falta S/ 69.90");
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

  it("avisa la última del lugar elegido y quién más la pidió (quién la separó antes)", () => {
    const l = { ...disponible(1, 3), compiten: [{ codigo: "W-0003", separoAntes: true }] };
    expect(avisosDeLinea(l, { tipo: "reservar", ubicacionId: TRU, lugar: "almacen" }, TRU, "Tienda Trujillo")).toEqual([
      "Es la última en Tienda Trujillo.",
      "También la pidió W-0003 (la separó antes). Tú decides a quién confirmarla.",
    ]);
    expect(avisosDeLinea(l, { tipo: "reservar", ubicacionId: TRU, lugar: "piso" }, TRU, "Tienda Trujillo")).toHaveLength(1);
    expect(avisosDeLinea(l, { tipo: "quitar" }, TRU, "Tienda Trujillo")).toEqual([]);
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
    cliente: { nombre: "Andrea Demo Web", celular: "900000440", documento: "••••4415", miembroDelClub: true },
    tiendaWeb: { nombre: "Trujillo", direccion: "Jr. Pizarro 123", horario: null },
  };

  it("los datos a la vista: DNI a medias, celular y club", () => {
    expect(datosDelCliente(p.cliente)).toBe("DNI ••••4415 · Cel. 900 000 440 · Miembro del club");
  });

  it("los mensajes de la maqueta, con el primer nombre y la dirección de Configuración", () => {
    expect(mensajeWhatsapp(p, "confirmado")).toBe(
      "Hola Andrea, confirmamos tu pedido W-0012 en CAYLA Trujillo (S/ 229.80). ¿Cómo prefieres pagar: Yape, Plin, transferencia o en tienda? Lo recoges en Jr. Pizarro 123.",
    );
    expect(mensajeWhatsapp(p, "cobro")).toMatch(/Falta pagar S\/ 229\.80/);
    expect(mensajeWhatsapp(p, "sinstock")).toMatch(/una prenda ya no está/);
  });
});
