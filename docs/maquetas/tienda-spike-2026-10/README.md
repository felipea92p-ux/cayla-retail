# Spike de la tienda: Blanco, Arcilla y Rojo colibrí (2026-10-26) — NO elegido

> **Estado: descartado.** Felipe miró las seis direcciones de `../tienda-paleta-2026-10/` y este spike, y **volvió a «G · Pasarela»**
> (`../tienda-rediseno-2026-10/g-pasarela.html`). Se guarda solo como historial y como cantera de piezas (ADR-0524).

**Qué es:** las tres direcciones que Felipe eligió de las seis, llevadas más lejos y mucho más fieles a la tienda real: precios, insignias, favoritos,
campaña con cuenta regresiva, selector de tienda con aviso de que la bolsa se vacía, buscador, menú «Ropa», filtros con hoja, ficha con lupa y tabla de
stock, bolsa con cupón, «Separado» con el mensaje de WhatsApp, Entrar y Crear cuenta con campos que dicen su estado, Mi perfil con puntos y pedidos,
tiendas, looks, modo claro y oscuro, y una hoja de «Piezas» con el sistema y el contraste medido.

**Cómo se abre:** un servidor local (`preview_start` de `maqueta-referentes`, `.claude/launch.json`) y `http://localhost:<puerto>/tienda-spike-2026-10/blanco.html`
(o `arcilla.html`, `rojo.html`). La barra negra de arriba cambia de dirección, de pantalla (portada, catálogo, prenda, bolsa, entrar, crear cuenta, Mi perfil, tiendas,
looks, piezas), de estado (visitante o con cuenta, claro u oscuro, con o sin campaña) y abre lo que se abre encima (menú «Ropa», buscador, selector de tienda, filtros,
guía de tallas, menú del celular). Los parámetros `?tema=oscuro&sesion=si&tienda=tru&campana=no&bolsa=vacia&ver=buscar` abren la maqueta en ese estado.

**Qué se verificó:** un recorrido de 27 pasos con clics reales (buscador, cambio de tienda con bolsa, filtros y chips, favoritos, agregar rápido, ficha sin talla, bolsa,
cupón, entrar, separar, perfil, looks y tema) en las tres direcciones, a 1440 y 390 px, sin errores de página; el medidor de oficio visual de `/formidable` dejó sin
desborde horizontal y sin blancos bajo 24 px; el texto bajó a 12 px como mínimo. Lo que el medidor sigue marcando son los números fantasma decorativos (`aria-hidden`).

**Qué no se probó:** con clientes reales, en un teléfono de verdad, ni a 1920 px. Los precios, el stock y los pedidos son de ejemplo; las fotos y los nombres de las 13
prendas son los de la portada pública (se leen de su almacén público: no se copian a este repo, que es público).
