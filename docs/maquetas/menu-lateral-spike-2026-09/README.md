# Spike visual · Menú lateral colapsable (2026-09-19)

> **Estado (2026-09-19): aplicado al ERP — ver `docs/adr/0130-menu-lateral-se-pliega-a-iconos.md`.** Excepto «Asomar al
> pasar el mouse», que no se construyó. Este HTML queda como referencia visual del diseño aprobado.

`menu-lateral-spike.html` — autocontenido, ábrelo en el navegador (necesita `cayla-isotipo.png` al lado).
Datos inventados. **No es una implementación**: no toca `AppShell.tsx`. Parte del menú real (mismos
íconos, mismas filas de 48 px, mismo riel rojo que se desliza, mismos grupos y mismo orden que hoy) y
explora una sola pregunta: *¿qué pasa si el lateral se puede plegar a una columna de íconos?*

Los controles punteados de arriba sirven para juzgarlo: **Menú** (expandido / colapsado), **Asomar al
pasar el mouse**, **Ver como** (Líder / Colaborador, cambia qué filas existen) y **Movimiento reducido**.
Atajo: `[` contrae y expande. El contador «Panel: N px» es el ancho real del contenido.

## Qué resuelve

| Problema | Cómo lo responde el spike |
|---|---|
| El lateral come 272 px fijos. En una ventana de 1440 el panel queda en ~1088 px; con menú colapsado, **~1284 px (+196)**. Las pantallas que ya deciden por ancho de panel (Recibir `@4xl/@5xl`, Proveedores) ganan aire sin tocar nada. | Ancho 17rem → 76 px |
| Colapsar no debe cambiar el «mapa» mental | Los íconos **no se mueven** (siguen en x = 28 px); solo se apagan las etiquetas. El ancho 76 = 12 + 16 + 20 + 16 + 12 sale de esa condición |
| Un grupo cerrado no muestra a sus hijas | **Cajón flotante** al pasar el mouse (120 ms) o al hacer clic: lista las hijas con su ícono, marca la activa con el riel rojo y lleva la insignia de «por atender» |
| Sin etiquetas no se sabe qué es cada ícono | Etiqueta flotante (Inicio, Colaboradores, Nuevo, Mi perfil); los grupos usan el cajón, que ya trae el nombre |
| «Por atender» (Traslados: 3) no se ve | La insignia sube a la esquina del ícono del grupo, como ya hace la cabecera cerrada en producción |
| Colapsado a veces estorba (quieres leer y navegar a la vez) | **Asomar**: 250 ms de mouse quieto y el lateral se abre *encima* del contenido, sin empujarlo; al salir vuelve. Se puede apagar |

## Qué reutiliza y qué inventa

Reutiliza (mismos nombres que `globals.css` / `AppShell.tsx`): curva `--ease-cayla`, `cayla-revelar`
(entrada escalonada de 30 ms por fila, la misma del desplegable de campos), `cayla-entrada`, el riel
que camina sobre las **filas visibles** (nunca sobre el array — ver `GrupoLateral`), la marca fantasma
gris al pasar el mouse, y el colapso a 1 ms con movimiento reducido.

Gestos **nuevos** (habría que aprobarlos como ampliación de la gramática):

| Gesto | Costo de portarlo |
|---|---|
| Ancho que se anima 272 ↔ 76 px + etiquetas que se apagan | CSS: `transition: width` en el `<aside>`; el `<main>` y la cabecera ya leen `--spacing-lateral`, solo hay que hacerlo variable |
| Despliegue de hijas por `grid-template-rows: 0fr → 1fr` (reemplaza el `anim-revelar` por fila) | CSS puro, sin medir alturas |
| Cajón flotante `nv-flota` | Componente nuevo (~60 líneas), teclado igual que `MenuNuevo`: flechas, Inicio/Fin, Espacio, Esc cierra y devuelve el foco |
| Asomar con retardo | ~10 líneas de estado |

## Lo que NO se resolvió (decisiones de Felipe)

1. **Dónde vive la preferencia.** El spike usa `localStorage`. En producción eso hace que la página
   pinte 272 px y *salte* a 76 al hidratar. La opción sólida es una **cookie** que lee el layout en el
   servidor (`app/(app)/layout.tsx`) y pasa `colapsado` a `AppShell` ya resuelto. ¿Por persona (cookie
   del navegador) o por colaborador (columna en `personas`)? Yo iría con cookie: es preferencia de
   pantalla, no dato del negocio.
2. **¿Asomar sí o no?** Da comodidad pero el lateral «se mueve solo». Está apagable en el spike; en
   producción convendría dejarlo apagado por defecto.
3. **Los tres puntos de contacto que dependen de `--spacing-lateral`**: `<aside>`, cabecera, `<main>`, y
   dos barras fijas (`BarraFija.tsx`, el pie del Punto de Venta con `sm:left-lateral`). Al hacerlo
   variable hay que revisar esas dos, o se quedan en 272 px con el menú plegado.
4. **`SIN_TOPE_DE_ANCHO`** (`AppShell.tsx`): las rutas con ancho completo ya aprovechan el +196 px; las
   demás siguen topadas en `max-w-5xl` y solo ganan margen, no contenido.
5. Celular: no cambia — sigue con las 5 pestañas de abajo. El spike lo avisa y oculta el lateral.

## Verificado en el navegador (1440 px)

Expandido ↔ colapsado (panel 1088 → 1284 px, íconos fijos en x = 28), cajón por clic y por hover con
la fila activa marcada, navegar desde el cajón (migas y riel se actualizan, cajón se cierra), rol
Colaborador (sin Colaboradores ni Compras; «Recibir mercadería» pasa a Inventario), atajo `[`,
asomar encendido/apagado. Sin errores de consola.
