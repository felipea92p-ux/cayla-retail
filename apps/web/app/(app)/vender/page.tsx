import { Suspense } from "react";
import { exigirModulo, puede } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getCajaAbierta, getUltimoCierre } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { agruparStockPorSede } from "@/lib/stock-por-sede";
import { nombresCortos } from "@/lib/nombre-integrante";
import { getDisponibleEnSede, leerStockDeLasSedes } from "@/lib/inventario-v2";
import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { PuntoDeVenta, type ProformaEnCobro } from "@/components/PuntoDeVenta";
import { getProformaParaCobrar } from "@/lib/proformas";
import { numeroDeProforma } from "@/lib/proformas-reglas";
import { confirmacionDeConversion } from "@/lib/facturacion-proformas-reglas";
import { lineasDelCarritoDesdeProforma } from "@/lib/proforma-al-carrito";
import type { CampanaLinea } from "@/lib/vender-reglas";
import { ordenTalla } from "@/lib/catalogo-grupos";
import { getEjesPorCategoria } from "@/lib/catalogo-v2";
import { usoDeColores, type ListasPrendaLibre } from "@/lib/prenda-sin-registrar-reglas";

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
export default async function VenderPage({ searchParams }: { searchParams: Promise<{ proforma?: string }> }) {
  const { proforma } = await searchParams;
  return (
    <Suspense fallback={<p className="label-cayla text-[11px] text-tinta/50">Cargando caja…</p>}>
      <Caja proformaId={proforma ?? null} />
    </Suspense>
  );
}

