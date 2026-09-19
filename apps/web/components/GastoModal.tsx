"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import {
  MEDIOS_PAGO,
  TIPOS_COMPROBANTE,
  exigeNumero,
  leerMonto,
  permiteIgv,
  validarBorrador,
  type MedioPago,
  type TipoComprobante,
} from "@/lib/gastos-reglas";
import type { CajaAbiertaGasto, CategoriaGasto, EgresoSinClasificar } from "@/lib/gastos";

// Registrar un gasto (ADR-0117). Un solo formulario para los tres caminos:
//   A. pagado sin caja (transferencia, Yape, Plin, tarjeta)
//   B. efectivo que sale de una caja ABIERTA (la RPC crea el egreso y el gasto juntos)
//   C. clasificar un egreso que una encargada ya registró (`egreso`: no se crea movimiento de caja)
// El formulario no decide qué camino es: lo deduce del medio de pago y de si viene un `egreso`.
// La autoridad son la RPC y la base; las validaciones de aquí solo evitan el viaje de ida y vuelta.

const EMPRESA = "empresa";
const SIN_ELEGIR = "";

type Props = {
  categorias: CategoriaGasto[];
  sedes: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  cajasAbiertas: CajaAbiertaGasto[];
  /** `aaaa-mm-dd` de hoy en Lima (viene del servidor: el navegador podría tener otra zona). */
  hoy: string;
  /** Camino C: el egreso de caja que se está clasificando. */
  egreso?: EgresoSinClasificar;
  onClose: () => void;
};

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export function GastoModal({ categorias, sedes, proveedores, cajasAbiertas, hoy, egreso, onClose }: Props) {
  const router = useRouter();
  // Un token por apertura del formulario: si la red falla y se reintenta, el servidor reconoce
  // que es el MISMO gasto y no lo duplica (mismo patrón que `registrar_venta`).
  const [token] = useState(() => crypto.randomUUID());

  const [ubicacion, setUbicacion] = useState<string>(egreso ? egreso.ubicacionId : SIN_ELEGIR);
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState(egreso ? egreso.motivo : "");
  const [fecha, setFecha] = useState(egreso ? fechaLima(egreso.creadoEn) : hoy);
  const [monto, setMonto] = useState(egreso ? String(egreso.monto) : "");
  const [comprobante, setComprobante] = useState<TipoComprobante>("boleta");
  const [numero, setNumero] = useState("");
  const [igv, setIgv] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [medio, setMedio] = useState<MedioPago>(egreso ? "efectivo" : "transferencia");
  const [cajaId, setCajaId] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Efectivo desde caja: solo las cajas de la sede elegida (una sede no paga con el cajón de otra);
  // si el gasto es «de la empresa», cualquier caja abierta sirve.
  const cajasPosibles = useMemo(
    () => (ubicacion === EMPRESA || ubicacion === SIN_ELEGIR ? cajasAbiertas : cajasAbiertas.filter((c) => c.ubicacionId === ubicacion)),
    [cajasAbiertas, ubicacion],
  );
  const cajaElegida = cajasPosibles.some((c) => c.id === cajaId) ? cajaId : cajasPosibles.length === 1 ? cajasPosibles[0].id : "";
  const pideCaja = !egreso && medio === "efectivo";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (ubicacion === SIN_ELEGIR) {
      avisar.error("Elige de qué sede es el gasto, o «De la empresa».", { enfocar: "gasto-ubicacion" });
      return;
    }
    const error = validarBorrador(
      {
        categoria,
        descripcion,
        fecha,
        monto,
        igv,
        comprobanteTipo: comprobante,
        comprobanteNumero: numero,
        medioPago: medio,
        cajaId: pideCaja ? cajaElegida || null : null,
        cajaMovimientoId: egreso?.id ?? null,
      },
      hoy,
    );
    if (error) {
      avisar.error(error.mensaje, { enfocar: error.campo });
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { error: fallo } = await supabase.rpc("registrar_gasto", {
      // null = «de la empresa». El tipo generado no distingue null en argumentos obligatorios.
      p_ubicacion_id: (ubicacion === EMPRESA ? null : ubicacion) as string,
      p_categoria: categoria,
      p_descripcion: descripcion.trim(),
      p_fecha: fecha,
      p_monto_total: leerMonto(monto) ?? 0,
      p_comprobante_tipo: comprobante,
      p_medio_pago: medio,
      p_igv: permiteIgv(comprobante) ? (leerMonto(igv) ?? 0) : 0,
      p_comprobante_numero: numero.trim() || undefined,
      p_proveedor_id: proveedorId || undefined,
      p_caja_id: pideCaja ? cajaElegida : undefined,
      p_caja_movimiento_id: egreso?.id,
      p_token: token,
    });
    setGuardando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, "registrar el gasto"));
      return;
    }
    avisar.exito("Gasto registrado", { detalle: `${soles(leerMonto(monto) ?? 0)} · ${categorias.find((c) => c.codigo === categoria)?.nombre ?? ""}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo={egreso ? "Clasificar egreso de caja" : "Registrar gasto"}
      subtitulo={egreso ? `${egreso.ubicacionNombre} · ${soles(egreso.monto)} ya salió de la caja` : "Se registra el día que se pagó"}
      onClose={onClose}
      ancho="max-w-md"
    >
      {(cerrar) => (
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="gasto-ubicacion">
              ¿De quién es el gasto?
            </label>
            <select id="gasto-ubicacion" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className={campoSelect}>
              {!egreso && <option value={SIN_ELEGIR}>Elige…</option>}
              {sedes
                .filter((s) => !egreso || s.id === egreso.ubicacionId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              <option value={EMPRESA}>De la empresa (oficina, contador, software)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="gasto-categoria">
              Categoría
            </label>
            <select id="gasto-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campoSelect}>
              <option value="">Elige…</option>
              {categorias.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="gasto-descripcion">
              ¿En qué se gastó?
            </label>
            <input id="gasto-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Alquiler de la oficina, setiembre" className={campoTexto} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="gasto-monto">
                Monto total (S/)
              </label>
              <input
                id="gasto-monto"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                readOnly={!!egreso}
                className={`${campoTexto} ${egreso ? "text-tinta/60" : ""}`}
              />
              {egreso && <p className="text-[11px] text-tinta/55">Es el monto que salió de la caja: no se cambia aquí.</p>}
            </div>
            <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={setFecha} id="gasto-fecha" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="gasto-comprobante">
                Comprobante
              </label>
              <select id="gasto-comprobante" value={comprobante} onChange={(e) => setComprobante(e.target.value as TipoComprobante)} className={campoSelect}>
                {TIPOS_COMPROBANTE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            {comprobante !== "sin_comprobante" && (
              <div className="space-y-1.5">
                <label className={campoEtiqueta} htmlFor="gasto-numero">
                  Número{exigeNumero(comprobante) ? "" : " (opcional)"}
                </label>
                <input id="gasto-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="F001-123" className={campoTexto} />
              </div>
            )}
          </div>

          {permiteIgv(comprobante) && (
            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="gasto-igv">
                IGV de la factura (S/)
              </label>
              <input id="gasto-igv" inputMode="decimal" value={igv} onChange={(e) => setIgv(e.target.value)} placeholder="0.00" className={campoTexto} />
              <p className="text-[11px] text-tinta/55">Es el crédito fiscal que se declara. Solo las facturas lo llevan.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="gasto-proveedor">
              Proveedor (opcional)
            </label>
            <select id="gasto-proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={campoSelect}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {egreso ? (
            <p className="rounded-md bg-tinta/[0.04] px-3 py-2 text-xs text-tinta/70">Pagado en efectivo, desde la caja de {egreso.ubicacionNombre}. Aquí no se toca la caja: solo se dice en qué se gastó.</p>
          ) : (
            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="gasto-medio">
                ¿Cómo se pagó?
              </label>
              <select id="gasto-medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)} className={campoSelect}>
                {MEDIOS_PAGO.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
              {pideCaja &&
                (cajasPosibles.length === 0 ? (
                  <p id="gasto-caja" className="text-xs text-rojo-profundo">
                    No hay ninguna caja abierta{ubicacion !== EMPRESA && ubicacion !== SIN_ELEGIR ? " en esa sede" : ""}. Si la plata ya salió de una caja, clasifica ese egreso desde la lista «Egresos sin clasificar»; si no, elige otro medio de pago.
                  </p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    <label className={campoEtiqueta} htmlFor="gasto-caja">
                      ¿De qué caja sale el efectivo?
                    </label>
                    <select id="gasto-caja" value={cajaElegida} onChange={(e) => setCajaId(e.target.value)} className={campoSelect}>
                      {cajasPosibles.length > 1 && <option value="">Elige…</option>}
                      {cajasPosibles.map((c) => (
                        <option key={c.id} value={c.id}>
                          Caja de {c.ubicacionNombre}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-tinta/55">Se anota también como egreso de esa caja, para que el cierre cuadre.</p>
                  </div>
                ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={botonPrimario}>
              {guardando ? "Guardando…" : "Registrar gasto"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
