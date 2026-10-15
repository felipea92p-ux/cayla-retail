import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import { camposAnularPago, camposConfirmar, camposEnviar, camposMotivo, camposPago, camposReservar, campoDeLinea } from "./pedidos-web-guia";
import { faltaDeLlegada, problemaParaConfirmar, type DecisionLinea } from "./pedidos-web-reglas";
import { MEDIOS_PAGO_WEB, problemaDelPago, problemaParaAnular, type FormPago, type MedioPagoWeb, type MotivoAnularPago } from "./pedidos-web-cobro-reglas";
import { sumarDias } from "./fechas-lima";

const HOY = "2026-10-14";
const listo = { responsableListo: true, responsableMotivo: null };
const lineas = [
  { lineaId: "a", referencia: "Casaca Luciana", talla: "M" },
  { lineaId: "b", referencia: "Blusa Valentina", talla: "S" },
];

// Todas las decisiones que puede tener una prenda (incluida ninguna y las fechas que la base rechaza).
const DECISIONES: (DecisionLinea | null)[] = [
  null,
  { tipo: "reservar", ubicacionId: "tru", lugar: "almacen" },
  { tipo: "reservar", ubicacionId: "lim", lugar: null },
  { tipo: "por_conseguir", fecha: "" },
  { tipo: "por_conseguir", fecha: sumarDias(HOY, -1) },
  { tipo: "por_conseguir", fecha: HOY },
  { tipo: "por_conseguir", fecha: sumarDias(HOY, 7) },
  { tipo: "por_conseguir", fecha: sumarDias(HOY, 60) },
  { tipo: "por_conseguir", fecha: sumarDias(HOY, 61) },
  { tipo: "quitar" },
];

describe("Confirmar un pedido web: la guía", () => {
  // La guía no inventa reglas: se puede confirmar exactamente cuando `problemaParaConfirmar` (la regla de la base) no tiene nada.
  it("se puede confirmar exactamente cuando problemaParaConfirmar no pone reparos, en todas las combinaciones", () => {
    for (const a of DECISIONES) {
      for (const b of DECISIONES) {
        const decisiones = { a, b };
        const campos = camposConfirmar({ lineas, decisiones, hoy: HOY, ...listo });
        expect(sePuedeConfirmar(campos), JSON.stringify(decisiones)).toBe(problemaParaConfirmar(lineas, decisiones, HOY) === null);
      }
    }
  });

  it("cada prenda es un campo propio, con su nombre, y el responsable cierra la lista", () => {
    const campos = camposConfirmar({ lineas, decisiones: {}, hoy: HOY, ...listo });
    expect(campos.map((c) => c.id)).toEqual([campoDeLinea("a"), campoDeLinea("b"), "responsable"]);
    expect(campos[0]!.nombre).toBe("Casaca Luciana · M");
    expect(campos[0]!.pendiente).toBe("Elige qué hacer con esta prenda.");
  });

  it("quitar todas no es confirmar: la guía lo dice en cada prenda", () => {
    const campos = camposConfirmar({ lineas, decisiones: { a: { tipo: "quitar" }, b: { tipo: "quitar" } }, hoy: HOY, ...listo });
    expect(sePuedeConfirmar(campos)).toBe(false);
    expect(campos[0]!.pendiente).toMatch(/No se puede confirmar/);
  });

  it("sin responsable no se confirma, aunque todo lo demás esté listo", () => {
    const decisiones = { a: DECISIONES[1]!, b: DECISIONES[6]! };
    expect(sePuedeConfirmar(camposConfirmar({ lineas, decisiones, hoy: HOY, responsableListo: false, responsableMotivo: "Marca tu entrada" }))).toBe(false);
    expect(sePuedeConfirmar(camposConfirmar({ lineas, decisiones, hoy: HOY, ...listo }))).toBe(true);
  });
});

describe("No confirmar o anular: la guía", () => {
  it("pide el motivo y quién lo hace", () => {
    expect(sePuedeConfirmar(camposMotivo({ motivo: null, ...listo }))).toBe(false);
    expect(sePuedeConfirmar(camposMotivo({ motivo: "cliente_desistio", responsableListo: false, responsableMotivo: null }))).toBe(false);
    expect(sePuedeConfirmar(camposMotivo({ motivo: "cliente_desistio", ...listo }))).toBe(true);
  });
});

describe("Reservar lo que llegó: la guía", () => {
  it("solo pide quién lo hace (de dónde sale viene elegido)", () => {
    expect(sePuedeConfirmar(camposReservar(listo))).toBe(true);
    expect(sePuedeConfirmar(camposReservar({ responsableListo: false, responsableMotivo: "Marca tu entrada" }))).toBe(false);
  });
});

describe("Enviar a la tienda del pedido: la guía", () => {
  // El día de llegada falta exactamente cuando la regla (la misma de `enviar_pedido_web_desde`: de hoy a 60 días) lo rechaza.
  it("la fecha falta exactamente cuando faltaDeLlegada la rechaza", () => {
    for (const llega of ["", "mañana", sumarDias(HOY, -1), HOY, sumarDias(HOY, 1), sumarDias(HOY, 60), sumarDias(HOY, 61)]) {
      const [campo] = camposEnviar({ llega, hoy: HOY, ...listo });
      expect(campo!.hecho, llega).toBe(faltaDeLlegada(llega, HOY) === null);
    }
  });
});

