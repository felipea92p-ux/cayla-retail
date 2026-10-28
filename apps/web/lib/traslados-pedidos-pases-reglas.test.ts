import { describe, expect, it } from "vitest";
import type { PedidoEntreSedes } from "./pedidos-entre-sedes-reglas";
import type { ClientePedido } from "./pedidos-con-cliente-reglas";
import type { GrupoParaEnviar } from "./para-enviar-reglas";
import { contarTePiden } from "./pedidos-por-atender-reglas";
import { coincideBusqueda } from "./traslados-reglas";
import {
  botonDelPedido,
  camposDelPedido,
  buscableDelPedido,
  claseDelId,
  idPasePedido,
  idPaseParaEnviar,
  pedidoPorHacer,
  pestanaDelPedido,
  vistaDelPedido,
  vistaParaEnviar,
} from "./traslados-pedidos-pases-reglas";

const AHORA = "2026-10-06T17:00:00.000Z";
const COD = { mio: "TRU", otra: "LIM", miNombre: "Tienda Trujillo" };

const pedido = (p: Partial<PedidoEntreSedes> = {}): PedidoEntreSedes => ({
  grupoId: "g1",
  direccion: "me_piden",
  otraSede: "Tienda Lima",
  otraSedeId: "lim",
  estado: "pedido",
  creadoEn: "2026-10-06T14:00:00.000Z",
  creadoPorNombre: "Sandra",
  nota: null,
  trasladoId: null,
  trasladoNumero: null,
  canceladoMotivo: null,
  lineas: [{ pedidoId: "p1", varianteId: "v1", producto: "Blusa Emma", color: "Negro", talla: "S", sku: "CMS-1", cantidad: 2, estado: "pedido", disponibleEnOrigen: 5 }],
  cliente: null,
  ...p,
});

const cliente = (c: Partial<ClientePedido> = {}): ClientePedido => ({
  nombres: "",
  apellidos: "",
  celular: "",
  estado: "pedido",
  reservaEn: "almacen",
  llegoEn: null,
  guardadaHasta: null,
  avisadoEn: null,
  canceladoDesde: null,
  sigueEnPieEn: null,
  ...c,
});

describe("ids de los pases", () => {
  it("un pedido y un «para enviar» se reconocen por su prefijo; lo demás es una caja", () => {
    expect(claseDelId(idPasePedido("abc"))).toEqual({ clase: "pedido", ref: "abc" });
    expect(claseDelId(idPaseParaEnviar("lim"))).toEqual({ clase: "para-enviar", ref: "lim" });
    expect(claseDelId("2d7fa0ee-0167-479c-9b08-3a4221cb7761").clase).toBe("traslado");
  });
});

describe("en qué pestaña va un pedido", () => {
  it("lo que te piden y no salió va en Envías y es por hacer", () => {
    const p = pedido();
    expect(pestanaDelPedido(p, AHORA)).toBe("envias");
    expect(pedidoPorHacer(p)).toBe(true);
  });
  it("lo que te pidieron y ya salió no se repite (ya es una caja en camino)", () => {
    expect(pestanaDelPedido(pedido({ estado: "en_camino", trasladoId: "t" }), AHORA)).toBeNull();
  });
  it("lo que pediste: abierto en Te llegan; terminado en Terminadas; nunca por hacer", () => {
    expect(pestanaDelPedido(pedido({ direccion: "pedi" }), AHORA)).toBe("llegan");
    expect(pestanaDelPedido(pedido({ direccion: "pedi", estado: "recibido", trasladoId: "t" }), AHORA)).toBe("terminadas");
    expect(pedidoPorHacer(pedido({ direccion: "pedi" }))).toBe(false);
  });
  it("lo que pediste para un cliente y llegó sin avisar sigue en Te llegan: falta avisarle", () => {
    const p = pedido({ direccion: "pedi", estado: "recibido", cliente: cliente({ estado: "llego", nombres: "Ana", apellidos: "Ruiz" }) });
    expect(pestanaDelPedido(p, AHORA)).toBe("llegan");
    // Del lado que pidió se ve el nombre; del lado que envía, nunca (privacidad).
    expect(vistaDelPedido(p, { miUbicacionId: "tru", ahoraIso: AHORA }, COD).campos[1].detalle).toBe("para Ana Ruiz");
    expect(botonDelPedido(p, AHORA, "LIM").texto).toBe("Avisar al cliente");
  });
  it("el número de pases por hacer es el mismo que el del menú (contarTePiden)", () => {
    const ps = [pedido(), pedido({ grupoId: "g2" }), pedido({ grupoId: "g3", direccion: "pedi" }), pedido({ grupoId: "g4", estado: "en_camino" })];
    const filas = ps.filter((p) => p.estado === "pedido").map((p) => ({ id: p.grupoId, direccion: p.direccion, conCliente: false, creadoEn: p.creadoEn, otraSede: "", otraSedeId: "", prendas: 1 }));
    expect(ps.filter(pedidoPorHacer).length).toBe(contarTePiden(filas));
  });
});

