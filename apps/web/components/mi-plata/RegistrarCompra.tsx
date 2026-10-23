"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, Check, Plus, Store } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton, BotonEnlace, CampoMonto } from "@/components/ui/campos";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Volver } from "@/components/ui/Volver";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { cargarHabituales, registrarCompraRapida, subirFotoPapel } from "@/lib/compra-rapida-acciones";
import {
  HABITUALES_A_LA_VISTA,
  TIPOS_PAPEL,
  camposPapel,
  categoriasConProveedor,
  categoriasDeHabituales,
  faltaEnPaso,
  faseDePaso,
  filtrarProveedores,
  leerCantidad,
  leerPrecio,
  lineasParaBase,
  prendasDeLineas,
  textoAvance,
  textoHabitual,
  textoPlataDespues,
  tiendaAnterior,
  tiendasDeLineas,
  totalDeLineas,
  type Habitual,
  type LineaCompra,
  type PasoCompra,
  type ProveedorParaComprar,
  type TipoPapel,
} from "@/lib/compra-rapida-reglas";

// Compras simple (ADR-0480, actividad 3): «Compré ropa», una pregunta a la vez y hecho para el celular (maqueta aprobada,
// docs/maquetas/compras-simple-2026-10/). Siempre tres pasos: 1 · el proveedor (buscado por nombre o por lo que vende) → 2 · las prendas
// (sus habituales; de cada una, cuántas, el costo, el precio de venta y a qué tienda va, con «Igual que la vez pasada» de un toque; al
// final, revisar) → 3 · el papel (qué le dieron, la foto y cuánto pagó, que viene con el total anotado).
//
// Guardar no mueve plata en los libros (Felipe 2026-10-22): en su plata baja al instante, y los libros la mueven cuando Compras completa
// el papel. Lo que falta en el paso del papel es lo mismo que rechaza la base (`camposPapel`). La compra lleva su identificador desde que se
// abre la pantalla: un doble clic o un reintento tras un corte no la duplican. Quién firma (decisión 39): con la cuenta de una persona, ella;
// desde una terminal, el combo «Responsable».
//
// «Algo nuevo de este proveedor» y «Nuevo proveedor» llegan en la actividad 4.

type Datos = {
  proveedores: ProveedorParaComprar[];
  categorias: { id: string; nombre: string }[];
  tiendas: { id: string; nombre: string }[];
  tiene: number | null;
};

/** La prenda que se está anotando: el habitual del que sale y lo escrito en cada paso. `edita`: la posición en la compra, si se corrige. */
type EnCurso = { habitual: Habitual; cantidad: string; costo: string; venta: string; edita: number | null };

const ANTERIOR: Partial<Record<PasoCompra, PasoCompra>> = {
  habituales: "proveedor",
  cantidad: "habituales",
  costo: "cantidad",
  venta: "costo",
  tienda: "venta",
  revisar: "habituales",
  papel: "revisar",
};

