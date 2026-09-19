import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/compras-reglas";

// Los cuatro indicadores de Recibir mercadería (ADR-0111), ahora DEBAJO de «¿Qué llegó?»: son lo que se mira
// cuando todavía no hay nada marcado —¿cuánto falta llegar?, ¿qué ya debió llegar?— y desaparecen apenas se
// marca un comprobante, para que quien cuenta tenga toda la pantalla (Felipe, 2026-09-18). Se arma en el
// servidor y llega al formulario como un nodo: no hay estado ni eventos acá.
//
// `valorPorRecibir` es `null` para quien cuenta sin ver dinero (un colaborador): la cifra en soles es del líder.
export function KpisRecibir({
  porRecibir,
  unidadesPendientes,
  atrasadas,
  diasMasAtrasada,
  proveedorMasAtrasado,
  documentoMasAtrasada,
  valorPorRecibir,
}: {
  porRecibir: number;
  unidadesPendientes: number;
  atrasadas: number;
  diasMasAtrasada: number | null;
  proveedorMasAtrasado: string | null;
  documentoMasAtrasada: string | null;
  valorPorRecibir: number | null;
}) {
  const sinAtraso = atrasadas === 0;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <TarjetaCifra
        compacta
        punto={porRecibir > 0 ? "ambar" : "verde"}
        etiqueta="Por recibir"
        valor={porRecibir.toLocaleString("es-PE")}
        unidad={porRecibir === 1 ? "comprobante" : "comprobantes"}
      >
        {porRecibir === 0 ? "Nada por recibir" : valorPorRecibir != null ? `${soles(valorPorRecibir)} en mercadería por llegar` : "con mercadería por llegar"}
      </TarjetaCifra>
      <TarjetaCifra compacta punto="neutro" etiqueta="Unidades pendientes" valor={unidadesPendientes.toLocaleString("es-PE")}>
        {unidadesPendientes > 0 ? "por llegar en estos comprobantes" : "Todo lo facturado ya llegó"}
      </TarjetaCifra>
      <TarjetaCifra
        compacta
        punto={sinAtraso ? "verde" : "ambar"}
        tono={sinAtraso ? undefined : "text-ambar-profundo"}
        detalleTono={sinAtraso ? undefined : "text-ambar-profundo"}
        etiqueta="Atrasadas"
        valor={atrasadas.toLocaleString("es-PE")}
      >
        {sinAtraso ? "Nada atrasado" : "Esperadas antes de hoy · recibir o reclamar"}
      </TarjetaCifra>
      {diasMasAtrasada != null && diasMasAtrasada > 0 ? (
        <TarjetaCifra
          compacta
          punto="ambar"
          tono="text-ambar-profundo"
          detalleTono="text-ambar-profundo"
          etiqueta="La más atrasada"
          valor={`${diasMasAtrasada} ${diasMasAtrasada === 1 ? "día" : "días"}`}
        >
          {proveedorMasAtrasado} · {documentoMasAtrasada}
        </TarjetaCifra>
      ) : (
        <TarjetaCifra compacta vacia etiqueta="La más atrasada" valor="—">
          Nada atrasado
        </TarjetaCifra>
      )}
    </div>
  );
}
