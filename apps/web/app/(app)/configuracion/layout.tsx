import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «configuracion» (ADR-0195 F1; delegable desde el ADR-0253: sus funciones piden
// `fn_puede_configurar()`). Quien llega por URL directa sin el módulo cae en «Sin acceso»; el candado real sigue en la base.
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("configuracion");
  // Sin lugar propio (`contents`): solo le da a las pestañas el vidrio de sus bloques y del kit de Finanzas (estilos/vidrio/pantalla-en-vidrio.css).
  return <div className="pantalla-en-vidrio contents">{children}</div>;
}
