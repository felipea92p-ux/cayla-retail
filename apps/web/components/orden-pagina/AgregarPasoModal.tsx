"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { FilaFase } from "@/components/orden-produccion/FasesDeLaOrden";
import { useAltaDeProveedorServicio } from "@/components/orden-produccion/useAltaDeProveedorServicio";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { fasesParaRpc, problemasFases, proveedoresQueSirven, secuenciaDe, type FaseBorrador, type FaseClave, type TarifaDeLista } from "@/lib/orden-fases-reglas";
import { camposDeAgregarPaso } from "@/lib/orden-pagina-guia";
import { RPC_AGREGAR_PASO, RPC_QUITAR_PASO, type OrdenPagina, type PasoAgregable } from "@/lib/orden-pagina-reglas";
import type { OpcionesNuevaOrden } from "@/lib/produccion";
import { firmar } from "@/lib/responsable-reglas";
import type { Tolerado } from "@/lib/resultado";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Agregar un paso» (ADR-0566): una orden que se abrió sin un paso opcional —hoy, Ojales y botones— lo suma después, mientras ningún paso de más adelante haya empezado. Es la misma fila de «Cambiar quién»
// y de la hoja de Nueva orden (`FilaFase`: el segmento Taller / Afuera, el proveedor, la tarifa sugerida desde su lista de precios, la cantidad mínima, la fecha y el fijo) y, como ahí, lo que falta sale de
// `problemasFases`, que dice lo mismo que la base rechazaría (`agregar_paso_orden` → `fn_produccion_fases_normalizar`); la base vuelve a validar y pone el candado de «un paso de después ya empezó»
// (`paso_despues_empezado`). Un servicio que todavía no está en el directorio se registra desde aquí, o queda «pendiente de registrar».
//
// Lo del MODELO: Ojales y botones es un dato del modelo (ADR-0551). Si nadie ha dicho si este modelo los lleva, agregar el paso lo deja anotado como «sí lleva» y las próximas órdenes nacen con el paso
// prendido; si el modelo ya decía que no, el paso vale solo para esta orden y la hoja lo dice. Anotarlo es secundario: si falla, el paso ya quedó agregado.
//
// El aviso de éxito trae «Deshacer»: mientras el paso no tenga nada anotado, quitarlo es la misma llamada de «Quitar este paso» (`quitar_paso_orden`).

const RPC_GUARDAR_OJALES_BOTONES = "guardar_ojales_botones_modelo";

/** El paso como lo entiende la fila de Nueva orden: encendido, en el Taller y sin números escritos. */
function borradorNuevo(clave: FaseClave): FaseBorrador {
  return { clave, encendida: true, quien: "taller", proveedorId: null, tarifa: "", fijo: "", minimo: "", fechaPrometida: "", posicion: null };
}

