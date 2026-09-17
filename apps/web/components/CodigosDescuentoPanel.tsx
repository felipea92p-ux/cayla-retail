"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { CampoTexto, CampoSelect, Boton } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import type { CodigoDescuento } from "@/lib/codigos-descuento";
import type { Ubicacion } from "@/lib/ubicaciones";

// Sin RPC a propósito, a diferencia del resto del sistema (que escribe todo por
// funciones security-definer): `codigos_descuento_insert`/`_update`
// (20260914215103_codigos_descuento.sql) ya exigen `fn_es_lider()` en la propia
// RLS, y las reglas de negocio (código 3-20 mayúsculas, 0 < % ≤ 100, vigencia
// coherente) ya son `check` de la tabla — no queda ninguna regla que una RPC
// tuviera que agregar encima. Escribir directo es la RLS haciendo su trabajo,
// no un atajo que se lo salta.
const TODAS_LAS_SEDES = "__todas__";

function formatearFecha(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso + "T00:00:00"));
}

function vigenciaTexto(c: CodigoDescuento) {
  if (!c.vigenteDesde && !c.vigenteHasta) return "Sin fecha límite";
  const desde = formatearFecha(c.vigenteDesde);
  const hasta = formatearFecha(c.vigenteHasta);
  if (desde && hasta) return `${desde} — ${hasta}`;
  if (hasta) return `Hasta ${hasta}`;
  return `Desde ${desde}`;
}

const PLANTILLA = "sm:grid-cols-[7rem_5rem_1fr_9rem_6rem]";

export function CodigosDescuentoPanel({ codigos, ubicaciones }: { codigos: CodigoDescuento[]; ubicaciones: Ubicacion[] }) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-tinta/65">
          Un Líder descuenta sin código; una Colaboradora necesita uno vigente, y su % es el tope por línea.
        </p>
        <Boton peso="primario" onClick={() => setCreando(true)}>
          + Nuevo código
        </Boton>
      </div>

      {codigos.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay ningún código de descuento.</p>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[{ titulo: "Código" }, { titulo: "%", alinear: "der" }, { titulo: "Vigencia" }, { titulo: "Sede" }, { titulo: "", alinear: "der" }]}
          />
          {codigos.map((c) => (
            <FilaCodigo key={c.codigo} codigo={c} />
          ))}
        </Tabla>
      )}

      {creando && <CrearCodigoModal ubicaciones={ubicaciones} onClose={() => setCreando(false)} />}
    </div>
  );
}

function FilaCodigo({ codigo: c }: { codigo: CodigoDescuento }) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState(false);

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
    <div className={fila(PLANTILLA)}>
      <span className={celda("izq", `font-mono font-semibold ${c.activo ? "text-tinta" : "text-tinta/40 line-through"}`)}>{c.codigo}</span>
      <span className={celda("der", "text-tinta/75")}>{c.porcentaje}%</span>
      <span className={celda("izq", "text-tinta/75")}>{vigenciaTexto(c)}</span>
      <span className={celda("izq", "text-tinta/75")}>{c.ubicacionNombre ?? "Todas"}</span>
      <span className={celda("der")}>
        <button
          type="button"
          onClick={alternarActivo}
          disabled={cambiando}
          className={`label-cayla text-[11px] underline-offset-2 hover:underline disabled:opacity-40 ${c.activo ? "text-rojo-profundo" : "text-verde-profundo"}`}
        >
          {cambiando ? "…" : c.activo ? "Apagar" : "Prender"}
        </button>
      </span>
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
