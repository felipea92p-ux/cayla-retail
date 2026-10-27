"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { atipicosPorLinea, leerCostoAtipicoRecepcion, type CatalogoParaRecibir, type CostoAtipicoRecepcion, type DetalleEnvio, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  argsLigarPrenda,
  argsResolverPendiente,
  AVISO_PRENDA_SIN_LIGAR,
  avisoDeConfirmarHacerAhora,
  avisoDePrecioRechazado,
  cambiosDeVentaDe,
  costoInicialDePrenda,
  costosDeHacerAhora,
  costosSinGuardar,
  leerCostoCierre,
  ponerTallas,
  prendaCreadaDeNueva,
  problemasDePrecio,
  resultadoDelPrecio,
  SEPARADO_VACIO,
  textoCambioDePrecio,
  textoPrendas,
  textoResuelto,
  totalSeparado,
  type LineaParaContar,
  type ParaDespues,
  type PrendaSeparada,
  type Separado,
  type VarianteSeparada,
  mensajeAlGuardar,
  marcaDeLinea,
  type CambioDePrecio,
  type MarcaDeLinea,
  type ResultadoDeLigar,
} from "@/lib/recepcion-conteo-reglas";
import { cambiarPrecioEnRecepcion, ligarPrendaAPendiente, resolverPendiente } from "@/lib/recepcion-conteo-acciones";
import type { Firma } from "@/lib/responsable-reglas";
import { ConfirmarPrecios } from "./ConfirmarPrecios";
import { HojaTallas } from "./HojaTallas";
import { enfocarCosto, enfocarPrecio, type CostoDePrenda } from "./PrecioDePrenda";
import { PreciosDeVenta } from "./PreciosDeVenta";
import { usePreciosDeVenta } from "./usePreciosDeVenta";
import { SepararPrendas } from "./SepararPrendas";

// «Hacer ahora» (ADR-0393, decisión 3): terminar lo que quedó de un envío cerrado. Tres caminos, una sola puerta a la base
// (`resolver_pendiente_envio`): «Separar» lo que nadie dijo qué es (prendas con o sin tallas, nuevas); «Tallas y colores» de un pendiente
// «detalle»; y «Crear» lo nuevo (la hoja de la prenda de siempre y, con la prenda creada, sus tallas). Lo que trae tallas entra al stock en
// el acto, con el costo que se fijó al cerrar; lo demás queda como pendiente nuevo. Nunca más de lo que queda: para eso está reabrir.
// Al separar, una nueva ya descrita también se puede «Crear ahora»: pasa a ser la prenda creada y le toca «Tallas y colores ahora».

type Vista =
  | { tipo: "separar" }
  | { tipo: "tallas"; prenda: PrendaRecepcion; original: PrendaSeparada | null }
  // `desde`: la nueva ya descrita que se está creando al separar. Sin ella, es la hoja de siempre («Crear ahora» de un pendiente o «Es nueva»).
  | { tipo: "prenda"; desde?: { cantidad: number; descripcion: string } }
  | { tipo: "cargando" };

