"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, MonitorSmartphone, SearchX } from "lucide-react";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla } from "@/components/ui/Casilla";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { MiniaturaPrenda, SinFoto } from "@/components/ui/PrendaCelda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { VitrinaLoteHoja } from "@/components/vitrina/VitrinaLoteHoja";
import { VitrinaModeloHoja } from "@/components/vitrina/VitrinaModeloHoja";
import {
  cifrasDe,
  coloresSinFoto,
  esEmpaque,
  filtrarVitrina,
  interruptorEncendido,
  razonNoSeMuestra,
  stockEnTiendas,
  type FiltroVitrina,
  type LecturaVitrina,
  type ModeloVitrina,
  type ModoLote,
} from "@/lib/vitrina-reglas";

// En el celular la fila es una tarjeta: casilla, modelo e interruptor arriba y lo libre en cada tienda bajo el nombre; desde `sm`,
// columnas.
const PLANTILLA = "grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_12rem_4.5rem]";

/**
 * Tienda web ▸ Vitrina (ADR-0408, actividad 3; maqueta v4, «vitrina»): todos los modelos que se pueden vender, con su stock libre en
 * cada tienda y si se ven en la web. No hay precio web: en la web cada modelo vale lo que vale en la tienda que el cliente elige (y con
 * «Todas», lo más que vale entre ellas). Tocar un modelo abre su hoja (mostrar, Lo nuevo y lo que ve el cliente); el interruptor de una
 * fila muestra u oculta ese modelo, y marcar varios abre la barra para mostrarlos u ocultarlos juntos. Toda escritura pasa por una hoja
 * con el combo «Responsable» (ADR-0162).
 */
