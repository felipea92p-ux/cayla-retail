import { redirect } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { POR_PAGINA_POR_REVISAR, getProductosPorRevisar } from "@/lib/revisar-productos-datos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { PaginacionPaginas } from "@/components/Paginacion";
import { PorRevisarLista } from "@/components/PorRevisarLista";

// «Por revisar» (ADR-0371, Felipe 2026-10-10): la cola de prendas que alguien propuso sin editar el catálogo —el conteo (`censo_crear_variante`)
// y el «Modelo nuevo» de la orden de producción del Taller (ADR-0361)— para que un líder las apruebe o las rechace. Existía la función de la
// base (`revisar_producto_censo`) pero ninguna pantalla la llamaba desde que el aviso de Editar producto se quitó el 2026-10-02 («no me
// sirve»): por eso esto es una VISTA de Productos, no un aviso en la ficha. No es un módulo aparte (ADR-0306): quien ve Productos y edita
// el catálogo la ve, igual que la base lo exige.
export default async function PorRevisarPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const persona = await requirePersonaActualV2();
  // Quien no edita el catálogo no tiene nada que revisar aquí: vuelve a la lista (el candado real es de la base).
  if (!puede(persona, "editarCatalogo")) redirect("/productos");

  const { pagina: paginaTexto } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(paginaTexto ?? "1", 10) || 1);
  const res = await getProductosPorRevisar(pagina);

  // Una página que ya no existe (se revisó lo último de la 2): a la primera, como Productos.
  if (res.estado === "ok" && res.productos.length === 0 && pagina > 1) redirect("/productos/por-revisar");

  const total = res.estado === "ok" ? res.total : 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_POR_REVISAR));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        volver={<Volver href="/productos" a="Productos" />}
        titulo="Por revisar"
        subtitulo="Prendas que alguien propuso en un conteo o desde el Taller. Aprueba las que están bien y rechaza las que se crearon por error."
        pie={
          res.estado === "ok" && total > 0 ? (
            <Chip tono="ambar" versalitas={false}>
              {total === 1 ? "1 prenda por revisar" : `${total.toLocaleString("es-PE")} prendas por revisar`}
            </Chip>
          ) : undefined
        }
      />

      {res.estado === "sin_funcion" && (
        <Aviso tono="atencion" titulo="Esta vista todavía no está activa en la base de datos">
          Falta aplicar la migración <span className="font-mono text-[13px]">20261010170000_revisar_productos_pendientes.sql</span> en producción. Hasta entonces las prendas
          propuestas siguen funcionando igual; solo no se pueden revisar desde aquí.
        </Aviso>
      )}

      {res.estado === "error" && (
        <Aviso tono="error" titulo="No se pudo leer las prendas por revisar" enfocable>
          Recarga la pantalla; si sigue igual, avisa a Felipe. ({res.mensaje})
        </Aviso>
      )}

      {res.estado === "ok" && res.productos.length === 0 && (
        <div className="card-cayla">
          <Vacio
            icono={<CheckCheck />}
            titulo="No hay prendas por revisar"
            acciones={
              <BotonEnlace href="/productos" peso="primario">
                Ir a Productos
              </BotonEnlace>
            }
          >
            Las prendas que se propongan en un conteo o desde el Taller aparecen aquí hasta que las apruebes o las rechaces.
          </Vacio>
        </div>
      )}

      {res.estado === "ok" && res.productos.length > 0 && (
        <>
          <PorRevisarLista
            productos={res.productos}
            ahoraIso={new Date().toISOString()}
            veProduccion={veModulo(persona, "produccion")}
            veExistencias={veModulo(persona, "existencias")}
          />
          <PaginacionPaginas
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItems={total}
            params={{ pagina: undefined }}
            pathname="/productos/por-revisar"
            sustantivo={["prenda", "prendas"]}
          />
        </>
      )}

      <p className="nota-cayla">
        Una prenda queda «por revisar» cuando la crea alguien que no edita el catálogo. Mientras tanto se puede contar y vender como cualquier otra.
        Rechazar es permanente: la prenda queda descontinuada y no se reactiva (si solo quieres sacarla de venta por ahora, descontínuala en su ficha).
      </p>
    </div>
  );
}
