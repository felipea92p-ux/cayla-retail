import { Suspense } from "react";
import { exigirModulo, puede } from "@/lib/persona-actual";
import { accesosVisibles } from "@/lib/vender-accesos";
import { getCatalogo } from "@/lib/catalogo-v2";
import { leerPreciosEnSede } from "@/lib/precio-sede-reglas";
import { getCajaAbierta, getUltimoCierre } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { agruparStockPorSede } from "@/lib/stock-por-sede";
import { getDisponibleEnSede, leerStockDeLasSedes } from "@/lib/inventario-v2";
import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { PuntoDeVenta, type ProformaEnCobro } from "@/components/PuntoDeVenta";
import { almacenDeLaSede, apartadoEnPiso, cantidadCobrable } from "@/lib/vender-stock-local";
import { getProformaParaCobrar } from "@/lib/proformas";
import { numeroDeProforma } from "@/lib/proformas-reglas";
import { confirmacionDeConversion } from "@/lib/facturacion-proformas-reglas";
import { lineasDelCarritoDesdeProforma } from "@/lib/proforma-al-carrito";
import { lineasDelCarritoDesdeVenta, type RepeticionDeVenta } from "@/lib/repetir-venta";
import { elegirComprobante, diaDeLima, type VentaCruda } from "@/lib/ventas-historial-reglas";
import type { CampanaLinea } from "@/lib/vender-reglas";
import { armarListasPrendaLibre, leerListasPrendaLibre } from "@/lib/prenda-sin-registrar-listas";
import { clubDeLaCaja } from "@/lib/club-caja-reglas";
import { sedesParaPedir } from "@/lib/pedidos-entre-sedes-reglas";
import { getPedidosConCliente } from "@/lib/pedidos-entre-sedes";

/**
 * Vender: la caja del día de la ubicación — abrir, vender, cerrar, y ver lo vendido hoy.
 * Reconciliado con V2 el 2026-09-12 (el corte V1→V2 llegó a `main` mientras se
 * construía esto): `PuntoDeVenta.tsx` reemplazó a `VenderFormV2.tsx`, la pantalla
 * mínima de V2 que fue explícitamente un placeholder ("no reemplaza a
 * RegistrarVentaModal... se retoma cuando Ventas entre de lleno al roadmap") y que
 * se retiró el 2026-09-15 tras quedar sin importadores — pero todavía llamaba a
 * `registrar_venta`. Vive dentro de `(app)` con el sidebar de AppShell,
 * sin el tope de ancho `max-w-5xl` (ver AppShell.tsx).
 */
export default async function VenderPage({ searchParams }: { searchParams: Promise<{ proforma?: string; repetir?: string }> }) {
  const { proforma, repetir } = await searchParams;
  return (
    <Suspense fallback={<p className="label-cayla text-[11px] text-tinta/50">Cargando caja…</p>}>
      <Caja proformaId={proforma ?? null} repetirVentaId={!proforma && repetir && /^[0-9a-f-]{36}$/i.test(repetir) ? repetir : null} />
    </Suspense>
  );
}

