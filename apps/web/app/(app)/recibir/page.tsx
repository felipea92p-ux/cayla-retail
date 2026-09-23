import Link from "next/link";
import type { CSSProperties } from "react";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { listarPorRecibir, getLineasCompra, getRecepcionesRecientes, filtrosDesdeParams, getProveedoresActivos, type ParamsCompras } from "@/lib/compras";
import { getResumenRecepciones, listarRecepcionesCompras } from "@/lib/compras-indicadores";
import { getComprasConNotaFaltante } from "@/lib/saldo-favor";
import { hoyLima } from "@/lib/fechas-lima";
import { filtrosRecibidasDesdeParams, hayFiltrosRecibidas, resultadoDesdeParam } from "@/lib/recibidas-filtros-reglas";
import { getEnviosDeLotes, getTrasladosHaciaAca } from "@/lib/envio";
import { comprobanteSinMontos, kpisDeLaLista, lineaSinCosto } from "@/lib/envio-reglas";
import { valorPorRecibirDeMiTienda } from "@/lib/reparto-reglas";
import { RecepcionEnvio } from "@/components/RecepcionEnvio";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { KpisRecibir } from "@/components/KpisRecibir";
import { RecepcionesCompraLista } from "@/components/RecepcionesCompraLista";
import { FiltrosRecibidas } from "@/components/FiltrosRecibidas";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { Pestanas } from "@/components/ui/Pestanas";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";

// Recibir mercadería POR ENVÍO (ADR-0113). Es la puerta para todo lo que llega: un envío puede traer
// comprobantes de varios proveedores, prendas fuera de comprobante (de un proveedor, con su regalo) y
// hasta mercadería de otra sede. Lo que llegó SIN comprobante todavía (muestras, el papel que no llega)
// vive en «Ingreso sin comprobante» de Inventario: es una excepción, no un par de esta pantalla.
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

