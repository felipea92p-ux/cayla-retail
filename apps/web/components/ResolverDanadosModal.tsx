"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto, CampoMonto, CampoSelect } from "@/components/ui/campos";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import type { PrendaDanada } from "@/lib/inventario-v2";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  argumentosDeArreglo,
  argumentosDeDevolucion,
  camposGuiaArreglo,
  camposGuiaDevolucion,
  interpretarErrorDeDanada,
  leerRespuestaDanada,
  MAX_TEXTO_DANADA,
  quePasaAlArreglar,
  quePasaAlDevolver,
  RPC_ARREGLAR_DANADA,
  RPC_DEVOLVER_DANADA,
  TEXTO_ARREGLO_YA_ESTABA,
  TEXTO_DEVOLUCION_YA_ESTABA,
  textoErrorDeResolucion,
  textoOrigenDanada,
  tituloExitoArreglo,
  tituloExitoDevolucion,
} from "@/lib/danadas-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Check } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

// "Dañado" (2026-09-17, ADR-0071, Opción A): cola de prendas en cuarentena
// (`aprobar_devolucion`, condición danada_reparacion/danada_donar; un cambio con
// defecto; y desde ADR-0328 act. 10, una prenda reportada en Existencias con
// `reportar_danada`) esperando que se decida su destino final. Desde ADR-0534 lo decide
// quien ve Existencias en la sede de la prenda (la líder lo valida en persona).
// Los estados son literalmente los que pidió Felipe — fijos en código, no en
// una tabla editable: eso queda en 🔖 Pendientes Benja (BACKLOG.md) para un
// futuro módulo de administrador.
//
// "Se arregló" (ADR-0328 act. 10, Felipe 2026-10-04): un arreglo menor (un
// botón descosido) vuelve a la venta. Va al ALMACÉN, no al piso: para venderla
// se cuelga en el piso, y así Frescura cuenta su edad desde que se colgó. Pide qué se le
// hizo (la base lo exige: la prenda vuelve a la venta y tiene que quedar dicho) y
// usa `arreglar_prenda_danada`, con marca de reintento. No es pérdida.
//
// "Liquidada" ES una venta real (corrección de Felipe, mismo día: "se tiene
// que tomar en cuenta liquidación como una venta, totalmente") — pide precio
// y forma de pago, y usa `liquidar_prenda_danada`, no `resolver_prenda_danada`
// (aquí solo se usa para Se botó/Donada). "Se botó"/"Donada" siguen
// siendo solo una etiqueta + nota, sin dinero de por medio.
//
// "Devolver al proveedor" (ADR-0362, fase 5b, actividad 6a; decisión 60, Felipe
// 2026-10-15): lo que llegó dañado en una recepción vuelve a SU proveedor y
// queda como deuda «por reponer» en su ficha, con las mismas salidas que un
// faltante. Lo hace quien ve Existencias, como «Se arregló»: el grupo entero,
// con una nota opcional y marca de reintento (`devolver_danada_al_proveedor`).
const ESTADOS_SIMPLES = [
  { valor: "se_boto", texto: "Se botó" },
  { valor: "donada", texto: "Donada" },
] as const;

type EstadoSimple = (typeof ESTADOS_SIMPLES)[number]["valor"];

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
};

