import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getAperturasPorRevisar, getCierresPagina, getResumenCierres } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { CIERRES_POR_PAGINA, paginaValida, resumirPeriodo, textoPeriodo } from "@/lib/historial-cierres-reglas";
import { AperturasPorRevisar } from "@/components/AperturasPorRevisar";
import { HistorialCierresTabla } from "@/components/HistorialCierresTabla";
import { PaginacionPaginas } from "@/components/Paginacion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Volver } from "@/components/ui/Volver";

function money(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Params = { sede?: string; estado?: string; pagina?: string; prueba?: string };

// Rediseño 2026-10-08 (maqueta docs/maquetas/historial-cierres-2026-10, elegida por Felipe): cifras del período →
// filtros por tienda y «solo los que no cuadraron» → una fila por cierre agrupada por día, paginada de a 20.
// Sin RPC ni filtro de ubicación propios: la misma RLS de /caja (fn_puede_operar_ubicacion) decide qué cajas se ven,
// con la sede en cada fila. Los cierres archivados como prueba (D-54, ADR-0159) no se muestran salvo con `?prueba=1`.
export default async function HistorialCierresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const incluirPrueba = params.prueba === "1";
  const soloConDiferencia = params.estado === "diferencia";

  // El resumen se lee de TODAS las sedes: da los números de cada píldora y, filtrado aquí, las cifras de la sede elegida.
  const [resumenTodas, ubicaciones, aperturas] = await Promise.all([
    getResumenCierres({ incluirPrueba }),
    getUbicaciones(),
    // ADR-0186: el aviso al líder. Solo el líder las marca como revisadas (`revisar_apertura_caja`).
    persona.rol === "lider" ? getAperturasPorRevisar() : Promise.resolve(null),
  ]);
  const resumenTodo = resumirPeriodo(resumenTodas);
  const sedes = ubicaciones.filter((u) => resumenTodo.porSede.has(u.id));
  const sede = sedes.find((u) => u.id === params.sede) ?? null;
  const resumen = sede ? resumirPeriodo(resumenTodas.filter((f) => f.ubicacionId === sede.id)) : resumenTodo;
  const conDiferencia = resumen.total - resumen.cuadraron;

  const totalPaginas = Math.max(1, Math.ceil((soloConDiferencia ? conDiferencia : resumen.total) / CIERRES_POR_PAGINA));
  const pagina = paginaValida(params.pagina, totalPaginas);
  const { cierres, total } = await getCierresPagina({ ubicacionId: sede?.id, soloConDiferencia, incluirPrueba }, pagina, CIERRES_POR_PAGINA);

  // Los filtros vigentes, para que las píldoras y la paginación conserven lo que no tocan.
  const vigentes: Params = { sede: sede?.id, estado: soloConDiferencia ? "diferencia" : undefined, prueba: incluirPrueba ? "1" : undefined };
  // Una píldora cambia un filtro y vuelve a la primera página.
  const href = (cambios: Partial<Params>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...vigentes, ...cambios })) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/caja/historial?${qs}` : "/caja/historial";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <EncabezadoPagina
        sede="Caja · todas las sedes"
        sinHora
        volver={<Volver href="/caja" a="Caja" />}
        titulo="Historial de cierres"
        subtitulo={
          <>
            Cada noche se cuenta la plata del cajón. Si es la misma que el sistema calculó, la caja{" "}
            <b className="font-semibold text-verde-profundo">cuadró</b>.
          </>
        }
      />

      {aperturas && aperturas.length > 0 && <AperturasPorRevisar aperturas={aperturas} />}

      {resumenTodo.total === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no se cerró ninguna caja. Cuando se cierre la primera, aparecerá aquí.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <TarjetaCifra
              etiqueta="Cuadraron"
              valor={resumen.cuadraron}
              unidad={`de ${resumen.total} ${resumen.total === 1 ? "cierre" : "cierres"}`}
              tono="text-verde-profundo"
            >
              {textoPeriodo(resumen.desde, resumen.hasta)}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Faltó plata" valor={money(resumen.falto)} tono={resumen.cierresFalto > 0 ? "text-rojo-profundo" : undefined}>
              {resumen.cierresFalto === 0 ? "en ningún cierre" : `en ${resumen.cierresFalto} de los ${resumen.total} cierres`}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Sobró plata" valor={money(resumen.sobro)} tono={resumen.cierresSobro > 0 ? "text-ambar-profundo" : undefined}>
              {resumen.cierresSobro === 0 ? "en ningún cierre" : `en ${resumen.cierresSobro} ${resumen.cierresSobro === 1 ? "cierre" : "cierres"}`}
            </TarjetaCifra>
          </div>

          <nav aria-label="Filtrar cierres" className="flex flex-wrap items-center gap-2">
            <Link href={href({ sede: undefined })} aria-current={!sede ? "page" : undefined} className="pildora-cayla">
              Todas las tiendas
            </Link>
            {sedes.map((u) => (
              <Link key={u.id} href={href({ sede: u.id })} aria-current={sede?.id === u.id ? "page" : undefined} className="pildora-cayla">
                {u.nombre.replace(/^Tienda\s+/i, "")} <span className="font-normal opacity-60">{resumenTodo.porSede.get(u.id)}</span>
              </Link>
            ))}
            <span className="mx-1 h-5 w-px bg-sand" aria-hidden />
            <Link
              href={href({ estado: soloConDiferencia ? undefined : "diferencia" })}
              aria-current={soloConDiferencia ? "page" : undefined}
              className="pildora-cayla"
            >
              Solo los que no cuadraron <span className="font-normal opacity-60">{conDiferencia}</span>
            </Link>
          </nav>

          {cierres.length === 0 ? (
            <p className="card-cayla p-5 text-sm text-tinta/75">
              {soloConDiferencia ? `Todos los cierres${sede ? ` de ${sede.nombre}` : ""} cuadraron. No hay nada que revisar.` : "No hay cierres con este filtro."}
            </p>
          ) : (
            <HistorialCierresTabla
              cierres={cierres}
              pie={
                <PaginacionPaginas
                  pagina={pagina}
                  totalPaginas={Math.max(1, Math.ceil(total / CIERRES_POR_PAGINA))}
                  totalItems={total}
                  params={{ ...vigentes }}
                  pathname="/caja/historial"
                  sustantivo={["cierre", "cierres"]}
                />
              }
            />
          )}
        </>
      )}
    </div>
  );
}
