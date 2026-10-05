import { describe, expect, it } from "vitest";
import {
  accionesDe,
  avisoAlCliente,
  avisoParaLaVentana,
  candidatosParaPedir,
  envioConCliente,
  textoSubirAlAlmacen,
  celularValido,
  estadoVisibleConCliente,
  faltaParaPedir,
  huellaDelPedido,
  juntarPedidos,
  mensajeLlegoTuPrenda,
  mensajeNoLlegoTuPrenda,
  nombreCliente,
  partirNombre,
  pedidoConClienteDeFila,
  porAvisarAlCliente,
  resumenParaElInicio,
  textoSugerenciaPedir,
  type ClientePedido,
} from "./pedidos-con-cliente-reglas";
import type { PedidoEntreSedes } from "./pedidos-entre-sedes-reglas";

const fila = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  direccion: "me_piden",
  otra_sede: "Tienda Trujillo",
  otra_sede_id: "tru",
  variante_id: "v1",
  producto: "Blusa Carlita",
  color: "Blanco",
  talla: "M",
  sku: "BLU-CAR-BLA-M",
  cantidad: 1,
  cliente_nombres: "Ana",
  cliente_apellidos: "Lozano",
  cliente_celular: "987111222",
  nota: null,
  estado: "pedido",
  created_at: "2026-10-05T10:00:00Z",
  creado_por_nombre: "Micaela Ríos",
  llego_en: null,
  guardada_hasta: null,
  avisado_en: null,
  reserva_en: "almacen",
  traslado_id: null,
  traslado_numero: null,
  cancelado_motivo: null,
  cancelado_desde: null,
  ...extra,
});
const cliente = (extra: Partial<ClientePedido> = {}): ClientePedido => ({
  nombres: "Ana",
  apellidos: "Lozano",
  celular: "987111222",
  estado: "pedido",
  reservaEn: "almacen",
  llegoEn: null,
  guardadaHasta: null,
  avisadoEn: null,
  canceladoDesde: null,
  ...extra,
});

describe("pedidoConClienteDeFila — entra a la misma lista que la reposición", () => {
  it("un pedido es una prenda, con su cliente y dónde está apartada", () => {
    const p = pedidoConClienteDeFila(fila());
    expect(p.grupoId).toBe("p1");
    expect(p.direccion).toBe("me_piden");
    expect(p.estado).toBe("pedido");
    expect(p.lineas).toHaveLength(1);
    expect(p.lineas[0]).toMatchObject({ pedidoId: "p1", producto: "Blusa Carlita", color: "Blanco", talla: "M", cantidad: 1 });
    expect(p.cliente).toMatchObject({ nombres: "Ana", apellidos: "Lozano", celular: "987111222", estado: "pedido", reservaEn: "almacen" });
  });
  it("«llegó» y «apartado con adelanto» se leen «recibido» en la tarjeta, pero el cliente conserva su estado", () => {
    expect(pedidoConClienteDeFila(fila({ estado: "llego" })).estado).toBe("recibido");
    expect(pedidoConClienteDeFila(fila({ estado: "apartado" })).cliente?.estado).toBe("apartado");
  });
  it("una reserva o un estado desconocidos no inventan nada", () => {
    expect(pedidoConClienteDeFila(fila({ reserva_en: "rara" })).cliente?.reservaEn).toBeNull();
    expect(pedidoConClienteDeFila(fila({ estado: "rara" })).cliente?.estado).toBe("pedido");
  });
  it("la prenda apartada nunca dice «te queda menos de lo pedido»", () => {
    expect(pedidoConClienteDeFila(fila()).lineas[0].disponibleEnOrigen).toBe(1);
  });
  it("nombre del cliente", () => {
    expect(nombreCliente({ nombres: "Ana", apellidos: "Lozano Vera" })).toBe("Ana Lozano Vera");
  });
});

