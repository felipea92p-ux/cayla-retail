import Link from "next/link";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import type { SedeDeRendimiento } from "@/lib/rendimiento";
import { avance, lecturaDeRitmo, resumenDeSede, type LecturaRitmo } from "@/lib/rendimiento-meta-reglas";

/* ====================================================================
   Las tiendas, lado a lado y a la vez pestañas (Felipe, 2026-10-03;
   spike docs/maquetas/rendimiento-vistas-2026-10/rendimiento-final.html, variante A)

   Con VARIAS tiendas (el Admin), arriba van tres tarjetas: cada una dice cómo va su tienda ESTE MES contra su meta, y al tocarla se abre
   su panel completo debajo. La pantalla abre en la tienda de la sesión, que va primera. Comparar tiendas es mirar las tres tarjetas;
   entrar al detalle de una, tocarla. Son enlaces a `?sede=` (la tienda elegida vive en la URL, como el resto de los filtros).

   Se compara el MES y no el período del panel: el período (Hoy · Semana · Mes) es estado del panel de la tienda elegida, y una
   tarjeta que cambiara con él haría que dos tiendas no se pudieran comparar entre sí si una se mira en «Hoy».
   Las palabras de «cómo va» son las de D-159 (Adelante / En ritmo / Por debajo): informan, no juzgan; sin rojo.
   ==================================================================== */

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

const TONO: Record<LecturaRitmo, TonoChip> = { Adelante: "verde", "En ritmo": "pizarra", "Por debajo": "ambar" };

export function ComparativoTiendas({
  sedes,
  activaId,
  sesionId,
  hoy,
  vista,
}: {
  sedes: SedeDeRendimiento[];
  activaId: string | null;
  /** La tienda de la sesión de quien mira: lleva la marca «Tu sesión». */
  sesionId: string;
  hoy: string;
  /** La vista de la URL, para conservarla al cambiar de tienda. */
  vista: string | undefined;
}) {
  return (
    <nav aria-label="Tienda" className="grid gap-3 sm:grid-cols-3">
      {sedes.map((s) => {
        const activa = s.ubicacionId === activaId;
        const mes = s.panelDisponible ? resumenDeSede(s.serie, "mes", hoy) : null;
        const pct = mes ? avance(mes.soles, mes.meta) : null;
        const lectura = mes && mes.meta !== null && mes.tocabaPct !== null ? lecturaDeRitmo(mes.soles, mes.meta, mes.tocabaPct / 100) : null;
        const href = `/rendimiento?sede=${s.ubicacionId}${vista ? `&vista=${encodeURIComponent(vista)}` : ""}`;
        return (
          <Link
            key={s.ubicacionId}
            href={href}
            aria-current={activa ? "page" : undefined}
            className={`block rounded-xl border bg-papel p-4 transition-colors hover:border-taupe ${activa ? "border-tinta shadow-[inset_0_-3px_0_var(--color-tinta)]" : "border-sand"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-tinta">
                {s.nombre}
                {s.ubicacionId === sesionId && (
                  <Chip tono="neutro" versalitas={false} className="ml-2 align-middle">
                    Tu sesión
                  </Chip>
                )}
              </p>
              {lectura && (
                <Chip tono={TONO[lectura]} versalitas={false}>
                  {lectura}
                </Chip>
              )}
            </div>
            {mes ? (
              <>
                <p className="font-display mt-1 text-2xl leading-tight text-tinta tabular-nums">{SOLES.format(mes.soles)}</p>
                <p className="mt-0.5 text-xs text-tinta/65">
                  {pct !== null && mes.meta !== null ? `${pct} % de ${SOLES.format(mes.meta)} este mes` : "Este mes · sin meta cargada"}
                </p>
                {pct !== null && <BarraAvance pct={pct} marca={mes.tocabaPct} className="mt-2.5" />}
              </>
            ) : (
              <p className="mt-2 text-xs text-tinta/65">No se pudieron leer las metas ahora.</p>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