export function RegistrarCompra({ datos }: { datos: Datos }) {
  const router = useRouter();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [paso, setPaso] = useState<PasoCompra>("proveedor");
  const [q, setQ] = useState("");
  const [catProveedor, setCatProveedor] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorParaComprar | null>(null);
  const [habituales, setHabituales] = useState<Habitual[] | null | "cargando">("cargando");
  const [catHabitual, setCatHabitual] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null);
  const [lineas, setLineas] = useState<LineaCompra[]>([]);
  const [tipo, setTipo] = useState<TipoPapel | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subida, setSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);
  const [guardada, setGuardada] = useState<{ monto: number; prendas: number; tiendas: string[] } | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  // Cada paso empieza arriba: una pregunta nueva no se abre a media página (en el celular, la anterior dejaba el scroll abajo).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso]);

  const nombresTienda = useMemo(() => new Map(datos.tiendas.map((t) => [t.id, t.nombre])), [datos.tiendas]);
  const total = totalDeLineas(lineas);
  const guia = useGuiaCampos(camposPapel({ tipo, conFoto: archivo !== null, monto }, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);
  const nombreCorto = proveedor ? proveedor.nombre.replace(/\s+(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?)$/i, "") : "";

  async function elegirProveedor(p: ProveedorParaComprar) {
    setProveedor(p);
    setCatHabitual(null);
    setVerTodos(false);
    setHabituales("cargando");
    setPaso("habituales");
    setHabituales(await cargarHabituales(p.id));
  }

  function elegirHabitual(h: Habitual) {
    setEnCurso({
      habitual: h,
      cantidad: h.ultimaCantidad != null ? String(h.ultimaCantidad) : "",
      costo: "",
      venta: "",
      edita: null,
    });
    setPaso("cantidad");
  }

  function corregir(i: number) {
    const l = lineas[i];
    const h = (Array.isArray(habituales) ? habituales.find((x) => x.clave === l.clave) : undefined) ?? {
      clave: l.clave,
      productoId: l.productoId,
      nombre: l.nombre,
      categoriaId: l.categoriaId,
      categoria: l.categoria,
      marcaId: l.marcaId,
      marca: null,
      veces: 0,
      ultimaFecha: null,
      ultimaCantidad: null,
      costo: null,
      venta: null,
    };
    setEnCurso({ habitual: h, cantidad: String(l.cantidad), costo: l.costo.toFixed(2), venta: l.venta != null ? l.venta.toFixed(2) : "", edita: i });
    setPaso("cantidad");
  }

  function elegirTienda(destinoId: string) {
    if (!enCurso) return;
    const h = enCurso.habitual;
    const linea: LineaCompra = {
      clave: h.clave,
      productoId: h.productoId,
      categoriaId: h.categoriaId,
      marcaId: h.marcaId,
      nombre: h.nombre,
      categoria: h.categoria,
      cantidad: leerCantidad(enCurso.cantidad) ?? 1,
      costo: leerPrecio(enCurso.costo) ?? 0,
      venta: leerPrecio(enCurso.venta),
      destinoId,
    };
    setLineas((ls) => (enCurso.edita != null ? ls.map((x, i) => (i === enCurso.edita ? linea : x)) : [...ls, linea]));
    setEnCurso(null);
    setPaso("revisar");
  }

  function alPapel() {
    setMonto(total.toFixed(2));
    setPaso("papel");
  }

  async function guardar() {
    if (guardando || !proveedor) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    setGuardando(true);
    let ruta: string | null = null;
    if (archivo) {
      if (subida?.archivo === archivo) ruta = subida.ruta;
      else {
        const r = await subirFotoPapel(archivo);
        if (!r.ruta) {
          setGuardando(false);
          return setRechazo({ titulo: "No se subió la foto", texto: r.motivo ?? "Vuelve a tomarla.", tono: "error" });
        }
        setSubida({ archivo, ruta: r.ruta });
        ruta = r.ruta;
      }
    }
    const firma = esPersona ? firmaOmitida("compra_rapida") : responsable.firma();
    const { error } = await registrarCompraRapida(
      { p_id: id, p_proveedor_id: proveedor.id, p_tipo: tipo!, p_monto: montoLeido ?? 0, p_foto_ruta: ruta, p_lineas: lineasParaBase(lineas) },
      firma,
    );
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar «Guardar»: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "guardar la compra"), tono: "error" },
      );
    }
    setGuardada({ monto: montoLeido ?? 0, prendas: prendasDeLineas(lineas), tiendas: tiendasDeLineas(lineas, nombresTienda) });
    setPaso("listo");
    router.refresh();
  }

  function otraCompra() {
    setId(crypto.randomUUID());
    setProveedor(null);
    setLineas([]);
    setTipo(null);
    setArchivo(null);
    setSubida(null);
    setMonto("");
    setGuardada(null);
    setRechazo(null);
    setPaso("proveedor");
  }

  const atras = ANTERIOR[paso];
  const cabecera = paso !== "listo" && (
    <div className="flex flex-col gap-2" data-guia="compra.avance">
      <div className="flex items-center gap-3">
        {atras ? <Volver onClick={() => setPaso(atras)} a="el paso anterior" /> : <Volver href="/compras/mi-plata" a="Mi plata para compras" />}
        <span className="truncate text-sm text-taupe">{proveedor ? `Compra a ${nombreCorto}` : "Registrar una compra"}</span>
      </div>
      <span className="label-cayla text-taupe">{textoAvance(paso)}</span>
      <BarraAvance pct={(faseDePaso(paso) / 3) * 100} alto="fina" tono="tinta" decorativa />
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pb-28">
      {cabecera}
      {paso === "proveedor" && (
        <PasoProveedor
          datos={datos}
          q={q}
          setQ={setQ}
          cat={catProveedor}
          setCat={setCatProveedor}
          alElegir={(p) => void elegirProveedor(p)}
        />
      )}

      {paso === "habituales" && proveedor && (
        <section className="flex flex-col gap-3">
          <TituloSeccion>¿Qué le compras hoy?</TituloSeccion>
          <p className="-mt-2 text-sm text-taupe">Lo que más le compras a {nombreCorto}.</p>
          {habituales === "cargando" ? (
            <p className="text-sm text-taupe" role="status">
              Buscando lo que le compras…
            </p>
          ) : habituales === null ? (
            <Aviso tono="error" titulo="No se pudieron leer sus prendas">
              Vuelve atrás y elige otra vez al proveedor.
            </Aviso>
          ) : habituales.length === 0 ? (
            <Vacio icono={<Store aria-hidden />} titulo="Todavía no hay prendas de este proveedor" tamano="chico">
              Muy pronto vas a poder anotar algo nuevo. Por ahora, elige otro proveedor.
            </Vacio>
          ) : (
            <ListaHabituales
              habituales={habituales}
              cat={catHabitual}
              setCat={setCatHabitual}
              verTodos={verTodos}
              setVerTodos={setVerTodos}
              enLaCompra={new Set(lineas.map((l) => l.clave))}
              alElegir={elegirHabitual}
            />
          )}
          {lineas.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-10 border-t border-sand bg-crema/95 p-4 backdrop-blur">
              <Boton peso="primario" className="mx-auto w-full max-w-md" onClick={() => setPaso("revisar")} data-guia="compra.revisar">
                Revisar la compra ({prendasDeLineas(lineas)} prendas)
              </Boton>
            </div>
          )}
        </section>
      )}

      {(paso === "cantidad" || paso === "costo" || paso === "venta") && enCurso && (
        <PasoNumero
          paso={paso}
          enCurso={enCurso}
          setEnCurso={setEnCurso}
          alSeguir={() => setPaso(paso === "cantidad" ? "costo" : paso === "costo" ? "venta" : "tienda")}
        />
      )}

      {paso === "tienda" && enCurso && (
        <section className="flex flex-col gap-3">
          <TituloSeccion>¿A qué tienda va?</TituloSeccion>
          <p className="-mt-2 text-sm text-taupe">
            {leerCantidad(enCurso.cantidad)} · {enCurso.habitual.nombre}. La tienda donde se va a vender.
          </p>
          <ul className="flex flex-col gap-2" data-guia="compra.tiendas">
            {datos.tiendas.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => elegirTienda(t.id)} className="card-cayla mov-boton flex w-full items-center gap-3 p-4 text-left">
                  <Store className="h-5 w-5 shrink-0 text-taupe" aria-hidden />
                  <span className="flex-1 font-medium text-tinta">{t.nombre}</span>
                  {tiendaAnterior(lineas) === t.id && (
                    <Chip tono="pizarra" versalitas={false}>
                      Como la anterior
                    </Chip>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paso === "revisar" && (
        <section className="flex flex-col gap-3">
          <TituloSeccion>Tu compra a {nombreCorto}</TituloSeccion>
          <p className="-mt-2 text-sm text-taupe">¿Falta algo? Agrégalo. Toca una prenda para corregirla.</p>
          {lineas.length === 0 ? (
            <Vacio icono={<Store aria-hidden />} titulo="Todavía no anotas nada" tamano="chico">
              Elige qué le compras.
            </Vacio>
          ) : (
            <ul className="card-cayla divide-y divide-sand" data-guia="compra.lineas">
              {lineas.map((l, i) => (
                <li key={`${l.clave}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => corregir(i)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-tinta">
                      {l.cantidad} · {l.nombre}
                    </span>
                    <span className="block text-xs text-taupe">
                      {soles(l.costo)} c/u{l.venta != null ? ` · se venderá a ${soles(l.venta)}` : ""} · va a {nombresTienda.get(l.destinoId) ?? "una tienda"}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-sm tabular-nums text-tinta">{soles(l.cantidad * l.costo)}</span>
                    <button type="button" className="btn-cayla btn-enlace text-xs" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>
                      Quitar
                    </button>
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-tinta">
                  Total <span className="text-xs text-taupe">· {prendasDeLineas(lineas)} prendas</span>
                </span>
                <span className="font-serif text-xl tabular-nums text-tinta">{soles(total)}</span>
              </li>
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <Boton peso="fantasma" onClick={() => setPaso("habituales")}>
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Otra prenda de {nombreCorto}
              </span>
            </Boton>
            <Boton peso="primario" onClick={alPapel} disabled={lineas.length === 0} data-guia="compra.al-papel">
              <span className="inline-flex items-center gap-2">
                Ya anoté todo: seguir
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Boton>
          </div>
        </section>
      )}

      {paso === "papel" && (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <CampoGuiado id="tipo" guia={guia} titulo="¿Qué te dio el proveedor?">
            <div role="group" aria-label="¿Qué te dio el proveedor?" className="grid grid-cols-2 gap-2" data-guia="compra.tipo">
              {(Object.keys(TIPOS_PAPEL) as TipoPapel[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tipo === k}
                  disabled={guardando}
                  onClick={() => {
                    setRechazo(null);
                    setTipo(k);
                  }}
                  className={`card-cayla mov-boton flex flex-col items-start gap-0.5 p-3 text-left ${tipo === k ? "border-tinta bg-sand/40" : ""}`}
                >
                  <span className="flex w-full items-center justify-between font-medium text-tinta">
                    {TIPOS_PAPEL[k].nombre}
                    {tipo === k && <Check className="h-4 w-4" aria-hidden />}
                  </span>
                  <span className="text-xs text-taupe">{TIPOS_PAPEL[k].ayuda}</span>
                </button>
              ))}
            </div>
          </CampoGuiado>
          {tipo !== "sin_comprobante" && (
            <CampoGuiado id="foto" guia={guia} titulo="La foto del papel">
              <label
                data-guia="compra.foto"
                className={`btn-cayla btn-secundario mov-boton w-full cursor-pointer justify-center ${guardando ? "pointer-events-none opacity-60" : ""}`}
              >
                <Camera className="h-4 w-4" aria-hidden />
                {archivo ? "Cambiar la foto" : "Tomar la foto"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    setRechazo(null);
                    setArchivo(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="mt-1.5 text-xs text-taupe">{archivo ? `Lista: ${archivo.name}` : "Que se lea el total."}</p>
            </CampoGuiado>
          )}
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto pagaste?">
            <CampoMonto
              etiqueta="¿Cuánto pagaste?"
              etiquetaOculta
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              disabled={guardando}
              data-guia="compra.monto"
              onChange={(e) => {
                setRechazo(null);
                setMonto(e.target.value);
              }}
            />
            <p className="mt-1.5 text-xs text-taupe">Lo que anotaste suma {soles(total)}. Si pagaste eso, solo toca Guardar.</p>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién compró">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
          <Boton
            type="submit"
            peso="primario"
            cargando={guardando}
            textoCargando="Guardando…"
            disabled={!guia.puedeConfirmar}
            title={guia.frase ?? undefined}
            className={guia.claseConfirmar}
            data-guia="compra.guardar"
          >
            {montoLeido != null && montoLeido > 0 ? `Guardar ${soles(montoLeido)}` : "Guardar"}
          </Boton>
        </form>
      )}

      {paso === "listo" && guardada && (
        <section className="flex flex-col gap-4 pt-6" data-guia="compra.listo">
          <Aviso tono="exito" titulo="Listo, tu compra quedó guardada">
            {nombreCorto} · {guardada.prendas} prendas · {soles(guardada.monto)}
            {guardada.tiendas.length > 0 ? ` · va a ${guardada.tiendas.join(", ")}` : ""}
          </Aviso>
          {datos.tiene != null && (
            <p className="text-sm text-taupe">{textoPlataDespues(datos.tiene - guardada.monto)}</p>
          )}
          <TituloSeccion nivel={3}>¿Y ahora?</TituloSeccion>
          <Boton peso="primario" onClick={otraCompra}>
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Anotar otra compra
            </span>
          </Boton>
          <BotonEnlace href="/compras/mi-plata">Ver mi plata</BotonEnlace>
        </section>
      )}
    </div>
  );
}

function PasoProveedor({
  datos,
  q,
  setQ,
  cat,
  setCat,
  alElegir,
}: {
  datos: Datos;
  q: string;
  setQ: (v: string) => void;
  cat: string | null;
  setCat: (v: string | null) => void;
  alElegir: (p: ProveedorParaComprar) => void;
}) {
  const categorias = categoriasConProveedor(datos.proveedores, datos.categorias);
  const nombreCat = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const lista = filtrarProveedores(datos.proveedores, q, cat);
  return (
    <section className="flex flex-col gap-3">
      <TituloSeccion>¿A quién le compras?</TituloSeccion>
      <p className="-mt-2 text-sm text-taupe">Busca por nombre o por lo que vende.</p>
      <Buscador
        valor={q}
        onCambio={setQ}
        etiqueta="Busca el proveedor"
        placeholder="Busca el proveedor" // sugerir-fijo: se busca un proveedor por su nombre; no depende de nada elegido antes
        guia="compra.buscador"
      />
      {categorias.length > 1 && (
        <div className="flex flex-wrap gap-2" data-guia="compra.categorias">
          <BotonFiltro activo={cat === null} onClick={() => setCat(null)} cuenta={datos.proveedores.length}>
            Todos
          </BotonFiltro>
          {categorias.map((c) => (
            <BotonFiltro key={c.id} activo={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} cuenta={datos.proveedores.filter((p) => p.categorias.includes(c.id)).length}>
              {c.nombre}
            </BotonFiltro>
          ))}
        </div>
      )}
      {lista.length === 0 ? (
        <Vacio icono={<Store aria-hidden />} titulo="No hay un proveedor así" tamano="chico">
          Prueba con otra categoría u otro nombre.
        </Vacio>
      ) : (
        <ul className="flex flex-col gap-2" data-guia="compra.proveedores">
          {lista.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => alElegir(p)} className="card-cayla mov-boton flex w-full flex-col items-start gap-0.5 p-4 text-left">
                <span className="font-medium text-tinta">{p.nombre}</span>
                <span className="text-xs text-taupe">
                  {p.categorias.length ? p.categorias.map((c) => nombreCat.get(c) ?? "").filter(Boolean).slice(0, 4).join(" · ") : "Todavía no le compras"}
                </span>
                {p.compras > 0 && (
                  <span className="text-xs text-taupe">
                    Le compraste {p.compras} {p.compras === 1 ? "vez" : "veces"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListaHabituales({
  habituales,
  cat,
  setCat,
  verTodos,
  setVerTodos,
  enLaCompra,
  alElegir,
}: {
  habituales: Habitual[];
  cat: string | null;
  setCat: (v: string | null) => void;
  verTodos: boolean;
  setVerTodos: (v: boolean) => void;
  enLaCompra: Set<string>;
  alElegir: (h: Habitual) => void;
}) {
  const cats = categoriasDeHabituales(habituales);
  const deCat = cat ? habituales.filter((h) => h.categoriaId === cat) : habituales;
  const ver = verTodos || cat ? deCat : deCat.slice(0, HABITUALES_A_LA_VISTA);
  return (
    <>
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-2" data-guia="compra.categorias-suyas">
          <BotonFiltro activo={cat === null} onClick={() => setCat(null)} cuenta={habituales.length}>
            Todos
          </BotonFiltro>
          {cats.map((c) => (
            <BotonFiltro key={c.id} activo={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} cuenta={c.cuantos}>
              {c.nombre}
            </BotonFiltro>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-2" data-guia="compra.habituales">
        {ver.map((h) => (
          <li key={h.clave}>
            <button type="button" onClick={() => alElegir(h)} className="card-cayla mov-boton flex w-full flex-col items-start gap-0.5 p-4 text-left">
              <span className="flex w-full items-center gap-2 font-medium text-tinta">
                <span className="min-w-0 flex-1">{h.nombre}</span>
                {enLaCompra.has(h.clave) && (
                  <Chip tono="verde" versalitas={false}>
                    Ya va
                  </Chip>
                )}
              </span>
              <span className="text-xs text-taupe">
                {h.categoria}
                {h.marca ? ` · ${h.marca}` : " · Sin marca"}
              </span>
              {textoHabitual(h) && <span className="text-xs text-taupe">{textoHabitual(h)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!verTodos && !cat && habituales.length > HABITUALES_A_LA_VISTA && (
        <button type="button" className="btn-cayla btn-enlace self-center" onClick={() => setVerTodos(true)}>
          Ver todos los suyos ({habituales.length})
        </button>
      )}
    </>
  );
}

function PasoNumero({
  paso,
  enCurso,
  setEnCurso,
  alSeguir,
}: {
  paso: "cantidad" | "costo" | "venta";
  enCurso: EnCurso;
  setEnCurso: (e: EnCurso) => void;
  alSeguir: () => void;
}) {
  const h = enCurso.habitual;
  const valor = enCurso[paso];
  const poner = (v: string) => setEnCurso({ ...enCurso, [paso]: v });
  const falta = faltaEnPaso(paso, valor);
  const costo = leerPrecio(enCurso.costo);
  // «Igual que la vez pasada»: el costo y la venta de su habitual (lo de la última compra o lo del catálogo), de un toque.
  const igual = paso === "costo" ? h.costo : paso === "venta" ? h.venta : null;
  const titulo = paso === "cantidad" ? "¿Cuántas compraste?" : paso === "costo" ? "¿Cuánto pagaste por cada una?" : "¿A cuánto se venderá en la tienda?";
  const nota =
    paso === "cantidad"
      ? `${h.veces > 0 && h.ultimaCantidad != null ? `La vez pasada compraste ${h.ultimaCantidad}. ` : ""}Los colores y tallas los cuenta la tienda cuando llega.`
      : paso === "venta"
        ? `${costo != null ? `Pagaste ${soles(costo)} cada una. ` : ""}La tienda lo puede cambiar al recibir.`
        : null;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!falta) alSeguir();
      }}
    >
      <TituloSeccion>{titulo}</TituloSeccion>
      <p className="-mt-3 text-sm text-taupe">
        {h.nombre} · {h.categoria}
        {h.marca ? ` · ${h.marca}` : ""}
      </p>
      {igual != null && (
        <button
          type="button"
          data-guia="compra.igual"
          onClick={() => {
            setEnCurso({ ...enCurso, [paso]: igual.toFixed(2) });
            alSeguir();
          }}
          className="card-cayla mov-boton flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <span>
            <span className="block font-medium text-tinta">{h.veces > 0 ? "Igual que la vez pasada" : "Igual que en el catálogo"}</span>
            <span className="block text-xs text-taupe">Tócalo si es el mismo precio</span>
          </span>
          <span className="font-serif text-2xl tabular-nums text-tinta">{soles(igual)}</span>
        </button>
      )}
      <CampoMonto
        etiqueta={titulo}
        etiquetaOculta
        moneda={paso === "cantidad" ? "" : "S/"}
        inputMode={paso === "cantidad" ? "numeric" : "decimal"}
        autoComplete="off"
        autoFocus={igual == null}
        value={valor}
        data-guia={paso === "cantidad" ? "compra.cantidad" : paso === "costo" ? "compra.costo" : "compra.venta"}
        onChange={(e) => poner(e.target.value)}
      />
      {nota && <p className="text-xs text-taupe">{nota}</p>}
      <Boton type="submit" peso="primario" disabled={falta !== null} title={falta ?? undefined}>
        <span className="inline-flex items-center gap-2">
          {paso === "cantidad" ? `Seguir con ${leerCantidad(valor) ?? 0}` : "Seguir"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Boton>
      {falta && <p className="-mt-2 text-center text-xs text-taupe">{igual != null && !valor ? "Toca el precio de arriba, o escribe otro" : falta}</p>}
    </form>
  );
}