describe("accionesDe — qué botón ve cada lado", () => {
  const p = (cli: ClientePedido | null, extra: Partial<PedidoEntreSedes> = {}) => ({ estado: "pedido" as const, direccion: "me_piden" as const, trasladoId: null, cliente: cli, ...extra });
  it("sin cliente, los botones de siempre (reposición)", () => {
    expect(accionesDe(p(null))).toEqual({ enviar: true, noLaTengo: true, yaNoLaNecesito: false, verTraslado: false, subirAlAlmacen: false, avisar: false });
  });
  it("me piden, apartada en el almacén: Enviar y No la tengo", () => {
    expect(accionesDe(p(cliente()))).toMatchObject({ enviar: true, noLaTengo: true, subirAlAlmacen: false });
  });
  it("me piden, apartada COLGADA: primero subir (Felipe: dos pasos), Enviar no", () => {
    expect(accionesDe(p(cliente({ reservaEn: "piso" })))).toMatchObject({ enviar: false, subirAlAlmacen: true, noLaTengo: true });
  });
  it("sin reserva (la liberaron allá): Enviar y también Subir al almacén (no se sabe si quedó colgada)", () => {
    expect(accionesDe(p(cliente({ reservaEn: "sin_reserva" })))).toMatchObject({ enviar: true, subirAlAlmacen: true });
  });
  it("una sede sin piso ni almacén: Enviar", () => {
    expect(accionesDe(p(cliente({ reservaEn: "sin_lugar" })))).toMatchObject({ enviar: true, subirAlAlmacen: false });
  });
  it("lo que pedí y espera no ofrece enviar ni subir desde aquí", () => {
    expect(accionesDe(p(cliente({ reservaEn: "piso" }), { direccion: "pedi" }))).toMatchObject({ enviar: false, subirAlAlmacen: false });
  });
  it("pedí y llegó: avisar al cliente (aunque ya se haya avisado: se puede repetir)", () => {
    const llego = cliente({ estado: "llego" });
    expect(accionesDe(p(llego, { estado: "recibido", direccion: "pedi" })).avisar).toBe(true);
    expect(accionesDe(p({ ...llego, avisadoEn: "2026-10-05T12:00:00Z" }, { estado: "recibido", direccion: "pedi" })).avisar).toBe(true);
  });
  it("me piden y ya llegó allá: nada que hacer aquí", () => {
    expect(accionesDe(p(cliente({ estado: "llego" }), { estado: "recibido" }))).toMatchObject({ enviar: false, subirAlAlmacen: false, avisar: false, noLaTengo: false });
  });
});

describe("envioConCliente — una sola regla para Traslados y Apartados", () => {
  it("colgada: solo subir; sin reserva: los dos; almacén, sin lugar o sin dato: enviar", () => {
    expect(envioConCliente("piso")).toEqual({ enviar: false, subirAlAlmacen: true });
    expect(envioConCliente("sin_reserva")).toEqual({ enviar: true, subirAlAlmacen: true });
    expect(envioConCliente("almacen")).toEqual({ enviar: true, subirAlAlmacen: false });
    expect(envioConCliente("sin_lugar")).toEqual({ enviar: true, subirAlAlmacen: false });
    expect(envioConCliente(null)).toEqual({ enviar: true, subirAlAlmacen: false });
  });
  it("la ventana «Subir al almacén» dice lo que pasa en cada caso, con la sede que espera", () => {
    expect(textoSubirAlAlmacen("piso", "Tienda Lima")).toMatch(/^Está colgada en el piso.*Tienda Lima\.$/);
    expect(textoSubirAlAlmacen("sin_reserva", "Tienda Lima")).toMatch(/^Ya no está apartada.*no se mueve nada.*Tienda Lima\.$/);
  });
});

describe("estadoVisibleConCliente", () => {
  const de = (c: ClientePedido, direccion: "pedi" | "me_piden" = "me_piden") => estadoVisibleConCliente({ direccion, otraSede: "Tienda Lima", cliente: c });
  it("del lado que envía dice dónde está la prenda", () => {
    expect(de(cliente())).toEqual({ texto: "Por enviar · apartada", tono: "ambar" });
    expect(de(cliente({ reservaEn: "piso" }))).toEqual({ texto: "Colgada: súbela al almacén", tono: "ambar" });
    expect(de(cliente({ reservaEn: "sin_reserva" })).texto).toBe("Por enviar · ya no está apartada");
  });
  it("del lado que pidió dice que allá ya la apartaron", () => {
    expect(de(cliente(), "pedi").texto).toBe("Apartada en Tienda Lima");
    expect(de(cliente({ reservaEn: "sin_reserva" }), "pedi").texto).toBe("Esperando a Tienda Lima · sin apartar");
  });
  it("al llegar, pide avisar hasta que alguien avisa", () => {
    expect(de(cliente({ estado: "llego" }), "pedi")).toEqual({ texto: "Llegó · avísale al cliente", tono: "ambar" });
    expect(de(cliente({ estado: "llego", avisadoEn: "x" }), "pedi")).toEqual({ texto: "Llegó · cliente avisado", tono: "verde" });
    expect(de(cliente({ estado: "llego" })).texto).toBe("Llegó a Tienda Lima");
  });
  it("los demás estados", () => {
    expect(de(cliente({ estado: "en_camino" })).tono).toBe("pizarra");
    expect(de(cliente({ estado: "apartado" })).texto).toBe("Apartado con adelanto");
    expect(de(cliente({ estado: "cancelado" })).tono).toBe("apagado");
  });
});