export function VitrinaPantalla({ lectura, esperan }: { lectura: LecturaVitrina; /** Personas que esperan una talla (actividad 12); `null`: no se pudo leer. */ esperan: number | null }) {
  const router = useRouter();
  const [modelos, setModelos] = useState(lectura.modelos);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState(lectura.modelos);
  if (deServidor !== lectura.modelos) {
    setDeServidor(lectura.modelos);
    setModelos(lectura.modelos);
  }
  const [filtro, setFiltro] = useState<FiltroVitrina>("todos");
  // Cómo se ve la lista (ADR-0430): «Vitrina», las prendas en mosaico como las ve el cliente (de fábrica), o «Lista», la tabla de
  // siempre, más compacta para revisar muchas. Las dos hacen lo mismo: tocar abre su hoja, la casilla elige, el interruptor muestra.
  const [vista, setVista] = useState<"vitrina" | "lista">("vitrina");
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [lote, setLote] = useState<{ modo: ModoLote; ids: string[] } | null>(null);

  const { tiendas } = lectura;
  const cifras = cifrasDe(modelos);
  const visibles = filtrarVitrina(modelos, filtro, texto);
  const elegidosVisibles = visibles.filter((m) => elegidos.includes(m.id));
  const modeloAbierto = abierto ? modelos.find((m) => m.id === abierto) ?? null : null;
  const delLote = lote ? modelos.filter((m) => lote.ids.includes(m.id)) : [];

  const alternarFiltro = (f: FiltroVitrina) => setFiltro((actual) => (actual === f ? "todos" : f));
  const alternar = (id: string) => setElegidos((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const todosMarcados = visibles.length > 0 && elegidosVisibles.length === visibles.length;

  const actualizar = (nuevo: ModeloVitrina) => {
    setModelos((ms) => ms.map((m) => (m.id === nuevo.id ? nuevo : m)));
    router.refresh();
  };

  return (
    <div className="tw space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" data-guia="vitrina.cifras">
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
        {/* Lo que piden los clientes con «Avísame» (actividad 12, maqueta: «Esperan una talla · Tocaron «Avísame»»): lleva a su lista. */}
        <TarjetaCifra
          punto={esperan ? "ambar" : "neutro"}
          etiqueta="Esperan una talla"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={esperan === null ? null : <CifraQueCuenta valor={esperan} alMontar />}
          noSePudoLeer={esperan === null}
          href="/tienda-web/vitrina/esperan"
        >
          {esperan === null ? "No se pudo leer: entra para volver a intentar" : esperan === 1 ? "Persona que tocó «Avísame»" : "Personas que tocaron «Avísame»"}
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
            Toca un modelo para ver lo que ve el cliente o cambiar Lo nuevo. Marca varios para mostrarlos u ocultarlos juntos.
          </p>
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Cómo ver los modelos"
            valor={vista}
            onCambio={(v) => setVista(v === "lista" ? "lista" : "vitrina")}
            opciones={[
              { clave: "vitrina", etiqueta: "Vitrina", icono: <LayoutGrid />, ayuda: "Las prendas como las ve el cliente", guia: "vitrina.vista-vitrina" },
              { clave: "lista", etiqueta: "Lista", icono: <List />, ayuda: "Una fila por modelo, para revisar muchos" },
            ]}
          />
        </div>

        {visibles.length === 0 ? (
          texto.trim() ? (
            <Vacio icono={<SearchX />} titulo={`Nada coincide con «${texto.trim()}»`} acciones={<Boton onClick={() => setTexto("")}>Borrar la búsqueda</Boton>}>
              Busca por el nombre del modelo, su código o su categoría.
            </Vacio>
          ) : modelos.length === 0 ? (
            <Vacio icono={<MonitorSmartphone />} titulo="Todavía no hay modelos para la web">
              Los modelos que se pueden vender (activos y con precio en alguna tienda que se ve en la web) aparecen aquí para mostrarlos en la
              tienda online.
            </Vacio>
          ) : (
            <Vacio icono={<MonitorSmartphone />} tamano="chico">
              {filtro === "sin_stock" ? "Todos los modelos que se ven en la web tienen algo en alguna tienda." : "Ningún modelo se ve en la web todavía."}
            </Vacio>
          )
        ) : vista === "vitrina" ? (
          <ul className="tw-vitrina" data-guia="vitrina.lista" aria-label="Los modelos, como los ve el cliente">
            {visibles.map((m, i) => (
              <CartaModelo
                key={m.id}
                modelo={m}
                tiendas={tiendas}
                i={i}
                elegido={elegidos.includes(m.id)}
                onElegir={() => alternar(m.id)}
                onAbrir={() => setAbierto(m.id)}
                onInterruptor={() => setLote({ modo: m.vitrina?.publicado ? "ocultar" : "mostrar", ids: [m.id] })}
              />
            ))}
          </ul>
        ) : (
          <Tabla className="rounded-none border-0 shadow-none" guia="vitrina.lista">
            <Encabezado
              plantilla={PLANTILLA}
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
                { titulo: "Libre en tiendas" },
                { titulo: "En la web", alinear: "der" },
              ]}
            />
            {visibles.map((m) => (
              <FilaModelo
                key={m.id}
                modelo={m}
                tiendas={tiendas}
                elegido={elegidos.includes(m.id)}
                onElegir={() => alternar(m.id)}
                onAbrir={() => setAbierto(m.id)}
                onInterruptor={() => setLote({ modo: m.vitrina?.publicado ? "ocultar" : "mostrar", ids: [m.id] })}
              />
            ))}
          </Tabla>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="vitrina.nota">
        <p>
          En la web cada modelo vale lo mismo que en la tienda que el cliente elige; con «Todas», el precio más alto entre ellas. Las campañas se
          aplican encima con la misma regla de la caja. El precio, las fotos, los colores y las tallas se cambian en su ficha, en Catálogo ▸
          Productos.
        </p>
      </div>

      {/* Lo elegido: abajo, pegado al borde, a la vista aunque la lista sea larga (la misma barra de «Pagar juntos»). El aire de abajo es
          para que no tape la última fila. */}
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
            <Boton type="button" aria-haspopup="dialog" onClick={() => setLote({ modo: "ocultar", ids: elegidos })}>
              Ocultar
            </Boton>
            <Boton type="button" peso="primario" aria-haspopup="dialog" data-guia="vitrina.lote-mostrar" onClick={() => setLote({ modo: "mostrar", ids: elegidos })}>
              Mostrar en la web
            </Boton>
          </span>
        }
      />
      {modeloAbierto && <VitrinaModeloHoja key={modeloAbierto.id} modelo={modeloAbierto} onClose={() => setAbierto(null)} onGuardado={actualizar} />}
      {lote && delLote.length > 0 && (
        <VitrinaLoteHoja
          modo={lote.modo}
          modelos={delLote}
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

/** Una fila: la casilla para elegir varios, el modelo (que abre su hoja), lo libre en cada tienda y el interruptor. La fila entera
 *  también abre la hoja con el mouse; la casilla y el interruptor no la disparan. */
function FilaModelo({
  modelo: m,
  tiendas,
  elegido,
  onElegir,
  onAbrir,
  onInterruptor,
}: {
  modelo: ModeloVitrina;
  tiendas: LecturaVitrina["tiendas"];
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
  onInterruptor: () => void;
}) {
  const v = m.vitrina;
  const sinFoto = coloresSinFoto(m);
  // Por qué no se puede mostrar (si no se puede): el empaque se vende en la caja y su interruptor queda apagado y quieto (Felipe
  // 2026-10-15, «Solo ropa en la web»); lo demás, como antes.
  const razon = razonNoSeMuestra(m);
  const empaque = esEmpaque(m);
  return (
    <div
      role="row"
      onClick={(e) => {
        // Un clic que sube desde una hoja abierta (vive en un portal) o desde la casilla, el interruptor o el nombre no abre otra vez.
        if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest("a,button,input,label")) return;
        onAbrir();
      }}
      className={`${fila(PLANTILLA, "cursor-pointer items-center sm:items-center")} ${elegido ? "bg-rojo/[0.045]" : ""}`}
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
          {(razon || (v && v.enLoNuevo !== "automatico")) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {razon && <Chip tono={razon.tono}>{razon.chip}</Chip>}
              {v?.enLoNuevo === "fijo" && <Chip tono="verde">Fijado en Lo nuevo</Chip>}
              {v?.enLoNuevo === "quitado" && <Chip tono="neutro">Fuera de Lo nuevo</Chip>}
            </span>
          )}
        </span>
      </span>
      <span className="col-start-2 row-start-2 text-[13px] tabular-nums text-tinta sm:col-start-auto sm:row-start-auto">
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
          aria-checked={interruptorEncendido(m)}
          aria-label={`${m.nombre} en la web`}
          // El empaque no va en la web: el interruptor no se puede prender (la insignia dice por qué).
          disabled={empaque}
          onClick={onInterruptor}
          className="interruptor disabled:opacity-50"
        >
          <span aria-hidden className="interruptor-perilla" />
        </button>
      </span>
    </div>
  );
}

/** Un modelo en la vista «Vitrina» (ADR-0430): su foto vertical como la ve el cliente (sin foto, su categoría sobre su color, ADR-0333),
 *  la casilla para elegir varios, el nombre que abre su hoja, lo libre en cada tienda y el interruptor. Apagado, la foto se atenúa:
 *  así se ve de un vistazo qué no ve el cliente. Entra en cascada al llegar (`.tw-carta`). */
function CartaModelo({
  modelo: m,
  tiendas,
  i,
  elegido,
  onElegir,
  onAbrir,
  onInterruptor,
}: {
  modelo: ModeloVitrina;
  tiendas: LecturaVitrina["tiendas"];
  i: number;
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
  onInterruptor: () => void;
}) {
  const v = m.vitrina;
  const razon = razonNoSeMuestra(m);
  const empaque = esEmpaque(m);
  const encendido = interruptorEncendido(m);
  const foto = m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null;
  const sinFoto = <SinFoto tamano="h-full w-full !rounded-none" colorHex={m.colores[0]?.hex ?? null} prefijo={m.prefijo} familia={m.familia} categoria={m.categoria} conNombre />;
  return (
    <li
      className="tw-carta"
      style={{ "--i": i } as CSSProperties}
      data-elegida={elegido ? "" : undefined}
      data-oculta={encendido ? undefined : ""}
    >
      <span className="tw-carta-casilla" data-guia="vitrina.casilla">
        <Casilla marcada={elegido} onCambio={onElegir} etiqueta={`Elegir ${m.nombre}`} />
      </span>
      <button type="button" onClick={onAbrir} className="tw-carta-foto" aria-label={`Abrir ${m.nombre}`} tabIndex={-1}>
        <span>{foto ? <ImagenDePrenda src={foto} alt="" fill sizes="200px" className="object-cover" fondo={m.colores[0]?.hex ?? null} fallback={sinFoto} /> : sinFoto}</span>
      </button>
      <span className="tw-carta-cuerpo">
        <button type="button" onClick={onAbrir} data-guia="vitrina.abrir" className="tw-carta-nombre">
          <span data-guia="vitrina.modelo">{m.nombre}</span>
        </button>
        <span className="tw-carta-stock" aria-label="Libre en cada tienda">
          {stockEnTiendas(m, tiendas).map((s) => (
            <span key={s.sede} data-cero={s.cantidad === 0 ? "" : undefined}>
              {s.sede} {s.cantidad}
            </span>
          ))}
        </span>
        {(razon || (v && v.enLoNuevo !== "automatico")) && (
          <span className="flex flex-wrap gap-1.5">
            {razon && <Chip tono={razon.tono}>{razon.chip}</Chip>}
            {v?.enLoNuevo === "fijo" && <Chip tono="verde">Fijado en Lo nuevo</Chip>}
            {v?.enLoNuevo === "quitado" && <Chip tono="neutro">Fuera de Lo nuevo</Chip>}
          </span>
        )}
        <span className="tw-carta-pie" data-guia="vitrina.interruptor">
          <span>{encendido ? "Se ve en la web" : "No se ve"}</span>
          <button
            type="button"
            role="switch" // unificar-fijo: la cara del interruptor del sistema en la carta de un modelo; su título es la línea de al lado
            aria-checked={encendido}
            aria-label={`${m.nombre} en la web`}
            disabled={empaque}
            onClick={onInterruptor}
            className="interruptor disabled:opacity-50"
          >
            <span aria-hidden className="interruptor-perilla" />
          </button>
        </span>
      </span>
    </li>
  );
}
