import type { ReactNode } from "react";
import { Pestanas } from "@/components/ui/Pestanas";

/**
 * Las tres vistas de Tienda web ▸ Vitrina (maqueta v4, las pestañas «Modelos» y «Looks»; «Probador» desde el ADR-0434): qué modelos se
 * ven en la tienda online, las combinaciones de «Arma tu look» y lo que necesita el probador de «Arma el tuyo». Son el MISMO módulo
 * (`vitrina_web`, ADR-0306): la pestaña solo lleva a su dirección. Es la pestaña de vista del sistema (ADR-0358): cambia de sección, no
 * filtra.
 */
export function VitrinaPestanas({ activa, derecha }: { activa: "modelos" | "looks" | "probador"; derecha?: ReactNode }) {
  // `derecha`: lo que va a la derecha de las pestañas, a la altura de su centro (hoy, «¿Qué precio ve el cliente?» de Modelos). Es la fila de las
  // pestañas con lo suyo; si una pantalla no pasa nada, queda exactamente como estaba.
  const pestanas = (
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
  if (!derecha) return pestanas;
  return <div className="flex flex-wrap items-center gap-x-4">{pestanas}{derecha}</div>;
}
