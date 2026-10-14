"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorSmartphone, SearchX } from "lucide-react";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla } from "@/components/ui/Casilla";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { VitrinaLoteHoja, type ModoLote } from "@/components/vitrina/VitrinaLoteHoja";
import { VitrinaModeloHoja } from "@/components/vitrina/VitrinaModeloHoja";
import {
  cifrasDe,
  coloresSinFoto,
  diferenciaCorta,
  filtrarVitrina,
  margenSinIgv,
  MARGEN_BAJO,
  precioConCampana,
  stockEnTiendas,
  type FiltroVitrina,
  type LecturaVitrina,
  type ModeloVitrina,
} from "@/lib/vitrina-reglas";
import { soles } from "@/lib/precio-sede-reglas";


type Abierta = { id: string; encender: boolean };

/**
 * Catálogo ▸ Vitrina web (ADR-0408, actividad 3; maqueta v4, «vitrina»): todos los modelos que se pueden vender, con su precio web,
 * su stock libre en cada tienda y si se ven en la web. Tocar un modelo abre su hoja (precio web, Lo nuevo y lo que ve el cliente);
 * encender el interruptor de uno que nunca estuvo abre esa hoja para fijar su precio (el precio web nace al encenderlo); apagarlo
 * pide confirmar. Marcar varios abre el lote: cambiar el precio web, mostrar u ocultar. Toda escritura pasa por una hoja con el combo
 * «Responsable» (ADR-0162).
 */
