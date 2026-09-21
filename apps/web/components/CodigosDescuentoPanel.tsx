"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { Chip } from "@/components/ui/Chip";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { CampoTexto, CampoSelect } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import type { CodigoDescuento } from "@/lib/codigos-descuento";
import { coincide } from "@/lib/facturacion-busqueda";
import { camposDeBusquedaDelCodigo, chipDelCodigo, detalleDelCodigo, ordenarCodigos, textoDeVigencia } from "@/lib/facturacion-codigos-reglas";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import type { Ubicacion } from "@/lib/ubicaciones";

// Sin RPC a propósito, a diferencia del resto del sistema (que escribe todo por
// funciones security-definer): `codigos_descuento_insert`/`_update`
// (20260914215103_codigos_descuento.sql) ya exigen `fn_es_lider()` en la propia
// RLS, y las reglas de negocio (código 3-20 mayúsculas, 0 < % ≤ 100, vigencia
// coherente) ya son `check` de la tabla — no queda ninguna regla que una RPC
// tuviera que agregar encima. Escribir directo es la RLS haciendo su trabajo,
// no un atajo que se lo salta.
const TODAS_LAS_SEDES = "__todas__";

// Las columnas de la lista, según el ancho DE LA TARJETA (container queries) y no el de la ventana,
// igual que en Comprobantes y Proformas: con el menú lateral desplegado, una ventana de 768 px deja
// ~480 px de contenido. Desde 900 px de tarjeta la sede tiene su columna; entre 640 y 899 px pasa a
// la línea de abajo del código; por debajo de 640 px cada fila se apila.
const COLUMNAS =
  "@min-[640px]:grid @min-[640px]:grid-cols-[minmax(0,1fr)_64px_minmax(0,1.3fr)_minmax(0,1.3fr)] @min-[900px]:grid-cols-[minmax(0,1fr)_64px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)]";

