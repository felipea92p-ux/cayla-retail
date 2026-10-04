import Link from "next/link";
import { Info } from "lucide-react";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladosDeLaSede, type TrasladoResumen } from "@/lib/traslados";
import { horaLima, RUTA_NUEVO_TRASLADO } from "@/lib/traslados-reglas";
import { TrasladosPanel } from "@/components/TrasladosPanel";
import { PedidosEntreSedes } from "@/components/PedidosEntreSedes";
import { getPedidosEntreSedes } from "@/lib/pedidos-entre-sedes";
import { hayPedidosQueMostrar } from "@/lib/pedidos-entre-sedes-reglas";
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
  // «Pedir a otra sede» (ADR-0242 D-7) se lee en paralelo y es secundario: si falla, la tarjeta no aparece y la lista sigue.
  const [{ enCurso, cerrados, vacios, cerradosLeidos }, pedidos] = await Promise.all([
    getTrasladosDeLaSede(persona.ubicacionId, LIMITE_CERRADOS),
    getPedidosEntreSedes(persona.ubicacionId),
  ]);
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
        subtitulo="Lo que viene hacia tu sede y lo que sale de ella, hasta que la otra sede lo recibe."
        acciones={
          <Link href={RUTA_NUEVO_TRASLADO} className="btn-cayla btn-primario">
            + Nuevo traslado
          </Link>
        }
      />

      {/* Pedidos de reposición entre tiendas (ADR-0242 D-7), de la sede activa. Solo si hay algo: nunca una tarjeta vacía.
          Lugar provisional hasta la bandeja «Hoy te toca» (tanda 2). */}
      {hayPedidosQueMostrar(pedidos) && (
        <PedidosEntreSedes
          key={`pedidos-${persona.ubicacionId}`}
          pedidos={pedidos}
          ubicacion={{ ubicacionId: persona.ubicacionId, etiqueta: persona.ubicacionEtiqueta }}
        />
      )}

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

      {/* Ayuda operativa, secundaria a propósito. Dice lo que de verdad pasa desde ADR-0239 (D-129): al confirmar entra
          cada prenda que coincide; solo la que no cuadra espera al líder (`confirmar_traslado` /
          `cerrar_traslado_con_diferencia`). */}
      <aside className="nota-cayla flex items-start gap-3">
        <Info aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
        <div>
          <p className="font-semibold text-tinta">Las prendas entran a tu tienda cuando cuentas y confirmas lo que llegó.</p>
          <p className="mt-0.5">
            Lo que coincide con lo enviado entra al instante. Si una prenda no cuadra, solo esa espera a que un líder la revise y cierre el traslado; el resto ya
            está en tu stock.
          </p>
        </div>
      </aside>
    </div>
  );
}
