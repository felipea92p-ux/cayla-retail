import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { listarPorRecibir, getLineasCompra, getRecepcionesRecientes, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, soles, type ParamsCompras } from "@/lib/compras";
import { getResumenComprasExtra, getResumenRecepciones, listarRecepcionesCompras } from "@/lib/compras-indicadores";
import { getComprasConNotaFaltante, getSaldosFavor } from "@/lib/saldo-favor";
import { hoyLima } from "@/lib/fechas-lima";
import { filtrosRecibidasDesdeParams, hayFiltrosRecibidas } from "@/lib/recibidas-filtros-reglas";
import { RecepcionCompraFormV2 } from "@/components/RecepcionCompraFormV2";
import { RecepcionesCompraLista } from "@/components/RecepcionesCompraLista";
import { FiltrosRecibidas } from "@/components/FiltrosRecibidas";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { Pestanas } from "@/components/ui/Pestanas";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";

// Recibir mercadería contra comprobantes (ADR-0035). Es el camino principal para recibir: un
// líder puede recibir en cualquier ubicación; una integrante solo en la suya (lo valida la RPC).
// Lo que llegó SIN comprobante (todavía no llega el papel, muestras) vive en «Ingreso sin
// comprobante» de Inventario: es una excepción, no un par de esta pantalla.
//
// ADR-0111: la pantalla no tenía ni una cifra de cabecera, a diferencia de /compras y de
// /compras/por-pagar. Ahora responde tres preguntas de quien decide: ¿cuánto falta llegar y
// cuánto vale? (por recibir), ¿qué ya debió llegar? (atrasadas) y ¿cuál lleva más esperando?
//
// Los filtros de URL (`filtrosDesdeParams`) se siguen aceptando por si un enlace llega con
// ?prov=…, pero el panel de filtros no se dibuja en Pendientes: el buscador vive dentro de la
// lista de pendientes del componente, que filtra en memoria la página.
//
// `?vista=recibidas`: una factura ya recibida por completo desaparecía sin dejar rastro. La
// pestaña muestra lo recibido contra comprobante, con su resultado y su demora. Sus filtros
// (`?q=&prov=&desde=&hasta=`) son el buscador y las dos pastillas en línea de la maqueta 06
// (`FiltrosRecibidas`), no el botón «Filtros» de `FiltrosCompras`; el servidor los limpia con
// `filtrosRecibidasDesdeParams` antes de llamar a la base.
export default async function RecibirComprasPage({ searchParams }: { searchParams: Promise<ParamsCompras & { compra?: string; vista?: string }> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const vista = params.vista === "recibidas" ? "recibidas" : "pendientes";

  const encabezado = (
    <div>
      <p className="label-cayla text-[11px] text-tinta/65">Compras · {persona.ubicacionEtiqueta}</p>
      <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
      <p className="mt-1 text-sm text-tinta/65">
        {vista === "pendientes"
          ? "Toca el comprobante que cubre la guía, cuenta lo que llegó y recibe. Cada prenda entra como movimiento — el stock no se edita a mano."
          : "Lo que ya se recibió contra un comprobante, guía por guía."}
      </p>
      <p className="mt-1 text-xs text-tinta/55">
        ¿Llegó mercadería que todavía no tiene comprobante?{" "}
        <Link href="/inventario/recibir" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
          Ingreso sin comprobante
        </Link>
        .
      </p>
    </div>
  );
  const pestanas = (
    <Pestanas
      etiquetaAccesible="Vistas de Recibir mercadería"
      activa={vista}
      items={[
        { clave: "pendientes", etiqueta: "Pendientes", href: "/compras/recibir" },
        { clave: "recibidas", etiqueta: "Recibidas recientemente", href: "/compras/recibir?vista=recibidas" },
      ]}
    />
  );

  // ------------------------------------------------------------------ Recibidas
  if (vista === "recibidas") {
    const filtrosRecibidas = filtrosRecibidasDesdeParams(params);
    const [resumen, recepciones, recientes, proveedores] = await Promise.all([
      getResumenRecepciones(),
      listarRecepcionesCompras({ busqueda: filtrosRecibidas.busqueda, proveedorId: filtrosRecibidas.proveedorId, desde: filtrosRecibidas.desde, hasta: filtrosRecibidas.hasta, limite: 30 }),
      getRecepcionesRecientes({ conFactura: true, limite: 40 }),
      getProveedoresActivos(),
    ]);
    // Detalle prenda por prenda y quién recibió, por guía (de la misma lectura que ya resuelve los nombres).
    const detalles = Object.fromEntries(recientes.map((r) => [r.loteId, r.detalle]));
    const nombres = Object.fromEntries(recientes.flatMap((r) => (r.recibidoPor ? [[r.loteId, r.recibidoPor] as const] : [])));
    const hayFiltros = hayFiltrosRecibidas(filtrosRecibidas);
    const pctCompletas = resumen.comprobantesRecibidos > 0 ? Math.round((resumen.entregasCompletas / resumen.comprobantesRecibidos) * 100) : null;

    return (
      <div className="space-y-6">
        {encabezado}
        {pestanas}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TarjetaCifra compacta punto="neutro" etiqueta="Unidades recibidas" valor={resumen.unidadesRecibidas.toLocaleString("es-PE")}>
            últimos 90 días · {resumen.recepciones.toLocaleString("es-PE")} {resumen.recepciones === 1 ? "recepción" : "recepciones"}
          </TarjetaCifra>
          {resumen.diasEntregaPromedio != null ? (
            <TarjetaCifra compacta punto="neutro" etiqueta="Tiempo de entrega" valor={`${Math.round(resumen.diasEntregaPromedio)} ${Math.round(resumen.diasEntregaPromedio) === 1 ? "día" : "días"}`}>
              emisión → llegada · promedio de {resumen.comprobantesRecibidos}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra compacta vacia etiqueta="Tiempo de entrega" valor="—">
              Aparece con la primera recepción
            </TarjetaCifra>
          )}
          {pctCompletas != null ? (
            <TarjetaCifra compacta punto="verde" detalleTono="text-verde-profundo" etiqueta="Entregas completas" valor={`${pctCompletas} %`}>
              {resumen.entregasCompletas} de {resumen.comprobantesRecibidos} {resumen.comprobantesRecibidos === 1 ? "comprobante llegó completo" : "comprobantes llegaron completos"}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra compacta vacia etiqueta="Entregas completas" valor="—">
              Aparece con la primera recepción
            </TarjetaCifra>
          )}
          <TarjetaCifra
            compacta
            punto={resumen.faltanteUnidades > 0 ? "ambar" : "verde"}
            tono={resumen.faltanteUnidades > 0 ? "text-ambar-profundo" : undefined}
            detalleTono={resumen.faltanteUnidades > 0 ? "text-ambar-profundo" : undefined}
            etiqueta="Faltante abierto"
            valor={`${resumen.faltanteUnidades.toLocaleString("es-PE")} ${resumen.faltanteUnidades === 1 ? "unidad" : "unidades"}`}
            href={resumen.faltanteUnidades > 0 ? "/compras?recep=parcial" : undefined}
          >
            {resumen.faltanteUnidades > 0
              ? `${resumen.faltanteComprobantes} ${resumen.faltanteComprobantes === 1 ? "comprobante" : "comprobantes"} · cerrar o reclamar →`
              : "Nada por reclamar"}
          </TarjetaCifra>
        </div>

        {/* En la maqueta 06 los filtros van a 14 px de la tabla (más pegados que el ritmo de la página): son sus controles. */}
        <div className="space-y-3.5">
          <FiltrosRecibidas proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))} filtros={filtrosRecibidas} hoy={hoyLima()} />
          <RecepcionesCompraLista
            recepciones={recepciones}
            detalles={detalles}
            nombres={nombres}
            vacio={hayFiltros ? "Ninguna recepción coincide con esos filtros." : `Todavía no se recibió nada contra un comprobante en ${persona.ubicacionEtiqueta}.`}
          />
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ Pendientes
  const { compra } = params;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, ubicaciones, catalogo, resumen, extra] = await Promise.all([
    listarPorRecibir(filtros, cursor),
    getUbicaciones(),
    getCatalogo(),
    getResumenCompras(),
    getResumenComprasExtra(),
  ]);
  // Las líneas se traen solo para los comprobantes de ESTA página (≤ 50).
  const [lineas, comprasConNotaFaltante, saldoFavorPorProveedor] = await Promise.all([
    getLineasCompra(compras.map((c) => c.id)),
    getComprasConNotaFaltante(compras.map((c) => c.id)),
    getSaldosFavor(compras.map((c) => c.proveedorId)),
  ]);
  const ubicacionesPermitidas = persona.rol === "lider" ? ubicaciones : ubicaciones.filter((u) => u.id === persona.ubicacionId);
  const sinAtraso = resumen.porRecibirAtrasadas === 0;

  return (
    <div className="space-y-6">
      {encabezado}
      {pestanas}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaCifra
          compacta
          punto={resumen.porRecibir > 0 ? "ambar" : "verde"}
          etiqueta="Por recibir"
          valor={resumen.porRecibir.toLocaleString("es-PE")}
          unidad={resumen.porRecibir === 1 ? "comprobante" : "comprobantes"}
        >
          {resumen.porRecibir > 0 ? `${soles(extra.valorPorRecibir)} en mercadería por llegar` : "Nada por recibir"}
        </TarjetaCifra>
        <TarjetaCifra compacta punto="neutro" etiqueta="Unidades pendientes" valor={extra.unidadesPendientes.toLocaleString("es-PE")}>
          {extra.unidadesPendientes > 0 ? "por llegar en estos comprobantes" : "Todo lo facturado ya llegó"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={sinAtraso ? "verde" : "ambar"}
          tono={sinAtraso ? undefined : "text-ambar-profundo"}
          detalleTono={sinAtraso ? undefined : "text-ambar-profundo"}
          etiqueta="Atrasadas"
          valor={resumen.porRecibirAtrasadas.toLocaleString("es-PE")}
        >
          {sinAtraso ? "Nada atrasado" : "Esperadas antes de hoy · recibir o reclamar"}
        </TarjetaCifra>
        {extra.diasMasAtrasada != null && extra.diasMasAtrasada > 0 ? (
          <TarjetaCifra
            compacta
            punto="ambar"
            tono="text-ambar-profundo"
            detalleTono="text-ambar-profundo"
            etiqueta="La más atrasada"
            valor={`${extra.diasMasAtrasada} ${extra.diasMasAtrasada === 1 ? "día" : "días"}`}
          >
            {extra.proveedorMasAtrasado} · {extra.documentoMasAtrasada}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra compacta vacia etiqueta="La más atrasada" valor="—">
            Nada atrasado
          </TarjetaCifra>
        )}
      </div>

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ningún comprobante pendiente de recibir coincide con esos filtros. " : "No hay comprobantes con mercadería pendiente de recibir. "}
          <Link href="/compras/nueva" className="text-rojo hover:underline">
            Registrar un comprobante →
          </Link>
        </p>
      ) : (
        <RecepcionCompraFormV2
          compras={compras}
          lineas={lineas}
          variantes={catalogo
            .filter((v) => v.activo)
            .map((v) => ({
              varianteId: v.varianteId,
              sku: v.sku,
              talla: v.talla,
              color: v.color,
              productoId: v.productoId,
              referencia: v.referencia,
            }))}
          ubicaciones={ubicacionesPermitidas.map((u) => ({
            id: u.id,
            nombre: u.nombre,
          }))}
          ubicacionInicialId={persona.ubicacionId}
          compraInicialId={compra ?? null}
          esLider={persona.rol === "lider"}
          igvMes={extra.igvMes}
          porRecibirAtrasadas={resumen.porRecibirAtrasadas}
          comprasConNotaFaltante={comprasConNotaFaltante}
          saldoFavorPorProveedor={saldoFavorPorProveedor}
        />
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras/recibir" />
    </div>
  );
}