async function Caja({ proformaId, repetirVentaId }: { proformaId: string | null; repetirVentaId: string | null }) {
  const persona = await exigirModulo("vender"); // ADR-0161: URL directa sin el módulo en su rol → «Sin acceso»
  const supabase = await createClient();
  // Dos lecturas de stock con dos preguntas distintas:
  // · «¿cuánto puedo cobrar AQUÍ ya?» → `getDisponibleEnSede`, la misma regla que la
  //   pantalla de Inventario: una venta descuenta el PISO, nunca el almacén en silencio
  //   (`inventario_piso_almacen.sql`), así que el tope que ve la cajera es el piso; en una
  //   ubicación sin piso/almacén (Taller, `piso === null`) sigue siendo el total.
  // · «¿dónde más hay?» → `fn_stock_por_sede()` (20260914220001, security definer), no
  //   `stock` directo: `stock_select` solo deja ver las sedes que la persona puede OPERAR,
  //   así que una colaboradora con sede fija leía la tabla y recibía SOLO su propia sede —
  //   `otrasSedes` le llegaba vacío. La RPC expone las cantidades por sede a cualquiera con
  //   acceso a retail, sin ampliar esa policy. Sumadas por sede (piso + almacén: para un
  //   traslado importa lo que la otra tienda tiene, no lo que exhibe — decisión de Felipe,
  //   2026-09-14). Ver `lib/stock-por-sede.ts`.
  const [variantes, caja, resStock, ubicaciones, stockAqui, resCampanas, listasLeidas, resVentasHoy, resTextosClub, resWhatsappTienda, resQr, resRedondeo, resOpcionesApartados, pedidosConCliente, resPreciosSede] = await Promise.all([
    getCatalogo(),
    getCajaAbierta(persona.ubicacionId),
    leerStockDeLasSedes(),
    getUbicaciones(),
    getDisponibleEnSede(persona.ubicacionId),
    // La campaña de mayor % que rige HOY (Lima) por prenda — la elige la base y la vuelve
    // a verificar `registrar_venta`. Es un dato secundario: si no carga, se vende sin
    // ella y se AVISA (abajo), en vez de tumbar la caja. Mientras la función no exista en
    // producción (PGRST202) no hay campañas que aplicar: sin aviso.
    supabase.rpc("campanas_vigentes"),
    // Listas cerradas del modal «Prenda sin registrar» (ADR-0179), las mismas que usa Ventas sin registrar al corregir (ADR-0369).
    // Si alguna no carga, la caja sigue vendiendo: esa lista sale vacía y el modal no deja agregar la prenda.
    leerListasPrendaLibre(),
    // Las ventas de hoy de esta sede: la píldora «Hoy» de la cabecera y su lista (spike 2026-09-26). Secundario: si
    // falla, la caja vende igual y la lista lo dice. Siempre esta sede, no un consolidado (para eso está Facturación).
    supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: persona.ubicacionId }),
    // El club (ADR-0288, tanda 1b): el texto que la asesora lee al invitar, los mensajes de los QR y el WhatsApp de esta
    // tienda. Secundario: si falla (o la migración no está en producción), Cobrar no invita ni imprime QR y vende igual.
    supabase.rpc("fn_club_textos_vigentes"),
    supabase.from("ubicaciones").select("whatsapp_numero").eq("id", persona.ubicacionId).maybeSingle(),
    // ¿La base ya acepta el QR como medio de una venta? (20261002130000). Si la función no existe todavía, el error deja
    // la hoja de cobro con los cinco medios de siempre.
    supabase.rpc("fn_acepta_pago_qr"),
    // ¿La base ya recibe el redondeo del efectivo a S/ 0.10, hacia abajo? (20261003140000, ADR-0311). Si la función no existe todavía o
    // dice false, la caja cobra exacto como siempre: nunca manda algo que la base rechazaría.
    supabase.rpc("fn_acepta_redondeo_efectivo"),
    // «Pedir y apartar para este cliente» (ADR-0328 act. 17): respeta el interruptor «Pedir a otra sede» de las opciones de
    // Apartados de esta sede. Si la lectura falla, la opción se ofrece (la base decide igual en cada pedido).
    supabase.rpc("fn_opciones_apartados", { p_ubicacion_id: persona.ubicacionId }),
    // Lo que esta tienda pidió para un cliente y llegó o no va a llegar: la franja de los clientes por avisar. Secundario: vacío si falla.
    getPedidosConCliente(persona.ubicacionId),
    // Precio propio de esta tienda (Felipe 2026-10-09): las prendas que aquí se venden a otro precio. Si la lectura falla, se
    // muestra el general y `registrar_venta` rechaza el cobro («el precio cambió») antes de cobrar mal: nunca un cobro equivocado.
    supabase.rpc("fn_precios_en_sede", { p_ubicacion_id: persona.ubicacionId }),
  ]);
  const preciosDeEstaSede = leerPreciosEnSede(resPreciosSede.data);
  const campanasNoCargaron = resCampanas.error !== null && resCampanas.error.code !== "PGRST202";
  const campanaPorVariante = new Map<string, CampanaLinea>(
    (resCampanas.data ?? []).map((c) => [c.variante_id, { etiquetaId: c.etiqueta_id, nombre: c.etiqueta_nombre, pct: Number(c.descuento_pct) }]),
  );
  const filasStock = exigir(resStock, "el stock de las sedes");
  const stockPorVariante = agruparStockPorSede(filasStock, ubicaciones, persona.ubicacionId);
  // Lo APARTADO para una clienta sigue en el piso pero no se puede cobrar: el tope es lo DISPONIBLE
  // (ADR-0141). La base lo rechazaría igual (`fn_aplicar_movimiento`); esto evita ofrecerlo.
  const pisoPorVariante = new Map([...stockAqui].map(([id, c]) => [id, cantidadCobrable(c)]));

  const variantesParaVenta = variantes
    .filter((v) => v.activo)
    .map((v) => ({
      varianteId: v.varianteId,
      sku: v.sku,
      codigo: v.codigo,
      referencia: v.referencia,
      talla: v.talla,
      color: v.color,
      colorHex: v.colorHex ?? null,
      categoria: v.categoria,
      categoriaPrefijo: v.categoriaPrefijo ?? null,
      categoriaFamilia: v.categoriaFamilia ?? null,
      marca: v.marca,
      precio: preciosDeEstaSede.get(v.varianteId) ?? v.precio,
      precioDeSede: preciosDeEstaSede.has(v.varianteId),
      campana: campanaPorVariante.get(v.varianteId) ?? null,
      fotoUrl: v.fotoUrl,
      codigosBarras: v.codigosBarras,
      stockAqui: pisoPorVariante.get(v.varianteId) ?? 0,
      // Del MISMO mapa, sin otra lectura: lo guardado en el almacén de esta sede. No se cobra (la venta descuenta el
      // piso), pero con el piso en 0 la caja dice «está en el almacén» en vez de «agotada» (D-40).
      almacenAqui: almacenDeLaSede(stockAqui.get(v.varianteId)),
      // Del MISMO mapa: lo apartado para clientas en el piso. Con el piso y el almacén en 0 distingue «apartada para un
      // cliente» de «agotada» (`motivoNoCobrable`).
      apartadoAqui: apartadoEnPiso(stockAqui.get(v.varianteId)),
      stockOtrasSedes: stockPorVariante.get(v.varianteId)?.otrasSedes ?? [],
    }));

  // «Cobrar» desde Proformas (ADR-0167): la proforma entra como carrito si es de esta tienda y sigue vigente.
  let proformaEnCobro: ProformaEnCobro | null = null;
  let avisoProforma: string | null = null;
  if (proformaId) {
    const ahora = new Date();
    const p = await getProformaParaCobrar(proformaId, ahora.getTime());
    if (!p) avisoProforma = "No se encontró esa proforma.";
    else if (p.estado !== "vigente") avisoProforma = `${numeroDeProforma(p.numero)} ya no está vigente (está ${p.estado}).`;
    else if (p.ubicacion_id !== persona.ubicacionId) avisoProforma = `${numeroDeProforma(p.numero)} es de otra tienda: cóbrala desde esa sede.`;
    else {
      const { lineas, faltan, faltanEnAlmacen, prometidas } = lineasDelCarritoDesdeProforma(p, variantesParaVenta);
      proformaEnCobro = {
        id: p.id,
        numero: numeroDeProforma(p.numero),
        cliente: p.cliente_nombre,
        clienteDoc: p.cliente_num_doc,
        lineas,
        faltan,
        faltanEnAlmacen,
        prometidas,
        confirmacion: confirmacionDeConversion(p, ahora),
      };
    }
  }

  // «Volver a vender» desde Ventas ▸ Historial (ADR-0230): las prendas de esa venta entran al ticket al precio de HOY. La
  // RLS de `ventas` decide si esta cuenta la ve (una integrante, solo las de su tienda); si no, se avisa y el ticket va vacío.
  let repeticion: RepeticionDeVenta | null = null;
  let avisoRepeticion: string | null = null;
  if (repetirVentaId) {
    const res = await supabase
      .from("ventas")
      .select(
        `created_at, venta_items ( variante_id, cantidad, variante:variantes ( talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) ) ),
         comprobantes ( tipo, serie, numero, estado, created_at )`
      )
      .eq("id", repetirVentaId)
      .maybeSingle();
    if (res.error || !res.data) avisoRepeticion = "No se encontró esa venta para volver a venderla.";
    else {
      const v = res.data as unknown as {
        created_at: string;
        venta_items: { variante_id: string; cantidad: number; variante: { talla: { valor: string } | null; color: { nombre: string } | null; producto: { referencia: string } | null } | null }[];
        comprobantes: VentaCruda["comprobantes"];
      };
      const comprobante = elegirComprobante(v.comprobantes);
      const [, mes, dia] = diaDeLima(v.created_at).split("-");
      const prendas = v.venta_items.map((i) => ({
        varianteId: i.variante_id,
        cantidad: i.cantidad,
        descripcion: [i.variante?.producto?.referencia ?? "Prenda", i.variante?.talla?.valor, i.variante?.color?.nombre].filter(Boolean).join(" · "),
      }));
      repeticion = { origen: comprobante?.numero ?? `la venta del ${Number(dia)}/${Number(mes)}`, ...lineasDelCarritoDesdeVenta(prendas, variantesParaVenta) };
    }
  }

  // Sin caja (ADR-0186): lo que dejó el último cierre, para que el modal «Abrir caja» pida contar el cajón.
  // El mismo cierre le dice al cartel «Cerrado» desde cuándo y quién cerró (ADR-0301).
  const ultimoCierre = caja ? null : await getUltimoCierre(persona.ubicacionId);
  const fondoUltimoCierre = ultimoCierre?.montoFondo ?? null;
  // «Prenda sin registrar» (ADR-0179): listas cerradas del modal. El uso de colores por categoría sale del mismo
  // catálogo que ya carga la caja (sin otra consulta): los usados en esa categoría se ofrecen primero.
  const listasPrendaLibre = armarListasPrendaLibre(listasLeidas, variantes);

  const ventasHoy = tolerar(resVentasHoy, "las ventas de hoy");
  const club = clubDeLaCaja(resTextosClub.error ? null : resTextosClub.data, resWhatsappTienda.error ? null : resWhatsappTienda.data?.whatsapp_numero);
  const modulos = persona.modulos.map((m) => m.clave);
  // Proformas vive en Facturación, que además de su módulo pide el poder «facturar» (`exigirPermiso`).
  const puedeProforma = puede(persona, "facturar");

  return (
    <PuntoDeVenta
      // Otra proforma (u otra vez la misma tras soltarla) arranca un ticket nuevo: el carrito se arma al montar.
      key={proformaEnCobro?.id ?? (repeticion ? `repetir-${repetirVentaId}` : "caja")}
      proforma={proformaEnCobro}
      avisoProforma={avisoProforma ?? avisoRepeticion}
      repeticion={repeticion}
      ubicacionId={persona.ubicacionId}
      // Solo decide qué se muestra (el campo «Código» del descuento): la regla de quién
      // descuenta la aplica `registrar_venta` (20260914215103_codigos_descuento.sql).
      puedeCerrarCaja={puede(persona, "gestionarCaja")}
      ubicacionEtiqueta={persona.ubicacionEtiqueta}
      cajaId={caja?.id ?? null}
      fondoUltimoCierre={fondoUltimoCierre}
      cierreAnterior={ultimoCierre ? { cerradaEn: ultimoCierre.cerradaEn, cerradaPorNombre: ultimoCierre.cerradaPorNombre, montoFondo: ultimoCierre.montoFondo } : null}
      variantes={variantesParaVenta}
      listasPrendaLibre={listasPrendaLibre}
      campanasNoCargaron={campanasNoCargaron}
      ventasHoy={{ inicial: ventasHoy.datos ?? [], fallo: ventasHoy.fallo }}
      metaVentaDiaria={ubicaciones.find((u) => u.id === persona.ubicacionId)?.metaVentaDiaria ?? null}
      // Solo las puertas que su rol abre (ADR-0161): Caja, Apartados, Cambios… y las acciones del ticket que llevan allí.
      accesos={accesosVisibles(modulos).filter((a) => a.modulo !== "facturacion" || puedeProforma)}
      puedeApartar={modulos.includes("apartados") && persona.ubicacionTipo === "tienda"}
      // La libreta de clientas es del módulo «Clientas» (ADR-0249, 2026-09-28): sin él, el ticket no ofrece buscarla.
      puedeBuscarClienta={modulos.includes("clientas")}
      club={club}
      qrDisponible={resQr.data === true}
      redondeoEfectivoDisponible={resRedondeo.data === true}
      pedirAOtraSede={
        (resOpcionesApartados.data ?? []).includes("otra_sede") || sedesParaPedir(ubicaciones, persona.ubicacionId).length === 0
          ? null
          : { tiendas: sedesParaPedir(ubicaciones, persona.ubicacionId) }
      }
      pedidosConCliente={pedidosConCliente}
      ahoraIso={new Date().toISOString()}
    />
  );
}
