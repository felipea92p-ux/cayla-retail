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
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { faseDe, fasesParaRpc, problemasFases, proveedoresQueSirven, type FaseBorrador, type FaseClave, type FaseDelCatalogo, type Quien, type TarifaDeLista } from "@/lib/orden-fases-reglas";
import { camposDeAgregarPaso } from "@/lib/orden-pagina-guia";
import { OTRO_PROCESO, RPC_GUARDAR_PROCESO, despuesDeEnLaRuta, problemaDeNombreDeProceso } from "@/lib/procesos-reglas";
import {
  MAX_MOTIVO_CAMBIO,
  MOTIVOS_PASO_TARDE,
  RPC_AGREGAR_PASO,
  RPC_AGREGAR_PASO_TARDE,
  RPC_QUITAR_PASO,
  avisoDePasoTarde,
  diaParaLaBase,
  fechaLimaDe,
  pasoPosteriorEmpezado,
  problemaDeDia,
  problemaDeMotivoCambio,
  textoDePasosBloqueados,
  type OrdenPagina,
  type PasoAgregable,
  type PasoNoAgregable,
} from "@/lib/orden-pagina-reglas";
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
// Lo del MODELO (ADR-0551, ADR-0570 actividad 5): lo que lleva cada modelo es un dato del modelo. «Recordar en la ficha» (marcada si el modelo no decía que no) deja anotado que lo lleva y las
// próximas órdenes nacen con el paso prendido; desmarcada, el paso vale solo para esta orden. Anotarlo es secundario: si falla, el paso ya quedó agregado.
//
// «Otro proceso…» (ADR-0570, actividad 5): un líder da de alta un proceso que el catálogo no tiene (nombre y después de qué paso de esta orden va) y lo agrega en el mismo guardado; quien no es
// líder ve que se lo tiene que pedir. El alta va primero: si después falla agregarlo, el proceso ya queda en el catálogo para la próxima vez.
//
// Lo que NO se puede agregar se ve, no se esconde (ADR-0566, «la sección lo dice»): un paso cuyo siguiente ya empezó sale en la lista, apagado y con su motivo, y una frase debajo del combo lo explica.
// Un líder siempre ve «+ Agregar un paso» (puede dar de alta «Otro proceso…»), así que la página ya no lo dice por su cuenta. «Otro proceso…» pasa por la misma regla: si iría antes de un paso que ya
// empezó se frena aquí, no después de haberlo dado de alta en el catálogo (el alta va primero).
//
// El aviso de éxito trae «Deshacer»: mientras el paso no tenga nada anotado, quitarlo es la misma llamada de «Quitar este paso» (`quitar_paso_orden`).
//
// Un paso que se OLVIDÓ (ADR-0586, Felipe 2026-10-30): si uno de después ya avanzó, un líder lo agrega igual y entra YA hecho, con todas las prendas que le llegaron (`agregar_paso_tarde`).
// La hoja pide además cuándo se hizo y por qué se agrega tarde, no ofrece «Prometido para» (ya volvió) ni «Deshacer» (ya tiene su trabajo anotado). Quien no es líder lo ve apagado.

const RPC_GUARDAR_PROCESO_MODELO = "guardar_proceso_modelo";

/** El paso como lo entiende la fila de Nueva orden: encendido, sin números escritos y con quién lo hace de costumbre. Un proceso que de costumbre va afuera nace afuera, pendiente de elegir con quién. */
function borradorNuevo(clave: FaseClave, quien: Quien = "taller"): FaseBorrador {
  return { clave, encendida: true, quien, proveedorId: null, tarifa: "", fijo: "", minimo: "", fechaPrometida: "", posicion: null };
}

