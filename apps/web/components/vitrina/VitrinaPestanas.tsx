import { Pestanas } from "@/components/ui/Pestanas";

/**
 * Las tres vistas de Tienda web ▸ Vitrina (maqueta v4, las pestañas «Modelos» y «Looks»; «Probador» desde el ADR-0434): qué modelos se
 * ven en la tienda online, las combinaciones de «Arma tu look» y lo que necesita el probador de «Arma el tuyo». Son el MISMO módulo
 * (`vitrina_web`, ADR-0306): la pestaña solo lleva a su dirección. Es la pestaña de vista del sistema (ADR-0358): cambia de sección, no
 * filtra.
 */
export function VitrinaPestanas({ activa }: { activa: "modelos" | "looks" | "probador" }) {
  return (
    <Pestanas
      etiquetaAccesible="Vitrina web"
      activa={activa}
      idIndicador="vitrina"
      guia="vitrina.pestanas"
      items={[
        { clave: "modelos", etiqueta: "Modelos", href: "/tienda-web/vitrina", ayuda: "Qué modelos se ven en la tienda online" },
        { clave: "looks", etiqueta: "Looks", href: "/tienda-web/vitrina/looks", ayuda: "Las combinaciones de «Arma tu look»" },
        { clave: "probador", etiqueta: "Probador", href: "/tienda-web/vitrina/probador", ayuda: "Las prendas recortadas para «Arma el tuyo»" },
      ]}
    />
  );
}
