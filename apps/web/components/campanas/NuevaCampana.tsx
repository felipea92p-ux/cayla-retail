"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { objecionVigencia, parsearFecha } from "@/lib/etiqueta-campana";
import { limpiarNombre, NOMBRE_MAX } from "@/lib/campana-detalle";
import { sugerirNombreCampana } from "@/lib/sugerencias-campanas";

/**
 * «Nueva campaña» (ADR-0436, actividad 2): el botón de la cabecera de Campañas y su hoja. Pide lo mínimo para que exista —el nombre y,
 * si ya se saben, las fechas— y lleva a la campaña recién creada, donde se le pone el descuento, las prendas y (actividad 4) su diseño.
 * Nace aprobada: quien la crea tiene la llave de las campañas (`crear_campana`).
 */
export function NuevaCampana({ nombresUsados, hoy }: { nombresUsados: string[]; hoy: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Boton peso="primario" onClick={() => setAbierta(true)} data-guia="campanas.nueva">
        <Plus aria-hidden className="h-4 w-4" />
        Nueva campaña
      </Boton>
      {abierta && <NuevaCampanaHoja nombresUsados={nombresUsados} hoy={hoy} onClose={() => setAbierta(false)} />}
    </>
  );
}

function NuevaCampanaHoja({ nombresUsados, hoy, onClose }: { nombresUsados: string[]; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [creando, setCreando] = useState(false);

  const limpio = limpiarNombre(nombre);
  const fDesde = parsearFecha(desde);
  const fHasta = parsearFecha(hasta);
  const objecion = fDesde.ok && fHasta.ok ? objecionVigencia(fDesde.valor, fHasta.valor) : null;
  const fechasBien = fDesde.ok && fHasta.ok && !objecion;
  const conFechas = desde !== "" || hasta !== "";
  const nombreBien = limpio.length > 0 && limpio.length <= NOMBRE_MAX;
  const guia = useGuiaCampos([
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombreBien, pendiente: limpio.length > NOMBRE_MAX ? `Hasta ${NOMBRE_MAX} letras.` : "Escribe el nombre de la campaña." },
    { id: "fechas", nombre: "Fechas", requerido: conFechas, hecho: conFechas && fechasBien, pendiente: "Corrige las fechas: «Hasta» no puede ser antes que «Desde»." },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  const valido = nombreBien && fechasBien && responsable.listo;

  async function crear() {
    if (!valido || !fDesde.ok || !fHasta.ok) return;
    setCreando(true);
    try {
      const { data, error } = await firmar(
        createClient().rpc("crear_campana" as never, { p_nombre: limpio, p_desde: fDesde.valor, p_hasta: fHasta.valor } as never),
        responsable.firma(),
      );
      responsable.despues(error);
      if (error) {
        avisar.error(traducirError(error, "crear la campaña"));
        return;
      }
      avisar.exito(`${limpio} creada`, { detalle: "Ponle su descuento y sus prendas." });
      router.push(`/tienda-web/campanas/${data as unknown as string}`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <Modal titulo="Nueva campaña" subtitulo="El nombre y, si ya las sabes, las fechas. El descuento, las prendas y su diseño se ponen después." onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-5" data-guia="campanas.nueva-hoja">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("nombre", "Nombre")}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={sugerirNombreCampana(nombresUsados, hoy)}
              maxLength={NOMBRE_MAX + 10}
              autoFocus
            />
          </CampoGuiado>
          <CampoGuiado id="fechas" guia={guia} titulo="Fechas" ayuda="Opcional: se pueden poner después">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} tono={fDesde.ok ? undefined : "error"} />
              <CampoTexto etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} tono={fHasta.ok && !objecion ? undefined : "error"} pie={objecion ?? undefined} />
            </div>
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <p className="campo-etiqueta">{guia.etiqueta("responsable", "Quién registra")}</p>
            <ComboResponsable control={responsable} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para crearla." />
          <PieAcciones>
            <Boton peso="fantasma" onClick={cerrar} disabled={creando}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={() => void crear()} cargando={creando} textoCargando="Creando…" disabled={!valido} title={guia.frase ?? undefined}>
              Crear campaña
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
