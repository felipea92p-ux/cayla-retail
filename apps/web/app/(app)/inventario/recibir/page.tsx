import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getRecepcionesRecientes } from "@/lib/compras";
import { getResumenSinComprobante, listarRecepcionesSinComprobante } from "@/lib/compras-indicadores";
import { diaMes, diasEntreFechas, hoyLima } from "@/lib/fechas-lima";
import { nombreDelMes } from "@/lib/comprobantes-lista-reglas";
import { RecibirLotePanel } from "@/components/RecibirLotePanel";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";

// Ingreso sin comprobante (ADR-0104, maqueta 07). Fase UI 1 (2026-09-11): rediseño completo — ver
// `RecepcionFormV2.tsx` para el porqué no es una adaptación de la pantalla V1. 2026-09-17: lista de
// recepciones recientes + el formulario detrás de «+ Nueva recepción» (`RecibirLotePanel`).
//
// 2026-09-18: es la EXCEPCIÓN de recibir (mercadería que llegó sin su comprobante, muestras,
// obsequios) y las cifras de arriba controlan justo eso: cuánto entró sin respaldo este mes, cuánto
// de eso sin costo (una prenda sin costo distorsiona el margen: no entra al costo promedio) y cuándo
// fue la última vez. Es el único camino por donde puede entrar stock sin que quede deuda ni costo detrás.
export default async function RecibirLotePage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [proveedoresRes, catalogo, recepciones, resumen, conCosto] = await Promise.all([
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    getCatalogo(),
    getRecepcionesRecientes({ conFactura: false, limite: 20 }),
    getResumenSinComprobante(),
    listarRecepcionesSinComprobante({ limite: 20 }),
  ]);
  const proveedores = exigir(proveedoresRes, "el directorio de proveedores");
  const costos = Object.fromEntries(conCosto.map((r) => [r.loteId, { costo: r.costoUnitarioPromedio, sinCosto: r.sinCosto }]));

  const hoy = hoyLima();
  const ultima = resumen.ultimaRecepcion ? hoyLima(new Date(resumen.ultimaRecepcion)) : null;
  const haceDias = ultima ? diasEntreFechas(ultima, hoy) : null;

  const indicadores = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <TarjetaCifra compacta punto="neutro" etiqueta="Unidades sin comprobante" valor={resumen.unidadesMes.toLocaleString("es-PE")}>
        {nombreDelMes(hoy)} · {resumen.recepcionesMes.toLocaleString("es-PE")} {resumen.recepcionesMes === 1 ? "recepción" : "recepciones"}
      </TarjetaCifra>
      <TarjetaCifra
        compacta
        punto={resumen.unidadesSinCostoMes > 0 ? "ambar" : "verde"}
        tono={resumen.unidadesSinCostoMes > 0 ? "text-ambar-profundo" : undefined}
        detalleTono={resumen.unidadesSinCostoMes > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
        etiqueta="Sin costo registrado"
        valor={resumen.unidadesSinCostoMes.toLocaleString("es-PE")}
        unidad={resumen.unidadesSinCostoMes === 1 ? "unidad" : "unidades"}
      >
        {resumen.unidadesSinCostoMes > 0 ? "Falta el costo · afecta el margen" : "Todo lo ingresado tiene costo"}
      </TarjetaCifra>
      {haceDias != null ? (
        <TarjetaCifra compacta punto="neutro" etiqueta="Última recepción" valor={haceDias === 0 ? "hoy" : `hace ${haceDias} ${haceDias === 1 ? "día" : "días"}`}>
          {diaMes(ultima)}
          {resumen.ultimaUbicacion ? ` · ${resumen.ultimaUbicacion}` : ""}
        </TarjetaCifra>
      ) : (
        <TarjetaCifra compacta vacia etiqueta="Última recepción" valor="—">
          Todavía no hay ingresos sin comprobante
        </TarjetaCifra>
      )}
    </div>
  );

  return (
    <RecibirLotePanel
      ubicacionId={persona.ubicacionId}
      ubicacionEtiqueta={persona.ubicacionEtiqueta}
      esLider={persona.rol === "lider"}
      variantes={catalogo
        .filter((v) => v.activo)
        .map((v) => ({
          varianteId: v.varianteId,
          sku: v.sku,
          referencia: v.referencia,
          talla: v.talla,
          color: v.color,
        }))}
      proveedores={proveedores}
      recepciones={recepciones}
      costos={costos}
      indicadores={indicadores}
      aviso={
        proveedores.length === 0
          ? "Todavía no hay proveedores registrados — no se puede recibir un lote sin uno."
          : catalogo.length === 0
            ? "Todavía no hay productos en el catálogo — revisa Productos primero."
            : undefined
      }
    />
  );
}