async function Caja({ proformaId }: { proformaId: string | null }) {
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
  const [variantes, caja, resStock, ubicaciones, stockAqui, resCampanas, resCategorias, resTallas, resColores, ejes] = await Promise.all([
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
    // Listas cerradas del modal «Prenda sin registrar» (ADR-0179). Si alguna no carga, la caja
    // sigue vendiendo: esa lista sale vacía y el modal no deja agregar la prenda.
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("tallas").select("id, valor").eq("activo", true).eq("estado", "aprobado"),
    supabase.from("colores").select("codigo, nombre, hex, familia_color").eq("activo", true).order("orden").order("nombre"),
    // Las tallas de cada categoría (`categoria_tallas`). Si no cargan, el modal ofrece todas: la caja no se cae por esto.
    getEjesPorCategoria().catch(() => null),
  ]);
  const campanasNoCargaron = resCampanas.error !== null && resCampanas.error.code !== "PGRST202";
  const campanaPorVariante = new Map<string, CampanaLinea>(
    (resCampanas.data ?? []).map((c) => [c.variante_id, { etiquetaId: c.etiqueta_id, nombre: c.etiqueta_nombre, pct: Number(c.descuento_pct) }]),
  );
  const filasStock = exigir(resStock, "el stock de las sedes");
  const stockPorVariante = agruparStockPorSede(filasStock, ubicaciones, persona.ubicacionId);
  // Lo APARTADO para una clienta sigue en el piso pero no se puede cobrar: el tope es lo DISPONIBLE
  // (ADR-0141). La base lo rechazaría igual (`fn_aplicar_movimiento`); esto evita ofrecerlo.
  const pisoPorVariante = new Map([...stockAqui].map(([id, c]) => [id, c.pisoDisponible ?? c.disponible]));

  const variantesParaVenta = variantes
    .filter((v) => v.activo)
    .map((v) => ({
      varianteId: v.varianteId,
      sku: v.sku,
      codigo: v.codigo,
      referencia: v.referencia,
      talla: v.talla,
      color: v.color,
      categoria: v.categoria,
      marca: v.marca,
      precio: v.precio,
      campana: campanaPorVariante.get(v.varianteId) ?? null,
      fotoUrl: v.fotoUrl,
      codigosBarras: v.codigosBarras,
      stockAqui: pisoPorVariante.get(v.varianteId) ?? 0,
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
      const { lineas, faltan } = lineasDelCarritoDesdeProforma(p, variantesParaVenta);
      proformaEnCobro = {
        id: p.id,
        numero: numeroDeProforma(p.numero),
        cliente: p.cliente_nombre,
        clienteDoc: p.cliente_num_doc,
        lineas,
        faltan,
        confirmacion: confirmacionDeConversion(p, ahora),
      };
    }
  }

  // Sin caja (ADR-0185): lo que dejó el último cierre, para que el modal «Abrir caja» pida contar el cajón.
  const fondoUltimoCierre = caja ? null : ((await getUltimoCierre(persona.ubicacionId))?.montoFondo ?? null);
  // «Prenda sin registrar» (ADR-0179): listas cerradas del modal. El uso de colores por categoría sale del mismo
  // catálogo que ya carga la caja (sin otra consulta): los usados en esa categoría se ofrecen primero.
  const categoriasLibre = resCategorias.data ?? [];
  const coloresLibre = (resColores.data ?? []).map((c) => ({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, familiaColor: c.familia_color ?? "" }));
  const listasPrendaLibre: ListasPrendaLibre = {
    categorias: categoriasLibre,
    tallas: [...(resTallas.data ?? [])].sort((a, b) => ordenTalla(a.valor, b.valor)),
    tallasPorCategoria: ejes?.tallas ?? {},
    colores: coloresLibre,
    usoColores: usoDeColores(variantes, categoriasLibre, coloresLibre),
  };

  return (
    <PuntoDeVenta
      // Otra proforma (u otra vez la misma tras soltarla) arranca un ticket nuevo: el carrito se arma al montar.
      key={proformaEnCobro?.id ?? "caja"}
      proforma={proformaEnCobro}
      avisoProforma={avisoProforma}
      ubicacionId={persona.ubicacionId}
      // Solo decide qué se muestra (el campo «Código» del descuento): la regla de quién
      // descuenta la aplica `registrar_venta` (20260914215103_codigos_descuento.sql).
      esLider={persona.rol === "lider"}
      puedeCerrarCaja={puede(persona, "gestionarCaja")}
      ubicacionEtiqueta={persona.ubicacionEtiqueta}
      cajaId={caja?.id ?? null}
      fondoUltimoCierre={fondoUltimoCierre}
      variantes={variantesParaVenta}
      listasPrendaLibre={listasPrendaLibre}
      campanasNoCargaron={campanasNoCargaron}
      ventasHoyNode={
        <Suspense fallback={<p className="px-1 py-4 text-center text-xs text-tinta/50">Cargando ventas de hoy…</p>}>
          <VentasDeHoy ubicacionId={persona.ubicacionId} ubicacionEtiqueta={persona.ubicacionEtiqueta} />
        </Suspense>
      }
    />
  );
}

/** `fn_ventas_del_dia` (0011_venta_con_comprobante.sql) ya trae ítems, vendedor y
 *  estado del comprobante — reemplaza el `select` a mano contra `ventas` de la
 *  versión V1. Se le pasa la ubicación siempre: aunque un Líder podría ver todas
 *  (parámetro null), en Vender importa lo que se vendió EN ESTA sede, no un
 *  consolidado — para eso está Facturación. */
async function VentasDeHoy({ ubicacionId, ubicacionEtiqueta }: { ubicacionId: string; ubicacionEtiqueta: string }) {
  const supabase = await createClient();
  const { datos: ventasHoy, fallo } = tolerar(
    await supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId }),
    "las ventas de hoy"
  );

  if (fallo) {
    return <p className="card-cayla border-rojo/30 px-4 py-4 text-center text-xs text-rojo-profundo">{fallo}</p>;
  }

  const ventas = ventasHoy ?? [];
  if (ventas.length === 0) {
    return (
      <p className="font-display card-cayla py-6 text-center text-sm text-tinta/60 italic">
        Aún no hay ventas hoy en {ubicacionEtiqueta}.
      </p>
    );
  }

  // Cada venta lleva la firma de la integrante que la hizo (primer nombre; inicial del
  // apellido solo si dos integrantes del día se llaman igual). `vendedor` vacío o el
  // relleno «—» de la RPC no es una integrante: no se pinta nada, no se inventa.
  const integrante = nombresCortos(ventas.map((v) => v.vendedor));

  return (
    <div className="card-cayla divide-y divide-sand !p-0">
      {/* `anim-revelar` sin `key` extra: React ya reutiliza el nodo de cada venta que
          repite `key={v.venta_id}` tras el `router.refresh()` (no vuelve a animarse),
          y monta uno nuevo —y por lo tanto SÍ anima— solo para la venta que se acaba
          de registrar. */}
      {ventas.map((v) => (
        <div key={v.venta_id} className="anim-revelar flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="text-tinta/60">{v.hora}</span>
          {integrante.has(v.vendedor) && (
            <span className="shrink-0 text-tinta" title={v.vendedor}>
              {integrante.get(v.vendedor)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-tinta/60">
            {v.comprobante_texto ?? "Sin comprobante"} {v.metodos_pago ? `· ${v.metodos_pago}` : ""}
          </span>
          {/* La nota de la venta («lo recoge el sábado…»), en la misma fila, truncada;
              el texto completo queda en `title`. Si la RPC no la trae —o producción aún no
              tiene la columna— no se pinta nada. */}
          {v.nota && (
            <span className="min-w-0 max-w-[16rem] truncate text-tinta/60 italic" title={v.nota}>
              {v.nota}
            </span>
          )}
          <span className="shrink-0 font-medium text-tinta">S/{Number(v.total).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