export function HacerAhora({
  detalle,
  item,
  linea,
  catalogo,
  responsable,
  prendas,
  soloSede = false,
  sinAviso = false,
  veDinero = true,
  onPrendaVista,
  onListo,
  onCerrar,
}: {
  detalle: DetalleEnvio;
  item: ParaDespues;
  linea: LineaParaContar | null;
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Una terminal (ADR-0531): el precio de venta vale solo en su sede; no se ofrece «Todas las sedes». */
  soloSede?: boolean;
  /** El envío llegó sin aviso: lo de fuera de la guía no trae costo de ninguna orden, y solo lo escribe quien ve el dinero de Compras (`veDinero`). */
  sinAviso?: boolean;
  veDinero?: boolean;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onListo: () => void;
  /** `huboCambio`: algo quedó guardado sin terminar (la prenda de un «crear» ya existe): la lista de «Para después» se vuelve a leer. */
  onCerrar: (huboCambio: boolean) => void;
}) {
  const [vista, setVista] = useState<Vista>(() => {
    if (item.tipo === "separar") return { tipo: "separar" };
    if (item.tipo === "crear") return { tipo: "prenda" };
    const ya = item.pendiente.producto ? prendas.get(item.pendiente.producto.id) : undefined;
    return ya ? { tipo: "tallas", prenda: ya, original: null } : { tipo: "cargando" };
  });
  const [separado, setSeparado] = useState<Separado>(SEPARADO_VACIO);
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atipicos, setAtipicos] = useState<{ costos: CostoAtipicoRecepcion[]; separado: Separado } | null>(null);
  // «Crear ahora» ya dejó el pendiente «por crear» como «sin tallas» de su prenda: al cerrar sin meter nada, «Para después» se relee.
  const [ligado, setLigado] = useState(false);
  const cerrar = () => onCerrar(ligado);
  // El precio de venta de lo que se identifica aquí (Felipe 2026-10-26): se escribe en la hoja, se confirma al guardar y se aplica DESPUÉS de que
  // la prenda entró (la base lo deja con el envío cerrado mientras la prenda siga «para después» o haya entrado hace menos de una hora).
  const precios = usePreciosDeVenta();
  /** Los cambios de precio que ya quedaron aplicados (de este y de los intentos anteriores), para decirlos al terminar. */
  const aplicados = useRef<(CambioDePrecio & { productoId: string })[]>([]);
  const sede = detalle.sede?.nombre ?? "esta sede";
  const sedeId = detalle.sede?.id ?? null;
  // El costo de compra de cada prenda que se identifica aquí (ADR-0519, Felipe 2026-10-27): como en el cierre, lo ve y lo corrige quien recibe;
  // en un envío sin aviso, lo de fuera de la guía solo quien ve el dinero de Compras. `costosEscritos` trae solo lo que la persona tocó; lo demás
  // sale con el costo que la prenda ya tenía en el conteo, o el de su línea.
  const editaCosto = !(sinAviso && !linea?.linea && !veDinero);
  const [costosEscritos, setCostosEscritos] = useState<Record<string, string>>({});
  const descripcionNueva = item.tipo === "crear" ? item.pendiente.descripcion : null;
  const costoInicial = (productoId: string) => costoInicialDePrenda(linea, productoId, descripcionNueva);
  const costoDe = editaCosto
    ? (productoId: string): CostoDePrenda => {
        const antes = costoInicial(productoId);
        const valor = Object.hasOwn(costosEscritos, productoId) ? (costosEscritos[productoId] ?? "") : antes;
        return { valor, deLaLinea: antes, antes, problema: valor.trim() ? leerCostoCierre(valor).problema : null };
      }
    : undefined;
  const cambiarCosto = (productoId: string, valor: string) => setCostosEscritos((c) => ({ ...c, [productoId]: valor }));
  const [porConfirmar, setPorConfirmar] = useState<{ cambios: CambioDePrecio[]; separado: Separado } | null>(null);
  const categoria = linea?.categoria ?? null;
  // La de la línea, o «Sin marca» (ADR-0393, 2026-10-14): una línea sin marca también se termina.
  const marca = linea ? marcaDeLinea(linea) : null;
  const pendienteId = item.tipo === "separar" ? null : item.pendiente.id;

  // Un «detalle»: la prenda del pendiente con sus tallas y colores (de lo ya buscado, o se busca por su nombre).
  const cargando = vista.tipo === "cargando";
  useEffect(() => {
    if (!cargando || item.tipo !== "detalle" || !categoria || !marca) return;
    const producto = item.pendiente.producto;
    if (!producto) return;
    let vigente = true;
    void buscarPrendasParaRecibir(categoria.id, marca.id, producto.nombre ?? "").then(({ prendas: halladas }) => {
      if (!vigente) return;
      const hallada = halladas.find((p) => p.productoId === producto.id) ?? null;
      if (hallada) {
        onPrendaVista(hallada);
        setVista({ tipo: "tallas", prenda: hallada, original: null });
      } else setError(`No se pudieron leer las tallas y colores de ${producto.nombre ?? "esa prenda"}. Recarga la pantalla y vuelve a intentar.`);
    });
    return () => {
      vigente = false;
    };
  }, [cargando, item, categoria, marca, onPrendaVista]);

  // La prenda de un «crear» ya existe (la hoja la creó, o la persona eligió una que «ya existe»): el pendiente pasa de «por crear» a «sin
  // tallas» de esa prenda, y queda así aunque se deje «para después» (ADR-0393, 2026-10-26). Si no se pudo, la hoja sigue igual: la prenda
  // existe y las tallas se meten de todos modos; solo «Para después» seguirá diciendo «por crear», y se avisa.
  async function ligarPrenda(prenda: PrendaRecepcion) {
    const args = argsLigarPrenda(detalle.id, item, prenda.productoId);
    if (!args) return;
    let resultado: ResultadoDeLigar = "fallo";
    try {
      const respuesta = await ligarPrendaAPendiente(args, responsable.firma());
      resultado = respuesta.resultado;
      if (respuesta.error) responsable.despues(respuesta.error);
    } catch {
      // Sin respuesta: igual que un fallo. La hoja de tallas se abre de todos modos.
    }
    if (resultado === "ligado") setLigado(true);
    else if (resultado === "fallo") avisar.aviso(AVISO_PRENDA_SIN_LIGAR.titulo, { detalle: AVISO_PRENDA_SIN_LIGAR.detalle, duracion: 7000 });
  }

  /**
   * Antes de guardar, con los precios de venta que cambiaron: (1) un precio escrito mal no se ignora, se dice cuál y por qué; (2) la base dice si
   * cada precio se podría guardar y, si no, por qué (lo que rechazaría al guardar, preguntado antes y sin guardar nada), junto al campo; y recién
   * entonces (3) se muestra qué cambia y se pide confirmar (es dinero), igual que al cerrar el envío.
   */
  async function pedirGuardar(s: Separado) {
    // Un costo o un precio escrito mal no se ignora: el motivo ya está junto al campo (`PrecioDePrenda`, siempre a la vista al escribir mal) y
    // aquí solo se lleva el cursor. El costo primero: su campo va antes que el precio.
    const malCosto = costosDeHacerAhora(s.prendas, costosEscritos, costoInicial).problemas;
    if (malCosto.length > 0) {
      enfocarCosto(malCosto[0].productoId);
      return;
    }
    const mal = problemasDePrecio(s.prendas, precios.ventas);
    if (mal.length > 0) {
      enfocarPrecio(mal[0].productoId);
      return;
    }
    const cambiosCosto = costosDeHacerAhora(s.prendas, costosEscritos, costoInicial).cambios;
    const cambiosVenta = cambiosDeVentaDe(s.prendas, precios.ventas);
    if (cambiosCosto.length === 0 && cambiosVenta.length === 0) {
      void guardar(s);
      return;
    }
    if (cambiosVenta.length > 0) {
      setGuardando(true);
      setError(null);
      const rechazos = await precios.validar(detalle.id, cambiosVenta, responsable.firma());
      setGuardando(false);
      if (rechazos.length > 0) {
        // El motivo quedó junto al campo de cada precio rechazado: se lleva el cursor al primero. Nada se guardó (la confirmación ni se abrió).
        enfocarPrecio(rechazos[0].productoId);
        return;
      }
    }
    setPorConfirmar({ cambios: [...cambiosCosto, ...cambiosVenta], separado: s });
  }

  /** Un cambio de precio de venta contra la base: «ok», «ajena» (la prenda todavía no es de este envío) o el motivo por el que no se pudo. */
  async function cambiarPrecio(c: CambioDePrecio & { productoId: string }, firma: Firma | null) {
    try {
      const { error: ep } = await cambiarPrecioEnRecepcion({ p_despacho_id: detalle.id, p_producto_id: c.productoId, p_precio: c.despues, p_alcance: c.alcance ?? "sede" }, firma);
      const r = resultadoDelPrecio(ep);
      if (r === "ok") {
        precios.aplicado(c.productoId, c.despues, c.alcance ?? "sede");
        aplicados.current.push(c);
      } else if (r !== "ajena") precios.rechazar(c.productoId, r.texto);
      return r;
    } catch {
      return { texto: "No hubo respuesta de la base." };
    }
  }

  async function guardar(s: Separado, confirmaCosto = false) {
    if (!linea) return;
    setGuardando(true);
    setError(null);
    const firma = responsable.firma();
    // El precio de venta ANTES de meter las prendas, como al cerrar el envío: el aviso de «costo fuera de lo normal» compara el costo con el
    // precio, y tiene que ver el nuevo. La base lo deja mientras la prenda sea de este envío (siga «para después»); la que se acaba de
    // identificar y todavía no lo es («ajena») se cambia justo después de meterla. Cada cambio aplicado deja de ser un cambio: un reintento
    // (el aviso de costo, un corte de red) no lo manda otra vez.
    const despuesDeMeter: (CambioDePrecio & { productoId: string })[] = [];
    for (const c of cambiosDeVentaDe(s.prendas, precios.ventas)) {
      const r = await cambiarPrecio(c, firma);
      if (r === "ajena") despuesDeMeter.push(c);
      else if (r !== "ok") {
        setGuardando(false);
        setError(avisoDePrecioRechazado(c.nombre, r.texto, "No se guardó nada."));
        return;
      }
    }
    // El costo de las prendas que se identifican ahora viaja con lo separado y entra con ellas (todo o nada, en la misma llamada).
    const { costos, cambios: cambiosCosto } = costosDeHacerAhora(s.prendas, costosEscritos, costoInicial);
    const { resuelto, error: e } = await resolverPendiente(
      argsResolverPendiente({ despachoId: detalle.id, linea, pendienteId, separado: s, costos, confirmaCosto, token }),
      firma,
    );
    responsable.despues(e);
    if (e) {
      setGuardando(false);
      const atip = leerCostoAtipicoRecepcion(e);
      if (atip && atip.length) {
        setAtipicos({ costos: atip, separado: s });
        return;
      }
      // El mismo token en el reintento: si la respuesta se perdió pero la base guardó, devuelve lo mismo sin meter dos veces. Si la base
      // rechazó, no guardó nada y el token sigue libre.
      setError(mensajeAlGuardar(e, "guardar"));
      return;
    }
    // Lo que entró ya entró: un precio que no se pudo cambiar se dice aparte, y la prenda se arregla en Catálogo ▸ Productos.
    const fallas: { nombre: string; texto: string }[] = [];
    for (const c of despuesDeMeter) {
      const r = await cambiarPrecio(c, firma);
      if (r !== "ok") fallas.push({ nombre: c.nombre, texto: r === "ajena" ? "La prenda no quedó en este envío." : r.texto });
    }
    setGuardando(false);
    // La base dice qué costos quedaron anotados: uno que no está (la base todavía no lo acepta) no se da por hecho.
    const sinCosto = costosSinGuardar(cambiosCosto, resuelto?.conteo ?? null);
    const conCosto = cambiosCosto.filter((c) => !sinCosto.includes(c));
    const detalleDeAviso = [
      conCosto.length > 0 ? `Costo · ${conCosto.map((c) => `${c.nombre}: ${textoCambioDePrecio(c, sede)}`).join(" · ")}` : null,
      aplicados.current.length > 0 ? `Precio de venta · ${aplicados.current.map((c) => `${c.nombre}: ${textoCambioDePrecio(c, sede)}`).join(" · ")}` : null,
    ].filter((t): t is string => t !== null);
    avisar.exito(resuelto ? textoResuelto(resuelto) : "Listo", { detalle: detalleDeAviso.length > 0 ? detalleDeAviso.join(" — ") : undefined });
    for (const f of fallas) {
      avisar.error(`No se cambió el precio de ${f.nombre}`, { detalle: `${f.texto} Las prendas sí quedaron guardadas: cambia el precio en Catálogo ▸ Productos.` });
    }
    for (const c of sinCosto) {
      avisar.error(`No se cambió el costo de ${c.nombre}`, { detalle: "La base todavía no acepta cambiar el costo desde aquí. La prenda entró al costo de su línea: corrígelo en Catálogo ▸ Productos." });
    }
    onListo();
  }

  const tallasListas = (prenda: PrendaRecepcion, variantes: VarianteSeparada[]) => {
    if (vista.tipo !== "tallas") return;
    if (item.tipo === "separar") {
      // Separando: las tallas quedan en lo separado y se guarda todo junto al final.
      setSeparado((s) => ponerTallas(s, vista.original?.productoId ?? prenda.productoId, { productoId: prenda.productoId, nombre: prenda.nombre, codigo: prenda.codigo }, variantes));
      setVista({ tipo: "separar" });
      return;
    }
    void pedirGuardar({ prendas: [{ productoId: prenda.productoId, nombre: prenda.nombre, codigo: prenda.codigo, cantidad: variantes.reduce((a, v) => a + v.cantidad, 0), variantes }], nuevas: [] });
  };

  /** La prenda de «Crear ahora» ya existe: esas nuevas pasan a ser la prenda, sin tallas todavía, y se sigue en su hoja de tallas. */
  const prendaCreada = (prenda: PrendaRecepcion) => {
    onPrendaVista(prenda);
    const desde = vista.tipo === "prenda" ? vista.desde : undefined;
    if (!desde) {
      setVista({ tipo: "tallas", prenda, original: null });
      return;
    }
    const s = prendaCreadaDeNueva(separado, desde.descripcion, prenda);
    setSeparado(s);
    setVista({ tipo: "tallas", prenda, original: s.prendas.find((p) => p.productoId === prenda.productoId) ?? null });
  };

  /** La prenda ya existe (la hoja la creó, o se eligió la que «ya existe»): si era el pendiente «por crear», queda ligado a ella (`ligarPrenda`) y se sigue. */
  const alExistir = async (prenda: PrendaRecepcion) => {
    await ligarPrenda(prenda);
    prendaCreada(prenda);
  };

  // La hoja que toca (las salidas tempranas de abajo), y encima la confirmación de precios si hay.
  const hojaActual = (): ReactNode => {
    if (!linea || !categoria || !marca) {
      return (
        <Modal titulo="No se encontró esa línea" onClose={cerrar} conCerrar>
          <p className="text-sm text-taupe">Recarga la pantalla: el envío cambió.</p>
        </Modal>
      );
    }

    if (atipicos) {
      return (
        <Modal titulo="Hay un costo fuera de lo normal" onClose={() => setAtipicos(null)} bloqueado={guardando} tamano="mediana">
          <AvisoCostoAtipico
            costos={atipicosPorLinea(atipicos.costos)}
            pie={
              // Si lo que se ve raro es el costo que se acaba de escribir, se dice así; si no, es el con el que se cerró la línea.
              costosDeHacerAhora(atipicos.separado.prendas, costosEscritos, costoInicial).cambios.length > 0
                ? "El costo que escribiste no se parece al que tiene la prenda hoy. Si está bien, confírmalo: el costo de la prenda se promedia con él."
                : "El costo con el que se cerró esta línea no se parece al de la prenda. Si está bien, confírmalo: el costo de la prenda se promedia con él."
            }
            textoCorregir="Volver"
            textoConfirmar="Está bien, meter al stock"
            textoCargando="Guardando…"
            cargando={guardando}
            listo={responsable.listo}
            motivoNoListo={responsable.motivo}
            onCorregir={() => setAtipicos(null)}
            onConfirmar={() => void guardar(atipicos.separado, true)}
          />
        </Modal>
      );
    }

    if (vista.tipo === "cargando") {
      return (
        <Modal titulo={item.titulo} onClose={cerrar} conCerrar>
          {error ? <Aviso tono="error">{error}</Aviso> : <p className="text-sm text-taupe">Buscando sus tallas y colores…</p>}
        </Modal>
      );
    }

    if (vista.tipo === "prenda") {
      return (
        <HojaPrenda
          destino={{
            modo: "nueva",
            despachoId: detalle.id,
            despachoItemId: linea.linea?.id ?? null,
            categoriaId: categoria.id,
            marcaId: marca.id,
            marcaNombre: marca.nombre,
            // Sin descripción al contar, el nombre que anotó la compradora en la línea (ADR-0480: «Usar ese nombre»).
            descripcionOrden: vista.desde?.descripcion ?? (item.tipo === "crear" ? item.pendiente.descripcion : null) ?? linea.linea?.descripcion ?? null,
            precioSugerido: linea.linea?.precioVentaSugerido ?? null,
            costoUnitario: linea.conteo?.costoUnitario ?? linea.linea?.costoUnitario ?? null,
            prenda: null,
            proveedorId: null,
          }}
          categoria={catalogo?.categorias.find((c) => c.id === categoria.id) ?? null}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => void alExistir(prenda)}
          onUsarExistente={async (productoId, nombre) => {
            const { prendas: halladas } = await buscarPrendasParaRecibir(categoria.id, marca.id, nombre);
            const hallada = halladas.find((p) => p.productoId === productoId);
            if (!hallada) return false;
            await alExistir(hallada);
            return true;
          }}
          onCerrar={item.tipo === "separar" ? () => setVista({ tipo: "separar" }) : cerrar}
        />
      );
    }

    if (vista.tipo === "tallas") {
      return (
        <HojaTallas
          key={vista.prenda.productoId}
          prenda={vista.prenda}
          categoria={categoria}
          marca={marca}
          colores={catalogo?.colores ?? []}
          variantes={vista.original?.variantes ?? null}
          sugeridas={item.tipo === "separar" ? (vista.original?.cantidad ?? null) : item.cantidad}
          maximo={item.tipo === "separar" ? null : item.cantidad}
          textoListo={item.tipo === "separar" ? "Listo" : "Meter al stock"}
          guardando={guardando}
          error={error}
          onListo={tallasListas}
          onAbrirHoja={() => setVista({ tipo: "prenda" })}
          precioDe={item.tipo === "separar" ? undefined : (prenda) => <PreciosDeVenta prendas={[prenda]} sede={sede} soloSede={soloSede} sedeId={sedeId} precios={precios} costoDe={costoDe} onCosto={cambiarCosto} />}
          onCerrar={item.tipo === "separar" ? () => setVista({ tipo: "separar" }) : cerrar}
        />
      );
    }

    return (
      <SepararAhora
        item={item}
        categoria={categoria}
        marca={marca}
        separado={separado}
        guardando={guardando}
        error={error}
        onPrendaVista={onPrendaVista}
        onCrearNueva={(desde) => setVista({ tipo: "prenda", desde })}
        onSeparado={setSeparado}
        onTallas={async (p) => {
          const ya = prendas.get(p.productoId);
          const completa = ya ?? (await buscarPrendasParaRecibir(categoria.id, marca.id, p.nombre ?? "")).prendas.find((x) => x.productoId === p.productoId) ?? null;
          if (!completa) {
            setError(`No se pudieron leer las tallas y colores de ${p.nombre ?? "esa prenda"}.`);
            return;
          }
          onPrendaVista(completa);
          setVista({ tipo: "tallas", prenda: completa, original: p });
        }}
        sede={sede}
        soloSede={soloSede}
        sedeId={sedeId}
        precios={precios}
        costoDe={costoDe}
        onCosto={cambiarCosto}
        onGuardar={() => void pedirGuardar(separado)}
        onCerrar={cerrar}
      />
    );
  };

  return (
    <>
      {hojaActual()}
      {porConfirmar && (
        <ConfirmarPrecios
          cambios={porConfirmar.cambios}
          sede={sede}
          subtitulo="Revisa lo que cambia antes de guardar."
          aviso={avisoDeConfirmarHacerAhora(porConfirmar.cambios)}
          textoConfirmar="Confirmar y guardar"
          textoCargando="Guardando…"
          cargando={guardando}
          onCancelar={() => setPorConfirmar(null)}
          onConfirmar={() => {
            const s = porConfirmar.separado;
            setPorConfirmar(null);
            void guardar(s);
          }}
        />
      )}
    </>
  );
}

