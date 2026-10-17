## 🎨 Tienda web ▸ Campañas: el diseño de cada campaña en la portada (2026-10-16)

Maqueta: `docs/maquetas/campanas-diseno-2026-10/` (abrir `index.html`; su README explica cada pantalla). Sin código ni migración.

**Decisiones de Felipe (2026-10-17):**
- [x] ~~**¿Dónde vive «Campañas» en el menú?**~~ — grupo nuevo «Tienda web» con Vitrina web y Campañas.
- [x] ~~**¿Una campaña sin descuento sale en la portada?**~~ — sí, si tiene prendas o diseño propio; con dos a la vez, la de descuento
  primero salvo que se cambie a mano.
- [x] ~~**¿Quién diseña?**~~ — todo junto, como hoy: quien ve Campañas diseña y pone el descuento (una sola llave).
- [x] ~~**El marco del editor**~~ — «el diseño de las maquetas está bien»: se construye tal cual.

**Para hacer (con `/construir`):**
- [ ] Reservar ADR y migración (`pnpm reservar adr`, `pnpm reservar migracion`).
- [ ] Tabla del diseño aparte de `etiquetas` (un publicado por campaña, paleta por clave de un catálogo, frase con tope), foto en
  Storage, y `tienda_portada()` devolviendo el diseño; la tienda lo valida con Zod y, si falta o no pasa, sale el rojo de siempre.
- [ ] Módulo nuevo en `retail.modulos` (nace solo para el líder), `lib/modulos.ts`, `lib/menu.ts`, `exigirModulo`, guía de foco, guía
  interactiva, `/sugerir` (la frase de ejemplo depende de la campaña), `/chaos`, `/formidable` y `tema:auditar`.
- [ ] Mover «Configurar campaña» y «Prendas» de Atributos ▸ Etiquetas a la campaña; Atributos se queda con las etiquetas que no son
  campaña (Para liquidar, Últimas unidades, Estreno).

**Dónde quedó (2026-10-17, noche).** Lista de 9 actividades aprobada (ADR-0436). Hechas y commiteadas: 1 (módulo, lista, regla de la
portada en un solo lugar), 2 (Datos y Prendas con una sola llave), 3 (la portada en una sola pieza, `packages/portada`, sin cambio
visible), 4 (diseñar y publicar), 5 (la tienda pinta el diseño publicado) y **6 (campañas sin descuento y el carrusel)**:
- [x] **En producción desde el 2026-10-17, congeladas** (como en `d32f50113`): `20261017144000` (registro `20261017202815`),
  `20261017160000` (`20261017202943`), `20261017200000` (`20261017203014`) y `20261017151000` (`20261017203618`). No se editan (lo vigila
  `campanas-migraciones-pegadas.test.ts`); un cambio va en una migración nueva. **Faltan** `20261017204000`, `20261017210000` y
  `20261017212000`, el día que se publique la web (detalle en `CONTINUAR.md`).
- [x] Actividad 4: la pestaña «Diseño en la web» (la de entrada; Nueva campaña lleva a Datos), con «Después sale» desde la base; la portada
  real en la lista, en la línea y en Datos ▸ En la web; «Borrador» solo si difiere de lo publicado; guías y huellas al día.
- [x] Actividad 5: la tienda revisa el diseño (`disenoParaPintar`: que se sepa leer y que la letra se lea en los dos temas) y la portada y
  el Inicio lo pintan, en claro y en oscuro (`--t-dia*` / `--t-noche*`, elegidos en `heroe.css`); sin diseño o si no pasa, el rojo de
  siempre. Verificado en la tienda local con Bosque y Galería, en claro, oscuro y 375 px.
- [x] Actividad 6a: una campaña sin descuento sale en la portada (con prendas, o sin ellas con su diseño publicado; la de descuento
  primero), con su lista de prendas en la tienda (`?lista=campana`). Migración `20261017204000`, sin pegar.
- [x] Actividad 6b: el carrusel (Felipe 2026-10-17: «si hay dos campañas activas, eso debe convertirse en un carrusel que va deslizándose
  cada ciertos segundos»): la regla devuelve todas en orden, la tienda las pasa cada 7 s y el ERP dibuja los días en carrusel. Migración
  `20261017210000`, sin pegar.
- [x] La puerta de Editar producto (Felipe 2026-10-17): `20261017212000`, parche anclado a `actualizar_variantes_etiquetas` (una campaña pide
  la llave de Campañas; sin ella no entra y la que la prenda tiene se queda), Editar producto sin ofrecer las campañas a quien no tiene el
  módulo, pruebas en `campanas_llave.mjs`. **Sin pegar: se pega el día que se publique la web**, justo antes de fusionar.
- [ ] Nuevo producto (`crear_producto_con_variantes`) también deja poner una prenda nueva en una campaña sin la llave de Campañas: decide
  Felipe si se cierra igual.
- [ ] El día de publicar: los cuatro pasos de `CONTINUAR.md` (pegar lo que falta, fusionar, darles «Campañas» a las terminales, reimprimir
  etiquetas si hay descuento) van como casillas en el PR de la actividad 9.
- [ ] Al publicar: avisarle a Felipe que «Terminal Almacén» y «Terminal de ventas» pierden la configuración de campañas hasta que el líder
  les dé el módulo «Campañas» (ADR-0436, DECIDÍ 1).
- [ ] Visto al verificar la 4 (para la 7, «El texto»): en la portada de 1280 px, una palabra larga del nombre («Internacional», de Día
  Internacional del Gato) se mete debajo de las polaroids; es el héroe compartido (`packages/portada/src/heroe.css`), así que la tienda lo
  muestra igual. El tamaño «grande/enorme» y el corte de la cursiva de la actividad 7 son el lugar para achicar la letra según el nombre.
- [ ] Visto al verificar la 5 (para la 7, «Las prendas»): sin foto, la polaroid de la vista previa del ERP dibuja el ícono de la categoría
  (`SinFoto`) y la de la tienda dibuja la silueta de la prenda (`FotoTarjeta`); la vista previa debería usar el mismo dibujo que la tienda.
- [ ] Aviso de Supabase en desarrollo (`Date.now()` while prerendering en las páginas con sesión): Felipe 2026-10-17, «dejarlo así» (el
  build de producción pasa).
- Después: actividades 7 a 9 (el resto del editor —fondo,
  acomodos, texto, prendas, detalles, Sorpréndeme, Deshacer—, la foto, el cierre con `/chaos`, `/formidable`, `tema:auditar` y el PR).