// `hoy` es la fecha de Lima (`hoyLima`) que calculó la página: las tarjetas de arriba y cada fila
// cuentan con la misma, y es la misma con la que `registrar_venta` valida el código al cobrar.
export function CodigosDescuentoPanel({ codigos, ubicaciones, hoy }: { codigos: CodigoDescuento[]; ubicaciones: Ubicacion[]; hoy: string }) {
  const [creando, setCreando] = useState(false);
  const { texto: busqueda } = useFacturacionBusqueda();
  const visibles = ordenarCodigos(codigos, hoy).filter((c) => coincide(camposDeBusquedaDelCodigo(c, hoy), busqueda));

  return (
    <div className="space-y-6">
      <div className="card-cayla anim-sube @container overflow-hidden" style={{ "--i": 4 } as CSSProperties}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5 pt-[18px] pb-3.5">
          <div className="min-w-0 flex-1 basis-80">
            <p className="label-cayla text-[11px] text-tinta/65">Códigos de descuento</p>
            <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Todos los códigos</h2>
            <p className="mt-0.5 max-w-[46rem] text-xs text-tinta/65">
              Un líder descuenta sin código; una colaboradora necesita uno vigente, y su % es el tope por línea. Un código usado nunca se borra: se apaga. Los que
              vencen antes van primero.
            </p>
          </div>
          <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={() => setCreando(true)}>
            Nuevo código
          </BotonCompacto>
        </div>

        {codigos.length === 0 ? (
          <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Todavía no hay ningún código de descuento.</p>
        ) : visibles.length === 0 ? (
          <SinCoincidencias />
        ) : (
          <>
            <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/65 ${COLUMNAS}`}>
              <span>Código</span>
              <span className="text-right">%</span>
              <span>Vigencia</span>
              <span className="hidden @min-[900px]:inline">Sede</span>
              <span>Estado</span>
            </div>
            {visibles.map((c) => (
              <FilaCodigo key={c.codigo} codigo={c} hoy={hoy} />
            ))}
          </>
        )}
      </div>

      {creando && <CrearCodigoModal ubicaciones={ubicaciones} onClose={() => setCreando(false)} />}
    </div>
  );
}

function FilaCodigo({ codigo: c, hoy }: { codigo: CodigoDescuento; hoy: string }) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState(false);
  const chip = chipDelCodigo(c, hoy);
  const detalle = detalleDelCodigo(c, hoy);
  const sede = c.ubicacionNombre ?? "Todas las sedes";

  async function alternarActivo() {
    setCambiando(true);
    const supabase = createClient();
    const { error } = await supabase.from("codigos_descuento").update({ activo: !c.activo }).eq("codigo", c.codigo);
    setCambiando(false);
    if (error) {
      avisar.error(traducirError(error, `${c.activo ? "apagar" : "prender"} el código ${c.codigo}`));
      return;
    }
    avisar.exito(`Código ${c.codigo} ${c.activo ? "apagado" : "prendido"}`);
    router.refresh();
  }

  return (
    <div
      className={`flex flex-col gap-2 border-t border-tinta/10 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}
    >
      <div className="min-w-0">
        <p className={`truncate font-mono text-[15px] font-semibold leading-normal ${c.activo ? "text-tinta" : "text-tinta/40 line-through"}`}>{c.codigo}</p>
        <p className="mt-0.5 truncate text-[13px] text-tinta/65 @min-[900px]:hidden">{sede}</p>
      </div>

      <p className="font-display text-lg leading-tight tabular-nums text-tinta @min-[640px]:text-right">{c.porcentaje}%</p>

      <p className="text-[13px] text-tinta/75">{textoDeVigencia(c)}</p>

      <p className="hidden min-w-0 truncate text-[13px] text-tinta/75 @min-[900px]:block">{sede}</p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <Chip tono={chip.tono}>{chip.texto}</Chip>
          {detalle && <p className={`mt-1.5 text-[13px] leading-snug ${detalle.urgente ? "font-semibold text-ambar-profundo" : "text-tinta/65"}`}>{detalle.texto}</p>}
        </div>
        <BotonCompacto variante="fila" cargando={cambiando} onClick={alternarActivo}>
          {cambiando ? "…" : c.activo ? "Apagar" : "Prender"}
        </BotonCompacto>
      </div>
    </div>
  );
}

function CrearCodigoModal({ ubicaciones, onClose }: { ubicaciones: Ubicacion[]; onClose: () => void }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState("");
  const [vigenteHasta, setVigenteHasta] = useState("");
  const [ubicacionId, setUbicacionId] = useState(TODAS_LAS_SEDES);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limpio = codigo.trim().toUpperCase();
    if (limpio.length < 3 || limpio.length > 20) {
      avisar.error("El código va de 3 a 20 caracteres.", { enfocar: "codigo-nuevo" });
      return;
    }
    const pct = Number(porcentaje);
    if (!pct || pct <= 0 || pct > 100) {
      avisar.error("El porcentaje va de 1 a 100.", { enfocar: "codigo-porcentaje" });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("codigos_descuento").insert({
      codigo: limpio,
      porcentaje: pct,
      vigente_desde: vigenteDesde || null,
      vigente_hasta: vigenteHasta || null,
      ubicacion_id: ubicacionId === TODAS_LAS_SEDES ? null : ubicacionId,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "crear el código de descuento"));
      return;
    }
    avisar.exito(`Código ${limpio} creado`);
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Nuevo código de descuento" onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <CampoTexto
            id="codigo-nuevo"
            etiqueta="Código"
            value={codigo}
            // Mayúscula en vivo, no solo al enviar — mismo criterio que el campo de
            // código del cobro en PuntoDeVentaTicket.tsx: lo que se ve mientras se
            // escribe es lo que se va a guardar, sin sorpresa al tocar "Crear".
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="VERANO2026"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            mono
            maxLength={20}
          />
          <CampoTexto
            id="codigo-porcentaje"
            etiqueta="Porcentaje"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={porcentaje}
            onChange={(e) => setPorcentaje(e.target.value)}
            placeholder="10"
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoFecha etiqueta="Vigente desde (opcional)" valor={vigenteDesde} onValor={setVigenteDesde} />
            <CampoFecha etiqueta="Vigente hasta (opcional)" valor={vigenteHasta} onValor={setVigenteHasta} />
          </div>
          <CampoSelect
            etiqueta="Sede"
            valor={ubicacionId}
            onValor={setUbicacionId}
            opciones={[
              { valor: TODAS_LAS_SEDES, texto: "Todas las sedes" },
              ...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })),
            ]}
          />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} className={botonPrimario}>
              {loading ? "Creando…" : "Crear código"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
