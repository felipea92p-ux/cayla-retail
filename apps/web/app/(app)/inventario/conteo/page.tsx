import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoAbierto, getConteosResumen, getPrevisualizacionCierre, getPrioridadConteo } from "@/lib/conteos";
import { avanceConteo, exactitudConteos, resumirVarianza } from "@/lib/conteo-varianza";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getSububicaciones } from "@/lib/sububicaciones";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ConteoPanel } from "@/components/ConteoPanel";
import { ConteosLista } from "@/components/ConteosLista";

function soles(n: number) {
  return `${n < 0 ? "−" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Conteos físicos (Felipe, 2026-09-14): el backend (abrir_conteo,
// conteo_contar, cerrar_conteo) ya existía — esta es la pantalla que le
// faltaba. Piso/almacén (20260914210000_inventario_piso_almacen.sql): una
// ubicación que los separa exige elegir cuál se cuenta — `sububicaciones`
// llega para que `ConteoPanel` decida si ofrece ese selector o abre directo.
//
// Rediseñada el 2026-09-16 sobre el diseño de Felipe: tres cifras arriba
// (exactitud de los conteos cerrados, el conteo abierto con su avance, y la
// diferencia que ese conteo lleva acumulada), el panel de contar como
// siempre, y abajo el historial como tabla con resultado y responsables.
// Sin estado «por revisar» (decisión de Felipe): quien cuenta, cierra —
// un conteo está abierto o cerrado, nada más.
export default async function ConteoPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();
  const [conteoAbierto, conteos, catalogo, sububicaciones, categorias, prioridad] = await Promise.all([
    getConteoAbierto(persona.ubicacionId),
    getConteosResumen(persona.ubicacionId),
    getCatalogo(),
    getSububicaciones(persona.ubicacionId),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    getPrioridadConteo(persona.ubicacionId),
  ]);
  const categoriasOpciones = exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }));

  // El avance y la diferencia del conteo abierto salen de la misma vista
  // previa que usa «Revisar y cerrar» — una sola forma de calcularlos.
  const previsualizacion = conteoAbierto ? await getPrevisualizacionCierre(conteoAbierto.id) : [];
  const avance = conteoAbierto ? avanceConteo(previsualizacion) : null;
  const varianza = conteoAbierto
    ? resumirVarianza(
        previsualizacion.filter((f) => f.origen === "contado"),
        new Map(catalogo.map((v) => [v.varianteId, v.costo]))
      )
    : null;
  const lineasConDiferencia = varianza ? varianza.lineas.filter((l) => l.diferencia !== 0).length : 0;
  const exactitud = exactitudConteos(conteos);
  const ultimoCerrado = conteos.find((c) => c.estado === "cerrado") ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · Conteo · {persona.ubicacionEtiqueta}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Conteo físico</h1>
          <p className="mt-1 text-sm text-tinta/65">Compara lo que dice el sistema contra lo que hay de verdad en la tienda. Se cuenta a ciegas: el sistema no muestra su cifra hasta revisar.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta
          etiqueta="Exactitud del inventario"
          valor={exactitud ? `${exactitud.porcentaje.toLocaleString("es-PE")} %` : "—"}
          tono={exactitud ? (exactitud.porcentaje >= 98 ? "text-verde-profundo" : exactitud.porcentaje >= 95 ? "text-ambar-profundo" : "text-rojo-profundo") : undefined}
        >
          {exactitud
            ? `${exactitud.correctas} de ${exactitud.lineas} líneas coincidieron · ${exactitud.conteos} ${exactitud.conteos === 1 ? "conteo cerrado" : "conteos cerrados"}`
            : "Sin conteos cerrados todavía — el primero que se cierre estrena esta cifra"}
        </Tarjeta>
        <Tarjeta
          etiqueta="Conteo abierto"
          valor={conteoAbierto ? `Conteo ${conteoAbierto.numero}` : "Ninguno"}
          tono={conteoAbierto ? "text-tinta" : "text-tinta/55"}
          acento={!!conteoAbierto}
          accion={conteoAbierto ? { href: "#contar", texto: "Seguir contando" } : undefined}
        >
          {conteoAbierto && avance
            ? `${conteoAbierto.sububicacionNombre ?? "Toda la ubicación"}${
                conteoAbierto.alcance === "categoria" && conteoAbierto.alcanceCategoriaNombre ? ` · solo ${conteoAbierto.alcanceCategoriaNombre}` : ""
              } · ${avance.contadas} de ${avance.total} prendas contadas (${avance.porcentaje} %)`
            : "Abre uno abajo para empezar a contar"}
        </Tarjeta>
        <Tarjeta
          etiqueta={conteoAbierto ? "Diferencia hasta ahora" : "Último conteo cerrado"}
          valor={
            conteoAbierto && varianza
              ? soles(varianza.solesNeto)
              : ultimoCerrado
                ? soles(ultimoCerrado.solesDiferencia)
                : "—"
          }
          tono={
            conteoAbierto && varianza
              ? varianza.solesNeto < 0
                ? "text-rojo-profundo"
                : varianza.solesNeto > 0
                  ? "text-verde-profundo"
                  : "text-tinta"
              : ultimoCerrado
                ? ultimoCerrado.solesDiferencia < 0
                  ? "text-rojo-profundo"
                  : "text-tinta"
                : undefined
          }
        >
          {conteoAbierto && varianza
            ? lineasConDiferencia === 0
              ? "Todo lo contado coincide con el sistema"
              : `${lineasConDiferencia} ${lineasConDiferencia === 1 ? "prenda" : "prendas"} con diferencia · ${varianza.unidadesFaltantes} de menos · ${
                  varianza.unidadesSobrantes
                } de más · se ajusta al cerrar`
            : ultimoCerrado
              ? `Conteo ${ultimoCerrado.numero} · ${ultimoCerrado.lineasConDiferencia === 0 ? "sin diferencias" : `${ultimoCerrado.diferencia > 0 ? "+" : ""}${ultimoCerrado.diferencia} unidades`}`
              : "Sin conteos cerrados todavía"}
        </Tarjeta>
      </div>

      <div id="contar" className="scroll-mt-6">
        <ConteoPanel
          ubicacionId={persona.ubicacionId}
          esLider={persona.rol === "lider"}
          conteoAbierto={conteoAbierto}
          avance={avance}
          sububicaciones={sububicaciones}
          categorias={categoriasOpciones}
          prioridad={prioridad}
          catalogo={catalogo
            .filter((v) => v.activo)
            .map((v) => ({
              varianteId: v.varianteId,
              sku: v.sku,
              referencia: v.referencia,
              talla: v.talla,
              color: v.color,
              costo: v.costo,
              codigosBarras: v.codigosBarras,
            }))}
        />
      </div>

      {conteos.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Conteos de esta ubicación</p>
          <ConteosLista conteos={conteos} />
        </div>
      )}

      <p className="card-cayla px-5 py-3 text-xs text-tinta/65">
        <span className="text-tinta">Cómo se cuenta:</span> se escanea o se escribe el SKU y se anota lo que hay físicamente, sin ver la cifra del sistema. Al
        revisar, se ve la diferencia en unidades y en soles; al cerrar, el stock queda ajustado a lo contado y cada ajuste queda como movimiento.{" "}
        <Link href="/inventario/movimientos?proc=conteo" className="text-rojo hover:underline">
          Ver ajustes por conteo →
        </Link>
      </p>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  tono,
  acento = false,
  accion,
  children,
}: {
  etiqueta: string;
  valor: string;
  tono?: string;
  acento?: boolean;
  accion?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <div className={`card-cayla p-5 ${acento ? "border-l-2 border-l-rojo" : ""}`}>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className={`font-display mt-1 text-3xl tabular-nums ${tono ?? "text-tinta"}`}>{valor}</p>
      <p className="mt-1 text-xs text-tinta/65">{children}</p>
      {accion && (
        <Link href={accion.href} className="label-cayla mt-3 inline-block text-[11px] text-rojo underline-offset-2 hover:underline">
          {accion.texto} →
        </Link>
      )}
    </div>
  );
}
