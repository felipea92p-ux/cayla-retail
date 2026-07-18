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
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {esLider && (
          <Link href="/finanzas" className="label-cayla text-[10px] text-tinta/55 transition-colors hover:text-rojo">
            Diario de caja, Gastos y Estado de Resultados →
          </Link>
        )}
        {almacenPropio && (
          <>
            <Link href="/almacen" className="label-cayla text-[10px] text-tinta/55 transition-colors hover:text-rojo">
              Almacén {almacenPropio.codigo} →
            </Link>
            <Link href="/almacen/recibir" className="label-cayla text-[10px] text-tinta/55 transition-colors hover:text-rojo">
              Recibir mercadería →
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-4">
        <div className="bg-crema p-5">
          <p className="label-cayla text-[9px] text-tinta/45">Referencias</p>
          <p className="font-display mt-1 text-3xl text-tinta">{variantes.length}</p>
        </div>
        <div className="bg-crema p-5">
          <p className="label-cayla text-[9px] text-tinta/45">Unidades totales</p>
          <p className="font-display mt-1 text-3xl text-tinta">{totalUnidades}</p>
        </div>
        <div className="bg-crema p-5">
          <p className="label-cayla text-[9px] text-tinta/45">Reponer ya</p>
          <p className="font-display mt-1 text-3xl text-rojo">{reponerYa}</p>
        </div>
        <div className="bg-crema p-5">
          <p className="label-cayla text-[9px] text-tinta/45">Estancados</p>
          <p className="font-display mt-1 text-3xl text-tinta/70">{estancados}</p>
        </div>
      </div>

      {esLider && (alertasReposicion.length > 0 || alertasTraslado.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {alertasReposicion.length > 0 && (
            <div className="border border-tinta/10 bg-papel p-5">
              <h2 className="label-cayla mb-3 text-[10px] text-rojo">Reponer pronto</h2>
              <ul className="space-y-2 text-sm">
                {alertasReposicion.map((v) => (
                  <li key={v.varianteId}>
                    <Link href={`/producto/${v.varianteId}`} className="text-tinta transition-colors hover:text-rojo">
                      {v.referencia}{" "}
                      <span className="text-tinta/40">({v.stockTotal} vs. reorden {v.reorderPoint})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {alertasTraslado.length > 0 && (
            <div className="border border-tinta/10 bg-papel p-5">
              <h2 className="label-cayla mb-3 text-[10px] text-tinta/55">Sugerencias de traslado</h2>
              <ul className="space-y-2 text-sm">
                {alertasTraslado.map((v) => (
                  <li key={v.varianteId}>
                    <Link href={`/producto/${v.varianteId}`} className="text-tinta transition-colors hover:text-rojo">
                      {v.referencia}{" "}
                      <span className="text-tinta/40">
                        (a {v.sugerenciaTraslado?.sedeDestinoCodigo}, desde {v.sugerenciaTraslado?.sedeOrigenCodigo} · {v.sugerenciaTraslado?.stockOrigen} u.)
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
