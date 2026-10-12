"use client";

import { Buscador } from "@/components/ui/Buscador";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FileText, Send } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede, type CifraResumen } from "@/components/ui/ResumenSede";
import { pestanaDeRuta, SEGUNDOS_VISTA_FRESCA, textoDeFrescura, type ClavePestana } from "@/lib/facturacion-reglas";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { useUltimaCarga } from "@/lib/ultima-carga-facturacion";

// Cabecera de Facturación: la misma de Cambios, Devoluciones, Caja e Historial (`EncabezadoPagina`),
// con la línea viva (desde cuándo está lo que se ve) en la línea de arriba y las cifras de Facturación
// a la derecha. Sin acciones globales: «Nueva proforma» vive en su pestaña. La caja de búsqueda vive con las pestañas
// (`CajaDeBusqueda`, en el shell), como la barra de filtros de Historial.

const PISTA_DE_BUSQUEDA: Record<ClavePestana, string> = {
  hoy: "Buscar número, cliente, DNI o RUC…",
  series: "Buscar serie o tienda…",
  cola: "Buscar número o error…",
  proformas: "Buscar cliente…",
};

// La línea viva. El punto late mientras lo que se ve es reciente; pasados diez minutos sin recargar se
// queda quieto y ámbar, y el texto lo dice: una pantalla que se deja abierta todo el día no se actualiza
// sola, y un punto verde que late sobre datos de hace tres horas mentiría. Mientras no se sepa cuándo
// llegó la vista (el primer cuadro) se asume reciente: la acaba de armar el servidor.
function EstadoDeFrescura() {
  const ultima = useUltimaCarga();
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const segundos = ultima === null ? 0 : Math.max(0, Math.floor((ahora - ultima) / 1000));
  const fresca = segundos < SEGUNDOS_VISTA_FRESCA;

  return (
    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${fresca ? "punto-vivo bg-verde" : "bg-ambar"}`} />
      <span className={fresca ? "font-medium" : "font-semibold text-ambar-profundo"}>{textoDeFrescura(segundos)}</span>
    </span>
  );
}

// La caja de búsqueda: filtra las filas de la vista que se mira (el texto vive en el shell y se borra
// al cambiar de vista). `type="search"` con su propia «x»: la nativa cambia de un navegador a otro.
export function CajaDeBusqueda() {
  const { texto, setTexto } = useFacturacionBusqueda();
  const pista = PISTA_DE_BUSQUEDA[pestanaDeRuta(usePathname())];

  // La pieza única de buscar (ADR-0358, ronda 5); filtra en el navegador, así que nunca dice «Buscando…».
  return <Buscador valor={texto} onCambio={setTexto} placeholder={pista} etiqueta="Buscar en esta vista" className="w-full sm:ml-auto sm:w-64" />;
}

/** Las dos cifras de la cabecera. Cada una es `null` si su lectura falló (`opcional` en el layout): sin dato no se
 *  dibuja, nunca un número inventado. A diferencia del contador de la pestaña, un cero SÍ se muestra: «0 por
 *  enviar» es una buena noticia y la cabecera la dice. */
export type CifrasCabecera = { porEnviar: number | null; proformasVigentes: number | null };

function cifrasDe({ porEnviar, proformasVigentes }: CifrasCabecera): CifraResumen[] {
  const cifras: CifraResumen[] = [];
  if (porEnviar !== null) cifras.push({ valor: porEnviar, etiqueta: "Por enviar a SUNAT", icono: Send });
  if (proformasVigentes !== null) {
    cifras.push({ valor: proformasVigentes, etiqueta: proformasVigentes === 1 ? "Proforma vigente" : "Proformas vigentes", icono: FileText });
  }
  return cifras;
}

/** `sede` es la que está seleccionada arriba a la derecha (la de la persona), como en las otras pantallas. */
export function FacturacionCabecera({ sede, cifras, entorno }: { sede: string; cifras: CifrasCabecera; entorno: "sandbox" | "produccion" }) {
  const resumen = cifrasDe(cifras);
  return (
    <EncabezadoPagina
      sede={sede}
      titulo="Comprobantes"
      subtitulo="Tus boletas y facturas: búscalas, reenvíalas al cliente o empieza un cambio. Cada venta se declara sola a SUNAT al cobrar."
      detalle={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <EstadoDeFrescura />
          {/* Mientras el sistema está en desarrollo todo va al sandbox de Lucode: que se vea, para que
              nadie crea que una boleta de prueba vale ante SUNAT (y para notar si alguien lo cambia). */}
          {entorno === "sandbox" && (
            <Chip tono="ambar" className="normal-case tracking-normal">
              Pruebas: se envía al sandbox, no a SUNAT
            </Chip>
          )}
        </span>
      }
    >
      {resumen.length > 0 && <ResumenSede sede={sede} cifras={resumen} />}
    </EncabezadoPagina>
  );
}