describe("porAvisarAlCliente — la franja de Vender", () => {
  it("solo lo que pedí, llegó y nadie avisó; el que llegó primero arriba", () => {
    const lista = [
      pedidoConClienteDeFila(fila({ id: "a", direccion: "pedi", estado: "llego", llego_en: "2026-10-05T14:00:00Z" })),
      pedidoConClienteDeFila(fila({ id: "b", direccion: "pedi", estado: "llego", llego_en: "2026-10-05T09:00:00Z" })),
      pedidoConClienteDeFila(fila({ id: "c", direccion: "pedi", estado: "llego", llego_en: "2026-10-05T08:00:00Z", avisado_en: "2026-10-05T08:30:00Z" })),
      pedidoConClienteDeFila(fila({ id: "d", direccion: "me_piden", estado: "llego", llego_en: "2026-10-05T08:00:00Z" })),
      pedidoConClienteDeFila(fila({ id: "e", direccion: "pedi", estado: "en_camino" })),
    ];
    expect(porAvisarAlCliente(lista).map((p) => p.grupoId)).toEqual(["b", "a"]);
  });
});

describe("no llegó (decisión del 2026-10-04) — la tienda que pidió le avisa al cliente", () => {
  const pedi = (extra: Record<string, unknown>) => pedidoConClienteDeFila(fila({ direccion: "pedi", ...extra }));
  it("lee de qué lado se cerró; un valor desconocido no inventa nada", () => {
    expect(pedi({ estado: "cancelado", cancelado_desde: "envia" }).cliente?.canceladoDesde).toBe("envia");
    expect(pedi({ estado: "cancelado", cancelado_desde: "raro" }).cliente?.canceladoDesde).toBeNull();
  });
  it("qué se le avisa: llegó, no llegó (la otra sede o el envío), o nada si lo canceló la tienda que pidió", () => {
    expect(avisoAlCliente(pedi({ estado: "llego" }))).toBe("llego");
    expect(avisoAlCliente(pedi({ estado: "cancelado", cancelado_desde: "envia" }))).toBe("no_llego");
    expect(avisoAlCliente(pedi({ estado: "cancelado", cancelado_desde: "traslado" }))).toBe("no_llego");
    expect(avisoAlCliente(pedi({ estado: "cancelado", cancelado_desde: "pidio" }))).toBeNull();
    expect(avisoAlCliente(pedi({ estado: "cancelado", cancelado_desde: null }))).toBeNull();
    expect(avisoAlCliente(pedi({ estado: "pedido" }))).toBeNull();
  });
  it("la sede que tenía la prenda no le avisa a nadie: no conoce al cliente", () => {
    expect(avisoAlCliente(pedidoConClienteDeFila(fila({ estado: "cancelado", cancelado_desde: "envia" })))).toBeNull();
    expect(avisoAlCliente(pedidoConClienteDeFila(fila({ estado: "llego" })))).toBeNull();
  });
  it("Traslados ofrece «Avisar» también cuando no llegó", () => {
    expect(accionesDe(pedi({ estado: "cancelado", cancelado_desde: "envia" })).avisar).toBe(true);
    expect(accionesDe(pedi({ estado: "cancelado", cancelado_desde: "pidio" })).avisar).toBe(false);
  });
  it("el chip: «No llegó · avísale al cliente» hasta que alguien avisa; lo cancelado aquí es solo «Cancelado»", () => {
    const de = (c: ClientePedido, direccion: "pedi" | "me_piden" = "pedi") => estadoVisibleConCliente({ direccion, otraSede: "Tienda Lima", cliente: c });
    expect(de(cliente({ estado: "cancelado", canceladoDesde: "envia" }))).toEqual({ texto: "No llegó · avísale al cliente", tono: "ambar" });
    expect(de(cliente({ estado: "cancelado", canceladoDesde: "traslado", avisadoEn: "x" }))).toEqual({ texto: "No llegó · cliente avisado", tono: "apagado" });
    expect(de(cliente({ estado: "cancelado", canceladoDesde: "pidio" }))).toEqual({ texto: "Cancelado", tono: "apagado" });
    expect(de(cliente({ estado: "cancelado", canceladoDesde: "envia" }), "me_piden")).toEqual({ texto: "Cancelado", tono: "apagado" });
  });
  it("la franja: primero lo que no llegó, después lo que llegó; nada de lo ya avisado ni de lo cancelado aquí", () => {
    const lista = [
      pedi({ id: "llego", estado: "llego", llego_en: "2026-10-05T09:00:00Z" }),
      pedi({ id: "no-envia", estado: "cancelado", cancelado_desde: "envia", created_at: "2026-10-04T10:00:00Z" }),
      pedi({ id: "no-traslado", estado: "cancelado", cancelado_desde: "traslado", created_at: "2026-10-02T10:00:00Z" }),
      pedi({ id: "no-avisado", estado: "cancelado", cancelado_desde: "envia", avisado_en: "2026-10-05T10:00:00Z" }),
      pedi({ id: "aqui", estado: "cancelado", cancelado_desde: "pidio" }),
    ];
    const por = porAvisarAlCliente(lista);
    expect(por.map((p) => `${p.grupoId}:${p.aviso}`)).toEqual(["no-traslado:no_llego", "no-envia:no_llego", "llego:llego"]);
    expect(resumenParaElInicio(lista)).toEqual({ llegaron: 1, noLlegaron: 2, primero: "Ana Lozano" });
    expect(resumenParaElInicio([])).toEqual({ llegaron: 0, noLlegaron: 0, primero: null });
  });
  it("el WhatsApp de «no llegó»: dice lo que pasó, sin culpar a la otra tienda, y ofrece ayuda", () => {
    expect(mensajeNoLlegoTuPrenda({ nombres: "Ana María", producto: "Blusa Carlita", color: "Blanco", talla: "M", sede: "Tienda Trujillo" })).toBe(
      "Hola Ana, te escribimos de CAYLA Trujillo: lo sentimos, tu Blusa Carlita (Blanco, M) no va a poder llegar. Si quieres, te ayudamos a encontrar otra opción en tienda.",
    );
    expect(mensajeNoLlegoTuPrenda({ nombres: "", producto: "Correa", color: null, talla: null, sede: "Tienda Lima" })).not.toMatch(/Lima.*Lima|\(\)/);
  });
  it("la ventana cambia título, bajada y mensaje según cómo terminó", () => {
    const p = pedi({ estado: "cancelado", cancelado_desde: "envia" });
    const no = avisoParaLaVentana("no_llego", { ...p, cliente: p.cliente! }, "Tienda Trujillo");
    expect(no).toMatchObject({ titulo: "Avisar a Ana Lozano", subtitulo: "Su prenda no va a llegar" });
    expect(no.mensaje).toMatch(/no va a poder llegar/);
    const si = avisoParaLaVentana("llego", { ...p, cliente: p.cliente! }, "Tienda Trujillo");
    expect(si.subtitulo).toBe("Llegó su prenda y está guardada");
    expect(si.mensaje).toMatch(/ya llegó tu Blusa Carlita/);
  });
});