export function VitrinaPantalla({ lectura }: { lectura: LecturaVitrina }) {
  const router = useRouter();
  const [modelos, setModelos] = useState(lectura.modelos);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState(lectura.modelos);
  if (deServidor !== lectura.modelos) {
    setDeServidor(lectura.modelos);
    setModelos(lectura.modelos);
  }
  const [filtro, setFiltro] = useState<FiltroVitrina>("todos");
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [lote, setLote] = useState<{ modo: ModoLote; ids: string[] } | null>(null);

  const { veCostos, tiendas } = lectura;
  const cifras = cifrasDe(modelos);
  const visibles = filtrarVitrina(modelos, filtro, texto);
  const elegidosVisibles = visibles.filter((m) => elegidos.includes(m.id));
  // En el celular la fila es una tarjeta: casilla, modelo e interruptor arriba y el precio bajo el nombre; desde `sm`, columnas.
  const plantilla = veCostos
    ? "grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_10.5rem_4.5rem] lg:grid-cols-[1.5rem_minmax(0,1fr)_10.5rem_4.5rem_10rem_4.5rem]"
    : "grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_10.5rem_4.5rem] lg:grid-cols-[1.5rem_minmax(0,1fr)_10.5rem_10rem_4.5rem]";
  const modeloAbierto = abierta ? modelos.find((m) => m.id === abierta.id) ?? null : null;
  const delLote = lote ? modelos.filter((m) => lote.ids.includes(m.id)) : [];

  const alternarFiltro = (f: FiltroVitrina) => setFiltro((actual) => (actual === f ? "todos" : f));
  const alternar = (id: string) => setElegidos((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const todosMarcados = visibles.length > 0 && elegidosVisibles.length === visibles.length;

  const actualizar = (nuevo: ModeloVitrina) => {
    setModelos((ms) => ms.map((m) => (m.id === nuevo.id ? nuevo : m)));
    router.refresh();
  };

  // El interruptor: encender abre la hoja para fijar el precio web; apagar pide confirmar (con quién lo hace).
  const alInterruptor = (m: ModeloVitrina) => {
    if (m.vitrina?.publicado) setLote({ modo: "ocultar", ids: [m.id] });
    else setAbierta({ id: m.id, encender: true });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2" data-guia="vitrina.cifras">
        <TarjetaCifra
          punto="verde"
          etiqueta="Se ven en la web"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.seVen} alMontar />}
          activa={filtro === "en_la_web"}
          onClick={() => alternarFiltro("en_la_web")}
        >
          {`de ${cifras.total} ${cifras.total === 1 ? "modelo" : "modelos"}`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinStock > 0 ? "ambar" : "neutro"}
          etiqueta="Sin stock en ninguna tienda"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.sinStock} alMontar />}
          activa={filtro === "sin_stock"}
          onClick={() => alternarFiltro("sin_stock")}
        >
          {cifras.sinStock > 0 ? "Se ven, pero no hay qué separar" : "Todos los que se ven tienen algo"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla space-y-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
          <div className="min-w-[14rem] flex-1">
            <Buscador
              valor={texto}
              onCambio={setTexto}
              atajo
              guia="vitrina.buscador"
              placeholder="Busca un modelo"
              conteo={texto.trim() ? `${visibles.length} ${visibles.length === 1 ? "coincide" : "coinciden"}` : undefined}
            />
          </div>
          <p className="min-w-[12rem] flex-1 text-[13px] text-taupe" data-guia="vitrina.ayuda">
            Toca un modelo para cambiar su precio web o Lo nuevo. Marca varios para cambiarlos juntos.
          </p>
        </div>

        {visibles.length === 0 ? (
          texto.trim() ? (
            <Vacio icono={<SearchX />} titulo={`Nada coincide con «${texto.trim()}»`} acciones={<Boton onClick={() => setTexto("")}>Borrar la búsqueda</Boton>}>
              Busca por el nombre del modelo, su código o su categoría.
            </Vacio>
          ) : modelos.length === 0 ? (
            <Vacio icono={<MonitorSmartphone />} titulo="Todavía no hay modelos para la web">
              Los modelos que se pueden vender (activos y con alguna talla) aparecen aquí para mostrarlos en la tienda online.
            </Vacio>
          ) : (
            <Vacio icono={<MonitorSmartphone />} tamano="chico">
              {filtro === "sin_stock" ? "Todos los modelos que se ven en la web tienen algo en alguna tienda." : "Ningún modelo se ve en la web todavía."}
            </Vacio>
          )
        ) : (
          <Tabla className="rounded-none border-0 shadow-none" guia="vitrina.lista">
            <Encabezado
              plantilla={plantilla}
              columnas={[
                {
                  titulo: (
                    <Casilla
                      marcada={todosMarcados}
                      aMedias={!todosMarcados && elegidosVisibles.length > 0}
                      onCambio={() =>
                        setElegidos((ids) =>
                          todosMarcados ? ids.filter((id) => !visibles.some((m) => m.id === id)) : [...new Set([...ids, ...visibles.map((m) => m.id)])],
                        )
                      }
                      etiqueta={todosMarcados ? "Quitar todos los de la lista" : "Elegir todos los de la lista"}
                    />
                  ),
                },
                { titulo: "Modelo" },
                { titulo: "Precio web", alinear: "der" },
                ...(veCostos ? [{ titulo: "Margen", alinear: "der" as const, desdeLg: true, ayuda: "Del precio que paga el cliente (con la campaña, si hay), sin IGV" }] : []),
                { titulo: "Libre en tiendas", desdeLg: true },
                { titulo: "En la web", alinear: "der" },
              ]}
            />
            {visibles.map((m) => (
              <FilaModelo
                key={m.id}
                modelo={m}
                plantilla={plantilla}
                veCostos={veCostos}
                tiendas={tiendas}
                elegido={elegidos.includes(m.id)}
                onElegir={() => alternar(m.id)}
                onAbrir={() => setAbierta({ id: m.id, encender: false })}
                onInterruptor={() => alInterruptor(m)}
              />
            ))}
          </Tabla>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="vitrina.nota">
        <p>
          El precio web vale para todas las tallas y colores del modelo. Las campañas se aplican sobre él con la misma regla de la caja. Las
          fotos, los colores y las tallas salen de su ficha en Catálogo ▸ Productos.
        </p>
      </div>

      {/* Lo elegido para el lote: abajo, pegado al borde, a la vista aunque la lista sea larga (la misma barra de «Pagar juntos»).
          El aire de abajo es para que no tape la última fila. */}
      {elegidos.length > 0 && <div aria-hidden className="h-20" />}
      <BarraFija
        visible={elegidos.length > 0}
        guia="vitrina.seleccion"
        resumen={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold text-tinta">
              {elegidos.length} {elegidos.length === 1 ? "modelo elegido" : "modelos elegidos"}
            </span>
            <button type="button" className="btn-enlace text-[13px]" data-guia="vitrina.desmarcar" onClick={() => setElegidos([])}>
              Desmarcar todos
            </button>
          </span>
        }
        acciones={
          <span className="flex flex-wrap items-center gap-2">
            <Boton type="button" aria-haspopup="dialog" data-guia="vitrina.lote-precio" onClick={() => setLote({ modo: "precio", ids: elegidos })}>
              Cambiar precio web
            </Boton>
            <Boton type="button" aria-haspopup="dialog" onClick={() => setLote({ modo: "ocultar", ids: elegidos })}>
              Ocultar
            </Boton>
            <Boton type="button" peso="primario" aria-haspopup="dialog" onClick={() => setLote({ modo: "mostrar", ids: elegidos })}>
              Mostrar en la web
            </Boton>
          </span>
        }
      />
      {modeloAbierto && (
        <VitrinaModeloHoja
          key={modeloAbierto.id}
          modelo={modeloAbierto}
          veCostos={veCostos}
          encender={abierta?.encender ?? false}
          onClose={() => setAbierta(null)}
          onGuardado={actualizar}
        />
      )}
      {lote && delLote.length > 0 && (
        <VitrinaLoteHoja
          modo={lote.modo}
          modelos={delLote}
          veCostos={veCostos}
          onClose={() => setLote(null)}
          onHecho={() => {
            setLote(null);
            setElegidos([]);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Una fila: la casilla para el lote, el modelo (que abre su hoja), el precio web, el margen (solo el líder), lo libre en cada tienda
 *  y el interruptor. La fila entera también abre la hoja con el mouse; la casilla y el interruptor no la disparan. */
function FilaModelo({
  modelo: m,
  plantilla,
  veCostos,
  tiendas,
  elegido,
  onElegir,
  onAbrir,
  onInterruptor,
}: {
  modelo: ModeloVitrina;
  plantilla: string;
  veCostos: boolean;
  tiendas: LecturaVitrina["tiendas"];
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
  onInterruptor: () => void;
}) {
  const v = m.vitrina;
  const publicado = Boolean(v?.publicado);
  const conCampana = v && m.campana ? precioConCampana(v.precioWeb, m.campana.pct) : null;
  const margen = veCostos && v ? margenSinIgv(conCampana ?? v.precioWeb, m.costo) : null;
  const sinFoto = coloresSinFoto(m);
  const frente = v ? diferenciaCorta(v.precioWeb, m.precioTienda) : null;
  return (
    <div
      role="row"
      onClick={(e) => {
        // Un clic que sube desde una hoja abierta (vive en un portal) o desde la casilla, el interruptor o el nombre no abre otra vez.
        if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest("a,button,input,label")) return;
        onAbrir();
      }}
      className={`${fila(plantilla, "cursor-pointer items-center sm:items-center")} ${elegido ? "bg-rojo/[0.045]" : ""}`}
    >
      <span data-guia="vitrina.casilla" className="row-span-2 pt-0.5 sm:row-span-1">
        <Casilla marcada={elegido} onCambio={onElegir} etiqueta={`Elegir ${m.nombre}`} />
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <MiniaturaPrenda
          fotoUrl={m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null}
          colorHex={m.colores[0]?.hex ?? null}
          tamano="md"
          prefijo={m.prefijo}
          familia={m.familia}
          categoria={m.categoria}
        />
        <span className="min-w-0">
          <button type="button" onClick={onAbrir} data-guia="vitrina.abrir" className="block max-w-full truncate text-left font-medium text-tinta hover:text-rojo-profundo">
            <span data-guia="vitrina.modelo">{m.nombre}</span>
          </button>
          <span className="block truncate text-[12px] text-taupe">
            {[m.categoria, `${m.colores.length} ${m.colores.length === 1 ? "color" : "colores"}`, sinFoto ? `${sinFoto} sin foto propia` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {(!m.publicable || v?.enLoNuevo !== "automatico" || m.campana) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {!m.publicable && <Chip tono="ambar">{publicado ? "Ya no se vende: no se ve" : "No se puede vender"}</Chip>}
              {v?.enLoNuevo === "fijo" && <Chip tono="verde">Fijado en Lo nuevo</Chip>}
              {v?.enLoNuevo === "quitado" && <Chip tono="neutro">Fuera de Lo nuevo</Chip>}
              {m.campana && (
                <Chip tono="pizarra">
                  −{m.campana.pct} % {m.campana.nombre}
                </Chip>
              )}
            </span>
          )}
        </span>
      </span>
      <span className="col-start-2 row-start-2 flex flex-col items-start tabular-nums sm:col-start-auto sm:row-start-auto sm:items-end sm:text-right">
        {v ? (
          <>
            <span className="whitespace-nowrap font-semibold text-tinta">{soles(v.precioWeb)}</span>
            {m.precioTienda !== null && (
              <span className="text-[12px] text-taupe">
                Tienda {soles(m.precioTienda)}
                {frente ? ` · ${frente}` : ""}
              </span>
            )}
            {conCampana !== null && (
              <span className="text-[12px] text-taupe">
                {m.campana?.todas ? "" : "desde "}
                {soles(conCampana)} con campaña
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-taupe">—</span>
            {m.precioTienda !== null && <span className="whitespace-nowrap text-[12px] text-taupe">Tienda {soles(m.precioTienda)}</span>}
          </>
        )}
      </span>
      {veCostos && (
        <span className={`hidden text-right tabular-nums lg:block ${margen !== null && margen < MARGEN_BAJO ? "text-ambar-profundo" : "text-tinta"}`}>
          {margen === null ? <span className="text-taupe">—</span> : `${Math.round(margen * 100)} %`}
        </span>
      )}
      <span className="hidden text-[13px] tabular-nums text-tinta lg:block">
        {stockEnTiendas(m, tiendas).map((s, i) => (
          <span key={s.sede} className={s.cantidad === 0 ? "text-tinta/40" : ""}>
            {i > 0 && <span className="text-taupe"> · </span>}
            {s.sede} {s.cantidad}
          </span>
        ))}
      </span>
      <span className="col-start-3 row-start-1 flex justify-end self-center sm:col-start-auto sm:row-start-auto" data-guia="vitrina.interruptor">
        <button
          type="button"
          role="switch" // unificar-fijo: la cara del interruptor del sistema en una fila de tabla; su título es la columna «En la web»
          aria-checked={publicado}
          aria-label={`${m.nombre} en la web`}
          onClick={onInterruptor}
          className="interruptor"
        >
          <span aria-hidden className="interruptor-perilla" />
        </button>
      </span>
    </div>
  );
}
