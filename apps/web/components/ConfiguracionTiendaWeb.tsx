"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2, ShoppingBag, Store, Wallet } from "lucide-react";
import { PuertaDeTienda } from "@/components/tienda-web-conf/PuertaDeTienda";
import { TelefonoDeTienda } from "@/components/tienda-web-conf/TelefonoDeTienda";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraBloque, CampoFin, InputFin, Superficie } from "@/components/finanzas/kit";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { ajustarCelular, celularValido } from "@/lib/club-reglas";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { sugerirDireccion, sugerirNombreWeb } from "@/lib/sugerencias-tienda-web";
import {
  NOMBRE_DATO,
  TOPES_SEDE,
  borradorDe,
  borradorParametros,
  camposDeGuia,
  errorDeLargo,
  faltaParaMostrar,
  fraseNiveles,
  fusionarBorrador,
  idCampo,
  limpiarTexto,
  pendientesDe,
  validarParametrosTiendaWeb,
  type BorradorParametros,
  type BorradorSede,
  type ConfiguracionTiendaWeb as Datos,
  type DatoWeb,
  type ParametrosTiendaWeb,
  type SedeWeb,
} from "@/lib/tienda-web-reglas";

// Tienda web ▸ Conf. Tienda (ADR-0430; antes «Datos y plazos» y, antes, Configuración ▸ Tienda web, ADR-0408, actividad 6; maqueta `vConfig` de
// docs/maquetas/tienda-online-2026-10/): lo que la tienda online le muestra al cliente de cada tienda —nombre, WhatsApp, dirección y
// horario, y si se muestra— y los plazos de los pedidos web. Dibujada con el kit de Finanzas (ADR-0195). CADA TARJETA SE GUARDA CON SU
// BOTÓN «Guardar», firmada con el responsable (Felipe 2026-10-21: guardar solo al salir de una casilla no estaba bien: nadie sabía
// cuándo se había guardado). Lo escrito, y el interruptor «Se ve en la web», quedan como borrador hasta apretarlo.
//
// El WhatsApp es `ubicaciones.whatsapp_numero`, el mismo del QR del club (Tiendas y caja): se guarda con `guardar_whatsapp_tienda`,
// la misma función y la misma regla de allá. El resto, con `guardar_sede_tienda_web`, que no deja encender una tienda a la que
// le falte algo (la guía de foco lo dice antes, con la misma regla: `faltaParaMostrar`).

/** `listo` es el aviso de éxito; `null` guarda sin avisar (el paso previo de un guardado en dos partes). */
type Guardar = (hacer: () => PromiseLike<{ error: unknown }>, que: string, listo: string | null) => Promise<boolean>;
type CampoTexto = "nombreWeb" | "direccion" | "horario";

/** El horario se escribe igual en cualquier tienda: su ejemplo no depende de nada elegido antes. */
const EJEMPLO_HORARIO = "Ej. Lunes a sábado, de 10 a. m. a 9 p. m."; // sugerir-fijo: la forma de escribir un horario es la misma en toda tienda

const listaDe = (sedes: readonly SedeWeb[]) => Object.fromEntries(sedes.map((s) => [s.id, borradorDe(s)])) as Record<string, BorradorSede>;

