import { cambiarClaveTerminal, crearTerminal } from "@/app/actions/terminales";
import type { ResultadoClave } from "@/lib/terminales-alta";
import type { EntradaTerminal } from "@/lib/terminales-reglas";
import type { Firma } from "@/lib/responsable-reglas";

// Crear una terminal y cambiarle la clave (ADR-0162; creadas desde Colaboradores desde el 2026-09-22). Pasan por una Server
// Action (`app/actions/terminales.ts`) que primero pregunta a la base si quien llama puede y recién ahí usa la llave de servicio.
// Detrás de esta interfaz para poder mostrar la pantalla con datos de ejemplo.
export type AccionesTerminales = {
  /** `firma`: la del combo «Responsable» del modal (ADR-0161 act. d): queda como quien creó / cambió la clave. */
  crear: (entrada: EntradaTerminal, firma: Firma | null) => Promise<ResultadoClave>;
  cambiarClave: (terminalId: string, firma: Firma | null) => Promise<ResultadoClave>;
};

export const accionesTerminalesServidor: AccionesTerminales = {
  crear: (entrada, firma) => crearTerminal(entrada, firma),
  cambiarClave: (terminalId, firma) => cambiarClaveTerminal({ terminalId }, firma),
};
