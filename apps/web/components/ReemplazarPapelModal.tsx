"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { soles } from "@/lib/compras-reglas";
import type { ComprobanteProduccion } from "@/lib/comprobantes-produccion-reglas";
import { traducirError } from "@/lib/error-escritura";
import { numeroDeMonto } from "@/lib/monto-plata-reglas";
import { PAPELES_REALES, RPC_REEMPLAZAR_PAPEL, problemasDelPapel, topeDeFactura, type PapelReal } from "@/lib/regularizar-insumos-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// El papel real de una compra que se registró sin él (ADR-0614, actividad 6). Cambia el tipo, la serie, el número y el total; las líneas, los pagos y los lotes siguen siendo
// los mismos. Una sola decisión por campo: se muestra lo que falta sobre el botón.
export function ReemplazarPapelModal({ comprobante: c, hoy, onClose }: { comprobante: ComprobanteProduccion; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<PapelReal>("factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [total, setTotal] = useState(topeDeFactura(c.subtotal).toFixed(2));
  const [cargando, setCargando] = useState(false);
  const responsable = useResponsable();
  const totalLeido = numeroDeMonto(total);
  const problemas = problemasDelPapel({ tipo, serie, numero, fecha, hoy, total: totalLeido, subtotal: c.subtotal, pagado: c.pagado });
  const listo = problemas.length === 0 && responsable.listo;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || cargando) return;
    setCargando(true);
    const { error } = await firmar(
      createClient().rpc(RPC_REEMPLAZAR_PAPEL as never, { p_comprobante_id: c.id, p_tipo: tipo, p_serie: serie.trim(), p_numero: numero.trim(), p_fecha_emision: fecha, p_total: tipo === "factura" ? totalLeido : undefined } as never),
      responsable.firma(),
    );
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar el papel"));
      return;
    }
    avisar.exito(`Papel registrado: ${serie.trim()}-${numero.trim()}`, { detalle: c.proveedor });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Llegó el papel" subtitulo={`${c.proveedor} · ${soles(c.subtotal)} sin IGV`} tamano="mediana" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSelect etiqueta="Qué papel es" valor={tipo} onValor={(v) => setTipo(v)} opciones={PAPELES_REALES} />
          <CampoFecha etiqueta="Fecha" valor={fecha} onValor={setFecha} caja />
        </div>
        <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <CampoTexto etiqueta="Serie" mono value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={20} autoComplete="off" />
          <CampoTexto etiqueta="Número" mono value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={20} autoComplete="off" />
        </div>
        {tipo === "factura" ? (
          <CampoMonto etiqueta="Total del papel, con IGV" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} pie={`Las líneas suman ${soles(c.subtotal)}; con IGV, hasta ${soles(topeDeFactura(c.subtotal))}.`} />
        ) : (
          <p className="text-sm text-tinta/65">El total sigue siendo {soles(c.subtotal)}: este papel no lleva IGV.</p>
        )}
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        {problemas.length > 0 && (
          <Aviso tono="atencion" chico>
            {problemas[0]}
          </Aviso>
        )}
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} disabled={!listo}>
            Guardar el papel
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
