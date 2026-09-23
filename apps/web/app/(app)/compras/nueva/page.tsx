import Link from "next/link";
import { exigirModulo } from "@/lib/persona-actual";
import { getCatalogo, getCostosVariantes } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getResumenCompras } from "@/lib/compras";
import { getMarcasPorProveedor, getProveedores } from "@/lib/proveedores";
import { repartoDisponible } from "@/lib/compras-reparto";
import { datosPagoDe } from "@/lib/proveedores-reglas";
import { CompraFormV2 } from "@/components/CompraFormV2";

// Registrar una factura de proveedor (ADR-0035). La página solo junta los
// tres catálogos que el formulario necesita; las reglas (contado exige pago,
// crédito exige vencimiento, la misma factura no se registra dos veces)
// viven en la RPC `registrar_compra`.
export default async function NuevaCompraPage({ searchParams }: { searchParams: Promise<{ prov?: string }> }) {
  const persona = await exigirModulo("facturas_compra"); // 20260923130000: registrar es del módulo Facturas de compra
  // ADR-0179 (F5): un comprador de tienda registra con SU tienda como gestora (el backend lo exige: la gestora tiene
  // que tener parte en el reparto). `tiendasCompra` son las tiendas donde compra (su tienda más las extra
  // de `compradores_de_tienda`), que pueden no ser solo la sede donde está parado.
  const esComprador = persona.rol !== "lider";
  const { prov } = await searchParams;
  // El costo ya no viaja en el catálogo compartido (20260923193700): se pide aparte. Este módulo es de quien ve el dinero.
  const [directorio, ubicaciones, catalogo, costos, resumen, hayReparto, marcas] = await Promise.all([getProveedores(), getUbicaciones(), getCatalogo(), getCostosVariantes(), getResumenCompras(), repartoDisponible(), getMarcasPorProveedor()]);
  // Solo los activos; con su plazo, forma de pago y saldo (lo financiero es de líder, y esta pantalla también) y con
  // cómo se les paga (cuenta, CCI, Yape/Plin, titular: ADR-0134), que sale del mismo directorio, sin otra consulta.
  // Y con sus marcas (ADR-0140): el nombre es la razón social, pero se les busca por la marca; opcional (`null` → sin marcas).
  const proveedores = directorio
    .filter((p) => p.activo)
    .map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc, marcas: marcas?.[p.id] ?? [], plazoCreditoDias: p.plazo_credito_dias, formaPagoPreferida: p.forma_pago_preferida, saldo: p.saldo, saldoFavor: p.saldo_favor, datosPago: datosPagoDe(p, p.saldo_favor ?? 0) }));

  // Cabecera del diseño: «← Comprobantes», título y bajada. La entrega el formulario junto al avance «Listo N de 4».
  const cabecera = (
    <div>
      <Link href="/compras" className="label-cayla mb-4 inline-flex items-center gap-1.5 text-[11px] text-tinta/65 transition-[color,transform] duration-300 hover:-translate-x-0.5 hover:text-rojo">
        <span aria-hidden>←</span> Comprobantes
      </Link>
      <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
      <h1 className="font-display mt-1 text-2xl text-tinta">Registrar comprobante</h1>
      <p className="mt-1 text-sm text-tinta/65">
        Lo que se compró queda aquí; la recepción y el pago se anotan contra él. Copia el documento tal cual llegó: lo que el proveedor no desglosó por talla y color se reparte al recibir.
      </p>
    </div>
  );

  // Sin proveedores o sin catálogo no hay formulario que armar: se muestra la cabecera y el motivo.
  if (proveedores.length === 0 || catalogo.length === 0) {
    return (
      <div className="space-y-6">
        {cabecera}
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {proveedores.length === 0 ? "Todavía no hay proveedores registrados — no se puede registrar un comprobante sin uno." : "Todavía no hay productos en el catálogo — revisa Productos primero."}
        </p>
      </div>
    );
  }

  return (
    <CompraFormV2
      cabecera={cabecera}
      proveedores={proveedores}
      proveedorInicialId={prov && /^[0-9a-f-]{36}$/i.test(prov) ? prov : null}
      deudaTotal={resumen.deuda}
      ubicaciones={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))}
      // ADR-0139: solo se ofrece «Repartir entre tiendas» si esta base ya tiene el reparto (una base vieja ignoraría `destinos`).
      repartoDisponible={hayReparto}
      // ADR-0179: solo para un comprador — el líder gestiona con cualquier tienda (`undefined` es «sin restricción»,
      // el comportamiento de siempre). Si el comprador de alguna razón no tiene ninguna (no debería pasar: el layout
      // ya lo exige), cae a la lista completa para no dejarlo sin poder elegir nada.
      misTiendas={esComprador && persona.tiendasCompra.length > 0 ? persona.tiendasCompra : undefined}
      ubicacionInicialId={esComprador ? (persona.tiendasCompra[0]?.id ?? persona.ubicacionId) : persona.ubicacionId}
      variantes={catalogo
        .filter((v) => v.activo)
        .map((v) => ({
          varianteId: v.varianteId,
          sku: v.sku,
          talla: v.talla,
          color: v.color,
          productoId: v.productoId,
          referencia: v.referencia,
          costo: costos?.get(v.varianteId) ?? 0,
        }))}
    />
  );
}
