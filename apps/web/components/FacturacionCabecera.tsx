"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FileText, Plus, Search, Send, X } from "lucide-react";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede, type CifraResumen } from "@/components/ui/ResumenSede";
import { pestanaDeRuta, SEGUNDOS_VISTA_FRESCA, textoDeFrescura, type ClavePestana } from "@/lib/facturacion-reglas";
import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { useUltimaCarga } from "@/lib/ultima-carga-facturacion";

// Cabecera de Facturación: la misma de Cambios, Devoluciones, Caja e Historial (`EncabezadoPagina`),
// con la línea viva (desde cuándo está lo que se ve) en la línea de arriba, las dos acciones globales
// bajo la frase y las cifras de Facturación a la derecha. La caja de búsqueda vive con las pestañas
// (`CajaDeBusqueda`, en el shell), como la barra de filtros de Historial.

const PISTA_DE_BUSQUEDA: Record<ClavePestana, string> = {
  resumen: "Buscar venta, cliente o boleta…",
  proformas: "Buscar cliente…",
  comprobantes: "Buscar número, cliente o RUC…",
  descuentos: "Buscar código o sede…",
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

  return (
    <label className="vidrio-cayla flex h-9 w-full items-center gap-2 rounded-[10px] px-3 text-[13px] text-tinta transition-shadow duration-200 focus-within:outline focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rojo/60 sm:ml-auto sm:w-64">
      <Search aria-hidden strokeWidth={1.75} className="h-[15px] w-[15px] shrink-0 text-tinta/65" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={pista}
        aria-label="Buscar en esta vista"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tinta/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          aria-label="Borrar la búsqueda"
          className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-tinta/65 outline-none transition-colors duration-200 hover:bg-tinta/10 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-rojo/60"
        >
          <X aria-hidden strokeWidth={1.75} className="h-[14px] w-[14px]" />
        </button>
      )}
    </label>
  );
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
export function FacturacionCabecera({ sede, cifras }: { sede: string; cifras: CifrasCabecera }) {
  const { abrirEmitir, abrirProforma } = useFacturacionAcciones();
  const resumen = cifrasDe(cifras);
  return (
    <EncabezadoPagina
      sede={sede}
      titulo="Facturación"
      subtitulo="Emite y sigue tus comprobantes hasta que SUNAT los acepta."
      detalle={<EstadoDeFrescura />}
      pie={
        <>
          <BotonCompacto variante="vidrio" icono={<FileText aria-hidden strokeWidth={1.75} />} onClick={abrirEmitir}>
            Emitir comprobante
          </BotonCompacto>
          <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={abrirProforma}>
            Nueva proforma
          </BotonCompacto>
        </>
      }
    >
      {resumen.length > 0 && <ResumenSede sede={sede} cifras={resumen} />}
    </EncabezadoPagina>
  );
}
