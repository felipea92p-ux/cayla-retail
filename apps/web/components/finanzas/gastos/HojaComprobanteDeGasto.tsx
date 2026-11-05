"use client";

// «Llegó el comprobante» (ADR-0588): un gasto pagado sin comprobante recibe su boleta, factura o recibo por honorarios. Se abre en el lugar de la hoja
// del gasto y vuelve a ella con la flecha. Las piezas son las de «Registrar gasto» (el RUC con el padrón, la serie y el número, la fecha), y «Lo que pasa»
// dice que no se paga otra vez. Un RUC nuevo se suma al directorio con `registrar_proveedor_de_gasto`, como al registrar. Las reglas, en
// `lib/gastos-comprobante-tardio-reglas.ts`.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { soloDigitos, validarRuc } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Volver } from "@/components/ui/Volver";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { EscanerBusqueda } from "@/components/EscanerBusqueda";
import { LeerQrComprobante } from "@/components/finanzas/gastos/LeerQrComprobante";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { sugerirSerie } from "@/lib/sugerencias-hoja-gasto";
import { proveedorDelRuc, serieNumeroLegible } from "@/lib/hoja-gasto-reglas";
import type { GastoFila, ProveedorGasto } from "@/lib/gastos-reglas";
import { leerQrComprobante, serieNumeroDelQr, type QrComprobante } from "@/lib/qr-comprobante-reglas";
import {
  PAPELES_TARDIOS,
  RPC_AGREGAR_COMPROBANTE,
  borradorInicial,
  camposDelComprobante,
  loQuePasaAlGuardar,
  payloadDelComprobante,
  problemaDelComprobante,
  type BorradorComprobante,
} from "@/lib/gastos-comprobante-tardio-reglas";

