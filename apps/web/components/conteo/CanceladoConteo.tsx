import { textoLugar, type DetalleConteo } from "@/lib/conteo-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Chip } from "@/components/ui/Chip";
import { Volver } from "@/components/ui/Volver";

/* ====================================================================
   CanceladoConteo · «Conteo cancelado» (Inventario ▸ Conteo, rediseño 2026-09-29)

   Lo mínimo, a propósito: un conteo cancelado se tiró entero y no cambió ninguna existencia, así que no hay cifras que
   mostrar ni nada que hacer desde aquí. Lo lee así también un conteo cerrado SIN ninguna variante verificada (los que
   se cerraron vacíos antes del rediseño): cerrar sin verificar nada no midió nada, y no cuenta para ninguna métrica.

   Sin tarjetas de cifras y sin barra de pasos. Server Component; la vuelta dice adónde lleva (`Volver`, ADR-0220).
   ==================================================================== */
export function CanceladoConteo({ detalle, sede, volverA }: { detalle: DetalleConteo; sede: string; volverA: string | null }) {
  const { conteo } = detalle;
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo="Conteo cancelado"
        subtitulo={`Conteo ${conteo.numero} · ${textoLugar(conteo)}`}
        volver={volverA ? <Volver href={volverA} a="Movimientos" /> : <Volver href="/inventario/conteo" a="Conteo" />}
        pie={
          <Chip tono="apagado" tachado={false}>
            Cancelado
          </Chip>
        }
      />
      <p className="nota-cayla">Este conteo se canceló: no cambió ninguna existencia.</p>
    </div>
  );
}
