"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { FASES } from "@/lib/orden-fases-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { camposDeTarifa } from "@/lib/tarifas-servicios-guia";
import {
  RPC_GUARDAR_TARIFA,
  argumentosDeTarifa,
  entradaDesde,
  nombreDeFase,
  problemasDeTarifa,
  tarifaVigenteDe,
  textoDeLoQueSeReemplaza,
  textoTarifaGuardada,
  type ServicioParaTarifar,
  type TarifaDeServicio,
} from "@/lib/tarifas-servicios-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { useResponsable } from "@/lib/useResponsable";

// Cargar o cambiar la tarifa de un servicio de afuera en una fase (ADR-0400, actividad 8c; «Proveedores ▸ Servicios y tarifas»). Una tarifa NUEVA rige desde hoy y la anterior queda como historia
// (`guardar_tarifa_servicio`): las órdenes ya abiertas conservan la suya, porque la fase la copia al abrirse. Solo líder (la pantalla ya lo es y la base lo vuelve a comprobar).
// Con `tarifa`, la hoja renueva ESA tarifa (servicio y fase quedan fijos); sin ella, se elige a qué servicio y a qué fase. Un doble clic no guarda dos veces: una marca síncrona corta la segunda llamada.

export function TarifaServicioModal({
  tarifa,
  proveedorId,
  servicios,
  tarifas,
  onClose,
}: {
  tarifa: TarifaDeServicio | null;
  /** Al agregar desde la fila de un servicio, ese servicio ya viene elegido. */
  proveedorId?: string;
  servicios: ServicioParaTarifar[];
  tarifas: TarifaDeServicio[];
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [e, setE] = useState(() => entradaDesde(tarifa, proveedorId ?? (servicios.length === 1 ? servicios[0].id : "")));
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const hoy = hoyLima();

  const problemas = problemasDeTarifa(e);
  const guia = useGuiaCampos(camposDeTarifa(e, responsable.listo));
  const cambia = (cambio: Partial<typeof e>) => setE((antes) => ({ ...antes, ...cambio }));

  const nombreServicio = tarifa?.proveedorNombre ?? servicios.find((s) => s.id === e.proveedorId)?.nombre ?? "El servicio";
  // Lo que esta tarifa reemplaza: la vigente de ese servicio en esa fase (al renovar es la que se abrió; al agregar, la que ya hubiera).
  const reemplaza = tarifa ?? tarifaVigenteDe(tarifas, e.proveedorId, e.fase);

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona escribió.
  const fotoActual = fotoFormulario({ ...e });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Escribiste una tarifa y todavía no se guardó. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
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
    let resultado;
    try {
      // La función es nueva y los tipos generados todavía no la conocen (se regeneran con el volcado).
      resultado = await firmar(createClient().rpc(RPC_GUARDAR_TARIFA as never, argumentosDeTarifa(e) as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar la tarifa"));
      return;
    }
    avisar.exito(textoTarifaGuardada(nombreServicio, e.fase, argumentosDeTarifa(e).p_tarifa_prenda), { detalle: "Las órdenes nuevas la sugieren. Las que ya están abiertas conservan la suya." });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={tarifa ? "Cambiar la tarifa" : "Nueva tarifa"}
      subtitulo={tarifa ? `${tarifa.proveedorNombre} · ${nombreDeFase(tarifa.fase)}` : "Lo que cobra un servicio de afuera por prenda en una fase"}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        {!tarifa && (
          <div data-guia="prod-tarifa.servicio" className="grid gap-3 sm:grid-cols-2">
            <CampoGuiado id="servicio" guia={guia}>
              <CampoSelect
                id="tarifa-servicio"
                etiqueta={guia.etiqueta("servicio", "Servicio")}
                valor={e.proveedorId}
                onValor={(v) => cambia({ proveedorId: v })}
                opciones={servicios.map((s) => ({ valor: s.id, texto: s.nombre }))}
                marcador="Elegir el servicio"
              />
            </CampoGuiado>
            <CampoGuiado id="fase" guia={guia}>
              <CampoSelect
                id="tarifa-fase"
                etiqueta={guia.etiqueta("fase", "Fase")}
                valor={e.fase}
                onValor={(v) => cambia({ fase: v })}
                opciones={FASES.map((f) => ({ valor: f.clave, texto: f.nombre }))}
                marcador="Elegir la fase"
              />
            </CampoGuiado>
          </div>
        )}

        {reemplaza && (
          <p className="nota-cayla" role="status">
            {textoDeLoQueSeReemplaza(reemplaza, hoy, tarifa !== null)}
          </p>
        )}

        <div data-guia="prod-tarifa.tarifa">
          <CampoGuiado id="tarifa" guia={guia}>
            <CampoMonto
              etiqueta={guia.etiqueta("tarifa", "Cuánto cobra por prenda")}
              inputMode="decimal"
              placeholder="0.00"
              value={e.tarifa}
              onChange={(ev) => cambia({ tarifa: ev.target.value })}
              autoFocus={tarifa !== null}
            />
          </CampoGuiado>
        </div>

        <div data-guia="prod-tarifa.opcionales" className="grid gap-3 sm:grid-cols-2">
          <CampoGuiado id="minimo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("minimo", "Mínimo de prendas")}
              inputMode="numeric"
              placeholder="Opcional"
              pie="Si pide una cantidad mínima para esta tarifa"
              value={e.minimo}
              onChange={(ev) => cambia({ minimo: ev.target.value })}
            />
          </CampoGuiado>
          <CampoGuiado id="fijo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("fijo", "Fijo por orden")}
              inputMode="decimal"
              placeholder="Opcional"
              pie="Un monto único, además de lo de cada prenda"
              value={e.fijo}
              onChange={(ev) => cambia({ fijo: ev.target.value })}
            />
          </CampoGuiado>
        </div>

        <CampoTexto etiqueta="Nota" placeholder="Opcional" pie="Lo que conviene recordar de esta tarifa" value={e.nota} onChange={(ev) => cambia({ nota: ev.target.value })} maxLength={200} />

        <div data-guia="prod-tarifa.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar la tarifa." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              {tarifa ? "Guardar la tarifa nueva" : "Guardar la tarifa"}
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
