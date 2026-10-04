"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  avisoCargaInicial,
  chipCargaInicial,
  consecuenciaDelCierre,
  estadoCargaInicial,
  fechaCorta,
  validarCierre,
  type LecturaCargaInicial,
  type SedeCargaInicial,
} from "@/lib/carga-inicial-reglas";

// Configuración ▸ Tiendas y caja ▸ «Carga inicial de cada sede» (ADR-0328, actividad 4). La carga inicial sin papeles (alta con
// stock, stock inicial de una prenda nueva en la tienda) se cierra POR SEDE y SOLA en su fecha: el último día abierto. Aquí se ve
// la fecha de cada sede y se cambia con `fijar_cierre_carga_inicial`, que es quien decide de verdad (la pantalla solo lo dice
// antes): apretar —poner fecha, adelantarla— es del líder; aflojar —reabrir, quitarla, correrla más adelante— solo del Admin.
//
// Por qué una HOJA con «Guardar» y no una casilla que se guarda al salir, como las metas: cerrar la carga de una sede cambia lo
// que la tienda puede hacer desde mañana, y una fecha mal tocada por un Tab de más no debería cerrarla. La hoja dice antes de
// confirmar qué va a pasar (`consecuenciaDelCierre`) y firma con el responsable.

export function ConfiguracionCargaInicial({ lectura, esLider, esAdmin }: { lectura: LecturaCargaInicial; esLider: boolean; esAdmin: boolean }) {
  const [abierta, setAbierta] = useState<SedeCargaInicial | null>(null);

  return (
    <Superficie className="anim-sube">
      <TituloDeTarjeta
        titulo="Carga inicial de cada sede"
        bajada="Hasta qué día cada sede carga, sin comprobante, lo que ya tenía al pasar al sistema. Pasada esa fecha, lo que aparezca entra por «Encontré prendas» (Existencias ▸ Ajustar), con su nota."
      />
      <div className="fin-tabla-wrap">
        <table className="fin-tabla fin-tabla-apretada">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Último día de carga</th>
              <th>Estado</th>
              <th aria-label="Acción" />
            </tr>
          </thead>
          <tbody>
            {lectura.sedes.map((s) => {
              const e = estadoCargaInicial(s.hasta, lectura.hoy);
              const chip = chipCargaInicial(e);
              // Reabrir una sede cerrada es aflojar: solo el Admin. Al líder no se le ofrece un botón que la base rechazaría.
              const puede = esLider && (e.tipo !== "cerrada" || esAdmin);
              return (
                <tr key={s.ubicacionId} className={e.tipo === "cerrada" ? "fin-suave" : undefined}>
                  <td className="fin-ancha" data-l="Sede">
                    <b>{s.nombre}</b>
                    {s.tipo !== "tienda" && <span className="fin-sub">{s.tipo === "taller" ? "Taller" : "Almacén"}</span>}
                  </td>
                  <td data-l="Último día de carga">{s.hasta ? fechaCorta(s.hasta) : <span className="fin-tenue">sin fecha</span>}</td>
                  <td data-l="Estado">
                    <Chip tono={chip.tono}>{chip.texto}</Chip>
                  </td>
                  <td data-l="">
                    <button
                      type="button"
                      className="btn-cayla btn-secundario btn-chico"
                      disabled={!puede}
                      title={!esLider ? "La fecha de cierre la fija un líder." : !puede ? "Reabrir una sede cerrada lo hace un Admin." : undefined}
                      onClick={() => setAbierta(s)}
                    >
                      {e.tipo === "cerrada" ? "Reabrir" : s.hasta ? "Cambiar fecha" : "Poner fecha"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PieTabla>
        <span>
          {esLider
            ? esAdmin
              ? "Como Admin puedes también reabrir una sede, quitarle la fecha o correr el cierre más adelante."
              : "Puedes poner la fecha o adelantarla. Reabrir una sede, quitarle la fecha o correr el cierre más adelante lo hace un Admin."
            : "La fecha la fija un líder."}{" "}
          Cada cambio queda en la historia con quién lo hizo.
        </span>
      </PieTabla>
      {abierta && <CierreCargaInicialModal sede={abierta} hoy={lectura.hoy} esLider={esLider} esAdmin={esAdmin} onClose={() => setAbierta(null)} />}
    </Superficie>
  );
}

function CierreCargaInicialModal({ sede, hoy, esLider, esAdmin, onClose }: { sede: SedeCargaInicial; hoy: string; esLider: boolean; esAdmin: boolean; onClose: () => void }) {
  const router = useRouter();
  // Firma quien decide, de turno en la sede ACTIVA, como el resto de Configuración (revisión adversarial): con la sede que se
  // configura, el cierre de AQP decidido por un líder de TRU lo firmaba alguien de turno en AQP, o no se podía guardar.
  const responsable = useResponsable();
  const estadoActual = estadoCargaInicial(sede.hasta, hoy);
  // Una sede cerrada arranca sin fecha elegida: cualquier fecha nueva la reabre, y eso se elige a propósito.
  const [fecha, setFecha] = useState(estadoActual.tipo === "cerrada" ? "" : (sede.hasta ?? ""));
  const [sinFecha, setSinFecha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  const nueva = sinFecha ? null : fecha || null;
  const v = sinFecha || fecha ? validarCierre({ actual: sede.hasta, nueva, hoy, esLider, esAdmin }) : null;
  const cambia = !!v && v.ok && v.cambia;
  // Un líder no puede correr el cierre más adelante: el calendario no ofrece días después de la fecha que ya tiene.
  const maximo = !esAdmin && sede.hasta && sede.hasta >= hoy ? sede.hasta : undefined;

  // Guía de foco (CLAUDE.md «Guía de foco», ADR-0284): sale de la misma regla que habilita «Guardar» (`validarCierre`).
  const guia = useGuiaCampos([
    {
      id: "fecha",
      nombre: "Último día de carga",
      requerido: true,
      hecho: cambia,
      pendiente: v && !v.ok ? v.error : v && v.ok && !v.cambia ? "Es la misma fecha que ya tiene: elige otra." : "Elige el último día de carga.",
    },
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace esta operación." },
  ]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) setError(responsable.motivo);
      return;
    }
    if (!v || !v.ok) {
      setError(v && !v.ok ? v.error : "Elige el último día de carga.");
      return;
    }
    if (!v.cambia) return onClose();
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const { error: errorRpc } = await firmar(
      createClient().rpc("fijar_cierre_carga_inicial", { p_ubicacion_id: sede.ubicacionId, p_fecha: nueva }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      // Las reglas de esta función vienen en castellano de CAYLA con un `hint` que empieza por «carga_inicial_».
      setError(errorRpc.hint?.startsWith("carga_inicial_") ? errorRpc.message : traducirError(errorRpc, "cambiar la fecha de cierre"));
      return;
    }
    avisar.exito(nueva ? `${sede.nombre} carga hasta el ${fechaCorta(nueva)}` : `${sede.nombre} quedó abierta, sin fecha`, {
      detalle: nueva ? "Desde el día siguiente, lo que aparezca entra por «Encontré prendas»." : undefined,
    });
    router.refresh();
    onClose();
  }

  const aviso = avisoCargaInicial({ sede: sede.nombre, hasta: sede.hasta, hoy });

  return (
    <Modal variante="hoja" titulo="Cierre de la carga inicial" subtitulo={sede.nombre} onClose={onClose} ancho="max-w-[480px]" bloqueado={enviando}>
      <form onSubmit={guardar} className="space-y-4" noValidate>
        <p className="text-[13px] text-taupe">{aviso ?? `${sede.nombre} todavía no tiene fecha: la carga inicial sigue abierta.`}</p>

        <CampoGuiado id="fecha" guia={guia}>
          <CampoFin
            etiqueta={guia.etiqueta("fecha", "Último día de carga")}
            htmlFor="cierre-carga-fecha"
            ayuda={cambia ? consecuenciaDelCierre(sede.nombre, nueva, hoy) : "Ese día todavía se carga; desde el siguiente, ya no."}
          >
            <InputFin
              id="cierre-carga-fecha"
              type="date"
              min={hoy}
              max={maximo}
              value={sinFecha ? "" : fecha}
              disabled={enviando || sinFecha}
              onChange={(ev) => {
                setFecha(ev.target.value);
                setError(null);
              }}
            />
          </CampoFin>
          {esAdmin && (sede.hasta !== null || sinFecha) && (
            <button
              type="button"
              className="btn-cayla btn-enlace mt-1.5 text-[12.5px]"
              disabled={enviando}
              onClick={() => {
                setSinFecha((x) => !x);
                setError(null);
              }}
            >
              {sinFecha ? "Prefiero poner una fecha" : "Dejarla abierta, sin fecha"}
            </button>
          )}
        </CampoGuiado>

        <div className="min-h-[1rem] text-xs text-rojo-profundo" role="alert">
          {error}
        </div>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para guardar." />

        <div className="fin-botones pie-hoja-fijo">
          <button type="button" className="btn-cayla btn-secundario" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="submit"
            className={`btn-cayla btn-primario ${guia.claseConfirmar}`}
            disabled={enviando || !guia.puedeConfirmar}
            title={responsable.motivo ?? guia.frase ?? undefined}
          >
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
