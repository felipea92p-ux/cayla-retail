import { nombresCortos } from "@/lib/nombre-integrante";
import type { Vendedora } from "@/lib/vender-reglas";

type Props = {
  vendedoras: readonly Vendedora[];
  /** La que se tocó (o la única marcada); `null` = falta elegir. */
  elegidaId: string | null;
  onElegir: (personaId: string) => void;
  /** La lectura falló: la venta saldrá a nombre de la sesión y hay que decirlo. */
  noCargaron: boolean;
  deshabilitada: boolean;
  /** Nadie marcó asistencia hoy en la tienda: la fila trae a todas las de la sede, y se dice. */
  sinAsistencia: boolean;
};

/**
 * «¿Quién atendió a la clienta?» — la fila de chips arriba del ticket. Un toque, sin desplegable: en una
 * tienda con varias colaboradoras y UN equipo de caja, la sesión no dice quién vendió. Sin estado ni hooks:
 * la elección vive en `PuntoDeVenta`, que la manda a `registrar_venta` (`p_asesora_id`). Quiénes salen lo decide
 * la asistencia de Dynamic (`vendedorasDeTurno`, ADR-0163).
 *
 *  · 2 o más de turno: los chips, SIN ninguna preseleccionada (el silencio no atribuye la venta a nadie).
 *  · Una: «Atiende X», sin chips. Ninguna: nada que mostrar, la venta sale a nombre de la sesión.
 *  · Nadie marcó asistencia hoy: salen todas las de la sede, con el aviso.
 *  · La lectura falló: se dice, porque esa venta saldrá a nombre de la sesión.
 */
export function VendedorasFila({ vendedoras, elegidaId, onElegir, noCargaron, deshabilitada, sinAsistencia }: Props) {
  if (noCargaron) {
    return (
      <p role="status" className="border-b border-sand bg-ambar/10 px-5 py-2 text-[11px] text-ambar-profundo">
        No se pudo leer quién atiende en caja: esta venta saldrá a nombre de la sesión.
      </p>
    );
  }
  if (vendedoras.length === 0) return null;
  const conChips = vendedoras.length >= 2;

  const cortos = nombresCortos(vendedoras.map((v) => v.nombre));
  return (
    <div className="border-b border-sand px-5 py-3">
      <p className="label-cayla text-[11px] text-tinta/60">
        {conChips ? "Atendió" : `Atiende ${cortos.get(vendedoras[0].nombre) ?? ""}`}
      </p>
      {sinAsistencia && <p className="mt-1 text-[11px] text-ambar-profundo">Nadie marcó asistencia hoy: se muestran todas las de la sede.</p>}
      {conChips && (
        <div role="group" aria-label="¿Quién atendió a la clienta?" className="mt-2 flex flex-wrap gap-1.5">
          {vendedoras.map((v) => {
            const activa = v.personaId === elegidaId;
            return (
              <button
                key={v.personaId}
                type="button"
                title={v.nombre}
                aria-pressed={activa}
                disabled={deshabilitada}
                onClick={() => onElegir(v.personaId)}
                className={`h-10 rounded-full border px-4 text-sm transition-colors ${
                  activa ? "border-tinta bg-tinta text-papel" : "border-tinta/25 bg-crema text-tinta hover:border-rojo hover:text-rojo"
                }`}
              >
                {cortos.get(v.nombre) ?? v.nombre}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