export default async function RecibirPage({ searchParams }: { searchParams: Promise<ParamsRecibir> }) {
  const persona = await requirePersonaActualV2();
  const esLider = persona.rol === "lider";
  const verMontos = puede(persona, "verDineroCompras"); // P2: los montos, a quien ve el dinero de Compras
  const params = await searchParams;
  const vista = params.vista === "recibidas" ? "recibidas" : "pendientes";

  // ADR-0139: Recibir es POR TIENDA. Una factura puede traer mercadería para varias tiendas y cada una recibe lo suyo:
  // se mira desde la tienda donde estás parado, y un líder puede mirar otra con `?ubicacion=` (el selector «Recibiendo
  // en»). Cada tienda ve lo que le toca de cada comprobante y solo eso; lo de las otras lo recibe cada una.
  const ubicaciones = await getUbicaciones();
  const ubicacionMirada = esLider && params.ubicacion && ubicaciones.some((u) => u.id === params.ubicacion) ? params.ubicacion : persona.ubicacionId;
  const nombreMirada = ubicaciones.find((u) => u.id === ubicacionMirada)?.nombre ?? persona.ubicacionEtiqueta;

  const encabezado = (
    <div className="anim-entra">
      <p className="label-cayla text-[11px] text-tinta/65">Recibir · {nombreMirada}</p>
      <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
      <p className="mt-1 text-sm text-tinta/65">
        {vista === "pendientes"
          ? `Marca los comprobantes que vienen en el envío, cuenta lo que llegó y recibe. Cada prenda entra como movimiento — el stock no se edita a mano. Aquí ves lo que le toca a ${nombreMirada} de cada comprobante; lo de las otras tiendas lo recibe cada una.`
          : "Lo que ya se recibió contra un comprobante, envío por envío."}
      </p>
      {esLider && vista === "pendientes" && (
        <div className="mt-2 flex items-center gap-2">
          <span className="label-cayla text-[11px] text-tinta/65">Recibiendo en</span>
          <SelectorUbicacion ubicaciones={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))} ubicacionActualId={ubicacionMirada} />
        </div>
      )}
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
    <div className="anim-entra" style={{ "--i": 2 } as CSSProperties}>
    <Pestanas
      etiquetaAccesible="Vistas de Recibir mercadería"
      activa={vista}
      items={[
        { clave: "pendientes", etiqueta: "Pendientes", href: "/recibir" },
        { clave: "recibidas", etiqueta: "Recibidas recientemente", href: "/recibir?vista=recibidas" },
      ]}
    />
    </div>
  );

  // ------------------------------------------------------------------ Recibidas
  if (vista === "recibidas") {
    const filtrosRecibidas = filtrosRecibidasDesdeParams(params);
    const LIMITE_RECIBIDAS = 30;
    const [resumen, recepciones, recientes, proveedores] = await Promise.all([
      getResumenRecepciones(),
      listarRecepcionesCompras({ busqueda: filtrosRecibidas.busqueda, proveedorId: filtrosRecibidas.proveedorId, desde: filtrosRecibidas.desde, hasta: filtrosRecibidas.hasta, limite: LIMITE_RECIBIDAS }),
      getRecepcionesRecientes({ conFactura: true, limite: 40 }),
      getProveedoresActivos(),
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
        {pestanas}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TarjetaCifra compacta className="anim-entra alza-cayla" style={{ "--i": 0 } as CSSProperties} punto="neutro" etiqueta="Unidades recibidas" valor={<CifraQueCuenta valor={resumen.unidadesRecibidas} alMontar />}>
            últimos 90 días · {resumen.recepciones.toLocaleString("es-PE")} {resumen.recepciones === 1 ? "recepción" : "recepciones"}
          </TarjetaCifra>
          {resumen.diasEntregaPromedio != null ? (
            <TarjetaCifra compacta className="anim-entra alza-cayla" style={{ "--i": 1 } as CSSProperties} punto="neutro" etiqueta="Tiempo de entrega" valor={<CifraQueCuenta valor={resumen.diasEntregaPromedio} formato="dias" alMontar />}>
              emisión → llegada · promedio de {resumen.comprobantesRecibidos}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra compacta className="anim-entra" style={{ "--i": 1 } as CSSProperties} vacia etiqueta="Tiempo de entrega" valor="—">
              Aparece con la primera recepción
            </TarjetaCifra>
          )}
          {pctCompletas != null ? (
            <TarjetaCifra compacta className="anim-entra alza-cayla" style={{ "--i": 2 } as CSSProperties} punto="verde" detalleTono="text-verde-profundo" etiqueta="Entregas completas" valor={<CifraQueCuenta valor={pctCompletas} formato="porcentaje" alMontar />}>
              {resumen.entregasCompletas} de {resumen.comprobantesRecibidos} {resumen.comprobantesRecibidos === 1 ? "comprobante llegó completo" : "comprobantes llegaron completos"}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra compacta className="anim-entra" style={{ "--i": 2 } as CSSProperties} vacia etiqueta="Entregas completas" valor="—">
              Aparece con la primera recepción
            </TarjetaCifra>
          )}
          <TarjetaCifra
            compacta
            className="anim-entra alza-cayla"
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
              ? `${resumen.faltanteComprobantes} ${resumen.faltanteComprobantes === 1 ? "comprobante" : "comprobantes"} · ${esLider ? "cerrar o reclamar →" : "un líder decide qué hacer"}`
              : "Nada por reclamar"}
          </TarjetaCifra>
        </div>

        {/* En la maqueta 06 los filtros van a 14 px de la tabla (más pegados que el ritmo de la página): son sus controles. */}
        <div className="space-y-3.5">
          <FiltrosRecibidas proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))} filtros={filtrosRecibidas} hoy={hoyLima()} resultado={resultadoDesdeParam(params.res)} />
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
    );
  }

  // ------------------------------------------------------------------ Pendientes
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
  const [lineasCompletas, comprasConNotaFaltante, trasladosPorUbicacion] = await Promise.all([
    getLineasCompra(compras.map((c) => c.id), { sinMontos: !verMontos, ubicacionId: ubicacionMirada }),
    esLider ? getComprasConNotaFaltante(compras.map((c) => c.id)) : Promise.resolve([] as string[]),
    getTrasladosHaciaAca(ubicacionesPermitidas.map((u) => u.id)),
  ]);
  const lineas = verMontos ? lineasCompletas : lineasCompletas.map(lineaSinCosto);
  // Los indicadores de abajo son de ESTA tienda: salen de su lista (que ya trae sus cifras) y, para quien ve el dinero, de
  // lo que le falta a ella a su costo. Los de toda la empresa siguen en Compras.
  const kpis = { ...kpisDeLaLista(comprasCompletas), valorPorRecibir: verMontos ? valorPorRecibirDeMiTienda(comprasCompletas, lineasCompletas) : (null as number | null) };

  return (
    <div className="space-y-6">
      {encabezado}
      {pestanas}

      {compras.length === 0 && !cursor ? (
        <div className="card-cayla space-y-2 p-5 text-sm text-tinta/75">
          <p>
            {hayFiltros ? "Ningún comprobante pendiente de recibir coincide con esos filtros. " : "No hay comprobantes con mercadería pendiente de recibir. "}
            {esLider && (
              <Link href="/compras/nueva" className="text-rojo hover:underline">
                Registrar un comprobante →
              </Link>
            )}
          </p>
          <p className="text-xs text-tinta/55">
            Si llegó mercadería sin comprobante, usa <Link href="/inventario/recibir" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">Ingreso sin comprobante</Link>.
          </p>
        </div>
      ) : (
        <RecepcionEnvio
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
          trasladosPorUbicacion={trasladosPorUbicacion}
          resumen={
            <KpisRecibir
              {...kpis}
              idMasAtrasada={comprasCompletas.find((c) => c.documento === kpis.documentoMasAtrasada && c.proveedorNombre === kpis.proveedorMasAtrasado)?.id ?? null}
            />
          }
        />
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/recibir" />
    </div>
  );
}
