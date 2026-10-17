import { exigirModulo } from "@/lib/persona-actual";

// La puerta de Tienda web ▸ Datos y plazos (ADR-0430): la abre su propio módulo, «ajustes_web» (20261016223000). Hasta ese día la abría
// «configuracion», el de la pestaña «Tienda web» de Configuración (ADR-0408, act. 6). Sus funciones piden `fn_puede_ajustes_tienda_web()`
// (el líder o ese módulo). Quien llega por URL directa sin el módulo cae en «Sin acceso».
export default async function AjustesTiendaWebLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("ajustes_web");
  return <>{children}</>;
}
