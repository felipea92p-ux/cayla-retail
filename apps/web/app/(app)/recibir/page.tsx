import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { listarPorRecibir, getLineasCompra, getRecepcionesRecientes, filtrosDesdeParams, getProveedoresActivos, type ParamsCompras } from "@/lib/compras";
import type { CompraResumen } from "@/lib/compras-reglas";
import { getResumenRecepciones, listarRecepcionesCompras, listarRecepcionesSinComprobante } from "@/lib/compras-indicadores";
import { getComprasConNotaFaltante } from "@/lib/saldo-favor";
import { hoyLima, sumarDias } from "@/lib/fechas-lima";
import { filtrosRecibidasDesdeParams, hayFiltrosRecibidas, resultadoDesdeParam } from "@/lib/recibidas-filtros-reglas";
import { getEnviosDeLotes } from "@/lib/envio";
import { getTrasladosEnCurso, type TrasladoResumen } from "@/lib/traslados";
import { comprobanteSinMontos, kpisDeLaLista, lineaSinCosto, trasladosHaciaAca } from "@/lib/envio-reglas";
import { AvisoTrasladosEnCamino } from "@/components/AvisoTrasladosEnCamino";
import { valorPorRecibirDeMiTienda } from "@/lib/reparto-reglas";
import { RecepcionEnvio } from "@/components/RecepcionEnvio";
import { KpisRecibir } from "@/components/KpisRecibir";
import { RecepcionesCompraLista } from "@/components/RecepcionesCompraLista";
import { FiltrosRecibidas } from "@/components/FiltrosRecibidas";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { Volver } from "@/components/ui/Volver";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { codigoDeEtiqueta } from "@/lib/prenda-reglas";
import { getMarcasPorProveedor } from "@/lib/proveedores";
import { LlegoMercaderia } from "@/components/LlegoMercaderia";
import { RecepcionesRecientes } from "@/components/RecepcionesRecientes";
import { FunnelX, Receipt } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";

// Recibir mercadería (ADR-0330, 2026-10-04): la LLEGADA manda y la factura se une después. `/recibir` abre en «Llegó
// mercadería» (`LlegoMercaderia`, motor `recibir_lote`): ¿de quién? y ¿qué llegó?, en la sede de la cabecera. Recibir contra una
// factura ya registrada (ADR-0113, `RecepcionEnvio`: un envío con comprobantes de varios proveedores, reparto, faltantes) es la
// vista `?vista=factura` —también `?compra=` y `?prov=`, que traen los enlaces de Compras—.
//
// ADR-0299 (2026-10-01): lo que manda OTRA SEDE de CAYLA (un traslado) ya no se recibe acá. Se cuenta y se
// confirma en Traslados, donde además se elige piso o almacén. Esta pantalla solo AVISA que hay traslados en camino
// hacia la sede que se mira y lleva a Traslados (`AvisoTrasladosEnCamino`).
//
// Vive en `/recibir`, NO bajo `/compras`: el layout de Compras es solo de líder (montos, pagos, notas de
// crédito) y aquí cuenta CUALQUIER colaborador de la sede (Felipe, 2026-09-18, como en Traslados). Quien
// no ve el dinero de Compras recibe la misma pantalla SIN dinero: los montos ni siquiera salen del servidor. `/compras/recibir`
// redirige acá (next.config.ts) para que los enlaces y las maquetas de antes sigan funcionando.
//
// ADR-0161 P2 (Felipe, 2026-09-22, 20260923140000): los MONTOS los ve quien ya ve el dinero de Compras (`verDineroCompras`:
// Facturas de compra, Por pagar o Notas de crédito), no solo el líder — la base ya se los entrega (vistas compras_resumen y
// compra_items_resumen con fn_puede_ver_dinero_de_compras). Lo demás que decide `esLider` NO cambia: qué sede se mira
// («Recibiendo en»), las decisiones sobre lo que faltó y el aviso de la nota por reclamar.
//
// Los cuatro indicadores (ADR-0111) ya no van arriba: se dibujan DEBAJO de «¿Qué llegó?» —lo que se mira
// mientras no hay nada marcado— y desaparecen apenas se marca un comprobante, para dejarle toda la pantalla
// a quien cuenta. Se arman acá (servidor) y entran al formulario como un nodo.
//
// `?vista=recibidas`: lo que ya se recibió contra comprobante, con su resultado y su demora. Sus filtros
// (`?q=&prov=&desde=&hasta=`) son el buscador y las dos pastillas en línea de la maqueta 06
// (`FiltrosRecibidas`); el servidor los limpia con `filtrosRecibidasDesdeParams` antes de llamar a la base.
type ParamsRecibir = ParamsCompras & { compra?: string; vista?: string; nueva?: string; res?: string; ubicacion?: string };
type VistaRecibir = "llegada" | "factura" | "recibidas";