export function ResolverDanadosModal({
  pendientes,
  otraSede = false,
  sede = "",
  onClose,
}: {
  pendientes: PrendaDanada[];
  /** Mirando otra sede (`?ubicacion=`): resolver firmaría con el Responsable de la sede activa, así que no se ofrece. */
  otraSede?: boolean;
  /** El nombre de la sede, para decir a qué almacén vuelve una prenda arreglada. */
  sede?: string;
  onClose: () => void;
}) {
  // Todo lo de este panel —se arregló, devolver al proveedor, liquidar, botar, donar— lo hace quien ve Existencias, donde vive
  // (`arreglar_prenda_danada`, Felipe 2026-10-09; resolver y liquidar desde ADR-0534, 2026-10-27), en su sede.
  const puedeDecidir = !otraSede;
  const router = useRouter();
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [liquidando, setLiquidando] = useState<string | null>(null);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [metodos, setMetodos] = useState<Record<string, MetodoPago>>({});
  // «Se arregló»: la prenda abierta, qué se le hizo, su marca de reintento (una por panel abierto) y si quedó en duda tras un
  // corte de red (entonces la nota queda fija: cambiarla sería otro arreglo con la misma marca).
  const [arreglando, setArreglando] = useState<string | null>(null);
  const [notaArreglo, setNotaArreglo] = useState("");
  const [errorArreglo, setErrorArreglo] = useState<string | null>(null);
  const [arregloEnDuda, setArregloEnDuda] = useState(false);
  const tokenArreglo = useRef<string>("");
  // «Devolver al proveedor»: la prenda abierta, la nota, su marca de reintento y si quedó en duda tras un corte de red.
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [notaDevolucion, setNotaDevolucion] = useState("");
  const [errorDevolucion, setErrorDevolucion] = useState<string | null>(null);
  const [devolucionEnDuda, setDevolucionEnDuda] = useState(false);
  const tokenDevolucion = useRef<string>("");
  // Resolver o liquidar una prenda dañada es operación de tienda (sale del stock en cuarentena; liquidar es una
  // venta con caja): pide Responsable, también al líder (ADR-0161, A8/A9). Uno solo para todo el modal.
  const responsable = useResponsable();

  // La guía de foco (ADR-0284) de lo que está abierto: «Se arregló» (qué se le hizo), «Liquidada» (precio y forma de pago) o, sin
  // ninguno abierto, solo quién lo hace. Sale de lo mismo que apaga cada botón: no agrega reglas.
  const precioLiquidando = liquidando ? Number(precios[liquidando]) : Number.NaN;
  const camposAbiertos: CampoDeGuia[] = devolviendo
    ? camposGuiaDevolucion(notaDevolucion, responsable.listo)
    : arreglando
    ? camposGuiaArreglo(notaArreglo, responsable.listo)
    : liquidando
      ? [
          { id: "precio", nombre: "Precio", requerido: true, hecho: Number.isFinite(precioLiquidando) && precioLiquidando > 0, pendiente: "Escribe el precio de liquidación." },
          // Viene en «Efectivo»: importa (va a la caja), así que la guía pasa por ella como sugerida, sin bloquear (ADR-0284 act. h).
          { id: "metodo", nombre: "Forma de pago", requerido: false, sugerido: true, hecho: Boolean(metodos[liquidando]), pendiente: "Confirma la forma de pago." },
          { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién decide." },
        ]
      : puedeDecidir && pendientes.length > 0
        ? [{ id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién decide." }]
        : [];
  const guia = useGuiaCampos(camposAbiertos);

  async function resolver(id: string, estado: EstadoSimple) {
    if (!responsable.listo) return;
    setResolviendo(id);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("resolver_prenda_danada", {
        p_id: id,
        p_estado: estado,
        p_nota: notas[id]?.trim() || undefined,
      }),
      responsable.firma(),
    );
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      const fallo = textoErrorDeResolucion(error, "resolver esta prenda dañada");
      avisar.error(fallo.mensaje);
      // Otra persona la resolvió antes (p. ej. «Se arregló»): la lista se relee para que no siga ofreciendo una que ya no está.
      if (fallo.yaResuelta) router.refresh();
      return;
    }
    avisar.exito("Prenda resuelta", { detalle: ESTADOS_SIMPLES.find((e) => e.valor === estado)?.texto });
    router.refresh();
  }

  async function confirmarLiquidacion(p: PrendaDanada) {
    const precio = Number(precios[p.id]);
    if (!Number.isFinite(precio) || precio <= 0) {
      avisar.error("Ingresa un precio de liquidación mayor a cero.");
      return;
    }
    if (!responsable.listo) return;
    setResolviendo(p.id);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("liquidar_prenda_danada", {
        p_id: p.id,
        p_precio_unitario: precio,
        p_metodo_pago: metodos[p.id] ?? "efectivo",
        p_nota: notas[p.id]?.trim() || undefined,
      }),
      responsable.firma(),
    );
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      const fallo = textoErrorDeResolucion(error, "liquidar esta prenda");
      avisar.error(fallo.mensaje);
      if (fallo.yaResuelta) {
        setLiquidando(null);
        router.refresh();
      }
      return;
    }
    avisar.exito("Prenda liquidada", { detalle: `Venta registrada por S/${(precio * p.cantidad).toFixed(2)}` });
    setLiquidando(null);
    router.refresh();
  }

  function abrirArreglo(id: string) {
    setLiquidando(null);
    setDevolviendo(null);
    setArreglando(id);
    // Lo escrito en «Nota (opcional)» antes de tocar «Se arregló» no se pierde: suele ser justo lo que se le hizo.
    setNotaArreglo(notas[id] ?? "");
    setErrorArreglo(null);
    setArregloEnDuda(false);
    tokenArreglo.current = crypto.randomUUID();
  }

  async function confirmarArreglo(p: PrendaDanada) {
    if (!guia.puedeConfirmar || resolviendo !== null) return;
    setResolviendo(p.id);
    setErrorArreglo(null);
    let data: unknown = null;
    let error: ErrorEscritura = null;
    try {
      const r = await firmar(createClient().rpc(RPC_ARREGLAR_DANADA, argumentosDeArreglo(p.id, notaArreglo, tokenArreglo.current)), responsable.firma());
      data = r.data;
      error = r.error;
    } catch (excepcion) {
      error = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      const fallo = interpretarErrorDeDanada(error, "devolver la prenda al almacén");
      // Tras un corte de red no se sabe si volvió: la nota queda fija y se reenvía igual, con la misma marca.
      if (fallo.tipo === "red") setArregloEnDuda(true);
      setErrorArreglo(fallo.mensaje);
      return;
    }
    const r = leerRespuestaDanada(data) ?? { ya_registrada: false, id: p.id, unidades: p.cantidad };
    if (r.ya_registrada) avisar.aviso(TEXTO_ARREGLO_YA_ESTABA, { detalle: p.referencia });
    else avisar.exito(tituloExitoArreglo(r.unidades), { detalle: `${p.referencia} · cuélgala en el piso para venderla` });
    setArreglando(null);
    router.refresh();
  }

  function abrirDevolucion(id: string) {
    setLiquidando(null);
    setArreglando(null);
    setDevolviendo(id);
    // Lo escrito en «Nota (opcional)» antes de tocar el botón no se pierde.
    setNotaDevolucion(notas[id] ?? "");
    setErrorDevolucion(null);
    setDevolucionEnDuda(false);
    tokenDevolucion.current = crypto.randomUUID();
  }

  async function confirmarDevolucion(p: PrendaDanada) {
    if (!guia.puedeConfirmar || resolviendo !== null || !p.devolucion) return;
    const proveedor = p.devolucion.proveedor;
    setResolviendo(p.id);
    setErrorDevolucion(null);
    let data: unknown = null;
    let error: ErrorEscritura = null;
    try {
      const r = await firmar(
        createClient().rpc(RPC_DEVOLVER_DANADA as never, argumentosDeDevolucion(p.id, notaDevolucion, tokenDevolucion.current) as never),
        responsable.firma(),
      );
      data = r.data;
      error = r.error;
    } catch (excepcion) {
      error = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      const fallo = interpretarErrorDeDanada(error, "devolver la prenda al proveedor");
      // Tras un corte de red no se sabe si se devolvió: la nota queda fija y se reenvía igual, con la misma marca.
      if (fallo.tipo === "red") setDevolucionEnDuda(true);
      setErrorDevolucion(fallo.mensaje);
      return;
    }
    const r = leerRespuestaDanada(data) ?? { ya_registrada: false, id: p.id, unidades: p.cantidad };
    if (r.ya_registrada) avisar.aviso(TEXTO_DEVOLUCION_YA_ESTABA, { detalle: p.referencia });
    else avisar.exito(tituloExitoDevolucion(r.unidades, proveedor), { detalle: `${p.referencia} · queda en «Nos debe», en la ficha del proveedor` });
    setDevolviendo(null);
    router.refresh();
  }

  return (
    <Modal conCerrar
      titulo="Prendas dañadas"
      subtitulo={`${pendientes.length} ${pendientes.length === 1 ? "pendiente" : "pendientes"} de resolver`}
      onClose={onClose}
      tamano="mediana"
    >
      {(cerrar) => (
        <div className="space-y-4">
          {/* Los botones van por prenda: el combo queda arriba de la lista, antes de cualquiera de ellos. */}
          {puedeDecidir && pendientes.length > 0 && (
            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={resolviendo !== null} />
            </CampoGuiado>
          )}
          {otraSede && pendientes.length > 0 && <p className="nota-cayla">Estás mirando otra sede: para operarla, cambia la sede activa en la cabecera. Así lo que guardes queda firmado por alguien de turno allá.</p>}
          {pendientes.length === 0 ? (
            <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Check />}>No hay prendas dañadas pendientes en esta ubicación.</Vacio>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {pendientes.map((p) => (
                <div key={p.id} className="space-y-2 border-b border-tinta/10 pb-3 last:border-b-0">
                  <div>
                    <p className="text-sm text-tinta">{p.referencia}</p>
                    <p className="font-mono text-[11px] text-tinta/55">
                      {p.sku} {[p.talla, p.color].filter(Boolean).join("/")} · {p.cantidad}{" "}
                      {p.cantidad === 1 ? "unidad" : "unidades"} · en cuarentena desde{" "}
                      {new Date(p.creadoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                    {/* De dónde llegó y, si la reportaron en la tienda, qué tiene: es lo que se necesita para decidir. */}
                    <p className="mt-0.5 text-xs text-taupe">{textoOrigenDanada(p.origen, p.motivoReporte, p.devolucion)}</p>
                  </div>
                  {puedeDecidir && liquidando !== p.id && arreglando !== p.id && devolviendo !== p.id && (
                    <>
                      <CampoTexto
                        etiqueta="Nota (opcional)"
                        value={notas[p.id] ?? ""}
                        onChange={(e) => setNotas((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        maxLength={200}
                        placeholder="Detalle de la resolución"
                      />
                      <div className="flex flex-wrap gap-2">
                        {/* Un arreglo menor vuelve a la venta (ADR-0328): primero, porque es lo que no pierde la prenda. */}
                        <Boton
                          type="button"
                          onClick={() => abrirArreglo(p.id)}
                          disabled={resolviendo !== null || !responsable.listo}
                          title={responsable.motivo ?? "Vuelve al almacén de la tienda"}
                          className="flex-1"
                        >
                          Se arregló
                        </Boton>
                        {/* Lo que llegó dañado en una recepción vuelve a su proveedor y queda como deuda «por reponer» (actividad 6a). */}
                        {p.devolucion && (
                          <Boton
                            type="button"
                            onClick={() => abrirDevolucion(p.id)}
                            disabled={resolviendo !== null || !responsable.listo}
                            title={responsable.motivo ?? `Vuelve a ${p.devolucion.proveedor} y queda como deuda en su ficha`}
                            className="flex-1"
                          >
                            Devolver al proveedor
                          </Boton>
                        )}
                        <Boton
                          type="button"
                          onClick={() => {
                            setArreglando(null);
                            setDevolviendo(null);
                            setLiquidando(p.id);
                            setPrecios((prev) => ({ ...prev, [p.id]: prev[p.id] ?? (p.precioReferencia || "").toString() }));
                          }}
                          disabled={resolviendo !== null || !responsable.listo}
                          title={responsable.motivo ?? undefined}
                          className="flex-1"
                        >
                          Liquidada
                        </Boton>
                        {ESTADOS_SIMPLES.map((e) => (
                          <Boton
                            key={e.valor}
                            type="button"
                            onClick={() => resolver(p.id, e.valor)}
                            cargando={resolviendo === p.id}
                            disabled={resolviendo !== null || !responsable.listo}
                            title={responsable.motivo ?? undefined}
                            className="flex-1"
                          >
                            {e.texto}
                          </Boton>
                        ))}
                      </div>
                    </>
                  )}
                  {puedeDecidir && arreglando === p.id && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">{quePasaAlArreglar(sede)}</p>
                      <CampoGuiado id="arreglo" guia={guia}>
                        <CampoTexto
                          etiqueta={guia.etiqueta("arreglo", "¿Qué se arregló?")}
                          placeholder="Describe qué se le hizo a la prenda"
                          maxLength={MAX_TEXTO_DANADA}
                          value={notaArreglo}
                          onChange={(e) => {
                            setNotaArreglo(e.target.value);
                            setErrorArreglo(null);
                          }}
                          disabled={resolviendo !== null || arregloEnDuda}
                        />
                      </CampoGuiado>
                      {errorArreglo && (
                        <Aviso tono="error">{errorArreglo}</Aviso>
                      )}
                      <PieGuia guia={guia} listo="Todo listo: vuelve al almacén." />
                      <div className="pie-acciones">
                        <Boton type="button" onClick={() => setArreglando(null)} disabled={resolviendo !== null}>
                          Cancelar
                        </Boton>
                        <Boton
                          type="button"
                          peso="primario"
                          onClick={() => confirmarArreglo(p)}
                          cargando={resolviendo === p.id}
                          disabled={resolviendo !== null || !guia.puedeConfirmar}
                          title={responsable.motivo ?? guia.frase ?? undefined}
                          className={`flex-1 ${guia.claseConfirmar}`}
                        >
                          {arregloEnDuda ? "Confirmar de nuevo" : "Volver al almacén"}
                        </Boton>
                      </div>
                    </div>
                  )}
                  {puedeDecidir && devolviendo === p.id && p.devolucion && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">{quePasaAlDevolver(p.devolucion.proveedor)}</p>
                      <CampoGuiado id="devolucion" guia={guia}>
                        <CampoTexto
                          etiqueta={guia.etiqueta("devolucion", "Nota")}
                          placeholder="Escribe qué tiene o con quién se la mandaste (opcional)"
                          maxLength={MAX_TEXTO_DANADA}
                          value={notaDevolucion}
                          onChange={(e) => {
                            setNotaDevolucion(e.target.value);
                            setErrorDevolucion(null);
                          }}
                          disabled={resolviendo !== null || devolucionEnDuda}
                        />
                      </CampoGuiado>
                      {errorDevolucion && <Aviso tono="error">{errorDevolucion}</Aviso>}
                      <PieGuia guia={guia} listo={`Todo listo: vuelve a ${p.devolucion.proveedor}.`} />
                      <div className="pie-acciones">
                        <Boton type="button" onClick={() => setDevolviendo(null)} disabled={resolviendo !== null}>
                          Cancelar
                        </Boton>
                        <Boton
                          type="button"
                          peso="primario"
                          onClick={() => confirmarDevolucion(p)}
                          cargando={resolviendo === p.id}
                          textoCargando="Devolviendo…"
                          disabled={resolviendo !== null || !guia.puedeConfirmar}
                          title={responsable.motivo ?? guia.frase ?? undefined}
                          className={`flex-1 ${guia.claseConfirmar}`}
                        >
                          {devolucionEnDuda ? "Confirmar de nuevo" : "Devolver al proveedor"}
                        </Boton>
                      </div>
                    </div>
                  )}
                  {puedeDecidir && liquidando === p.id && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">
                        Liquidar registra una venta real — {p.cantidad > 1 ? `${p.cantidad} unidades juntas, ` : ""}
                        exige caja abierta en esta ubicación.
                      </p>
                      <CampoGuiado id="precio" guia={guia}>
                        <CampoMonto
                          etiqueta={guia.etiqueta("precio", p.cantidad > 1 ? "Precio por unidad" : "Precio de liquidación")}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={precios[p.id] ?? ""}
                          onChange={(e) => setPrecios((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        />
                      </CampoGuiado>
                      <CampoGuiado id="metodo" guia={guia}>
                        <CampoSelect
                          etiqueta={guia.etiqueta("metodo", "Forma de pago")}
                          valor={metodos[p.id] ?? "efectivo"}
                          onValor={(v) => setMetodos((prev) => ({ ...prev, [p.id]: v }))}
                          opciones={METODOS_PAGO.map((m) => ({ valor: m, texto: ETIQUETA_METODO[m] }))}
                        />
                      </CampoGuiado>
                      <PieGuia guia={guia} listo="Todo listo para liquidar." />
                      <div className="pie-acciones">
                        <Boton type="button" onClick={() => setLiquidando(null)} disabled={resolviendo !== null}>
                          Cancelar
                        </Boton>
                        <Boton
                          type="button"
                          peso="primario"
                          onClick={() => confirmarLiquidacion(p)}
                          cargando={resolviendo === p.id}
                          disabled={resolviendo !== null || !responsable.listo}
                          title={responsable.motivo ?? undefined}
                         
                        >
                          Confirmar liquidación
                        </Boton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
