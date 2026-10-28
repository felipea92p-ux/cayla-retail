"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { ElegirDibujoDeInsignia } from "@/components/sellos/ElegirDibujoDeInsignia";
import { cambioDeDibujo, type EleccionDeDibujo } from "@/lib/eleccion-de-dibujo";
import { cambioDeNombre } from "@/lib/editar-etiqueta";
import { objecionVigencia, parsearFecha } from "@/lib/etiqueta-campana";
import { avisoDiaDeSemana, repetirTemporada } from "@/lib/etiqueta-vigencia";
import type { ControlResponsable } from "@/lib/useResponsable";

/** Cuándo rige una campaña: cada punta es `null` si se dejó vacía (rige sin esa fecha). */
type FechasDeCampana = { desde: string | null; hasta: string | null };

/** Lo que se guarda al editar: cada parte es `null` si no cambió (así la hoja solo escribe lo que la persona tocó). */
export type CambiosDeEtiqueta = { nombre: string | null; dibujo: EleccionDeDibujo | null; fechas: FechasDeCampana | null };

/**
 * «Editar» en el pase de una insignia o campaña que ya existe (ADR-0490, ampliado el 2026-10-27): corrige su nombre —un error de ortografía al
 * registrarla— y cambia el dibujo o la imagen que lleva. Guardar escribe solo lo que cambió (el nombre por `PATCH nombre`; el dibujo por
 * `fijar_icono_etiqueta`, y si es una imagen nueva, antes se sube al almacén) y lo firma el combo «Responsable», como crear una insignia
 * (ADR-0161). Una campaña, además, cambia aquí sus fechas de inicio y fin (Felipe 2026-10-28: ya no se tocan en «Configuración», que es de las
 * ofertas); si su temporada ya pasó, ofrece «Repetir en 2027», que le pasa las mismas fechas al año que viene (lo que antes hacía «Repetir» en «Configuración»). Su guía de foco sale
 * de lo que ya apaga el botón: un nombre que no esté vacío, algo que cambie, unas fechas en orden y alguien que firma.
 */
