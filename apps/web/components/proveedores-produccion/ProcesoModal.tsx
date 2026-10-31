"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import type { FaseDelCatalogo, Quien } from "@/lib/orden-fases-reglas";
import { camposDeProceso } from "@/lib/procesos-guia";
import { NOMBRE_MAXIMO, AYUDA_MAXIMA, RPC_GUARDAR_PROCESO, argumentosDeProceso, problemasDeProceso, sePuedeApagar, type EntradaDeProceso } from "@/lib/procesos-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Un proceso del Taller (ADR-0570, actividad 5; Felipe: «los da de alta el líder, en un catálogo; no los programa nadie»). Sin `proceso`, se da de alta uno nuevo: su nombre, después de qué
// paso va en la ruta y quién lo hace de costumbre. Con `proceso`, se renombra, se explica o se apaga (su lugar en la ruta no cambia nunca: lo ya abierto lo lleva guardado). Apagar no borra:
// las órdenes que ya lo llevan lo siguen llevando, y no se ofrece en las nuevas. Lo de la espina (Corte, Costura…) no se apaga. Solo líder: la pantalla ya lo es y la base lo vuelve a exigir.

const QUIEN: { valor: Quien; texto: string }[] = [
  { valor: "taller", texto: "En el Taller" },
  { valor: "servicio", texto: "Afuera, con un servicio" },
];

