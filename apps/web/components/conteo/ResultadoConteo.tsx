import Link from "next/link";
import { agruparConteo, codigosDeConteo, textoAlcance, textoLugar, textoHallazgoDeLinea, textoResultadoConteo, type DetalleConteo } from "@/lib/conteo-reglas";
import { getCatalogo } from "@/lib/catalogo-v2";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Volver } from "@/components/ui/Volver";
import { EditarConteo } from "@/components/conteo/EditarConteo";
import { EstadoLinea } from "@/components/conteo/EstadoLinea";
import { ResumenConteo } from "@/components/conteo/ResumenConteo";

/* ====================================================================
   ResultadoConteo · «Conteo terminado» (Inventario ▸ Conteo, rediseño 2026-09-29)

   Lo que se ve al abrir un conteo ya cerrado: cómo salió (todo correcto, N diferencias encontradas, parcial), cuántas
   variantes se verificaron, y tres salidas —Existencias para ver cómo quedó el stock, Movimientos para ver cada ajuste,
   y la vuelta a Conteo— más «Corregir conteo», que lo reabre para corregirlo (`EditarConteo`). Sin confeti, sin ilustración, sin modal: terminar un conteo es trabajo hecho, no un premio.

   «Variantes con diferencia» da el rastro sin ir a Movimientos: cada variante que se ajustó, con lo que CAYLA esperaba y lo
   que se contó («11 → 9»). Solo las que tienen su movimiento de ajuste (`ajusteMovimientoId`): lo que el cierre de verdad
   escribió. Con muchas (la primera cuenta de una tienda puede traer cientos) se muestran las primeras y el resto se
   dice con su número y el camino a Movimientos, para no dibujar cientos de fotos.

   Server Component asíncrono: el nombre de cada prenda lo pone el catálogo (guardado por versión, no es una consulta
   nueva) y solo se pide si hay variantes corregidas que nombrar. `EstadoLinea` se dibuja como JSX, nunca se llama.
   ==================================================================== */

/** Cuántas variantes corregidas se dibujan; el resto se resume en una línea. */
const MAX_CORREGIDAS = 60;

