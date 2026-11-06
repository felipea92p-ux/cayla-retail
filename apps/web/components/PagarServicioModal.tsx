"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MediosDePago } from "@/components/MediosDePago";
import { PROPUESTA_DEL_TALLER, useCuentasParaElegir, useIdDelTaller } from "@/components/finanzas/CampoCuenta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Boton, CampoMonto, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { vencimientoPorDefecto } from "@/lib/insumo-compra-reglas";
import { medioNuevo, mediosParaRpc, type MedioForm } from "@/lib/medios-pago-reglas";
import { numeroDeMonto } from "@/lib/monto-plata-reglas";
import {
  PAPELES_DEL_SERVICIO,
  RPC_PAGAR_SERVICIO,
  argsDelPago,
  camposDelPago,
  problemasDelPago,
  totalDelPago,
  type PapelDelServicio,
} from "@/lib/pagar-servicio-reglas";
import { firmar } from "@/lib/responsable-reglas";
import type { ServicioPorPagar } from "@/lib/servicios-por-pagar-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Pagar a un servicio de afuera (ADR-0614, actividad 4; P-14 y P-17 de Felipe: «una mezcla de papeles», y sin factura se sigue, marcado). Es una hoja
// sencilla a propósito: el Taller se rediseña después, y lo que importa ahora es que la deuda baje con su papel. La base lo exige todo otra vez.
export function PagarServicioModal({ servicio: s, hoy, onClose }: { servicio: ServicioPorPagar & { proveedor: string }; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const [token] = useState(() => crypto.randomUUID());
  const [monto, setMonto] = useState(s.falta.toFixed(2));
  const [papel, setPapel] = useState<PapelDelServicio>("sin_comprobante");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [emision, setEmision] = useState(hoy);
  const [yaPagado, setYaPagado] = useState(true);
  const [vence, setVence] = useState(vencimientoPorDefecto(hoy, null));
  const [medios, setMedios] = useState<MedioForm[]>([medioNuevo("transferencia", s.falta.toFixed(2))]);
  const [cargando, setCargando] = useState(false);
  const responsable = useResponsable();
  const taller = useIdDelTaller();
  const cuentas = useCuentasParaElegir("pago", taller.id, taller.listo, { propuestaSoloDe: PROPUESTA_DEL_TALLER });

  const montoLeido = numeroDeMonto(monto);
  const { igv, total } = totalDelPago(Number.isFinite(montoLeido) ? montoLeido : 0, papel);
  const mediosLeidos = mediosParaRpc(medios, emision, cuentas.cuentas);
  const pago = { monto: montoLeido, falta: s.falta, papel, serie, numero, emision, hoy, yaPagado, vence, medios: mediosLeidos };
  const problemas = problemasDelPago(pago);
  const faltan = problemas.map((p) => p.campo);
  const guia = useGuiaCampos(camposDelPago(faltan, responsable.listo));
  const listo = problemas.length === 0 && responsable.listo;
  const conPapel = papel !== "sin_comprobante";

  // Cambiar el monto o el papel mueve el total: un solo medio lo sigue; con varios, la persona decide cómo repartirlo.
  function conTotal(nuevoMonto: string, nuevoPapel: PapelDelServicio) {
    const leido = numeroDeMonto(nuevoMonto);
    if (medios.length === 1 && Number.isFinite(leido)) setMedios([{ ...medios[0], monto: totalDelPago(leido, nuevoPapel).total.toFixed(2) }]);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || cargando) return;
    setCargando(true);
    const { error } = await firmar(createClient().rpc(RPC_PAGAR_SERVICIO as never, argsDelPago(pago, { faseId: s.faseId, token }) as never), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el pago", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(yaPagado ? `${soles(total)} pagados a ${s.proveedor}` : `${soles(total)} por pagar a ${s.proveedor}`, { detalle: `${s.numeroTexto} · ${s.fase}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={`Pagar a ${s.proveedor}`} subtitulo={`${s.numeroTexto} · ${s.producto} · ${s.fase}`} tamano="mediana" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-4">
        <CampoGuiado id="monto" guia={guia}>
          <CampoMonto
            etiqueta={guia.etiqueta("monto", "Cuánto, sin IGV")}
            value={monto}
            inputMode="decimal"
            onChange={(e) => {
              setMonto(e.target.value);
              conTotal(e.target.value, papel);
            }}
            pie={`Se le deben ${soles(s.falta)} sin IGV.`}
          />
        </CampoGuiado>

        <CampoGuiado id="papel" guia={guia}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoSelect
                etiqueta={guia.etiqueta("papel", "El papel que te dio")}
                valor={papel}
                onValor={(v) => {
                  setPapel(v);
                  conTotal(monto, v);
                }}
                opciones={PAPELES_DEL_SERVICIO}
              />
              <CampoFecha etiqueta="Fecha" valor={emision} onValor={setEmision} caja />
            </div>
            {conPapel ? (
              <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <CampoTexto etiqueta="Serie" mono value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={20} autoComplete="off" />
                <CampoTexto etiqueta="Número" mono value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={20} autoComplete="off" />
              </div>
            ) : (
              <p className="text-sm text-tinta/65">Queda marcado sin papel: no da IGV y no se puede usar como gasto ante SUNAT.</p>
            )}
            {igv > 0 && (
              <p className="text-sm text-tinta/65">
                Con IGV de {soles(igv)}, el total es <b className="font-semibold text-tinta">{soles(total)}</b>.
              </p>
            )}
          </div>
        </CampoGuiado>

        <CampoGuiado id="pago" guia={guia}>
          <div className="space-y-3">
            <Segmentado
              etiqueta={guia.etiqueta("pago", "¿Ya lo pagaste?")}
              valor={yaPagado ? "si" : "no"}
              onValor={(v) => setYaPagado(v === "si")}
              opciones={[
                { valor: "si", texto: "Ya lo pagué" },
                { valor: "no", texto: "Queda por pagar" },
              ]}
            />
            {yaPagado ? (
              <MediosDePago medios={medios} onCambio={setMedios} esperado={total} totalComprobante={total} exacto etiquetaEsperado="Total a pagar" cuentas={{ lista: cuentas.cuentas, listo: cuentas.listo, falla: cuentas.falla, reintentar: cuentas.reintentar }} />
            ) : (
              <CampoFecha etiqueta="Vence" valor={vence} onValor={setVence} caja />
            )}
          </div>
        </CampoGuiado>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        </CampoGuiado>

        <PieGuia guia={guia} listo="Todo listo para registrar el pago." />
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Registrando…" disabled={!listo}>
            {yaPagado ? `Pagar ${soles(total)}` : `Dejar ${soles(total)} por pagar`}
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
