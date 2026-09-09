import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { getCajaAbierta } from "@/lib/finanzas";
import { getPanelInicio } from "@/lib/panel";
import { getPanelTaller } from "@/lib/taller";
import { getPendientes } from "@/lib/pendientes";
import { getActividad, type Actividad } from "@/lib/actividad";
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
  const [panel, actividad, panelTaller] = await Promise.all([
    getPanelInicio(persona, variantes),
    getActividad(persona, variantes),
    getPanelTaller(persona),
  ]);

  const reponerYa = variantes.filter((v) => v.reponerYa).length;
  const estancados = variantes.filter((v) => v.estancado).length;

  const accionesRapidas = [
    { href: "/vender", etiqueta: "Vender", detalle: cajaAbierta ? "Caja abierta" : "Caja cerrada — ábrela aquí" },
    { href: "/inventario/recibir", etiqueta: "Recibir mercadería", detalle: "Ingresar un fardo al almacén" },
    { href: "/inventario/almacen", etiqueta: "Bajar a tienda", detalle: "Del almacén al piso de venta" },
    { href: "/inventario", etiqueta: "Inventario", detalle: "Catálogo completo con stock" },
  ];

  // Comparativo del día, igual para los tres inicios: el mismo día de la semana
  // pasada y solo hasta esta misma hora (el porqué está en panel.ts).
  const ventasHoy = panel.ventasHoyTotal;
  const baseSemanaPasada = panel.ventasSemanaPasadaAEstaHora;
  const comparativoVentas =
    baseSemanaPasada > 0
      ? {
          texto: `${ventasHoy >= baseSemanaPasada ? "+" : ""}${(((ventasHoy - baseSemanaPasada) / baseSemanaPasada) * 100).toFixed(0)}% vs. la semana pasada`,
          positivo: ventasHoy >= baseSemanaPasada,
        }
      : undefined;
  const tendencia = normalizarSparkline(panel.ventasSerie);

  // ==================== Inicio del Taller ====================
  // Se decide por TIPO de sede, no por código (ver PersonaActual.sedeTipo). Antes
  // esta persona caía en el Inicio de la Encargada, que le ofrece Vender, Bajar a
  // tienda y el estado de la caja: tres cosas que en el Taller no existen.
  if (panelTaller) {
    return (
      <div className="space-y-10">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Taller · hoy</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TarjetaIndicador
              etiqueta="En la mesa"
              valor={String(panelTaller.enProceso.length)}
              pie={`${panelTaller.unidadesEnProceso} prenda${panelTaller.unidadesEnProceso === 1 ? "" : "s"} en total`}
            />
            <TarjetaIndicador
              etiqueta="Sin inventariar"
              ayuda={
                <Ayuda titulo="Sin inventariar">
                  Corridas que ya terminaste pero que nadie cerró en el sistema. Las prendas existen
                  en el Taller y el inventario todavía no las cuenta, así que las tiendas no las ven
                  ni las pueden pedir.
                </Ayuda>
              }
              valor={String(panelTaller.sinInventariar.length)}
              critico={panelTaller.sinInventariar.length > 0}
              pie={
                panelTaller.sinInventariar.length > 0 ? (
                  <Link href="/produccion" className="hover:text-rojo">
                    Cerrarlas en Producción →
                  </Link>
                ) : undefined
              }
            />
          </div>
        </div>

        {panelTaller.enProceso.length > 0 && (
          <div>
            <p className="label-cayla mb-3 text-[11px] text-tinta/65">Órdenes abiertas</p>
            <div className="card-cayla divide-y divide-tinta/10">
              {panelTaller.enProceso.map((o) => {
                const atrasada = o.diasDeRetraso != null && o.diasDeRetraso > 0;
                return (
                  <Link key={o.id} href="/produccion" className="group flex items-baseline gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1 text-sm text-tinta group-hover:text-rojo">
                      {o.detalle} <span className="text-tinta/65">× {o.cantidad}</span>
                      {o.esMuestra && <span className="label-cayla ml-2 text-[11px] text-tinta/65">muestra</span>}
                    </span>
                    <span className={`shrink-0 text-xs ${atrasada ? "text-rojo" : "text-tinta/65"}`}>
                      {o.fechaEntrega == null
                        ? "sin fecha"
                        : atrasada
                          ? `${o.diasDeRetraso} día${o.diasDeRetraso === 1 ? "" : "s"} tarde`
                          : `entrega en ${Math.abs(o.diasDeRetraso ?? 0)} día${Math.abs(o.diasDeRetraso ?? 0) === 1 ? "" : "s"}`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {actividad.length > 0 && <ActividadReciente actividad={actividad} />}

        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Acciones</p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12">
            {[
              { href: "/produccion", etiqueta: "Producción", detalle: "Abrir, avanzar y cerrar corridas" },
              { href: "/inventario", etiqueta: "Inventario", detalle: "Catálogo completo con stock" },
            ].map((a) => (
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

  // ==================== Inicio de Encargada ====================
  if (!esLider) {
    // Lo recibido y todavía sin bajar al piso: no se puede vender lo que está en
    // una caja del almacén, así que es lo primero que le toca resolver.
    const porBajar = variantes.reduce((a, v) => a + (v.stockAlmacenPorSede[persona.sedeCodigo] ?? 0), 0);

    return (
      <div className="space-y-10">
        <BuscadorHero />

        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Mi día en {persona.sedeCodigo}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TarjetaIndicador
              etiqueta="Ventas de hoy"
              ayuda={
                <Ayuda titulo="Ventas de hoy">
                  Lo vendido hoy en tu tienda. La comparación es contra el MISMO día de la semana
                  pasada y solo hasta esta misma hora: a las 10am ninguna tienda vendió todavía su
                  día entero. La línea de arriba son los últimos 14 días.
                </Ayuda>
              }
              valor={money(ventasHoy)}
              comparativo={comparativoVentas}
              sparkline={tendencia}
            />
            <TarjetaIndicador
              etiqueta="Mi caja"
              valor={cajaAbierta ? "Abierta" : "Cerrada"}
              critico={!cajaAbierta}
              alerta={cajaAbierta ? undefined : "Ábrela antes de la primera venta"}
              pie={
                cajaAbierta ? (
                  `Apertura ${money(cajaAbierta.montoApertura)}`
                ) : (
                  <Link href="/vender" className="hover:text-rojo">
                    Abrir caja →
                  </Link>
                )
              }
            />
          </div>
        </div>

        {(pendientes.length > 0 || porBajar > 0 || reponerYa > 0) && (
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
              {porBajar > 0 && (
                <li className="py-2.5">
                  <Link href="/inventario/almacen" className="group block">
                    <p className="text-sm text-tinta group-hover:underline">
                      {porBajar} prenda{porBajar === 1 ? "" : "s"} en el almacén sin bajar a piso
                    </p>
                    <p className="mt-0.5 text-xs text-tinta/65">No se puede vender lo que no está en el piso</p>
                  </Link>
                </li>
              )}
              {reponerYa > 0 && (
                <li className="py-2.5">
                  <Link href="/inventario" className="group block">
                    <p className="text-sm text-tinta group-hover:underline">
                      {reponerYa} prenda{reponerYa === 1 ? "" : "s"} por reponer
                    </p>
                    <p className="mt-0.5 text-xs text-tinta/65">Se están agotando al ritmo que se venden</p>
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}

        {actividad.length > 0 && <ActividadReciente actividad={actividad} />}

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
      </div>
    );
  }

  // ==================== Inicio de Líder: panel del día ====================
  const cajas = panel.cajasTiendas;
  const cajasCerradas = cajas.filter((c) => !c.abierta).map((c) => c.codigo);
  const valorAlmacen = panel.valorAlmacenTotal;

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
            sparkline={tendencia}
            pie={
              panel.ventasHoyPorSede.length > 0
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
            valor={money(panel.valorInventarioTotal)}
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

      {actividad.length > 0 && <ActividadReciente actividad={actividad} />}

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

// Los tres inicios muestran la misma actividad —lo que cambia es a qué sede la
// acota RLS—, así que vive en un solo sitio. `movimientos` es la fuente de
// verdad del inventario desde el primer día y ninguna pantalla la mostraba en
// orden cronológico: no pide nada ni resume nada, responde "qué está pasando".
function ActividadReciente({ actividad }: { actividad: Actividad[] }) {
  return (
    <div>
      <p className="label-cayla mb-3 text-[11px] text-tinta/65">Actividad reciente</p>
      <div className="card-cayla divide-y divide-tinta/10">
        {actividad.map((a) => (
          <div key={a.id} className="flex items-baseline gap-3 px-5 py-2.5">
            <span className="w-20 shrink-0 text-xs tabular-nums text-tinta/65">{a.cuando}</span>
            <span className="min-w-0 flex-1 text-sm text-tinta">
              <span className="label-cayla text-[11px] text-tinta/65">{a.donde}</span>{" "}
              {a.que} · {a.prenda} <span className="text-tinta/65">× {a.cantidad}</span>
            </span>
            {a.monto != null && (
              <span className="shrink-0 text-xs tabular-nums text-tinta/75">{money(a.monto)}</span>
            )}
            {a.quien && <span className="hidden shrink-0 text-xs text-tinta/65 sm:inline">{a.quien}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
