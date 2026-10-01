import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VistaCaraDelQr } from "../components/clientas/CaraDelQrClub";
import { caraDelQr, type CaraDelQr, type ClubDeLaCaja } from "./club-caja-reglas";

// Lo que se VE en cada momento de la cara del QR (camino B, ADR-0288 act. c), renderizado a HTML estático como
// `conteo-kit.test.ts`: sin navegador ni base. Lo que decide QUÉ momento es lo prueba `club-caja-reglas.test.ts`.
//
// Vitest no resuelve los alias `@/` del componente: las piezas con red o con estado (el combo, la guía, las acciones) se
// reemplazan por dobles quietos, y las reglas y el QR se traen de verdad por su ruta relativa.
vi.mock("@/components/ui/campos", () => ({
  Boton: ({ children, cargando, ...props }: { children: ReactNode; cargando?: boolean; peso?: string }) =>
    createElement("button", { type: "button", "data-cargando": cargando ? "si" : undefined, className: props.peso }, children),
}));
vi.mock("@/components/ComboResponsable", () => ({ ComboResponsable: () => null }));
vi.mock("@/components/guia-de-foco/CampoGuiado", () => ({ CampoGuiado: () => null, PieGuia: () => null }));
vi.mock("@/components/guia-de-foco/useGuiaCampos", () => ({ useGuiaCampos: () => null }));
vi.mock("@/lib/club-acciones", () => ({ crearInvitacionClub: vi.fn(), resumenClientaCaja: vi.fn() }));
vi.mock("@/lib/error-escritura", () => ({ esFalloDeRed: () => false, traducirError: () => "" }));
vi.mock("@/lib/club-caja-reglas", async () => await import("./club-caja-reglas"));
vi.mock("@/lib/qr", async () => await import("./qr"));

const CLUB: ClubDeLaCaja = {
  textos: [{ tipo: "mensaje_personal", version: 2, texto: "Hola CAYLA, quiero novedades. (Club {codigo})" }],
  whatsappTienda: "987654321",
};
const base = {
  nombre: "María",
  codigo: "C-0142",
  club: CLUB,
  origen: "https://erp.cayla.pe",
  invitacion: { estado: "lista", token: "Ab12_cd34-EF56gh" } as const,
  publicidad: null,
  responsableListo: true,
  responsableMotivo: null,
  espera: "esperando" as const,
};

const html = (cara: CaraDelQr) =>
  renderToStaticMarkup(
    createElement(VistaCaraDelQr, {
      cara,
      codigo: "C-0142",
      revisando: false,
      pedirResponsable: createElement("div", { "data-prueba": "combo" }, "combo del responsable"),
      onActualizar: () => undefined,
      onLlegoSuMensaje: () => undefined,
      onListo: () => undefined,
    })
  );

describe("la cara del QR, momento por momento (spike `47-club-qr.js`, `modalQR`)", () => {
  it("esperando: su QR a la página, la dirección, «Esperando su confirmación…» y el respaldo", () => {
    const h = html(caraDelQr(base));
    expect(h).toContain("Su QR · código C-0142");
    expect(h).toContain("Pídele que lo escanee con la cámara de su celular.");
    expect(h).toContain("Se abre una página de CAYLA con el texto y una casilla. Cuando la marque y confirme, esto se actualiza solo.");
    expect(h).toContain("erp.cayla.pe/club/Ab12_cd34-EF56gh");
    expect(h).toContain("Esperando su confirmación…");
    expect(h).toContain("En su ticket también sale un QR: puede hacerlo en casa.");
    expect(h).toContain("Llegó su mensaje (respaldo)");
    expect(h).toContain("Listo, por ahora no");
    expect(h).toContain("<svg");
    // Sin botones de demo.
    expect(h).not.toMatch(/Demo/);
  });

  it("nada en bucle: el punto de «Esperando…» es quieto (el del spike late; ADR-0136 no lo admite)", () => {
    for (const espera of ["esperando", "pausada", "vencida"] as const) {
      const h = html(caraDelQr({ ...base, espera }));
      expect(h).not.toMatch(/animate-|punto-vivo/);
    }
  });

  it("a los 10 minutos: «¿Ya lo hizo?» con «Actualizar»", () => {
    const h = html(caraDelQr({ ...base, espera: "vencida" }));
    expect(h).toContain("¿Ya lo hizo?");
    expect(h).toContain("Actualizar");
    expect(h).not.toContain("Esperando su confirmación…");
  });

  it("listo: «Listo: María recibe novedades por WhatsApp» y un solo botón", () => {
    const h = html(caraDelQr({ ...base, publicidad: "pagina" }));
    expect(h).toContain("Listo: María recibe novedades por WhatsApp");
    expect(h).toContain("Confirmó");
    expect(h).not.toContain("Esperando");
    expect(h).not.toContain("Listo, por ahora no");
    expect(html(caraDelQr({ ...base, publicidad: "ya_tenia" }))).toContain("Ya recibe novedades");
  });

  it("sin responsable: primero el combo, sin QR", () => {
    const h = html(caraDelQr({ ...base, invitacion: { estado: "sin_pedir" }, responsableListo: false }));
    expect(h).toContain("combo del responsable");
    expect(h).not.toContain("<svg");
  });

  it("preparando: el lugar del QR reservado, sin giro", () => {
    const h = html(caraDelQr({ ...base, invitacion: { estado: "sin_pedir" } }));
    expect(h).toContain("Preparando su QR…");
    expect(h).not.toMatch(/animate-spin/);
  });

  it("respaldo sin conexión: el QR del WhatsApp de la tienda, «Si no se abre la página…» y «Llegó su mensaje»", () => {
    const h = html(caraDelQr({ ...base, invitacion: { estado: "fallo", detalle: null } }));
    expect(h).toContain("No se pudo preparar su página de CAYLA.");
    expect(h).toContain("Si no se abre la página, que te escriba por WhatsApp");
    expect(h).toContain("wa.me/51987654321");
    expect(h).toContain("<svg");
    expect(h).toContain("Llegó su mensaje");
    expect(h).not.toContain("Esperando su confirmación…");
  });

  it("respaldo sin QR de WhatsApp: dice por qué y deja «Llegó su mensaje»", () => {
    const h = html(caraDelQr({ ...base, club: { ...CLUB, whatsappTienda: null }, invitacion: { estado: "fallo", detalle: "Tu rol no tiene el módulo «Clientas»." } }));
    expect(h).toContain("Tu rol no tiene el módulo «Clientas».");
    expect(h).toContain("WhatsApp cargado");
    expect(h).not.toContain("<svg");
    expect(h).toContain("Llegó su mensaje");
    // Sin el WhatsApp de la tienda el ticket tampoco lleva QR: no se promete.
    expect(h).not.toContain("En su ticket también sale un QR");
  });
});
