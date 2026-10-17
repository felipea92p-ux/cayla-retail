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

**Dónde quedó (2026-10-17, tarde).** Lista de 9 actividades aprobada (ADR-0436). Hechas y commiteadas: 1 (módulo, lista, regla de la
portada en un solo lugar), 2 (Datos y Prendas con una sola llave), 3 (la portada en una sola pieza, `packages/portada`, sin cambio
visible) y **4 (diseñar y publicar)**:
- [x] Migración `20261017160000_campanas_diseno.sql` (tabla `campana_disenos` con sus estados imposibles cerrados, borrador con versión,
  publicar, volver al anterior, `campanas_lista` con el diseño, el borrador y tres prendas con su categoría y su color) y su suite
  `pnpm pruebas:campanas-diseno` (44/44). **No está en producción** (tampoco `20261017144000` ni `20261017151000`): se pegan con el OK de
  Felipe, en orden.
- [x] La pestaña «Diseño en la web» conectada (la de entrada; Nueva campaña lleva a Datos), con «Después sale» desde la base; la portada real
  en la lista, en la línea y en Datos ▸ En la web; `PortadaMini` y `PORTADA_DE_SIEMPRE` borrados; «Borrador» solo si difiere de lo publicado.
- [x] Las guías de la lista y de la campaña al día (huellas aceptadas tras recorrerlas en escritorio y 375 px), ARQUITECTURA.md y la
  sección de la actividad 4 del ADR-0436.
- [ ] Al publicar: avisarle a Felipe que «Terminal Almacén» y «Terminal de ventas» pierden la configuración de campañas hasta que el líder
  les dé el módulo «Campañas» (ADR-0436, DECIDÍ 1).
- [ ] Visto al verificar la 4 (para la 7, «El texto»): en la portada de 1280 px, una palabra larga del nombre («Internacional», de Día
  Internacional del Gato) se mete debajo de las polaroids; es el héroe compartido (`packages/portada/src/heroe.css`), así que la tienda lo
  muestra igual. El tamaño «grande/enorme» y el corte de la cursiva de la actividad 7 son el lugar para achicar la letra según el nombre.
- Después: actividades 5 a 9 (la tienda pinta el diseño publicado, campañas sin descuento y cuál va primero, el resto del editor —fondo,
  acomodos, texto, prendas, detalles, Sorpréndeme, Deshacer—, la foto, el cierre con `/chaos`, `/formidable`, `tema:auditar` y el PR).
