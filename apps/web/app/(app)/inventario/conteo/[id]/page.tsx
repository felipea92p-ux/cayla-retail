import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoDetalle } from "@/lib/conteos";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

// Primera columna con el mismo piso (13.5rem) que Existencias: la celda de la prenda es la misma
// y necesita el mismo ancho para que «SKU · talla · cápsula» no se salga hacia la columna vecina.
const PLANTILLA = "sm:grid-cols-[minmax(13.5rem,1.4fr)_5rem_5rem_6rem]";

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}
function soles(n: number) {
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// El detalle de un conteo (2026-09-16, diseño de Felipe): qué se contó,
// línea por línea, con sistema, físico y diferencia — las diferencias
// primero. Hasta hoy un conteo cerrado solo decía «N líneas contadas». Es
// solo lectura: un conteo cerrado ya escribió sus ajustes como movimientos
// y no se toca; uno abierto se sigue contando en `/inventario/conteo`.
export default async function ConteoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await requirePersonaActualV2();
  const conteo = await getConteoDetalle(id);
  if (!conteo) notFound();

  const abierto = conteo.estado === "abierto";
  const alcance = conteo.alcance === "categoria" && conteo.alcanceCategoriaNombre ? `solo ${conteo.alcanceCategoriaNombre}` : "todo el catálogo";
  const conDiferencia = conteo.lineasDetalle.filter((l) => l.diferencia !== 0);

  return (
    <div className="space-y-6">
      <InventarioHero
        eyebrow={
          <>
            <Link href="/inventario/conteo" className="hover:text-rojo">
              Conteo
            </Link>{" "}
            · {persona.ubicacionEtiqueta}
          </>
        }
        titulo={
          <>
            Conteo {conteo.numero}
            <span className="text-tinta/55"> · </span>
            {conteo.sububicacionNombre ?? "Toda la ubicación"}
          </>
        }
        descripcion={
          <>
            {alcance.charAt(0).toUpperCase() + alcance.slice(1)} · abrió {conteo.abiertoPorNombre} el {fechaHora(conteo.creadoEn)}
            {!abierto && conteo.cerradoEn && ` · cerró ${conteo.cerradoPorNombre} el ${fechaHora(conteo.cerradoEn)}`}
          </>
        }
        foto={fotoHeroPorPantalla("conteo")}
        variante="integrado"
        accion={
          abierto ? (
            <Link
              href="/inventario/conteo#contar"
              className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema shadow-sm transition-colors hover:bg-rojo"
            >
              Seguir contando
            </Link>
          ) : (
            <Chip tono={conteo.lineasConDiferencia === 0 ? "verde" : "rojo"}>
              {conteo.lineasConDiferencia === 0 ? "Sin diferencias" : `${conteo.lineasConDiferencia} con diferencia`}
            </Chip>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-cayla p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Líneas contadas</p>
          <p className="font-display mt-1 text-3xl tabular-nums text-tinta">{conteo.lineas}</p>
          <p className="mt-1 text-xs text-tinta/65">{conDiferencia.length === 0 ? "todas coinciden con el sistema" : `${conDiferencia.length} con diferencia`}</p>
        </div>
        <div className="card-cayla p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Sistema → físico</p>
          <p className="font-display mt-1 text-3xl tabular-nums text-tinta">
            {conteo.sistema} <span className="text-tinta/45">→</span> {conteo.contado}
          </p>
          <p className="mt-1 text-xs text-tinta/65">
            {conteo.diferencia === 0 ? "sin diferencia neta" : `${conteo.diferencia > 0 ? "+" : ""}${conteo.diferencia} unidades ${conteo.diferencia > 0 ? "de más" : "de menos"}`}
          </p>
        </div>
        <div className="card-cayla p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Diferencia en soles</p>
          <p className={`font-display mt-1 text-3xl tabular-nums ${conteo.solesDiferencia < 0 ? "text-rojo-profundo" : conteo.solesDiferencia > 0 ? "text-verde-profundo" : "text-tinta"}`}>
            {soles(conteo.solesDiferencia)}
          </p>
          <p className="mt-1 text-xs text-tinta/65">al costo actual de cada prenda{abierto ? " · se ajusta al cerrar" : " · ya ajustado en el stock"}</p>
        </div>
      </div>

      {conteo.lineasDetalle.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no se contó ninguna prenda en este conteo.</p>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Producto / variante" },
              { titulo: "Sistema", alinear: "centro" },
              { titulo: "Físico", alinear: "centro" },
              { titulo: "Diferencia", alinear: "centro" },
            ]}
          />
          {conteo.lineasDetalle.map((l) => (
            <div key={l.varianteId} className={fila(PLANTILLA)}>
              <ProductoVarianteCelda referencia={l.referencia} sku={l.sku} talla={l.talla} color={l.color} colorHex={l.colorHex} fotoUrl={l.fotoUrl} />
              <span className={celda("centro", "text-sm tabular-nums text-tinta/75")}>
                <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Sistema</span>
                {l.sistema}
              </span>
              <span className={celda("centro", "text-sm font-semibold tabular-nums text-tinta")}>
                <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Físico</span>
                {l.contado}
              </span>
              <span className={celda("centro", `text-sm font-semibold tabular-nums ${l.diferencia < 0 ? "text-rojo-profundo" : l.diferencia > 0 ? "text-verde-profundo" : "text-tinta/45"}`)}>
                <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">Diferencia</span>
                {l.diferencia === 0 ? "=" : `${l.diferencia > 0 ? "+" : ""}${l.diferencia}`}
              </span>
            </div>
          ))}
        </Tabla>
      )}

      {!abierto && conDiferencia.length > 0 && (
        <p className="text-xs text-tinta/65">
          Cada diferencia quedó registrada como un ajuste por conteo en{" "}
          <Link href="/inventario/movimientos?proc=conteo" className="text-rojo hover:underline">
            Movimientos
          </Link>
          .
        </p>
      )}
    </div>
  );
}
