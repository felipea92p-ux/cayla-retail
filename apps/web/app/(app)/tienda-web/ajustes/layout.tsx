import { exigirModulo } from "@/lib/persona-actual";

// La puerta de Tienda web ▸ Ajustes (ADR-0430): la abre el módulo «configuracion», el mismo que abría la pestaña «Tienda web» de
// Configuración (ADR-0408, act. 6). Sus funciones piden `fn_puede_configurar()`: mudarla de lugar no le dio ni le quitó a nadie el poder
// de cambiarla. Quien llega por URL directa sin el módulo cae en «Sin acceso».
export default async function AjustesTiendaWebLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("configuracion");
  return <>{children}</>;
}
