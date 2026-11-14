"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ruler } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto, Interruptor } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip } from "@/components/ui/Chip";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { useValidarAlSalir } from "@/components/ui/useValidarAlSalir";
import { Ayuda } from "@/components/Ayuda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import type { CapacidadPiso } from "@/lib/capacidad-piso";
import {
  borradorDeLaCapacidad,
  camposDelPiso,
  capacidadDelBorrador,
  CONTEO_DESDE,
  diferenciaDeCapacidad,
  esLoMismo,
  leerDelPiso,
  type BorradorDelPiso,
  type CampoDelPiso,
} from "@/lib/capacidad-piso-config";
import { fraseDeEstado } from "@/lib/plan-piso-percha";
import { cifraEs } from "@/lib/mix-piso-visual";

// «Configurar el piso» (Gestión ▸ Plan del piso, ADR-0329): el líder actualiza la capacidad del riel de su tienda contra la realidad.
// PROMETE: guardar con `fijar_capacidad_piso` (solo el líder, firmada, con su antes y después en el historial) y mostrar, mientras
// se teclea, cuántas prendas caben con esos números y cómo queda lo que hoy dice el sistema que cuelga. Si dos personas la cambian a la
// vez, la segunda no pisa a la primera: la base lo dice, la hoja pide actualizar. Sin respuesta de la base no se pierde lo escrito.
// NO HACE: cuadrar el piso. Subir los m² hasta que no sobre nada no cuenta como contar (por eso pide el día del conteo y la base
// guarda el antes y el después).

/** Lo que la hoja necesita saber de la pantalla: quién es, qué hay guardado y qué cuelga hoy. */
export type DatosDelPiso = {
  ubicacionId: string;
  sede: string;
  /** Null = esta tienda todavía no tiene capacidad guardada (la primera vez se guarda con versión 0). */
  capacidad: CapacidadPiso | null;
  /** Prendas que el sistema cree que cuelgan hoy del riel; null si la propuesta no se pudo leer. */
  colgadas: number | null;
  /** ¿El piso ya se cuadró? Sin cuadrar, «lo que cuelga» es lo que el sistema cree, y la frase lo dice en condicional. */
  cuadrado: boolean;
  /** El día de hoy en Lima, de quien arma la página (nunca del reloj del navegador). */
  hoy: string;
};

const MOTIVO_POR_CAMPO: Record<string, CampoDelPiso> = {
  capacidad_m2_fuera_de_rango: "m2",
  capacidad_densidad_fuera_de_rango: "densidad",
  capacidad_cero: "densidad",
  capacidad_fecha_conteo: "contadaEl",
};

/**
 * El botón de la cabecera y su hoja. `datos` es null cuando la base no respondió al leer la capacidad: el botón se ve apagado y dice por qué
 * (esconderlo parecería que el líder perdió el permiso). Una capacidad guardada sin versión legible tampoco se puede cambiar: se podría pisar a otra persona.
 */
export function ConfigurarPiso({ datos }: { datos: DatosDelPiso | null }) {
  const [abierta, setAbierta] = useState(false);
  const noDisponible = datos === null ? "No se pudo leer la capacidad del piso. Recarga la pantalla." : datos.capacidad !== null && datos.capacidad.version === null ? "No se pudo leer la versión de la capacidad. Recarga la pantalla." : null;
  return (
    <>
      <Boton type="button" peso="fantasma" data-guia="plan-piso.configurar" onClick={() => setAbierta(true)} disabled={noDisponible !== null} title={noDisponible ?? undefined}>
        <Ruler className="h-4 w-4" aria-hidden /> Configurar piso
      </Boton>
      {abierta && datos && <HojaConfigurarPiso datos={datos} onClose={() => setAbierta(false)} />}
    </>
  );
}

