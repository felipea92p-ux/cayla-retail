import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «avisos_club» (ADR-0161 B2; ADR-0288 act. g, G-8): quien llega por URL directa sin ese módulo en su rol cae
// en «Sin acceso». Nace solo para el líder (sin rol); el líder decide después a quién se lo da. El candado real sigue en la base:
// `fn_club_avisos_pendientes`, `registrar_aviso_enviado` y `deshacer_aviso_enviado` piden el módulo.
export default async function AvisosClubLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("avisos_club");
  return <>{children}</>;
}
