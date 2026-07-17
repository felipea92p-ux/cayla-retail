import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { getCajaAbierta } from "@/lib/finanzas";
import { createClient } from "@/lib/supabase/server";
import { CatalogoList } from "@/components/CatalogoList";
import { CajaPanel } from "@/components/CajaPanel";

export default async function InicioPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();
  const esLider = persona.rol === "lider";

  const sedesResult = await supabase.from("sedes").select("id, codigo, tipo").order("codigo");
  const todasSedes: { id: string; codigo: string; tipo: string }[] = sedesResult.data ?? [];
  const sedesOperativas = todasSedes.filter((s) => s.tipo !== "almacen");
  const { variantes, alertasReposicion, alertasTraslado } = await getCatalogoInteligente(persona);
  const cajaAbierta = await getCajaAbierta(persona.sedeId);

  const almacenPropio = todasSedes.find((s) => s.tipo === "almacen" && s.codigo === `${persona.sedeCodigo}-ALM`) ?? null;
  const { data: contenedoresAlmacen } = almacenPropio
    ? await supabase.from("contenedores").select("id, codigo").eq("sede_id", almacenPropio.id).order("codigo")
    : { data: [] };

  const sedeActual = sedesOperativas.find((s) => s.id === persona.sedeId) ?? {
    id: persona.sedeId,
    codigo: persona.sedeCodigo,
    tipo: "tienda",
  };

  const variantesParaVenta = variantes.map((v) => ({
    varianteId: v.varianteId,
    sku: v.sku,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
    precio: v.precio,
    stockAqui: v.stockPorSede[persona.sedeCodigo] ?? 0,
  }));

  const reponerYa = variantes.filter((v) => v.reponerYa).length;
  const estancados = variantes.filter((v) => v.estancado).length;
  const totalUnidades = variantes.reduce((a, v) => a + v.stockTotal, 0);

  return (
    <div className="space-y-6">
      <CajaPanel
        sedeId={persona.sedeId}
        sedeCodigo={persona.sedeCodigo}
        cajaAbierta={cajaAbierta}
        variantes={variantesParaVenta}
      />
      <div className="flex flex-wrap gap-3">
        {esLider && (
          <Link href="/finanzas" className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
            Ver Diario de caja, Gastos y Estado de Resultados →
          </Link>
        )}
        {almacenPropio && (
          <>
            <Link href="/almacen" className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
              Ver almacén ({almacenPropio.codigo}) →
            </Link>
            <Link href="/almacen/recibir" className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
              Recibir mercadería →
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Referencias</p>
          <p className="text-xl font-semibold text-neutral-900">{variantes.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Unidades totales</p>
          <p className="text-xl font-semibold text-neutral-900">{totalUnidades}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Reponer ya</p>
          <p className="text-xl font-semibold text-red-600">{reponerYa}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-400">Estancados</p>
          <p className="text-xl font-semibold text-amber-600">{estancados}</p>
        </div>
      </div>

      {esLider && (alertasReposicion.length > 0 || alertasTraslado.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {alertasReposicion.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-red-800">Reponer pronto</h2>
              <ul className="space-y-1.5 text-sm">
                {alertasReposicion.map((v) => (
                  <li key={v.varianteId}>
                    <Link href={`/producto/${v.varianteId}`} className="text-red-700 hover:underline">
                      {v.referencia} <span className="text-red-400">({v.stockTotal} vs. punto de reorden {v.reorderPoint})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {alertasTraslado.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-blue-800">Sugerencias de traslado</h2>
              <ul className="space-y-1.5 text-sm">
                {alertasTraslado.map((v) => (
                  <li key={v.varianteId}>
                    <Link href={`/producto/${v.varianteId}`} className="text-blue-700 hover:underline">
                      {v.referencia}{" "}
                      <span className="text-blue-400">
                        (a {v.sugerenciaTraslado?.sedeDestinoCodigo}, desde {v.sugerenciaTraslado?.sedeOrigenCodigo} · {v.sugerenciaTraslado?.stockOrigen} unid.)
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <CatalogoList
        variantes={variantes}
        sedeActual={sedeActual}
        todasLasSedes={sedesOperativas}
        esLider={esLider}
        almacenPropio={almacenPropio}
        contenedoresAlmacen={contenedoresAlmacen ?? []}
      />
    </div>
  );
}
