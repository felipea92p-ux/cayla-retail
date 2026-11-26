import { EntregarFondo } from "@/components/fondos/AccionesFondos";
import { BandejaRevisar } from "@/components/mi-plata/BandejaRevisar";
import { CerrarRonda } from "@/components/compras/CerrarRonda";
import { DetalleComprador } from "@/components/compras/DetalleComprador";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCompradores } from "@/lib/compradores";
import { getDatosFondos } from "@/lib/fondos";
import { getPlataPorConfirmar } from "@/lib/mi-plata";
import { getRevisarCompras } from "@/lib/revisar-compras";
import { puedeCerrarseDesdeCompras, rondaElegida } from "@/lib/compradores-reglas";
import { primerNombre } from "@/lib/fondos-reglas";
import { hoyLima } from "@/lib/fechas-lima";

// Compras ▸ Compradores ▸ una persona (ADR-0704): su cuenta de la ronda, lo que espera revisión y todas sus compras. Lo que se revisa es la
// bandeja de siempre (`BandejaRevisar`: confirmar su plata, completar el papel, revisar un gasto, recibir su cierre), filtrada a esta persona:
// reemplaza a la pestaña «Revisar compras», donde se mezclaba lo de todas. El layout de Compradores ya pidió el módulo «fondos».

export default async function CompradorPage({ params, searchParams }: { params: Promise<{ personaId: string }>; searchParams: Promise<{ ronda?: string }> }) {
  const [{ personaId }, { ronda: pedida }] = await Promise.all([params, searchParams]);
  const hoy = hoyLima();
  const [yo, rondas, datos, plata, revisar] = await Promise.all([
    requirePersonaActualV2(),
    getCompradores(),
    getDatosFondos(),
    getPlataPorConfirmar(),
    getRevisarCompras(),
  ]);
  const suyas = (rondas ?? []).filter((r) => r.personaId === personaId);
  const ronda = rondaElegida(suyas, pedida);
  const nombreCompleto = ronda?.persona ?? datos.fondos.find((f) => f.personaId === personaId)?.persona ?? "Sin nombre";
  const nombre = primerNombre(nombreCompleto);

  // Lo suyo de la bandeja de Revisar compras: la plata que anotó, sus compras por completar, sus gastos y su cierre por recibir.
  const deEl = <T extends { personaId: string }>(xs: readonly T[] | undefined) => (xs ?? []).filter((x) => x.personaId === personaId);
  const suPlata = deEl(plata ?? undefined);
  const susPapeles = deEl(revisar?.papeles);
  const susGastos = deEl(revisar?.gastos);
  const susCierres = deEl(revisar?.cierres);
  const hayQueRevisar = suPlata.length + susPapeles.length + susGastos.length + susCierres.length > 0;

  const tiene = Object.fromEntries(datos.fondos.map((f) => [f.personaId, Math.max(f.saldo, 0)]));
  return (
    <DetalleComprador
      nombre={nombre}
      personaId={personaId}
      ronda={ronda}
      otras={suyas.filter((r) => r.id !== ronda?.id)}
      hoy={hoy}
      acciones={datos.falla ? undefined : <EntregarFondo opciones={datos.opciones} tiene={tiene} />}
      cerrarRonda={ronda && puedeCerrarseDesdeCompras(ronda) ? <CerrarRonda rondaId={ronda.id} nombre={nombre} /> : undefined}
      bandeja={
        hayQueRevisar ? (
          <BandejaRevisar
            plata={suPlata}
            papeles={susPapeles}
            gastos={susGastos}
            cierres={susCierres}
            proveedores={revisar?.proveedores ?? []}
            cuentas={datos.opciones.cuentas}
            esLider={yo.rol === "lider"}
          />
        ) : null
      }
    />
  );
}
