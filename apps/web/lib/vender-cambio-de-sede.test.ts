import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claveDelPuntoDeVenta, esperaTrasCambiarDeSede, NOMBRE_ESPERA_CAMBIO_DE_SEDE } from "./vender-cambio-de-sede";

// Cambiar de sede con el selector de la cabecera hace `router.refresh()`: la ruta no cambia y React conserva el estado de
// todo componente cliente cuya `key` no cambió. Vender montaba el Punto de venta con la misma key en todas las sedes, y el
// ticket armado en Lima (prendas, cliente, pago, comprobante) quedaba listo para cobrarse en la caja de Trujillo.
// Felipe, 2026-10-11: el ticket queda «En espera» en SU sede y la caja de la sede nueva arranca vacía.

const PAGINA_VENDER = join(__dirname, "..", "app", "(app)", "vender", "page.tsx");

describe("Vender: el ticket es de su sede", () => {
  it("la página monta el Punto de venta con una key que lleva la sede, dentro del guardián del cambio de sede", () => {
    const pagina = readFileSync(PAGINA_VENDER, "utf8");
    expect(pagina).toMatch(/<TicketPorSede\s+ubicacionId=\{persona\.ubicacionId\}/);
    expect(pagina).toMatch(/key=\{claveDelPuntoDeVenta\(\{\s*ubicacionId:\s*persona\.ubicacionId/);
  });

  it("dos sedes nunca comparten la key, aunque el ticket sea el mismo («caja», la misma proforma, la misma venta)", () => {
    expect(claveDelPuntoDeVenta({ ubicacionId: "lima" })).not.toBe(claveDelPuntoDeVenta({ ubicacionId: "trujillo" }));
    expect(claveDelPuntoDeVenta({ ubicacionId: "lima", proformaId: "p1" })).not.toBe(
      claveDelPuntoDeVenta({ ubicacionId: "trujillo", proformaId: "p1" }),
    );
    expect(claveDelPuntoDeVenta({ ubicacionId: "lima", repetirVentaId: "v1" })).not.toBe(
      claveDelPuntoDeVenta({ ubicacionId: "trujillo", repetirVentaId: "v1" }),
    );
  });

  it("en la misma sede la key sigue separando caja, proforma y «volver a vender», como antes", () => {
    const claves = [
      claveDelPuntoDeVenta({ ubicacionId: "lima" }),
      claveDelPuntoDeVenta({ ubicacionId: "lima", proformaId: "p1" }),
      claveDelPuntoDeVenta({ ubicacionId: "lima", proformaId: "p2" }),
      claveDelPuntoDeVenta({ ubicacionId: "lima", repetirVentaId: "v1" }),
    ];
    expect(new Set(claves).size).toBe(claves.length);
    expect(claveDelPuntoDeVenta({ ubicacionId: "lima" })).toBe(claveDelPuntoDeVenta({ ubicacionId: "lima", proformaId: null }));
  });
});

type Linea = { varianteId: string; cantidad: number };
type Cliente = { id: string; nombre: string };
type Guardado = { id: string; creadoEn: string; carrito: Linea[]; nota: string; nombre?: string; clienta?: Cliente | null };

const ticket = (lineas: Linea[], extra: Partial<{ nota: string; clienta: Cliente | null; conProforma: boolean }> = {}) => ({
  carrito: lineas,
  nota: extra.nota ?? "",
  clienta: extra.clienta ?? null,
  conProforma: extra.conProforma ?? false,
});
const enEspera = (nombre?: string): Guardado => ({ id: crypto.randomUUID(), creadoEn: "2026-10-11T10:00:00.000Z", carrito: [], nota: "", nombre });
const CUANDO = { id: "nuevo", ahora: "2026-10-11T15:00:00.000Z" };

describe("el ticket que se deja al cambiar de sede", () => {
  it("queda en la espera de su sede, con prendas, nota y cliente, a nombre de «Al cambiar de sede»", () => {
    const ana = { id: "c1", nombre: "Ana" };
    const lista = esperaTrasCambiarDeSede<Linea, Cliente, Guardado>(
      [enEspera("Probador 1")],
      ticket([{ varianteId: "v1", cantidad: 2 }], { nota: "lo recoge el sábado", clienta: ana }),
      CUANDO,
    );
    expect(lista).toHaveLength(2);
    expect(lista?.[0].nombre).toBe("Probador 1");
    expect(lista?.[1]).toEqual({
      id: "nuevo",
      creadoEn: CUANDO.ahora,
      carrito: [{ varianteId: "v1", cantidad: 2 }],
      nota: "lo recoge el sábado",
      nombre: NOMBRE_ESPERA_CAMBIO_DE_SEDE,
      clienta: ana,
    });
  });

  it("un ticket vacío no deja nada en espera", () => {
    expect(esperaTrasCambiarDeSede<Linea, Cliente, Guardado>([], ticket([]), CUANDO)).toBeNull();
  });

  it("una proforma en cobro no se guarda como ticket suelto: sigue vigente en Proformas y se cobra desde ahí", () => {
    expect(
      esperaTrasCambiarDeSede<Linea, Cliente, Guardado>([], ticket([{ varianteId: "v1", cantidad: 1 }], { conProforma: true }), CUANDO),
    ).toBeNull();
  });

  it("si el nombre ya está tomado en esa espera, lleva un número para distinguirlo", () => {
    const lista = esperaTrasCambiarDeSede<Linea, Cliente, Guardado>(
      [enEspera(NOMBRE_ESPERA_CAMBIO_DE_SEDE), enEspera(`${NOMBRE_ESPERA_CAMBIO_DE_SEDE} 2`)],
      ticket([{ varianteId: "v1", cantidad: 1 }]),
      CUANDO,
    );
    expect(lista?.at(-1)?.nombre).toBe(`${NOMBRE_ESPERA_CAMBIO_DE_SEDE} 3`);
  });

  it("entra aunque la sede ya tenga sus 5 en espera (Felipe: perder un ticket armado es peor que uno de más en la tira)", () => {
    const llena = Array.from({ length: 5 }, (_, i) => enEspera(`Probador ${i + 1}`));
    const lista = esperaTrasCambiarDeSede<Linea, Cliente, Guardado>(llena, ticket([{ varianteId: "v1", cantidad: 1 }]), CUANDO);
    expect(lista).toHaveLength(6);
  });

  it("no toca la lista que recibe", () => {
    const antes = [enEspera("Probador 1")];
    esperaTrasCambiarDeSede<Linea, Cliente, Guardado>(antes, ticket([{ varianteId: "v1", cantidad: 1 }]), CUANDO);
    expect(antes).toHaveLength(1);
  });
});
