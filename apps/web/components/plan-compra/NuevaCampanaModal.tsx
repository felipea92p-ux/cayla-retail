"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace, CampoSelect, CampoTexto, type Opcion } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeLaCampana } from "@/lib/plan-compra-guia";
import {
  RPC_CREAR_CAMPANA,
  argsCrearCampana,
  borradorDeCampana,
  diferenciaConLaEtiqueta,
  fechaCortaES,
  type BorradorCampana,
  type EtiquetaCampana,
} from "@/lib/plan-compra-reglas";

// «Nueva campaña» del plan (ADR-0372, B3): el plan de una campaña NACE de una etiqueta «campaña» de Catálogo ▸ Etiquetas (una por etiqueta) y
// arranca con su nombre y sus fechas. Las fechas del plan son del plan: una ventana de compra puede ser más ancha que la de venta
// («Navidad» es del 11 al 25 y «Diciembre 2026» del 1 al 31), así que se pueden ajustar, y si difieren de las de la etiqueta la hoja lo dice.
// Solo un líder la abre (la base lo exige también). Guía de foco (ADR-0284): `camposDeLaCampana` sale de la misma regla que la base.

export function NuevaCampanaModal({ etiquetas, nombresEnUso, onClose }: { etiquetas: readonly EtiquetaCampana[]; nombresEnUso: readonly string[]; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const libres = useMemo(() => etiquetas.filter((e) => e.planId === null), [etiquetas]);
  const [b, setB] = useState<BorradorCampana>(() => borradorDeCampana(null));
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale (chaos 2026-10-10).
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDeLaCampana(b, etiquetas, nombresEnUso, { listo: responsable.listo, motivo: responsable.motivo }));
  const opciones: Opcion<string>[] = libres.map((e) => ({ valor: e.id, texto: `${e.nombre} · ${fechaCortaES(e.desde)} – ${fechaCortaES(e.hasta)}` }));
  const nota = diferenciaConLaEtiqueta(b, etiquetas.find((e) => e.id === b.etiquetaId));

  async function crear(cerrar: () => void) {
    if (!guia.puedeConfirmar || enviando.current) return;
    enviando.current = true;
    setTrabajando(true);
    const { data, error } = await firmar(createClient().rpc(RPC_CREAR_CAMPANA as never, argsCrearCampana(b) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    if (error) {
      // Puede que la campaña SÍ se haya creado (se cortó la red después de guardar) u otra persona la creó recién: se vuelven a leer las
      // campañas, así el selector la muestra y esta hoja dice que esa etiqueta ya tiene su plan (chaos 2026-10-10: decía «No se guardó nada»).
      router.refresh();
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras creabas la campaña: puede que se haya creado. Mírala en el selector antes de volver a intentarlo.");
      return void avisar.error(traducirError(error, "crear la campaña"));
    }
    const id = (data as { id?: string } | null)?.id;
    avisar.exito("Campaña creada", { detalle: b.nombre.trim() });
    cerrar();
    router.push(id ? `/compras/plan?plan=${id}` : "/compras/plan");
  }

  return (
    <Modal titulo="Nueva campaña" subtitulo="Elige la campaña de Etiquetas que vas a planificar; el plan arranca con su nombre y sus fechas." onClose={onClose} variante="hoja" ancho="max-w-lg">
      {(cerrar) =>
        libres.length === 0 ? (
          <div className="space-y-4">
            <Aviso tono="info" titulo="Todas las campañas de Etiquetas ya tienen su plan">
              Para planificar otra, primero hace falta que exista y esté aprobada en Catálogo ▸ Etiquetas, con sus fechas.
            </Aviso>
            <div className="flex justify-end gap-3">
              <BotonEnlace href="/productos/atributos?tipo=etiquetas">Ir a Etiquetas</BotonEnlace>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void crear(cerrar);
            }}
            className="space-y-5"
          >
            <CampoGuiado id="etiqueta" guia={guia} titulo="Campaña de Etiquetas" ayuda="La que vas a planificar">
              <CampoSelect
                etiqueta=""
                caja
                valor={b.etiquetaId}
                onValor={(id) => setB(borradorDeCampana(libres.find((e) => e.id === id) ?? null))}
                opciones={opciones}
                marcador="Elige una campaña"
              />
            </CampoGuiado>
            <CampoGuiado id="nombre" guia={guia} titulo="Nombre del plan" ayuda="Como se verá en el selector">
              <CampoTexto etiqueta={<span className="sr-only">Nombre del plan</span>} caja value={b.nombre} onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))} />
            </CampoGuiado>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoGuiado id="desde" guia={guia} titulo="Desde">
                <CampoFecha etiqueta={<span className="sr-only">Desde</span>} caja estricto valor={b.desde} onValor={(iso) => setB((x) => ({ ...x, desde: iso }))} />
              </CampoGuiado>
              <CampoGuiado id="hasta" guia={guia} titulo="Hasta">
                <CampoFecha etiqueta={<span className="sr-only">Hasta</span>} caja estricto valor={b.hasta} onValor={(iso) => setB((x) => ({ ...x, hasta: iso }))} />
              </CampoGuiado>
            </div>
            {nota && <p className="nota-cayla">{nota}</p>}
            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={trabajando} />
            </CampoGuiado>
            <div className="pie-hoja-fijo">
              <PieGuia guia={guia} listo="Todo listo para crear." />
              <div className="flex justify-end gap-3 pt-2">
                <Boton type="button" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Crear campaña
                </Boton>
              </div>
            </div>
          </form>
        )
      }
    </Modal>
  );
}