export function AgregarPasoModal({ datos, pasos, opciones, hoy, onClose }: { datos: OrdenPagina; pasos: readonly PasoAgregable[]; opciones: Tolerado<OpcionesNuevaOrden> | null; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [clave, setClave] = useState<FaseClave>(pasos[0].clave);
  const [borrador, setBorrador] = useState<FaseBorrador>(() => borradorNuevo(pasos[0].clave));
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const paso = pasos.find((p) => p.clave === clave) ?? pasos[0];
  const nombreMinuscula = paso.nombre.toLocaleLowerCase("es");

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
  const guia = useGuiaCampos(camposDeAgregarPaso({ faltas: problemas.map((p) => p.texto), responsableListo: responsable.listo }));

  // Entre qué pasos de la ruta cae: lo dice la bajada para que se entienda qué cambia en la orden.
  const entre = useMemo(() => {
    const lugar = secuenciaDe(paso.clave, null) ?? 0;
    const antes = [...datos.fases].filter((f) => f.secuencia < lugar).sort((a, b) => b.secuencia - a.secuencia)[0];
    const despues = [...datos.fases].filter((f) => f.secuencia > lugar).sort((a, b) => a.secuencia - b.secuencia)[0];
    return antes && despues ? `Entra entre ${antes.nombre} y ${despues.nombre}.` : "";
  }, [datos.fases, paso.clave]);

  // Lo que el modelo dijo de ojales y botones (ADR-0551): `undefined` = nadie lo ha preguntado, o no se pudo leer la lista (entonces no se toca nada).
  const esOjales = paso.clave === "ojales_botones";
  const respuestaDelModelo: boolean | undefined = esOjales && opciones?.datos ? opciones.datos.ojalesBotones[datos.orden.producto.id] : undefined;
  const dejaAnotadoElModelo = esOjales && !!opciones?.datos && respuestaDelModelo === undefined;

  const fotoActual = fotoFormulario({ clave, borrador });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Elegiste cómo se hace el paso y todavía no se guardó. Si cierras ahora, se pierde lo que elegiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

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
    const r = fasesParaRpc([borrador], lista, hoy)[0];
    let resultado;
    try {
      resultado = await firmar(
        createClient().rpc(
          RPC_AGREGAR_PASO as never,
          {
            p_produccion_id: datos.orden.id,
            p_clave: r.clave,
            p_quien: r.quien,
            p_proveedor_id: r.proveedor_id,
            p_tarifa_prenda: r.tarifa_prenda,
            p_fijo_orden: r.fijo_orden,
            p_cantidad_minima: r.cantidad_minima,
            p_fecha_prometida: r.fecha_prometida,
            p_proveedor_pendiente: r.proveedor_pendiente === true,
            p_posicion: r.posicion,
          } as never
        ),
        firma
      );
    } finally {
      enVuelo.current = false;
    }
    const { data, error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, `agregar ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
      return;
    }
    // Lo que la base devuelve es la ruta entera (`fn_fases_de_orden`): de ahí sale el id del paso nuevo, que es lo que «Deshacer» necesita.
    const idDelNuevo = (Array.isArray(data) ? (data as { id?: string; clave?: string }[]) : []).find((f) => f.clave === paso.clave)?.id;
    if (dejaAnotadoElModelo) {
      try {
        await firmar(createClient().rpc(RPC_GUARDAR_OJALES_BOTONES as never, { p_ubicacion_id: datos.orden.ubicacionId, p_producto_id: datos.orden.producto.id, p_lleva: true } as never), firma);
      } catch {
        // Sin respuesta (corte de red): el paso ya está en la orden; el modelo queda sin contestar y la próxima orden vuelve a preguntar.
      }
    }
    const nombreDelServicio = proveedores.find((p) => p.id === borrador.proveedorId)?.nombre;
    const texto = borrador.quien !== "servicio" ? `${paso.nombre} entró a la orden, en el Taller` : borrador.pendiente ? `${paso.nombre} entró a la orden: sale afuera, pendiente de registrar quién` : `${paso.nombre} entró a la orden, afuera${nombreDelServicio ? ` con ${nombreDelServicio}` : ""}`;
    avisar.exito(texto, {
      detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}`,
      ...(idDelNuevo
        ? {
            accion: {
              texto: "Deshacer",
              onClick: async () => {
                const { error: e2 } = await firmar(createClient().rpc(RPC_QUITAR_PASO as never, { p_fase_id: idDelNuevo } as never), firma);
                if (e2) avisar.error(traducirError(e2, `quitar ${nombreMinuscula}`));
                router.refresh();
              },
            },
          }
        : {}),
    });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={pasos.length === 1 ? `Agregar ${paso.nombre}` : "Agregar un paso"}
      subtitulo={`${entre} ${paso.ayuda}.`.trim()}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        {pasos.length > 1 && (
          <CampoSelect
            id="agregar-paso-cual"
            etiqueta="Qué paso"
            valor={clave}
            onValor={(v) => {
              setClave(v as FaseClave);
              setBorrador(borradorNuevo(v as FaseClave));
            }}
            opciones={pasos.map((p) => ({ valor: p.clave, texto: p.nombre }))}
          />
        )}
        <div data-guia="prod-orden-agregar.fila">
          {/* `retiene="fila"`: el bloque tiene varios controles; la luz de la guía espera mientras la persona siga eligiendo dentro de él. */}
          <CampoGuiado id="fase" guia={guia} retiene="fila" className="space-y-2">
            <span className={`${campoEtiqueta} block`}>{guia.etiqueta("fase", "Quién lo hace")}</span>
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
            {!opciones?.datos && (
              <Aviso tono="info" chico>
                {opciones?.fallo ?? "No se pudo leer la lista de servicios."}
              </Aviso>
            )}
            {dejaAnotadoElModelo && (
              <p className="text-[12.5px] text-tinta/70">Esto también deja anotado que «{datos.orden.producto.referencia}» lleva ojales y botones: las próximas órdenes nacen con este paso.</p>
            )}
            {esOjales && respuestaDelModelo === false && (
              <Aviso tono="atencion" chico>
                El modelo dice que NO lleva ojales y botones: este paso vale solo para esta orden y el modelo no cambia.
              </Aviso>
            )}
          </CampoGuiado>
        </div>

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para agregar el paso." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Agregando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Agregar el paso
            </Boton>
          </div>
        </div>
      </form>
      {altaProveedor.modal}
      {avisoSalida.aviso}
    </Modal>
  );
}
