import { exigirModulo } from "@/lib/persona-actual";
import { getAvisosPendientes, type LecturaAvisos } from "@/lib/club-avisos";
import { AvisosClubPanel } from "@/components/clientas/AvisosClubPanel";

// Clientas ▸ Avisos (ADR-0288, «Actualización 2026-10-01 (g)», G-8): los mensajes por mandar a cada socia desde el WhatsApp de la
// tienda activa (el selector de sede, como Frescura). La lista la arma la base (`fn_club_avisos_pendientes`); el panel solo la
// pinta, abre WhatsApp Web y anota cada envío. «Beneficios del club» vive en su propio módulo (/clientas/beneficios).
export default async function AvisosClubPage() {
  // La repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas (lo mismo que exigirLider).
  const persona = await exigirModulo("avisos_club");
  const esTienda = persona.ubicacionTipo === "tienda";
  const sinLista: LecturaAvisos = { avisos: [], falla: null };
  const lectura = esTienda ? await getAvisosPendientes(persona.ubicacionId) : sinLista;
  return (
    <AvisosClubPanel
      sede={{ id: persona.ubicacionId, nombre: persona.ubicacionEtiqueta }}
      esTienda={esTienda}
      avisos={lectura.avisos}
      falla={lectura.falla}
    />
  );
}
