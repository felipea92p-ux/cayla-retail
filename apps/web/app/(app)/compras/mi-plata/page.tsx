import { HandCoins, Receipt, ShoppingBag } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getMiPlata } from "@/lib/mi-plata";
import { MEDIOS_PLATA, detalleTienes, nombreGasto, textoMontoAnotado, textoPorConfirmar } from "@/lib/mi-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { AnotarPlata } from "@/components/mi-plata/AnotarPlata";
import { AnotarGasto } from "@/components/mi-plata/AnotarGasto";
import { MandarATienda } from "@/components/mi-plata/MandarATienda";
import { TerminarDia } from "@/components/mi-plata/TerminarDia";
import Link from "next/link";
import { TIPOS_PAPEL, type TipoPapel } from "@/lib/compra-rapida-reglas";

// Compras ▸ Mi plata para compras (ADR-0480, Compras simple): la pantalla de quien compra, hecha para el celular. Maqueta aprobada:
// docs/maquetas/compras-simple-2026-10/.
//
// Arriba, cuánto tiene para comprar (su fondo más lo que Compras todavía revisa, menos lo comprado y gastado que Compras todavía no
// completa); después «¿Qué hiciste?» con sus tres respuestas (Compré ropa · Me dieron plata · Gasté en otra cosa); aparte, lo que le
// falta («Mandar a la tienda») y, al final, «Terminé de comprar hoy». Al lado (abajo en el celular), lo que compró, lo que gastó y lo que
// anotó, con su estado. Si la lectura falla, lo dice (principio 9): nunca «tienes S/ 0» inventado. Una terminal no tiene «tu plata».
// `?mandar=1` (desde «Listo, tu compra quedó guardada») abre «Mandar a la tienda».
export default async function MiPlataPage({ searchParams }: { searchParams: Promise<{ mandar?: string }> }) {
  const persona = await exigirModulo("ordenes_compra");
  const [plata, { mandar }] = await Promise.all([getMiPlata(), searchParams]);
  const revisando = plata ? textoPorConfirmar(plata.porConfirmar) : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Mi plata para compras"
        subtitulo="Lo que tienes para comprar, lo que compraste y lo que mandas a la tienda."
      />

      {plata === null ? (
        <Aviso tono="error" titulo="No se pudo leer tu plata">
          Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.
        </Aviso>
      ) : !plata.persona ? (
        <Vacio icono={<HandCoins aria-hidden />} titulo="Entra con tu cuenta" guia="mi-plata.vacio">
          La plata para compras es de cada persona: desde una terminal no hay «tu plata». Entra con tu correo para anotarla.
        </Vacio>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <TarjetaCifra etiqueta="Tienes para comprar" valor={soles(plata.tiene)} guia="mi-plata.tienes">
              {detalleTienes(plata.tiene)}
            </TarjetaCifra>
            {revisando && (
              <p className="nota-cayla text-sm" data-guia="mi-plata.revisando">
                {revisando}
              </p>
            )}
            <section className="flex flex-col gap-3">
              <TituloSeccion>¿Qué hiciste?</TituloSeccion>
              <Link href="/compras/mi-plata/compra" data-guia="mi-plata.compre" className="card-cayla mov-boton flex w-full items-center gap-4 p-4 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand/50 text-tinta">
                  <ShoppingBag className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-xl leading-tight text-tinta">Compré ropa</span>
                  <span className="block text-sm text-taupe">A un proveedor, en la calle o por pedido: anota qué compraste.</span>
                </span>
              </Link>
              <AnotarPlata puedeYaTenia={plata.puedeYaTenia} />
              <AnotarGasto />
            </section>
            {plata.porMandar.length > 0 && (
              <section className="flex flex-col gap-3">
                <TituloSeccion>Te falta</TituloSeccion>
                <MandarATienda porMandar={plata.porMandar} abrirAlCargar={mandar === "1"} />
              </section>
            )}
            <TerminarDia plata={plata} />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
          {plata.compras.length > 0 && (
            <section className="flex min-w-0 flex-col gap-3" data-guia="mi-plata.compras">
              <TituloSeccion cuenta={plata.compras.length}>Lo que compraste</TituloSeccion>
              <ul className="card-cayla divide-y divide-sand">
                {plata.compras.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-tinta">Compra a {c.proveedor}</span>
                      <span className="block text-xs text-taupe">
                        {c.prendas} prendas · {TIPOS_PAPEL[c.tipo as TipoPapel]?.nombre ?? "Papel"}
                        {c.fecha ? ` · ${diaMes(c.fecha)}` : ""}
                        {c.porMandar.length
                          ? ` · falta mandar a ${c.porMandar.join(", ")}`
                          : c.tiendas.length
                            ? ` · salió a ${c.tiendas.join(", ")}`
                            : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">− {soles(c.monto)}</span>
                      <Chip tono={c.porCompletar ? "ambar" : "verde"} title={c.porCompletar ? "Compras copia su serie y número" : "Compras ya la completó"}>
                        {c.porCompletar ? "Por completar" : "Completa"}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {plata.gastos.length > 0 && (
            <section className="flex min-w-0 flex-col gap-3" data-guia="mi-plata.gastos">
              <TituloSeccion cuenta={plata.gastos.length}>Lo que gastaste en otras cosas</TituloSeccion>
              <ul className="card-cayla divide-y divide-sand">
                {plata.gastos.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                    <Receipt className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-tinta">{nombreGasto(g)}</span>
                      <span className="block text-xs text-taupe">
                        {g.fecha ? diaMes(g.fecha) : ""}
                        {g.conFoto ? " · con foto" : " · sin papel"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">− {soles(g.monto)}</span>
                      <Chip tono={g.porCompletar ? "ambar" : "verde"} title={g.porCompletar ? "Ya bajó de tu plata; Compras lo revisa" : "Compras ya lo revisó"}>
                        {g.porCompletar ? "Por revisar" : "Revisado"}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="flex min-w-0 flex-col gap-3" data-guia="mi-plata.lista">
            <TituloSeccion cuenta={plata.anotada.length}>Lo que anotaste</TituloSeccion>
            {plata.anotada.length === 0 ? (
              <Vacio icono={<HandCoins aria-hidden />} titulo="Todavía no anotas plata" tamano="chico">
                Cuando te den plata para comprar, tócala en «Me dieron plata».
              </Vacio>
            ) : (
              <ul className="card-cayla divide-y divide-sand">
                {plata.anotada.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-tinta">
                        {a.medio === "ya_tenia" ? "Plata que ya tenías" : "Te dieron plata"}
                      </span>
                      <span className="block text-xs text-taupe">
                        {MEDIOS_PLATA[a.medio].nombre}
                        {a.fecha ? ` · ${diaMes(a.fecha)}` : ""}
                        {a.conFoto ? " · con foto" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">+ {textoMontoAnotado(a)}</span>
                      <Chip tono={a.confirmada ? "verde" : "ambar"} title={a.confirmada ? "Compras ya la revisó" : "Ya la puedes usar; Compras la revisa"}>
                        {a.confirmada ? "Confirmada" : "Por confirmar"}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </div>
        </div>
      )}
    </div>
  );
}
