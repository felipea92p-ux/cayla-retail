import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import { camposConfirmar, camposEnviar, camposMotivo, camposReservar, campoDeLinea } from "./pedidos-web-guia";
import { faltaDeLlegada, problemaParaConfirmar, type DecisionLinea } from "./pedidos-web-reglas";
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
