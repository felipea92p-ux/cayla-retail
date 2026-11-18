"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarHojaDeReclamacion, misDatosParaLaHoja } from "@/app/acciones/libro-reclamaciones";
import { campoQueSigue, marcaDe, type EstadoCampo, type MarcaCampo } from "@/lib/cuentas";
import {
  BORRADOR_VACIO,
  claveDelBorrador,
  datosParaLaBase,
  ETIQUETA,
  estadoDeLaHoja,
  faltanEnLaHoja,
  MENSAJE_SIN_RED,
  mensajeDelEnvio,
  NOMBRE_DOCUMENTO,
  problemaDelCampo,
  QUE_ES,
  type BorradorHoja,
  type CampoHoja,
  type EstadoCampoHoja,
} from "@/lib/libro-reclamaciones";
import { nombreTienda } from "@/lib/pedidos";
import { indiceConTecla } from "@/lib/recomendaciones";
import { Campo, Resultado } from "../cuenta/CampoGuiado";

type Sede = { id: string; nombre: string };

const ID: Record<CampoHoja, string> = {
  nombre: "hoja-nombre",
  documento: "hoja-documento",
  domicilio: "hoja-domicilio",
  telefono: "hoja-telefono",
  correo: "hoja-correo",
  apoderado: "hoja-apoderado",
  bien_tipo: "hoja-bien-tipo",
  ubicacion: "hoja-ubicacion",
  monto: "hoja-monto",
  bien_descripcion: "hoja-bien-descripcion",
  tipo: "hoja-tipo",
  detalle: "hoja-detalle",
  pedido: "hoja-pedido",
};

/**
 * La hoja del Libro de Reclamaciones (ADR-0679, Felipe 2026-11-18): tus datos, lo que compraste o contrataste, y tu reclamo o queja. No
 * pide cuenta; con sesión, empieza con su nombre y su correo. Cada campo dice su estado en su título (✓ Listo · Sigue aquí · Revisa ·
 * Opcional), como el registro; abajo, lo primero que falta lleva a su campo. No se manda dos veces: el botón se apaga mientras viaja y
 * cada borrador lleva su marca (la misma marca, la misma hoja). Si algo falla, lo escrito se queda. Al guardarse, va a la constancia.
 */
