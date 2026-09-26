import Link from "next/link";
import { Info } from "lucide-react";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladosDeLaSede, type TrasladoResumen } from "@/lib/traslados";
import { horaLima } from "@/lib/traslados-reglas";
import { TrasladosPanel } from "@/components/TrasladosPanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

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
  const { enCurso, cerrados, vacios, cerradosLeidos } = await getTrasladosDeLaSede(persona.ubicacionId, LIMITE_CERRADOS);
  const puedeAjustar = puede(persona, "ajustarInventario");
  // Las dos lecturas corren en paralelo y son dos fotos de la base: un traslado que se cerró entre ellas
  // podría salir en ambas. Gana la de «cerrados», que es la más nueva — y así nunca hay dos filas iguales.
  const porId = new Map<string, TrasladoResumen>();
  for (const t of [...enCurso, ...cerrados]) porId.set(t.id, t);
  // Un solo «ahora» para toda la pantalla, fijado acá en el servidor: el navegador lo recibe y no vuelve a
  // mirar el reloj, así lo que dice el HTML del servidor y lo que dice el navegador no puede diferir.
  const ahoraIso = new Date().toISOString();

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Traslados"
        subtitulo="Seguimos los traslados de inventario entrantes y salientes hasta que se confirme su recepción."
        pie={
          <Link href="/inventario/mover" className="btn-cayla btn-primario">
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
        puedeCerrarDiferencia={puedeAjustar}
        ahoraIso={ahoraIso}
        horaCarga={horaLima(ahoraIso)}
        cerradosAcotados={cerradosLeidos >= LIMITE_CERRADOS}
        // Los traslados sin prendas (cabeceras vacías de la limpieza de datos) no se muestran; se le avisa solo a
        // quien puede ajustar inventario, que es quien podría hacer algo con ellos.
        vacios={puedeAjustar ? vacios : 0}
      />

      {/* Ayuda operativa, secundaria a propósito. Dice lo que de verdad pasa: con diferencia, NADA entra al
          stock hasta que un líder cierra el traslado (`confirmar_traslado` / `cerrar_traslado_con_diferencia`). */}
      <aside className="nota-cayla flex items-start gap-3">
        <Info aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
        <div>
          <p className="font-semibold text-tinta">El stock solo ingresa a la tienda cuando confirmas la recepción.</p>
          <p className="mt-0.5">
            Cuenta lo que llegó: si coincide con lo enviado, entra al instante. Si no, el traslado queda «con diferencia» y nada entra al stock hasta que un líder lo
            revise y lo cierre.
          </p>
        </div>
      </aside>
    </div>
  );
}
