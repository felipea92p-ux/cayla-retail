// La guía de foco de la página pública del Club CAYLA (CLAUDE.md «Guía de foco», ADR-0284): qué campo está hecho, cuál sigue y
// qué falta para «Unirme al Club CAYLA». Lógica pura, sin React.
//
// NO agrega reglas: cada campo está «hecho» exactamente cuando `problemasRegistro` (lib/club-registro-reglas.ts) no tiene nada
// que decir de él —la MISMA regla que apaga el botón y que el servidor vuelve a correr—; lo prueba `club-registro-guia.test.ts`.
// Lo opcional de verdad (el correo vacío, la casilla de WhatsApp) no se lista como «falta».

import type { CampoDeGuia } from "./guia-campos";
import { problemasRegistro, type RegistroEscrito } from "./club-registro-reglas";

/**
 * Los campos de la página, en el orden en que se ven. `pendienteDocumento`: lo que la consulta del padrón está diciendo ahora
 * («Buscando tu DNI…», «No encontramos ese DNI…»), que es más útil que el «confirma tu nombre» genérico; no cambia qué está hecho.
 * `rechazoCorreo`: lo que el servidor dijo del correo que sigue escrito (el de otra persona, `rechazoDelCorreo`). No es una regla
 * nueva: es la respuesta de la base a ESE correo, y mientras siga escrito el correo no está listo (Felipe 2026-10-15).
 */
export function camposDelRegistro(r: RegistroEscrito, hoy: string, pendienteDocumento?: string | null, rechazoCorreo?: string | null): CampoDeGuia[] {
  const p = problemasRegistro(r, hoy);
  const esDni = r.documentoTipo === "dni";
  const correoEscrito = r.correo.trim() !== "";
  const problemaCorreo = rechazoCorreo ?? p.correo ?? null;
  return [
    {
      id: "documento",
      nombre: esDni ? "DNI" : "Documento",
      requerido: true,
      hecho: !p.documento,
      pendiente: pendienteDocumento ?? p.documento ?? "",
    },
    ...(esDni ? [] : [{ id: "nombre", nombre: "Nombres y apellidos", requerido: true, hecho: !p.nombre, pendiente: p.nombre ?? "" }]),
    { id: "celular", nombre: "Celular", requerido: true, hecho: !p.celular, pendiente: p.celular ?? "" },
    { id: "nacimiento", nombre: "Fecha de nacimiento", requerido: true, hecho: !p.nacimiento, pendiente: p.nacimiento ?? "" },
    // Opcional: vacío no falta; mal escrito, o el que la base no aceptó, sí bloquea (la base lo rechazaría igual).
    { id: "correo", nombre: "Correo", requerido: Boolean(problemaCorreo), hecho: correoEscrito && !problemaCorreo, pendiente: problemaCorreo ?? "" },
    { id: "mayor", nombre: "Mayor de 18 años", requerido: true, hecho: !p.mayor, pendiente: p.mayor ?? "" },
    { id: "terminos", nombre: "Política y Términos", requerido: true, hecho: !p.terminos, pendiente: p.terminos ?? "" },
    { id: "publicidad", nombre: "WhatsApp", requerido: false, hecho: r.aceptaPublicidad, pendiente: "" },
  ];
}
