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
  DESTINOS_ARREGLO,
  leerCostoArreglo,
  type DestinoArreglo,
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
import {
  argumentosDeNoSePudo,
  argumentosDeSalida,
  camposGuiaNoSePudo,
  camposGuiaSalida,
  leerRespuestaNoSePudo,
  leerRespuestaSalida,
  QUE_PASA_AL_NO_PUDO,
  RPC_NO_SE_PUDO,
  TEXTO_NO_SE_PUDO_YA_ESTABA,
  TEXTO_RED_NO_SE_PUDO,
  TITULO_EXITO_NO_SE_PUDO,
  MAX_NOTA_ARREGLO,
  QUE_PASA_AL_SACAR,
  RPC_SACAR_A_ARREGLAR,
  RUTAS_ARREGLO,
  TEXTO_RED_SALIDA,
  TEXTO_SALIDA_YA_ESTABA,
  textoEnArreglo,
  tituloExitoSalida,
  type RutaArreglo,
} from "@/lib/danadas-arreglo";
import { Chip } from "@/components/ui/Chip";
import { textoVerFotos } from "@/lib/danadas-foto";
import { argumentosDeLugar, camposGuiaLugar, MAX_LUGAR_DANADAS, RPC_DEFINIR_LUGAR_DANADAS } from "@/lib/danadas-lugar";
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
  ubicacionId,
  lugar,
  sede = "",
  onClose,
}: {
  pendientes: PrendaDanada[];
  /** Mirando otra sede (`?ubicacion=`): resolver firmaría con el Responsable de la sede activa, así que no se ofrece. */
  otraSede?: boolean;
  /** La tienda cuyas dañadas se ven, y dónde las deja (ADR-0564): null si aún no lo marcó. */
  ubicacionId: string;
  lugar: string | null;
  /** El nombre de la sede, para decir a qué almacén vuelve una prenda arreglada. */
  sede?: string;
  onClose: () => void;
}) {
  // Todo lo de este panel —se arregló, devolver al proveedor, liquidar, botar, donar— lo hace quien ve Existencias, donde vive
  // (`arreglar_prenda_danada`, Felipe 2026-10-09; resolver y liquidar desde ADR-0534, 2026-10-27), en su sede.
  const puedeDecidir = !otraSede;
  const router = useRouter();
  const [notas, setNotas] = useState<Record<string, string>>({});
  // «Dónde se dejan» (ADR-0564): el lugar físico de las dañadas de esta tienda, que cada sede marca y la pantalla repite.
  // «Salió a arreglar» (ADR-0564): la prenda abierta, quién la arregla, con quién va y el error de la hoja.
  const [sacando, setSacando] = useState<string | null>(null);
  const [rutaSalida, setRutaSalida] = useState<RutaArreglo | "">("");
  const [notaSalida, setNotaSalida] = useState("");
  const [errorSalida, setErrorSalida] = useState<string | null>(null);
  const [editandoLugar, setEditandoLugar] = useState(false);
  const [textoLugar, setTextoLugar] = useState("");
  const [guardandoLugar, setGuardandoLugar] = useState(false);
  const [errorLugar, setErrorLugar] = useState<string | null>(null);
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
  // A dónde vuelve y cuánto costó (ADR-0564): el almacén es de fábrica y la guía pide confirmarlo; el costo es opcional.
  const [destinoArreglo, setDestinoArreglo] = useState<DestinoArreglo>("almacen");
  const [destinoConfirmado, setDestinoConfirmado] = useState(false);
  const [costoArreglo, setCostoArreglo] = useState("");
  // «No se pudo» (ADR-0564): la prenda que volvió de arreglarse sin arreglo, y por qué.
  const [noPudo, setNoPudo] = useState<string | null>(null);
  const [motivoNoPudo, setMotivoNoPudo] = useState("");
  const [errorNoPudo, setErrorNoPudo] = useState<string | null>(null);
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
  const camposAbiertos: CampoDeGuia[] = editandoLugar
    ? camposGuiaLugar(textoLugar, responsable.listo)
    : sacando
    ? camposGuiaSalida(rutaSalida, notaSalida, responsable.listo)
    : noPudo
    ? camposGuiaNoSePudo(motivoNoPudo, responsable.listo)
    : devolviendo
    ? camposGuiaDevolucion(notaDevolucion, responsable.listo)
    : arreglando
    ? camposGuiaArreglo(notaArreglo, responsable.listo, destinoConfirmado, costoArreglo)
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

  function abrirLugar() {
    setTextoLugar(lugar ?? "");
    setErrorLugar(null);
    setEditandoLugar(true);
  }

  async function guardarLugar() {
    if (!guia.puedeConfirmar || guardandoLugar) return;
    setGuardandoLugar(true);
    setErrorLugar(null);
    let error: ErrorEscritura = null;
    try {
      const r = await firmar(createClient().rpc(RPC_DEFINIR_LUGAR_DANADAS, argumentosDeLugar(ubicacionId, textoLugar)), responsable.firma());
      error = r.error;
    } catch (excepcion) {
      error = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    setGuardandoLugar(false);
    responsable.despues(error);
    if (error) {
      // Marcar el lugar es repetible sin daño (deja lo mismo): tras un corte de red basta volver a guardar.
      setErrorLugar(interpretarErrorDeDanada(error, "marcar dónde se dejan las prendas dañadas").mensaje);
      return;
    }
    avisar.exito(textoLugar.trim() ? "Lugar marcado" : "Lugar quitado", { detalle: textoLugar.trim() || undefined });
    setEditandoLugar(false);
    router.refresh();
  }

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

  function abrirSalida(id: string) {
    setNoPudo(null);
    setLiquidando(null);
    setDevolviendo(null);
    setArreglando(null);
    setSacando(id);
    // Lo escrito en «Nota (opcional)» antes de tocar «Salió a arreglar» no se pierde: suele ser con quién va.
    setNotaSalida(notas[id] ?? "");
    setRutaSalida("");
    setErrorSalida(null);
  }

  async function confirmarSalida(p: PrendaDanada) {
    if (!guia.puedeConfirmar || resolviendo !== null || rutaSalida === "") return;
    setResolviendo(p.id);
    setErrorSalida(null);
    let data: unknown = null;
    let error: ErrorEscritura = null;
    try {
      const r = await firmar(createClient().rpc(RPC_SACAR_A_ARREGLAR, argumentosDeSalida(p.id, rutaSalida, notaSalida)), responsable.firma());
      data = r.data;
      error = r.error;
    } catch (excepcion) {
      error = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      const fallo = interpretarErrorDeDanada(error, "anotar que salió a arreglar");
      // Marcar la salida es repetible sin daño (la misma ruta devuelve «ya estaba»): tras un corte basta volver a tocar.
      setErrorSalida(fallo.tipo === "red" ? TEXTO_RED_SALIDA : fallo.mensaje);
      // Otra persona la sacó o la resolvió antes: la lista se relee para que no siga ofreciendo lo que ya no es.
      if (error.hint === "arreglo_ya_en_arreglo" || error.hint === "arreglo_ya_resuelta") router.refresh();
      return;
    }
    const r = leerRespuestaSalida(data) ?? { ya_registrada: false, id: p.id, ruta: rutaSalida };
    if (r.ya_registrada) avisar.aviso(TEXTO_SALIDA_YA_ESTABA, { detalle: p.referencia });
    else avisar.exito(tituloExitoSalida(r.ruta), { detalle: p.referencia });
    setSacando(null);
    router.refresh();
  }

  function abrirNoPudo(id: string) {
    setLiquidando(null);
    setDevolviendo(null);
    setArreglando(null);
    setSacando(null);
    setNoPudo(id);
    setMotivoNoPudo("");
    setErrorNoPudo(null);
  }

  async function confirmarNoPudo(p: PrendaDanada) {
    if (!guia.puedeConfirmar || resolviendo !== null) return;
    setResolviendo(p.id);
    setErrorNoPudo(null);
    let data: unknown = null;
    let error: ErrorEscritura = null;
    try {
      const r = await firmar(createClient().rpc(RPC_NO_SE_PUDO, argumentosDeNoSePudo(p.id, motivoNoPudo)), responsable.firma());
      data = r.data;
      error = r.error;
    } catch (excepcion) {
      error = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      const fallo = interpretarErrorDeDanada(error, "anotar que no se pudo arreglar");
      // Repetirlo es seguro (el mismo resultado devuelve «ya estaba»): tras un corte basta volver a tocar.
      setErrorNoPudo(fallo.tipo === "red" ? TEXTO_RED_NO_SE_PUDO : fallo.mensaje);
      if (error.hint === "arreglo_ya_volvio" || error.hint === "arreglo_ya_resuelta" || error.hint === "arreglo_no_esta_fuera") router.refresh();
      return;
    }
    const r = leerRespuestaNoSePudo(data) ?? { ya_registrada: false, id: p.id };
    if (r.ya_registrada) avisar.aviso(TEXTO_NO_SE_PUDO_YA_ESTABA, { detalle: p.referencia });
    else avisar.exito(TITULO_EXITO_NO_SE_PUDO, { detalle: p.referencia });
    setNoPudo(null);
    router.refresh();
  }

  function abrirArreglo(id: string) {
    setNoPudo(null);
    setSacando(null);
    setLiquidando(null);
    setDevolviendo(null);
    setArreglando(id);
    // Lo escrito en «Nota (opcional)» antes de tocar «Se arregló» no se pierde: suele ser justo lo que se le hizo.
    setNotaArreglo(notas[id] ?? "");
    setErrorArreglo(null);
    setArregloEnDuda(false);
    setDestinoArreglo("almacen");
    setDestinoConfirmado(false);
    setCostoArreglo("");
    tokenArreglo.current = crypto.randomUUID();
  }

  async function confirmarArreglo(p: PrendaDanada) {
    if (!guia.puedeConfirmar || resolviendo !== null) return;
    const costo = leerCostoArreglo(costoArreglo);
    if (costo === "invalido") return;
    setResolviendo(p.id);
    setErrorArreglo(null);
    let data: unknown = null;
    let error: ErrorEscritura = null;
    try {
      const r = await firmar(createClient().rpc(RPC_ARREGLAR_DANADA, argumentosDeArreglo(p.id, notaArreglo, tokenArreglo.current, destinoArreglo, costo)), responsable.firma());
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
    else avisar.exito(tituloExitoArreglo(r.unidades, destinoArreglo), { detalle: destinoArreglo === "piso" ? `${p.referencia} · ya está en el piso, lista para vender` : `${p.referencia} · cuélgala en el piso para venderla` });
    setArreglando(null);
    router.refresh();
  }

  function abrirDevolucion(id: string) {
    setNoPudo(null);
    setSacando(null);
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
          {puedeDecidir && (pendientes.length > 0 || editandoLugar) && (
            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={resolviendo !== null} />
            </CampoGuiado>
          )}
          {/* Dónde deja esta tienda las dañadas: lo que la colaboradora lee con la prenda en la mano (ADR-0564). */}
          {editandoLugar ? (
            <div className="space-y-3 rounded-md bg-sand/30 p-3">
              <CampoGuiado id="lugar" guia={guia}>
                <CampoTexto
                  etiqueta={guia.etiqueta("lugar", "¿Dónde dejan las prendas dañadas?")}
                  // sugerir-fijo: es el primer dato de esta hoja; no depende de nada elegido antes
                  placeholder="Ej. perchero detrás de caja"
                  maxLength={MAX_LUGAR_DANADAS}
                  value={textoLugar}
                  onChange={(e) => {
                    setTextoLugar(e.target.value);
                    setErrorLugar(null);
                  }}
                  disabled={guardandoLugar}
                />
              </CampoGuiado>
              {errorLugar && <Aviso tono="error">{errorLugar}</Aviso>}
              <PieGuia guia={guia} listo="Todo listo: se guarda el lugar." />
              <div className="pie-acciones">
                <Boton type="button" onClick={() => setEditandoLugar(false)} disabled={guardandoLugar}>
                  Cancelar
                </Boton>
                <Boton type="button" peso="primario" onClick={guardarLugar} cargando={guardandoLugar} disabled={guardandoLugar || !guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Guardar el lugar
                </Boton>
              </div>
            </div>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-tinta">
              {lugar ? (
                <>
                  <span className="text-taupe">Se dejan en:</span> <span className="font-semibold">{lugar}</span>
                </>
              ) : (
                <span className="text-taupe">Esta tienda aún no marcó dónde deja las prendas dañadas.</span>
              )}
              {puedeDecidir && (
                <button type="button" onClick={abrirLugar} className="btn-cayla btn-enlace">
                  {lugar ? "Cambiar" : "Marcar el lugar"}
                </button>
              )}
            </p>
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
                    <p className="mt-0.5 text-xs text-taupe">{textoOrigenDanada(p.origen, p.motivoReporte, p.devolucion, p.tipoDano)}</p>
                    {p.fotos.length > 0 && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                        {p.fotos.length === 1 ? (
                          <a href={p.fotos[0]} target="_blank" rel="noopener noreferrer" className="btn-cayla btn-enlace">
                            {textoVerFotos(1)}
                          </a>
                        ) : (
                          <>
                            <span className="text-taupe">{textoVerFotos(p.fotos.length)}:</span>
                            {p.fotos.map((u, i) => (
                              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="btn-cayla btn-enlace">
                                Foto {i + 1}
                              </a>
                            ))}
                          </>
                        )}
                      </p>
                    )}
                    {p.noSePudo && (
                      <p className="mt-1">
                        <Chip tono="ambar" versalitas={false} title="Volvió de arreglarse sin arreglo. Decide su destino: liquidar, botar, donar o volver a sacarla.">
                          {p.noSePudo.motivo ? `No se pudo arreglar · ${p.noSePudo.motivo}` : "No se pudo arreglar"}
                        </Chip>
                      </p>
                    )}
                    {p.enArreglo && (
                      <p className="mt-1">
                        <Chip tono="pizarra" versalitas={false} title="La prenda salió de la tienda a arreglarse. Cuando vuelva, marca «Se arregló».">
                          {textoEnArreglo(p.enArreglo)}
                        </Chip>
                      </p>
                    )}
                  </div>
                  {puedeDecidir && liquidando !== p.id && arreglando !== p.id && devolviendo !== p.id && sacando !== p.id && noPudo !== p.id && (
                    <>
                      <CampoTexto
                        etiqueta="Nota (opcional)"
                        value={notas[p.id] ?? ""}
                        onChange={(e) => setNotas((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        maxLength={200}
                        placeholder="Detalle de la resolución"
                      />
                      <div className="flex flex-wrap gap-2">
                        {/* Antes de arreglarla, sale de la tienda (ADR-0564): una costurera cercana o el Taller. Solo una vez. */}
                        {!p.enArreglo && (
                          <Boton
                            type="button"
                            onClick={() => abrirSalida(p.id)}
                            disabled={resolviendo !== null || !responsable.listo}
                            title={responsable.motivo ?? "Anota que la prenda sale de la tienda a arreglarse"}
                            className="flex-1"
                          >
                            Salió a arreglar
                          </Boton>
                        )}
                        {/* Volvió de arreglarse sin arreglo (ADR-0564): solo tiene sentido si salió. */}
                        {p.enArreglo && (
                          <Boton
                            type="button"
                            onClick={() => abrirNoPudo(p.id)}
                            disabled={resolviendo !== null || !responsable.listo}
                            title={responsable.motivo ?? "Volvió de arreglarse, pero no se pudo arreglar"}
                            className="flex-1"
                          >
                            No se pudo
                          </Boton>
                        )}
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
                            setNoPudo(null);
                            setSacando(null);
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
                  {puedeDecidir && sacando === p.id && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">{QUE_PASA_AL_SACAR}</p>
                      <CampoGuiado id="ruta" guia={guia}>
                        <CampoSelect
                          etiqueta={guia.etiqueta("ruta", "¿Quién la arregla?")}
                          valor={rutaSalida}
                          onValor={(v) => {
                            setRutaSalida(v);
                            setErrorSalida(null);
                          }}
                          opciones={RUTAS_ARREGLO.map((r) => ({ valor: r.valor, texto: r.etiqueta }))}
                          marcador="Elige quién"
                          deshabilitado={resolviendo !== null}
                        />
                      </CampoGuiado>
                      <CampoGuiado id="nota" guia={guia}>
                        <CampoTexto
                          etiqueta={guia.etiqueta("nota", "¿Con quién va? (opcional)")}
                          // sugerir-fijo: es un dato libre sobre quién la lleva; no depende de la ruta elegida
                          placeholder="Ej. la lleva Rosa el jueves"
                          maxLength={MAX_NOTA_ARREGLO}
                          value={notaSalida}
                          onChange={(e) => {
                            setNotaSalida(e.target.value);
                            setErrorSalida(null);
                          }}
                          disabled={resolviendo !== null}
                        />
                      </CampoGuiado>
                      {errorSalida && <Aviso tono="error">{errorSalida}</Aviso>}
                      <PieGuia guia={guia} listo="Todo listo: se anota la salida." />
                      <div className="pie-acciones">
                        <Boton type="button" onClick={() => setSacando(null)} disabled={resolviendo !== null}>
                          Cancelar
                        </Boton>
                        <Boton
                          type="button"
                          peso="primario"
                          onClick={() => confirmarSalida(p)}
                          cargando={resolviendo === p.id}
                          disabled={resolviendo !== null || !guia.puedeConfirmar}
                          title={responsable.motivo ?? guia.frase ?? undefined}
                          className={`flex-1 ${guia.claseConfirmar}`}
                        >
                          Anotar la salida
                        </Boton>
                      </div>
                    </div>
                  )}
                  {puedeDecidir && noPudo === p.id && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">{QUE_PASA_AL_NO_PUDO}</p>
                      <CampoGuiado id="motivo" guia={guia}>
                        <CampoTexto
                          etiqueta={guia.etiqueta("motivo", "¿Por qué no se pudo? (opcional)")}
                          // sugerir-fijo: es un dato libre de lo que pasó con el arreglo; no depende de nada elegido antes
                          placeholder="Ej. la mancha no sale"
                          maxLength={MAX_NOTA_ARREGLO}
                          value={motivoNoPudo}
                          onChange={(e) => {
                            setMotivoNoPudo(e.target.value);
                            setErrorNoPudo(null);
                          }}
                          disabled={resolviendo !== null}
                        />
                      </CampoGuiado>
                      {errorNoPudo && <Aviso tono="error">{errorNoPudo}</Aviso>}
                      <PieGuia guia={guia} listo="Todo listo: se anota que no se pudo." />
                      <div className="pie-acciones">
                        <Boton type="button" onClick={() => setNoPudo(null)} disabled={resolviendo !== null}>
                          Cancelar
                        </Boton>
                        <Boton
                          type="button"
                          peso="primario"
                          onClick={() => confirmarNoPudo(p)}
                          cargando={resolviendo === p.id}
                          disabled={resolviendo !== null || !guia.puedeConfirmar}
                          title={responsable.motivo ?? guia.frase ?? undefined}
                          className={`flex-1 ${guia.claseConfirmar}`}
                        >
                          Anotar que no se pudo
                        </Boton>
                      </div>
                    </div>
                  )}
                  {puedeDecidir && arreglando === p.id && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">{quePasaAlArreglar(sede, destinoArreglo)}</p>
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
                      <CampoGuiado id="destino" guia={guia}>
                        <CampoSelect
                          etiqueta={guia.etiqueta("destino", "¿A dónde vuelve?")}
                          valor={destinoArreglo}
                          onValor={(v) => {
                            setDestinoArreglo(v);
                            setDestinoConfirmado(true);
                          }}
                          opciones={DESTINOS_ARREGLO.map((d) => ({ valor: d.valor, texto: d.etiqueta }))}
                          deshabilitado={resolviendo !== null || arregloEnDuda}
                        />
                      </CampoGuiado>
                      <CampoGuiado id="costo" guia={guia}>
                        <CampoMonto
                          etiqueta={guia.etiqueta("costo", "¿Cuánto costó el arreglo? (opcional)")}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={costoArreglo}
                          onChange={(e) => {
                            setCostoArreglo(e.target.value);
                            setErrorArreglo(null);
                          }}
                          disabled={resolviendo !== null || arregloEnDuda}
                        />
                      </CampoGuiado>
                      {errorArreglo && (
                        <Aviso tono="error">{errorArreglo}</Aviso>
                      )}
                      <PieGuia guia={guia} listo={`Todo listo: vuelve al ${destinoArreglo === "piso" ? "piso" : "almacén"}.`} />
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
                          {arregloEnDuda ? "Confirmar de nuevo" : destinoArreglo === "piso" ? "Volver al piso" : "Volver al almacén"}
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
