"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { MatrizOrdenTabla } from "@/components/MatrizOrden";
import { costoUnitario, segundas, totalBuenas, urlLlevarATiendas, type MatrizOrden } from "@/lib/produccion-reglas";
import type { OrdenProduccion } from "@/lib/produccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Cerrar una orden (ADR-0133, F2): cuántas salieron buenas POR TALLA Y COLOR —así las espera `cerrar_produccion`— y
// el costo REAL de la corrida. La base recalcula el costo unitario sobre las buenas (la merma se absorbe sola) y, si
// no es muestra, mete la entrada al stock del Taller. Mismo comportamiento que el modal anterior; lo que cambia es
// que las buenas se escriben sobre la grilla de la orden y no en una lista de casillas.
//
// Quien no es líder cierra SIN ver ni tocar montos: manda `null` y la base conserva los que la orden ya tenía
// (`coalesce(p_costo_*, costo_*)` en `cerrar_produccion`). Hasta F3 esos costos se teclean al abrir la orden;
// después salen del consumo de insumos.

// El generador de tipos de Supabase marca los montos como `number`, pero la función acepta `null` y lo usa para
// «conservar el de la orden»: se declara acá una sola vez para no repartir `as` por el archivo.
const CONSERVAR = null as unknown as number;

export function OrdenCierre({
  tallerId,
  orden,
  matriz,
  esLider,
  onHecho,
}: {
  orden: OrdenProduccion;
  tallerId: string;
  matriz: MatrizOrden;
  esLider: boolean;
  onHecho: () => void;
}) {
  const router = useRouter();
  const [buenas, setBuenas] = useState<Record<string, string>>(Object.fromEntries(orden.lineas.map((l) => [l.varianteId, String(l.cantidadPlan)])));
  const [tela, setTela] = useState(String(orden.costoTela));
  const [avios, setAvios] = useState(String(orden.costoAvios));
  const [maquila, setMaquila] = useState(String(orden.costoMaquila));
  const [cargando, setCargando] = useState(false);
  // Responsable (ADR-0161/0162): el cierre firma con quien se elige en el combo (la lista sale del Taller, la sede activa).
  const responsable = useResponsable();

  const total = totalBuenas(buenas);
  const perdidas = segundas(orden.cantidadPlan, total);
  const costoTotal = (Number(tela) || 0) + (Number(avios) || 0) + (Number(maquila) || 0);
  const unitario = costoUnitario(Number(tela) || 0, Number(avios) || 0, Number(maquila) || 0, total);

  async function confirmar() {
    if (total <= 0) {
      avisar.error("No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const { error } = await firmar(createClient().rpc("cerrar_produccion", {
      p_produccion_id: orden.id,
      p_buenas: orden.lineas.map((l) => ({ variante_id: l.varianteId, cantidad: Math.max(0, Math.floor(Number(buenas[l.varianteId]) || 0)) })),
      p_costo_tela: esLider ? Number(tela) || 0 : CONSERVAR,
      p_costo_avios: esLider ? Number(avios) || 0 : CONSERVAR,
      p_costo_maquila: esLider ? Number(maquila) || 0 : CONSERVAR,
    }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "cerrar la orden"));
      return;
    }
    // F8: «Siguiente paso: llevarlas a las tiendas». El aviso trae el botón directo al traslado con el origen y las líneas ya puestas (solo para producción, no muestras).
    const llevar = orden.esMuestra ? null : urlLlevarATiendas(tallerId, orden.lineas.map((l) => ({ varianteId: l.varianteId, cantidadBuenas: Math.max(0, Math.floor(Number(buenas[l.varianteId]) || 0)) })));
    avisar.exito(orden.esMuestra ? `Muestra ${orden.referencia} terminada` : `${total} prendas de ${orden.referencia} entraron al stock del Taller`, {
      detalle: esLider ? `Costo real ${soles(unitario)} por prenda` : "Siguiente paso: llevarlas a las tiendas",
      duracion: 9000,
      ...(llevar ? { accion: { texto: "Llevarlas a las tiendas", onClick: () => router.push(llevar) } } : {}),
    });
    router.refresh();
    onHecho();
  }

  return (
    <section aria-label="Cierre" className="anim-asentar rounded-2xl border border-verde/40 bg-verde/[0.07] p-4">
      <h3 className="label-cayla text-[11px] text-verde-profundo">Cuántas salieron buenas · talla × color</h3>
      <div className="mt-3">
        <MatrizOrdenTabla matriz={matriz} modo="cierre" buenas={buenas} onCambio={(id, v) => setBuenas((b) => ({ ...b, [id]: v }))} />
      </div>
      <p className="mt-2 text-xs text-tinta/75">
        {total} buenas de {orden.cantidadPlan}
        {perdidas > 0 && (
          <>
            {" · "}
            <span className="font-medium text-ambar-profundo">
              {perdidas} {perdidas === 1 ? "segunda o perdida" : "segundas o perdidas"}
            </span>
          </>
        )}
        {total > orden.cantidadPlan && <span className="font-medium text-ambar-profundo"> · más buenas que las planeadas</span>}
      </p>

      {esLider && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CampoMonto etiqueta="Tela (real)" inputMode="decimal" value={tela} onChange={(e) => setTela(e.target.value)} />
            <CampoMonto etiqueta="Avíos (real)" inputMode="decimal" value={avios} onChange={(e) => setAvios(e.target.value)} />
            <CampoMonto etiqueta="Maquila (real)" inputMode="decimal" value={maquila} onChange={(e) => setMaquila(e.target.value)} />
          </div>
          <div className="mt-3 flex items-baseline justify-between rounded-md bg-papel px-3 py-2 text-sm">
            <span className="text-tinta/70">
              {total} buenas · costo {soles(costoTotal)}
            </span>
            <span className="font-display text-lg tabular-nums text-tinta">{soles(unitario)} / prenda</span>
          </div>
          <p className="mt-2 text-xs text-tinta/65">El costo se reparte entre las buenas, no entre las planeadas: una segunda sube el costo de las demás.</p>
        </>
      )}

      {!orden.esMuestra && (
        <p className="mt-3 text-xs text-tinta/65">
          Al confirmar, cada talla entra al stock del Taller y queda registrada en Movimientos. Si algo sale mal, la orden se puede revertir.
        </p>
      )}

      <div className="mt-4">
        <ComboResponsable control={responsable} deshabilitado={cargando} />
      </div>
      <Boton peso="primario" cargando={cargando} disabled={!responsable.listo} title={responsable.motivo ?? undefined} className="mt-4 w-full" onClick={confirmar}>
        {cargando ? "Cerrando…" : orden.esMuestra ? "Terminar muestra" : "Confirmar entrada al stock"}
      </Boton>
    </section>
  );
}
