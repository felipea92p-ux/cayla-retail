import Link from "next/link";
import { notFound } from "next/navigation";
import { CanceladoConteo } from "@/components/conteo/CanceladoConteo";
import { ContarConteo } from "@/components/conteo/ContarConteo";
import { ResultadoConteo } from "@/components/conteo/ResultadoConteo";
import { getCatalogoMarcas } from "@/lib/marcas-datos";
import { getEjesPorCategoria } from "@/lib/catalogo-v2";
import { textoAlcance, textoLugar } from "@/lib/conteo-reglas";
import { getCatalogoConteo, getDetalleConteo } from "@/lib/conteos";
import { exigir } from "@/lib/resultado";
import { idsDeParam } from "@/lib/etiqueta-precio-reglas";
import { volverAMovimientos } from "@/lib/movimientos-reglas";
import { exigirModulo, puede } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";

// Un conteo, según en qué está (rediseño 2026-09-29). Una sola ruta, cuatro caras:
//  · abierto  → CONTAR: la lista por producto y color, con lo que debe haber y lo que se cuenta.
//  · cerrado  → RESULTADO («Conteo terminado»).
//  · anulado  → «Conteo cancelado».
//  · cerrado sin ninguna variante verificada (los conteos de antes del rediseño que se cerraron vacíos) → también
//    «Conteo cancelado»: cerrar sin verificar nada no dice nada del inventario y no debe leerse como un resultado.
// `?volver=` (Movimientos) manda la vuelta de vuelta a esa lista con sus filtros. `?variantes=` acota la lista de contar
// a esas tallas (ADR-0241, «Contar esta prenda» desde un movimiento).
export default async function ConteoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string; variantes?: string | string[] }>;
}) {
  const [{ id }, { volver, variantes }] = await Promise.all([params, searchParams]);
  // La puerta va acá y no solo en el layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("conteos");
  const detalle = await getDetalleConteo(id);
  if (!detalle) notFound();
  const { conteo, resumen } = detalle;
  const volverA = volverAMovimientos(volver);

  if (conteo.estado === "anulado" || (conteo.estado === "cerrado" && resumen.verificadas === 0)) {
    return <CanceladoConteo detalle={detalle} sede={persona.ubicacionEtiqueta} volverA={volverA} />;
  }
  if (conteo.estado === "cerrado") {
    return <ResultadoConteo detalle={detalle} sede={persona.ubicacionEtiqueta} volverA={volverA} puedeEditar={puede(persona, "ajustarInventario")} />;
  }

  // Abierto: lo que necesita la pantalla de contar. Son las mismas fuentes que usaba el conteo de antes para el alta al vuelo.
  const supabase = await createClient();
  const [catalogo, categorias, colores, ejes, marcas] = await Promise.all([
    getCatalogoConteo(),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("colores").select("codigo, nombre").eq("activo", true).order("orden"),
    getEjesPorCategoria(),
    getCatalogoMarcas(),
  ]);

  // «Contar esta prenda»: cómo se llaman las prendas pedidas, para decir arriba qué se está contando.
  const soloVariantes = idsDeParam(variantes);
  const soloPrendas = soloVariantes.flatMap((vid) => {
    const p = catalogo.find((x) => x.varianteId === vid);
    return p ? [[p.referencia, p.color, p.talla].filter(Boolean).join(" · ")] : [];
  });
  const hrefTodo = `/inventario/conteo/${conteo.id}${volverA ? `?volver=${encodeURIComponent(volverA)}` : ""}`;
  const generadoEn = idDeCarga();

  return (
    // La barra fija de abajo (`BarraFija`) mide ~110–135 px en el celular y crece ~80 mientras hay un aviso (prenda fuera de
    // alcance, guardado que falló), más el área segura del iPhone: sin este aire tapa la última fila.
    <div className="space-y-6 pb-56 sm:pb-32">
      <ContarConteo
        // Un identificador de ESTA carga: si el navegador devuelve una copia vieja de la página (botón «atrás»), la pantalla lo nota y se relee.
        key={`${conteo.id}-${generadoEn}`}
        generadoEn={generadoEn}
        detalle={detalle}
        catalogo={catalogo}
        soloVariantes={soloVariantes}
        categorias={exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }))}
        colores={exigir(colores, "los colores").map((c) => ({ codigo: c.codigo, nombre: c.nombre }))}
        tallasPorCategoria={ejes.tallas}
        marcas={marcas}
        puedeCrearMarcas={puede(persona, "editarCatalogo")}
        sede={persona.ubicacionEtiqueta}
        lugar={`${textoLugar(conteo)} · ${textoAlcance(conteo)}`}
        volver={{ href: volverA ?? "/inventario/conteo", a: volverA ? "Movimientos" : "Conteo" }}
        notaAcotada={
          soloPrendas.length > 0 ? (
            <p className="nota-cayla flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span>
                        Contando solo: <b>{soloPrendas.slice(0, 4).join(", ")}</b>
                        {soloPrendas.length > 4 && ` y ${soloPrendas.length - 4} más`}
                      </span>
                      <Link href={hrefTodo} className="btn-cayla btn-enlace text-xs">
                        Contar todo
                      </Link>
                    </p>
          ) : null
        }
      />
    </div>
  );
}

/** Un texto distinto por cada vez que el servidor arma esta página. Solo se compara por igualdad: no es una hora ni se lee. */
function idDeCarga(): string {
  return Date.now().toString(36);
}
