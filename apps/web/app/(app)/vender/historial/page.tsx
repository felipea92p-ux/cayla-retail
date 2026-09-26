import Link from "next/link";
import { ReceiptText, Wallet } from "lucide-react";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getColaboradores, getColaboradoresInactivos, getColaboradoresSuspendidos } from "@/lib/colaboradores";
import { getResumenPorEnviar } from "@/lib/comprobantes";
import { getCajaAbierta } from "@/lib/caja";
import { createClient } from "@/lib/supabase/server";
import { opcional } from "@/lib/resultado";
import { hoyEnLima } from "@/lib/movimientos-reglas";
import {
  filtrosDesdeParams,
  idsDeHistorial,
  leerCursorVentas,
  listarVentasHistorial,
  serializarCursorVentas,
  textoPeriodoHistorial,
  totalesVentasHistorial,
  type ParamsHistorial,
} from "@/lib/ventas-historial";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";
import { EstadoVacio } from "@/components/ComprasAgrupadas";
import { BuscadorHistorial } from "@/components/BuscadorHistorial";
import { FiltrosHistorialVentas } from "@/components/FiltrosHistorialVentas";
import { HistorialVentasLista } from "@/components/HistorialVentasLista";
import { HistorialVentasPulso, type EnlacePulso } from "@/components/HistorialVentasPulso";
import { AvisosHistorial, type AvisoHistorial } from "@/components/AvisosHistorial";
import type { ContextoAccionesSerializable } from "@/components/AccionesVentaHistorial";
import { PaginacionCursor } from "@/components/Paginacion";