export function ConfiguracionTiendaWeb({ datos }: { datos: Datos }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  // La tienda cuya tarjeta se está guardando: su botón espera la respuesta.
  const [guardandoEn, setGuardandoEn] = useState<string | null>(null);
  // La tienda abierta en el taller (la fila de puertas de arriba elige cuál).
  const [elegidaId, setElegidaId] = useState<string | null>(datos.sedes[0]?.id ?? null);

  // Lo escrito en cada tienda. Cuando la base trae datos nuevos (otro guardado, un refresco), cada caja toma lo nuevo salvo la
  // que la persona tiene escrita distinto (`fusionarBorrador`): un refresco no le borra a nadie lo que lleva escrito.
  const [borradores, setBorradores] = useState(() => listaDe(datos.sedes));
  const [bases, setBases] = useState(() => listaDe(datos.sedes));
  const [mostrar, setMostrar] = useState(() => Object.fromEntries(datos.sedes.map((s) => [s.id, s.mostrar])) as Record<string, boolean>);
  const [vista, setVista] = useState(datos);
  if (vista !== datos) {
    const nuevas = listaDe(datos.sedes);
    setBorradores((b) => Object.fromEntries(datos.sedes.map((s) => [s.id, fusionarBorrador(b[s.id] ?? nuevas[s.id]!, bases[s.id] ?? nuevas[s.id]!, nuevas[s.id]!)])));
    setBases(nuevas);
    // El interruptor sin guardar se respeta, igual que lo escrito: solo toma lo nuevo el que no se tocó.
    setMostrar((m) => Object.fromEntries(datos.sedes.map((s) => [s.id, m[s.id] === vista.sedes.find((x) => x.id === s.id)?.mostrar ? s.mostrar : (m[s.id] ?? s.mostrar)])));
    setVista(datos);
  }
  const elegida = datos.sedes.find((x) => x.id === elegidaId) ?? datos.sedes[0];

  // Guía de foco: qué le falta a la tienda abierta para verse en la web. Solo llevan marca los datos que llegaron vacíos al abrir.
  const [pendientes] = useState(() => pendientesDe(datos.sedes));
  const guia = useGuiaCampos(
    camposDeGuia(elegida ? [{ id: elegida.id, nombre: elegida.nombre, borrador: borradores[elegida.id] ?? borradorDe(elegida) }] : [], pendientes),
    { enModal: false },
  );

  const guardar: Guardar = async (hacer, que, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    if (listo) avisar.exito(listo);
    router.refresh();
    return true;
  };

  const escribir = (sedeId: string, campo: keyof BorradorSede, valor: string) =>
    setBorradores((b) => ({ ...b, [sedeId]: { ...(b[sedeId] as BorradorSede), [campo]: valor } }));
  const revertir = (sedeId: string, campo: keyof BorradorSede) => escribir(sedeId, campo, bases[sedeId]?.[campo] ?? "");

  /** Lo que la base guarda de una tienda: lo escrito en sus cajas (limpio) y si se muestra. */
  const guardarSede = (s: SedeWeb, b: BorradorSede, enWeb: boolean, que: string, listo: string) =>
    guardar(
      () =>
        createClient().rpc(
          "guardar_sede_tienda_web" as never,
          {
            p_ubicacion_id: s.id,
            p_nombre_web: limpiarTexto(b.nombreWeb),
            p_direccion: limpiarTexto(b.direccion),
            p_horario: limpiarTexto(b.horario),
            p_mostrar: enWeb,
          } as never,
        ),
      que,
      listo,
    );

  /** ¿La tarjeta de esta tienda tiene algo escrito o encendido que la base todavía no tiene? */
  const tieneCambios = (s: SedeWeb) => {
    const b = borradores[s.id];
    const base = bases[s.id];
    if (!b || !base) return false;
    const texto = (["nombreWeb", "direccion", "horario"] as const).some((k) => limpiarTexto(b[k]) !== limpiarTexto(base[k]));
    return texto || b.whatsapp !== base.whatsapp || (mostrar[s.id] ?? s.mostrar) !== s.mostrar;
  };

  /** El botón «Guardar» de una tienda: valida todo antes de escribir nada, guarda el WhatsApp (su propia función, la del QR del club) y
   *  después el resto, con un solo aviso al final. Si algo falla, lo escrito se queda para corregirlo y volver a guardar. */
  async function guardarTarjeta(s: SedeWeb) {
    const b = borradores[s.id];
    const base = bases[s.id];
    if (!b || !base) return;
    const enWeb = mostrar[s.id] ?? s.mostrar;
    const largo = errorDeLargo(b);
    if (largo) return avisar.error(`${s.nombre}: ${largo}`);
    if (b.whatsapp !== "" && !celularValido(b.whatsapp)) {
      return avisar.error(`WhatsApp de ${s.nombre}: tiene 9 dígitos y empieza en 9. Si la tienda no tiene uno, déjalo vacío.`);
    }
    const falta = faltaParaMostrar(b);
    if (enWeb && falta.length > 0) {
      return avisar.error(`${s.nombre}: para mostrarla en la web falta ${falta.map((d) => NOMBRE_DATO[d].toLocaleLowerCase("es")).join(", ")}.`);
    }
    const cambioWhatsapp = b.whatsapp !== base.whatsapp;
    const cambioResto = (["nombreWeb", "direccion", "horario"] as const).some((k) => limpiarTexto(b[k]) !== limpiarTexto(base[k])) || enWeb !== s.mostrar;
    setGuardandoEn(s.id);
    try {
      if (cambioWhatsapp) {
        const ok = await guardar(
          () => createClient().rpc("guardar_whatsapp_tienda", { p_ubicacion_id: s.id, p_numero: b.whatsapp || undefined }),
          "guardar el WhatsApp de la tienda",
          cambioResto
            ? null
            : b.whatsapp
              ? `${s.nombre}: WhatsApp ${b.whatsapp}. Es el mismo del QR del club.`
              : `${s.nombre}: sin WhatsApp. No se ve en la web ni muestra el QR del club.`,
        );
        if (!ok) return;
      }
      if (cambioResto) {
        const nombre = limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre);
        await guardarSede(
          s,
          b,
          enWeb,
          `guardar la tienda ${s.nombre}`,
          enWeb !== s.mostrar ? (enWeb ? `«${nombre}» ya se ve en la web.` : `«${nombre}» ya no se ve en la web.`) : `${s.nombre}: cambios guardados.`,
        );
      }
    } finally {
      setGuardandoEn(null);
    }
  }

  if (!elegida) {
    return <div className="nota-cayla">No hay tiendas abiertas para mostrar en la web.</div>;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">
          Toca una tienda, escribe y guarda con su botón «Guardar», a nombre de quien figure como responsable; la web lo muestra en
          unos minutos.
        </p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando || guardandoEn !== null} />
        </div>
      </div>

      <section className="twc-calle" role="group" aria-label="Tiendas" data-guia="config.tienda-web-sedes">
        {datos.sedes.map((s, i) => (
          <PuertaDeTienda
            key={s.id}
            sede={s}
            borrador={borradores[s.id] ?? borradorDe(s)}
            guardado={{ mostrar: s.mostrar, ...(bases[s.id] ?? borradorDe(s)) }}
            enWeb={mostrar[s.id] ?? false}
            activa={s.id === elegida.id}
            sucia={tieneCambios(s)}
            indice={i}
            bloqueada={guardando || guardandoEn !== null}
            guiaInterruptor={i === 0 ? "config.tienda-web-mostrar" : undefined}
            onElegir={() => setElegidaId(s.id)}
            // El interruptor es del borrador: abre esa tienda para que su botón «Guardar» quede a la vista.
            onMostrar={(v) => {
              setMostrar((m) => ({ ...m, [s.id]: v }));
              setElegidaId(s.id);
            }}
          />
        ))}
      </section>

      <TallerDeTienda
        key={elegida.id}
        sede={elegida}
        borrador={borradores[elegida.id] ?? borradorDe(elegida)}
        enWeb={mostrar[elegida.id] ?? false}
        guia={guia}
        pendientes={pendientes}
        sucio={tieneCambios(elegida)}
        guardando={guardandoEn === elegida.id}
        onEscribir={(campo, valor) => escribir(elegida.id, campo, valor)}
        onRevertir={(campo) => revertir(elegida.id, campo)}
        onGuardar={() => guardarTarjeta(elegida)}
      />

      {datos.parametros ? (
        <Plazos parametros={datos.parametros} guardar={guardar} />
      ) : (
        <p className="nota-cayla">Falta pegar en la base la migración de la tienda web (20261014231000) para ajustar los plazos.</p>
      )}

      <div className="nota-cayla" data-guia="config.tienda-web-nota">
        El WhatsApp de cada tienda es el mismo del QR del club: cambiarlo aquí también lo cambia en Tiendas y caja y en el cartel del
        mostrador. Por ahora no hay envíos: todo pedido web se recoge en la tienda que eligió el cliente.
      </div>
    </>
  );
}

