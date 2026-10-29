"use client";

import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { QuitarColor } from "@/components/orden-produccion/AgregarColor";
import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import { campoEtiqueta } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { DESTINOS_FALLA, MAX_MOTIVO_FALLA, MOTIVOS_FALLA, type DestinoFalla, type FallaBorrador } from "@/lib/orden-pagina-reglas";

// Las prendas con falla de un «Terminé» (ADR-0570, actividad 2): talla y color, cuántas, qué pasa con ellas —se arregla, segunda o se perdió— y el porqué a un toque. Se abre a pedido;
// sin filas, solo el botón. La usan «Terminé» y «Corregir» (actividad 3): una sola forma de anotar una falla. Quien la usa pone su ancla de la guía alrededor y decide qué pasa con las buenas al cambiar una fila.

export function FilasDeFalla({
  fallas,
  motivo,
  opciones,
  nombreDe,
  guia,
  problema,
  onFallas,
  onMotivo,
}: {
  fallas: FallaBorrador[];
  motivo: string;
  /** Las tallas y colores de donde puede salir una prenda con falla. */
  opciones: { valor: string; texto: string }[];
  nombreDe: (varianteId: string) => string;
  guia: GuiaCampos;
  /** Lo primero que impide anotar las fallas, o `null`. */
  problema: string | null;
  onFallas: (fallas: FallaBorrador[]) => void;
  onMotivo: (motivo: string) => void;
}) {
  const destinoDe = (d: DestinoFalla) => DESTINOS_FALLA.find((x) => x.valor === d);
  const cambiarFila = (i: number, cambio: Partial<FallaBorrador>) => onFallas(fallas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const agregarFila = () => onFallas([...fallas, { varianteId: opciones.length === 1 ? opciones[0].valor : "", cantidad: "1", destino: "arreglo" }]);

  return (
    <div>
      {fallas.length === 0 ? (
        opciones.length > 0 && (
          <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={agregarFila}>
            + Anotar prendas con falla
          </button>
        )
      ) : (
        <CampoGuiado id="fallas" guia={guia} className="space-y-3 rounded-xl bg-hueso px-4 py-3">
          <span className={campoEtiqueta}>{guia.etiqueta("fallas", "Prendas con falla")}</span>
          {fallas.map((f, i) => (
            <div key={i} className="space-y-2 border-b border-sand pb-3 last:border-b-0 last:pb-0">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_1.5rem] items-end gap-x-3">
                <CampoSelect etiqueta="Talla y color" id={`falla-variante-${i}`} valor={f.varianteId} onValor={(v) => cambiarFila(i, { varianteId: v })} opciones={opciones} marcador="Elige" />
                <CampoTexto etiqueta="Cuántas" id={`falla-cantidad-${i}`} inputMode="numeric" value={f.cantidad} onChange={(e) => cambiarFila(i, { cantidad: e.target.value.replace(/\D/g, "") })} maxLength={5} />
                <div className="pb-2.5">
                  <QuitarColor nombre="esta fila de prendas con falla" onQuitar={() => onFallas(fallas.filter((_, j) => j !== i))} />
                </div>
              </div>
              <SegmentoDeslizante
                etiqueta={`Qué pasa con las de ${f.varianteId ? nombreDe(f.varianteId) : "esta fila"}`}
                opciones={DESTINOS_FALLA.map((d) => ({ clave: d.valor, etiqueta: d.texto }))}
                valor={f.destino}
                onCambio={(v) => cambiarFila(i, { destino: v as DestinoFalla })}
              />
              <p className="text-xs text-tinta/65">{destinoDe(f.destino)?.ayuda}</p>
            </div>
          ))}
          {opciones.length > 1 && (
            <button type="button" className="btn-cayla btn-enlace text-[12.5px]" onClick={agregarFila}>
              + Otra talla o color
            </button>
          )}
          <div className="space-y-2">
            <span className={campoEtiqueta}>¿Qué pasó?</span>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_FALLA.map((m) => (
                <button key={m} type="button" className="pildora-cayla" aria-pressed={motivo === m} onClick={() => onMotivo(m)}>
                  {m}
                </button>
              ))}
            </div>
            <CampoTexto etiqueta="O cuéntalo con tus palabras" id="falla-motivo" value={motivo} onChange={(e) => onMotivo(e.target.value)} maxLength={MAX_MOTIVO_FALLA} />
          </div>
          {problema && <p className="text-xs text-tinta/75">{problema}</p>}
        </CampoGuiado>
      )}
    </div>
  );
}
