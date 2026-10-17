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

**Dónde quedó (2026-10-17, pausa pedida por Felipe).** Lista de 9 actividades aprobada (ADR-0436). Hechas y commiteadas: 1 (módulo,
lista, regla de la portada en un solo lugar), 2 (Datos y Prendas con una sola llave) y 3 (la portada en una sola pieza,
`packages/portada`, sin cambio visible). **La 4 está a medias**, en el commit «diseño de cada campaña (en curso)»:
- [x] Migración `20261017160000_campanas_diseno.sql` (tabla `campana_disenos` con sus estados imposibles cerrados, borrador con versión,
  publicar, volver al anterior, `campanas_lista` con el diseño y tres prendas) y su suite `pnpm pruebas:campanas-diseno` (43/43). **No está
  en producción.**
- [x] En el paquete: el modelo del diseño (estilos, «Mi color», paletas de las prendas), la revisión de contraste, los textos, la ceja y el
  contador compartidos, y `lienzo.css` (el héroe fuera de la tienda).
- [x] En el ERP: `lib/campana-diseno.ts` y los componentes `DisenoCampana`, `Lienzo`, `PortadaDeCampana`, `PublicarDiseno`,
  `VolverAlAnterior`, **todavía sin conectar a la página**.
- [ ] Conectar la pestaña «Diseño en la web» en `app/(app)/tienda-web/campanas/[id]/page.tsx` (por defecto, como la maqueta; Nueva campaña
  lleva a `?pestana=datos`), con «Después sale» desde `campanas_portada_dias`.
- [ ] La miniatura real en la lista (`TarjetaCampana`: `Lienzo` + `PortadaDeCampana`, chip «Diseño de siempre» / «Borrador», botones
  «Editar diseño» y «Datos y prendas») y los colores del diseño en «La portada, día a día»; borrar `PortadaMini` y `PORTADA_DE_SIEMPRE`.
- [ ] `campanas_lista`: que «borrador» sea solo el que difiere de lo publicado.
- [ ] La guía interactiva de la pestaña (las anclas `data-guia` se quitaron hasta escribir sus pasos) y su huella; ARQUITECTURA.md; la
  sección de la actividad 4 en el ADR-0436.
- [ ] Verificar en el navegador (pila propia `cayla-pila-campanas`): diseñar, publicar, volver al anterior, 375 px, oscuro; y `pnpm knip`
  (hoy marca los componentes nuevos sin usar: se resuelve al conectar la pestaña).
- Después: actividades 5 a 9 (la tienda pinta el diseño, campañas sin descuento, el resto del editor, la foto, el cierre y el PR).
