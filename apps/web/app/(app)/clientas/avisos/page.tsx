import { exigirModulo } from "@/lib/persona-actual";
import { getAvisosPendientes, getBeneficiosClub, type LecturaAvisos, type LecturaBeneficios } from "@/lib/club-avisos";
import { AvisosClubPanel } from "@/components/clientas/AvisosClubPanel";

// Clientas ▸ Avisos (ADR-0288, «Actualización 2026-10-01 (g)», G-8): los mensajes por mandar a cada socia desde el WhatsApp de la
// tienda activa (el selector de sede, como Frescura). La lista la arma la base (`fn_club_avisos_pendientes`); el panel solo la
// pinta, abre WhatsApp Web y anota cada envío. «Beneficios del club» es solo del líder: a él se le leen los vigentes para su hoja.
export default async function AvisosClubPage() {
  // La repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas (lo mismo que exigirLider).
  const persona = await exigirModulo("avisos_club");
  const esTienda = persona.ubicacionTipo === "tienda";
  const sinLista: LecturaAvisos = { avisos: [], falla: null };
  const [lectura, beneficios] = await Promise.all([
    esTienda ? getAvisosPendientes(persona.ubicacionId) : Promise.resolve(sinLista),
    persona.rol === "lider" ? getBeneficiosClub(persona.ubicacionId) : Promise.resolve<LecturaBeneficios | null>(null),
  ]);
  return (
    <AvisosClubPanel
      sede={{ id: persona.ubicacionId, nombre: persona.ubicacionEtiqueta }}
      esTienda={esTienda}
      avisos={lectura.avisos}
      falla={lectura.falla}
      beneficios={beneficios}
    />
  );
}
