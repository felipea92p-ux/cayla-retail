"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SerieComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import { ETIQUETA_TIPO, tipoDocumentoDeCliente } from "@/lib/comprobantes-reglas";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, Segmentado } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

type Ubicacion = { id: string; nombre: string };

// Extraído de `ComprobantesPanel` (ADR-0124) SIN cambiar su lógica: el token de
// idempotencia, la cuenta del IGV y la RPC son los de siempre. Lo dibuja
// `FacturacionShell` una sola vez, para que lo abran la cabecera y los botones de cada
// vista.
//
// Se dibuja SIEMPRE y solo se muestra u oculta (`abierto`), en vez de montarse y
// desmontarse: el token de idempotencia y la última ubicación/tipo elegidos viven en este
// componente, y con el modal montado solo al abrirse cada apertura nacería con un token
// nuevo — reintentar tras un corte de red ya no reusaría el anterior y podría quemar un
// segundo número.
export function EmitirComprobanteModal({
  abierto,
  onCerrar,
  series,
  ubicaciones,
  ubicacionActualId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  series: SerieComprobante[];
  ubicaciones: Ubicacion[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Idempotencia (hueco 1, GRAVE): un mismo token sobrevive reintentos del
  // formulario — si la respuesta se corta después de que el servidor ya
  // reservó el correlativo, reintentar con el mismo token no quema un
  // segundo número. Se renueva solo tras un Emitir exitoso (mismo patrón que
  // PuntoDeVenta.tsx con registrar_venta).
  const tokenEmision = useRef<string>(crypto.randomUUID());

  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId);
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [total, setTotal] = useState(0);
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  // Estado imposible eliminado por diseño: el tipo de documento NO es un estado
  // aparte que pueda contradecir al tipo de comprobante — se deriva de él. Antes,
  // tipear un DNI y luego cambiar a Factura dejaba "factura + dni", y la venta se
  // caía recién al apretar Emitir, con la clienta esperando en el mostrador.
  const clienteTipoDoc = tipoDocumentoDeCliente(tipo, clienteNumDoc);

  // Serie que le toca a la combinación elegida en el modal de emisión. Es
  // derivado puro de props + estado que ya existían: no consulta nada nuevo.
  const serieDelComprobante = series.find((s) => s.ubicacion_id === ubicacionId && s.tipo === tipo);

  // Igual que el `cerrarModal` de antes: limpia lo tipeado y NO la ubicación ni el tipo
  // (la siguiente boleta suele ser de la misma tienda).
  function cerrar() {
    setTotal(0);
    setClienteNumDoc("");
    setClienteNombre("");
    onCerrar();
  }

  async function onEmitir(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    // IGV incluido en el total (19.83% del total = IGV, práctica estándar
    // cuando el precio ya lo incluye) — la desagregación exacta por línea
    // queda para cuando esto se conecte a `ventas` (ver nota al pie).
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const { error } = await supabase.rpc("emitir_comprobante", {
      p_ubicacion_id: ubicacionId,
      p_tipo: tipo,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
      p_token: tokenEmision.current,
    });
    if (error) {
      avisar.error(traducirError(error, "emitir el comprobante"));
      setLoading(false);
      return;
    }
    setLoading(false);
    tokenEmision.current = crypto.randomUUID();
    avisar.exito(`${ETIQUETA_TIPO[tipo]} emitida`, { detalle: "Aparece en la lista; transmítela a SUNAT desde la fila." });
    cerrar();
    router.refresh();
  }

  if (!abierto) return null;

  return (
    <Modal titulo="Emitir comprobante" ancho="max-w-md" onClose={cerrar}>
      {(cerrarAnimado) => (
        <form onSubmit={onEmitir} className="mt-5 space-y-2">
          {/* Ubicación y tipo son las dos decisiones que determinan el correlativo,
              así que van juntas y arriba de él: se leen como los dos diales
              que mueven la cifra de abajo. */}
          <div className="grid gap-x-5 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Ubicación"
              valor={ubicacionId}
              onValor={setUbicacionId}
              opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
            />

            <Segmentado
              etiqueta="Tipo"
              valor={tipo}
              onValor={(t) => {
                setTipo(t);
                setClienteNumDoc("");
                setClienteNombre("");
              }}
              opciones={[
                { valor: "boleta", texto: ETIQUETA_TIPO.boleta },
                { valor: "factura", texto: ETIQUETA_TIPO.factura },
              ] as const}
            />
          </div>

          {/* El número que se va a reservar, antes de reservarlo. Es lo más
              importante del formulario: un correlativo es irreversible y hasta
              ahora solo se veía DESPUÉS de emitir, en la tabla. El dato ya
              llegaba en `series`; lo único que faltaba era mostrarlo.
              La `key` fuerza el remontaje para que la cifra se re-asiente
              cuando cambia la ubicación o el tipo — así el ojo nota que cambió. */}
          <div className="rounded-xl border border-sand bg-papel px-5 py-4">
            <p className="label-cayla text-[11px] text-tinta/65">Se va a reservar el número</p>
            {serieDelComprobante ? (
              <p
                key={`${serieDelComprobante.serie}-${serieDelComprobante.siguiente_numero}`}
                className="font-display anim-asentar mt-1.5 text-[1.75rem] leading-none tabular-nums text-tinta"
              >
                {serieDelComprobante.serie}
                <span className="text-tinta/65">-</span>
                {String(serieDelComprobante.siguiente_numero).padStart(6, "0")}
              </p>
            ) : (
              <p className="anim-asentar mt-1.5 text-xs leading-relaxed text-ambar">
                {ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "Esta ubicación"} todavía no tiene serie
                de {ETIQUETA_TIPO[tipo].toLowerCase()} registrada. Regístrala antes de emitir.
              </p>
            )}
          </div>

          <CampoMonto
            etiqueta="Total (incluye IGV)"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={total || ""}
            onChange={(e) => setTotal(Number(e.target.value))}
          />

          <ConsultaDocumento
            tipo={tipo === "factura" ? "ruc" : "dni"}
            obligatorio={tipo === "factura"}
            numero={clienteNumDoc}
            onNumero={setClienteNumDoc}
            nombre={clienteNombre}
            onNombre={setClienteNombre}
          />

          {/* La nota va acá abajo y no arriba: explica qué pasa DESPUÉS de
              apretar Emitir, así que se lee junto al botón que lo provoca. */}
          <p className="border-l-2 border-ambar/50 pl-3 text-xs leading-relaxed text-tinta/75">
            Esto reserva el número oficial y guarda el comprobante — todavía no lo manda a
            SUNAT. Queda &ldquo;Pendiente de enviar&rdquo; hasta que aprietes
            &ldquo;Transmitir&rdquo; en la lista de abajo, que es lo que lo envía.
          </p>

          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrarAnimado}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
              {loading ? "Emitiendo…" : "Emitir"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
