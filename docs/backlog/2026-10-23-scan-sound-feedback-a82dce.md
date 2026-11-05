## 🔔 Toda lectura con la cámara suena (2026-10-23, ADR-0244 act.) — solo web, sin migración; rama `claude/scan-sound-feedback-a82dce`

- [x] `EscanerCamara` (Vender, Apartados) y `EscanerBusqueda` (Existencias, Cambios, Movimientos, Prendas de una etiqueta) suenan
      solos en cada lectura con `avisarLectura(sonidoDeLecturaCamara(tono))`; dejaron de vibrar a mano (el bip ya vibra).
- [x] Existencias, Cambios (prenda nueva) y Prendas de una etiqueta le devuelven el tono al escáner: grave si no la encontraron.
- [x] Recibir traslado con la cámara (`useRecepcion.leerConCamara`) suena como Conteo: doble la primera, agudo la siguiente, grave lo que no suma.
- [x] `sonido-conteo.ts` crea y despierta el audio en el primer toque o tecla (el que abre la cámara): el iPhone no deja arrancarlo fuera de un toque.
- [x] Candado `lib/escaner-sonido.test.ts` (se probó que falla si `EscanerCamara` vuelve a solo vibrar). Suite web en verde (591 archivos), `tsc`, `eslint`, `knip`.
- [x] En el navegador local a 375 px, con cámara y lector simulados: Existencias (código real → agudo y abre la talla; código falso → grave) y
      Vender (prenda del piso → agudo y entra al ticket; prenda solo en almacén y código falso → grave). Audio «running» desde el toque.
- [ ] **Sin probar en un teléfono real**, Android e iPhone, con etiquetas de verdad. En un iPhone con el interruptor de silencio, Safari
      no deja sonar el audio web: no se puede arreglar sin cortar la música de la tienda en ese teléfono.
- [ ] **Sin cambiar a propósito:** la pistola de Recibir traslado, de Cambios y de Prendas de una etiqueta sigue sin sonar (el pedido era la cámara).