export function ProcesoModal({ proceso, catalogo, onClose }: { proceso: FaseDelCatalogo | null; catalogo: ReadonlyArray<FaseDelCatalogo>; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [e, setE] = useState<EntradaDeProceso>(() =>
    proceso
      ? { clave: proceso.clave, nombre: proceso.nombre, ayuda: proceso.ayuda, quien: proceso.quienSugerido, despuesDe: proceso.clave }
      : { clave: null, nombre: "", ayuda: "", quien: "taller", despuesDe: "costura" }
  );
  const [cargando, setCargando] = useState<"guardar" | "apagar" | null>(null);
  const enVuelo = useRef(false);
  const cambia = (cambio: Partial<EntradaDeProceso>) => setE((antes) => ({ ...antes, ...cambio }));
  const problemas = problemasDeProceso(e, catalogo);
  const guia = useGuiaCampos(camposDeProceso(e, catalogo, responsable.listo));
  // «Va después de»: cualquier proceso de la ruta, en su orden; bordado y estampado, por su lugar sobre la prenda (ahí cae lo que viene después).
  const lugares = catalogo.filter((p) => p.activo).map((p) => ({ valor: p.clave, texto: p.nombre }));

  const fotoActual = fotoFormulario({ ...e });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Escribiste un proceso y todavía no se guardó. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function guardar(activo: boolean | null) {
    if (enVuelo.current) return;
    if (activo === null && problemas.length > 0) {
      avisar.error(problemas[0].texto);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(activo === false ? "apagar" : "guardar");
    let resultado;
    try {
      // La función es nueva y los tipos generados todavía no la conocen (se regeneran con el volcado).
      const args = activo === null ? argumentosDeProceso(e) : argumentosDeProceso({ ...e, nombre: proceso?.nombre ?? e.nombre }, activo);
      resultado = await firmar(createClient().rpc(RPC_GUARDAR_PROCESO as never, args as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(null);
    if (error) {
      avisar.error(traducirError(error, proceso ? "guardar el proceso" : "dar de alta el proceso", { confirmarAntesDeRepetir: true }));
      return;
    }
    const nombre = e.nombre.trim();
    avisar.exito(
      activo === false ? `${proceso?.nombre} quedó apagado` : activo === true ? `${proceso?.nombre} volvió a ofrecerse` : proceso ? `${nombre} quedó guardado` : `${nombre} entró al catálogo`,
      { detalle: activo === false ? "Las órdenes que ya lo llevan lo siguen llevando; las nuevas ya no lo ofrecen." : "Las órdenes nuevas lo ofrecen en «Si la orden también lleva» y en «+ Agregar un paso»." }
    );
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={proceso ? "Cambiar el proceso" : "Nuevo proceso"}
      subtitulo={proceso ? (proceso.activo ? proceso.nombre : `${proceso.nombre} · apagado`) : "Un paso más que puede llevar una orden: pegar un cierre, un lavado, un acabado especial"}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void guardar(null);
        }}
        className="mt-3.5 space-y-5"
      >
        <div data-guia="prod-proceso.nombre" className="grid gap-3 sm:grid-cols-2">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("nombre", "Nombre del proceso")}
              placeholder="Ej. Teñido en frío" // sugerir-fijo: el nombre de un proceso del Taller no depende de nada elegido antes en la hoja
              value={e.nombre}
              onChange={(ev) => cambia({ nombre: ev.target.value })}
              maxLength={NOMBRE_MAXIMO}
              pie={problemas.find((p) => p.campo === "nombre" && e.nombre.trim() !== "")?.texto ?? "Así lo ve el Taller en cada orden."}
              tono={problemas.some((p) => p.campo === "nombre") && e.nombre.trim() !== "" ? "error" : undefined}
              autoFocus={proceso === null}
            />
          </CampoGuiado>
          {proceso === null ? (
            <CampoGuiado id="despues" guia={guia}>
              <CampoSelect id="proceso-despues" etiqueta={guia.etiqueta("despues", "Va después de")} valor={e.despuesDe} onValor={(v) => cambia({ despuesDe: v })} opciones={lugares} />
            </CampoGuiado>
          ) : (
            <p className="nota-cayla sin-i self-end text-sm">
              Su lugar en la ruta no cambia: las órdenes que ya lo llevan lo tienen guardado.
              {proceso.usos !== undefined ? ` Hoy está en ${proceso.usos} ${proceso.usos === 1 ? "orden" : "órdenes"}.` : ""}
            </p>
          )}
        </div>

        <div data-guia="prod-proceso.quien" className="grid gap-3 sm:grid-cols-2">
          <CampoGuiado id="quien-lo-hace" guia={guia}>
            <CampoSelect
              id="proceso-quien"
              etiqueta={guia.etiqueta("quien-lo-hace", "Quién lo hace de costumbre")}
              valor={e.quien}
              onValor={(v) => cambia({ quien: v as Quien })}
              opciones={QUIEN}
              pie="Con eso nace el paso en cada orden; ahí se puede cambiar."
            />
          </CampoGuiado>
          <CampoGuiado id="ayuda" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("ayuda", "Qué es")}
              placeholder="Opcional" // sugerir-fijo: es una explicación libre del proceso
              value={e.ayuda}
              onChange={(ev) => cambia({ ayuda: ev.target.value })}
              maxLength={AYUDA_MAXIMA}
              pie="Una línea que ayude a quien lo elige en la orden"
            />
          </CampoGuiado>
        </div>

        <div data-guia="prod-proceso.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando !== null} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo={proceso ? "Todo listo para guardar el proceso." : "Todo listo para dar de alta el proceso."} conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            {proceso && sePuedeApagar(proceso) && (
              <Boton type="button" peso="peligro" className="mr-auto" cargando={cargando === "apagar"} textoCargando="Apagando…" disabled={cargando !== null || !responsable.listo} onClick={() => void guardar(false)}>
                Apagar el proceso
              </Boton>
            )}
            {proceso && !proceso.activo && (
              <Boton type="button" peso="fantasma" className="mr-auto" cargando={cargando === "guardar"} textoCargando="Activando…" disabled={cargando !== null || !responsable.listo} onClick={() => void guardar(true)}>
                Ofrecerlo otra vez
              </Boton>
            )}
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando === "guardar"} disabled={!guia.puedeConfirmar || cargando !== null} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              {proceso ? "Guardar el proceso" : "Dar de alta el proceso"}
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
