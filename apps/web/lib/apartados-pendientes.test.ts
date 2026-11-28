import { describe, expect, it } from "vitest";
import type { Apartado } from "./separaciones-reglas";
import { adelantosGuardados, adondeSeDevuelve, comoSePendiente, cuandoSeCancelaSolo, ordenPendientes } from "./apartados-pendientes";

const apartado = (extra: Partial<Apartado> = {}): Apartado => ({
  id: "s1", codigo: "APT-TRU-0007", estado: "abierta", nombres: "Ana", apellidos: "Lozano Vera", celular: "987111222", dni: "70124598",
  asesora: null, total: 179, adelanto: 90, saldo: 89, venceEl: "2026-09-29", extensiones: 0, creadaEn: "2026-09-22T15:00:00Z",
  devolucionMedio: "yape", devolucionNumero: "987111222", devolucionCciFinal: null, liberadaSola: false,
  comprobanteAnticipo: null, comprobanteFinal: null, notaCredito: null, prendas: [], pagos: [], estante: null, canal: "tienda", modoEntrega: "recojo", direccionEnvio: null, enviadoEn: null, guiaEnvio: null, ...extra,
});
const avisadoEl = (instante: string) => ({ avisos: 1, ultimoEn: instante, ultimoPor: null });

describe("cada fila de Pendientes (ADR-0720)", () => {
  it("lo cancelado pide devolver el adelanto, dice adónde va y ya no cobra nada", () => {
    const f = comoSePendiente(apartado({ estado: "liberada" }), "2026-09-22", undefined);
    expect(f).toMatchObject({ clave: "devolver", insignia: "Por devolver", tono: "rojo", accion: "devolver", falta: null });
    expect(f.debajo).toEqual({ tipo: "texto", texto: "S/90.00 por Yape al 987 111 222" });
  });

  it("lo vencido dice cuándo se cancela solo y pide escribirle; lo que vence pronto, también", () => {
    expect(comoSePendiente(apartado(), "2026-09-30", undefined)).toMatchObject({ clave: "vencida", insignia: "Vencido", tono: "rojo", accion: "escribir", falta: 89, debajo: { tipo: "texto", texto: "se cancela solo en 2 días" } });
    expect(comoSePendiente(apartado(), "2026-09-29", undefined)).toMatchObject({ clave: "porvencer", insignia: "Vence hoy", tono: "ambar", accion: "escribir", debajo: null });
    expect(comoSePendiente(apartado(), "2026-09-28", undefined).insignia).toBe("Vence mañana");
  });

  it("lo que va a tiempo no lleva botón: dice cuándo vence", () => {
    expect(comoSePendiente(apartado(), "2026-09-22", undefined)).toMatchObject({ clave: "vigente", insignia: "A tiempo", tono: "verde", accion: null, debajo: { tipo: "vence", iso: "2026-09-29" } });
  });

  it("a quien ya se le escribió hoy, su botón dice «Avisado hoy»; mañana vuelve a pedir escribirle; sin celular, no hay a quién", () => {
    expect(comoSePendiente(apartado(), "2026-09-29", avisadoEl("2026-09-29T15:00:00Z")).accion).toBe("avisado");
    expect(comoSePendiente(apartado(), "2026-09-30", avisadoEl("2026-09-29T15:00:00Z")).accion).toBe("escribir");
    expect(comoSePendiente(apartado({ celular: "" }), "2026-09-29", undefined).accion).toBeNull();
  });

  it("cuándo se cancela solo, sin «·»: en 2 días, mañana (el último día para decidir) y hoy", () => {
    expect(cuandoSeCancelaSolo("2026-09-29", "2026-09-30")).toBe("se cancela solo en 2 días");
    expect(cuandoSeCancelaSolo("2026-09-29", "2026-10-01")).toBe("se cancela solo mañana");
    expect(cuandoSeCancelaSolo("2026-09-29", "2026-10-02")).toBe("se cancela solo hoy");
  });

  it("adónde se devuelve, en una frase", () => {
    expect(adondeSeDevuelve({ devolucionMedio: "plin", devolucionNumero: "987041107", devolucionCciFinal: null })).toBe("por Plin al 987 041 107");
    expect(adondeSeDevuelve({ devolucionMedio: "transferencia", devolucionNumero: null, devolucionCciFinal: "1234" })).toBe("por transferencia a su cuenta …1234");
    expect(adondeSeDevuelve({ devolucionMedio: "yape", devolucionNumero: null, devolucionCciFinal: null })).toBe("por Yape");
    for (const f of [comoSePendiente(apartado({ estado: "liberada" }), "2026-09-22", undefined), comoSePendiente(apartado(), "2026-09-30", undefined)]) {
      expect(JSON.stringify(f)).not.toContain("·");
    }
  });

  it("el orden: por devolver, vencido, por vencer, a tiempo; y dentro, lo que vence antes", () => {
    const hoy = "2026-09-30";
    const lista = [
      apartado({ id: "tiempo", venceEl: "2026-10-06" }),
      apartado({ id: "manana", venceEl: "2026-10-01" }),
      apartado({ id: "vencido", venceEl: "2026-09-29" }),
      apartado({ id: "devolver", estado: "liberada", venceEl: "2026-09-20" }),
      apartado({ id: "tiempo-antes", venceEl: "2026-10-04" }),
    ];
    expect(ordenPendientes(lista, hoy).map((a) => a.id)).toEqual(["devolver", "vencido", "manana", "tiempo-antes", "tiempo"]);
  });

  it("los adelantos guardados suman solo lo abierto (lo cancelado se devuelve)", () => {
    expect(adelantosGuardados([{ estado: "abierta", adelanto: 60 }, { estado: "abierta", adelanto: 100.1 }, { estado: "liberada", adelanto: 45 }])).toBe(160.1);
  });
});
