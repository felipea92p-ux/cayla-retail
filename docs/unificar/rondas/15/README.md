# Ronda 15 de `/unificar`: los íconos, el globito con número, «Ver más», «Deshacer» y «Buscar» (fuentes)

Armada el 2026-10-15 (rama `claude/unificar-ronda-15`) con un medidor rápido sobre 95 pantallas (el censo completo se cortó: el servidor se
cayó a mitad) y el código, que vio los 922 íconos de 320 archivos. **Decidida el mismo día: Felipe eligió P1 en las cinco mirando las fotos
y tocando las demos, y se migró (deuda 0).** Registros: [icono.md](../../icono.md), [contador.md](../../contador.md),
[accion.siguiente.md](../../accion.siguiente.md), [accion.deshacer.md](../../accion.deshacer.md) y [accion.buscar.md](../../accion.buscar.md).
La página vive en `apps/web/unificar/.salida/elegir-ronda15/` (fuera de git); estas son sus fuentes y los scripts de la ronda.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `icono` | El grosor de la línea | P1 (recomendada: el de fábrica, 2) · P2 (1,75) · P3 (1,5 px a cualquier tamaño) · A (hoy: de 1,4 a 2,8) |
| 2 | `icono` | El tamaño según el lugar | P1 (recomendada: 12 · 14 · 16 · 20) · P2 (crece con la letra) · A (hoy: 25 tamaños) |
| 3 | `contador` | El globito con número | P1 (recomendada: el de las pestañas; lleno solo en la esquina) · P2 (lo que pide, siempre lleno) · A (hoy: seis caras) |
| 4 | `accion.siguiente` | «Ver más / Ver menos» | P1 (recomendada: la franja al pie de la lista) · P2 (siempre el enlace) · A (hoy: cinco caras) |
| 5 | `accion.deshacer` | «Deshacer» y «Buscar» | P1 (recomendada: el enlace con la flecha curva; el secundario con la lupa) · A (hoy) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `medir.mjs`, `resumir.py` | el medidor rápido: cada ícono y cada globito que se ve (tamaño, grosor, dónde está), sin fotos; y su resumen |
| `firmas.mjs`, `firmas-contador.mjs` | prueban las firmas candidatas contra el código de hoy |
| `firmas-antes.mjs` | cuántos archivos reconocen las firmas decididas en el código de antes (`origin/main`) |
| `migrar-iconos.py` | lleva cada ícono a la regla: quita el grosor, ajusta el tamaño según su contenedor (una tabla decidida mirando cada uno) y escribe el `unificar-fijo` de la marca y del ícono grande |
| `svg.mjs`, `piezas.mjs`, `demo15.css`, `demo15.js` | las demos: la tarjeta con los cinco lugares de un ícono, la lupa, los cuatro lugares del globito, «Ver más» que abre de verdad, «Deshacer» y «Buscar» |
| `fotos.mjs`, `fotos-globitos.mjs` | fotografían siete pantallas reales con los íconos de hoy y con cada propuesta aplicada EN VIVO (solo el dibujo), y los globitos de hoy |
| `bajar-css.mjs`, `construir.mjs`, `ver-demos.mjs` | bajan el CSS real, arman la página de elegir y fotografían cada tarjeta |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda15/`; los demás, desde `apps/web`.