export function HojaComprobanteDeGasto({
  gasto: g,
  proveedores,
  hoy,
  rucEmpresa,
  onVolver,
  onCerrar,
}: {
  gasto: GastoFila;
  proveedores: ProveedorGasto[];
  hoy: string;
  /** El RUC de CAYLA, para avisar si el QR dice que la factura está a nombre de otro. */
  rucEmpresa: string | null;
  /** Vuelve a la hoja del gasto sin guardar. */
  onVolver: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [b, setB] = useState<BorradorComprobante>(() => borradorInicial(g));
  const [guardando, setGuardando] = useState(false);
  const [qr, setQr] = useState<QrComprobante | null>(null);
  const [camara, setCamara] = useState(false);
  const poner = <K extends keyof BorradorComprobante>(k: K, v: BorradorComprobante[K]) => setB((x) => ({ ...x, [k]: v }));
  const existente = proveedorDelRuc(b.ruc, proveedores);
  const proveedorListo = Boolean(existente) || (validarRuc(b.ruc).valido && b.razonSocial.trim().length > 1);
  const problema = problemaDelComprobante(b, { proveedorListo, hoy, monto: g.montoTotal });
  const guia = useGuiaCampos(camposDelComprobante(b, { proveedorListo, hoy }, { listo: responsable.listo, motivo: responsable.motivo }));
  const pasa = loQuePasaAlGuardar(g, b);

  /** Lo leído llena la hoja. El IGV del papel se usa solo si su total es el del gasto (si no, es otro papel: lo avisa y se queda el de la tasa). */
  function aplicarQr(leido: QrComprobante) {
    setQr(leido);
    setB((x) => ({
      ...x,
      tipo: leido.tipo,
      ruc: leido.rucEmisor,
      serieNumero: serieNumeroDelQr(leido),
      fecha: leido.fecha,
      igv: leido.tipo === "factura" && Math.abs(leido.total - g.montoTotal) < 0.01 ? leido.igv : null,
    }));
  }

  async function guardar() {
    if (problema) return avisar.error(problema);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    // Un RUC que no está en el directorio se suma antes (la base no duplica por RUC: si ya existía, devuelve el mismo).
    let proveedorId = existente?.id ?? "";
    if (!proveedorId) {
      const { data, error } = await createClient().rpc("registrar_proveedor_de_gasto" as never, { p_nombre: b.razonSocial.trim(), p_ruc: soloDigitos(b.ruc) } as never);
      if (error) {
        setGuardando(false);
        return avisar.error(traducirError(error, "sumar el proveedor"));
      }
      proveedorId = String(data);
    }
    const { error } = await firmar(createClient().rpc(RPC_AGREGAR_COMPROBANTE as never, payloadDelComprobante(g.id, b, proveedorId) as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "agregar el comprobante"));
    avisar.exito("Comprobante agregado", { detalle: `${g.descripcion} ya no cuenta como «Sin comprobante».` });
    onCerrar();
    router.refresh();
  }

  // La cámara va EN LUGAR de la hoja (nunca una hoja sobre otra); lo escrito se queda, porque esta pieza sigue montada.
  if (camara) {
    return (
      <EscanerBusqueda
        titulo="Leer el QR del comprobante"
        pista="Centra el QR de la factura o la boleta en el cuadro"
        onCodigo={(codigo) => {
          const leido = leerQrComprobante(codigo);
          setCamara(false);
          if (leido) aplicarQr(leido);
          else avisar.error("Ese no es el QR de una factura o boleta electrónica.");
        }}
        onEscribir={() => setCamara(false)}
        onClose={() => setCamara(false)}
      />
    );
  }

  return (
    <Modal
      variante="hoja"
      titulo="Llegó el comprobante"
      subtitulo={`${g.descripcion} · ${soles(g.montoTotal)}. Se pagó sin comprobante: agrégale el que trajeron, sin pagarlo otra vez.`}
      onClose={onCerrar}
      tamano="mediana"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <LeerQrComprobante leido={qr} monto={g.montoTotal} rucEmpresa={rucEmpresa} onLeido={aplicarQr} onCamara={() => setCamara(true)} />

        <CampoGuiado id="tipo" guia={guia} titulo="¿Qué llegó?">
          <div className="hoja-gasto-opciones" role="radiogroup" aria-label="Qué comprobante llegó">
            {PAPELES_TARDIOS.map((c) => (
              <button
                key={c.valor}
                type="button"
                role="radio"
                aria-checked={b.tipo === c.valor}
                className="pildora-cayla"
                data-activa={b.tipo === c.valor ? "true" : undefined}
                onClick={() => poner("tipo", c.valor)}
              >
                {c.texto}
              </button>
            ))}
          </div>
        </CampoGuiado>

        <CampoGuiado id="ruc" guia={guia}>
          <ConsultaDocumento
            tipo="ruc"
            obligatorio
            numero={b.ruc}
            onNumero={(v) => poner("ruc", v)}
            nombre={b.razonSocial}
            onNombre={(v) => poner("razonSocial", v)}
            contador
            conocido={existente ? { nombre: existente.nombre, origen: "Ya está en tus proveedores" } : null}
          />
        </CampoGuiado>

        <div className="grid gap-x-3 sm:grid-cols-2">
          <CampoGuiado id="serie" guia={guia} titulo="Serie y número">
            <CampoTexto
              etiqueta="Serie y número"
              caja
              value={b.serieNumero}
              onChange={(e) => poner("serieNumero", e.target.value)}
              onBlur={() => {
                const legible = serieNumeroLegible(b.serieNumero);
                if (legible) poner("serieNumero", legible);
              }}
              placeholder={sugerirSerie(b.tipo)}
              pie={b.serieNumero && !serieNumeroLegible(b.serieNumero) ? "Escríbela como F001-2231 (la letra, tres números, un guion y el número)." : undefined}
              tono={b.serieNumero && !serieNumeroLegible(b.serieNumero) ? "aviso" : undefined}
            />
          </CampoGuiado>
          <CampoGuiado id="fecha" guia={guia}>
            <CampoFecha etiqueta="Fecha del comprobante" valor={b.fecha} onValor={(v) => poner("fecha", v)} />
          </CampoGuiado>
        </div>

        <div className="mb-3 rounded-[12px] bg-hueso px-3 py-2 text-sm">
          <span className="campo-etiqueta">Lo que pasa al guardar</span>
          <ul className="mt-1 space-y-0.5 text-tinta">
            {pasa.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>

        <CampoGuiado id="responsable" guia={guia} titulo="Responsable">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <PieGuia guia={guia} listo="Todo listo para agregarlo." />
        <div className="pie-acciones pie-hoja-fijo mt-4">
          <Volver onClick={onVolver} a="Volver al gasto" />
          <Boton peso="primario" type="submit" cargando={guardando} disabled={guardando || Boolean(problema) || !responsable.listo} className="ml-auto">
            Agregar comprobante
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