export function FormularioHoja({ sedes }: { sedes: readonly Sede[] }) {
  const router = useRouter();
  const [b, setB] = useState<BorradorHoja>(BORRADOR_VACIO);
  const [enFoco, setEnFoco] = useState<CampoHoja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Los campos que la persona ya dejó: recién ahí se le dice «Revisa» (no mientras escribe la primera letra).
  const [tocados, setTocados] = useState<ReadonlySet<CampoHoja>>(new Set());
  const marca = useRef<{ clave: string; marca: string } | null>(null);
  const enVuelo = useRef(false);

  // Con sesión, su nombre y su correo para empezar (sin pisar lo que ya escribió).
  useEffect(() => {
    let vigente = true;
    misDatosParaLaHoja()
      .then((d) => {
        if (vigente && d) setB((a) => ({ ...a, nombre: a.nombre || d.nombre, correo: a.correo || d.correo }));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const estado = estadoDeLaHoja(b);
  const faltan = faltanEnLaHoja(estado);
  const sigue = campoQueSigue(
    faltan.map((c) => [c, ETIQUETA[c]] as const),
    Object.fromEntries(Object.entries(estado).map(([c, e]) => [c, e === "ok" || e === "opcional" ? "ok" : e === "mal" ? "mal" : "falta"])) as Record<
      CampoHoja,
      EstadoCampo
    >,
    enFoco,
  );
  const marcaDelCampo = (c: CampoHoja): MarcaCampo | "opcional" => {
    const e: EstadoCampoHoja = estado[c];
    if (e === "opcional") return "opcional";
    // «Revisa» solo en un campo que ya dejó; mientras escribe, «Sigue aquí».
    if (e === "mal" && !tocados.has(c)) return sigue === c ? "sigue" : "falta";
    return marcaDe(e === "ok" ? "ok" : e === "mal" ? "mal" : "falta", sigue === c);
  };
  const cambiar = (cambio: Partial<BorradorHoja>) => {
    setError(null);
    setB((a) => ({ ...a, ...cambio }));
  };
  const foco = (c: CampoHoja) => ({
    alEntrar: () => setEnFoco(c),
    alSalir: () => {
      setEnFoco(null);
      setTocados((t) => new Set(t).add(c));
    },
  });
  const problema = (c: CampoHoja) => (tocados.has(c) ? problemaDelCampo(c, b) : null);

  function irAlCampo(c: CampoHoja) {
    const el = document.getElementById(ID[c]);
    // Un grupo de opciones no recibe el foco: lo recibe su opción elegida (o la primera).
    const caja = el?.getAttribute("role") === "radiogroup" ? el.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') : el;
    caja?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    caja?.focus({ preventScroll: true });
  }

  async function enviar() {
    if (enVuelo.current) return;
    if (faltan.length > 0) {
      setTocados(new Set(faltan));
      irAlCampo(faltan[0]);
      return;
    }
    const clave = claveDelBorrador(b);
    if (!marca.current || marca.current.clave !== clave) marca.current = { clave, marca: crypto.randomUUID() };
    const laMarca = marca.current.marca;
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    try {
      const r = await enviarHojaDeReclamacion(datosParaLaBase(b), laMarca);
      if (r.estado === "registrada") {
        router.push(`/libro-de-reclamaciones/hoja/${r.id}?m=${laMarca}`);
        return;
      }
      setError(mensajeDelEnvio(r));
      if (r.estado === "invalido" && r.campo) {
        setTocados((t) => new Set(t).add(r.campo as CampoHoja));
        irAlCampo(r.campo);
      }
    } catch {
      // La acción ni llegó (sin red): lo escrito se queda y la marca también (si llegó, reintentar no la repite).
      setError(MENSAJE_SIN_RED);
    } finally {
      enVuelo.current = false;
      setEnviando(false);
    }
  }

  const caja = (c: CampoHoja, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={ID[c]}
      className="w-caja"
      aria-invalid={problema(c) ? true : undefined}
      aria-describedby={`${ID[c]}-res`}
      disabled={enviando}
      {...props}
    />
  );

  return (
    <form
      className="lr-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <fieldset className="lr-grupo">
        <legend className="lr-grupo-t">
          <span className="lr-paso">1</span> Tus datos
        </legend>
        <Campo campo="nombre" idCaja={ID.nombre} etiqueta={ETIQUETA.nombre} marca={marcaDelCampo("nombre")} {...foco("nombre")}>
          {caja("nombre", { value: b.nombre, autoComplete: "name", maxLength: 160, onChange: (e) => cambiar({ nombre: e.target.value }) })}
          <Resultado id={ID.nombre}>{problema("nombre") && <span className="w-res-error">{problema("nombre")}</span>}</Resultado>
        </Campo>

        <Campo campo="documento" idCaja={ID.documento} etiqueta={ETIQUETA.documento} marca={marcaDelCampo("documento")} {...foco("documento")}>
          <Opciones
            nombre="Tipo de documento"
            opciones={(["dni", "ce", "pasaporte"] as const).map((t) => ({ valor: t, texto: NOMBRE_DOCUMENTO[t] }))}
            valor={b.tipoDocumento}
            alElegir={(t) => cambiar({ tipoDocumento: t })}
            apagado={enviando}
          />
          {caja("documento", {
            value: b.documento,
            inputMode: b.tipoDocumento === "dni" ? "numeric" : "text",
            autoCapitalize: "characters",
            maxLength: 20,
            placeholder: b.tipoDocumento === "dni" ? "8 números" : "Tal cual está en tu documento",
            onChange: (e) => cambiar({ documento: e.target.value }),
          })}
          <Resultado id={ID.documento}>{problema("documento") && <span className="w-res-error">{problema("documento")}</span>}</Resultado>
        </Campo>

        <Campo campo="domicilio" idCaja={ID.domicilio} etiqueta={ETIQUETA.domicilio} marca={marcaDelCampo("domicilio")} {...foco("domicilio")}>
          {caja("domicilio", {
            value: b.domicilio,
            autoComplete: "street-address",
            maxLength: 240,
            placeholder: "Calle, número, distrito y ciudad", // sugerir-fijo: el formato de una dirección no depende de nada elegido antes
            onChange: (e) => cambiar({ domicilio: e.target.value }),
          })}
          <Resultado id={ID.domicilio}>{problema("domicilio") && <span className="w-res-error">{problema("domicilio")}</span>}</Resultado>
        </Campo>

        <div className="lr-par">
          <Campo campo="telefono" idCaja={ID.telefono} etiqueta={ETIQUETA.telefono} marca={marcaDelCampo("telefono")} {...foco("telefono")}>
            {caja("telefono", { value: b.telefono, type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 20, onChange: (e) => cambiar({ telefono: e.target.value }) })}
            <Resultado id={ID.telefono}>{problema("telefono") && <span className="w-res-error">{problema("telefono")}</span>}</Resultado>
          </Campo>
          <Campo campo="correo" idCaja={ID.correo} etiqueta={ETIQUETA.correo} marca={marcaDelCampo("correo")} {...foco("correo")}>
            {caja("correo", {
              value: b.correo,
              type: "email",
              inputMode: "email",
              autoComplete: "email",
              maxLength: 254,
              onChange: (e) => cambiar({ correo: e.target.value }),
            })}
            <Resultado id={ID.correo}>
              {problema("correo") ? (
                <span className="w-res-error">{problema("correo")}</span>
              ) : (
                <span className="w-ayuda">Aquí te llega la respuesta.</span>
              )}
            </Resultado>
          </Campo>
        </div>

        <label className="w-check" htmlFor="hoja-menor">
          <input id="hoja-menor" type="checkbox" checked={b.menor} disabled={enviando} onChange={(e) => cambiar({ menor: e.target.checked })} />
          <span>Soy menor de edad</span>
        </label>
        {b.menor && (
          <Campo campo="apoderado" idCaja={ID.apoderado} etiqueta={ETIQUETA.apoderado} marca={marcaDelCampo("apoderado")} {...foco("apoderado")}>
            {caja("apoderado", { value: b.apoderado, maxLength: 160, onChange: (e) => cambiar({ apoderado: e.target.value }) })}
            <Resultado id={ID.apoderado}>{problema("apoderado") && <span className="w-res-error">{problema("apoderado")}</span>}</Resultado>
          </Campo>
        )}
      </fieldset>

      <fieldset className="lr-grupo">
        <legend className="lr-grupo-t">
          <span className="lr-paso">2</span> Lo que compraste o contrataste
        </legend>
        <Campo campo="bien_tipo" idCaja={ID.bien_tipo} etiqueta={ETIQUETA.bien_tipo} marca={marcaDelCampo("bien_tipo")} {...foco("bien_tipo")}>
          <Opciones
            id={ID.bien_tipo}
            nombre={ETIQUETA.bien_tipo}
            opciones={[
              { valor: "producto" as const, texto: "Un producto" },
              { valor: "servicio" as const, texto: "Un servicio" },
            ]}
            valor={b.bienTipo}
            alElegir={(t) => cambiar({ bienTipo: t })}
            apagado={enviando}
          />
        </Campo>

        <Campo campo="ubicacion" idCaja={ID.ubicacion} etiqueta={ETIQUETA.ubicacion} marca="opcional" {...foco("ubicacion")}>
          <Opciones
            id={ID.ubicacion}
            nombre={ETIQUETA.ubicacion}
            opciones={[{ valor: null, texto: "Tienda online" }, ...sedes.map((s) => ({ valor: s.id, texto: nombreTienda(s.nombre) }))]}
            valor={b.ubicacionId}
            alElegir={(id) => cambiar({ ubicacionId: id })}
            apagado={enviando}
          />
        </Campo>

        <Campo
          campo="bien_descripcion"
          idCaja={ID.bien_descripcion}
          etiqueta={ETIQUETA.bien_descripcion}
          marca={marcaDelCampo("bien_descripcion")}
          {...foco("bien_descripcion")}
        >
          {caja("bien_descripcion", {
            value: b.bienDescripcion,
            maxLength: 340,
            placeholder: b.bienTipo === "servicio" ? "El servicio, cuándo y dónde" : "La prenda, su color y su talla",
            onChange: (e) => cambiar({ bienDescripcion: e.target.value }),
          })}
          <Resultado id={ID.bien_descripcion}>
            {problema("bien_descripcion") && <span className="w-res-error">{problema("bien_descripcion")}</span>}
          </Resultado>
        </Campo>

        <Campo campo="monto" idCaja={ID.monto} etiqueta={ETIQUETA.monto} marca={marcaDelCampo("monto")} {...foco("monto")}>
          <div className="lr-monto">
            <span aria-hidden>S/</span>
            {caja("monto", { value: b.monto, inputMode: "decimal", maxLength: 12, className: "w-caja num", onChange: (e) => cambiar({ monto: e.target.value }) })}
          </div>
          <Resultado id={ID.monto}>
            {problema("monto") ? <span className="w-res-error">{problema("monto")}</span> : <span className="w-ayuda">Si tu reclamo es por un monto, escríbelo.</span>}
          </Resultado>
        </Campo>
      </fieldset>

      <fieldset className="lr-grupo">
        <legend className="lr-grupo-t">
          <span className="lr-paso">3</span> Tu reclamo o queja
        </legend>
        <Campo campo="tipo" idCaja={ID.tipo} etiqueta={ETIQUETA.tipo} marca={marcaDelCampo("tipo")} {...foco("tipo")}>
          <Opciones
            id={ID.tipo}
            nombre={ETIQUETA.tipo}
            opciones={[
              { valor: "reclamo" as const, texto: "Reclamo" },
              { valor: "queja" as const, texto: "Queja" },
            ]}
            valor={b.tipo}
            alElegir={(t) => cambiar({ tipo: t })}
            apagado={enviando}
          />
          <dl className="lr-que-es">
            <div data-elegido={b.tipo === "reclamo" ? "" : undefined}>
              <dt>Reclamo</dt>
              <dd>{QUE_ES.reclamo}</dd>
            </div>
            <div data-elegido={b.tipo === "queja" ? "" : undefined}>
              <dt>Queja</dt>
              <dd>{QUE_ES.queja}</dd>
            </div>
          </dl>
        </Campo>

        <Campo campo="detalle" idCaja={ID.detalle} etiqueta={ETIQUETA.detalle} marca={marcaDelCampo("detalle")} {...foco("detalle")}>
          <textarea
            id={ID.detalle}
            className="w-caja lr-caja"
            rows={5}
            value={b.detalle}
            maxLength={3400}
            onChange={(e) => cambiar({ detalle: e.target.value })}
            aria-invalid={problema("detalle") ? true : undefined}
            aria-describedby={`${ID.detalle}-res`}
            disabled={enviando}
          />
          <Resultado id={ID.detalle}>
            {problema("detalle") ? (
              <span className="w-res-error">{problema("detalle")}</span>
            ) : (
              <span className="w-ayuda">Con tus palabras: qué pasó, cuándo y dónde.</span>
            )}
          </Resultado>
        </Campo>

        <Campo campo="pedido" idCaja={ID.pedido} etiqueta={ETIQUETA.pedido} marca={marcaDelCampo("pedido")} {...foco("pedido")}>
          <textarea
            id={ID.pedido}
            className="w-caja lr-caja lr-caja-corta"
            rows={3}
            value={b.pedido}
            maxLength={1200}
            onChange={(e) => cambiar({ pedido: e.target.value })}
            aria-invalid={problema("pedido") ? true : undefined}
            aria-describedby={`${ID.pedido}-res`}
            disabled={enviando}
          />
          <Resultado id={ID.pedido}>
            {problema("pedido") ? (
              <span className="w-res-error">{problema("pedido")}</span>
            ) : (
              <span className="w-ayuda">Un cambio, la devolución de tu dinero, una disculpa…</span>
            )}
          </Resultado>
        </Campo>
      </fieldset>

      <div className="lr-pie">
        {faltan.length > 0 ? (
          <p className="lr-faltan">
            Falta:{" "}
            <button type="button" className="lr-ir" onClick={() => irAlCampo(faltan[0])}>
              {ETIQUETA[faltan[0]]}
            </button>
            {faltan.length > 1 && <span> y {faltan.length - 1} más</span>}
          </p>
        ) : (
          <p className="lr-faltan lr-listo">✓ Tu hoja está completa.</p>
        )}
        <div className="w-res" aria-live="polite">
          {error && <span className="w-res-error">{error}</span>}
        </div>
        <button className="t-btn t-btn-ancho" type="submit" disabled={enviando} aria-busy={enviando || undefined}>
          {enviando ? "Enviando…" : "Enviar hoja de reclamación"}
        </button>
      </div>
    </form>
  );
}

/** Un grupo de botones de radio (como «¿Sobre qué es?» de Recomendaciones): las flechas eligen y solo la elegida está en el Tab. */
function Opciones<V extends string | null>({
  id,
  nombre,
  opciones,
  valor,
  alElegir,
  apagado,
}: {
  id?: string;
  nombre: string;
  opciones: readonly { valor: V; texto: string }[];
  valor: V | null;
  alElegir: (v: V) => void;
  apagado: boolean;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const elegida = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  return (
    // El id va en el grupo (no en una opción): así la etiqueta del campo no le cambia el nombre a la primera opción.
    <div id={id} className="r-sobre-opciones" role="radiogroup" aria-label={nombre}>
      {opciones.map((o, i) => (
        <button
          key={o.valor ?? "ninguna"}
          ref={(el) => {
            botones.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          tabIndex={i === elegida ? 0 : -1}
          className="r-sobre-op"
          disabled={apagado}
          onClick={() => alElegir(o.valor)}
          onKeyDown={(e) => {
            const j = indiceConTecla(opciones.length, i, e.key);
            if (j === null) return;
            e.preventDefault();
            alElegir(opciones[j].valor);
            botones.current[j]?.focus();
          }}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