/** La tienda abierta: sus campos a la izquierda y, fijo a la derecha, cómo la verá el cliente mientras se escribe. */
function TallerDeTienda({
  sede: s,
  borrador: b,
  enWeb,
  guia,
  pendientes,
  sucio,
  guardando,
  onEscribir,
  onRevertir,
  onGuardar,
}: {
  sede: SedeWeb;
  borrador: BorradorSede;
  enWeb: boolean;
  guia: GuiaCampos;
  pendientes: ReadonlySet<string>;
  sucio: boolean;
  guardando: boolean;
  onEscribir: (campo: keyof BorradorSede, valor: string) => void;
  onRevertir: (campo: keyof BorradorSede) => void;
  onGuardar: () => void;
}) {
  const falta = faltaParaMostrar(b);
  const paraLaFrase = limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre);
  // La marca de la guía solo en los datos que llegaron vacíos al abrir (una tienda completa no se llena de marcas).
  const etiqueta = (dato: DatoWeb | "horario", texto: string): ReactNode => (pendientes.has(idCampo(s.id, dato)) ? guia.etiqueta(idCampo(s.id, dato), texto) : texto);
  // El pie dice, con la regla real, qué le falta para verse en la web; cada cosa lleva a su caja.
  const faltan: CampoDeGuia[] = [
    ...falta.map((dato) => ({ id: idCampo(s.id, dato), nombre: NOMBRE_DATO[dato], requerido: true, hecho: false, pendiente: "" })),
    ...(limpiarTexto(b.horario) === null ? [{ id: idCampo(s.id, "horario"), nombre: NOMBRE_DATO.horario, requerido: false, sugerido: true, hecho: false, pendiente: "" }] : []),
  ];
  const teclas = (campo: keyof BorradorSede) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onRevertir(campo);
  };
  const caja = (campo: CampoTexto, placeholder: string, tope: number) => (
    <InputFin
      id={`tw-${s.id}-${campo}`}
      value={b[campo]}
      maxLength={tope}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(e) => onEscribir(campo, e.target.value)}
      onKeyDown={teclas(campo)}
    />
  );

  return (
    <div className="twc-taller">
      <Superficie pad className="anim-sube">
        <CabeceraBloque titulo={s.nombre} />

        <CampoGuiado id={idCampo(s.id, "nombre_web")} guia={guia}>
          <CampoFin
            etiqueta={etiqueta("nombre_web", "Nombre que ve el cliente")}
            htmlFor={`tw-${s.id}-nombreWeb`}
            ayuda="La ciudad o el lugar, como lo diría el cliente; no el nombre de la sede en el sistema."
          >
            {caja("nombreWeb", sugerirNombreWeb(s.nombre), TOPES_SEDE.nombreWeb)}
          </CampoFin>
        </CampoGuiado>

        <CampoGuiado id={idCampo(s.id, "whatsapp")} guia={guia}>
          <CampoFin
            etiqueta={etiqueta("whatsapp", "WhatsApp de la tienda")}
            htmlFor={`tw-${s.id}-whatsapp`}
            ayuda={`Aquí llegan los pedidos que separan para ${paraLaFrase}. Es el mismo número del QR del club.`}
          >
            <div className="fin-con-unidad">
              <span>+51</span>
              <InputFin
                id={`tw-${s.id}-whatsapp`}
                value={b.whatsapp}
                inputMode="tel"
                autoComplete="off"
                placeholder="987 654 321"
                onChange={(e) => onEscribir("whatsapp", ajustarCelular(e.target.value))}
                onKeyDown={teclas("whatsapp")}
                className="fin-num"
              />
            </div>
          </CampoFin>
        </CampoGuiado>

        <CampoGuiado id={idCampo(s.id, "direccion")} guia={guia}>
          <CampoFin etiqueta={etiqueta("direccion", "Dirección para recoger")} htmlFor={`tw-${s.id}-direccion`} ayuda="Donde el cliente recoge lo que separó: la calle, el número y una referencia.">
            {caja("direccion", sugerirDireccion(s.nombre), TOPES_SEDE.direccion)}
          </CampoFin>
        </CampoGuiado>

        <CampoGuiado id={idCampo(s.id, "horario")} guia={guia}>
          <CampoFin etiqueta={etiqueta("horario", "Horario")} htmlFor={`tw-${s.id}-horario`} ayuda="Opcional. El cliente lo lee tal cual lo escribes.">
            {caja("horario", EJEMPLO_HORARIO, TOPES_SEDE.horario)}
          </CampoFin>
        </CampoGuiado>

        <div className="space-y-3 border-t border-sand pt-3">
          {faltan.length > 0 ? (
            <FaltanDelPaso faltan={faltan} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} />
          ) : (
            <p role="status" className="text-[12.5px] text-verde">
              Todo listo para mostrarla en la web.
            </p>
          )}
          <PieAcciones guia="config.tienda-web-guardar">
            {sucio && !guardando && (
              <span role="status" className="mr-auto self-center text-[12.5px] text-taupe">
                Tienes cambios sin guardar.
              </span>
            )}
            <Boton peso="primario" cargando={guardando} disabled={!sucio} onClick={onGuardar}>
              Guardar
            </Boton>
          </PieAcciones>
        </div>
      </Superficie>

      <TelefonoDeTienda nombreSede={s.nombre} borrador={b} enWeb={enWeb} />
    </div>
  );
}

