"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { BotonFoto } from "@/components/alta-producto/FotosAlta";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoProducto } from "@/lib/producto-fotos";
import { colorPromedio, diferenciaDeColor, veredictoDeColor } from "@/lib/photoroom-reglas";
import { textoDelMotivo } from "@/lib/recorte-probador-reglas";
import type { ProveedoresLaboratorio } from "@/lib/laboratorio-fotos";

// La pantalla del laboratorio de fotos (`app/laboratorio/fotos/page.tsx`). Por cada foto que se suelta: la original; la misma prenda recortada por
// Photoroom (la prenda REAL sin fondo: la referencia del color); y cada versión «de catálogo» que redibuja una IA: el maniquí invisible de
// Photoroom y la edición de OpenAI. Cada versión de catálogo lleva dos insignias: si pasaría la prueba del armador de looks (`prepararRecorte`, la
// misma que corre al subir una foto, ADR-0442) y si su color se fue del de la prenda real (`veredictoDeColor`); la de OpenAI, además, lo que
// costó. Una versión de OpenAI se puede «Usar como molde»: las fotos siguientes (otros colores de la misma prenda) copian su estructura y solo
// toman su color y estampado (`PROMPT_CON_MOLDE`). Todo vive en el navegador: no se sube nada al almacén ni a la base.

type Perfil = "sin-fondo" | "maniqui" | "openai";
type Resultado = { estado: "esperando" } | { estado: "listo"; url: string; costo: number | null } | { estado: "error"; texto: string };
type Insignia = { tono: TonoChip; texto: string };
type Revision = { armador: Insignia | null; color: Insignia | null };
type Molde = { url: string; nombre: string };
type Prueba = {
  clave: string;
  nombre: string;
  original: string;
  resultados: Partial<Record<Perfil, Resultado>>;
  revision: Partial<Record<Perfil, Revision>>;
};

const CATALOGO: { perfil: Exclude<Perfil, "sin-fondo">; titulo: string; descarga: string }[] = [
  { perfil: "maniqui", titulo: "Maniquí invisible · Photoroom", descarga: "Descargar Photoroom" },
  { perfil: "openai", titulo: "Maniquí invisible · OpenAI", descarga: "Descargar OpenAI" },
];

function perfilesActivos(p: ProveedoresLaboratorio): Perfil[] {
  return [...(p.photoroom ? (["sin-fondo", "maniqui"] as const) : []), ...(p.openai ? (["openai"] as const) : [])];
}

async function pedir(archivo: File, perfil: Perfil, molde: Molde | null): Promise<Resultado> {
  const cuerpo = new FormData();
  cuerpo.set("foto", archivo);
  cuerpo.set("perfil", perfil);
  try {
    if (perfil === "openai" && molde) cuerpo.set("molde", await (await fetch(molde.url)).blob(), "molde.png");
    // `x-espera: no`: la pantalla muestra su propio avance por foto; el loader de pantalla completa (ADR-0149) taparía las demás.
    const r = await fetch("/api/fotos/laboratorio", { method: "POST", body: cuerpo, headers: { "x-espera": "no" } });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      return { estado: "error", texto: j?.error ?? `No se pudo (${r.status}).` };
    }
    const costo = Number(r.headers.get("x-costo-usd"));
    return { estado: "listo", url: URL.createObjectURL(await r.blob()), costo: r.headers.has("x-costo-usd") && Number.isFinite(costo) ? costo : null };
  } catch {
    return { estado: "error", texto: "No se pudo conectar con el servidor." };
  }
}

async function probarArmador(url: string): Promise<Insignia> {
  try {
    const { prepararRecorte } = await import("@/lib/recorte-probador");
    const r = await prepararRecorte({ url });
    if (r.motivo) return { tono: "ambar", texto: `Armador: por revisar · ${textoDelMotivo(r.motivo) ?? r.motivo}` };
    return { tono: "verde", texto: "Armador: entra listo" };
  } catch (e) {
    return { tono: "rojo", texto: `Armador: no entra · ${e instanceof Error ? e.message : "no se pudo leer"}` };
  }
}

/** El color promedio de la tela de un PNG sin fondo, leído en un canvas chico (no hace falta el detalle, solo el tono). */
async function leerColor(url: string): Promise<[number, number, number] | null> {
  const img = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const escala = Math.min(1, 300 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * escala));
    c.height = Math.max(1, Math.round(img.height * escala));
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, c.width, c.height);
    return colorPromedio(g.getImageData(0, 0, c.width, c.height).data);
  } finally {
    img.close();
  }
}

async function compararColor(real: string, catalogo: string): Promise<Insignia> {
  try {
    const [a, b] = await Promise.all([leerColor(real), leerColor(catalogo)]);
    if (!a || !b) return { tono: "apagado", texto: "Color: no se pudo medir" };
    const v = veredictoDeColor(diferenciaDeColor(a, b));
    return { tono: v.tono, texto: v.texto };
  } catch {
    return { tono: "apagado", texto: "Color: no se pudo medir" };
  }
}

