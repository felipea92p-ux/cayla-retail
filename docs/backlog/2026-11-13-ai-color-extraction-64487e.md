## 🎨 Los colores salen de la foto (2026-11-13, ADR-0663) — solo web, sin migración; rama `claude/ai-color-extraction-64487e`

- [x] Lector de colores puro con prueba (`lib/colores-de-la-foto.ts`), `deltaE2000` con `kL` opcional.
- [x] «Fotos y colores» en Nuevo producto: tarjetas por color, mezcla sola (busca o crea), preguntas, «Cambiar», «Elegir sin foto», guía interactiva y huella.
- [x] Hoja «Nuevo color» con paleta de todos los colores que arranca en el tono de la foto (`components/ui/PaletaDeColor.tsx`).
- [x] «Catálogo con IA» con la foto primero (`useCatalogoIAAlta.prepararFoto`): el color se lee del PNG sin fondo; IA caída → foto real.
- [x] Una foto que espera su color frena crear (`problemasAlta`, guía de foco, Recibir).
- [x] La misma pieza en Recibir ▸ Crear la prenda que llegó (con permiso de fotos y al crear una prenda nueva).
- [ ] Medir el acierto con fotos reales de producción y ajustar `UMBRALES` (agente de medición).
- [ ] `/chaos` en el navegador, `/milimetro auditar` y `/formidable` de las dos pantallas.
- [ ] Recibir: probar en el navegador con un envío local (la base local no tiene envíos).
- [ ] Recibir sin permiso de fotos o al sumar a una prenda existente sigue con la carta: decidir si ahí también va el bloque (las fotos no se suben).
- [ ] Una prenda SIN color ya no puede subir «la foto de la prenda» desde Recibir (lo hacía `FotosDeLaPrenda`).
- [ ] Unificar la paleta con el selector de Catálogo ▸ Atributos (`SelectorColor`): hoy la paleta solo está en «Nuevo color».
- [ ] Video para el equipo: subir la foto, quitarle el fondo con IA y cómo salen los colores (necesita `ffmpeg`).
- [ ] Avisar en CAYLA Dynamic: `components/ui/PaletaDeColor.tsx` es nuevo («se mira»: queda como tarea allá).
- [ ] Una prenda SIN color (correa, gorro de un solo tono que no se quiere nombrar) ya no puede llevar foto en Nuevo producto: desde el
  2026-11-14 las fotos viven solo en «Fotos y colores», y cada foto pone un color. Hoy la foto se agrega en Editar producto. Si molesta,
  decidir con Felipe una casilla «Foto de la prenda» para ese caso.

