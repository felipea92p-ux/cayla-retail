import { Pestanas } from "@/components/ui/Pestanas";

/**
 * Las dos vistas de Tienda web ▸ Vitrina (maqueta v4, las pestañas «Modelos» y «Looks»): qué modelos se ven en la tienda online y las
 * combinaciones de «Arma tu look». Son el MISMO módulo (`vitrina_web`, ADR-0306): la pestaña solo lleva a su dirección. Es la pestaña de
 * vista del sistema (ADR-0358): cambia de sección, no filtra.
 */
export function VitrinaPestanas({ activa }: { activa: "modelos" | "looks" }) {
  return (
    <Pestanas
      etiquetaAccesible="Vitrina web"
      activa={activa}
      idIndicador="vitrina"
      guia="vitrina.pestanas"
      items={[
        { clave: "modelos", etiqueta: "Modelos", href: "/tienda-web/vitrina", ayuda: "Qué modelos se ven en la tienda online" },
        { clave: "looks", etiqueta: "Looks", href: "/tienda-web/vitrina/looks", ayuda: "Las combinaciones de «Arma tu look»" },
      ]}
    />
  );
}
