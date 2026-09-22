"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { CampoTexto, CampoSelect } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import type { CategoriaParaCotizar, CotizacionMaquila } from "@/lib/cotizaciones-maquila";
import { chipDeCotizacion, detalleDeCotizacion, masRecientePorCategoria, ordenarCotizaciones, textoDeVigencia } from "@/lib/cotizaciones-maquila-reglas";
import { sumarDias } from "@/lib/fechas-lima";

// D-82: cotización real de un taller externo para maquilar cada tipo de prenda — sin RPC de
// escritura, mismo criterio que `codigos_descuento` (CodigosDescuentoPanel.tsx): la RLS de la
// tabla ya exige `fn_es_lider()` y las reglas de negocio (precio ≥ 0, vigencia coherente) ya
// son `check` — no queda ninguna regla que una RPC tuviera que agregar encima.
const SEIS_MESES_EN_DIAS = 182;

const COLUMNAS =
  "@min-[640px]:grid @min-[640px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] @min-[900px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]";

export function CotizacionesMaquilaPanel({ cotizaciones, categorias, hoy }: { cotizaciones: CotizacionMaquila[]; categorias: CategoriaParaCotizar[]; hoy: string }) {
  const [creando, setCreando] = useState(false);
  const vigentes = ordenarCotizaciones(masRecientePorCategoria(cotizaciones), hoy);

  return (
    <div className="space-y-6">
      <div className="card-cayla anim-sube @container overflow-hidden" style={{ "--i": 6 } as CSSProperties}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5 pt-[18px] pb-3.5">
          <div className="min-w-0 flex-1 basis-80">
            <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
            <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Cotizaciones de maquila externa</h2>
            <p className="mt-0.5 max-w-[46rem] text-xs text-tinta/65">
              Lo que cobraría un taller externo por maquilar cada tipo de prenda — la referencia contra la que se mide el Taller (D-31). Una fila por tipo de
              prenda: la más reciente. Renovar es cargar una cotización nueva; ninguna se edita para &ldquo;actualizarla&rdquo;.
            </p>
          </div>
          <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={() => setCreando(true)}>
            Nueva cotización
          </BotonCompacto>
        </div>

        {vigentes.length === 0 ? (
          <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Todavía no hay ninguna cotización cargada.</p>
        ) : (
          <>
            <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/65 ${COLUMNAS}`}>
              <span>Tipo de prenda</span>
              <span className="text-right">Precio</span>
              <span>Vigencia</span>
              <span className="hidden @min-[900px]:inline">Proveedor</span>
              <span>Estado</span>
            </div>
            {vigentes.map((c) => (
              <FilaCotizacion key={c.categoriaId} cotizacion={c} hoy={hoy} />
            ))}
          </>
        )}
      </div>

      {creando && <NuevaCotizacionModal categorias={categorias} onClose={() => setCreando(false)} />}
    </div>
  );
}

function FilaCotizacion({ cotizacion: c, hoy }: { cotizacion: CotizacionMaquila; hoy: string }) {
  const chip = chipDeCotizacion(c, hoy);
  const detalle = detalleDeCotizacion(c, hoy);

  return (
    <div
      className={`flex flex-col gap-2 border-t border-tinta/10 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-normal text-tinta">{c.categoriaNombre}</p>
        <p className="mt-0.5 truncate text-[13px] text-tinta/65 @min-[900px]:hidden">{c.proveedorReferencia ?? "Sin proveedor anotado"}</p>
      </div>

      <p className="font-display text-lg leading-tight tabular-nums text-tinta @min-[640px]:text-right">S/ {c.precioMaquila.toFixed(2)}</p>

      <p className="text-[13px] text-tinta/75">{textoDeVigencia(c)}</p>

      <p className="hidden min-w-0 truncate text-[13px] text-tinta/75 @min-[900px]:block">{c.proveedorReferencia ?? "Sin proveedor anotado"}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <Chip tono={chip.tono}>{chip.texto}</Chip>
          <p className={`mt-1.5 text-[13px] leading-snug ${chip.tono !== "verde" ? "font-semibold text-ambar-profundo" : "text-tinta/65"}`}>{detalle}</p>
        </div>
      </div>
    </div>
  );
}

function NuevaCotizacionModal({ categorias, onClose }: { categorias: CategoriaParaCotizar[]; onClose: () => void }) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [precio, setPrecio] = useState("");
  const [fechaCotizacion, setFechaCotizacion] = useState("");
  // Sugerido, no forzado: 6 meses después de la fecha de cotización, pero una cotización real
  // de un taller puede durar otro plazo — la persona lo puede cambiar sin fricción.
  const [vigenteHasta, setVigenteHasta] = useState("");
  const [vigenteHastaTocado, setVigenteHastaTocado] = useState(false);
  const [proveedorReferencia, setProveedorReferencia] = useState("");
  const [loading, setLoading] = useState(false);

  function onFechaCotizacion(iso: string) {
    setFechaCotizacion(iso);
    if (!vigenteHastaTocado) setVigenteHasta(iso ? sumarDias(iso, SEIS_MESES_EN_DIAS) : "");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoriaId) {
      avisar.error("Elige el tipo de prenda.");
      return;
    }
    const monto = Number(precio);
    if (!precio || Number.isNaN(monto) || monto < 0) {
      avisar.error("El precio de maquila no puede ser negativo.", { enfocar: "cotizacion-precio" });
      return;
    }
    if (!fechaCotizacion) {
      avisar.error("Falta la fecha de la cotización.", { enfocar: "cotizacion-fecha" });
      return;
    }
    if (!vigenteHasta) {
      avisar.error("Falta hasta cuándo vale esta cotización.", { enfocar: "cotizacion-vigencia" });
      return;
    }
    if (vigenteHasta < fechaCotizacion) {
      avisar.error("La vigencia no puede terminar antes de la fecha de la cotización.", { enfocar: "cotizacion-vigencia" });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("cotizaciones_maquila").insert({
      categoria_id: categoriaId,
      precio_maquila: monto,
      fecha_cotizacion: fechaCotizacion,
      vigente_hasta: vigenteHasta,
      proveedor_referencia: proveedorReferencia.trim() || null,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "cargar la cotización"));
      return;
    }
    avisar.exito("Cotización cargada");
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Nueva cotización de maquila" subtitulo="Lo que cobraría un taller externo por maquilar este tipo de prenda hoy." onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <CampoSelect
            etiqueta="Tipo de prenda"
            valor={categoriaId}
            onValor={setCategoriaId}
            opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
            marcador="Elegir tipo de prenda"
          />
          <CampoTexto
            id="cotizacion-precio"
            etiqueta="Precio de maquila (S/, por prenda)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="22.50"
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoFecha id="cotizacion-fecha" etiqueta="Fecha de la cotización" valor={fechaCotizacion} onValor={onFechaCotizacion} />
            <CampoFecha
              id="cotizacion-vigencia"
              etiqueta="Vigente hasta"
              valor={vigenteHasta}
              onValor={(v) => {
                setVigenteHastaTocado(true);
                setVigenteHasta(v);
              }}
            />
          </div>
          <CampoTexto
            id="cotizacion-proveedor"
            etiqueta="Quién la dio (opcional)"
            value={proveedorReferencia}
            onChange={(e) => setProveedorReferencia(e.target.value)}
            placeholder="Taller Confecciones del Norte"
            pie="Para volver a pedirla cuando venza."
          />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} className={botonPrimario}>
              {loading ? "Cargando…" : "Cargar cotización"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
