import Link from "next/link";
import { soles } from "@/lib/compras-reglas";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { DIAS_RITMO_RECIENTE } from "@/lib/inventario-reglas";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Pestanas } from "@/components/ui/Pestanas";
import { BotonEnlace } from "@/components/ui/campos";
import { agotadasQueSeVendian, baseDelRitmo, ETIQUETA_ESTADO_MODELO, textoAgotadas, textoDiasDeStock, type CifrasResumen, type Decision, type DecisionesOcultas, type FilaModelo, type FilaTela } from "@/lib/produccion-decisiones";
import { textoDePedido } from "@/lib/orden-pagina-reglas";
import type { CifraDeFase } from "@/lib/ordenes-lista-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { CircleCheck } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { FotoPrenda } from "@/components/ui/FotoPrenda";
import type { HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { FilaQueAbreLaHoja } from "@/components/produccion-resumen/FilaQueAbreLaHoja";
import { ProveedorFichasDeColor } from "@/components/produccion-resumen/FichasDeColor";
import type { ColorConFicha } from "@/lib/ficha-del-color";
import { TONO_ESTADO_MODELO } from "@/components/produccion-resumen/estado-modelo";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Resumen de Producción (ADR-0133, F6): «¿qué necesita mi decisión hoy?». Cada tarjeta nace de datos que ya existen y lleva su evidencia; desaparece sola
// cuando el dato cambia. Solo hechos y cuentas sobre datos medidos. El rojo de la pantalla (máximo 2) lo lleva únicamente la cifra de «Por pagar» cuando hay algo
// vencido; las tarjetas usan ámbar y tinta. Es un componente de servidor: no tiene estado, solo enlaces a la pantalla donde se resuelve cada cosa.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const BORDE_SEVERIDAD: Record<Decision["severidad"], string> = { 3: "border-l-ambar", 2: "border-l-ambar/45", 1: "border-l-tinta/20" };

const ICONO: Record<Decision["tipo"], string> = {
  entrega: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  insumo: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  recibir: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  pago: "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  producir: "M3 17l6-6 4 4 8-8M15 7h6v6",
  trasladar: "M5 12h14M13 6l6 6-6 6",
  sobrestock: "M10 5v14M14 5v14",
  minimo: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
};

/** La foto de un modelo (o, sin foto, el ícono de su categoría sobre su color). Decorativa: el nombre ya está escrito al lado, así que no se lee dos veces. */
function FotoModelo({ productoId, presentaciones, ancho, className }: { productoId: string; presentaciones: Record<string, PresentacionDeModelo>; ancho: number; className: string }) {
  const p = presentaciones[productoId];
  return (
    <span aria-hidden className="block shrink-0">
      <FotoPrenda fotoUrl={p?.fotoUrl} referencia="" ancho={ancho} colorHex={p?.colorHex} categoria={p?.categoria} categoriaPrefijo={p?.categoriaPrefijo} categoriaFamilia={p?.categoriaFamilia} className={className} />
    </span>
  );
}

export function ResumenProduccionPanel({ sede,
  presentaciones,
  decisiones,
  ocultas,
  totalAsuntos,
  cifras,
  modelos,
  hojas,
  fichasDeColor,
  telas,
  hoyEnElTaller,
  falloRed,
}: { sede: string;
  /** Cómo se dibuja cada modelo (foto, o color y categoría): por `productoId`. Vacío si el catálogo no se pudo leer: se dibuja la percha. */
  presentaciones: Record<string, PresentacionDeModelo>;
  decisiones: Decision[];
  /** Los asuntos que no cupieron, por clase: nunca se cortan en silencio. */
  ocultas: DecisionesOcultas[];
  /** Todos los asuntos que hay (los que se ven y los que no). */
  totalAsuntos: number;
  cifras: CifrasResumen;
  modelos: FilaModelo[];
  /** La hoja «Ver el modelo» de cada modelo (por `productoId`): lo vendido por color y talla y los enlaces a la orden y al traslado. Se arma en el servidor con lo que ya se leyó. */
  hojas: Record<string, HojaDeModelo>;
  /** El vocabulario de colores con su ficha (qué transmite y con qué se combina): la hoja de cada modelo la usa bajo su foto. Una sola vez para todo el panel. Vacío si no se pudo leer: la hoja no dice nada del color. */
  fichasDeColor: ColorConFicha[];
  telas: FilaTela[];
  /** Dónde está cada orden abierta (una tarjeta por fase) y su frase. `null`: la lectura falló (se dice y se manda a Órdenes). */
  hoyEnElTaller: { cifras: CifraDeFase[]; dato: string } | null;
  falloRed: string | null;
}) {
  const maxDias = 60; // la escala de la barra: hasta el techo de «alta cobertura» de Inventario

  return (
    <ProveedorFichasDeColor fichas={fichasDeColor}>
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo="Resumen"
        subtitulo="¿Qué necesita tu decisión hoy? Lo que pide acción en el Taller, del más urgente al menos."
        acciones={
          <div data-guia="prod-resumen.acciones" className="flex items-center gap-2">
            <BotonEnlace href="/produccion/ordenes">Ver órdenes</BotonEnlace>
            <BotonEnlace href="/produccion/ordenes?nueva=auto" peso="primario">
              + Nueva orden
            </BotonEnlace>
          </div>
        }
      />
      {/* «Hoy | Eficiencia»: las dos miradas del líder sobre el Taller (ADR-0133, F6 y F7), con la pestaña de vista del sistema
          (ADR-0358). Eficiencia NO es una fila del lateral (el menú de Producción está en su tope de hijas): se llega desde aquí. */}
      <Pestanas
        etiquetaAccesible="Miradas del Taller"
        idIndicador="produccion-miradas"
        guia="produccion.miradas"
        activa="hoy"
        items={[
          { clave: "hoy", etiqueta: "Hoy", href: "/produccion", ayuda: "Qué necesita mi decisión" },
          { clave: "eficiencia", etiqueta: "Eficiencia", href: "/produccion/eficiencia", ayuda: "Cuánto cuesta cada prenda" },
        ]}
      />

      <div data-guia="prod-resumen.cifras" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaCifra
          punto={cifras.insumosBajoMinimo > 0 ? "ambar" : "verde"}
          etiqueta="Capital en insumos"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={cifras.capitalInsumos === null ? null : <CifraQueCuenta valor={cifras.capitalInsumos} formato="soles" alMontar />}
          detalleTono={cifras.insumosBajoMinimo > 0 ? "text-ambar-profundo" : undefined}
        >
          {cifras.insumosBajoMinimo > 0 ? `${plural(cifras.insumosBajoMinimo, "insumo bajo el mínimo", "insumos bajo el mínimo")}` : "a costo de cada lote"}
        </TarjetaCifra>
        <TarjetaCifra
          punto="verde"
          etiqueta="Valor en proceso"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.valorEnProceso} formato="soles" alMontar />}
        >
          tela y avíos de {plural(cifras.ordenesEnProceso, "orden abierta", "órdenes abiertas")}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.vencido > 0 ? "rojo" : cifras.porPagar > 0 ? "ambar" : "verde"}
          etiqueta="Por pagar a proveedores"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.porPagar} formato="soles" alMontar />}
          detalleTono={cifras.vencido > 0 ? "text-rojo-profundo" : undefined}
        >
          {cifras.vencido > 0 ? `${soles(cifras.vencido)} ya vencidos` : cifras.porPagar > 0 ? "nada vencido" : "no se debe nada"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.entregasEnRiesgo > 0 ? "ambar" : "verde"}
          etiqueta="Entregas por atender"
          className="anim-entra"
          style={{ ["--i" as string]: 3 }}
          valor={<CifraQueCuenta valor={cifras.entregasEnRiesgo} alMontar />}
        >
          {cifras.entregasEnRiesgo > 0 ? "vencidas o por vencer en 2 días" : "ninguna vencida ni por vencer"}
        </TarjetaCifra>
      </div>

      <section data-guia="prod-resumen.decidir" aria-label="Para decidir" className="space-y-3">
        <TituloSeccion dato={totalAsuntos === 0 ? "nada por ahora" : totalAsuntos > decisiones.length ? `${plural(totalAsuntos, "asunto", "asuntos")} · se ven ${decisiones.length}` : plural(totalAsuntos, "asunto", "asuntos")}>Para decidir</TituloSeccion>
        {decisiones.length === 0 ? (
          <div className="card-cayla">
            <Vacio tamano="chico" icono={<CircleCheck />}>
              <b className="font-semibold text-tinta">Todo en orden.</b> Nada pide tu decisión ahora.
            </Vacio>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {decisiones.map((d, i) => (
              <li key={d.id} data-guia={i === 0 ? "prod-resumen.asunto" : undefined} className={`card-cayla anim-entra grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-l-4 px-4 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${BORDE_SEVERIDAD[d.severidad]}`} style={{ ["--i" as string]: Math.min(i, 8) }}>
                {d.productoIds && d.productoIds.length > 0 ? (
                  <span className="flex -space-x-2.5">
                    {d.productoIds.map((id) => (
                      <FotoModelo key={id} productoId={id} presentaciones={presentaciones} ancho={36} className="w-9 ring-2 ring-papel" />
                    ))}
                  </span>
                ) : (
                  <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-tinta/70 stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ICONO[d.tipo]} />
                  </svg>
                )}
                <div className="min-w-0">
                  <h3 className="text-[14.5px] font-medium text-tinta">{d.titulo}</h3>
                  <p className="mt-0.5 text-[13px] text-tinta/70">{d.detalle}</p>
                </div>
                <Link
                  href={d.accion.href}
                  className="btn-cayla btn-secundario col-span-2 text-center sm:col-span-1 sm:justify-self-end"
                >
                  {d.accion.texto}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {ocultas.length > 0 && (
          <p data-guia="prod-resumen.mas" className="px-1 text-[13px] text-tinta/70">
            Y{" "}
            {ocultas.map((o, i) => (
              <span key={o.tipo}>
                {i > 0 && (i === ocultas.length - 1 ? " y " : ", ")}
                <Link href={o.href} className="btn-enlace">
                  {o.cantidad} {o.texto}
                </Link>
              </span>
            ))}{" "}
            más, que no caben aquí.
          </p>
        )}
      </section>

      <section data-guia="prod-resumen.hoy" aria-label="Hoy en el Taller" className="space-y-3">
        <TituloSeccion dato={hoyEnElTaller?.dato} accion={<EnlaceVer href="/produccion/ordenes">Ver las órdenes</EnlaceVer>}>
          Hoy en el Taller
        </TituloSeccion>
        {hoyEnElTaller === null ? (
          <Aviso tono="atencion" titulo="No pudimos leer dónde está cada orden">
            Míralas en Órdenes. Lo demás de esta pantalla sigue en pie.
          </Aviso>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))" }}>
            {hoyEnElTaller.cifras.map((c, i) => (
              <TarjetaCifra
                key={c.clave}
                etiqueta={c.titulo}
                punto={c.lotes === 0 ? "neutro" : c.atencion ? "ambar" : "verde"}
                valor={<CifraQueCuenta valor={c.lotes} alMontar />}
                unidad={c.lotes === 1 ? "lote" : "lotes"}
                href="/produccion/ordenes"
                className="anim-entra"
                style={{ ["--i" as string]: i }}
              >
                {c.contexto}
              </TarjetaCifra>
            ))}
          </div>
        )}
      </section>

      <section data-guia="prod-resumen.que-producir" id="produce" aria-label="Qué producir" className="space-y-2.5">
        <TituloSeccion dato="días que dura el stock de las tiendas al ritmo medido · marcas en 7 y 30 días">¿Qué producir?</TituloSeccion>
        {falloRed && <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">{falloRed}</p>}
        {modelos.length === 0 ? (
          // Si la red no se pudo leer, el aviso de arriba ya lo dice: «no hay modelos» sería falso (los hay; lo que falló fue el cálculo).
          falloRed ? null : <p className="card-cayla p-5 text-sm text-tinta/70">No hay modelos para producir ahora. No se ofrecen los descontinuados, los pendientes de aprobación, los de prueba ni los de familias fuera de los motores (como Empaque).</p>
        ) : (
          <div className="card-cayla overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_3rem_6rem_minmax(6.5rem,1.2fr)_9rem] gap-x-3 border-b border-tinta/10 px-4 py-2.5 lg:grid xl:grid-cols-[minmax(0,1.5fr)_3.5rem_6rem_minmax(7rem,1.2fr)_4rem_9rem]">
              <span className="label-cayla pl-11 text-[11px] text-tinta/65">Modelo</span>
              <span className="label-cayla text-right text-[11px] text-tinta/65">Stock</span>
              <span className="label-cayla text-right text-[11px] text-tinta/65">Ventas/sem.</span>
              <span className="label-cayla text-[11px] text-tinta/65">Cobertura</span>
              <span className="label-cayla hidden text-right text-[11px] text-tinta/65 xl:block">En prod.</span>
              <span className="label-cayla text-[11px] text-tinta/65">Sugerencia</span>
            </div>
            <ul>
              {modelos.map((m, i) => {
                const pct = m.diasRed === null ? 0 : Math.min(100, (m.diasRed / maxDias) * 100);
                const agotadas = textoAgotadas(agotadasQueSeVendian(m));
                return (
                  <li key={m.productoId} className="border-b border-tinta/10 last:border-b-0">
                    <FilaQueAbreLaHoja
                      hoja={hojas[m.productoId]}
                      presentacion={presentaciones[m.productoId]}
                      guia={i === 0 ? "prod-resumen.modelo" : undefined}
                      className="grid w-full cursor-pointer text-left grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-sand/40 focus-visible:-outline-offset-2 lg:grid-cols-[minmax(0,1.6fr)_3rem_6rem_minmax(6.5rem,1.2fr)_9rem] xl:grid-cols-[minmax(0,1.5fr)_3.5rem_6rem_minmax(7rem,1.2fr)_4rem_9rem]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <FotoModelo productoId={m.productoId} presentaciones={presentaciones} ancho={32} className="w-8" />
                        <span className="min-w-0">
                          <span className="line-clamp-2 break-words text-[14px] leading-snug text-tinta">{m.referencia}</span>
                          <span className="block text-xs text-tinta/65 lg:hidden">
                            stock {m.stockRed} · {m.ritmoDia ? `${(Math.round(m.ritmoDia * 7 * 10) / 10).toLocaleString("es-PE")}/sem. · ${baseDelRitmo(m.ventasBase).corto}` : "sin ritmo"}
                          </span>
                          {agotadas && (
                            <span className="mt-0.5 flex items-start gap-1.5 text-xs leading-snug text-ambar">
                              <span aria-hidden className="mt-[5px] size-1.5 shrink-0 rounded-full bg-ambar" />
                              <span className="min-w-0">{agotadas}</span>
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta lg:block">{m.stockRed}</span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta lg:block">
                        {m.ritmoDia ? (
                          <>
                            {(Math.round(m.ritmoDia * 7 * 10) / 10).toLocaleString("es-PE")}
                            <span className="mt-0.5 block text-[11px] leading-tight text-tinta/65">
                              {baseDelRitmo(m.ventasBase).pocaBase ? <Chip tono="pizarra">Poca base</Chip> : `${m.ventasBase} en ${DIAS_RITMO_RECIENTE} d`}
                            </span>
                          </>
                        ) : (
                          <span className="text-tinta/65">—</span>
                        )}
                      </span>
                      <span className="col-span-2 lg:col-span-1">
                        {m.diasRed === null ? (
                          <span className="text-xs text-tinta/65">Sin ventas medidas</span>
                        ) : (
                          <>
                            <span className="relative block h-2 rounded-full bg-sand" role="img" aria-label={m.stockRed <= 0 ? "Agotado en las tiendas" : `${textoDiasDeStock(m.stockRed, m.diasRed)} de stock`}>
                              <span className="absolute inset-y-0 left-0 rounded-full bg-tinta" style={{ width: `${pct}%` }} />
                              <span aria-hidden className="absolute -top-0.5 h-3 w-px bg-tinta/45" style={{ left: `${(7 / maxDias) * 100}%` }} />
                              <span aria-hidden className="absolute -top-0.5 h-3 w-px bg-tinta/45" style={{ left: `${(30 / maxDias) * 100}%` }} />
                            </span>
                            <span className="mt-1 block text-xs tabular-nums text-tinta/65">
                              {textoDiasDeStock(m.stockRed, m.diasRed)}{m.stockTaller > 0 ? ` · +${m.stockTaller} en el Taller` : ""}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta xl:block">{m.enProduccion || <span className="text-tinta/65">—</span>}</span>
                      <span className="col-span-2 lg:col-span-1">
                        <Chip tono={TONO_ESTADO_MODELO[m.estado]}>{ETIQUETA_ESTADO_MODELO[m.estado]}</Chip>
                      </span>
                    </FilaQueAbreLaHoja>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section data-guia="prod-resumen.tela" aria-label="Alcanza la tela" className="space-y-2.5">
        <TituloSeccion dato="lo que hay y lo facturado por recibir, contra lo que las órdenes abiertas todavía necesitan · lo pedido se muestra aparte">¿Alcanza la tela?</TituloSeccion>
        {telas.length === 0 ? (
          <p className="card-cayla p-5 text-sm text-tinta/70">
            No hay telas en el catálogo.{" "}
            <Link href="/produccion/insumos" className="underline underline-offset-2 hover:text-rojo">
              Cárgalas en Insumos
            </Link>
            .
          </p>
        ) : (
          <ul className="card-cayla overflow-hidden">
            {telas.map((t) => (
              <li key={t.insumoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-tinta/10 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_8rem_11rem]">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-tinta">{t.nombre}</span>
                  <span className="block text-xs text-tinta/65">
                    hay {cantidadTexto(t.saldo, t.unidad)} · {t.porLlegar > 0 ? `${cantidadTexto(t.porLlegar, t.unidad)} facturados por recibir` : "nada por recibir"}
                  </span>
                  {t.pedidos.length > 0 && (
                    <span className="block text-xs text-tinta/65">
                      Pedido: {t.pedidos.slice(0, 2).map(textoDePedido).join("; ")}
                      {t.pedidos.length > 2 ? ` y ${t.pedidos.length - 2} más` : ""}
                    </span>
                  )}
                </span>
                <span className="hidden text-right text-[13px] tabular-nums text-tinta sm:block">{t.piden > 0 ? `piden ${cantidadTexto(t.piden, t.unidad)}` : <span className="text-tinta/65">—</span>}</span>
                <span className="sm:justify-self-end">
                  {t.estado === "sin_demanda" ? (
                    <Chip tono="neutro">Sin demanda</Chip>
                  ) : t.estado === "alcanza" ? (
                    <Chip tono="verde">Alcanza</Chip>
                  ) : t.estado === "alcanza_si_llega" ? (
                    <Chip tono="ambar">Alcanza si llega</Chip>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
                      <Chip tono="ambar">Faltan {cantidadTexto(t.faltan, t.unidad)}</Chip>
                      {/* La salida de «faltan» es PEDIR (o mirar lo ya pedido), no registrar una factura que todavía no existe. */}
                      <BotonEnlace href={t.pedidos.length > 0 ? "/ordenes-insumos" : "/ordenes-insumos/nueva"} peso="discreto">
                        {t.pedidos.length > 0 ? "Ver los pedidos" : "Pedir"}
                      </BotonEnlace>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-tinta/65">
          «Piden» es lo que las órdenes abiertas todavía tienen que usar de la tela que declararon (su plan menos lo ya descontado: la misma cuenta de «Nueva orden»); una orden que no declara tela se cuenta con el consumo medido de su modelo. Lo pedido se muestra, no se suma: una orden de insumos no sabe si ya llegó.
        </p>
      </section>
    </div>
    </ProveedorFichasDeColor>
  );
}