/** Para todas las sedes: los plazos de los pedidos web y desde cuántas unidades el cliente ve el número. */
function Plazos({ parametros, guardar }: { parametros: ParametrosTiendaWeb; guardar: Guardar }) {
  const [b, setB] = useState<BorradorParametros>(() => borradorParametros(parametros));
  const [base, setBase] = useState<BorradorParametros>(() => borradorParametros(parametros));
  if (JSON.stringify(borradorParametros(parametros)) !== JSON.stringify(base)) {
    setBase(borradorParametros(parametros));
    setB(borradorParametros(parametros));
  }

  const sucio = JSON.stringify(b) !== JSON.stringify(base);
  const [guardando, setGuardando] = useState(false);

  async function guardarPlazos() {
    const v = validarParametrosTiendaWeb(b);
    if (!v.ok) return avisar.error(v.error);
    const p = v.valor;
    setGuardando(true);
    try {
      await guardar(
        () =>
          createClient().rpc(
            "guardar_parametros_tienda_web" as never,
            {
              p_horas_para_confirmar: p.horasParaConfirmar,
              p_horas_aviso_sin_pagar: p.horasAvisoSinPagar,
              p_dias_aviso_sin_recoger: p.diasAvisoSinRecoger,
              p_quedan_pocas_desde: p.quedanPocasDesde,
            } as never,
          ),
        "guardar los plazos de la tienda web",
        `Plazos guardados: se confirma en ${p.horasParaConfirmar} h, se anula sin pago a las ${p.horasAvisoSinPagar} h y se avisa a los ${p.diasAvisoSinRecoger} días sin recoger.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  const casilla = (campo: keyof BorradorParametros, etiqueta: string, ayuda: ReactNode, unidad?: string) => (
    <CampoFin etiqueta={etiqueta} htmlFor={`tw-${campo}`} ayuda={ayuda}>
      <div className="fin-con-unidad">
        <InputFin
          id={`tw-${campo}`}
          inputMode="numeric"
          value={b[campo]}
          onChange={(e) => setB((x) => ({ ...x, [campo]: e.target.value.replace(/[^\d-]/g, "") }))}
          onKeyDown={(e) => {
            if (e.key === "Escape") setB(base);
          }}
          className="fin-num"
        />
        {unidad && <span>{unidad}</span>}
      </div>
    </CampoFin>
  );

  return (
    <Superficie pad className="anim-sube" guia="config.tienda-web-plazos">
      <CabeceraBloque titulo="Para todas las sedes" bajada="Los plazos de los pedidos que se separan en la web, y desde cuándo el cliente ve el número." />
      <LineaDePlazos horasConfirmar={Number(b.horasParaConfirmar)} horasPagar={Number(b.horasAvisoSinPagar)} diasRecoger={Number(b.diasAvisoSinRecoger)} />
      <div className="fin-dos-campos">
        {casilla("horasParaConfirmar", "Horas para confirmar", "Si la tienda no confirma el pedido en ese tiempo, se cierra solo y el cliente puede volver a separarlo.", "horas")}
        {casilla("horasAvisoSinPagar", "Aviso si no paga, en horas", "Desde que la tienda lo confirma. Si no pagó nada, se anula solo y sus prendas vuelven a estar disponibles; si pagó una parte, sale con aviso y la tienda decide.", "horas")}
        {casilla("diasAvisoSinRecoger", "Días para recoger", "Desde que paga. Pasado ese plazo, se le recuerda al cliente y la tienda decide.", "días")}
        {casilla("quedanPocasDesde", "El número se ve desde", fraseNiveles(Number(b.quedanPocasDesde)), "o menos")}
      </div>
      <Aviso tono="atencion" chico>
        Cambiar estos números afecta a todas las sedes desde el siguiente pedido.
      </Aviso>
      <PieAcciones>
        {sucio && !guardando && (
          <span role="status" className="mr-auto self-center text-[12.5px] text-taupe">
            Tienes cambios sin guardar.
          </span>
        )}
        <Boton peso="primario" cargando={guardando} disabled={!sucio} onClick={guardarPlazos}>
          Guardar
        </Boton>
      </PieAcciones>
    </Superficie>
  );
}

/** La vida de un pedido web en una línea (ADR-0430): separa → confirmas → paga → recoge, con el plazo de cada tramo tal como está escrito
 *  en las casillas de abajo (cambia mientras escribes). Se dibuja una vez al llegar. Solo muestra: lo que se guarda son las casillas. */
function LineaDePlazos({ horasConfirmar, horasPagar, diasRecoger }: { horasConfirmar: number; horasPagar: number; diasRecoger: number }) {
  const n = (x: number) => (Number.isFinite(x) && x > 0 ? x : "—");
  const pasos: { icono: ReactNode; nombre: string; plazo: ReactNode }[] = [
    { icono: <ShoppingBag />, nombre: "Separa", plazo: "El cliente, en la web" },
    { icono: <CheckCircle2 />, nombre: "Confirmas", plazo: <>en <b>{n(horasConfirmar)}</b> h, o se cierra solo</> },
    { icono: <Wallet />, nombre: "Paga", plazo: <>en <b>{n(horasPagar)}</b> h, o se anula si no pagó nada</> },
    { icono: <Store />, nombre: "Recoge", plazo: <>en <b>{n(diasRecoger)}</b> días, con su código</> },
  ];
  return (
    <ol className="tw tw-linea" aria-label="La vida de un pedido web y sus plazos">
      {pasos.map((p, i) => (
        <li key={p.nombre} className="tw-linea-paso" style={{ "--i": i } as CSSProperties}>
          <span aria-hidden className="tw-linea-nodo">
            {p.icono}
          </span>
          <span className="tw-linea-nombre">{p.nombre}</span>
          <span className="tw-linea-plazo">{p.plazo}</span>
        </li>
      ))}
    </ol>
  );
}
