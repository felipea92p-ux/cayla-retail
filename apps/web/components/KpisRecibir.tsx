"use client";

import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { soles } from "@/lib/compras-reglas";
import { EVENTO_MARCAR } from "@/lib/envio-reglas";

// Los cuatro indicadores de Recibir mercadería (ADR-0111), ahora DEBAJO de «¿Qué llegó?»: son lo que se mira
// cuando todavía no hay nada marcado —¿cuánto falta llegar?, ¿qué ya debió llegar?— y desaparecen apenas se
// marca un comprobante, para que quien cuenta tenga toda la pantalla (Felipe, 2026-09-18). Se arma en el
// servidor y llega al formulario como un nodo.
//
// Spike de Recibir (2026-09-19): las cifras cuentan hasta su valor al aparecer, las tarjetas entran escalonadas, el
// punto de «Atrasadas» late, y «La más atrasada» es un ATAJO: un clic marca ese comprobante en la lista de al lado.
// Desde el 2026-10-06 (ADR-0358) las que solo informan ya no se alzan al pasar el mouse (no llevan a ningún lado), y el
// atajo se dibuja como la cifra que «lleva»: la flecha la pone TarjetaCifra. Como este nodo no comparte estado con `RecepcionEnvio`, se lo avisa por un
// evento de ventana (`EVENTO_MARCAR`).
//
// `valorPorRecibir` es `null` para quien cuenta sin ver dinero (un colaborador): la cifra en soles es del líder.
export function KpisRecibir({
  porRecibir,
  unidadesPendientes,
  atrasadas,
  diasMasAtrasada,
  proveedorMasAtrasado,
  documentoMasAtrasada,
  idMasAtrasada,
  valorPorRecibir,
}: {
  porRecibir: number;
  unidadesPendientes: number;
  atrasadas: number;
  diasMasAtrasada: number | null;
  proveedorMasAtrasado: string | null;
  documentoMasAtrasada: string | null;
  /** El comprobante más atrasado, para poder marcarlo de un clic. `null` = no se encontró en esta página. */
  idMasAtrasada?: string | null;
  valorPorRecibir: number | null;
}) {
  const sinAtraso = atrasadas === 0;
  const estilo = (i: number) => ({ "--i": i }) as React.CSSProperties;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <TarjetaCifra
        className="anim-entra"
        style={estilo(0)}
        punto={porRecibir > 0 ? "ambar" : "verde"}
        etiqueta="Por recibir"
        valor={<CifraQueCuenta valor={porRecibir} alMontar />}
        unidad={porRecibir === 1 ? "comprobante" : "comprobantes"}
      >
        {porRecibir === 0 ? "Nada por recibir" : valorPorRecibir != null ? `${soles(valorPorRecibir)} en mercadería por llegar` : "con mercadería por llegar"}
      </TarjetaCifra>
      <TarjetaCifra className="anim-entra" style={estilo(1)} punto="neutro" etiqueta="Unidades pendientes" valor={<CifraQueCuenta valor={unidadesPendientes} alMontar />}>
        {unidadesPendientes > 0 ? "por llegar en estos comprobantes" : "Todo lo facturado ya llegó"}
      </TarjetaCifra>
      <TarjetaCifra
        className="anim-entra"
        style={estilo(2)}
        punto={sinAtraso ? "verde" : "ambar"}
        vivo={!sinAtraso}
        tono={sinAtraso ? undefined : "text-ambar-profundo"}
        detalleTono={sinAtraso ? undefined : "text-ambar-profundo"}
        etiqueta="Atrasadas"
        valor={<CifraQueCuenta valor={atrasadas} alMontar />}
      >
        {sinAtraso ? "Nada atrasado" : "Esperadas antes de hoy · recibir o reclamar"}
      </TarjetaCifra>
      {diasMasAtrasada != null && diasMasAtrasada > 0 ? (
        <TarjetaCifra
          className="anim-entra"
          style={estilo(3)}
          punto="ambar"
          tono="text-ambar-profundo"
          detalleTono="text-ambar-profundo"
          etiqueta="La más atrasada"
          valor={<CifraQueCuenta valor={diasMasAtrasada} formato="dias" alMontar />}
          onClick={idMasAtrasada ? () => window.dispatchEvent(new CustomEvent(EVENTO_MARCAR, { detail: idMasAtrasada })) : undefined}
        >
          {proveedorMasAtrasado} · {documentoMasAtrasada}
        </TarjetaCifra>
      ) : (
        <TarjetaCifra className="anim-entra" style={estilo(3)} etiqueta="La más atrasada" valor={null}>
          Nada atrasado
        </TarjetaCifra>
      )}
    </div>
  );
}
