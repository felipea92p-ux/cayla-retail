# Tienda web ▸ Resumen y Vitrina ▸ Modelos — maqueta de la Ola 1 (2026-10-24)

Demo tocable, antes de construir. Datos inventados (59 modelos de ropa y 3 de empaque); nada guarda. La pantalla de «Hoy» está rehecha con
las medidas reales de `/tienda-web` a 1440 px (cabecera a 125 px, ventana a 250, «Lo que te pide hoy» a ~746; la maqueta da 744).

**Cómo verla:** `index.html` se sirve con la configuración `maqueta-referentes` de `.claude/launch.json` (sirve `docs/maquetas/`), o se abre
directo. Parámetros opcionales de la URL: `?pantalla=resumen|vitrina&version=hoy|prop&orden=A|B&datos=pend|dia|medias&ancho=esc|cel&tema=light|dark`.

**Qué se puede cambiar arriba:** Pantalla (Resumen / Vitrina ▸ Modelos), Versión (Hoy / Propuesta), Orden del Resumen (A: pendientes primero ·
B: ventana de una fila), Datos (con pendientes · todo al día · una tienda a medias), Ancho (escritorio / celular 375) y tema. La línea roja
punteada es el pliegue de 1440×900 (o 375×812) y «Medido aquí» se calcula en vivo.

**Qué muestra (las actividades de la Ola 1):** 1 filtros de Vitrina y enlaces del Resumen que llegan filtrados · 2 el empaque fuera de la lista
· 3 paginado de 30 con «Elegir los 30 de esta página» · 4 Resumen con lo que pide acción primero y el camino colapsado · 5 se van la tarjeta de
tiendas (si todo está verde) y la nota del pie. La actividad 6 (carga: `loading.tsx` fiel y hojas con `next/dynamic`) no se ve en una maqueta.

**Límite conocido:** la lista de «Hoy» mide aquí ~19 000 px con 300 modelos porque el aparato mide 1192 px y dibuja 6 columnas; en la pantalla
real, a 1440 px y con 5 columnas, se midió 82 px por modelo (~24 600 px con 300).