/** La hoja de «Separar»: lo que quedó sin separar de una línea, dicho por prenda (con o sin tallas) y nuevas. */
function SepararAhora({
  item,
  categoria,
  marca,
  separado,
  guardando,
  error,
  onPrendaVista,
  onCrearNueva,
  onSeparado,
  onTallas,
  sede,
  soloSede,
  sedeId,
  precios,
  costoDe,
  onCosto,
  onGuardar,
  onCerrar,
}: {
  item: ParaDespues;
  categoria: NonNullable<LineaParaContar["categoria"]>;
  marca: MarcaDeLinea;
  separado: Separado;
  guardando: boolean;
  error: string | null;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onCrearNueva: (nueva: { cantidad: number; descripcion: string }) => void;
  onSeparado: (s: Separado) => void;
  onTallas: (p: PrendaSeparada) => void;
  sede: string;
  soloSede: boolean;
  sedeId: string | null;
  precios: ReturnType<typeof usePreciosDeVenta>;
  costoDe?: (productoId: string) => CostoDePrenda;
  onCosto: (productoId: string, valor: string) => void;
  onGuardar: () => void;
  onCerrar: () => void;
}) {
  const total = totalSeparado(separado);
  const campos = [
    {
      id: "separar-algo",
      nombre: "Qué prendas son",
      requerido: true,
      hecho: total > 0 && total <= item.cantidad,
      pendiente: total > item.cantidad ? `Solo quedan ${item.cantidad}: quita ${total - item.cantidad}.` : "Di al menos una prenda.",
    },
  ];
  const guia = useGuiaCampos(campos);
  return (
    <Modal titulo={`Separar ${textoPrendas(item.cantidad)}`} subtitulo={`${item.sub}. Busca cada prenda por su nombre; lo que no esté en el catálogo, como nuevas.`} tamano="ancha" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
         
          onSubmit={(e) => {
            e.preventDefault();
            if (guia.puedeConfirmar) onGuardar();
          }}
          className="space-y-4"
        >
          <div data-campo="separar-algo">
            <SepararPrendas
              categoria={categoria}
              marca={marca}
              separado={separado}
              tope={item.cantidad}
              enHacerAhora
              onSeparado={onSeparado}
              onTallas={onTallas}
              onPrendaVista={onPrendaVista}
              onCrearNueva={onCrearNueva}
            />
          </div>
          <PreciosDeVenta prendas={separado.prendas} sede={sede} soloSede={soloSede} sedeId={sedeId} precios={precios} costoDe={costoDe} onCosto={onCosto} />
          {error && <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso>}
          <div className="pie-hoja-fijo">
            <div className="space-y-3 border-t border-sand pt-3">
              <PieGuia guia={guia} listo="Lo que tiene tallas entra al stock; lo demás queda pendiente." />
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <Boton type="button" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Guardar
                </Boton>
              </div>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
