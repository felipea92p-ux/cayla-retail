// La lógica de los filtros de color y talla de la maqueta (2026-10-25). Pura: no toca el navegador, así que se prueba en Node
// (`verificar/logica.prueba.mjs`). Las dos opciones usan ESTA lógica: lo único que cambia entre ellas es cómo se dibuja.
//
// Contrato (lo que la tienda de verdad tendría que cumplir):
//  1. LA UNIDAD ES LA VARIANTE. «Negro en M» es una variante (color + talla) con stock en Trujillo. Una prenda coincide si ALGUNA
//     de sus variantes cumple el color Y la talla a la vez; si se filtraran por separado, saldría una prenda con Negro en S y Beige en
//     M, y al abrirla el negro no estaría en M.
//  2. Dentro de una faceta se SUMA (Negro o Blanco); entre facetas se CRUZA (y, en la misma variante).
//  3. Cada opción dice cuántas prendas daría, contando las demás facetas pero no la suya (así se ve cuánto se gana al sumarla).
//  4. Una opción que daría 0 no se puede elegir (la pantalla la apaga): el estado «0 resultados» no se alcanza tocando filtros.
//     Cambiar de grupo o de categoría podría dejar 0; ahí `navegar` suelta lo que ya no existe y dice qué soltó. Y una opción ya
//     elegida puede quedar «muerta» (sin prendas con lo que se sumó en la otra faceta): `muertas` las lista para marcarlas.
//  5. «Estándar» y «Única» son UNA opción para quien compra («Estándar / única»); «S/M» cuenta como S y como M.
(function (raiz) {
  "use strict";

  var ORDEN_TALLAS = ["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34", "UNICA"];
  var ETIQUETA_TALLA = { UNICA: "Estándar / única" };
  var POR_PAGINA = 30;
  var ORDENES = ["destacado", "menor", "mayor"];
  var NOMBRE_ORDEN = { destacado: "Destacado", menor: "Menor precio", mayor: "Mayor precio" };

  function clavesTalla(t) {
    if (t === "Estándar" || t === "Única") return ["UNICA"];
    if (t === "S/M") return ["S", "M"];
    return [String(t)];
  }
  function sistemaTalla(k) {
    return k === "UNICA" ? "unica" : /^\d+$/.test(k) ? "cintura" : "letra";
  }
  function ordenTalla(k) {
    var i = ORDEN_TALLAS.indexOf(k);
    return i < 0 ? 99 : i;
  }
  function etiquetaTalla(k) {
    return ETIQUETA_TALLA[k] || k;
  }
  var tiene = function (arr, x) {
    return arr.indexOf(x) >= 0;
  };
  var sinRepetir = function (arr) {
    return arr.filter(function (x, i) {
      return arr.indexOf(x) === i;
    });
  };

  function crear(T) {
    var famDe = T.famDe;
    var famNombre = {};
    T.familias.forEach(function (f) {
      famNombre[f.id] = f.nombre;
    });
    var prendas = T.prendas.map(function (p) {
      var o = Object.assign({}, p);
      o.vars = p.v.map(function (x) {
        return { c: x[0], fam: famDe[x[0]], tallas: clavesTalla(x[1]), s: x[2] };
      });
      return o;
    });

    function estadoVacio() {
      return { grupo: null, cat: null, color: [], talla: [], orden: "destacado", pagina: 1 };
    }
    function copia(e) {
      return { grupo: e.grupo, cat: e.cat, color: e.color.slice(), talla: e.talla.slice(), orden: e.orden, pagina: e.pagina };
    }

    // --- Quién cumple qué -------------------------------------------------------------------------------------------------
    function okColor(v, e) {
      return e.color.length === 0 || tiene(e.color, v.fam);
    }
    function okTalla(v, e) {
      return (
        e.talla.length === 0 ||
        v.tallas.some(function (t) {
          return tiene(e.talla, t);
        })
      );
    }
    function okNivel(p, e) {
      return (!e.grupo || p.g === e.grupo) && (!e.cat || p.cat === e.cat);
    }
    function variantesQueCoinciden(p, e) {
      return p.vars.filter(function (v) {
        return v.s > 0 && okColor(v, e) && okTalla(v, e);
      });
    }

    function resultados(e) {
      var lista = prendas.filter(function (p) {
        return okNivel(p, e) && variantesQueCoinciden(p, e).length > 0;
      });
      if (e.orden === "menor")
        lista.sort(function (a, b) {
          return a.p - b.p || a.o - b.o;
        });
      else if (e.orden === "mayor")
        lista.sort(function (a, b) {
          return b.p - a.p || a.o - b.o;
        });
      else
        lista.sort(function (a, b) {
          return a.o - b.o;
        });
      return lista;
    }

    // --- Cuántas prendas daría cada opción (regla 3) ----------------------------------------------------------------------
    function conteos(e) {
      var c = { color: {}, talla: {}, grupo: {}, cat: {}, total: 0 };
      T.familias.forEach(function (f) {
        c.color[f.id] = 0;
      });
      ORDEN_TALLAS.forEach(function (t) {
        c.talla[t] = 0;
      });
      T.grupos.forEach(function (g) {
        c.grupo[g.id] = 0;
      });
      prendas.forEach(function (p) {
        var enNivel = okNivel(p, e);
        var fc = {}, ft = {}, alguna = false;
        p.vars.forEach(function (v) {
          if (v.s <= 0) return;
          if (enNivel && okTalla(v, e)) fc[v.fam] = 1; // la faceta color no mira su propia elección
          if (enNivel && okColor(v, e)) v.tallas.forEach(function (t) { ft[t] = 1; }); // ni la talla la suya
          if (okColor(v, e) && okTalla(v, e)) alguna = true;
        });
        Object.keys(fc).forEach(function (k) { c.color[k]++; });
        Object.keys(ft).forEach(function (k) { c.talla[k] = (c.talla[k] || 0) + 1; });
        // Grupos: no miran el grupo ni la categoría elegidos (cada uno dice cuántas daría si lo eliges).
        if (alguna) c.grupo[p.g]++;
        // Categorías: dentro del grupo elegido (o de todas si no hay), sin mirar la categoría elegida.
        if (alguna && (!e.grupo || p.g === e.grupo)) c.cat[p.cat] = (c.cat[p.cat] || 0) + 1;
        if (enNivel && alguna) c.total++;
      });
      return c;
    }

    // Una opción ya elegida que, con lo que se sumó después en la OTRA faceta, no tiene ninguna prenda (elegiste Morado y luego la
    // talla M, y no hay morado en M). Los resultados no se vacían (otra opción de su faceta los sostiene), pero la opción queda
    // «elegida y sin nada»: la pantalla la marca para que se vea por qué no suma, y se quita con un toque. Nunca se suelta en silencio.
    function muertas(e) {
      var c = conteos(e);
      return {
        color: e.color.filter(function (f) { return !(c.color[f] > 0); }),
        talla: e.talla.filter(function (t) { return !(c.talla[t] > 0); }),
      };
    }

    // --- Lo que existe en el nivel actual, sin mirar color ni talla (decide qué opciones se dibujan) -------------------------
    function existe(e) {
      var x = { color: {}, talla: {} };
      prendas.forEach(function (p) {
        if (!okNivel(p, e)) return;
        var fc = {}, ft = {};
        p.vars.forEach(function (v) {
          if (v.s <= 0) return;
          fc[v.fam] = 1;
          v.tallas.forEach(function (t) { ft[t] = 1; });
        });
        Object.keys(fc).forEach(function (k) { x.color[k] = (x.color[k] || 0) + 1; });
        Object.keys(ft).forEach(function (k) { x.talla[k] = (x.talla[k] || 0) + 1; });
      });
      return x;
    }

    // Las familias y las tallas que se dibujan en el nivel actual, en su orden. La talla es «relevante» solo si hay al menos dos
    // tallas de verdad (letras o cinturas): un grupo de bolsos o aretes (solo «única») no pide elegir talla.
    function opciones(e) {
      var ex = existe(e);
      var familias = T.familias.filter(function (f) { return ex.color[f.id] > 0; });
      var claves = Object.keys(ex.talla).sort(function (a, b) { return ordenTalla(a) - ordenTalla(b); });
      var reales = claves.filter(function (k) { return k !== "UNICA"; });
      var sistemas = { letra: [], cintura: [], unica: [] };
      claves.forEach(function (k) { sistemas[sistemaTalla(k)].push(k); });
      return { familias: familias, tallas: claves, sistemas: sistemas, tallaRelevante: reales.length >= 2 };
    }

    // --- Cambiar el estado ------------------------------------------------------------------------------------------------
    // Sumar o quitar una opción (regla 4: una opción que daría 0 no se suma).
    function alternar(e, faceta, valor) {
      var n = copia(e);
      n.pagina = 1;
      var soltado = { color: [], talla: [] };
      var i = n[faceta].indexOf(valor);
      if (i >= 0) {
        n[faceta].splice(i, 1);
        // Si lo que queda de esa faceta son solo opciones muertas, quitar la última viva dejaría 0: se sueltan también.
        if (n[faceta].length && resultados(n).length === 0) {
          soltado[faceta] = n[faceta].slice();
          n[faceta] = [];
        }
        return { estado: n, hecho: true, soltado: soltado, soltoAlgo: soltado[faceta].length > 0, antes: e };
      }
      if (!(conteos(e)[faceta][valor] > 0)) return { estado: e, hecho: false, soltado: soltado, soltoAlgo: false, antes: e };
      if (faceta === "talla" && !opciones(e).tallaRelevante) return { estado: e, hecho: false, soltado: soltado, soltoAlgo: false, antes: e }; // aquí no se pide talla
      n[faceta].push(valor);
      return { estado: n, hecho: true, soltado: soltado, soltoAlgo: false, antes: e };
    }

    // Cambiar de grupo o de categoría (regla 4): lo elegido que ahí NO EXISTE (la talla M entre bolsos) se suelta y se dice qué se soltó
    // (`antes` permite el «Deshacer»). Lo que existe pero no se cruza con lo otro sigue elegido, marcado como muerto (`muertas`),
    // salvo que no quedara nada que ver: entonces se suelta la talla, y si aún no, los colores.
    function navegar(e, grupo, cat) {
      var n = copia(e);
      n.grupo = grupo || null;
      n.cat = cat || null;
      n.pagina = 1;
      var soltado = { color: [], talla: [] };
      var ex = existe(n);
      n.color = n.color.filter(function (f) { var ok = ex.color[f] > 0; if (!ok) soltado.color.push(f); return ok; });
      n.talla = n.talla.filter(function (t) { var ok = ex.talla[t] > 0; if (!ok) soltado.talla.push(t); return ok; });
      // Donde no se pide talla (bolsos, bisutería, un solo producto «estándar»), ninguna talla queda elegida: la pantalla no dibuja
      // el control y una talla invisible cambiaría los números sin que nadie sepa por qué. Incluye «Estándar / única», que sí existe ahí.
      if (n.talla.length && !opciones(n).tallaRelevante) { soltado.talla = soltado.talla.concat(n.talla); n.talla = []; }
      if (resultados(n).length === 0) { soltado.talla = soltado.talla.concat(n.talla); n.talla = []; }
      if (resultados(n).length === 0) { soltado.color = soltado.color.concat(n.color); n.color = []; }
      return { estado: n, soltado: soltado, soltoAlgo: soltado.color.length + soltado.talla.length > 0, antes: e };
    }

    function limpiar(e, faceta) {
      var n = copia(e);
      n.pagina = 1;
      if (!faceta || faceta === "color") n.color = [];
      if (!faceta || faceta === "talla") n.talla = [];
      return n;
    }

    function siguienteOrden(e) {
      var n = copia(e);
      n.orden = ORDENES[(ORDENES.indexOf(e.orden) + 1) % ORDENES.length];
      n.pagina = 1;
      return n;
    }

    // --- La dirección (hash) ----------------------------------------------------------------------------------------------
    function serializar(e) {
      var p = [];
      if (e.grupo) p.push("g=" + e.grupo);
      if (e.cat) p.push("k=" + encodeURIComponent(e.cat));
      if (e.color.length) p.push("c=" + e.color.join(","));
      if (e.talla.length) p.push("t=" + e.talla.map(encodeURIComponent).join(","));
      if (e.orden !== "destacado") p.push("o=" + e.orden);
      if (e.pagina > 1) p.push("p=" + e.pagina);
      return p.join("&");
    }
    // Lee una dirección escrita a mano sin creerle: lo que no existe se ignora y, si no quedara nada que ver, se suelta lo elegido.
    function leer(texto) {
      var q = {};
      String(texto || "").replace(/^#/, "").split("&").forEach(function (par) {
        var i = par.indexOf("=");
        if (i <= 0) return;
        try {
          q[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1));
        } catch (x) {
          /* un «%» mal escrito: ese pedazo se ignora, la página no se cae */
        }
      });
      var e = estadoVacio();
      var grupo = T.grupos.filter(function (g) { return g.id === q.g; })[0];
      e.grupo = grupo ? grupo.id : null;
      e.cat = grupo && q.k && tiene(grupo.cats, q.k) ? q.k : null;
      e.color = sinRepetir((q.c || "").split(",")).filter(function (x) { return T.familias.some(function (f) { return f.id === x; }); });
      e.talla = sinRepetir((q.t || "").split(",")).filter(function (x) { return tiene(ORDEN_TALLAS, x); });
      e.orden = tiene(ORDENES, q.o) ? q.o : "destacado";
      e.pagina = Math.max(1, parseInt(q.p, 10) || 1);
      var r = navegar(e, e.grupo, e.cat);
      r.estado.orden = e.orden;
      var paginas = Math.max(1, Math.ceil(resultados(r.estado).length / POR_PAGINA));
      r.estado.pagina = Math.min(e.pagina, paginas);
      return r;
    }

    // --- Lo que dice cada tarjeta -----------------------------------------------------------------------------------------
    function notaDe(p, e) {
      var total = variantesQueCoinciden(p, e).reduce(function (s, v) { return s + v.s; }, 0);
      if (total <= 1) return { texto: "Última en " + T.sede, tono: "poco" };
      if (total <= 3) return { texto: "Quedan " + total + " en " + T.sede, tono: "poco" };
      return { texto: "Hay en " + T.sede, tono: "ok" };
    }
    // Por qué coincide: los colores y tallas ELEGIDOS que tiene, no todos los de la prenda.
    function coincidencias(p, e) {
      var vs = variantesQueCoinciden(p, e);
      var colores = e.color.length ? sinRepetir(vs.map(function (v) { return famNombre[v.fam]; })) : [];
      var tallas = e.talla.length
        ? sinRepetir([].concat.apply([], vs.map(function (v) { return v.tallas.filter(function (t) { return tiene(e.talla, t); }); }))).sort(function (a, b) { return ordenTalla(a) - ordenTalla(b); })
        : [];
      return { colores: colores, tallas: tallas };
    }
    // Las muestras de la tarjeta: primero los colores que coinciden con lo elegido, y cada color una sola vez.
    function muestras(p, e) {
      var vistos = {}, coinciden = [], otros = [];
      p.vars.forEach(function (v) {
        if (v.s <= 0 || vistos[v.c]) return;
        vistos[v.c] = 1;
        var m = { codigo: v.c, nombre: p.cols[v.c] || (T.colores[v.c] || [])[0] || v.c, hex: T.colores[v.c] ? T.colores[v.c][1] : "#ccc", elegido: false };
        if (e.color.length > 0 && tiene(e.color, v.fam)) { m.elegido = true; coinciden.push(m); } else otros.push(m);
      });
      return coinciden.concat(otros);
    }
    // El enlace a la ficha lleva el color (y la talla) que la persona estaba mirando (`?color=`: la ficha de verdad ya lo lee).
    function enlaceDe(p, e) {
      var vs = variantesQueCoinciden(p, e);
      var v = vs[0] || p.vars[0];
      var q = [];
      if (v && e.color.length) q.push("color=" + v.c);
      if (e.talla.length && v) {
        var t = v.tallas.filter(function (x) { return tiene(e.talla, x); })[0];
        if (t) q.push("talla=" + encodeURIComponent(t === "UNICA" ? "Estándar" : t));
      }
      return "/catalogo/" + p.id + "?sede=trujillo" + (q.length ? "&" + q.join("&") : "");
    }

    return {
      T: T, prendas: prendas, estadoVacio: estadoVacio, copia: copia, resultados: resultados, conteos: conteos, existe: existe, muertas: muertas,
      opciones: opciones, alternar: alternar, navegar: navegar, limpiar: limpiar, siguienteOrden: siguienteOrden,
      serializar: serializar, leer: leer, notaDe: notaDe, coincidencias: coincidencias, muestras: muestras, enlaceDe: enlaceDe,
      variantesQueCoinciden: variantesQueCoinciden, famNombre: famNombre,
    };
  }

  var API = {
    crear: crear, clavesTalla: clavesTalla, sistemaTalla: sistemaTalla, ordenTalla: ordenTalla, etiquetaTalla: etiquetaTalla,
    ORDEN_TALLAS: ORDEN_TALLAS, POR_PAGINA: POR_PAGINA, ORDENES: ORDENES, NOMBRE_ORDEN: NOMBRE_ORDEN,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else raiz.LOGICA = API;
})(typeof window !== "undefined" ? window : globalThis);