export function LaboratorioFotos({ proveedores }: { proveedores: ProveedoresLaboratorio }) {
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [molde, setMolde] = useState<Molde | null>(null);
  const urls = useRef<string[]>([]);
  const perfiles = perfilesActivos(proveedores);
  const abierto = perfiles.length > 0;

  // Las vistas locales (blob:) se liberan al salir.
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function cambiar(clave: string, f: (p: Prueba) => Prueba) {
    setPruebas((ps) => ps.map((p) => (p.clave === clave ? f(p) : p)));
  }

  async function probar(archivos: File[]) {
    const buenas: File[] = [];
    const malas: string[] = [];
    for (const a of archivos) {
      const objecion = objecionFotoProducto(a);
      if (objecion) malas.push(`${a.name}: ${objecion}`);
      else buenas.push(a);
    }
    if (malas.length) avisar.error(malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`, { detalle: malas.join(" · ") });
    if (!buenas.length) return;

    const nuevas = buenas.map((archivo) => {
      const original = URL.createObjectURL(archivo);
      urls.current.push(original);
      const prueba: Prueba = {
        clave: crypto.randomUUID(),
        nombre: archivo.name,
        original,
        resultados: Object.fromEntries(perfiles.map((p) => [p, { estado: "esperando" }])),
        revision: {},
      };
      return { archivo, prueba };
    });
    setPruebas((ps) => [...nuevas.map((n) => n.prueba), ...ps]);

    setOcupado(true);
    // Una foto a la vez (el sandbox de Photoroom da 100 imágenes al día y no conviene que nos frenen por ráfaga); sus pedidos, juntos.
    for (const { archivo, prueba } of nuevas) {
      const real = perfiles.includes("sin-fondo") ? pedir(archivo, "sin-fondo", null) : Promise.resolve(null);
      void real.then((r) => r && cambiar(prueba.clave, (p) => ({ ...p, resultados: { ...p.resultados, "sin-fondo": r } })));
      await Promise.all(
        CATALOGO.filter((c) => perfiles.includes(c.perfil)).map(async ({ perfil }) => {
          const r = await pedir(archivo, perfil, molde);
          if (r.estado === "listo") urls.current.push(r.url);
          cambiar(prueba.clave, (p) => ({ ...p, resultados: { ...p.resultados, [perfil]: r } }));
          if (r.estado !== "listo") return;
          const referencia = await real;
          const [armador, color] = await Promise.all([
            probarArmador(r.url),
            referencia?.estado === "listo" ? compararColor(referencia.url, r.url) : Promise.resolve(null),
          ]);
          cambiar(prueba.clave, (p) => ({ ...p, revision: { ...p.revision, [perfil]: { armador, color } } }));
        }),
      );
      const r = await real;
      if (r?.estado === "listo") urls.current.push(r.url);
    }
    setOcupado(false);
  }

  return (
    <main className="pantalla-en-vidrio">
      <div className="mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-8">
        <EncabezadoPagina
          sede="Laboratorio"
          titulo="Fotos con IA"
          subtitulo="Suelta fotos crudas de una prenda y compara cómo la deja cada IA contra la prenda real: el color, si entra al armador y cuánto costó. No se guarda nada."
          acciones={
            abierto ? (
              <BotonFoto onArchivos={(a) => void probar(a)} disabled={ocupado} etiqueta="Elegir fotos para probar" className="btn-cayla btn-primario mov-boton">
                {ocupado ? "Probando…" : "Elegir fotos"}
              </BotonFoto>
            ) : null
          }
        />

        {!abierto ? (
          <Aviso tono="atencion" titulo="Faltan las llaves" className="mt-6 max-w-2xl">
            Agrega <code>PHOTOROOM_API_KEY=…</code> y/o <code>OPENAI_API_KEY=…</code> a <code>apps/web/.env.local</code> y recarga. El laboratorio no
            existe en producción.
          </Aviso>
        ) : (
          <>
            <div className="mt-6 flex max-w-3xl flex-col gap-2">
              {proveedores.photoroom ? (
                <Aviso tono={proveedores.photoroomSandbox ? "info" : "atencion"} chico titulo={proveedores.photoroomSandbox ? "Photoroom de sandbox" : "Photoroom de pago"}>
                  {proveedores.photoroomSandbox
                    ? "Sale con marca de agua (1.000 al mes, 100 por día). Cada foto gasta 2: la recortada y la del maniquí."
                    : "Sin marca de agua: cada foto gasta 2 imágenes de tu plan (la recortada y la del maniquí, ~0,10 USD)."}
                </Aviso>
              ) : (
                <Aviso tono="info" chico titulo="Sin Photoroom">
                  Sin la recortada no hay contra qué medir el color. Agrega <code>PHOTOROOM_API_KEY</code> para verlo.
                </Aviso>
              )}
              {proveedores.openai ? (
                <Aviso tono="atencion" chico titulo={`OpenAI · ${proveedores.modeloOpenAI}`}>
                  Cobra de verdad a tu cuenta: cada foto dice lo que costó (unos 0,05 USD). Tarda unos 25 segundos.
                </Aviso>
              ) : (
                <Aviso tono="info" chico titulo="Sin OpenAI">
                  Agrega <code>OPENAI_API_KEY</code> para ver la versión de catálogo de OpenAI al lado.
                </Aviso>
              )}
            </div>

            {molde ? (
              <div className="mt-4 flex max-w-3xl items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista local (blob:), no pasa por el optimizador */}
                <img src={molde.url} alt="" className="h-14 w-11 rounded-md border border-sand object-contain" />
                <Chip tono="pizarra">Molde: {molde.nombre}</Chip>
                <button type="button" className="btn-cayla btn-enlace" onClick={() => setMolde(null)}>
                  Quitar
                </button>
              </div>
            ) : null}

            <div
              className="mt-6"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!ocupado) void probar(Array.from(e.dataTransfer.files));
              }}
            >
              {pruebas.length === 0 ? (
                <Vacio icono={<ImageOff />} titulo="Todavía no probaste ninguna foto">
                  Arrastra aquí una o varias fotos de prenda (JPG, PNG o WebP de hasta 5 MB), o usa «Elegir fotos». Mejor si son crudas, como salen
                  del celular.
                </Vacio>
              ) : (
                <ul className="flex flex-col gap-6">
                  {pruebas.map((p) => (
                    <FilaPrueba key={p.clave} prueba={p} molde={molde} onMolde={setMolde} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function FilaPrueba({ prueba, molde, onMolde }: { prueba: Prueba; molde: Molde | null; onMolde: (m: Molde) => void }) {
  const real = prueba.resultados["sin-fondo"];
  const catalogo = CATALOGO.filter((c) => prueba.resultados[c.perfil]);
  return (
    <li className="card-cayla p-4">
      <p className="mb-3 text-[15px] font-medium text-tinta">{prueba.nombre}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel titulo="Tu foto" fondo="bg-papel">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista local (blob:), no pasa por el optimizador */}
          <img src={prueba.original} alt={`Original de ${prueba.nombre}`} className="h-full w-full object-contain" />
        </Panel>
        {real ? <Panel titulo="La prenda real, recortada" fondo="bg-crema" resultado={real} alt={`${prueba.nombre} recortada`} /> : null}
        {catalogo.map(({ perfil, titulo }) => {
          const r = prueba.resultados[perfil]!;
          const rev = prueba.revision[perfil];
          return (
            <Panel key={perfil} titulo={titulo} fondo="bg-crema" resultado={r} alt={`${prueba.nombre}: ${titulo}`}>
              <div className="flex flex-wrap gap-1.5">
                {rev?.armador ? <Chip tono={rev.armador.tono}>{rev.armador.texto}</Chip> : null}
                {rev?.color ? <Chip tono={rev.color.tono}>{rev.color.texto}</Chip> : null}
                {r.estado === "listo" && r.costo !== null ? (
                  <Chip tono="pizarra" versalitas={false}>
                    Costó {r.costo.toLocaleString("es-PE", { style: "currency", currency: "USD", maximumFractionDigits: 3 })}
                  </Chip>
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {catalogo.map(({ perfil, descarga }) => {
          const r = prueba.resultados[perfil];
          return r?.estado === "listo" ? (
            <BotonDescargar key={perfil} href={r.url} chico>
              {descarga}
            </BotonDescargar>
          ) : null;
        })}
        {real?.estado === "listo" ? (
          <BotonDescargar href={real.url} chico>
            Descargar recortada
          </BotonDescargar>
        ) : null}
        {(() => {
          const ia = prueba.resultados.openai;
          if (ia?.estado !== "listo") return null;
          if (molde?.url === ia.url) return <Chip tono="pizarra">Es el molde</Chip>;
          return (
            <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => onMolde({ url: ia.url, nombre: prueba.nombre })}>
              Usar como molde
            </button>
          );
        })()}
      </div>
    </li>
  );
}

/**
 * Un cuadro 4:5 con su leyenda. Sin `resultado`, dibuja `children` adentro (la foto original); con `resultado`, dibuja la imagen, el error o
 * la espera, y `children` va bajo la leyenda (las insignias).
 */
function Panel({
  titulo,
  fondo,
  resultado,
  alt,
  children,
}: {
  titulo: string;
  fondo: string;
  resultado?: Resultado;
  alt?: string;
  children?: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-1.5">
      <div className={`papel-fijo relative aspect-[4/5] overflow-hidden rounded-xl border border-sand ${fondo}`}>
        {!resultado ? (
          children
        ) : resultado.estado === "listo" ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista local (blob:), no pasa por el optimizador
          <img src={resultado.url} alt={alt ?? titulo} className="h-full w-full object-contain" />
        ) : resultado.estado === "error" ? (
          <div className="grid h-full place-items-center p-3">
            <Aviso tono="error" chico>
              {resultado.texto}
            </Aviso>
          </div>
        ) : (
          <p data-senal className="grid h-full place-items-center text-sm text-taupe">
            Trabajando…
          </p>
        )}
      </div>
      <figcaption className="text-sm text-taupe">{titulo}</figcaption>
      {resultado ? children : null}
    </figure>
  );
}
