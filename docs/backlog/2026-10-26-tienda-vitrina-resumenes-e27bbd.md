## Tienda web ▸ Resumen y Vitrina ▸ Modelos, la Ola 1 (2026-10-26)

- [x] Filtros de la Vitrina (estado, categoría, Lo nuevo) en un panel flotante y enlaces del Resumen que llegan filtrados.
- [x] Empaque fuera de la lista (Estado ▸ Empaque), 40 por página, «Elegir los N de esta página» y «los N que coinciden».
- [x] Cifras compactas (`TarjetaCifra compacta`, solo Vitrina ▸ Modelos) y Lista que alterna columnas por tienda / filas (`modoDeLista`).
- [x] Resumen: pendientes primero, camino en una línea sin pedidos abiertos, lo calmo baja (solo si se leyó todo: `vacioDePendientes`), sin la nota del pie; «Tiendas en la web» sigue siempre junto a la ventana.
- [x] Carga: hojas de la Vitrina bajo demanda, `loading.tsx` del Resumen y silueta nueva de la Vitrina.
- [x] Aviso en la hoja de ocultar cuando el lote deja la tienda sin modelos o oculta la mitad o más (`avisoDeLote`).
- [x] `/chaos` del lote «Mostrar / Ocultar» (semilla 1026): 21 ataques, 21 resisten (`docs/chaos/README.md`).
- [x] `/formidable` del Resumen y de Vitrina ▸ Modelos (`docs/formidable/tienda-web-resumen-y-vitrina-modelos.md`); los 3 cambios del Resumen hechos.
- [ ] Los 3 cambios de Vitrina ▸ Modelos de `/formidable` (rotular el stock y agrandar lo que se toca, la regla del precio a un toque, interruptor sin hoja con `responsable.listo`: este toca ADR-0161, es de Felipe) y repetir la ciega del Resumen y una prueba con una colaboradora real.
- [ ] Repetir el `/chaos` del lote cuando la rama esté al día con `main` (hoy va 183 commits detrás) y cubrir lo que quedó fuera: sesión vencida, atrás/adelante y entrar por URL con una cuenta sin el módulo.
- [ ] Ver con datos reales lo que el banco local no tiene: modelos «sin precio» y «ocultos», una tienda a medias, y la Lista con 3 tiendas (debe pasar a columnas desde ~1050 px de tarjeta, una laptop de 1366 px).
- [ ] **Felipe:** ¿extender las cifras compactas y los filtros flotantes a Looks, Probador y Esperan una talla? Hoy, al cambiar de pestaña, las cifras de Looks y Probador siguen altas.
- [ ] **Felipe:** ¿filtrar «Lo nuevo» automático? Pide que `fn_vitrina_modelos` traiga cuándo llegó cada modelo a una tienda.
- [ ] Ideas medidas, sin hacer: ordenar la Lista por el stock de cada tienda (el encabezado de columnas ya lo permite); el Resumen deja la mitad derecha vacía a 1920 px (ADR-0462); «Abrir la tienda» mide 14 px de alto y 4,48:1 de contraste (viene de `EnlaceVer`); Looks y Esperan una talla no paginan.
- [ ] Publicar: el PR se abre con `/abrir-pr` (todavía no hay PR). Si se publica, nada se pega en la base.
