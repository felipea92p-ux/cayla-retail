"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { FilaFase } from "@/components/orden-produccion/FasesDeLaOrden";
import { useAltaDeProveedorServicio } from "@/components/orden-produccion/useAltaDeProveedorServicio";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { fasesParaRpc, problemasFases, proveedoresQueSirven, type FaseBorrador, type FaseClave, type Quien, type TarifaDeLista } from "@/lib/orden-fases-reglas";
import { camposDeCambiarQuien } from "@/lib/orden-pagina-guia";
import { RPC_CAMBIAR_QUIEN_FASE, RPC_DEJAR_FASE_PENDIENTE, RPC_REGISTRAR_PROVEEDOR_DE_FASE, esPendienteDeRegistrar, quienDeFase, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import type { OpcionesNuevaOrden } from "@/lib/produccion";
import { firmar } from "@/lib/responsable-reglas";
import type { Tolerado } from "@/lib/resultado";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Cambiar quién» (ADR-0400, decisión 3; vista D): una fase entera tiene UN quién —el Taller o un servicio de afuera— y se puede cambiar hasta que la fase empiece (el primer «Terminé»,
// la primera Salida). Es la misma fila de la hoja de Nueva orden (`FilaFase`): el segmento Taller / Afuera, el proveedor (solo los que hacen servicios), la tarifa por prenda sugerida
// desde su lista de precios, la cantidad mínima, la fecha prometida y el fijo por orden. Lo que falta sale de `problemasFases`, que dice lo mismo que la base rechazaría
// (`cambiar_quien_fase` → `fn_produccion_fases_normalizar`); la base vuelve a validar y pone el candado de «ya empezó» (`fase_empezada`).
//
// El aviso de éxito trae «Deshacer»: como la fase no empezó, volver a lo de antes es la misma llamada con los valores de antes.

/** La fase de la página como la entiende la hoja de Nueva orden (los números como texto, igual que las cajas). */
function borradorDe(f: FasePagina): FaseBorrador {
  return {
    clave: f.clave,
    encendida: true,
    quien: f.quien,
    proveedorId: f.proveedorId,
    tarifa: f.tarifaPrenda !== null ? String(f.tarifaPrenda) : "",
    fijo: f.fijoOrden > 0 ? String(f.fijoOrden) : "",
    minimo: f.cantidadMinima !== null ? String(f.cantidadMinima) : "",
    fechaPrometida: f.fechaPrometida ?? "",
    posicion: f.posicion,
    pendiente: esPendienteDeRegistrar(f),
  };
}

/**
 * La llamada que guarda una fase borrador. Tres caminos (ADR-0551 pendiente de registrar): «Pendiente de registrar» → `dejar_fase_pendiente_de_registrar` (con su costo); una fase que ERA pendiente y ahora tiene proveedor →
 * `registrar_proveedor_de_fase` (vale aunque la fase ya empezó); todo lo demás → `cambiar_quien_fase`: el Taller lleva todo en null; un servicio, la tarifa escrita o la sugerida (la misma
 * cuenta de `fasesParaRpc`).
 */
function llamada(faseId: string, b: FaseBorrador, eraPendiente: boolean, lista: readonly TarifaDeLista[], hoy: string): { rpc: string; args: Record<string, unknown> } {
  const r = fasesParaRpc([b], lista, hoy)[0];
  if (r.quien === "servicio" && r.proveedor_pendiente) {
    // El pendiente lleva su costo (tarifa, fijo, mínimo): se devenga aunque no se sepa quién (ADR-0551). En blanco, no suma nada.
    return { rpc: RPC_DEJAR_FASE_PENDIENTE, args: { p_fase_id: faseId, p_fecha_prometida: r.fecha_prometida, p_tarifa_prenda: r.tarifa_prenda, p_fijo_orden: r.fijo_orden, p_cantidad_minima: r.cantidad_minima } };
  }
  if (eraPendiente && r.quien === "servicio") {
    return {
      rpc: RPC_REGISTRAR_PROVEEDOR_DE_FASE,
      args: { p_fase_id: faseId, p_proveedor_id: r.proveedor_id, p_tarifa_prenda: r.tarifa_prenda, p_fijo_orden: r.fijo_orden, p_cantidad_minima: r.cantidad_minima, p_fecha_prometida: r.fecha_prometida },
    };
  }
  return {
    rpc: RPC_CAMBIAR_QUIEN_FASE,
    args: {
      p_fase_id: faseId,
      p_quien: r.quien,
      p_proveedor_id: r.proveedor_id,
      p_tarifa_prenda: r.tarifa_prenda,
      p_fijo_orden: r.fijo_orden,
      p_cantidad_minima: r.cantidad_minima,
      p_fecha_prometida: r.fecha_prometida,
    },
  };
}

export function CambiarQuienModal({ datos, fase, opciones, hoy, onClose }: { datos: OrdenPagina; fase: FasePagina; opciones: Tolerado<OpcionesNuevaOrden> | null; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [borrador, setBorrador] = useState<FaseBorrador>(() => borradorDe(fase));
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  // Una fase que ya estaba «pendiente de registrar»: se completa (aunque haya empezado) y la hoja habla de registrar, no de cambiar.
  const eraPendiente = esPendienteDeRegistrar(fase);

  const proveedoresDelDirectorio = useMemo(() => proveedoresQueSirven(opciones?.datos?.proveedores ?? []), [opciones]);
  // Quien todavía no está en el directorio se registra desde aquí (la hoja no se cierra ni se pierde lo elegido).
  const altaProveedor = useAltaDeProveedorServicio(proveedoresDelDirectorio, (n) => ({ ...n, tarifas: [] }));
  const proveedores = altaProveedor.proveedores;
  const opcionesProveedor = useMemo(() => proveedores.map((p) => ({ valor: p.id, texto: p.nombre })), [proveedores]);
  const lista = useMemo<TarifaDeLista[]>(
    () => (opciones?.datos?.proveedores ?? []).flatMap((p) => p.tarifas.map((t) => ({ proveedorId: p.id, faseClave: t.faseClave as FaseClave, tarifa: t.tarifa, minimo: t.minimo, fijo: t.fijo, vigenteDesde: t.vigenteDesde }))),
    [opciones]
  );
  const problemas = useMemo(() => problemasFases([borrador], { hoy, proveedores, lista }), [borrador, hoy, proveedores, lista]);
  const guia = useGuiaCampos(camposDeCambiarQuien({ faltas: problemas.map((p) => p.texto), responsableListo: responsable.listo }));

  const fotoActual = fotoFormulario(borrador);
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste quién hace esta fase y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  const nombreMinuscula = fase.nombre.toLocaleLowerCase("es");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0].texto);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    const firma = responsable.firma();
    let resultado;
    try {
      const l = llamada(fase.id, borrador, eraPendiente, lista, hoy);
      resultado = await firmar(createClient().rpc(l.rpc as never, l.args as never), firma);
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, `cambiar quién hace ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
      return;
    }
    const nuevoQuien: Quien = borrador.quien;
    const nombreDelServicio = proveedores.find((p) => p.id === borrador.proveedorId)?.nombre;
    const texto = nuevoQuien !== "servicio" ? `${fase.nombre} la hace el Taller` : borrador.pendiente ? `${fase.nombre} sale afuera: pendiente de registrar quién` : `${fase.nombre} sale afuera${nombreDelServicio ? ` con ${nombreDelServicio}` : ""}`;
    avisar.exito(texto, {
      detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}`,
      // Registrar quién en una fase que ya empezó no se deshace (la base no cambia quién hace una fase empezada): sin «Deshacer», y la hoja lo avisó antes.
      ...(eraPendiente && fase.empezada
        ? {}
        : {
            accion: {
              texto: "Deshacer",
              onClick: async () => {
                const l = llamada(fase.id, borradorDe(fase), eraPendiente, lista, hoy);
                const { error: e2 } = await firmar(createClient().rpc(l.rpc as never, l.args as never), firma);
                if (e2) avisar.error(traducirError(e2, `volver a como estaba ${nombreMinuscula}`));
                router.refresh();
              },
            },
          }),
    });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={eraPendiente ? `Registrar quién hace ${nombreMinuscula}` : `¿Quién hace ${nombreMinuscula}?`}
      subtitulo={eraPendiente ? `Ahora: ${quienDeFase(fase)}. Cuando sepas quién la hizo y a cuánto, regístralo aquí.` : `Ahora: ${quienDeFase(fase)}. Se puede cambiar hasta que ${nombreMinuscula} empiece.`}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-quien.fase">
          {/* `retiene="fila"`: el bloque tiene varios controles; la luz de la guía espera mientras la persona siga eligiendo dentro de él. */}
          <CampoGuiado id="fase" guia={guia} retiene="fila" className="space-y-2">
            <span className={`${campoEtiqueta} block`}>{guia.etiqueta("fase", "Quién la hace")}</span>
            <div className="rounded-2xl border border-sand bg-crema">
              <FilaFase
                fase={borrador}
                totalPrendas={datos.orden.cantidadPlan}
                hoy={hoy}
                tarifas={lista}
                proveedores={proveedores}
                opcionesProveedor={opcionesProveedor}
                problemas={problemas}
                onCambiar={(parche) => setBorrador((b) => ({ ...b, ...parche }))}
                onAgregarProveedor={altaProveedor.abrir}
              />
            </div>
            {eraPendiente && fase.empezada && (
              <Aviso tono="atencion" chico>
                {nombreMinuscula[0].toLocaleUpperCase("es") + nombreMinuscula.slice(1)} ya empezó: al guardar queda registrado y no se puede cambiar. Revisa bien el proveedor y la tarifa.
              </Aviso>
            )}
            {!opciones?.datos && (
              <Aviso tono="info" chico>
                {opciones?.fallo ?? "No se pudo leer la lista de servicios."}
              </Aviso>
            )}
          </CampoGuiado>
        </div>

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar el cambio." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Guardar el cambio
            </Boton>
          </div>
        </div>
      </form>
      {altaProveedor.modal}
      {avisoSalida.aviso}
    </Modal>
  );
}
