import { exigirModulo } from "@/lib/persona-actual";

// La puerta del GRUPO Clientas (ADR-0161 B2; grupo desde ADR-0288 act. g): entra quien ve «Clientas» o «Avisos del club». Cada
// pantalla repite la de su módulo (`page.tsx` de las fichas pide «clientas»; `avisos/layout.tsx`, «avisos_club»): con solo esta
// puerta, quien tiene Avisos sin Clientas abriría las fichas por URL. Y un layout no vuelve a correr al navegar entre sus hijas.
// El candado real sigue en la base; esto evita abrir una pantalla que después falla al leer o al guardar.
export default async function ClientasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("clientas", "avisos_club");
  return <>{children}</>;
}