// Historial de ventas (2026-09-21, ADR-0147): el libro de TODAS las ventas registradas, de cualquier
// fecha y de todas las tiendas — la pantalla que `ventas-v2.ts` y el ADR-0052 dejaron diferida.
// Vive en Ventas porque su unidad es la venta: Caja mira el turno, Facturación el comprobante,
// Movimientos el stock, Cambios y Devoluciones eligen una prenda para actuar sobre ella.
//
// Esta página solo traduce la URL a filtros y elige el layout; no calcula nada sobre las filas. Quién
// ve qué lo decide la RLS de `ventas` (`fn_puede_operar_ubicacion`): el líder mira cualquier tienda
// desde el filtro (`?sede=`), cada colaboradora la suya. Es solo lectura — como `ventas` no tiene
// política de UPDATE ni de DELETE, una venta se corrige con el proceso (anularla, un cambio, una
// devolución), nunca tocando la fila.
//
// Conectada (2026-09-26, ADR-0229, spike docs/maquetas/historial-spike-2026-09/): Historial ya no es solo un libro para
// leer. Un buscador encuentra la venta en cualquier fecha (la misma búsqueda de Cambios y Devoluciones), los atajos
// filtran de un toque, arriba se avisa lo que espera a alguien (SUNAT, apartados que vencen) y el detalle lleva a la
// pantalla que hace cada proceso con la venta ya buscada. Sigue sin cambiar nada desde aquí. El líder ve por defecto la
// tienda elegida arriba en la cabecera; «Todas las tiendas» se elige en el filtro.
//
// Aspecto (2026-09-21): la misma línea que Cambios, Devoluciones y Caja (Atelier) — cabecera con las cifras de
// la tienda arriba a la derecha, hilo taupe con un nudo por día — y los filtros como los de Catálogo. Las ventas
// mandan: van en la columna principal, y el pulso del período (lo vendido día por día, dibujado como hilos) las
// acompaña en un lateral, chico y pegajoso.
export default async function HistorialVentasPage({ searchParams }: { searchParams: Promise<ParamsHistorial> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const esLider = persona.rol === "lider";
  const puedeFacturar = puede(persona, "facturar");
  const hoy = hoyEnLima();

  const [ubicaciones, colaboradores, suspendidos, inactivos] = await Promise.all([
    getUbicaciones(),
    // Si la lista de colaboradores falla, solo desaparece el filtro por vendedor: el historial sigue.
    esLider ? getColaboradores().catch(() => []) : Promise.resolve([]),
    // Quien está suspendido o ya no está activo en Dynamic igual vendió: sus ventas tienen que poder filtrarse por su nombre.
    esLider ? getColaboradoresSuspendidos().catch(() => []) : Promise.resolve([]),
    esLider ? getColaboradoresInactivos().catch(() => []) : Promise.resolve([]),
  ]);
  // Solo las tiendas venden: ni el Taller ni un almacén tienen mostrador.
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const filtros = filtrosDesdeParams(params, {
    esLider,
    sedesIds: tiendas.map((t) => t.id),
    hoy,
    personaId: persona.personaId ?? undefined,
    sedePorDefecto: persona.ubicacionId,
  });
  const cursor = leerCursorVentas(params.cursor);
  const ids = await idsDeHistorial(filtros, { ubicacionId: persona.ubicacionId, esLider });

  const supabase = await createClient();
  const veApartados = veModulo(persona, "apartados") && persona.ubicacionTipo === "tienda";
  const [{ filas, siguiente }, totales, porEnviar, apartados, caja] = await Promise.all([
    listarVentasHistorial(filtros, { cursor, ids }),
    totalesVentasHistorial(filtros, ids),
    // Lo que acompaña a las ventas es secundario: si algo no carga, su aviso o su enlace no aparece y el historial sigue.
    puedeFacturar ? opcional(getResumenPorEnviar(), "los comprobantes por enviar (Historial)") : Promise.resolve(null),
    veApartados
      ? supabase.rpc("resumen_separaciones", { p_ubicacion_id: persona.ubicacionId }).then((r) => (r.error ? null : (r.data?.[0] ?? null)))
      : Promise.resolve(null),
    veModulo(persona, "caja") ? opcional(getCajaAbierta(persona.ubicacionId), "la caja (Historial)") : Promise.resolve(undefined),
  ]);

  const alcance = esLider ? (tiendas.find((t) => t.id === filtros.sedeId)?.nombre ?? "Todas las tiendas") : persona.ubicacionEtiqueta;
  const periodoEnPalabras = textoPeriodoHistorial(filtros.periodo, filtros.desde, filtros.hasta);
  const vendedores = [...colaboradores, ...suspendidos, ...inactivos].map((c) => ({ id: c.persona_id, nombre: c.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const totalesPorDia = Object.fromEntries(totales.porDia.map((d) => [d.fecha, { ventas: d.ventas, total: d.total }]));
  const { resumen } = totales;
  const buscando = !!filtros.busqueda;

  const contexto: ContextoAccionesSerializable = {
    modulos: persona.modulos.map((m) => m.clave),
    puedeFacturar,
    esLider,
    ubicacionId: persona.ubicacionId,
    hoy,
  };

  // Arriba, lo que espera a alguien, de CUALQUIER fecha (un comprobante rechazado hace 40 días no sale en «30 días»).
  const avisos: AvisoHistorial[] = [];
  if (porEnviar && porEnviar.porEnviar > 0) {
    const pendientes = porEnviar.porEnviar - porEnviar.rechazados;
    const partes = [
      pendientes > 0 && `${pendientes} ${pendientes === 1 ? "comprobante espera" : "comprobantes esperan"} ir a SUNAT`,
      porEnviar.rechazados > 0 && `${porEnviar.rechazados} ${porEnviar.rechazados === 1 ? "fue rechazado" : "fueron rechazados"}`,
    ].filter(Boolean);
    avisos.push({ tono: porEnviar.rechazados > 0 ? "rojo" : "ambar", texto: partes.join(" y "), href: "/vender/comprobantes/por-reintentar", accion: "Por reintentar" });
  }
  if (apartados && (Number(apartados.vencen_pronto) > 0 || Number(apartados.vencidas) > 0)) {
    const pronto = Number(apartados.vencen_pronto);
    const vencidos = Number(apartados.vencidas);
    const partes = [
      pronto > 0 && `${pronto} ${pronto === 1 ? "apartado vence" : "apartados vencen"} en los próximos 2 días`,
      vencidos > 0 && `${vencidos} ${vencidos === 1 ? "ya venció" : "ya vencieron"}`,
    ].filter(Boolean);
    avisos.push({ tono: "pizarra", texto: partes.join(" y "), href: "/vender/apartados", accion: "Apartados" });
  }

  // Las pantallas que trabajan de la mano con Historial, al pie del pulso (solo las que la cuenta ve).
  const enlaces: EnlacePulso[] = [];
  if (caja !== undefined) enlaces.push({ href: "/caja", texto: "Caja de hoy", detalle: caja ? "Abierta" : "Cerrada" });
  if (veModulo(persona, "cambios") || veModulo(persona, "devoluciones")) {
    enlaces.push({ href: veModulo(persona, "cambios") ? "/cambios" : "/devoluciones", texto: "Posventa", detalle: "Cambios y devoluciones" });
  }
  if (puedeFacturar) {
    enlaces.push({ href: "/vender/comprobantes/emitidos", texto: "Comprobantes", detalle: porEnviar && porEnviar.porEnviar > 0 ? `${porEnviar.porEnviar} por resolver` : "Emitidos del mes" });
  }

  // Exportar (solo el líder): los mismos filtros de la URL, en otra ruta que responde un archivo.
  const exportarHref = esLider ? `/vender/historial/exportar${cadenaDeParams(params, ["cursor"])}` : undefined;

  return (
    <div className="space-y-7">
      <EncabezadoPagina sede={alcance} titulo="Historial" subtitulo="Todas las ventas registradas, de cualquier fecha.">
        {/* Las cifras del PERÍODO (el buscador no las cambia), como las de la tienda en Cambios y Devoluciones. Pasado el
            tope de 1000 ventas serían parciales: el trazo de abajo lo dice y acá no se muestran. */}
        {!totales.parcial && (
          <ResumenSede
            sede={alcance}
            cifras={[
              { valor: resumen.total, formato: "soles", etiqueta: "vendido", icono: Wallet },
              { valor: resumen.ventas, etiqueta: resumen.ventas === 1 ? "venta" : "ventas", icono: ReceiptText },
            ]}
          />
        )}
      </EncabezadoPagina>

      {/* Las ventas son lo primero: ocupan la columna principal y el pulso las acompaña en un lateral pegajoso (desde 1280 px).
          Más angosto, el pulso pasa DEBAJO de la lista, no encima: nada se interpone entre la persona y las ventas. */}
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          {/* En el celular el buscador queda fijo bajo la cabecera del AppShell (61 px) mientras se recorre la lista. */}
          <div className="sticky top-[61px] z-20 -mx-4 bg-crema/90 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <BuscadorHistorial valor={filtros.busqueda ?? ""} />
          </div>

          <FiltrosHistorialVentas
            tiendas={esLider ? tiendas.map((t) => ({ id: t.id, nombre: t.nombre })) : undefined}
            vendedores={esLider ? vendedores : undefined}
            puedeMias={!!persona.personaId}
            porEnviar={porEnviar?.porEnviar ?? 0}
            sedePorDefecto={esLider ? persona.ubicacionId : undefined}
            exportarHref={exportarHref}
            periodo={filtros.periodo}
            desde={filtros.desde ?? ""}
            hasta={filtros.hasta ?? ""}
            estado={filtros.estado}
            comprobante={filtros.comprobante}
            pago={filtros.pago ?? ""}
            sede={filtros.sedeId ?? ""}
            vendedor={filtros.vendedorId ?? ""}
            incluirPrueba={filtros.incluirPrueba}
          />

          <AvisosHistorial avisos={avisos} />

          {buscando && filas.length > 0 && (
            <p className="text-[13px] text-tinta/65">
              <b className="font-semibold text-tinta">
                {filas.length}
                {siguiente ? "+" : ""} {filas.length === 1 ? "venta" : "ventas"}
              </b>{" "}
              con «{filtros.busqueda}». El buscador mira todas las fechas{esLider && !filtros.sedeExplicita ? " y todas las tiendas" : ""}.{" "}
              <Link href={`/vender/historial${cadenaDeParams(params, ["q", "cursor"])}`} className="font-medium text-tinta underline underline-offset-4 hover:text-rojo">
                Volver al período
              </Link>
            </p>
          )}

          {filas.length === 0 && !cursor ? (
            <EstadoVacio
              titulo={buscando ? `Ninguna venta con «${filtros.busqueda}»` : "Ninguna venta coincide"}
              detalle={
                buscando
                  ? "Se buscó en todas las fechas. Prueba con el número sin ceros (B004-31), el DNI o RUC, el nombre de la prenda o el nº de operación."
                  : `No hay ventas con estos filtros (${periodoEnPalabras.toLowerCase()}). Prueba con otro período o quita algún filtro.`
              }
            />
          ) : (
            // Buscando, los totales por día del período no corresponden a lo encontrado: cada día dice cuántas ventas trajo.
            <HistorialVentasLista filas={filas} hoyLima={hoy} totalesPorDia={buscando ? {} : totalesPorDia} contexto={contexto} />
          )}

          <PaginacionCursor
            mostradas={filas.length}
            cursorSiguiente={siguiente ? serializarCursorVentas(siguiente) : null}
            hayCursor={!!cursor}
            params={params}
            pathname="/vender/historial"
            sustantivo={["venta", "ventas"]}
          />

          <p className="max-w-2xl text-xs leading-relaxed text-tinta/60">
            <span className="text-tinta">Registro transparente:</span> una venta no se edita ni se borra. Si se anula, sigue en el historial —tachada— y deja de
            sumar a lo vendido; si la clienta cambia o devuelve una prenda, queda anotado en Cambios o Devoluciones y se ve aquí como una marca en la venta.
          </p>
        </div>

        <aside aria-label="Pulso del período" className="xl:sticky xl:top-24">
          <HistorialVentasPulso totales={totales} periodo={periodoEnPalabras} enlaces={enlaces} />
        </aside>
      </div>
    </div>
  );
}

/** `?a=1&b=2` con los parámetros de la URL menos los indicados (vacío si no queda ninguno). */
function cadenaDeParams(params: ParamsHistorial, sin: string[]): string {
  const p = new URLSearchParams(Object.entries(params).filter(([k, v]) => typeof v === "string" && v && !sin.includes(k)) as [string, string][]);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
