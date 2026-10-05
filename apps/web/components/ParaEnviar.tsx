"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { Modal, botonCancelar, botonPrimario, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { textoPrendas } from "@/lib/pedidos-entre-sedes-reglas";
import {
  MAX_MOTIVO_YA_NO,
  avisoNoEstaCompleta,
  etiquetaParaEnviar,
  motivoYaNoValido,
  noEstaCompleta,
  urlArmarEnvio,
  type GrupoParaEnviar,
  type PrendaParaEnviar,
} from "@/lib/para-enviar-reglas";

// «Para enviar» en Traslados (ADR-0328 act. 17; Felipe: lo colgado se manda en DOS pasos). Lo que la sede subió al almacén
// para mandarlo a otra queda aquí, por sede de destino, hasta que sale en un traslado —la base lo descuenta sola, salga como
// salga— o alguien dice «Ya no la envío» con su motivo. «Armar el envío» abre Nuevo traslado con el destino y las prendas
// ya cargadas. La página solo la monta si hay algo que enviar: nunca una tarjeta vacía.

type Ubicacion = { ubicacionId: string; etiqueta: string };

export function ParaEnviar({ grupos, ubicacion }: { grupos: GrupoParaEnviar[]; ubicacion: Ubicacion }) {
  const [yaNo, setYaNo] = useState<PrendaParaEnviar | null>(null);
  return (
    <section className="card-cayla overflow-hidden" aria-labelledby="para-enviar">
      <header className="px-4 pt-4 sm:px-5">
        <h2 id="para-enviar" className="font-display text-[22px] leading-tight text-tinta">
          Para enviar
        </h2>
        <p className="mt-0.5 text-sm text-taupe">Lo que subiste al almacén para mandarlo a otra sede. Sale de esta lista cuando sale el traslado.</p>
      </header>
      {grupos.map((g) => {
        const url = urlArmarEnvio(g);
        return (
          <div key={g.destinoId} className="mt-3 border-t border-sand">
            <div className="flex flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="font-semibold text-tinta">
                A {g.destino} · {textoPrendas(g.total)}
              </p>
              {url ? (
                <Link href={url} className="btn-cayla btn-primario inline-flex items-center gap-2 self-start sm:self-auto">
                  <PackageOpen aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                  Armar el envío a {g.destino}
                </Link>
              ) : (
                <p className="text-xs text-taupe">Nada de esto está libre en tu almacén hoy.</p>
              )}
            </div>
            <ul className="mt-2 divide-y divide-sand">
              {g.prendas.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-tinta">
                      <span className="tabular-nums font-semibold">{p.falta}×</span>
                      <span className="min-w-0 break-words">{etiquetaParaEnviar(p)}</span>
                      {p.sku && <span className="text-xs text-taupe">{p.sku}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-taupe">
                      Subida {[p.creadoPorNombre ? `por ${p.creadoPorNombre}` : null, fechaCorta(p.creadoEn)].filter(Boolean).join(" · ")}
                      {p.nota ? ` · ${p.nota}` : ""}
                    </p>
                    {noEstaCompleta(p) && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ambar-profundo">
                        <AlertTriangle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {avisoNoEstaCompleta(p)}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setYaNo(p)} className="btn-cayla btn-sutil self-start sm:self-auto">
                    Ya no la envío
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {yaNo && <YaNoLaEnvioModal prenda={yaNo} ubicacion={ubicacion} onClose={() => setYaNo(null)} />}
    </section>
  );
}

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });
}

/** «Ya no la envío»: sale de la lista con su porqué (`cancelar_para_enviar`). La prenda sigue en el almacén. */
function YaNoLaEnvioModal({ prenda, ubicacion, onClose }: { prenda: PrendaParaEnviar; ubicacion: Ubicacion; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const responsable = useResponsable(ubicacion);
  // La guía mira lo mismo que apaga el botón: el porqué (la base lo exige) y quién lo hace.
  const guia = useGuiaCampos([
    { id: "motivo", nombre: "Por qué", requerido: true, hecho: motivoYaNoValido(motivo), pendiente: "Escribe por qué ya no la envías." },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo hace." },
  ]);

  async function quitar(cerrar: () => void) {
    if (!motivoYaNoValido(motivo) || !responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(createClient().rpc("cancelar_para_enviar", { p_id: prenda.id, p_motivo: motivo.trim() }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "sacarla de la lista"));
    avisar.exito("Ya no está para enviar", { detalle: `${etiquetaParaEnviar(prenda)} sigue en tu almacén.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="¿Ya no la envías?" subtitulo={`${etiquetaParaEnviar(prenda)} · a ${prenda.destino}`} onClose={onClose} ancho="max-w-md" bloqueado={enviando}>
      {(cerrar) => (
        <div className="space-y-4">
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué ya no la envías">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAX_MOTIVO_YA_NO}
              aria-label="Por qué ya no la envías"
              placeholder="Se vendió aquí" /* sugerir-fijo: el porqué de sacar una prenda de la lista no depende de nada elegido antes en esta ventana */
              className={campoTexto}
              disabled={enviando}
            />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button
              type="button"
              disabled={enviando || !guia.puedeConfirmar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              onClick={() => quitar(cerrar)}
              className={`${botonPrimario} ${guia.claseConfirmar}`}
            >
              {enviando ? "Guardando…" : "Ya no la envío"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