describe("Registrar un pago: la guía", () => {
  const MONTOS = ["", "0", "12,50", "S/ 40", "-5", "5.001", "100", "100.01"];
  const MEDIOS: (MedioPagoWeb | null)[] = [null, ...MEDIOS_PAGO_WEB.map((m) => m.clave)];
  const OPERACIONES = ["", "12345", "123456", "04812793", "123456789012"];
  const CAJAS = [true, false, null];
  // La guía no inventa reglas: se puede registrar exactamente cuando `problemaDelPago` (la regla de la base) no tiene nada.
  it("se puede registrar exactamente cuando problemaDelPago no pone reparos, en todas las combinaciones", () => {
    for (const monto of MONTOS)
      for (const medio of MEDIOS)
        for (const operacion of OPERACIONES)
          for (const caja of CAJAS) {
            const form: FormPago = { monto, medio, operacion };
            const campos = camposPago({ form, falta: 100, cajaAbierta: caja, tienda: "Tienda Trujillo", ...listo });
            expect(sePuedeConfirmar(campos), JSON.stringify({ form, caja })).toBe(problemaDelPago(form, 100, caja, "Tienda Trujillo") === null);
          }
  });

  it("el n.º de operación solo se pide en un pago digital; el responsable cierra la lista", () => {
    const ids = (medio: MedioPagoWeb | null) => camposPago({ form: { monto: "10", medio, operacion: "" }, falta: 100, cajaAbierta: true, tienda: "T", ...listo }).map((c) => c.id);
    expect(ids("yape")).toEqual(["monto", "medio", "operacion", "responsable"]);
    expect(ids("efectivo")).toEqual(["monto", "medio", "responsable"]);
    expect(ids(null)).toEqual(["monto", "medio", "responsable"]);
  });

  it("el efectivo sin caja abierta deja el medio por hacer, con lo que hay que hacer", () => {
    const [, medio] = camposPago({ form: { monto: "10", medio: "efectivo", operacion: "" }, falta: 100, cajaAbierta: false, tienda: "Tienda Lima", ...listo });
    expect(medio).toMatchObject({ hecho: false, pendiente: "No hay una caja abierta en Tienda Lima: ábrela en Caja o elige otro medio." });
  });

  it("lo que la base rechazó de un campo (el n.º ya usado en otro pedido) vuelve a faltar, con la frase de la base", () => {
    const form: FormPago = { monto: "10", medio: "yape", operacion: "04812793" };
    const rechazo = { campo: "operacion" as const, detalle: "Ese n.º de operación ya se registró en el pedido W-0218." };
    const campos = camposPago({ form, falta: 100, cajaAbierta: true, tienda: "T", rechazo, ...listo });
    expect(sePuedeConfirmar(campos)).toBe(false);
    expect(campos.find((c) => c.id === "operacion")).toMatchObject({ hecho: false, pendiente: rechazo.detalle });
    expect(sePuedeConfirmar(camposPago({ form, falta: 100, cajaAbierta: true, tienda: "T", rechazo: null, ...listo }))).toBe(true);
  });

  it("sin responsable no se registra, aunque todo lo demás esté listo", () => {
    const form: FormPago = { monto: "10", medio: "yape", operacion: "04812793" };
    expect(sePuedeConfirmar(camposPago({ form, falta: 100, cajaAbierta: true, tienda: "T", responsableListo: false, responsableMotivo: "Marca tu entrada" }))).toBe(false);
  });
});

describe("Anular o devolver un pago: la guía", () => {
  const MOTIVOS: (MotivoAnularPago | null)[] = [null, "devuelto_al_cliente", "error_al_anotar"];
  it("se puede anular exactamente cuando problemaParaAnular no pone reparos (motivo y, si es efectivo, la caja)", () => {
    for (const medio of ["efectivo", "yape", "transferencia"])
      for (const motivo of MOTIVOS)
        for (const caja of [true, false, null]) {
          const campos = camposAnularPago({ medio, motivo, cajaAbierta: caja, tienda: "T", ...listo });
          expect(sePuedeConfirmar(campos), JSON.stringify({ medio, motivo, caja })).toBe(problemaParaAnular({ medio }, motivo, caja, "T") === null);
        }
  });
  it("con efectivo, la caja va primero (sin ella no hay de dónde sacar la plata)", () => {
    expect(camposAnularPago({ medio: "efectivo", motivo: null, cajaAbierta: false, tienda: "T", ...listo }).map((c) => c.id)).toEqual(["caja", "motivo", "responsable"]);
    expect(camposAnularPago({ medio: "plin", motivo: null, cajaAbierta: false, tienda: "T", ...listo }).map((c) => c.id)).toEqual(["motivo", "responsable"]);
  });
});
