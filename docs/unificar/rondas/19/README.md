# Ronda 19 de `/unificar`: el texto del ERP, más grande y más corto (fuentes)

Armada el 2026-10-30 y aplicada hasta el 2026-10-31 (rama `claude/simplified-collapsible-design-b21103`). Felipe: las colaboradoras dicen que
el texto es muy chico y nadie lo lee; tras la cabecera (ronda 18), todo lo demás que se lee. **Decidida mirando: F1 (una línea, lo demás al «?»)
y A1 (el mismo «?» de vidrio en todo el ERP); el tamaño, después de condensar texto por texto: 14 px como piso.** Registro:
[texto.md](../../texto.md). La página de elección y las fotos viven en `apps/web/unificar/.salida/texto-ronda19/` (fuera de git); estas son
sus fuentes.

| # | Pregunta | Opciones |
|---|---|---|
| 1 | ¿De qué tamaño? | E0 hoy (13 tamaños) · E1 y E2 (tres voces con nombre y un piso) → Felipe: «ninguna», condensar primero |
| 2 | ¿Qué se queda a la vista? | **F1** una línea y lo demás al «?» · F2 todo a la vista, más corto |
| 3 | ¿Con qué se abre lo que no se ve? | **A1** el «?» de vidrio de la cabecera · A2 un enlace «¿Por qué?» |

## Archivos

| Archivo | Qué hace |
|---|---|
| `elegir.json` | la especificación de la página de elección (`node unificar/elegir.mjs elegir.json`), con lo que midió el censo |
| `medir.mjs` | el censo del texto: por cada ruta, cada bloque de texto del `<main>` con su tamaño, palabras y tono → `texto.json` (`RUTAS`, `CUENTA`, `SALIDA`) |
| `inventario.mjs`, `revisar.mjs` | juntan las frases de 5 palabras o más por pantalla y arman la página donde se revisa cada una con su versión corta |
| `cierre.mjs` | los archivos de `components/` que solo usa un módulo (cierre de imports desde sus `page.tsx`; la raíz en `RAIZ`); lista aparte los compartidos |
| `letra.py` | sube la letra de esos archivos (`text-[10–13px]` y `text-xs` a `text-sm`, `13,5` a `15`), saltando versalitas, botones, controles de alto fijo y mono; `--seco` solo cuenta |
| `letra-css3.py` | lo mismo en el CSS propio de un módulo, regla por regla (salta la regla entera si lleva versalitas o letras espaciadas; `EXTRA` salta gráficos, mapas o teclas) |
| `fotos-ventas.mjs` | fotos de página entera de un módulo a 1440 y 375 px, antes o después (`MODULO`, `ETAPA`, `RUTAS`, `CUENTA`), y avisa si algo se corre al costado |
| `fotos-ficha-cliente.mjs`, `fotos-ficha-colab.mjs` | lo mismo con una hoja abierta por un clic (la ficha de un cliente, la de una persona); no guardan nada |

Se copian a `apps/web/unificar/.salida/texto-ronda19/` y se corren desde `apps/web` (con `B=http://localhost:<puerto>`). Las «antes» se toman
antes de editar; si ya se editó, con un respaldo `tar` de los cambios, `git checkout HEAD --` de esos archivos, las fotos y `tar -xf`.
