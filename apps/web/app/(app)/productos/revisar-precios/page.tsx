import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { puede, requirePersonaActualV2, veCostoDePrendaDe } from "@/lib/persona-actual";
import { getPreciosARevisar } from "@/lib/revisar-precios-datos";
import { filtroDeUrl, POR_PAGINA_PRECIOS } from "@/lib/revisar-precios-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { PaginacionPaginas } from "@/components/Paginacion";
import { RevisarPreciosCifras, RevisarPreciosTabla } from "@/components/RevisarPreciosLista";

// «Revisar precios» (ADR-0641, Felipe 2026-11-10): las prendas cuyo precio conviene mirar —pierden dinero, ganan menos de 30 %, están
// lejos del precio de sus parecidas o no tienen costo propio—, con una cuenta fija de la base (sin IA, gratis). Es una VISTA de Productos,
// no un módulo aparte (ADR-0306): quien ve Productos y edita el catálogo la ve. La propuesta de la IA y aplicar un precio van en cada fila.
export default async function RevisarPreciosPage({ searchParams }: { searchParams: Promise<{ motivo?: string; pagina?: string }> }) {
  const persona = await requirePersonaActualV2();
  // Quien no edita el catálogo no puede cambiar un precio, y quien no ve el costo de la prenda (ADR-0668) no puede revisar su precio: vuelve a la lista.
  if (!puede(persona, "editarCatalogo") || !veCostoDePrendaDe(persona)) redirect("/productos");

  const { motivo, pagina: paginaTexto } = await searchParams;
  const filtro = filtroDeUrl(motivo);
  const pagina = Math.max(1, Number.parseInt(paginaTexto ?? "1", 10) || 1);
  const res = await getPreciosARevisar(filtro, pagina);

  // Una página que ya no existe: a la primera, con el mismo filtro.
  if (res.estado === "ok" && res.prendas.length === 0 && pagina > 1) redirect(`/productos/revisar-precios${filtro ? `?motivo=${filtro}` : ""}`);
  // Un filtro sin prendas no trae filas, y las cuentas viajan en las filas: se leen de la lista entera para que las cifras no digan «0».
  let cuentas = res.estado === "ok" ? res.cuentas : null;
  if (res.estado === "ok" && res.prendas.length === 0 && filtro) {
    const todas = await getPreciosARevisar(null, 1);
    if (todas.estado === "ok") cuentas = todas.cuentas;
  }

  const total = res.estado === "ok" ? res.total : 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_PRECIOS));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        volver={<Volver href="/productos" a="Productos" />}
        titulo="Revisar precios"
        subtitulo="Las prendas cuyo precio conviene mirar, con su costo y el precio de sus parecidas."
        ayuda={
          <>
            <span className="block">La lista la arma una cuenta fija, sin IA: pierden dinero o ganan menos de 30 % con su costo real, están 35 % más caras o más baratas que el precio del medio de su categoría, o no tienen costo propio.</span>
            <span className="mt-2 block">Las bolsas y el empaque no entran: su precio no se compara con la ropa.</span>
          </>
        }
      />

      {res.estado === "sin_funcion" && (
        <Aviso tono="atencion" titulo="Esta vista todavía no está activa en la base de datos" guia="revisar-precios.sin-funcion">
          Falta aplicar la migración <span className="font-mono text-xs">20261110203000_precio_propuesto_con_ia.sql</span> en producción.
        </Aviso>
      )}

      {res.estado === "error" && (
        <Aviso tono="error" titulo="No se pudo leer los precios a revisar" enfocable>
          Recarga la pantalla; si sigue igual, avisa a Felipe. ({res.mensaje})
        </Aviso>
      )}

      {cuentas && <RevisarPreciosCifras cuentas={cuentas} filtro={filtro} />}

      {res.estado === "ok" && res.prendas.length === 0 && (
        <div className="card-cayla" data-guia="revisar-precios.vacio">
          <Vacio
            icono={<BadgeCheck />}
            titulo={filtro ? "Ninguna prenda con ese filtro" : "Todos los precios se ven bien"}
            acciones={
              <BotonEnlace href={filtro ? "/productos/revisar-precios" : "/productos"} peso="primario" /* unificar-fijo: la acción de un vacío (ronda 5): ahí, ir a otra pantalla es el paso principal */>
                {filtro ? "Ver todas" : "Ir a Productos"}
              </BotonEnlace>
            }
          >
            {filtro ? "Toca otra cifra o mira todas las prendas de la lista." : "Ninguna prenda pierde dinero, gana menos de 30 % ni está lejos del precio de sus parecidas."}
          </Vacio>
        </div>
      )}

      {res.estado === "ok" && res.prendas.length > 0 && (
        <>
          <RevisarPreciosTabla prendas={res.prendas} />
          <div data-guia="revisar-precios.paginas">
            <PaginacionPaginas
              pagina={pagina}
              totalPaginas={totalPaginas}
              totalItems={total}
              params={{ motivo: filtro ?? undefined, pagina: undefined }}
              pathname="/productos/revisar-precios"
              sustantivo={["prenda", "prendas"]}
            />
          </div>
        </>
      )}

      <p className="nota-cayla" data-guia="revisar-precios.nota">
        «Pierde dinero» y «margen bajo» usan el costo real de la prenda; sin costo propio, el de su categoría.
      </p>
    </div>
  );
}