describe("mensajeLlegoTuPrenda", () => {
  it("con el nombre, la prenda, la sede corta y hasta cuándo se guarda", () => {
    expect(mensajeLlegoTuPrenda({ nombres: "Ana María", producto: "Blusa Carlita", color: "Blanco", talla: "M", sede: "Tienda Trujillo", guardadaHasta: "2026-10-09" })).toBe(
      "Hola Ana, te escribimos de CAYLA Trujillo: ya llegó tu Blusa Carlita (Blanco, M). Te la guardamos hasta el viernes, 9 de octubre. ¡Te esperamos!",
    );
  });
  it("sin color, talla ni plazo, no deja huecos", () => {
    expect(mensajeLlegoTuPrenda({ nombres: "", producto: "Correa", color: null, talla: null, sede: "Tienda Lima", guardadaHasta: null })).toBe(
      "Hola, te escribimos de CAYLA Lima: ya llegó tu Correa. ¡Te esperamos!",
    );
  });
});

describe("candidatosParaPedir — lo que Vender ofrece pedir", () => {
  const TIENDAS = [
    { id: "aqp", nombre: "Tienda Arequipa" },
    { id: "lim", nombre: "Tienda Lima" },
  ];
  it("solo las tallas que aquí no se venden (agotada o de otro cliente) y que otra TIENDA tiene", () => {
    const c = candidatosParaPedir(
      [
        { varianteId: "s", talla: "S", motivo: "agotada", stockOtrasSedes: [{ sede: "Arequipa", cantidad: 1 }, { sede: "Lima", cantidad: 3 }] },
        { varianteId: "m", talla: "M", motivo: "apartada", stockOtrasSedes: [{ sede: "Arequipa", cantidad: 2 }] },
        { varianteId: "l", talla: "L", motivo: "en_almacen", stockOtrasSedes: [{ sede: "Lima", cantidad: 5 }] },
        { varianteId: "xl", talla: "XL", motivo: "cobrable", stockOtrasSedes: [{ sede: "Lima", cantidad: 5 }] },
        { varianteId: "xs", talla: "XS", motivo: "agotada", stockOtrasSedes: [{ sede: "Taller", cantidad: 9 }] },
        { varianteId: "u", talla: null, motivo: "agotada", stockOtrasSedes: [] },
      ],
      TIENDAS,
    );
    expect(c.map((x) => x.varianteId)).toEqual(["s", "m"]);
    expect(c[0].tiendas.map((t) => `${t.id}:${t.cantidad}`)).toEqual(["lim:3", "aqp:1"]);
    expect(c[1].tiendas[0]).toEqual({ id: "aqp", nombre: "Tienda Arequipa", corto: "Arequipa", cantidad: 2 });
  });
  it("la frase del pie nombra a las tiendas que la tienen", () => {
    const c = candidatosParaPedir([{ varianteId: "s", talla: "S", motivo: "agotada", stockOtrasSedes: [{ sede: "Lima", cantidad: 1 }, { sede: "Arequipa", cantidad: 1 }] }], TIENDAS);
    expect(textoSugerenciaPedir(c)).toBe("¿No hay aquí? Arequipa y Lima la tienen: pídela y que la aparten para el cliente.");
    expect(textoSugerenciaPedir(c.slice(0, 0))).toBe("");
  });
});

