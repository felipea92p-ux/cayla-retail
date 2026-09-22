import Link from "next/link";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoAbierto, getConteosResumen, getPrevisualizacionCierre, getPrioridadConteo } from "@/lib/conteos";
import { avanceConteo, exactitudConteos, resumirVarianza, tonoExactitud } from "@/lib/conteo-varianza";
import { getCatalogo, getEjesPorCategoria } from "@/lib/catalogo-v2";
import { getSububicaciones } from "@/lib/sububicaciones";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ConteoPanel } from "@/components/ConteoPanel";
import { getCatalogoMarcas } from "@/lib/marcas-datos";
import { ConteosLista } from "@/components/ConteosLista";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

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
  const [conteoAbierto, conteos, catalogo, sububicaciones, categorias, prioridad, colores, ejes, catalogoMarcas] = await Promise.all([
    getConteoAbierto(persona.ubicacionId),
    getConteosResumen(persona.ubicacionId),
    getCatalogo(),
    getSububicaciones(persona.ubicacionId),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    getPrioridadConteo(persona.ubicacionId),
    supabase.from("colores").select("codigo, nombre").eq("activo", true).order("orden"),
    getEjesPorCategoria(),
    getCatalogoMarcas(),
  ]);
  const categoriasOpciones = exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }));
  const coloresOpciones = exigir(colores, "los colores").map((c) => ({ codigo: c.codigo, nombre: c.nombre }));

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
    <div>
      <InventarioHero
        eyebrow={`Inventario · Conteo · ${persona.ubicacionEtiqueta}`}
        titulo="Conteo físico"
        descripcion="Compara lo que dice el sistema contra lo que hay de verdad en la tienda. Se cuenta a ciegas: el sistema no muestra su cifra hasta revisar."
        foto={fotoHeroPorPantalla("conteo")}
        variante="integrado"
      />

      {/* `mt-5` (20px) solo para el hueco hero→tarjetas (pedido de Felipe: 16-20px, no los 24px de
          costumbre); de acá para abajo todo sigue en su propio `space-y-6`, sin tocar. */}
      <div className="mt-5 space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tarjeta
            etiqueta="Exactitud del inventario"
            valor={exactitud ? `${exactitud.porcentaje.toLocaleString("es-PE")} %` : "—"}
            tono={exactitud ? tonoExactitud(exactitud.porcentaje) : undefined}
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
            puedeCerrar={puede(persona, "ajustarInventario")}
            puedeCrearMarcas={puede(persona, "editarCatalogo")}
            conteoAbierto={conteoAbierto}
            avance={avance}
            sububicaciones={sububicaciones}
            categorias={categoriasOpciones}
            prioridad={prioridad}
            colores={coloresOpciones}
            tallasPorCategoria={ejes.tallas}
            marcas={catalogoMarcas}
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
        // <a> nativo a propósito, no <Link>: es un salto de ancla dentro de
        // la misma página (#contar) — el <Link> de Next no siempre dispara
        // el scroll nativo del navegador para un href de solo-hash en la
        // misma ruta, y con <a> no hay ambigüedad posible.
        <a href={accion.href} className="label-cayla mt-3 inline-block text-[11px] text-tinta underline underline-offset-2 hover:no-underline">
          {accion.texto} →
        </a>
      )}
    </div>
  );
}