function HojaConfigurarPiso({ datos, onClose }: { datos: DatosDelPiso; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [b, setB] = useState<BorradorDelPiso>(() => borradorDeLaCapacidad(datos.capacidad));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Otra persona cambió la capacidad mientras esta hoja estaba abierta: no se guardó nada y hay que volver a leer.
  const [choque, setChoque] = useState(false);
  const enVuelo = useRef(false);

  const lectura = leerDelPiso(b, datos.hoy);
  const guia = useGuiaCampos(camposDelPiso(lectura, b, responsable));
  const problemas = lectura.ok ? {} : lectura.problemas;
  const avisoM2 = useValidarAlSalir(problemas.m2 ?? null);
  const avisoDensidad = useValidarAlSalir(problemas.densidad ?? null);
  const loMismo = lectura.ok && esLoMismo(datos.capacidad, lectura);
  // Lo que caben se ve apenas están los m² y las prendas por m²: no espera a que se elija el día del conteo.
  const caben = capacidadDelBorrador(b);
  const diferencia = caben !== null ? diferenciaDeCapacidad(datos.capacidad, caben) : null;
  const frase = caben !== null && datos.colgadas !== null ? fraseDeEstado({ colgadas: datos.colgadas, capacidad: caben, cuadrado: datos.cuadrado }) : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (choque) {
      router.refresh();
      return onClose();
    }
    if (!lectura.ok || !guia.revisar()) return;
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const { data, error: errorRpc } = await firmar(
      createClient().rpc("fijar_capacidad_piso", {
        p_ubicacion_id: datos.ubicacionId,
        p_m2_sala: lectura.m2,
        p_densidad: lectura.densidad,
        p_contada_el: lectura.contadaEl,
        // Sin capacidad guardada se pide versión 0 (la base lo exige así la primera vez).
        p_version_esperada: datos.capacidad?.version ?? 0,
      }),
      responsable.firma()
    );
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      const campo = errorRpc.hint ? MOTIVO_POR_CAMPO[errorRpc.hint] : undefined;
      if (errorRpc.hint === "version_cambiada") {
        setChoque(true);
        // El mensaje de la base ya dice quién cambió qué y cómo quedó; se le quita su «Revisa y vuelve a guardar» porque el botón dice lo que toca.
        setError(`${errorRpc.message.replace(/ Revisa y vuelve a guardar\.$/, "")} No se guardó nada.`);
      } else if (campo) {
        guia.marcarError(campo, errorRpc.message);
      } else {
        setError(errorRpc.hint?.startsWith("capacidad_") ? errorRpc.message : traducirError(errorRpc, "guardar la capacidad del piso"));
      }
      return;
    }
    const r = (data ?? {}) as { capacidad?: number; sin_cambios?: boolean };
    const quedaron = typeof r.capacidad === "number" ? r.capacidad : lectura.capacidad;
    avisar.exito(r.sin_cambios ? "El piso ya estaba así" : `Piso de ${datos.sede} actualizado`, { detalle: `Caben ${cifraEs(quedaron)} prendas.` });
    // La propuesta, el riel y los avisos del Plan del piso se rehacen con la capacidad nueva.
    router.refresh();
    onClose();
  }

  const cambiar = (parte: Partial<BorradorDelPiso>) => setB((antes) => ({ ...antes, ...parte }));

  return (
    <Modal variante="hoja" titulo="Configurar el piso" subtitulo={datos.sede} onClose={onClose} tamano="mediana" bloqueado={enviando}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoGuiado id="m2" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("m2", "Metros cuadrados")}
              id="piso-m2"
              inputMode="decimal"
              autoComplete="off"
              mono
              placeholder="16"
              value={b.m2}
              onChange={(e) => cambiar({ m2: e.target.value })}
              onBlur={avisoM2.alSalir}
              pie={avisoM2.motivo ?? undefined}
              tono={avisoM2.motivo ? "error" : undefined}
              disabled={enviando || choque}
            />
          </CampoGuiado>
          <CampoGuiado id="densidad" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("densidad", "Prendas por m²")}
              id="piso-densidad"
              inputMode="decimal"
              autoComplete="off"
              mono
              placeholder="30"
              value={b.densidad}
              onChange={(e) => cambiar({ densidad: e.target.value })}
              onBlur={avisoDensidad.alSalir}
              pie={avisoDensidad.motivo ?? undefined}
              tono={avisoDensidad.motivo ? "error" : undefined}
              disabled={enviando || choque}
            />
          </CampoGuiado>
        </div>

        <div className="rounded-md bg-hueso px-4 py-3" aria-live="polite" data-campo-resultado>
          {caben !== null ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-serif text-4xl leading-none text-tinta">{cifraEs(caben)}</span>
                <span className="text-sm text-taupe">prendas caben en el riel</span>
                {diferencia !== null && datos.capacidad && (
                  <Chip tono="pizarra" versalitas={false}>
                    {diferencia > 0 ? "+" : "−"}
                    {cifraEs(Math.abs(diferencia))} · antes {cifraEs(datos.capacidad.capacidad)}
                  </Chip>
                )}
              </p>
              {frase && (
                <p className="mt-2 text-sm text-tinta">
                  {frase.antes}
                  <b>{frase.destacado}</b>
                  {frase.despues}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-taupe">Escribe los dos números y ves cuántas prendas caben.</p>
          )}
        </div>

        <div className="space-y-3">
          <CampoGuiado id="contadaEl" guia={guia}>
            <CampoFecha
              etiqueta={guia.etiqueta("contadaEl", "Contado el")}
              ayuda={
                <Ayuda titulo="El conteo">
                  El día en que contaste cuántas prendas caben de verdad. Sin conteo, la capacidad queda como «provisional».
                </Ayuda>
              }
              id="piso-contada-el"
              valor={b.sinContar ? "" : b.contadaEl}
              onValor={(iso) => cambiar({ contadaEl: iso })}
              min={CONTEO_DESDE}
              max={datos.hoy}
              motivoMax="El conteo no puede ser de un día que no llegó."
              motivoMin="Tiene que ser de 2026 en adelante."
              disabled={b.sinContar || enviando || choque}
            />
          </CampoGuiado>
          <Interruptor activo={b.sinContar} onActivo={(v) => cambiar({ sinContar: v })} etiqueta="Aún no lo conté" disabled={enviando || choque} />
        </div>

        <div className="min-h-[1rem] text-sm text-rojo-profundo" role="alert">
          {error}
        </div>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={enviando || choque} />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para guardar." />

        <div className="fin-botones pie-hoja-fijo">
          <button type="button" className="btn-cayla btn-secundario" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <Boton
            peso="primario"
            type="submit"
            cargando={enviando}
            className={choque ? "" : guia.claseConfirmar}
            confirma={choque ? undefined : guia}
            disabled={enviando || (!choque && loMismo)}
            title={choque ? undefined : loMismo ? "Todavía no cambiaste nada." : (responsable.motivo ?? guia.frase ?? undefined)}
          >
            {choque ? "Actualizar y revisar" : "Guardar"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