describe("datos del cliente", () => {
  it("partirNombre: el punto de partida para nombres y apellidos", () => {
    expect(partirNombre("Ana Lozano")).toEqual({ nombres: "Ana", apellidos: "Lozano" });
    expect(partirNombre("Ana Lozano Vera")).toEqual({ nombres: "Ana", apellidos: "Lozano Vera" });
    expect(partirNombre("  Ana  María Lozano Vera ")).toEqual({ nombres: "Ana María", apellidos: "Lozano Vera" });
    expect(partirNombre(null)).toEqual({ nombres: "", apellidos: "" });
  });
  it("el celular que acepta la base: 9 dígitos, empieza en 9 (espacios aparte)", () => {
    expect(celularValido("987 111 222")).toBe(true);
    expect(celularValido("887111222")).toBe(false);
    expect(celularValido("98711122")).toBe(false);
  });
  it("faltaParaPedir: lo mismo que apaga el botón", () => {
    expect(faltaParaPedir({ varianteId: "", tiendaId: "", nombres: " ", apellidos: "", celular: "1" })).toEqual({ talla: true, tienda: true, nombres: true, apellidos: true, celular: true });
    expect(Object.values(faltaParaPedir({ varianteId: "v", tiendaId: "t", nombres: "Ana", apellidos: "Lozano", celular: "987111222" })).some(Boolean)).toBe(false);
  });
  it("la huella del pedido: lo mismo da la misma; cambiar algo da otra (y los espacios no cuentan)", () => {
    const d = { varianteId: "v", tiendaId: "t", nombres: "Ana", apellidos: "Lozano", celular: "987111222", nota: "" };
    expect(huellaDelPedido(d)).toBe(huellaDelPedido({ ...d, nombres: " Ana ", celular: "987 111 222" }));
    expect(huellaDelPedido(d)).not.toBe(huellaDelPedido({ ...d, tiendaId: "otra" }));
  });
});

describe("juntarPedidos — una sola lista", () => {
  it("lo que espera salir primero (el más antiguo arriba); lo demás después, lo más reciente primero", () => {
    const repo = (id: string, estado: PedidoEntreSedes["estado"], creadoEn: string): PedidoEntreSedes => ({
      grupoId: id, direccion: "me_piden", otraSede: "Tienda Lima", otraSedeId: "lim", estado, creadoEn, creadoPorNombre: null, nota: null,
      trasladoId: null, trasladoNumero: null, canceladoMotivo: null, lineas: [],
    });
    const cli = pedidoConClienteDeFila(fila({ id: "cli", created_at: "2026-10-03T10:00:00Z" }));
    const lista = juntarPedidos(
      [repo("r-nuevo", "pedido", "2026-10-05T10:00:00Z"), repo("r-salio", "en_camino", "2026-10-04T10:00:00Z"), repo("r-viejo-cerrado", "recibido", "2026-10-01T10:00:00Z")],
      [cli],
    );
    expect(lista.map((p) => p.grupoId)).toEqual(["cli", "r-nuevo", "r-salio", "r-viejo-cerrado"]);
  });
});