export default async function RecibirPage({ searchParams }: { searchParams: Promise<ParamsRecibir> }) {
  const persona = await requirePersonaActualV2();
  const esLider = persona.rol === "lider";
  const verMontos = puede(persona, "verDineroCompras"); // P2: los montos, a quien ve el dinero de Compras
  const params = await searchParams;
  // ADR-0330: las ventas sin registrar se mudaron a Existencias; el enlace viejo (avisos, marcadores) llega a su lugar nuevo.
  if (params.vista === "por-regularizar") redirect("/inventario/por-regularizar");
  const vista: VistaRecibir =
    params.vista === "recibidas"
      ? params.vista
      : params.vista === "factura" || params.compra || params.prov
        ? "factura"
        : "llegada";

  // ADR-0139 + ADR-0330: Recibir es POR TIENDA y la tienda es la de la cabecera (el selector de sede de arriba). Una factura puede
  // traer mercadería para varias tiendas y cada una recibe lo suyo desde su sede. Hasta el 2026-10-04 el líder tenía además
  // «Recibiendo en» (`?ubicacion=`): dos reglas para lo mismo, y la recepción sin factura ya usaba la sede de la cuenta.
  const ubicacionMirada = persona.ubicacionId;
  const nombreMirada = persona.ubicacionEtiqueta;

  // Sin pestañas (ADR-0330): la puerta es UNA. Recibir contra una factura y el historial se abren desde ella y vuelven a ella.
  const encabezado = (
    <div data-voz="cabecera" className="anim-entra">
      <p className="label-cayla text-[11px] text-tinta/65">Recibir · {nombreMirada}</p>
      <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
      <p className="mt-1 max-w-3xl text-sm text-tinta/65">
        {vista === "llegada"
          ? `Escanea lo que llegó y recíbelo: entra al almacén de ${nombreMirada}. Si no tiene factura todavía, igual se recibe.`
          : vista === "factura"
            ? `Marca la factura con la que vino la mercadería, cuenta lo que llegó y recibe. Solo ves lo que le toca a ${nombreMirada}; lo de otras tiendas lo recibe cada una.`
            : `Todo lo que llegó a ${nombreMirada}: sin factura y contra factura.`}
      </p>
      {vista !== "llegada" && <Volver href="/recibir" a="Llegó mercadería" className="mt-3" />}
    </div>
  );

  // ------------------------------------------------------------------ Recibidas
  if (vista === "recibidas") {
    const filtrosRecibidas = filtrosRecibidasDesdeParams(params);
    const LIMITE_RECIBIDAS = 30;
    const [resumen, recepciones, recientes, proveedores, sinFactura, costosSinFactura] = await Promise.all([
      getResumenRecepciones(),
      listarRecepcionesCompras({ busqueda: filtrosRecibidas.busqueda, proveedorId: filtrosRecibidas.proveedorId, desde: filtrosRecibidas.desde, hasta: filtrosRecibidas.hasta, limite: LIMITE_RECIBIDAS }),
      getRecepcionesRecientes({ conFactura: true, limite: 40 }),
      getProveedoresActivos(),
      // ADR-0330: lo que entra por «Llegó mercadería» sin factura (antes, la lista de «Ingreso sin comprobante»), de esta sede.
      getRecepcionesRecientes({ conFactura: false, ubicacionId: persona.ubicacionId, limite: 30 }),
      costosDeLotes(verMontos, persona.ubicacionId),
    ]);
    // A qué envío pertenece cada guía: las filas de una misma llegada de varios proveedores salen bajo una cabecera.
    const envios = await getEnviosDeLotes(recepciones.map((r) => r.loteId));
    // Detalle prenda por prenda y quién recibió, por guía (de la misma lectura que ya resuelve los nombres).
    const detalles = Object.fromEntries(recientes.map((r) => [r.loteId, r.detalle]));
    const nombres = Object.fromEntries(recientes.flatMap((r) => (r.recibidoPor ? [[r.loteId, r.recibidoPor] as const] : [])));
    const hayFiltros = hayFiltrosRecibidas(filtrosRecibidas);
    const pctCompletas = resumen.comprobantesRecibidos > 0 ? Math.round((resumen.entregasCompletas / resumen.comprobantesRecibidos) * 100) : null;

    return (
      <div className="space-y-6">
        {encabezado}

        <section className="space-y-2">
          <h2 className="label-cayla text-[11px] text-tinta/65">Sin factura · {nombreMirada}</h2>
          <RecepcionesRecientes recepciones={sinFactura} costos={costosSinFactura} vacio={`Todavía no llegó nada sin factura a ${nombreMirada}.`} />
        </section>

        <h2 className="label-cayla -mb-3 text-[11px] text-tinta/65">Contra factura</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TarjetaCifra className="anim-entra" style={{ "--i": 0 } as CSSProperties} punto="neutro" etiqueta="Unidades recibidas" valor={<CifraQueCuenta valor={resumen.unidadesRecibidas} alMontar />}>
            últimos 90 días · {resumen.recepciones.toLocaleString("es-PE")} {resumen.recepciones === 1 ? "recepción" : "recepciones"}
          </TarjetaCifra>
          {resumen.diasEntregaPromedio != null ? (
            <TarjetaCifra className="anim-entra" style={{ "--i": 1 } as CSSProperties} punto="neutro" etiqueta="Tiempo de entrega" valor={<CifraQueCuenta valor={resumen.diasEntregaPromedio} formato="dias" alMontar />}>
              emisión → llegada · promedio de {resumen.comprobantesRecibidos}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra className="anim-entra" style={{ "--i": 1 } as CSSProperties} etiqueta="Tiempo de entrega" valor={null}>
              Aparece con la primera recepción
            </TarjetaCifra>
          )}
          {pctCompletas != null ? (
            <TarjetaCifra className="anim-entra" style={{ "--i": 2 } as CSSProperties} punto="verde" detalleTono="text-verde-profundo" etiqueta="Entregas completas" valor={<CifraQueCuenta valor={pctCompletas} formato="porcentaje" alMontar />}>
              {resumen.entregasCompletas} de {resumen.comprobantesRecibidos} {resumen.comprobantesRecibidos === 1 ? "comprobante llegó completo" : "comprobantes llegaron completos"}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra className="anim-entra" style={{ "--i": 2 } as CSSProperties} etiqueta="Entregas completas" valor={null}>
              Aparece con la primera recepción
            </TarjetaCifra>
          )}
          <TarjetaCifra
            className="anim-entra"
            style={{ "--i": 3 } as CSSProperties}
            punto={resumen.faltanteUnidades > 0 ? "ambar" : "verde"}
            vivo={resumen.faltanteUnidades > 0}
            tono={resumen.faltanteUnidades > 0 ? "text-ambar-profundo" : undefined}
            detalleTono={resumen.faltanteUnidades > 0 ? "text-ambar-profundo" : undefined}
            etiqueta="Faltante abierto"
            valor={<CifraQueCuenta valor={resumen.faltanteUnidades} alMontar />}
            unidad={resumen.faltanteUnidades === 1 ? "unidad" : "unidades"}
            // La lista de comprobantes con faltante es de Compras (solo líder): a un colaborador no se le ofrece un enlace que lo devuelve al Inicio.
            href={esLider && resumen.faltanteUnidades > 0 ? "/compras?recep=parcial" : undefined}
          >
            {resumen.faltanteUnidades > 0
              ? `${resumen.faltanteComprobantes} ${resumen.faltanteComprobantes === 1 ? "comprobante" : "comprobantes"} · ${esLider ? "cerrar o reclamar" : "un líder decide qué hacer"}`
              : "Nada por reclamar"}
          </TarjetaCifra>
        </div>

        {/* En la maqueta 06 los filtros van a 14 px de la tabla (más pegados que el ritmo de la página): son sus controles. */}
        <div className="space-y-3.5">
          <FiltrosRecibidas proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))} filtros={filtrosRecibidas} hoy={hoyLima()} resultado={resultadoDesdeParam(params.res)} />
          {/* `data-resultados`: se atenúa mientras el buscador espera a la base (useBusquedaEnUrl). */}
          <div data-resultados>
            <RecepcionesCompraLista
              recepciones={recepciones}
              detalles={detalles}
              nombres={nombres}
              envios={envios}
              limite={LIMITE_RECIBIDAS}
              destacarNueva={params.nueva === "1"}
              resultado={resultadoDesdeParam(params.res)}
              enlaceAlComprobante={verMontos}
              vacio={hayFiltros ? "Ninguna recepción coincide con esos filtros." : `Todavía no se recibió nada contra un comprobante en ${persona.ubicacionEtiqueta}.`}
            />
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ Llegó mercadería (ADR-0330)
  if (vista === "llegada") {
    // «Llegó esta semana»: lo recibido en ESTA sede los últimos 7 días (hoy incluido, en días de Lima), con o sin factura.
    const haceUnaSemana = sumarDias(hoyLima(), -6);
    const [catalogo, proveedores, marcas, trasladosDeLaSede, porRecibir, recientes, costos] = await Promise.all([
      getCatalogo(),
      getProveedoresActivos(),
      // Las marcas de cada proveedor ordenan las sugerencias del buscador; si no se pudieron leer, la puerta funciona igual.
      getMarcasPorProveedor(),
      getTrasladosEnCurso(persona.ubicacionId).catch((e: unknown) => {
        console.error("Aviso de traslados en Recibir mercadería:", e);
        return [] as TrasladoResumen[];
      }),
      // Las facturas que le faltan a ESTA sede: si el proveedor elegido tiene, la puerta pregunta si viene con una (ADR-0330).
      // Es secundaria: si la lectura falla, la puerta recibe igual, sin la pregunta.
      listarPorRecibir({}, null, { sinMontos: true, ubicacionId: persona.ubicacionId }).catch((e: unknown) => {
        console.error("Facturas pendientes en Llegó mercadería:", e);
        return { filas: [] as CompraResumen[], siguiente: null };
      }),
      // Secundaria como las dos de arriba: sin ella la puerta recibe igual, sin la lista ni el aviso de la misma caja.
      getRecepcionesRecientes({ ubicacionId: persona.ubicacionId, desde: haceUnaSemana, limite: 20 }).catch((e: unknown) => {
        console.error("Llegó esta semana en Recibir mercadería:", e);
        return [];
      }),
      costosDeLotes(verMontos, persona.ubicacionId),
    ]);
    return (
      <div className="space-y-6">
        {encabezado}
        {/* Si lo que llegó es de otra sede de CAYLA, no se recibe aquí: se cuenta en Traslados (ADR-0299). */}
        <AvisoTrasladosEnCamino traslados={trasladosHaciaAca(trasladosDeLaSede, persona.ubicacionId)} sedeNombre={persona.ubicacionEtiqueta} veTraslados={veModulo(persona, "traslados")} />
        <LlegoMercaderia
          ubicacionId={persona.ubicacionId}
          ubicacionEtiqueta={persona.ubicacionEtiqueta}
          verMontos={verMontos}
          veExistencias={veModulo(persona, "existencias")}
          proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre, marcas: marcas?.[p.id] ?? [] }))}
          facturas={porRecibir.filas.map((c) => ({
            id: c.id,
            proveedorId: c.proveedorId,
            documento: c.documento,
            fechaEmision: c.fechaEmision,
            // Lo que le falta a ESTA sede (ADR-0139), ya sin lo recibido ni lo cerrado por faltante.
            pendientes: c.pendienteAqui ?? Math.max(0, c.facturadoCantidad - c.recibidoCantidad - c.cerradoCantidad),
          }))}
          recientes={recientes.map((r) => ({ proveedorId: r.proveedorId, fecha: r.fecha, unidades: r.unidades, recibidoPor: r.recibidoPor }))}
          prendas={catalogo
            .filter((v) => v.activo && v.varianteId !== ID_CARGO_ESPECIAL)
            .map((v) => ({
              varianteId: v.varianteId,
              productoId: v.productoId,
              // El código de la etiqueta (`sku` es NULL en casi todas): es lo que lee la pistola.
              sku: codigoDeEtiqueta(v),
              referencia: v.referencia,
              talla: v.talla,
              color: v.color,
              marca: v.marca ?? null,
              codigosBarras: v.codigosBarras,
              colorHex: v.colorHex,
              fotoUrl: v.fotoUrl,
            }))}
        />
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="label-cayla text-[11px] text-tinta/65">Llegó esta semana · {persona.ubicacionEtiqueta}</h2>
            <Link href="/recibir?vista=recibidas" className="btn-cayla btn-enlace btn-chico">
              Ver todo lo recibido
            </Link>
          </div>
          <RecepcionesRecientes recepciones={recientes} costos={costos} vacio={`Esta semana todavía no llegó nada a ${persona.ubicacionEtiqueta}.`} />
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ Contra una factura ya registrada (ADR-0113)
  const { compra } = params;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: comprasCompletas, siguiente }, catalogo, proveedores] = await Promise.all([
    // ADR-0126: quien no ve el dinero lee los comprobantes por `listar_compras_operativo`, que no trae un solo monto (las
    // tablas de dinero quedan cerradas para él en la base). Quien lo ve (P2) recibe además los montos de `compras_resumen`.
    // ADR-0139: solo los comprobantes que aún le faltan a ESTA tienda, con las cifras de ella.
    listarPorRecibir(filtros, cursor, { sinMontos: !verMontos, ubicacionId: ubicacionMirada }),
    getCatalogo(),
    getProveedoresActivos(),
  ]);
  // Quien cuenta sin ver el dinero de Compras no ve montos: la base ya no se los entrega (ADR-0126) y, por si esa lectura
  // cayera al camino de antes (la app desplegada antes que la migración), aquí se vuelve a tachar: no salen del servidor.
  const compras = verMontos ? comprasCompletas : comprasCompletas.map(comprobanteSinMontos);
  // ADR-0139: se recibe en la tienda desde la que se mira (un líder cambia de tienda con «Recibiendo en»): los topes y
  // las cifras de cada línea son de ELLA, así que el formulario no ofrece recibir en otra.
  const ubicacionesPermitidas = [{ id: ubicacionMirada, nombre: nombreMirada }];

  // Las líneas se traen solo para los comprobantes de ESTA página (≤ 50).
  const [lineasCompletas, comprasConNotaFaltante, trasladosDeLaSede] = await Promise.all([
    getLineasCompra(compras.map((c) => c.id), { sinMontos: !verMontos, ubicacionId: ubicacionMirada }),
    esLider ? getComprasConNotaFaltante(compras.map((c) => c.id)) : Promise.resolve([] as string[]),
    // El aviso de traslados es secundario: si esta lectura falla, Recibir sigue funcionando sin el aviso (nunca se cae por él).
    getTrasladosEnCurso(ubicacionMirada).catch((e: unknown) => {
      console.error("Aviso de traslados en Recibir mercadería:", e);
      return [] as TrasladoResumen[];
    }),
  ]);
  const avisoTraslados = (
    <AvisoTrasladosEnCamino traslados={trasladosHaciaAca(trasladosDeLaSede, ubicacionMirada)} sedeNombre={nombreMirada} veTraslados={veModulo(persona, "traslados")} />
  );
  const lineas = verMontos ? lineasCompletas : lineasCompletas.map(lineaSinCosto);
  // Los indicadores de abajo son de ESTA tienda: salen de su lista (que ya trae sus cifras) y, para quien ve el dinero, de
  // lo que le falta a ella a su costo. Los de toda la empresa siguen en Compras.
  const kpis = { ...kpisDeLaLista(comprasCompletas), valorPorRecibir: verMontos ? valorPorRecibirDeMiTienda(comprasCompletas, lineasCompletas) : (null as number | null) };

  return (
    <div className="space-y-6">
      {encabezado}
      {avisoTraslados}

      {compras.length === 0 && !cursor ? (
        <div className="card-cayla">
          {hayFiltros ? (
            <Vacio
              icono={<FunnelX />}
              titulo="Ningún comprobante con esos filtros"
              acciones={<BotonEnlace href="/recibir?vista=factura" peso="fantasma">Limpiar filtros</BotonEnlace>}
            >
              Ningún comprobante pendiente de recibir coincide con esos filtros. Si llegó mercadería sin factura,{" "}
              <Link href="/recibir" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">recíbela sin factura</Link>.
            </Vacio>
          ) : (
            <Vacio
              icono={<Receipt />}
              titulo="No hay nada pendiente de recibir"
              acciones={esLider ? <BotonEnlace href="/compras/nueva" peso="primario">Registrar un comprobante</BotonEnlace> : undefined}
            >
              No hay comprobantes con mercadería pendiente de recibir. Si llegó mercadería sin factura,{" "}
              <Link href="/recibir" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">recíbela sin factura</Link>.
            </Vacio>
          )}
        </div>
      ) : (
        <RecepcionEnvio
          compras={compras}
          lineas={lineas}
          variantes={catalogo
            .filter((v) => v.activo)
            .map((v) => ({
              varianteId: v.varianteId,
              // El código de la etiqueta (`sku` es NULL en casi todas): es la llave con que el escáner y la sugerencia
              // de texto de «Recibir» encuentran la prenda (`RecepcionEnvio`: `escanear(sugerencias[0].sku)`); con `""`
              // escribir «blusa negra» + Enter no encontraba nada.
              sku: codigoDeEtiqueta(v),
              talla: v.talla,
              color: v.color,
              productoId: v.productoId,
              referencia: v.referencia,
              codigosBarras: v.codigosBarras,
              colorHex: v.colorHex,
              fotoUrl: v.fotoUrl,
            }))}
          proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
          ubicaciones={ubicacionesPermitidas.map((u) => ({ id: u.id, nombre: u.nombre }))}
          ubicacionInicialId={ubicacionMirada}
          compraInicialId={compra ?? null}
          esLider={esLider}
          verMontos={verMontos}
          comprasConNotaFaltante={comprasConNotaFaltante}
          veTraslados={veModulo(persona, "traslados")}
          resumen={
            <KpisRecibir
              {...kpis}
              idMasAtrasada={comprasCompletas.find((c) => c.documento === kpis.documentoMasAtrasada && c.proveedorNombre === kpis.proveedorMasAtrasado)?.id ?? null}
            />
          }
        />
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={{ ...params, vista: "factura" }} pathname="/recibir" />
    </div>
  );
}

/**
 * El costo de cada llegada sin factura, solo para quien ve el dinero de Compras (ADR-0126): una prenda que entra sin costo deja el
 * margen sin dato hasta que llegue su factura (ADR-0330, fase 2), y quien paga tiene que verlo. A los demás, ni la columna
 * (`undefined`). Secundario: si no se puede leer, la lista sale igual, sin costos.
 */
async function costosDeLotes(verMontos: boolean, ubicacionId: string): Promise<Record<string, { costo: number | null; sinCosto: boolean }> | undefined> {
  if (!verMontos) return undefined;
  try {
    const filas = await listarRecepcionesSinComprobante({ ubicacionId, limite: 30 });
    return Object.fromEntries(filas.map((r) => [r.loteId, { costo: r.costoUnitarioPromedio, sinCosto: r.sinCosto }]));
  } catch (e) {
    console.error("Costos de las llegadas sin factura:", e);
    return undefined;
  }
}
