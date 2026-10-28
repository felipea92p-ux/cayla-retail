// La página «Piezas»: el sistema de cada dirección en una sola hoja, para decidir y para construir. Todo se lee de los tokens vivos de la
// dirección (colores con su contraste medido, letras, formas, sombras) y las piezas son las mismas clases que usa la tienda.
(function () {
  const { T, C, I, P, campo, tarjeta, precioHTML, vacio } = window.PZ;
  const D = window.DIRECCION;
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hexA = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(c); if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); const r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c); return r ? [+r[1], +r[2], +r[3]] : null; };
  const lum = (rgb) => { const f = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const ratio = (a, b) => { const A = hexA(a), B = hexA(b); if (!A || !B) return null; const x = lum(A), y = lum(B); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const frase = (r, min) => (r === null ? "" : `<small class="pz-ratio ${r >= min ? "ok" : "mal"}">${r.toFixed(1)} : 1 ${r >= min ? "✓" : "✗"}</small>`);

  function colores() {
    const bg = tok("--bg");
    const L = [
      ["Fondo", "--bg"], ["Panel", "--panel"], ["Tinta", "--ink", "--bg", 4.5], ["Tenue", "--mute", "--bg", 4.5], ["Línea", "--line-2"],
      ["Botón", "--btn-bg", "--btn-ink", 4.5], ["Acento", "--acc", "--acc-ink", 4.5], ["Acento (texto)", "--acc-texto", "--bg", 4.5],
      ["Bien", "--ok", "--bg", 4.5], ["Atención", "--aviso-c", "--bg", 4.5], ["Error", "--error", "--bg", 4.5], ["Placa de la foto", "--placa"], ["Banda", "--band", "--band-ink", 4.5],
    ];
    return `<div class="pz-colores">${L.map(([n, v, contra, min]) => {
      const c = tok(v);
      const r = contra ? ratio(c, tok(contra)) : null;
      return `<div class="pz-color"><i style="background:var(${v})" aria-hidden="true"></i><b>${n}</b><code>${c}</code>${contra ? frase(r, min) : ""}<small class="mute">${v}</small></div>`;
    }).join("")}</div>`;
  }

  function piezas() {
    const alba = P("alba"), luna = P("luna"), rayas = P("rayas");
    return `
    <div class="cat-cab"><div><span class="ceja mute">Sistema · ${D.nombre}</span><h1 class="disp t-h1 sube">Las <em>piezas</em></h1><p class="mute pz-intro">Todo lo que se dibuja en la tienda, en una hoja. Se lee de los tokens vivos: cambia el tema (barra de arriba) y se actualiza.</p></div></div>
    <div class="pz">
      <section class="pz-sec"><h2 class="disp t-h3">Colores y contraste</h2><p class="mute">Cada texto se mide contra su fondo: ≥ 4,5 : 1 (WCAG AA). El rojo del logo no cambia en ningún tema.</p>${colores()}</section>

      <section class="pz-sec"><h2 class="disp t-h3">Letras</h2>
        <div class="pz-letras">
          <div><span class="ceja mute">Titular · ${tok("--f-display").split(",")[0]}</span><p class="disp" style="font-size:clamp(40px,6cqi,92px)">Separa en línea</p><p class="disp" style="font-size:clamp(28px,3.4cqi,52px)">Recoge en tu tienda</p></div>
          <div><span class="ceja mute">Cuerpo · ${tok("--f-body").split(",")[0]}</span><p style="font-size:18px;margin:0 0 8px">Mira lo que hay en cada tienda, sepáralo aquí y recógelo en tu tienda.</p><p class="mute" style="margin:0">Texto tenue para lo secundario: 15 px sobre el fondo, siempre a 4,5 : 1 o más.</p><p class="ceja" style="margin:16px 0 0">Rótulo en versalitas</p></div>
        </div>
      </section>

      <section class="pz-sec"><h2 class="disp t-h3">Botones, enlaces y píldoras</h2>
        <div class="pz-fila">
          <button class="btn">Agregar a la bolsa</button><button class="btn btn-sec">Arma un look ${I("chispas")}</button><button class="btn btn-chico">Chico</button><button class="btn" disabled>Entra para separar</button><a class="link" href="#piezas">Enlace en una frase</a><a class="ver" href="#piezas">Ver todo ${I("flecha")}</a>
        </div>
        <div class="pz-fila"><button class="pildora">Blusas</button><button class="pildora pildora-puesta">Talla M ${I("x", "ic-chica")}</button><button class="boton-limpiar">${I("filtro", "ic-chica")} Limpiar todo</button><span class="chip">Por confirmar</span><span class="chip chip-lista">${I("check", "ic-chica")} Lista para recoger</span><span class="chip chip-oferta">${I("chispas", "ic-chica")} Aniversario −15 %</span></div>
        <div class="pz-fila"><span class="pz-fondo-placa"><span class="ins ins-oferta">−15 %</span><span class="ins ins-nuevo">Nuevo</span><span class="ins ins-puesto">N.º 1</span></span><span class="ico pz-ico">${I("bolsa")}<span class="globo">2</span></span><span class="ico pz-ico">${I("corazonlleno")}</span><span class="ico pz-ico">${I("usuario")}<span class="punto-sesion"></span></span><span class="precio oferta grande"><b class="num">S/ 118</b><s class="num">S/ 139</s></span></div>
      </section>

      <section class="pz-sec"><h2 class="disp t-h3">Campos: cada estado se dice con texto, no solo con color</h2>
        <div class="pz-campos">
          ${campo({ id: "pz1", etiqueta: "Correo", placeholder: "tucorreo@gmail.com", nota: "Sin tocar." })}
          ${campo({ id: "pz2", etiqueta: "Correo", valor: "camila@gmail.com", estado: "sigue", nota: "Es el campo que sigue." })}
          ${campo({ id: "pz3", etiqueta: "Tu nombre", valor: "Camila", estado: "hecho", nota: "Listo." })}
          ${campo({ id: "pz4", etiqueta: "Contraseña", tipo: "password", valor: "abc", estado: "error", nota: "Mínimo 8 caracteres." })}
        </div>
        <div class="pz-fila"><label class="check"><input type="checkbox" checked><span class="check-caja">${I("check", "ic-chica")}</span><span>Soy mayor de 18 años <small>Obligatorio</small></span></label><span class="interruptor-fila" style="gap:12px"><button class="interruptor" role="switch" aria-checked="true" aria-label="Interruptor"><i></i></button> Solo lo que hay en Arequipa</span><span class="cantidad"><button aria-label="Quitar una">${I("menos")}</button><output class="num">2</output><button aria-label="Agregar una">${I("mas")}</button></span></div>
      </section>

      <section class="pz-sec"><h2 class="disp t-h3">La prenda: escenario con luz, sombra de piso y sus estados</h2>
        <div class="pz-tarjetas">${tarjeta(luna, 0, {}).replace("tj rv", "tj")}${tarjeta(alba, 1, {}).replace("tj rv", "tj")}${tarjeta(rayas, 2, {}).replace("tj rv", "tj")}
          <article class="tj tj-esq" aria-label="Cargando"><div class="tj-foto"></div><div class="tj-info"><i class="esq-linea"></i><i class="esq-linea corta"></i></div></article></div>
      </section>

      <section class="pz-sec"><h2 class="disp t-h3">Avisos, vacíos y errores</h2>
        <div class="pz-avisos">
          <div class="aviso-flot dentro"><span class="aviso-ico">${I("check")}</span><span class="aviso-t">Agregaste Blusa Kalessi, talla M.</span><a class="enlace" href="#bolsa">Ver mi bolsa (3)</a></div>
          <div class="aviso-flot dentro aviso-info"><span class="aviso-ico">${I("info")}</span><span class="aviso-t">Ahora ves lo que hay en Trujillo.</span></div>
          <div class="aviso-flot dentro aviso-error"><span class="aviso-ico">${I("alerta")}</span><span class="aviso-t">No pudimos agregarla. Vuelve a intentarlo.</span></div>
        </div>
        <div class="pz-vacios">${vacio({ icono: "bolsa", titulo: "Tu bolsa está vacía", texto: "Elige una prenda y su talla, o agrega un look completo.", acciones: `<a class="btn" href="#catalogo">Ver toda la tienda</a>`, chico: true })}${vacio({ icono: "tienda", titulo: "No pudimos cargar las prendas", texto: "Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.", acciones: `<a class="btn btn-sec" href="#piezas">Volver a intentar</a>`, chico: true })}</div>
      </section>

      <section class="pz-sec"><h2 class="disp t-h3">Formas, sombras y movimiento</h2>
        <div class="pz-formas">
          <div class="pz-forma" style="box-shadow:var(--sombra-s)"><b>Sombra S</b><small class="mute">Una tarjeta en reposo</small></div>
          <div class="pz-forma" style="box-shadow:var(--sombra-m)"><b>Sombra M</b><small class="mute">Sube al pasar el mouse</small></div>
          <div class="pz-forma" style="box-shadow:var(--sombra-l)"><b>Sombra L</b><small class="mute">Lo que flota: menús, avisos, tarjeta de miembro</small></div>
          <div class="pz-forma pz-radios"><b>Esquinas</b><small class="mute">tarjeta ${tok("--r")} · foto ${tok("--r-foto")} · botón ${tok("--r-btn")}</small></div>
        </div>
        <ul class="pz-mov">
          <li><b>Entrada</b> Las piezas suben 26 px y aparecen una vez, al llegar a la pantalla. Una sola vez, sin rebote.</li>
          <li><b>Parallax</b> En la portada, cada capa se mueve a distinta velocidad al bajar (5 a 12 % del scroll).</li>
          <li><b>La foto viaja</b> De la tarjeta a la ficha, con las transiciones de vista del navegador (0,55 s).</li>
          <li><b>La prenda vuela a la bolsa</b> Al agregar, la foto cruza hasta el globo, que da un golpecito.</li>
          <li><b>Al pasar el mouse</b> La tarjeta sube 6 px y ofrece «Agregar» con sus tallas; el botón sube 2 px.</li>
          <li><b>Con «reducir movimiento»</b> Todo queda quieto: nada depende del movimiento para entenderse.</li>
        </ul>
        <div class="pz-fila"><button class="btn btn-sec" data-pz-aviso>Probar un aviso</button><button class="btn btn-sec" data-pz-volar>Probar la foto que vuela</button></div>
      </section>
    </div>`;
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-pz-aviso]")) window.TIENDA.avisar("Agregaste Blusa Kalessi, talla M.", { accion: { texto: "Ver mi bolsa (3)", href: "#bolsa" } });
    if (e.target.closest("[data-pz-volar]")) { window.TIENDA.agregar("kalessi", "Chocolate", "M", 1, document.querySelector(".pz-tarjetas .tj-foto img"), true); }
  });

  window.PANTALLAS.piezas = piezas;
})();
