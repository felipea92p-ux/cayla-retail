// Maqueta de Recibir mercadería a partir del boceto de Felipe. Todo vive en este navegador: no guarda, no llama a la base, no cuenta de verdad.
// El Dial, el Trayecto y el odómetro repiten la lógica real (`recepcion-dial-reglas.ts`, `trayecto-envio-reglas.ts`, `Odometro.tsx`) para que se sientan igual.
(() => {
  const D = window.DATOS;
  const ICONOS = window.ICONOS;
  const CAT_IC = window.ICONOS_CAT;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const miles = (n) => Number(n).toLocaleString("es-PE");
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sinTildes = (t) => String(t).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  const conSigno = (n) => (n > 0 ? `+${miles(n)}` : n < 0 ? `−${miles(-n)}` : "0");
  const clon = (x) => JSON.parse(JSON.stringify(x));
  const ico = (n, c = "") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${c}" aria-hidden="true">${ICONOS[n]}</svg>`;
  const icoCat = (id, c = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="${c}" aria-hidden="true">${CAT_IC[id]}</svg>`;

  const TONOS = { neutro: "bg-sand text-taupe", ambar: "bg-ambar/15 text-ambar", verde: "bg-verde/15 text-verde", rojo: "bg-rojo/15 text-rojo", pizarra: "bg-pizarra/15 text-pizarra" };
  const chip = (tono, texto) =>
    `<span data-tono="${tono}" class="chip-cayla inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs leading-5 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-[''] whitespace-nowrap rounded-full ${TONOS[tono]}">${esc(texto)}</span>`;
  const chipNombre = (tono, texto, icono) =>
    `<span data-tono="${tono}" class="chip-cayla inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap rounded-full ${TONOS[tono]}">${icono ? ico(icono, "h-3 w-3 shrink-0") : ""}${esc(texto)}</span>`;
  // El color de lo que se lleva, igual en todas las barras: de rojo (recién empieza) a ámbar (a la mitad) y a verde (lleno). Cambia de a poco, mientras se llena.
  const colorAvance = (pct) => {
    const p = Math.max(0, Math.min(100, pct));
    if (p >= 100) return "var(--bm-avance-alto)";
    return p <= 50
      ? `color-mix(in oklab, var(--bm-avance-medio) ${Math.round(p * 2)}%, var(--bm-avance-bajo))`
      : `color-mix(in oklab, var(--bm-avance-alto) ${Math.round((p - 50) * 2)}%, var(--bm-avance-medio))`;
  };
  const acotar = (pct) => Math.min(100, Math.max(0, pct));
  const barra = (pct, color, alto = "fina") => `<span data-alto="${alto}" data-tono="tinta" class="barra-avance bm-barra" style="--p:${acotar(pct)}%;--bm-tono:${color}" aria-hidden="true"><span class="barra-avance-lleno"></span></span>`;
  /** Mueve la barra que ya está dibujada: así se desliza y cambia de color, en vez de volver a entrar. */
  const pintarBarra = (caja, pct, color) => {
    const b = caja?.querySelector(".barra-avance");
    if (!b) return;
    b.style.setProperty("--p", `${acotar(pct)}%`);
    b.style.setProperty("--bm-tono", color);
  };
  const avanceDelEnvio = (c) => (c.dijeron > 0 ? (c.contadas / c.dijeron) * 100 : c.contadas > 0 ? 100 : 0);
  const boton = (peso, contenido, extra = "") => `<button type="button" class="btn-cayla btn-${peso} ${extra.clase ?? ""}" ${extra.attrs ?? ""}><span class="relative"><span class="inline-flex items-center gap-2">${contenido}</span></span></button>`;

  // ---- El estado ---------------------------------------------------------------------------------------------------------------------
  const crearEstado = (tam) => {
    const modelos = clon(tam === "grande" ? D.envioGrande() : D.modelos).map((m) => ({ modo: "despues", matriz: null, creada: false, ...m }));
    return { tam, modelos, foco: modelos[0].id, plegada: false, tipo: null, estado: null, proveedor: null, marca: null, orden: null, q: "", otraCosa: false, guardado: null, quien: D.equipo[0], papeles: clon(D.papeles) };
  };
  let S = crearEstado("normal");

  const modeloEnFoco = () => S.modelos.find((m) => m.id === S.foco);
  const categoria = (id) => D.categorias.find((c) => c.id === id);

  const conteoDe = (m) => (!m.contado ? "por-contar" : m.dijeron == null ? "fuera" : m.contadas === 0 ? "no-llego" : m.contadas === m.dijeron ? "cuadra" : m.contadas < m.dijeron ? "faltan" : "sobran");
  // El orden en que se lee una curva, como `lib/tallas.ts`: letras de menor a mayor, después los números, y al final Estándar y Única.
  const ORDEN_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
  const rangoTalla = (t) => {
    const i = ORDEN_LETRAS.indexOf(t);
    if (i >= 0) return [0, i];
    const n = Number(t);
    return Number.isFinite(n) ? [1, n] : [2, 0];
  };
  const compararTallas = (a, b) => {
    const [ga, va] = rangoTalla(a);
    const [gb, vb] = rangoTalla(b);
    return ga - gb || va - vb || a.localeCompare(b, "es");
  };
  /** Las tallas de la tabla de un modelo: arranca con las de siempre de su categoría, más las que ya traen cantidad. */
  function tallasDe(m) {
    if (!m.tallas) {
      const conDatos = (m.matriz ?? []).flatMap((f) => Object.entries(f.celdas).filter(([, n]) => Number(n) > 0).map(([t]) => t));
      m.tallas = [...new Set([...categoria(m.cat).tallas.habituales, ...conDatos])].sort(compararTallas);
    }
    return m.tallas;
  }
  const totalMatriz = (m) => (m.matriz ?? []).reduce((a, f) => a + Object.values(f.celdas).reduce((x, y) => x + (Number(y) || 0), 0), 0);
  const tallasListas = (m) => m.modo === "ahora" && m.contadas > 0 && totalMatriz(m) === m.contadas;
  // Un solo estado por fila, el de lo que le toca: ámbar solo si la persona pidió las tallas ahora y le faltan (las tallas pueden esperar).
  function chipDe(m) {
    const c = conteoDe(m);
    if (c === "por-contar") return ["neutro", "Por contar"];
    if (c === "no-llego") return ["neutro", "No llegó"];
    if (c === "fuera") return ["pizarra", "No estaba anotada"];
    if (c === "faltan") return ["ambar", `Faltan ${miles(m.dijeron - m.contadas)}`];
    if (c === "sobran") return ["ambar", `Sobran ${miles(m.contadas - m.dijeron)}`];
    if (m.modo === "ahora" && !tallasListas(m)) return ["ambar", "Faltan tallas"];
    return ["verde", "Cuadra"];
  }
  // Cómo cuenta cada fila en los estados del resumen (los tres primeros suman el total).
  const grupoDe = (m) => {
    const c = conteoDe(m);
    return c === "por-contar" ? "por-contar" : c === "cuadra" ? "cuadran" : "diferencia";
  };
  const tallasPendientes = (m) => m.contado && m.contadas > 0 && !tallasListas(m);

  const pasaFiltros = (m) =>
    (!S.proveedor || m.proveedor === S.proveedor) &&
    (!S.marca || m.marca === S.marca) &&
    (!S.tipo || m.tipo === S.tipo) &&
    (!S.estado || (S.estado === "despues" ? tallasPendientes(m) : grupoDe(m) === S.estado)) &&
    (!S.q || sinTildes(`${m.nombre} ${m.proveedor} ${m.marca}`).includes(sinTildes(S.q)));
  const cantidad = (m) => m.dijeron ?? m.contadas;

  /** Las categorías con lo que dejan los filtros, en el orden elegido: por lo que anotó Compras, que no cambia mientras se cuenta. */
  function categoriasVisibles() {
    const porCat = new Map();
    for (const m of S.modelos) {
      if (!pasaFiltros(m)) continue;
      if (!porCat.has(m.cat)) porCat.set(m.cat, []);
      porCat.get(m.cat).push(m);
    }
    const signo = S.orden === "asc" ? 1 : -1;
    const lista = [...porCat.entries()].map(([id, modelos]) => ({ id, modelos: S.orden ? [...modelos].sort((a, b) => signo * (cantidad(a) - cantidad(b))) : modelos }));
    const suma = (c) => c.modelos.reduce((a, m) => a + cantidad(m), 0);
    return S.orden ? lista.sort((a, b) => signo * (suma(a) - suma(b))) : lista;
  }
  const visibles = () => categoriasVisibles().flatMap((c) => c.modelos);

  /** Si lo que estaba en el contador ya no se ve, pasa al primer modelo sin contar de lo que se ve. */
  function acomodarFoco() {
    const lista = visibles();
    if (lista.length === 0 || lista.some((m) => m.id === S.foco)) return;
    S.foco = (lista.find((m) => !m.contado) ?? lista[0]).id;
    S.plegada = false;
    S.otraCosa = false;
  }

  // ---- Las piezas ----------------------------------------------------------------------------------------------------------------------
  const foto = (m, grande = false) => {
    const clase = m.tipo === "nuevo" && !m.creada ? "sin-foto" : "foto";
    return `<span class="bm-foto ${grande ? "bm-foto-grande" : ""}" data-clase="${clase}" data-color-dato style="--c:${m.color}" aria-hidden="true">${icoCat(m.cat)}</span>`;
  };

  function odometroHTML(valor) {
    const cifras = String(Math.max(0, Math.round(valor))).split("");
    const digitos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<span>${d}</span>`).join("");
    return `<span class="rc-odo"><span class="sr-only">${miles(valor)}</span><span aria-hidden="true" class="rc-odo-cifras">${cifras
      .map((c, i) => {
        const r = cifras.length - i;
        return `<span class="rc-odo-cifra"><span class="rc-odo-tira" style="transform:translateY(-${Number(c) * 10}%)">${digitos}</span></span>${r > 1 && (r - 1) % 3 === 0 ? '<span class="rc-odo-miles">,</span>' : ""}`;
      })
      .join("")}</span></span>`;
  }
  /** Rueda las cifras si cabe en las mismas columnas; si cambió el largo, redibuja. */
  function rodar(caja, valor) {
    const tiras = $$(".rc-odo-tira", caja);
    const cifras = String(Math.max(0, Math.round(valor))).split("");
    if (tiras.length !== cifras.length) {
      caja.innerHTML = odometroHTML(valor);
      return;
    }
    tiras.forEach((t, i) => (t.style.transform = `translateY(-${Number(cifras[i]) * 10}%)`));
    const sr = $(".sr-only", caja);
    if (sr) sr.textContent = miles(valor);
  }

  // El Dial (lib/recepcion-dial-reglas.ts + Dial.tsx)
  const CX = 145;
  const R = 105;
  const R_EXCESO = 128;
  const MAX_CORTES = 40;
  function estadoDial(contadas, dijeron, hay) {
    const n = Math.max(0, contadas);
    if (dijeron == null || dijeron <= 0) {
      const lleno = n > 0 ? 100 : 0;
      return { lleno, exceso: 0, tono: "neutro", texto: hay ? (n === 1 ? "contada" : "contadas") : "por contar", cortes: 0, angulo: lleno * 3.6 };
    }
    const lleno = (Math.min(n, dijeron) / dijeron) * 100;
    const exceso = Math.min(100, (Math.max(0, n - dijeron) / dijeron) * 100);
    const cortes = dijeron <= MAX_CORTES ? dijeron : 0;
    const base = { lleno, exceso, cortes, angulo: lleno * 3.6 };
    if (!hay) return { ...base, tono: "neutro", texto: `dijeron ${miles(dijeron)}` };
    const d = n - dijeron;
    if (d === 0) return { ...base, tono: "cuadra", texto: `cuadra · ${miles(dijeron)}` };
    return d < 0 ? { ...base, tono: "neutro", texto: `faltan ${miles(-d)} de ${miles(dijeron)}` } : { ...base, tono: "sobra", texto: `sobran ${miles(d)}` };
  }
  function atajosDial(dijeron, contadas) {
    const escala = dijeron ?? contadas;
    if (escala >= 5000) return [100, 500];
    if (escala >= 1000) return [50, 100];
    if (escala >= 200) return [10, 50];
    return [5, 10];
  }
  function dialHTML(m) {
    const e = estadoDial(m.contadas, m.dijeron, m.contado);
    const cortes = Array.from({ length: e.cortes }, (_, i) => {
      const t = (i / e.cortes) * Math.PI * 2;
      return `<line class="rc-dial-corte" style="--i:${i}" x1="${CX + Math.cos(t) * (R - 11)}" y1="${CX + Math.sin(t) * (R - 11)}" x2="${CX + Math.cos(t) * (R + 11)}" y2="${CX + Math.sin(t) * (R + 11)}"></line>`;
    }).join("");
    return `<div class="rc-dial rc-dial--${e.tono}" data-cifras="${String(m.contadas).length}">
      <svg viewBox="0 0 290 290" aria-hidden="true" class="rc-dial-aro">
        <circle class="rc-dial-pista" cx="${CX}" cy="${CX}" r="${R}"></circle>
        <circle class="rc-dial-arco" cx="${CX}" cy="${CX}" r="${R}" pathLength="100" style="stroke-dashoffset:${100 - e.lleno}"></circle>
        <circle class="rc-dial-luz" cx="${CX}" cy="${CX}" r="${R - 4}" pathLength="100" style="stroke-dashoffset:${100 - Math.max(0, e.lleno - 4)}"></circle>
        ${cortes}
        <circle class="rc-dial-exceso" cx="${CX}" cy="${CX}" r="${R_EXCESO}" pathLength="100" style="stroke-dashoffset:${100 - e.exceso}"></circle>
        <g class="rc-dial-perilla" style="transform:rotate(${e.angulo}deg)">
          <circle class="rc-dial-perilla-borde" cx="${CX + R}" cy="${CX}" r="15"></circle>
          <circle class="rc-dial-perilla-punto" cx="${CX + R}" cy="${CX}" r="5"></circle>
        </g>
      </svg>
      <div class="rc-dial-centro">
        <button type="button" class="rc-dial-numero" data-accion="escribir" aria-label="Escribir cuántas ${esc(m.nombre)} llegaron (ahora ${m.contadas})">${odometroHTML(m.contadas)}</button>
        <small aria-live="polite">${e.texto}</small>
      </div>
      <span aria-hidden="true" class="rc-dial-visto">${ico("check", "h-5 w-5")}</span>
      <button type="button" data-accion="sumar" data-n="-1" ${m.contadas <= 0 ? "disabled" : ""} aria-label="Una menos" class="rc-dial-boton rc-dial-boton--menos">${ico("minus", "h-5 w-5")}</button>
      <button type="button" data-accion="sumar" data-n="1" aria-label="Una más" class="rc-dial-boton rc-dial-boton--mas">${ico("plus", "h-5 w-5")}</button>
    </div>`;
  }
  /** Actualiza el Dial sin volver a dibujarlo: así el arco, la perilla y las cifras se mueven como en el ERP. */
  function pintarDial(m, antes) {
    const dial = $(".bm-placa .rc-dial");
    if (!dial) return;
    const e = estadoDial(m.contadas, m.dijeron, m.contado);
    dial.className = `rc-dial rc-dial--${e.tono}`;
    dial.dataset.cifras = String(m.contadas).length;
    $(".rc-dial-arco", dial).style.strokeDashoffset = 100 - e.lleno;
    $(".rc-dial-luz", dial).style.strokeDashoffset = 100 - Math.max(0, e.lleno - 4);
    $(".rc-dial-exceso", dial).style.strokeDashoffset = 100 - e.exceso;
    const perilla = $(".rc-dial-perilla", dial);
    perilla.style.transform = `rotate(${e.angulo}deg)`;
    $(".rc-dial-centro small", dial).textContent = e.texto;
    const num = $(".rc-dial-numero", dial);
    if (num) rodar(num, m.contadas);
    $(".rc-dial-boton--menos", dial).disabled = m.contadas <= 0;
    const ns = "http://www.w3.org/2000/svg";
    if (antes && m.contadas > antes.contadas) {
      const chispa = document.createElementNS(ns, "circle");
      chispa.setAttribute("class", "rc-dial-chispa");
      chispa.setAttribute("cx", CX + R);
      chispa.setAttribute("cy", CX);
      chispa.setAttribute("r", 15);
      perilla.prepend(chispa);
      setTimeout(() => chispa.remove(), 700);
    }
    if (antes && e.tono === "cuadra" && antes.tono !== "cuadra") {
      const brillo = document.createElementNS(ns, "circle");
      brillo.setAttribute("class", "rc-dial-brillo");
      brillo.setAttribute("cx", CX);
      brillo.setAttribute("cy", CX);
      brillo.setAttribute("r", R);
      brillo.setAttribute("pathLength", 100);
      $(".rc-dial-aro", dial).append(brillo);
      const halo = document.createElement("span");
      halo.className = "rc-dial-halo";
      dial.append(halo);
      setTimeout(() => {
        brillo.remove();
        halo.remove();
      }, 1200);
    }
  }

  // ---- La pantalla -----------------------------------------------------------------------------------------------------------------------
  function cifrasDelEnvio() {
    const ms = S.modelos;
    const dijeron = ms.reduce((a, m) => a + (m.dijeron ?? 0), 0);
    const contadas = ms.reduce((a, m) => a + m.contadas, 0);
    const contados = ms.filter((m) => m.contado);
    return {
      dijeron,
      contadas,
      // La diferencia es de lo ya contado: lo que falta contar se dice aparte, porque no es un faltante todavía.
      diferencia: contados.reduce((a, m) => a + (m.contadas - (m.dijeron ?? 0)), 0),
      faltaContar: ms.filter((m) => !m.contado).reduce((a, m) => a + (m.dijeron ?? 0), 0),
      modelos: ms.length,
      contados: contados.length,
      cuadran: ms.filter((m) => grupoDe(m) === "cuadran").length,
      diferencias: ms.filter((m) => grupoDe(m) === "diferencia").length,
      porContar: ms.filter((m) => grupoDe(m) === "por-contar").length,
      despues: ms.filter(tallasPendientes).length,
      vender: ms.filter((m) => tallasListas(m) && (m.tipo === "restock" || m.creada)).reduce((a, m) => a + m.contadas, 0),
    };
  }

  function etapaHTML() {
    const c = cifrasDelEnvio();
    const pp = c.dijeron > 0 ? Math.min(100, Math.round((c.contadas / c.dijeron) * 100)) : 100;
    const nombres = ["Salió", "En camino", "Contando", "Por terminar", "Recibido"];
    const k = 2;
    return `<div class="rc-tray" id="tray" data-forma="completa" data-tono="trabaja" style="--tc:${colorAvance(avanceDelEnvio(c))}" role="img" aria-label="Contando: ${miles(c.contadas)} de ${miles(c.dijeron)}">
      <div class="rc-tray-camino">
        <div class="rc-tray-via"><span class="rc-tray-lleno" style="width:${(k / 4) * 100}%"></span></div>
        ${nombres.map((n, j) => (j === k ? "" : `<span class="rc-tray-parada" ${j < k ? "data-hecha" : ""} data-extremo style="left:${(j / 4) * 100}%;--j:${j}">${j < k ? ico("check") : ""}<em>${n}</em></span>`)).join("")}
        <span class="rc-tray-marca" style="left:${(k / 4) * 100}%">
          <span class="rc-tray-halo"></span>
          <span class="rc-tray-bola" id="tray-bola" style="--pp:${pp}">${ico("package-open")}</span>
          <span class="rc-tray-texto"><b>Contando</b><small id="tray-detalle">${miles(c.contadas)} de ${miles(c.dijeron)}</small></span>
        </span>
      </div>
    </div>`;
  }

  function esqueleto() {
    $("#pantalla").innerHTML = `<div class="bm-pantalla">
      <header data-voz="cabecera" class="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
        <div class="anim-sube min-w-0">
          <div class="flex items-center gap-3">
            <a aria-label="Volver a Recibir mercadería" title="Volver a Recibir mercadería" data-pieza="volver" class="group relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-sand bg-papel text-tinta transition-colors hover:border-tinta/40" href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-4 w-4"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg></a>
            <p class="flex min-w-0 items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-profundo"><span aria-hidden="true" class="hilo-dibuja block h-px w-8 shrink-0 bg-taupe"></span><span class="min-w-0">${esc(D.envio.sede)} · ${esc(D.envio.fecha)} · ${esc(D.envio.numero)}</span></p>
          </div>
          <h1 class="font-display mt-3 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">Recibir mercadería⁠<button type="button" class="ayuda-cab-q" data-accion="aviso" data-texto="Cuenta lo que llegó, modelo por modelo. Se guarda solo." aria-label="Qué es Recibir mercadería"><span aria-hidden="true">?</span></button></h1>
        </div>
        <div class="anim-sube bm-tray-caja" style="--i:1"><div class="rc-tray-cabecera" id="trayecto">${etapaHTML()}</div></div>
      </header>
      <div class="bm-tipos" id="tipos" role="group" aria-label="Qué tipo de producto es"></div>
      <div class="bm-mesa" id="mesa">
        <section class="bm-panel bm-lista" id="lista" aria-label="Categorías del envío"></section>
        <section class="bm-panel bm-placa rc-placa" id="placa" aria-label="Cuántas llegaron"></section>
        <aside class="bm-panel bm-resumen" id="resumen" aria-label="Resumen del envío"></aside>
      </div>
    </div>`;
    medirMesa();
  }

  function medirMesa() {
    const mesa = $("#mesa");
    if (!mesa) return;
    mesa.style.setProperty("--bm-arriba", `${mesa.getBoundingClientRect().top + window.scrollY}px`);
  }

  // ---- Re stock y Producto nuevo ---------------------------------------------------------------------------------------------------------
  const TIPOS = {
    restock: { titulo: "Re stock de producto existente", texto: "Ya está en tu inventario. Con tallas y colores, entra al stock al cerrar.", icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS.package}</svg>` },
    nuevo: {
      titulo: "Producto nuevo",
      texto: "Aún no está en tu catálogo. Valida la cantidad; tallas y colores pueden esperar.",
      icono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8.2a2.1 2.1 0 1 0-2.1-2.1"></path><path d="M12 8.2v1.2l8.6 6.2a1.3 1.3 0 0 1-.8 2.4H4.2a1.3 1.3 0 0 1-.8-2.4L12 9.4"></path></svg>`,
    },
  };
  function pintarTipos() {
    const caja = $("#tipos");
    if (!caja) return;
    if (!caja.firstElementChild) {
      caja.innerHTML = Object.entries(TIPOS)
        .map(
          ([id, t]) => `<button type="button" class="bm-tipo" data-accion="tipo" data-tipo="${id}">
          <span class="bm-lente">${t.icono}</span>
          <span class="bm-tipo-textos"><b>${t.titulo} <small class="bm-tipo-mini" data-mini></small></b><span>${t.texto}</span></span>
          <span class="bm-tipo-cifra"><span data-cuenta></span>${barra(0, colorAvance(0))}</span>
          <span class="bm-radio" aria-hidden="true"></span>
        </button>`,
        )
        .join("");
    }
    const aqui = S.tipo ?? modeloEnFoco()?.tipo;
    for (const id of Object.keys(TIPOS)) {
      const b = $(`[data-tipo="${id}"]`, caja);
      const ms = S.modelos.filter((m) => m.tipo === id);
      const contados = ms.filter((m) => m.contado).length;
      const pct = ms.length ? (contados / ms.length) * 100 : 0;
      b.toggleAttribute("data-activa", aqui === id);
      b.setAttribute("aria-pressed", String(S.tipo === id));
      $("[data-mini]", b).textContent = `· ${ms.length} ${ms.length === 1 ? "modelo" : "modelos"}`;
      $("[data-cuenta]", b).innerHTML = `<b>${ms.length}</b> ${ms.length === 1 ? "modelo" : "modelos"} · <b>${contados}</b> ${contados === 1 ? "contado" : "contados"}`;
      pintarBarra($(".bm-tipo-cifra", b), pct, colorAvance(pct));
    }
  }

  // ---- La lista --------------------------------------------------------------------------------------------------------------------------
  const opcionesFiltro = (campo) => {
    const otros = { ...S, [campo]: null };
    const pasa = (m) => (!otros.proveedor || m.proveedor === otros.proveedor) && (!otros.marca || m.marca === otros.marca) && (!otros.tipo || m.tipo === otros.tipo);
    return [...new Set(S.modelos.filter(pasa).map((m) => m[campo]))].sort((a, b) => a.localeCompare(b, "es"));
  };
  function pildora(campo, icono, etiqueta) {
    const valor = S[campo];
    return `<div class="pildora-filtro min-w-0" ${valor ? "data-puesta data-quitable" : ""}>
      <button type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="${etiqueta}${valor ? `: ${esc(valor)}` : ""}" class="pildora-filtro-boton" data-accion="abrir-filtro" data-campo="${campo}">
        ${ico(icono, "pildora-filtro-icono")}
        <span class="pildora-filtro-nombre">${etiqueta}${valor ? ":" : ""}</span>
        ${valor ? `<span class="pildora-filtro-valor"><span class="truncate">${esc(valor)}</span></span>` : ico("chevron-down", "pildora-filtro-flecha")}
      </button>
      ${valor ? `<button type="button" class="pildora-filtro-quitar" data-accion="quitar-filtro" data-campo="${campo}" aria-label="Quitar filtro ${etiqueta}">${ico("x")}</button>` : ""}
    </div>`;
  }
  function segmentoOrden() {
    const volver = " · tócala otra vez para volver al orden de la compra";
    const op = (clave, icono, texto) =>
      `<button type="button" role="radio" aria-checked="${S.orden === clave}" tabindex="${S.orden === clave || (!S.orden && clave === "asc") ? 0 : -1}" title="${texto}${S.orden === clave ? volver : ""}" class="segmento-cayla__opcion" data-accion="orden" data-orden-valor="${clave}">${ico(icono)}<span class="sr-only">${texto}</span></button>`;
    return `<div data-orden><div role="radiogroup" aria-label="Ordenar por cantidad" class="segmento-cayla" id="orden">${op("asc", "arrow-up", "De menos a más")}${op("desc", "arrow-down", "De más a menos")}<span aria-hidden="true" class="cmp-ind cmp-ind-pildora cmp-ind-gota" id="orden-gota"></span></div></div>`;
  }
  function pintarGotaOrden() {
    const cont = $("#orden");
    const gota = $("#orden-gota");
    if (!cont || !gota) return;
    const activo = cont.querySelector('[aria-checked="true"]');
    if (!activo) {
      cont.removeAttribute("data-indicador");
      gota.style.opacity = "";
      return;
    }
    cont.setAttribute("data-indicador", "");
    gota.style.opacity = "1";
    gota.style.width = `${activo.offsetWidth}px`;
    gota.style.transform = `translateX(${activo.offsetLeft}px)`;
  }

  const buscadorHTML = () =>
    `<div class="buscador" data-con-texto="${S.q ? "" : ""}" ${S.q ? "" : ""}>
      ${ico("search", "buscador-icono")}
      <input id="buscar" type="search" autocomplete="off" spellcheck="false" value="${esc(S.q)}" placeholder="Buscar modelo o proveedor…" aria-label="Buscar modelo, proveedor o marca" aria-keyshortcuts="/" />
      <span class="buscador-senal" aria-hidden="true">Buscando…</span>
      <button type="button" class="buscador-borrar" data-accion="borrar-busqueda" aria-label="Borrar la búsqueda" ${S.q ? "" : "hidden"}>${ico("x")}</button>
      <kbd class="buscador-atajo" aria-hidden="true" title="Atajo: / lleva el cursor a la búsqueda" ${S.q ? "hidden" : ""}>/</kbd>
      <span class="buscador-hilo" aria-hidden="true"></span>
    </div>`;

  const ESTADOS = {
    cuadran: { texto: "Cuadran", tono: "verde", icono: "check" },
    diferencia: { texto: "Con diferencia", tono: "ambar", icono: "triangle-alert" },
    "por-contar": { texto: "Por contar", tono: "neutro", icono: "circle-dashed" },
    despues: { texto: "Tallas para después", tono: "pizarra", icono: "clock" },
  };

  function filaHTML(m, conOrigen) {
    const [tono, texto] = chipDe(m);
    const activa = m.id === S.foco;
    return `<li><button type="button" class="bm-modelo" data-accion="elegir" data-id="${m.id}" ${activa ? 'data-activa aria-current="true"' : ""}>
      ${foto(m)}
      <span class="bm-modelo-textos">
        <span class="bm-modelo-nombre"><b title="${esc(m.nombre)}">${esc(m.nombre)}</b>${m.tipo === "nuevo" ? chipNombre("pizarra", "Nuevo", "sparkles") : ""}</span>
        <span class="bm-modelo-cifras" data-cifras-de="${m.id}">${cifrasFila(m, conOrigen)}</span>
      </span>
      <span data-chip-de="${m.id}">${chip(tono, texto)}</span>
    </button></li>`;
  }
  const cifrasFila = (m, conOrigen) => {
    const base = m.dijeron != null ? `<b>${miles(m.contadas)}</b> de ${miles(m.dijeron)}` : `<b>${miles(m.contadas)}</b> ${m.contadas === 1 ? "contada" : "contadas"}`;
    return conOrigen ? `${base} · ${esc(m.proveedor)} · ${esc(m.marca)}` : base;
  };

  const cabezaResumen = (c) => {
    const dijeron = c.modelos.every((m) => m.dijeron == null) ? null : c.modelos.reduce((a, m) => a + (m.dijeron ?? 0), 0);
    const contadas = c.modelos.reduce((a, m) => a + m.contadas, 0);
    const hay = c.modelos.some((m) => m.contado);
    const n = c.modelos.length;
    return `${!hay ? "sin contar" : dijeron != null ? `${miles(contadas)} de ${miles(dijeron)}` : `${miles(contadas)} contadas`} · ${n} ${n === 1 ? "modelo" : "modelos"}`;
  };
  const avanceCat = (c) => {
    const dijeron = c.modelos.reduce((a, m) => a + (m.dijeron ?? 0), 0);
    const contadas = c.modelos.reduce((a, m) => a + m.contadas, 0);
    const todos = c.modelos.every((m) => m.contado);
    const pct = dijeron ? (contadas / dijeron) * 100 : contadas ? 100 : 0;
    const dif = todos && dijeron ? contadas - dijeron : 0;
    // Todo contado pero no cuadra: se queda en ámbar aunque falte poco, que es lo que dice su chip.
    return { pct, color: dif ? "var(--bm-avance-medio)" : colorAvance(pct), dif, hecha: todos };
  };
  const marca = (estado) => `<span class="hilo-marca" data-estado="${estado}" aria-hidden="true">${estado === "hecho" ? '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path class="hilo-tilde" pathLength="14" d="M5 9.4l2.7 2.7L13 6.4"></path></svg>' : ""}</span>`;

  const abiertaLaCat = (c) => {
    const lectura = !!S.q || !!S.estado; // buscando o filtrando por estado se ven todas las que quedan abiertas
    const aqui = c.modelos.some((m) => m.id === S.foco);
    return lectura ? true : aqui && !S.plegada;
  };

  function cabezaCatHTML(c, i) {
    const cat = categoria(c.id);
    const aqui = c.modelos.some((m) => m.id === S.foco);
    const av = avanceCat(c);
    return `<div class="bm-cat-tira"><button type="button" class="bm-cat-cabeza" data-accion="categoria" data-cat="${c.id}" aria-expanded="${abiertaLaCat(c)}" ${aqui ? 'aria-current="true"' : ""}>
      <span class="rc-cat-ic" data-tamano="chico" aria-hidden="true">${icoCat(c.id, "h-[18px] w-[18px]")}</span>
      <span class="bm-cat-textos"><b>${esc(cat.nombre)}</b><span data-resumen>${cabezaResumen(c)}</span><span data-barra>${barra(av.pct, av.color)}</span></span>
      <span data-dif>${av.dif ? chip("ambar", conSigno(av.dif)) : ""}</span>
      <span data-marca>${marca(av.hecha ? "hecho" : aqui ? "ahora" : "falta")}</span>
      ${ico("chevron-down", "bm-cat-flecha")}
    </button></div>`;
  }

  function dibujarLista() {
    const panel = $("#lista");
    const cats = categoriasVisibles();
    const hayFiltro = S.proveedor || S.marca || S.tipo || S.estado || S.q;
    const total = S.modelos.length;
    const vistos = cats.reduce((a, c) => a + c.modelos.length, 0);
    const filtrarProveedor = new Set(S.modelos.map((m) => m.proveedor)).size > 1;
    const filtrarMarca = new Set(S.modelos.map((m) => m.marca)).size > 1;
    const yaHabia = $("#buscar");
    const conCursor = document.activeElement === yaHabia;
    const scrollAntes = $(".bm-scroll", panel)?.scrollTop ?? 0;
    const puestos = [
      S.tipo ? `<button type="button" class="vacio-filtro" data-accion="quitar-tipo" aria-label="Quitar el filtro de tipo">Solo ${S.tipo === "restock" ? "re stock" : "producto nuevo"}${ico("x")}</button>` : "",
      S.estado ? `<button type="button" class="vacio-filtro" data-accion="quitar-estado" aria-label="Quitar el filtro de estado">${ESTADOS[S.estado].texto}${ico("x")}</button>` : "",
    ].join("");
    panel.dataset.catColor = colorCat;
    panel.innerHTML = `<div class="bm-lista-cabeza">
        <div class="bm-titulo"><h2>Categorías del envío</h2><small>${hayFiltro ? `${vistos} de ${total}` : total} modelos</small></div>
        ${buscadorHTML()}
        <div class="bm-filtros">${filtrarProveedor ? pildora("proveedor", "truck", "Proveedor") : ""}${filtrarMarca ? pildora("marca", "tag", "Marca") : ""}${segmentoOrden()}</div>
        ${puestos ? `<div class="bm-puestos">${puestos}</div>` : ""}
      </div>
      <div class="bm-scroll scroll-cayla" id="lista-scroll">
        ${
          cats.length === 0
            ? `<p class="bm-vacio">Nada coincide con lo que buscaste o filtraste.</p>`
            : cats
                .map((c, i) => {
                  const variosOrigenes = new Set(c.modelos.map((m) => `${m.proveedor}|${m.marca}`)).size > 1;
                  return `<div class="bm-cat" data-cat-caja="${c.id}" ${abiertaLaCat(c) ? "data-abierta" : ""} style="--i:${i};${listaYaEntro ? "animation:none" : ""}">
                  ${cabezaCatHTML(c, i)}
                  <div class="bm-cat-cuerpo" ${abiertaLaCat(c) ? "" : "inert"}><div class="bm-cat-dentro"><ul class="bm-modelos">${c.modelos.map((m) => filaHTML(m, variosOrigenes)).join("")}</ul></div></div>
                </div>`;
                })
                .join("")
        }
        <div style="padding:10px 12px 12px"><button type="button" class="rc-cat-agregar rc-acord-agregar" data-accion="aviso" data-texto="En el ERP abre la misma hoja de hoy: una categoría que no venía en el envío.">${ico("plus", "h-4 w-4 shrink-0")}<span class="whitespace-nowrap text-[14.5px]">Agregar categoría</span></button></div>
      </div>`;
    listaYaEntro = true;
    $(".bm-scroll", panel).scrollTop = scrollAntes;
    pintarGotaOrden();
    if (conCursor) {
      const entrada = $("#buscar");
      entrada.focus();
      entrada.setSelectionRange(entrada.value.length, entrada.value.length);
    }
    filaALaVista();
  }
  let listaYaEntro = false;
  // Para comparar mirando: el color de las categorías se cambia desde la chapa.
  const COLORES_CAT = { pizarra: "Pizarra", arena: "Arena", tinta: "Tinta" };
  let colorCat = COLORES_CAT[new URLSearchParams(location.search).get("cat")] ? new URLSearchParams(location.search).get("cat") : "pizarra";

  /** Abre, cierra y marca sin redibujar: así el acordeón se mueve como en el ERP. */
  function pintarAcordeon() {
    for (const c of categoriasVisibles()) {
      const caja = $(`[data-cat-caja="${c.id}"]`);
      if (!caja) continue;
      const abierta = abiertaLaCat(c);
      const aqui = c.modelos.some((m) => m.id === S.foco);
      caja.toggleAttribute("data-abierta", abierta);
      $(".bm-cat-cuerpo", caja).toggleAttribute("inert", !abierta);
      const cabeza = $(".bm-cat-cabeza", caja);
      cabeza.setAttribute("aria-expanded", String(abierta));
      if (aqui) cabeza.setAttribute("aria-current", "true");
      else cabeza.removeAttribute("aria-current");
      const av = avanceCat(c);
      $("[data-marca]", caja).innerHTML = marca(av.hecha ? "hecho" : aqui ? "ahora" : "falta");
    }
    $$(".bm-modelo").forEach((b) => {
      const activa = b.dataset.id === S.foco;
      b.toggleAttribute("data-activa", activa);
      if (activa) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
  }

  function filaALaVista() {
    const caja = $("#lista-scroll");
    const mover = () => {
      const fila = caja?.querySelector("[data-activa]");
      if (!caja || !fila || fila.closest(".bm-cat-cuerpo")?.hasAttribute("inert")) return;
      const a = caja.getBoundingClientRect();
      const b = fila.getBoundingClientRect();
      const cabeza = 64; // la cabeza de la categoría va pegada arriba
      if (b.top < a.top + cabeza) caja.scrollTop -= a.top + cabeza - b.top;
      else if (b.bottom > a.bottom) caja.scrollTop += b.bottom - a.bottom + 8;
    };
    requestAnimationFrame(mover);
    setTimeout(mover, 430); // el acordeón tarda 400 ms en abrirse
  }

  function pintarFilas() {
    for (const c of categoriasVisibles()) {
      const caja = $(`[data-cat-caja="${c.id}"]`);
      if (!caja) continue;
      const variosOrigenes = new Set(c.modelos.map((m) => `${m.proveedor}|${m.marca}`)).size > 1;
      for (const m of c.modelos) {
        const cifras = $(`[data-cifras-de="${m.id}"]`);
        if (cifras) cifras.innerHTML = cifrasFila(m, variosOrigenes);
        const lugar = $(`[data-chip-de="${m.id}"]`);
        if (lugar) {
          const [tono, texto] = chipDe(m);
          lugar.innerHTML = chip(tono, texto);
        }
      }
      const av = avanceCat(c);
      $("[data-resumen]", caja).textContent = cabezaResumen(c);
      pintarBarra($("[data-barra]", caja), av.pct, av.color);
      $("[data-dif]", caja).innerHTML = av.dif ? chip("ambar", conSigno(av.dif)) : "";
      const aqui = c.modelos.some((m) => m.id === S.foco);
      $("[data-marca]", caja).innerHTML = marca(av.hecha ? "hecho" : aqui ? "ahora" : "falta");
    }
  }

  // ---- La placa ----------------------------------------------------------------------------------------------------------------------------
  const vecinos = () => {
    const lista = visibles();
    const i = lista.findIndex((m) => m.id === S.foco);
    return { anterior: i > 0 ? lista[i - 1] : null, siguiente: i >= 0 ? (lista[i + 1] ?? null) : null };
  };

  function cifrasPlacaHTML(m) {
    const dif = m.contado ? m.contadas - (m.dijeron ?? 0) : null;
    const tono = dif == null ? "" : dif === 0 ? "verde" : "ambar";
    return `<div class="bm-cifra"><small>Dijeron</small><b>${m.dijeron != null ? miles(m.dijeron) : "—"}</b></div>
      <div class="bm-cifra"><small>Contaste</small><b>${m.contado ? miles(m.contadas) : "—"}</b></div>
      <div class="bm-cifra" data-tono="${tono}"><small>Diferencia</small><b>${dif == null ? "—" : conSigno(dif)}</b></div>`;
  }
  // Tres clases de botón, de lo más rápido a lo menos común: sumar de a varias, «ya llegaron todas» y «no llegó». El que ya se cumplió se queda en su lugar, marcado.
  function atajosHTML(m) {
    const [a, b] = atajosDial(m.dijeron, m.contadas);
    const yaLlegaron = m.contado && m.dijeron === m.contadas;
    const noLlego = m.contado && m.contadas === 0;
    return `<div class="bm-suma" role="group" aria-label="Sumar de a varias">
        <button type="button" data-accion="sumar" data-n="${a}">+${a}</button>
        <button type="button" data-accion="sumar" data-n="${b}">+${b}</button>
      </div>
      ${
        m.dijeron != null
          ? `<button type="button" class="bm-atajo bm-atajo-llegaron" ${yaLlegaron ? "disabled data-hecho" : `data-accion="poner" data-n="${m.dijeron}"`}>${ico("check")}Llegaron las ${miles(m.dijeron)}</button>`
          : ""
      }
      ${
        m.contadas > 0
          ? `<button type="button" class="bm-atajo bm-atajo-cero" data-accion="poner" data-n="0">${ico("rotate-ccw")}Poner en cero</button>`
          : `<button type="button" class="bm-atajo bm-atajo-cero" ${noLlego ? "disabled data-hecho" : 'data-accion="poner" data-n="0"'}>${ico("ban")}No llegó nada</button>`
      }`;
  }
  // «Anterior» y «Listo, siguiente», iguales y con su flecha (Felipe 2026-11-02). El nombre de la prenda no va en el botón: uno largo no cabía. Se oye y se ve en su `title`.
  function seguirHTML() {
    const { anterior, siguiente } = vecinos();
    const hayFiltro = S.proveedor || S.marca || S.tipo || S.estado || S.q;
    const volver = boton("secundario", `${ico("arrow-left", "h-4 w-4 shrink-0")}Anterior`, {
      attrs: anterior ? `data-accion="anterior" title="Volver a ${esc(anterior.nombre)}"` : "disabled",
    });
    // Con el último modelo, lo que sigue es cerrar. Si la lista está filtrada, no: faltan los que el filtro esconde.
    const adelante = siguiente
      ? boton("primario", `Listo, siguiente${ico("arrow-right", "h-4 w-4 shrink-0")}`, { attrs: `data-accion="siguiente" title="Sigue ${esc(siguiente.nombre)}" aria-label="Listo, siguiente: ${esc(siguiente.nombre)}"` })
      : hayFiltro
        ? boton("primario", `Listo, siguiente${ico("arrow-right", "h-4 w-4 shrink-0")}`, { attrs: 'disabled title="Es el último de esta lista"' })
        : boton("primario", `Pasar a cerrar${ico("arrow-right", "h-4 w-4 shrink-0")}`, { attrs: 'data-accion="cerrar"' });
    return `${volver}${adelante}`;
  }
  const chipsPlaca = (m) => {
    const [tono, texto] = chipDe(m);
    return `${m.tipo === "nuevo" ? chipNombre("pizarra", m.creada ? "Nuevo · ya creado" : "Nuevo · por crear", "sparkles") : chipNombre("neutro", "Re stock", "package")}${chipNombre("neutro", m.marca, "tag")}${tallasListas(m) && (m.tipo === "restock" || m.creada) ? chip("verde", "Entra al stock") : chip(tono, texto)}`;
  };

  function queHacerHTML(m) {
    const sin = m.contadas <= 0;
    const esNuevo = m.tipo === "nuevo" && !m.creada;
    const op = (valor, titulo, texto) => `<button type="button" role="radio" class="bm-opcion" data-accion="modo" data-modo="${valor}" aria-checked="${!sin && m.modo === valor}" ${sin ? "disabled" : ""}>
        <span class="bm-radio" aria-hidden="true"></span><span><b>${titulo}</b><small>${texto}</small></span></button>`;
    return `<div class="bm-seccion">
      <p class="bm-seccion-titulo">¿Qué deseas hacer?</p>
      <div class="bm-opciones" role="radiogroup" aria-label="¿Qué deseas hacer?">
        ${op("despues", "Solo cuadrar cantidad", "Tallas y colores, después.")}
        ${op("ahora", esNuevo ? "Crearlo con sus tallas ahora" : "Tallas y colores ahora", esNuevo ? "Primero se crea; después, sus tallas." : "Cuántas hay de cada una.")}
      </div>
      ${sin ? `<p class="text-sm text-taupe">Primero valida la cantidad total. Después podrás completar tallas y colores.</p>` : ""}
    </div>`;
  }

  function matrizHTML(m) {
    if (m.modo !== "ahora" || m.contadas <= 0) return "";
    if (m.tipo === "nuevo" && !m.creada) {
      return `<div class="bm-seccion"><p class="nota-cayla text-sm">Esta prenda todavía no está en el catálogo. Se crea con la misma hoja de hoy (nombre, precio, color) y aquí se siguen sus tallas.</p>
        <div>${boton("secundario", `${ico("plus", "h-4 w-4")}Crear ahora`, { attrs: 'data-accion="crear"' })}</div></div>`;
    }
    const tallas = tallasDe(m);
    const quedan = tallasPorAgregar(m).length > 0;
    const filas = (m.matriz ?? [])
      .map(
        (f, i) => `<tr>
        <td><span class="bm-color"><i data-color-dato style="background:${D.colores.find((c) => c.nombre === f.color)?.hex}"></i>${esc(f.color)}</span></td>
        ${tallas.map((t) => `<td><input class="bm-celda" inputmode="numeric" autocomplete="off" data-fila="${i}" data-talla="${esc(t)}" aria-label="${esc(f.color)}, talla ${esc(t)}" value="${f.celdas[t] || ""}" placeholder="0" /></td>`).join("")}
        <td class="bm-fila-total" data-total-fila="${i}">${miles(Object.values(f.celdas).reduce((a, b) => a + (Number(b) || 0), 0))}</td>
        <td><button type="button" class="bm-quitar" data-accion="quitar-color" data-fila="${i}" aria-label="Quitar ${esc(f.color)}" title="Quitar ${esc(f.color)}">${ico("trash-2")}</button></td>
      </tr>`,
      )
      .join("");
    return `<div class="bm-seccion" id="matriz">
      <p class="bm-seccion-titulo">Tallas y colores</p>
      <div class="bm-matriz-caja scroll-cayla"><table class="bm-matriz"><thead><tr><th>Color</th>${tallas
        .map((t) => `<th><span class="bm-talla"><span>${esc(t)}</span>${tallas.length > 1 ? `<button type="button" class="bm-talla-quitar" data-accion="quitar-talla" data-talla="${esc(t)}" aria-label="Quitar la talla ${esc(t)}" title="Quitar la talla ${esc(t)}">${ico("x")}</button>` : ""}</span></th>`)
        .join("")}<th>Total</th><th><span class="sr-only">Quitar</span></th></tr></thead><tbody>${filas || `<tr><td colspan="${tallas.length + 3}" class="text-sm text-taupe" style="padding:12px">Agrega el primer color que llegó.</td></tr>`}</tbody></table></div>
      <div class="bm-matriz-pie">
        <span class="bm-matriz-botones">
          <button type="button" class="btn-cayla btn-secundario btn-chico" data-accion="agregar-color"><span class="relative"><span class="inline-flex items-center gap-1.5">${ico("plus", "h-4 w-4")}Agregar color</span></span></button>
          ${quedan ? `<button type="button" class="btn-cayla btn-secundario btn-chico" data-accion="agregar-talla"><span class="relative"><span class="inline-flex items-center gap-1.5">${ico("plus", "h-4 w-4")}Agregar talla</span></span></button>` : ""}
        </span>
        <span class="bm-matriz-total" id="matriz-total">${totalMatrizHTML(m)}</span>
      </div>
    </div>`;
  }
  /** Lo que se puede sumar: primero lo que la categoría ofrece, de lo más a lo menos común; después, el resto del catálogo. */
  function tallasPorAgregar(m) {
    const { habituales, otras, resto } = categoria(m.cat).tallas;
    const usadas = new Set(tallasDe(m));
    const libres = (lista) => lista.filter((t) => !usadas.has(t));
    return [...libres(habituales).map((t) => ({ valor: t, texto: t })), ...libres(otras).map((t) => ({ valor: t, texto: t })), ...libres(resto).map((t) => ({ valor: t, texto: t, aparte: true }))];
  }
  function totalMatrizHTML(m) {
    const t = totalMatriz(m);
    const d = m.contadas - t;
    const lado = d === 0 ? "Cuadra con lo contado" : d > 0 ? `Faltan ${miles(d)} por repartir` : `Te pasaste por ${miles(-d)}`;
    return `<span data-tono="${d === 0 ? "verde" : "ambar"}" class="bm-matriz-total">${lado} · <b>${miles(t)}</b> de ${miles(m.contadas)}</span>`;
  }

  function otraCosaHTML(m) {
    const cat = categoria(m.cat);
    const yaEstan = new Set(S.modelos.map((x) => x.nombre));
    const parecidas = cat.catalogo.filter((n) => !yaEstan.has(n));
    return `<div class="bm-otra">
      ${
        parecidas.length
          ? `<div style="display:grid;gap:6px"><p class="bm-etiqueta-chica">Se parecen · toca si llegó esa</p><div class="bm-chipitos">${parecidas
              .map((n) => `<button type="button" class="rc-anotada-chip" data-accion="agregar-parecida" data-nombre="${esc(n)}" aria-label="Llegó ${esc(n)}: agregarla y contarla">${ico("plus", "h-4 w-4 shrink-0")}<b>${esc(n)}</b></button>`)
              .join("")}</div></div>`
          : ""
      }
      <div class="buscador">${ico("search", "buscador-icono")}<input id="buscar-otra" type="search" autocomplete="off" spellcheck="false" placeholder="Busca otra (Ej. ${esc(cat.catalogo[0])})" aria-label="Buscar otra prenda" /><span class="buscador-hilo" aria-hidden="true"></span></div>
      <button type="button" class="btn-cayla btn-enlace" style="justify-self:start" data-accion="aviso" data-texto="En el ERP suma prendas «sin nombre», como hoy: hay que describirlas antes de cerrar.">Llegaron otras y aún no sé cómo se llaman</button>
    </div>`;
  }

  function guardadoTexto(m) {
    return S.guardado === "guardando" ? "Guardando…" : S.guardado === "guardado" ? "Guardado" : m.contado ? `Contó ${S.quien}` : "";
  }

  function dibujarPlaca() {
    const m = modeloEnFoco();
    const panel = $("#placa");
    if (!m) {
      panel.innerHTML = `<p class="bm-vacio">Elige un modelo a la izquierda.</p>`;
      return;
    }
    const cat = categoria(m.cat);
    panel.innerHTML = `<div class="bm-scroll scroll-cayla">
      <div class="bm-placa-cabeza">
        ${foto(m, true)}
        <div class="bm-placa-textos">
          <h2>${esc(m.nombre)}</h2>
          <p>${esc(cat.nombre)} · ${esc(m.proveedor)}</p>
          <div class="bm-chips" id="placa-chips">${chipsPlaca(m)}</div>
        </div>
        <div class="bm-placa-derecha">
          <p class="bm-guardado" id="placa-guardado" aria-live="polite">${guardadoTexto(m)}</p>
          <div class="bm-placa-acciones">
            <button type="button" class="btn-cayla btn-enlace" data-accion="otra-cosa" aria-expanded="${S.otraCosa}">¿Llegó otra cosa?</button>
            <button type="button" class="btn-cayla btn-enlace" data-accion="aviso" data-texto="En el ERP abre la misma hoja de hoy: qué pasó, en una línea y a tu nombre. Compras lo lee para reclamar.">Anotar observación</button>
          </div>
        </div>
      </div>
      ${S.otraCosa ? otraCosaHTML(m) : ""}
      <div class="bm-cuenta">
        ${dialHTML(m)}
        <div class="bm-cifras" id="placa-cifras">${cifrasPlacaHTML(m)}</div>
        <div class="bm-cuenta-lado">
          <div class="bm-atajos" id="placa-atajos">${atajosHTML(m)}</div>
          <p class="rc-dial-pista">Toca el número para escribirlo</p>
        </div>
        <div class="bm-seguir" id="placa-seguir">${seguirHTML()}</div>
      </div>
      <div id="placa-que">${queHacerHTML(m)}</div>
      <div id="placa-matriz">${matrizHTML(m)}</div>
    </div>`;
    marcarDesborde();
  }

  /** Lo que cambia al tocar el contador, sin redibujar la placa. */
  function pintarPlaca(m) {
    const set = (id, html) => {
      const el = $(id);
      if (el) el.innerHTML = html;
    };
    set("#placa-chips", chipsPlaca(m));
    set("#placa-cifras", cifrasPlacaHTML(m));
    // Solo si cambió algo: redibujar en cada toque le quitaría el foco y la respuesta al botón que se acaba de tocar.
    const atajos = $("#placa-atajos");
    const nuevos = atajosHTML(m);
    if (atajos && atajos.dataset.firma !== nuevos) {
      atajos.innerHTML = nuevos;
      atajos.dataset.firma = nuevos;
    }
    set("#placa-que", queHacerHTML(m));
    const g = $("#placa-guardado");
    if (g) g.textContent = guardadoTexto(m);
  }

  // ---- El resumen -----------------------------------------------------------------------------------------------------------------------------
  function resumenHTML() {
    const c = cifrasDelEnvio();
    const tono = c.diferencia === 0 ? "verde" : "ambar";
    const estado = (clave, n) => {
      const e = ESTADOS[clave];
      return `<button type="button" class="bm-estado" data-accion="estado" data-estado="${clave}" aria-pressed="${S.estado === clave}" title="${e.texto}"><span class="bm-estado-punto" data-tono="${e.tono}">${ico(e.icono)}</span><span class="bm-estado-nombre">${e.texto}</span><b>${miles(n)}</b></button>`;
    };
    const conFoto = S.papeles.filter((p) => p.foto).length;
    return `<div class="bm-scroll scroll-cayla"><div class="bm-resumen-cuerpo">
        <div class="bm-titulo"><h2>Resumen del envío</h2></div>
        <dl class="bm-totales">
          <div class="bm-total"><dt>Dijeron</dt><dd>${miles(c.dijeron)}</dd></div>
          <div class="bm-total" data-grande><dt>Contaste</dt><dd id="total-contadas">${odometroHTML(c.contadas)}</dd></div>
          <div class="bm-total" id="fila-dif" data-tono="${tono}"><dt>Diferencia en lo contado</dt><dd id="total-dif">${conSigno(c.diferencia)}</dd></div>
        </dl>
        <div class="bm-avance" id="avance">
          <p><span>Avance</span><b id="avance-pct">${Math.round(avanceDelEnvio(c))}%</b></p>
          ${barra(avanceDelEnvio(c), colorAvance(avanceDelEnvio(c)), "normal")}
        </div>
        <div class="bm-estados" id="estados">
          ${estado("cuadran", c.cuadran)}${estado("diferencia", c.diferencias)}${estado("por-contar", c.porContar)}
          <div class="bm-separador"></div>
          ${estado("despues", c.despues)}
        </div>
        <button type="button" class="bm-combo" id="combo-quien" data-accion="abrir-quien" aria-haspopup="listbox" aria-label="Quién cuenta: ${esc(S.quien)}"><span class="bm-avatar" aria-hidden="true">${esc(S.quien.split(" ").map((p) => p[0]).slice(0, 2).join(""))}</span><span class="grid min-w-0"><small class="bm-combo-rotulo">Quién cuenta</small><span class="truncate">${esc(S.quien)}</span></span>${ico("chevron-down")}</button>
        ${boton("secundario", `${ico("camera", "h-4 w-4")}<span class="bm-fotos-texto">Subir foto de facturas</span> <small>${conFoto} de ${S.papeles.length}</small>`, { clase: "bm-fotos-boton", attrs: 'data-accion="fotos" aria-label="Subir foto de facturas"' })}
      </div></div>
      <div class="bm-resumen-pie" id="resumen-pie">${pieResumenHTML(c)}</div>`;
  }
  function pieResumenHTML(c) {
    const quedan = c.contadas - c.vender;
    return `<p>Al cerrar: <b>${miles(c.vender)}</b> se pueden vender ya · <b>${miles(quedan)}</b> quedan para terminar después.</p>
      ${boton("primario", `Pasar a cerrar${ico("arrow-right", "h-4 w-4")}`, { attrs: `data-accion="cerrar" title="${c.porContar > 0 ? `Lo que no cuentes (${c.porContar} ${c.porContar === 1 ? "modelo" : "modelos"}) sale como faltante.` : "Todo está contado."}"` })}
      <p class="bm-resumen-nota">Todo se guarda solo.</p>`;
  }
  function dibujarResumen() {
    $("#resumen").innerHTML = resumenHTML();
  }
  /** Actualiza el resumen en su lugar: las cifras ruedan y la barra se desliza, no vuelven a entrar. */
  function pintarResumen() {
    const caja = $("#total-contadas");
    if (!caja) return dibujarResumen();
    const c = cifrasDelEnvio();
    const pct = avanceDelEnvio(c);
    rodar(caja, c.contadas);
    $("#total-dif").textContent = conSigno(c.diferencia);
    $("#fila-dif").dataset.tono = c.diferencia === 0 ? "verde" : "ambar";
    $("#avance-pct").textContent = `${Math.round(pct)}%`;
    pintarBarra($("#avance"), pct, colorAvance(pct));
    const cuantos = { cuadran: c.cuadran, diferencia: c.diferencias, "por-contar": c.porContar, despues: c.despues };
    for (const [clave, n] of Object.entries(cuantos)) {
      const fila = $(`[data-accion="estado"][data-estado="${clave}"]`);
      if (!fila) continue;
      $("b", fila).textContent = miles(n);
      fila.setAttribute("aria-pressed", String(S.estado === clave));
    }
    $("#resumen-pie").innerHTML = pieResumenHTML(c);
    const tray = $("#tray");
    if (tray) tray.style.setProperty("--tc", colorAvance(pct));
    const bola = $("#tray-bola");
    if (bola) bola.style.setProperty("--pp", Math.min(100, Math.round(pct)));
    const det = $("#tray-detalle");
    if (det) det.textContent = `${miles(c.contadas)} de ${miles(c.dijeron)}`;
  }

  // ---- Las acciones -------------------------------------------------------------------------------------------------------------------------
  let reloj;
  function simularGuardado() {
    S.guardado = "guardando";
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      S.guardado = "guardado";
      const g = $("#placa-guardado");
      if (g) g.textContent = "Guardado";
    }, 550);
  }
  function poner(n) {
    const m = modeloEnFoco();
    const antes = { contadas: m.contadas, tono: estadoDial(m.contadas, m.dijeron, m.contado).tono };
    m.contadas = Math.min(99999, Math.max(0, Math.trunc(n)));
    m.contado = true;
    simularGuardado();
    pintarDial(m, antes);
    pintarPlaca(m);
    const lugar = $("#placa-matriz");
    if (lugar && (m.modo === "ahora" || lugar.innerHTML)) {
      if ($("#matriz-total") && m.contadas > 0) $("#matriz-total").innerHTML = totalMatrizHTML(m);
      else lugar.innerHTML = matrizHTML(m);
    }
    pintarFilas();
    pintarTipos();
    pintarResumen();
    if (S.estado) dibujarLista();
  }
  function irA(id, { escribir = false } = {}) {
    S.foco = id;
    S.plegada = false;
    S.otraCosa = false;
    S.guardado = null;
    pintarAcordeon();
    pintarTipos();
    dibujarPlaca();
    filaALaVista();
    if (escribir) abrirEditor();
  }
  function abrirEditor() {
    const m = modeloEnFoco();
    const num = $(".bm-placa .rc-dial-numero");
    if (!num || !m) return;
    const entrada = document.createElement("input");
    entrada.type = "text";
    entrada.inputMode = "numeric";
    entrada.autocomplete = "off";
    entrada.className = "rc-dial-caja";
    entrada.placeholder = "0";
    entrada.value = m.contado ? String(m.contadas) : "";
    entrada.setAttribute("aria-label", `Cuántas ${m.nombre} llegaron`);
    num.replaceWith(entrada);
    entrada.focus();
    entrada.select();
    let hecho = false;
    const volverNumero = () => {
      const nuevo = document.createElement("button");
      nuevo.type = "button";
      nuevo.className = "rc-dial-numero";
      nuevo.dataset.accion = "escribir";
      nuevo.setAttribute("aria-label", `Escribir cuántas ${m.nombre} llegaron`);
      nuevo.innerHTML = odometroHTML(modeloEnFoco().contadas);
      entrada.replaceWith(nuevo);
    };
    const dejar = (guardar, seguir) => {
      if (hecho) return;
      hecho = true;
      const t = entrada.value.replace(/\D/g, "").slice(0, 5);
      volverNumero();
      if (guardar && t !== "" && (Number(t) !== m.contadas || !m.contado)) poner(Number(t));
      if (seguir) {
        const { siguiente } = vecinos();
        if (siguiente) irA(siguiente.id, { escribir: true });
      }
    };
    entrada.addEventListener("input", () => (entrada.value = entrada.value.replace(/\D/g, "").slice(0, 5)));
    entrada.addEventListener("blur", () => dejar(true, false));
    entrada.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        dejar(true, true); // Enter deja el número y pasa al siguiente modelo, con su número listo para escribir
      } else if (e.key === "Escape") {
        e.preventDefault();
        dejar(false, false);
      }
    });
  }

  function refrescarLista() {
    acomodarFoco();
    dibujarLista();
    pintarTipos();
    dibujarPlaca();
    pintarResumen();
  }

  // Lista flotante de un filtro o del combo de quién cuenta
  function cerrarLista() {
    $(".bm-lista-flotante")?.remove();
    $$(".pildora-filtro[data-abierta]").forEach((p) => p.removeAttribute("data-abierta"));
    document.removeEventListener("pointerdown", fueraDeLista, true);
  }
  function fueraDeLista(e) {
    if (!e.target.closest(".bm-lista-flotante")) {
      e.stopPropagation();
      cerrarLista();
    }
  }
  function abrirLista(ancla, opciones, valor, alElegir) {
    cerrarLista();
    const r = ancla.getBoundingClientRect();
    const lista = document.createElement("div");
    lista.className = "bm-lista-flotante anim-revelar lista-flotante scroll-cayla rounded-lg";
    lista.setAttribute("role", "listbox");
    lista.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 240))}px`;
    lista.style.top = `${r.bottom + 6}px`;
    lista.style.minWidth = `${Math.max(192, r.width)}px`;
    lista.innerHTML = opciones
      .map((o, i) => `${o.aparte && !opciones[i - 1]?.aparte ? '<p class="bm-op-titulo">Otras del catálogo</p>' : ""}<button type="button" role="option" class="bm-op" data-i="${i}" aria-selected="${o.valor === valor}"><span class="min-w-0 truncate">${esc(o.texto)}</span>${o.valor === valor ? ico("check") : ""}</button>`)
      .join("");
    lista.addEventListener("click", (e) => {
      const b = e.target.closest(".bm-op");
      if (!b) return;
      cerrarLista();
      alElegir(opciones[Number(b.dataset.i)].valor);
    });
    lista.addEventListener("keydown", (e) => {
      const bs = $$(".bm-op", lista);
      const i = bs.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        bs[Math.min(bs.length - 1, i + 1)]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        bs[Math.max(0, i - 1)]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cerrarLista();
        ancla.focus();
      }
    });
    document.body.append(lista);
    // Si abajo no cabe, abre hacia arriba: una lista fuera de la pantalla no se puede tocar.
    const alto = lista.offsetHeight;
    if (r.bottom + 6 + alto > window.innerHeight - 8) {
      const arriba = r.top - 6 - alto;
      if (arriba >= 8) lista.style.top = `${arriba}px`;
      else {
        lista.style.top = "8px";
        lista.style.maxHeight = `${Math.max(120, r.top - 14)}px`;
      }
    }
    ($('[aria-selected="true"]', lista) ?? $(".bm-op", lista))?.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener("pointerdown", fueraDeLista, true));
  }

  function aviso(texto, deshacer) {
    const caja = $("#avisos");
    const a = document.createElement("div");
    a.className = "bm-aviso";
    a.textContent = texto;
    if (deshacer) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-cayla btn-enlace bm-aviso-deshacer";
      b.innerHTML = `${ico("undo-2", "h-4 w-4")}Deshacer`;
      b.addEventListener("click", () => {
        a.remove();
        deshacer();
      });
      a.append(b);
    }
    caja.append(a);
    setTimeout(() => a.remove(), deshacer ? 7000 : 4200);
  }
  /** La columna del color se fija solo si la tabla no cabe y hay que desplazarla. */
  function marcarDesborde() {
    const caja = $(".bm-matriz-caja");
    if (caja) caja.toggleAttribute("data-desborda", caja.scrollWidth > caja.clientWidth + 1);
  }
  /** Vuelve a dibujar la tabla y lo que depende de ella. */
  function repintarTallas(m) {
    $("#placa-matriz").innerHTML = matrizHTML(m);
    marcarDesborde();
    $("#placa-chips").innerHTML = chipsPlaca(m);
    pintarFilas();
    pintarResumen();
    simularGuardado();
    const g = $("#placa-guardado");
    if (g) g.textContent = "Guardando…";
  }
  /** Quitar no pregunta: si tenía cantidades, el aviso ofrece deshacerlo (se confirma solo lo que no se puede volver atrás). */
  function conDeshacer(m, texto, cambio) {
    const antes = { matriz: clon(m.matriz), tallas: [...tallasDe(m)] };
    const perdidas = cambio();
    repintarTallas(m);
    if (perdidas > 0) {
      aviso(`${texto}: ${miles(perdidas)} ${perdidas === 1 ? "prenda" : "prendas"} por repartir otra vez.`, () => {
        m.matriz = antes.matriz;
        m.tallas = antes.tallas;
        if (modeloEnFoco() === m) repintarTallas(m);
      });
    }
  }

  function hoja(html, ancha = false) {
    cerrarHoja();
    const velo = document.createElement("div");
    velo.className = "bm-velo";
    velo.id = "velo";
    velo.innerHTML = `<div class="bm-hoja hoja-maqueta" ${ancha ? "data-ancha" : ""} role="dialog" aria-modal="true"><button type="button" class="bm-hoja-cerrar" data-accion="cerrar-hoja" aria-label="Cerrar">${ico("x")}</button>${html}</div>`;
    velo.addEventListener("pointerdown", (e) => {
      if (e.target === velo) cerrarHoja();
    });
    document.body.append(velo);
    $(".bm-hoja-cerrar", velo).focus({ preventScroll: true });
  }
  function cerrarHoja() {
    $("#velo")?.remove();
  }

  function hojaFotos() {
    hoja(`<h2>Fotos de las facturas</h2><p class="bm-hoja-bajada">Lo que le dieron a quien compró. Queda guardado con la compra y Compras lo ve al completarla.</p>
      <div class="bm-papeles">${S.papeles
        .map(
          (p) => `<div class="bm-papel"><span class="bm-papel-foto">${ico(p.foto ? "image" : "file-text")}</span><span><b>${esc(p.tipo)} ${esc(p.numero)}</b><small>${esc(p.proveedor)}</small></span>
            ${p.foto ? chip("verde", "Con foto") : boton("secundario", `${ico("camera", "h-4 w-4")}Subir foto`, { clase: "btn-chico", attrs: `data-accion="subir-foto" data-papel="${p.id}"` })}</div>`,
        )
        .join("")}</div>`);
  }
  function hojaCerrar() {
    const c = cifrasDelEnvio();
    hoja(`<h2>Aquí sigue Cerrar</h2><p class="bm-hoja-bajada">Cerrar no cambia en esta maqueta. Llegarías con ${miles(c.contadas)} prendas contadas de ${miles(c.dijeron)}, ${c.diferencias} ${c.diferencias === 1 ? "modelo" : "modelos"} con diferencia y ${c.porContar} sin contar.</p>`);
  }
  function hojaNotas() {
    hoja(
      `<h2>Qué mirar en esta maqueta</h2><p class="bm-hoja-bajada">El marco, el contador, los filtros y los colores son los reales del ERP. Los datos son inventados y nada se guarda.</p>
      <div class="bm-notas">
        <div><h3>Se queda de lo que ya hay</h3><ul>
          <li>El contador con sus atajos, y las cifras que ruedan.</li>
          <li>Las categorías que se abren y se pliegan.</li>
          <li>Los filtros de Proveedor y Marca y las flechas de orden.</li>
          <li>El Trayecto, ahora con el nombre de sus cinco paradas.</li>
        </ul></div>
        <div><h3>Se toma del boceto</h3><ul>
          <li>Re stock y Producto nuevo arriba: <span>siempre marca el tipo de lo que se está contando; al tocar uno, la lista deja solo esos.</span></li>
          <li>Tres columnas alineadas arriba y abajo, cada una con su scroll: <span>la barra de abajo se fue.</span></li>
          <li>Resumen a la derecha: <span>totales, estados, quién cuenta, fotos y «Pasar a cerrar», siempre a la vista.</span></li>
          <li>Buscador de modelos, foto y cifras de cada modelo.</li>
          <li>«¿Qué deseas hacer?» y las tallas en la misma pantalla: <span>hoy se abren en una hoja.</span></li>
        </ul></div>
        <div><h3>Del boceto, pero distinto</h3><ul>
          <li>Re stock y Nuevo no se eligen para todo el envío: <span>un envío puede traer los dos, y el sistema ya sabe cuál es cada modelo por lo que anotó Compras.</span></li>
          <li>Las filas de estado del resumen filtran la lista: <span>en el boceto solo informan.</span></li>
          <li>«Faltan tallas» sale en ámbar solo si pediste hacerlo ahora: <span>si no, la lista entera estaría en ámbar.</span></li>
        </ul></div>
        <div><h3>Del boceto, lo que no se tomó</h3><ul>
          <li>Los cinco pasos: <span>no son el camino real; el Trayecto ya dice en qué va el envío.</span></li>
          <li>«Guardar y completar después»: <span>todo se guarda solo.</span></li>
          <li>«Esp.» y «Cont.»: <span>se lee «48 de 48», sin abreviaturas.</span></li>
          <li>La tarjeta «Variaciones pendientes»: <span>es la fila «Tallas para después» del resumen.</span></li>
        </ul></div>
        <div><h3>Prueba también</h3><ul>
          <li>Toca el número del contador, escribe y aprieta Enter: <span>guarda y pasa al siguiente modelo, listo para escribir.</span></li>
          <li>«Envío grande»: <span>74 modelos y más de 100 mil prendas.</span></li>
          <li>Con «/» vas al buscador.</li>
          <li>Tallas y colores: <span>arranca con las de siempre de cada categoría (S, M, L; en jeans, 28, 30, 32), que son las que el catálogo ya marca así. «Agregar talla» ofrece las demás, de la más a la menos común, y cada talla se quita con su ×.</span></li>
          <li>«Categorías» en esta chapa: <span>cambia entre tres colores para las categorías, para compararlos mirando.</span></li>
          <li>Cuenta varios modelos y mira las barras: <span>van de rojo a ámbar y a verde mientras se llenan. El Trayecto de arriba hace lo mismo con el envío entero.</span></li>
        </ul></div>
      </div>`,
      true,
    );
  }

  document.addEventListener("click", (e) => {
    // La maqueta no navega: el menú y los enlaces del marco se quedan aquí.
    const enlace = e.target.closest("a[href]");
    if (enlace) e.preventDefault();

    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const accion = b.dataset.accion;
    const m = modeloEnFoco();
    switch (accion) {
      case "elegir":
        if (b.dataset.id !== S.foco) irA(b.dataset.id);
        break;
      case "categoria": {
        const c = categoriasVisibles().find((x) => x.id === b.dataset.cat);
        if (!c) break;
        const aqui = c.modelos.some((x) => x.id === S.foco);
        if (aqui) {
          S.plegada = !S.plegada;
          pintarAcordeon();
        } else irA((c.modelos.find((x) => !x.contado) ?? c.modelos[0]).id);
        break;
      }
      case "tipo": {
        const t = b.dataset.tipo;
        S.tipo = S.tipo === t ? null : t;
        S.estado = null;
        refrescarLista();
        break;
      }
      case "quitar-tipo":
        S.tipo = null;
        refrescarLista();
        break;
      case "estado":
        S.estado = S.estado === b.dataset.estado ? null : b.dataset.estado;
        refrescarLista();
        break;
      case "quitar-estado":
        S.estado = null;
        refrescarLista();
        break;
      case "orden":
        S.orden = S.orden === b.dataset.ordenValor ? null : b.dataset.ordenValor;
        dibujarLista();
        dibujarPlaca();
        break;
      case "abrir-filtro": {
        const campo = b.dataset.campo;
        const nombreTodos = campo === "proveedor" ? "Todos" : "Todas";
        b.closest(".pildora-filtro").setAttribute("data-abierta", "");
        abrirLista(b, [{ valor: null, texto: nombreTodos }, ...opcionesFiltro(campo).map((v) => ({ valor: v, texto: v }))], S[campo], (v) => {
          S[campo] = v;
          refrescarLista();
        });
        break;
      }
      case "quitar-filtro":
        S[b.dataset.campo] = null;
        refrescarLista();
        break;
      case "borrar-busqueda":
        S.q = "";
        refrescarLista();
        $("#buscar")?.focus();
        break;
      case "escribir":
        abrirEditor();
        break;
      case "sumar":
        poner(m.contadas + Number(b.dataset.n));
        break;
      case "poner":
        poner(Number(b.dataset.n));
        break;
      case "siguiente": {
        const { siguiente } = vecinos();
        if (siguiente) irA(siguiente.id);
        break;
      }
      case "anterior": {
        const { anterior } = vecinos();
        if (anterior) irA(anterior.id);
        break;
      }
      case "modo":
        m.modo = b.dataset.modo;
        if (m.modo === "ahora" && !m.matriz && (m.tipo === "restock" || m.creada)) m.matriz = [{ color: D.colores.find((c) => c.hex === m.color)?.nombre ?? "Crema", celdas: {} }];
        $("#placa-que").innerHTML = queHacerHTML(m);
        $("#placa-matriz").innerHTML = matrizHTML(m);
        marcarDesborde();
        $("#placa-chips").innerHTML = chipsPlaca(m);
        pintarFilas();
        pintarResumen();
        break;
      case "crear":
        m.creada = true;
        m.matriz = m.matriz ?? [{ color: D.colores.find((c) => c.hex === m.color)?.nombre ?? "Crema", celdas: {} }];
        aviso("En el ERP aquí se abre la hoja de Nuevo producto. En la maqueta la damos por creada.");
        dibujarPlaca();
        pintarTipos();
        break;
      case "quitar-color": {
        const i = Number(b.dataset.fila);
        conDeshacer(m, `Quitaste ${m.matriz[i].color}`, () => {
          const [fila] = m.matriz.splice(i, 1);
          return Object.values(fila.celdas).reduce((a, n) => a + (Number(n) || 0), 0);
        });
        break;
      }
      case "quitar-talla": {
        const t = b.dataset.talla;
        conDeshacer(m, `Quitaste la talla ${t}`, () => {
          let perdidas = 0;
          for (const f of m.matriz ?? []) {
            perdidas += Number(f.celdas[t]) || 0;
            delete f.celdas[t];
          }
          m.tallas = tallasDe(m).filter((x) => x !== t);
          return perdidas;
        });
        break;
      }
      case "agregar-talla":
        abrirLista(b, tallasPorAgregar(m), null, (t) => {
          m.tallas = [...tallasDe(m), t].sort(compararTallas);
          repintarTallas(m);
          // El cursor va a la talla nueva, en el primer color, para seguir escribiendo.
          $(`#matriz .bm-celda[data-talla="${CSS.escape(t)}"]`)?.focus();
        });
        break;
      case "agregar-color": {
        const usados = new Set((m.matriz ?? []).map((f) => f.color));
        const libres = D.colores.filter((c) => !usados.has(c.nombre));
        abrirLista(b, libres.map((c) => ({ valor: c.nombre, texto: c.nombre })), null, (color) => {
          m.matriz = [...(m.matriz ?? []), { color, celdas: {} }];
          $("#placa-matriz").innerHTML = matrizHTML(m);
          marcarDesborde();
          $$(`#matriz .bm-celda[data-fila="${m.matriz.length - 1}"]`)[0]?.focus();
          pintarFilas();
        });
        break;
      }
      case "otra-cosa":
        S.otraCosa = !S.otraCosa;
        dibujarPlaca();
        break;
      case "agregar-parecida": {
        const nombre = b.dataset.nombre;
        const nuevo = { id: `x${Date.now()}`, nombre, cat: m.cat, proveedor: m.proveedor, marca: m.marca, tipo: "restock", dijeron: null, contadas: 1, contado: true, color: m.color, modo: "despues", matriz: null, creada: false };
        S.modelos.splice(S.modelos.indexOf(m) + 1, 0, nuevo);
        S.foco = nuevo.id;
        S.otraCosa = false;
        refrescarLista();
        break;
      }
      case "abrir-quien":
        abrirLista(b, D.equipo.map((n) => ({ valor: n, texto: n })), S.quien, (n) => {
          S.quien = n;
          const combo = $("#combo-quien");
          combo.setAttribute("aria-label", `Quién cuenta: ${n}`);
          $(".bm-avatar", combo).textContent = n.split(" ").map((p) => p[0]).slice(0, 2).join("");
          $(".truncate", combo).textContent = n;
          const g = $("#placa-guardado");
          if (g) g.textContent = guardadoTexto(modeloEnFoco());
        });
        break;
      case "fotos":
        hojaFotos();
        break;
      case "subir-foto":
        S.papeles.find((p) => p.id === b.dataset.papel).foto = true;
        hojaFotos();
        $('[data-accion="fotos"] small').textContent = `${S.papeles.filter((p) => p.foto).length} de ${S.papeles.length}`;
        aviso("Subiste la foto del papel (en la maqueta no sube nada).");
        break;
      case "cerrar":
        hojaCerrar();
        break;
      case "cerrar-hoja":
        cerrarHoja();
        break;
      case "aviso":
        aviso(b.dataset.texto);
        break;
      case "notas":
        hojaNotas();
        break;
      case "color-cat": {
        const claves = Object.keys(COLORES_CAT);
        colorCat = claves[(claves.indexOf(colorCat) + 1) % claves.length];
        $("#lista").dataset.catColor = colorCat;
        b.textContent = `Categorías: ${COLORES_CAT[colorCat]}`;
        break;
      }
      case "tam":
        S = crearEstado(S.tam === "grande" ? "normal" : "grande");
        $("[data-accion='tam']").setAttribute("aria-pressed", String(S.tam === "grande"));
        listaYaEntro = true;
        esqueleto();
        todo();
        break;
      case "reiniciar":
        S = crearEstado(S.tam);
        esqueleto();
        todo();
        aviso("La maqueta volvió a como empezó.");
        break;
    }
  });

  // Escribir en la búsqueda y en las celdas de tallas
  document.addEventListener("input", (e) => {
    if (e.target.id === "buscar") {
      S.q = e.target.value;
      dibujarLista();
      acomodarFocoSiHaceFalta();
      return;
    }
    if (e.target.classList?.contains("bm-celda")) {
      const m = modeloEnFoco();
      const entrada = e.target;
      entrada.value = entrada.value.replace(/\D/g, "").slice(0, 5);
      const fila = m.matriz[Number(entrada.dataset.fila)];
      fila.celdas[entrada.dataset.talla] = Number(entrada.value) || 0;
      const tot = $(`[data-total-fila="${entrada.dataset.fila}"]`);
      if (tot) tot.textContent = miles(Object.values(fila.celdas).reduce((a, b) => a + (Number(b) || 0), 0));
      $("#matriz-total").innerHTML = totalMatrizHTML(m);
      $("#placa-chips").innerHTML = chipsPlaca(m);
      pintarFilas();
      pintarResumen();
      simularGuardado();
      const g = $("#placa-guardado");
      if (g) g.textContent = "Guardando…";
    }
  });
  function acomodarFocoSiHaceFalta() {
    const antes = S.foco;
    acomodarFoco();
    if (antes !== S.foco) {
      pintarAcordeon();
      pintarTipos();
      dibujarPlaca();
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "")) {
      e.preventDefault();
      $("#buscar")?.focus();
    } else if (e.key === "Escape") {
      if ($("#velo")) cerrarHoja();
      else if ($(".bm-lista-flotante")) cerrarLista();
      else if (document.activeElement?.id === "buscar" && S.q) {
        S.q = "";
        refrescarLista();
        $("#buscar")?.focus();
      }
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && document.activeElement?.closest?.("#orden")) {
      e.preventDefault();
      S.orden = S.orden === "asc" ? "desc" : "asc";
      dibujarLista();
      dibujarPlaca();
      $('#orden [aria-checked="true"]')?.focus();
    }
  });

  window.addEventListener("resize", () => {
    marcarDesborde();
    medirMesa();
    pintarGotaOrden();
    cerrarLista();
  });

  // ---- El marco: el tema y el menú plegado funcionan ------------------------------------------------------------------------------------------
  function marco() {
    const raiz = $(".min-h-screen");
    const desplegado = $("#lateral").outerHTML;
    const plegado = $("#lateral-plegado").innerHTML;
    const ponerMenu = (plegar) => {
      if (plegar) raiz.setAttribute("data-lateral", "plegado");
      else raiz.removeAttribute("data-lateral");
      $("#lateral").outerHTML = plegar ? plegado : desplegado;
    };
    if (new URLSearchParams(location.search).get("menu") === "plegado") {
      ponerMenu(true);
      const b = $('button[aria-label*="menú lateral"]');
      if (b) {
        b.setAttribute("aria-label", "Expandir menú lateral");
        const flecha = b.querySelector("svg");
        if (flecha) flecha.style.transform = "rotate(180deg)";
      }
    }
    document.addEventListener("click", (e) => {
      const tema = e.target.closest('button[aria-label="Modo oscuro"], button[aria-label="Modo claro"]');
      if (tema) {
        const oscuro = document.documentElement.dataset.tema !== "oscuro";
        document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
        tema.setAttribute("aria-pressed", String(oscuro));
      }
      const plegar = e.target.closest('button[aria-label*="menú lateral"]');
      if (plegar) {
        const plegara = raiz.getAttribute("data-lateral") !== "plegado";
        ponerMenu(plegara);
        plegar.setAttribute("aria-label", plegara ? "Expandir menú lateral" : "Contraer menú lateral");
        plegar.setAttribute("title", plegara ? "Expandir menú lateral" : "Contraer menú lateral");
        const flecha = plegar.querySelector("svg");
        if (flecha) flecha.style.transform = plegara ? "rotate(180deg)" : "";
        setTimeout(() => {
          medirMesa();
          pintarGotaOrden();
        }, 60);
      }
    });
  }

  function todo() {
    pintarTipos();
    dibujarLista();
    dibujarPlaca();
    dibujarResumen();
    medirMesa();
  }

  const chapa = document.createElement("div");
  chapa.className = "bm-chapa";
  chapa.innerHTML = `<span>Maqueta · nada se guarda</span><button type="button" data-accion="notas">Qué mirar</button><button type="button" data-accion="color-cat" id="chapa-cat">Categorías: ${COLORES_CAT[colorCat]}</button><button type="button" data-accion="tam" aria-pressed="false">Envío grande</button><button type="button" data-accion="reiniciar">Reiniciar</button>`;
  document.body.append(chapa);
  const avisos = document.createElement("div");
  avisos.className = "bm-avisos";
  avisos.id = "avisos";
  avisos.setAttribute("aria-live", "polite");
  document.body.append(avisos);

  // Enlaces directos para mirar un estado: ?tema=oscuro, ?envio=grande, ?menu=plegado
  const q = new URLSearchParams(location.search);
  if (q.get("tema") === "oscuro") document.documentElement.dataset.tema = "oscuro";
  if (q.get("envio") === "grande") {
    S = crearEstado("grande");
    $("[data-accion='tam']").setAttribute("aria-pressed", "true");
  }

  marco();
  esqueleto();
  todo();
  if (document.fonts?.ready) document.fonts.ready.then(() => { medirMesa(); pintarGotaOrden(); });
})();
