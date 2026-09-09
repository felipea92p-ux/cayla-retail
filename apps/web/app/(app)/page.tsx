import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { getCajaAbierta } from "@/lib/finanzas";
import { getPanelLider } from "@/lib/panel";
import { getPendientes } from "@/lib/pendientes";
import { BuscadorHero } from "@/components/BuscadorHero";
import { Ayuda } from "@/components/Ayuda";
import { TarjetaIndicador, normalizarSparkline } from "@/components/TarjetaIndicador";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

// Inicio por rol (rediseño UX 2026-07-18): la Encargada abre con el buscador
// protagonista y acciones directas; el Líder abre con el pulso completo del negocio.
export default async function InicioPage() {
  const persona = await requirePersonaActual();
  const esLider = persona.rol === "lider";

  // El panel del Líder se arma sobre las MISMAS variantes que ya trae el catálogo
  // (de ahí sale el inventario a costo), así que va después en vez de en paralelo:
  // se cambia un viaje ligero a Supabase por dejar de releer `stock` entero.
  const [{ variantes, alertasReposicion, alertasTraslado }, cajaAbierta, pendientes] = await Promise.all([
    getCatalogoInteligente(persona),
    getCajaAbierta(persona.sedeId),
    getPendientes(persona),
  ]);
  const panel = await getPanelLider(persona, variantes);

  const reponerYa = variantes.filter((v) => v.reponerYa).length;
  const estancados = variantes.filter((v) => v.estancado).length;

  const accionesRapidas = [
    { href: "/vender", etiqueta: "Vender", detalle: cajaAbierta ? "Caja abierta" : "Caja cerrada — ábrela aquí" },
    { href: "/inventario/recibir", etiqueta: "Recibir mercadería", detalle: "Ingresar un fardo al almacén" },
    { href: "/inventario/almacen", etiqueta: "Bajar a tienda", detalle: "Del almacén al piso de venta" },
    { href: "/inventario", etiqueta: "Inventario", detalle: "Catálogo completo con stock" },
  ];

  // ==================== Inicio de Encargada ====================
  if (!esLider) {
    return (
      <div className="space-y-10">
        <BuscadorHero />

        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Acciones</p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
            {accionesRapidas.map((a) => (
              <Link key={a.href} href={a.href} className="group bg-crema p-5 transition-colors hover:bg-papel">
                <p className="text-sm font-medium text-tinta group-hover:text-rojo">{a.etiqueta}</p>
                <p className="mt-1 text-xs text-tinta/65">{a.detalle}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-tinta/75">
          <span>
            Caja de {persona.sedeCodigo}:{" "}
            <Link href="/vender" className={cajaAbierta ? "text-tinta hover:text-rojo" : "text-rojo hover:underline"}>
              {cajaAbierta ? `abierta (apertura ${money(cajaAbierta.montoApertura)})` : "cerrada"}
            </Link>
          </span>
          {reponerYa > 0 && (
            <Link href="/inventario" className="text-tinta hover:text-rojo">
              {reponerYa} prenda{reponerYa === 1 ? "" : "s"} por reponer
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ==================== Inicio de Líder: panel del día ====================
  const cajas = panel?.cajasTiendas ?? [];
  const cajasCerradas = cajas.filter((c) => !c.abierta).map((c) => c.codigo);
  const valorAlmacen = panel?.valorAlmacenTotal ?? 0;

  // Comparativo honesto: el mismo día de la semana pasada contado hasta esta
  // misma hora (el porqué está en panel.ts). Sin base no se muestra nada — un
  // "+100%" contra cero no informa, solo decora.
  const ventasHoy = panel?.ventasHoyTotal ?? 0;
  const baseSemanaPasada = panel?.ventasSemanaPasadaAEstaHora ?? 0;
  const comparativoVentas =
    baseSemanaPasada > 0
      ? {
          texto: `${ventasHoy >= baseSemanaPasada ? "+" : ""}${(((ventasHoy - baseSemanaPasada) / baseSemanaPasada) * 100).toFixed(0)}% vs. la semana pasada`,
          positivo: ventasHoy >= baseSemanaPasada,
        }
      : undefined;

  return (
    <div className="space-y-10">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Hoy</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TarjetaIndicador
            etiqueta="Ventas de hoy"
            ayuda={
              <Ayuda titulo="Ventas de hoy">
                Lo vendido hoy en todas las sedes. La comparación es contra el MISMO día de la
                semana pasada y solo hasta esta misma hora: un martes se parece a otro martes, y a
                las 10am ninguna tienda vendió todavía su día entero. La línea de arriba son los
                últimos 14 días.
              </Ayuda>
            }
            valor={money(ventasHoy)}
            comparativo={comparativoVentas}
            sparkline={panel ? normalizarSparkline(panel.ventasSerie) : undefined}
            pie={
              panel && panel.ventasHoyPorSede.length > 0
                ? panel.ventasHoyPorSede.map((s) => `${s.codigo} ${money(s.monto)}`).join(" · ")
                : undefined
            }
          />
          {/* Sin `critico`: una caja cerrada de noche es lo normal, no una alerta. Lo
              que sí lo es —una caja que amaneció abierta— vive en la bandeja de abajo. */}
          <TarjetaIndicador
            etiqueta="Cajas"
            valor={`${cajas.length - cajasCerradas.length} de ${cajas.length} abiertas`}
            alerta={cajasCerradas.length > 0 ? `${cajasCerradas.join(", ")} con la caja cerrada` : undefined}
          />
          <TarjetaIndicador
            etiqueta="Reponer ya"
            ayuda={
              <Ayuda titulo="Reponer ya">
                Cuántas prendas están por agotarse según qué tan rápido se venden. No esperes a
                quedarte en cero: estas necesitan pedido pronto. El detalle y cuánto comprar está en
                Comercial.
              </Ayuda>
            }
            valor={String(reponerYa)}
            critico={reponerYa > 0}
            pie={`${estancados} estancada${estancados === 1 ? "" : "s"}`}
          />
          <TarjetaIndicador
            etiqueta="Inventario a costo"
            ayuda={
              <Ayuda titulo="Inventario a costo">
                Cuánta plata tuya está metida en mercadería sin vender, valorada a lo que te costó.
                Cuenta lo que está en el piso de venta Y lo que sigue en el almacén sin bajar. No es
                pérdida, pero es dinero dormido: rinde cuando se vende, no antes.
              </Ayuda>
            }
            valor={money(panel?.valorInventarioTotal ?? 0)}
            pie={
              <>
                <span className="block">
                  {valorAlmacen > 0 ? `Incluye ${money(valorAlmacen)} en almacén` : "Incluye el almacén (hoy vacío)"}
                </span>
                <Link href="/comercial" className="mt-0.5 inline-block hover:text-rojo">
                  Ver análisis →
                </Link>
              </>
            }
          />
        </div>
      </div>

      {/* Bandeja de pendientes: la cola de trabajo, no un resumen. Si no hay nada
          que hacer el bloque NO existe — nunca una fila de ceros, que es como se
          enseña a ignorar una zona de la pantalla (ver lib/pendientes.ts). */}
      {pendientes.length > 0 && (
        <div className="card-cayla p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Pendientes</p>
          <ul className="mt-2 divide-y divide-tinta/10">
            {pendientes.map((p) => (
              <li key={p.clave} className="py-2.5">
                <Link href={p.href} className="group block">
                  <p className={`text-sm ${p.critico ? "text-rojo" : "text-tinta"} group-hover:underline`}>
                    {p.etiqueta}
                  </p>
                  {p.detalle && <p className="mt-0.5 text-xs text-tinta/65">{p.detalle}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {alertasReposicion.length > 0 && (
        <div className="card-cayla p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label-cayla text-[11px] text-rojo">Reponer pronto</h2>
            <Link href="/comercial" className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
              Sugerencias de compra →
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {alertasReposicion.slice(0, 5).map((v) => (
              <li key={v.varianteId}>
                <Link href={`/producto/${v.varianteId}`} className="text-tinta transition-colors hover:text-rojo">
                  {v.referencia} <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>{" "}
                  <span className="text-tinta/65">({v.stockTotal} vs. reorden {v.reorderPoint})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* `alertasTraslado` se calculaba en inteligencia.ts desde que ese archivo existe
          y no lo leía ninguna pantalla. Es lo más barato del Inicio: viene en la misma
          llamada que ya se hacía, sin una consulta más. */}
      {alertasTraslado.length > 0 && (
        <div className="card-cayla p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label-cayla text-[11px] text-tinta/65">Mover entre tiendas</h2>
            <Link href="/inventario" className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
              Ver inventario →
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {alertasTraslado.slice(0, 5).map((v) => {
              const t = v.sugerenciaTraslado;
              if (!t) return null;
              return (
                <li key={v.varianteId}>
                  <Link href={`/producto/${v.varianteId}`} className="text-tinta transition-colors hover:text-rojo">
                    {v.referencia} <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>{" "}
                    <span className="text-tinta/65">
                      {t.sedeOrigenCodigo} → {t.sedeDestinoCodigo} ·{" "}
                      {t.limiteDestino > 0
                        ? `${t.sedeDestinoCodigo} tiene ${t.stockDestino}, su mínimo es ${t.limiteDestino}`
                        : `${t.sedeDestinoCodigo} está en cero`}{" "}
                      · a {t.sedeOrigenCodigo} le sobran {t.sobranteOrigen}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Acciones</p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12 sm:grid-cols-4">
          {accionesRapidas.map((a) => (
            <Link key={a.href} href={a.href} className="group bg-crema p-5 transition-colors hover:bg-papel">
              <p className="text-sm font-medium text-tinta group-hover:text-rojo">{a.etiqueta}</p>
              <p className="mt-1 text-xs text-tinta/65">{a.detalle}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