export function AgregarPasoModal({
  datos,
  pasos,
  bloqueados = [],
  opciones,
  hoy,
  esLider = false,
  onClose,
}: {
  datos: OrdenPagina;
  pasos: readonly PasoAgregable[];
  /** Los pasos que no entran porque uno de después ya empezó: se listan apagados, con su motivo. */
  bloqueados?: readonly PasoNoAgregable[];
  opciones: Tolerado<OpcionesNuevaOrden> | null;
  hoy: string;
  /** Un líder puede dar de alta «Otro proceso…» desde aquí (la base lo vuelve a exigir: `proceso_solo_lider`). */
  esLider?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const primero = pasos[0]?.clave ?? OTRO_PROCESO;
  const [clave, setClave] = useState<FaseClave>(primero);
  const [borrador, setBorrador] = useState<FaseBorrador>(() => borradorNuevo(primero, pasos[0]?.quienSugerido));
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  // «Otro proceso…»: el nombre y después de qué paso de esta orden va.
  const esOtro = clave === OTRO_PROCESO;
  const [nombreOtro, setNombreOtro] = useState("");
  const rutaOrdenada = useMemo(() => [...datos.fases].sort((a, b) => a.secuencia - b.secuencia), [datos.fases]);
  const [despuesDe, setDespuesDe] = useState<string>(() => despuesDeEnLaRuta(datos.fases));
  const problemaNombre = esOtro ? problemaDeNombreDeProceso(nombreOtro, datos.procesos) : null;
  const paso: PasoAgregable = esOtro
    ? { clave: OTRO_PROCESO, nombre: nombreOtro.trim() || "Otro proceso", ayuda: "", lugar: (rutaOrdenada.find((f) => f.clave === despuesDe)?.secuencia ?? 0) + 0.5, quienSugerido: "taller", tarde: null }
    : (pasos.find((p) => p.clave === clave) ?? pasos[0]);
  const nombreMinuscula = paso.nombre.toLocaleLowerCase("es");
  const otroTarde = esOtro ? pasoPosteriorEmpezado(datos.fases, paso.lugar) : undefined;
  const textoBloqueados = textoDePasosBloqueados(bloqueados);
  // ADR-0586: el paso va antes de uno que ya avanzó; entra ya hecho y pide el día y el motivo.
  const tarde = paso.tarde;
  const apertura = fechaLimaDe(datos.orden.creadoEn);
  const [dia, setDia] = useState(hoy);
  const [porque, setPorque] = useState("");
  const problemaDia = tarde ? problemaDeDia(dia, hoy, apertura) : null;
  const problemaMotivo = tarde ? problemaDeMotivoCambio(porque) : null;
  // La fila de «Quién lo hace» dibuja el nombre del paso desde el catálogo: un proceso que todavía no existe lleva el nombre que se está escribiendo, no su clave de mentira.
  const catalogoDeLaFila = useMemo<ReadonlyArray<FaseDelCatalogo>>(
    () => (esOtro ? [...datos.procesos, { ...faseDe("pegar_cierre", datos.procesos), clave: OTRO_PROCESO, nombre: nombreOtro.trim() || "Proceso nuevo", ayuda: "", delSistema: false }] : datos.procesos),
    [esOtro, datos.procesos, nombreOtro]
  );

  const proveedoresDelDirectorio = useMemo(() => proveedoresQueSirven(opciones?.datos?.proveedores ?? []), [opciones]);
  // Quien todavía no está en el directorio se registra desde aquí (la hoja no se cierra ni se pierde lo elegido).
  const altaProveedor = useAltaDeProveedorServicio(proveedoresDelDirectorio, (n) => ({ ...n, tarifas: [] }));
  const proveedores = altaProveedor.proveedores;
  const opcionesProveedor = useMemo(() => proveedores.map((p) => ({ valor: p.id, texto: p.nombre })), [proveedores]);
  const lista = useMemo<TarifaDeLista[]>(
    () => (opciones?.datos?.proveedores ?? []).flatMap((p) => p.tarifas.map((t) => ({ proveedorId: p.id, faseClave: t.faseClave as FaseClave, tarifa: t.tarifa, minimo: t.minimo, fijo: t.fijo, vigenteDesde: t.vigenteDesde }))),
    [opciones]
  );
  // La fila de un proceso nuevo todavía no tiene clave: se valida con la de un proceso del Taller cualquiera (las reglas de quién lo hace no dependen del proceso, salvo el Ploteo).
  const problemas = useMemo(() => problemasFases([esOtro ? { ...borrador, clave: "pegar_cierre" } : borrador], { hoy, proveedores, lista, catalogo: datos.procesos }), [borrador, esOtro, hoy, proveedores, lista, datos.procesos]);
  const faltas = [...(esOtro && !esLider ? ["Solo un líder da de alta un proceso nuevo. Pídeselo, o elige uno de la lista."] : []), ...(problemaNombre ? [problemaNombre] : []), ...(otroTarde ? [`${otroTarde.nombre} ya empezó, y ${paso.nombre === "Otro proceso" ? "un proceso nuevo" : paso.nombre} iría antes. Elige un paso de más adelante en «Va después de».`] : []), ...problemas.map((p) => p.texto)];
  const guia = useGuiaCampos(camposDeAgregarPaso({ faltas, responsableListo: responsable.listo, tarde: tarde ? { problemaDia, problemaMotivo } : null }));

  // Entre qué pasos de la ruta cae: lo dice la bajada para que se entienda qué cambia en la orden.
  const entre = useMemo(() => {
    const antes = rutaOrdenada.filter((f) => f.secuencia < paso.lugar).at(-1);
    const despues = rutaOrdenada.find((f) => f.secuencia > paso.lugar);
    return antes && despues ? `Entra entre ${antes.nombre} y ${despues.nombre}.` : antes ? `Entra después de ${antes.nombre}.` : "";
  }, [rutaOrdenada, paso.lugar]);

  // Lo que el modelo dijo de este proceso (ADR-0551, ADR-0570): `undefined` = nadie lo ha dicho, o no se pudo leer la lista.
  const respuestaDelModelo: boolean | undefined = !esOtro && opciones?.datos ? opciones.datos.procesosDelModelo[datos.orden.producto.id]?.[paso.clave] : undefined;
  // Marcada de fábrica, salvo que la ficha diga que el modelo NO lo lleva (entonces vale solo para esta orden hasta que alguien la marque). Se recuerda por proceso.
  const [recordarPor, setRecordarPor] = useState<Record<string, boolean>>({});
  const recordarMarcada = recordarPor[clave] ?? respuestaDelModelo !== false;
  const sePuedeRecordar = !!opciones?.datos || esOtro;

  const fotoActual = fotoFormulario({ clave, borrador, nombreOtro, despuesDe, dia, porque });
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
    if (tarde && (problemaDia || problemaMotivo)) {
      avisar.error((problemaDia ?? problemaMotivo) as string);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    const firma = responsable.firma();
    // «Otro proceso…»: primero el alta en el catálogo (solo un líder); con su clave, el paso entra como cualquier otro.
    let claveFinal = paso.clave;
    if (esOtro) {
      const alta = (await firmar(
        createClient().rpc(RPC_GUARDAR_PROCESO as never, { p_nombre: nombreOtro.trim(), p_clave: null, p_despues_de: despuesDe, p_ayuda: null, p_quien_sugerido: borrador.quien, p_activo: null } as never),
        firma
      )) as { data: unknown; error: { message: string; code?: string; hint?: string; details?: string } | null };
      if (alta.error || typeof alta.data !== "string") {
        enVuelo.current = false;
        responsable.despues(alta.error);
        setCargando(false);
        avisar.error(traducirError(alta.error ?? { message: "sin respuesta" }, `dar de alta ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
        return;
      }
      claveFinal = alta.data;
    }
    const r = fasesParaRpc([{ ...borrador, clave: claveFinal }], lista, hoy)[0];
    let resultado;
    try {
      const comun = {
        p_produccion_id: datos.orden.id,
        p_clave: r.clave,
        p_quien: r.quien,
        p_proveedor_id: r.proveedor_id,
        p_tarifa_prenda: r.tarifa_prenda,
        p_fijo_orden: r.fijo_orden,
        p_cantidad_minima: r.cantidad_minima,
        p_proveedor_pendiente: r.proveedor_pendiente === true,
        p_posicion: r.posicion,
      };
      resultado = await firmar(
        tarde
          ? createClient().rpc(RPC_AGREGAR_PASO_TARDE as never, { ...comun, p_motivo: porque.trim(), p_hecho_en: diaParaLaBase(dia, hoy) } as never)
          : createClient().rpc(RPC_AGREGAR_PASO as never, { ...comun, p_fecha_prometida: r.fecha_prometida } as never),
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
    const idDelNuevo = (Array.isArray(data) ? (data as { id?: string; clave?: string }[]) : []).find((f) => f.clave === claveFinal)?.id;
    if (sePuedeRecordar && recordarMarcada && respuestaDelModelo !== true) {
      try {
        await firmar(createClient().rpc(RPC_GUARDAR_PROCESO_MODELO as never, { p_ubicacion_id: datos.orden.ubicacionId, p_producto_id: datos.orden.producto.id, p_clave: claveFinal, p_lleva: true } as never), firma);
      } catch {
        // Sin respuesta (corte de red): el paso ya está en la orden; el modelo queda como estaba y la próxima orden no lo sugiere.
      }
    }
    const nombreDelServicio = proveedores.find((p) => p.id === borrador.proveedorId)?.nombre;
    const texto = tarde
      ? `${paso.nombre} entró a la orden ya hecho, con ${tarde.prendas} ${tarde.prendas === 1 ? "prenda" : "prendas"}`
      : borrador.quien !== "servicio"
        ? `${paso.nombre} entró a la orden, en el Taller`
        : borrador.pendiente
          ? `${paso.nombre} entró a la orden: sale afuera, pendiente de registrar quién`
          : `${paso.nombre} entró a la orden, afuera${nombreDelServicio ? ` con ${nombreDelServicio}` : ""}`;
    avisar.exito(texto, {
      detalle: `${datos.orden.numeroTexto} · ${tarde ? "queda en la historia" : datos.orden.producto.referencia}`,
      // Un paso que entró ya hecho tiene su trabajo anotado: «Quitar este paso» ya no lo acepta, así que no hay «Deshacer».
      ...(idDelNuevo && !tarde
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
      titulo="Agregar un paso"
      subtitulo={[entre, paso.ayuda ? `${paso.ayuda}.` : ""].filter(Boolean).join(" ")}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <CampoSelect
          id="agregar-paso-cual"
          etiqueta="Qué paso"
          valor={clave}
          onValor={(v) => {
            setClave(v as FaseClave);
            setBorrador(borradorNuevo(v as FaseClave, pasos.find((p) => p.clave === v)?.quienSugerido));
          }}
          opciones={[
            ...pasos.map((p) => ({ valor: p.clave, texto: p.tarde ? `${p.nombre} · entra ya hecho` : p.nombre })),
            ...bloqueados.map((b) => ({ valor: b.clave, texto: `${b.nombre} · ${b.yaEmpezo} ya empezó`, deshabilitada: true })),
            { valor: OTRO_PROCESO, texto: "Otro proceso…" },
          ]}
        />
        {textoBloqueados && (
          <Aviso tono="info" chico>
            {textoBloqueados}
            {!esLider && " Si se olvidó anotarlo, un líder puede agregarlo ya hecho."}
          </Aviso>
        )}
        {tarde && (
          <Aviso tono="atencion" chico guia="prod-orden-agregar.tarde">
            {avisoDePasoTarde(paso.nombre, tarde)}
          </Aviso>
        )}
        {esOtro && (
          <div className="space-y-3" data-guia="prod-orden-agregar.otro">
            {esLider ? (
              <>
                <CampoTexto
                  id="agregar-paso-nombre"
                  etiqueta="Nombre del proceso"
                  value={nombreOtro}
                  onChange={(e) => setNombreOtro(e.target.value)}
                  placeholder="Ej. Teñido en frío" // sugerir-fijo: el nombre de un proceso del Taller no depende de nada elegido antes en la hoja
                  maxLength={40}
                  pie={problemaNombre ?? "Queda en el catálogo del Taller para las próximas órdenes."}
                  tono={problemaNombre && nombreOtro.trim() !== "" ? "error" : undefined}
                  caja
                />
                <CampoSelect
                  id="agregar-paso-despues"
                  etiqueta="Va después de"
                  valor={despuesDe}
                  onValor={setDespuesDe}
                  opciones={rutaOrdenada.map((f) => ({ valor: f.clave, texto: f.nombre }))}
                />
              </>
            ) : (
              <Aviso tono="info" chico>
                Solo un líder da de alta un proceso nuevo, en Producción ▸ Proveedores ▸ Servicios y tarifas. Pídeselo, o elige uno de la lista.
              </Aviso>
            )}
          </div>
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
                catalogo={catalogoDeLaFila}
                onCambiar={(parche) => setBorrador((b) => ({ ...b, ...parche }))}
                onAgregarProveedor={altaProveedor.abrir}
                sinFechaPrometida={tarde !== null}
              />
            </div>
            {!opciones?.datos && (
              <Aviso tono="info" chico>
                {opciones?.fallo ?? "No se pudo leer la lista de servicios."}
              </Aviso>
            )}
            {sePuedeRecordar && respuestaDelModelo !== true && (
              <label className="flex items-start gap-2.5 text-[13px] text-tinta" data-guia="prod-orden-agregar.recordar">
                <Casilla marcada={recordarMarcada} onCambio={() => setRecordarPor((r) => ({ ...r, [clave]: !recordarMarcada }))} etiqueta="Recordar en la ficha del modelo" />
                <span>
                  Recordar en la ficha del modelo
                  <span className="block text-[12.5px] text-tinta/70">
                    {respuestaDelModelo === false
                      ? `La ficha de «${datos.orden.producto.referencia}» dice que no lleva ${nombreMinuscula}: márcala si de ahora en adelante sí lo lleva.`
                      : `Las próximas órdenes de «${datos.orden.producto.referencia}» nacen con este paso.`}
                  </span>
                </span>
              </label>
            )}
          </CampoGuiado>
        </div>

        {tarde && (
          <div className="space-y-4" data-guia="prod-orden-agregar.dia-y-porque">
            <CampoGuiado id="dia" guia={guia}>
              <CampoFecha
                etiqueta={guia.etiqueta("dia", borrador.quien === "servicio" ? "¿Cuándo volvió?" : "¿Cuándo se hizo?")}
                id="agregar-paso-dia"
                valor={dia}
                onValor={setDia}
                tono={problemaDia ? "error" : "neutro"}
                pie={problemaDia ?? (dia === hoy ? "Hoy. Si fue otro día, cámbialo: se guarda aparte cuándo lo anotaste." : "Se guarda aparte cuándo lo anotaste.")}
              />
            </CampoGuiado>
            <CampoGuiado id="porque" guia={guia} className="space-y-2">
              <span className={campoEtiqueta}>{guia.etiqueta("porque", "¿Por qué se agrega tarde?")}</span>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_PASO_TARDE.map((m) => (
                  <button key={m} type="button" className="pildora-cayla" aria-pressed={porque === m} onClick={() => setPorque(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <CampoTexto etiqueta="O cuéntalo con tus palabras" id="agregar-paso-porque" pie="Queda en la historia de la orden" value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={MAX_MOTIVO_CAMBIO} />
            </CampoGuiado>
          </div>
        )}

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo={tarde ? "Todo listo para agregar el paso ya hecho." : "Todo listo para agregar el paso."} conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Agregando…" disabled={!guia.puedeConfirmar || (esOtro && (!esLider || problemaNombre !== null || otroTarde !== undefined))} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              {tarde ? "Agregar ya hecho" : "Agregar el paso"}
            </Boton>
          </div>
        </div>
      </form>
      {altaProveedor.modal}
      {avisoSalida.aviso}
    </Modal>
  );
}