export async function ResultadoConteo({ detalle, sede, volverA, puedeEditar }: { detalle: DetalleConteo; sede: string; volverA: string | null; puedeEditar: boolean }) {
  const { conteo, resumen, lineas } = detalle;
  const parcial = resumen.pendientes > 0;
  const titulo = textoResultadoConteo({ estado: conteo.estado, lineas: resumen.verificadas, lineasConDiferencia: resumen.conDiferencia, parcial });

  const corregidas = lineas.filter((l) => l.ajusteMovimientoId !== null && l.contada !== null);
  const catalogo = corregidas.length > 0 ? new Map((await getCatalogo()).map((v) => [v.varianteId, v])) : null;
  // Cada línea con su prenda, en el mismo orden de la pantalla de contar (modelo, color, talla). Una que ya no está en el
  // catálogo se dice sin nombre inventado.
  const filas = agruparConteo(
    corregidas.map((linea) => {
      const v = catalogo?.get(linea.varianteId);
      return {
        linea,
        varianteId: linea.varianteId,
        productoId: v?.productoId ?? linea.varianteId,
        referencia: v?.referencia ?? "Prenda que ya no está en el catálogo",
        color: v?.color ?? null,
        colorHex: v?.colorHex ?? null,
        fotoUrl: v?.fotoUrl ?? null,
        talla: v?.talla ?? null,
        sku: v ? codigosDeConteo(v).sku : "",
      };
    })
  ).flatMap((g) => g.tallas);
  const visibles = filas.slice(0, MAX_CORREGIDAS);

  const abrio = diaYHoraLima(conteo.creadoEn);
  const cerro = conteo.cerradoEn ? diaYHoraLima(conteo.cerradoEn) : null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo="Conteo terminado"
        subtitulo={`Conteo ${conteo.numero} · ${textoLugar(conteo)} · ${textoAlcance(conteo)}`}
        pie={volverA ? <Volver forma="boton" href={volverA} a="Movimientos" /> : <Volver forma="boton" href="/inventario/conteo" a="Conteo" />}
      />

      <section className="card-cayla space-y-3 p-5 sm:p-6" aria-labelledby="resultado-conteo">
        <h2 id="resultado-conteo" className="font-display text-2xl text-tinta">
          {titulo}
        </h2>
        <ResumenConteo resumen={resumen} variante="resultado" parcial={parcial} />
        <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
          <Link href="/inventario" className="btn-cayla btn-primario h-11">
            Ver Existencias
          </Link>
          <Link href={`/inventario/movimientos?proc=conteo&q=${encodeURIComponent(`Conteo ${conteo.numero}`)}`} className="btn-cayla btn-secundario h-11">
            Ver movimientos del conteo
          </Link>
          {/* Los conteos de antes del rediseño (sin foto) no se pueden reabrir: no traen confirmaciones. */}
          {conteo.fotoEn !== null && <EditarConteo conteoId={conteo.id} puedeEditar={puedeEditar} variantesCorregidas={corregidas.map((l) => l.varianteId)} />}
        </div>
      </section>

      {visibles.length > 0 && (
        <section className="card-cayla @container overflow-hidden" aria-labelledby="variantes-con-diferencia">
          <div className="space-y-0.5 px-4 py-3.5 @[36rem]:px-5">
            <h2 id="variantes-con-diferencia" className="font-display text-lg text-tinta">
              Variantes con diferencia
            </h2>
            <p className="text-sm text-taupe">Lo que CAYLA esperaba y lo que se contó. El stock quedó ajustado.</p>
          </div>
          <ul className="divide-y divide-sand border-t border-sand">
            {visibles.map(({ linea, ...prenda }) => (
              <li
                key={linea.varianteId}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3 @[36rem]:grid-cols-[auto_minmax(0,1fr)_auto_9rem] @[36rem]:gap-x-4 @[36rem]:px-5"
              >
                <MiniaturaPrenda fotoUrl={prenda.fotoUrl} colorHex={prenda.colorHex} tamano="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-tinta">{prenda.referencia}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-taupe">
                    {prenda.color ? (
                      <>
                        {/* En el celular `MuestraColor` ya escribe el nombre al lado de la cápsula; en escritorio solo lo dice al pasar el mouse. */}
                        <MuestraColor nombre={prenda.color} hex={prenda.colorHex} compacta />
                        <span className="max-sm:hidden">{prenda.color}</span>
                        {prenda.talla && <span className="min-w-0 truncate">· {prenda.talla}</span>}
                      </>
                    ) : (
                      <span className="min-w-0 truncate">{["Sin color", prenda.talla].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                </span>
                <div className="col-start-2 flex items-center justify-between gap-3 @[36rem]:contents">
                  <span className="font-display text-xl tabular-nums text-tinta">
                    {linea.debeHaber} <span className="text-taupe">→</span> {linea.contada}
                  </span>
                  <EstadoLinea estado={linea.estado} debeHaber={linea.debeHaber} contada={linea.contada} diferencia={linea.diferencia} />
                </div>
                {/* La prenda que faltó y apareció después: el conteo conserva lo que se contó, y aquí se ve que ya se recuperó. */}
                {textoHallazgoDeLinea(linea) && <p className="col-start-2 text-xs text-verde @[36rem]:col-span-full @[36rem]:col-start-2">✓ {textoHallazgoDeLinea(linea)}</p>}
              </li>
            ))}
          </ul>
          {filas.length > visibles.length && (
            <p className="border-t border-sand px-4 py-3 text-sm text-taupe @[36rem]:px-5">
              Y {filas.length - visibles.length} {filas.length - visibles.length === 1 ? "variante más" : "variantes más"}.{" "}
              <Link href={`/inventario/movimientos?proc=conteo&q=${encodeURIComponent(`Conteo ${conteo.numero}`)}`} className="text-tinta underline underline-offset-2 hover:text-taupe">
                Míralas todas en Movimientos →
              </Link>
            </p>
          )}
        </section>
      )}

      <p className="nota-cayla">
        Abrió <b>{conteo.abiertoPorNombre}</b> el {abrio.dia} a las {abrio.hora}
        {cerro ? (
          <>
            {" "}
            · cerró <b>{conteo.cerradoPorNombre ?? "—"}</b> el {cerro.dia} a las {cerro.hora}
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