describe("el pase de un pedido", () => {
  it("te pide: sale de ti hacia la otra sede, con Enviar como botón", () => {
    const v = vistaDelPedido(pedido(), { miUbicacionId: "tru", ahoraIso: AHORA }, COD);
    expect([v.codigoOrigen, v.codigoDestino, v.soyOrigen]).toEqual(["TRU", "LIM", true]);
    expect(v.nombre).toBe("LIM te pide 2 prendas");
    expect(v.boton).toEqual({ texto: "Enviar a LIM", principal: true });
    expect(v.rotulo).toBe("Pedido");
    expect(v.campos[2].valor).toBe("hace 3 h");
  });
  it("para un cliente colgado en el piso, primero se sube al almacén", () => {
    const p = pedido({ cliente: cliente({ reservaEn: "piso" }) });
    expect(botonDelPedido(p, AHORA, "LIM").texto).toBe("Subir al almacén");
    expect(vistaDelPedido(p, { miUbicacionId: "tru", ahoraIso: AHORA }, COD).nombre).toBe("LIM te pide para un cliente");
  });
  it("pasadas 48 h sin respuesta, el pase se pone en ámbar", () => {
    const v = vistaDelPedido(pedido({ creadoEn: "2026-10-04T10:00:00.000Z" }), { miUbicacionId: "tru", ahoraIso: AHORA }, COD);
    expect(v.tono).toBe("atraso");
    expect(v.tarde).toBe(true);
  });
  it("lo que pediste viene hacia ti; terminado lleva su sello", () => {
    const v = vistaDelPedido(pedido({ direccion: "pedi", estado: "recibido", trasladoId: "t", trasladoNumero: 290 }), { miUbicacionId: "tru", ahoraIso: AHORA }, COD);
    expect([v.codigoOrigen, v.codigoDestino, v.soyDestino]).toEqual(["LIM", "TRU", true]);
    expect(v.sello?.texto).toBe("LLEGÓ");
    expect(v.campos[2].detalle).toBe("Caja Nº 290");
  });
  it("se encuentra buscando la prenda, la sede o la palabra «pedido»", () => {
    const b = buscableDelPedido(pedido(), COD);
    expect(coincideBusqueda(b, "blusa emma")).toBe(true);
    expect(coincideBusqueda(b, "LIM")).toBe(true);
    expect(coincideBusqueda(b, "pedido")).toBe(true);
  });
});

describe("el pase de «Para enviar»", () => {
  const g: GrupoParaEnviar = {
    destinoId: "lim",
    destino: "Tienda Lima",
    total: 3,
    enviables: 2,
    prendas: [
      { id: "a", destinoId: "lim", destino: "Tienda Lima", varianteId: "v1", producto: "Falda", color: null, talla: "M", sku: null, cantidad: 3, falta: 3, enAlmacen: 2, nota: null, creadoEn: "2026-10-01T10:00:00.000Z", creadoPorNombre: null },
    ],
  };
  it("dice cuánto lleva esperando y cuánto cabe hoy; no es un pedido de nadie (no suma)", () => {
    const v = vistaParaEnviar(g, { ahoraIso: AHORA }, COD);
    expect(v.nombre).toBe("Para enviar a LIM");
    expect(v.porHacer).toBe(false);
    expect(v.tarde).toBe(true);
    expect(v.campos[2].valor).toBe("2 prendas");
    expect(v.boton.texto).toBe("Armar el envío a LIM");
  });
  it("sin nada libre hoy, el botón no promete armar el envío", () => {
    expect(vistaParaEnviar({ ...g, enviables: 0 }, { ahoraIso: AHORA }, COD).boton.principal).toBe(false);
  });
});

describe("guía del reverso de un pedido", () => {
  it("solo falta quién lo hace; la llegada viene marcada", () => {
    expect(camposDelPedido(false, null).map((c) => [c.id, c.hecho])).toEqual([["responsable-pedido", false]]);
    expect(camposDelPedido(true, null)[0].hecho).toBe(true);
  });
});