export function EditarEtiquetaModal({
  nombre,
  actual,
  esDelNombre,
  esCampana,
  fechas,
  hoy,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  /** El nombre que lleva hoy. */
  nombre: string;
  /** Lo que lleva hoy: su imagen propia, el dibujo que eligió o el de su nombre (`eleccionDeLoGuardado`). */
  actual: EleccionDeDibujo;
  /** `true` si nunca eligió: lo que lleva sale de su nombre. */
  esDelNombre: boolean;
  esCampana: boolean;
  /** Solo una campaña: las fechas que lleva hoy. Sin ellas (una insignia) la hoja no pregunta cuándo rige. */
  fechas?: FechasDeCampana;
  /** Hoy en Lima (`AAAA-MM-DD`): dice si la temporada ya pasó y se puede repetir. */
  hoy: string;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: (cambios: CambiosDeEtiqueta) => void;
  onClose: () => void;
}) {
  const [nombreNuevo, setNombreNuevo] = useState(nombre);
  const [eleccion, setEleccion] = useState<EleccionDeDibujo | null>(null);
  // Una campaña que ya pasó ofrece «Repetir en 2027»: le pone las mismas fechas, un año después (se guardan solo con «Guardar cambios»).
  const [repeticion] = useState(() => (fechas ? repetirTemporada(fechas.desde, fechas.hasta, hoy) : null));
  const [repitio, setRepitio] = useState(false);
  const [fDesde, setFDesde] = useState(fechas?.desde ?? "");
  const [fHasta, setFHasta] = useState(fechas?.hasta ?? "");
  const repetir = () => {
    setFDesde(repeticion?.desde ?? "");
    setFHasta(repeticion?.hasta ?? "");
    setRepitio(true);
  };
  const volverAlAnio = () => {
    setFDesde(fechas?.desde ?? "");
    setFHasta(fechas?.hasta ?? "");
    setRepitio(false);
  };
  const valor = eleccion ?? actual;
  const nombreCambio = cambioDeNombre(nombre, nombreNuevo);
  const dibujoCambio = eleccion !== null && cambioDeDibujo(actual, eleccion);
  const nombreVacio = nombreNuevo.trim() === "";
  // Lo mismo que cierra la base (no termina antes de empezar) y la API, dicho antes de ir.
  const pDesde = parsearFecha(fDesde);
  const pHasta = parsearFecha(fHasta);
  const objecion = pDesde.ok && pHasta.ok ? objecionVigencia(pDesde.valor, pHasta.valor) : null;
  const fechasBien = pDesde.ok && pHasta.ok && !objecion;
  const rango = { desde: pDesde.ok ? pDesde.valor : null, hasta: pHasta.ok ? pHasta.valor : null };
  const fechasCambio = fechas !== undefined && (fDesde !== (fechas.desde ?? "") || fHasta !== (fechas.hasta ?? ""));
  const hayCambio = nombreCambio || dibujoCambio || fechasCambio;
  const avisoDia = repeticion && repitio ? avisoDiaDeSemana(repeticion, { desde: fDesde, hasta: fHasta }) : null;
  const delUno = esCampana ? "de la campaña" : "de la insignia";
  // Nombre, dibujo y fechas son UN solo campo para la guía: basta con cambiar uno. Las fechas, además, piden corregirse si quedan en desorden.
  const guia = useGuiaCampos([
    {
      id: "cambio",
      nombre: fechas ? "Nombre, ícono o fechas" : "Nombre o ícono",
      requerido: true,
      hecho: hayCambio && !nombreVacio,
      pendiente: nombreVacio ? `Escribe el nombre ${delUno}.` : fechas ? "Corrige el nombre, elige otro ícono o cambia las fechas." : "Corrige el nombre o elige otro ícono.",
    },
    ...(fechas
      ? [{ id: "vigencia", nombre: "Fechas", requerido: Boolean(fDesde || fHasta), hecho: Boolean(fDesde || fHasta) && fechasBien, pendiente: "Corrige las fechas: «Hasta» no puede ser antes que «Desde»." }]
      : []),
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  const puedeGuardar = hayCambio && !nombreVacio && fechasBien && responsable.listo;
  return (
    <Modal titulo={`Editar ${esCampana ? "la campaña" : "la insignia"}`} subtitulo={nombre} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="cambio" guia={guia} className="space-y-4">
            <CampoTexto
              etiqueta={`Nombre ${delUno}`}
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              disabled={guardando}
              autoFocus
              sinPie
            />
            <Campo etiqueta="Ícono" idEtiqueta="dibujo-cambiar" sinPie>
              <ElegirDibujoDeInsignia
                valor={valor}
                yaElegido={eleccion !== null || !esDelNombre}
                onValor={setEleccion}
                idEtiqueta="dibujo-cambiar"
                deshabilitado={guardando}
              />
            </Campo>
          </CampoGuiado>
          {fechas && (
            <CampoGuiado id="vigencia" guia={guia} titulo="Cuándo rige">
              {repeticion && !repitio && (
                <Aviso
                  tono="atencion"
                  chico
                  titulo="Esta campaña ya terminó"
                  accion={
                    <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={repetir} disabled={guardando}>
                      {`Repetir en ${repeticion.anio}`}
                    </button>
                  }
                >
                  Pásale sus fechas al año que viene con un toque, o escribe otras.
                </Aviso>
              )}
              {repeticion && repitio && (
                <Aviso tono="info" chico titulo={`Le puse las fechas de ${repeticion.anio}`} accion={<BotonDeshacer onClick={volverAlAnio} />}>
                  Revísalas y guarda para repetirla.
                </Aviso>
              )}
              <div className={`grid gap-4 sm:grid-cols-2 ${repeticion ? "mt-3" : ""}`}>
                {/* Cada calendario pinta la temporada entera: se elige una punta viendo dónde está la otra. */}
                <CampoFecha etiqueta="Desde" valor={fDesde} onValor={setFDesde} tono={pDesde.ok ? undefined : "error"} rango={rango} disabled={guardando} />
                <CampoFecha etiqueta="Hasta" valor={fHasta} onValor={setFHasta} tono={pHasta.ok && !objecion ? undefined : "error"} pie={objecion ?? undefined} rango={rango} disabled={guardando} />
              </div>
              {/* Al repetir, sumar un año cambia el día de la semana: si la fiesta va siempre el mismo día, un toque corre la temporada entera. */}
              {avisoDia && repeticion?.mismoDia && (
                <Aviso tono="info" chico titulo={avisoDia.titulo}>
                  {avisoDia.detalle}{" "}
                  {avisoDia.modo === "sumando-un-anio" ? (
                    <button
                      type="button"
                      className="btn-cayla btn-enlace text-xs"
                      onClick={() => {
                        setFDesde(repeticion.mismoDia?.desde ?? "");
                        setFHasta(repeticion.mismoDia?.hasta ?? "");
                      }}
                    >
                      {avisoDia.boton}
                    </button>
                  ) : (
                    <BotonDeshacer
                      onClick={() => {
                        setFDesde(repeticion.desde ?? "");
                        setFHasta(repeticion.hasta ?? "");
                      }}
                    />
                  )}
                </Aviso>
              )}
            </CampoGuiado>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="pie-acciones">
            <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              onClick={() =>
                onGuardar({
                  nombre: nombreCambio ? nombreNuevo.trim() : null,
                  dibujo: dibujoCambio ? eleccion : null,
                  fechas: fechasCambio ? { desde: fDesde.trim() || null, hasta: fHasta.trim() || null } : null,
                })
              }
              cargando={guardando}
              disabled={!puedeGuardar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar cambios
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
