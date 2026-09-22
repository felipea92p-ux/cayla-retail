import Link from "next/link";
import { Info } from "lucide-react";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladosDeLaSede, type TrasladoResumen } from "@/lib/traslados";
import { horaLima } from "@/lib/traslados-reglas";
import { TrasladosPanel } from "@/components/TrasladosPanel";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

// Traslados en dos fases (20260916150000): lo que antes era instantáneo
// (transferir()) ahora tiene un tramo intermedio que alguien tiene que poder
// ver — «qué está en camino, y qué me está esperando a mí para confirmar».
//
// Rediseñada el 2026-09-16 sobre el diseño de Felipe y otra vez el 2026-09-18
// (franja «Atención hoy», cuatro indicadores que filtran, buscador, columnas
// de contenido/llegada/estado/acción). Lo que ese diseño traía de otra empresa
// no entra: no hay «Almacén Central», ni guía SUNAT, ni courier, ni «red
// logística conectada» — cada envío es sede → sede y lo confirma quien recibe.
//
// Esta página solo TRAE datos y el «ahora»; todo lo que se decide (qué
// requiere acción, qué viene en camino, cuántas prendas están en tránsito) vive
// en `lib/traslados-reglas.ts`, con pruebas, y se comparte con el contador del
// menú. Ninguna regla de stock, recepción ni cierre cambia: eso sigue en las RPC.
const LIMITE_CERRADOS = 30;

export default async function TrasladosPage() {
  const persona = await requirePersonaActualV2();
  const { enCurso, cerrados } = await getTrasladosDeLaSede(persona.ubicacionId, LIMITE_CERRADOS);
  // Las dos lecturas corren en paralelo y son dos fotos de la base: un traslado que se cerró entre ellas
  // podría salir en ambas. Gana la de «cerrados», que es la más nueva — y así nunca hay dos filas iguales.
  const porId = new Map<string, TrasladoResumen>();
  for (const t of [...enCurso, ...cerrados]) porId.set(t.id, t);
  // Un solo «ahora» para toda la pantalla, fijado acá en el servidor: el navegador lo recibe y no vuelve a
  // mirar el reloj, así lo que dice el HTML del servidor y lo que dice el navegador no puede diferir.
  const ahoraIso = new Date().toISOString();

  return (
    <div className="space-y-5">
      <InventarioHero
        eyebrow="Inventario · Traslados"
        titulo="Traslados entre sedes"
        descripcion="Seguimos los traslados de inventario entrantes y salientes hasta que se confirme su recepción."
        foto={fotoHeroPorPantalla("traslados")}
        variante="integrado"
        accion={
          <Link href="/inventario/mover" className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema shadow-sm transition-colors hover:bg-rojo">
            + Nuevo traslado
          </Link>
        }
      />

      {/* `key` por sede: al cambiar de sede con el selector, los filtros y la búsqueda de la sede anterior no se
          arrastran (una sede elegida en «Más filtros» ni siquiera existiría en la nueva). */}
      <TrasladosPanel
        key={persona.ubicacionId}
        traslados={Array.from(porId.values())}
        miUbicacionId={persona.ubicacionId}
        puedeCerrarDiferencia={puede(persona, "ajustarInventario")}
        ahoraIso={ahoraIso}
        horaCarga={horaLima(ahoraIso)}
        cerradosAcotados={cerrados.length >= LIMITE_CERRADOS}
      />

      {/* Ayuda operativa, secundaria a propósito. Dice lo que de verdad pasa: con diferencia, NADA entra al
          stock hasta que un líder cierra el traslado (`confirmar_traslado` / `cerrar_traslado_con_diferencia`). */}
      <aside className="card-cayla flex items-start gap-3 px-5 py-3.5">
        <Info aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-tinta/50" />
        <div className="text-xs text-tinta/65">
          <p className="text-sm text-tinta">El stock solo ingresa a la tienda cuando confirmas la recepción.</p>
          <p className="mt-0.5">
            Al recibir, revisa que lo enviado coincida con lo que llegó. Si hay diferencia, regístrala: el traslado queda «con diferencia» y las prendas entran al stock cuando un
            líder lo cierra.
          </p>
        </div>
      </aside>
    </div>
  );
}
