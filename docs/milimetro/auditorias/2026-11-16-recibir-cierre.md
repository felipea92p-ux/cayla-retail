# Al milímetro · Cerrar un envío en Recibir (firma, aviso «recibido» y lo recibido liviano)

**Fecha:** 2026-11-16 · **Rama:** `claude/receipt-closing-screens-5255cd` · **Modo:** `diseñar` (ficha `docs/milimetro/cierre-de-envio.md`) y `auditar`
**Dónde:** `/recibir/envio/[id]`, dibujado desde una página temporal del worktree con el ENV-000023 de producción pasado por las mismas lecturas de
`lib/` (`leerDetalleEnvio`, `leerConteosDelEnvio`, `lineasParaContar`) y sin base (`NEXT_PUBLIC_SUPABASE_URL` a un puerto cerrado). Medidores
corridos con Chrome sin pantalla: estados (`milimetro/referencia/medir.js`) y color (`color/referencia/medir.js`).

## Piezas auditadas

| Pieza | Archivo | Piezas del sistema que usa |
|---|---|---|
| La firma del cierre | `components/recepcion-conteo/FirmaDelCierre.tsx` | `<Modal>` angosta, `<PieAcciones>`, `<Boton cargando>`, `<AvatarPersona>` |
| El aviso «ENV-… recibido» | `components/recepcion-conteo/AvisoRecibido.tsx` | `<Modal>` con `arriba`, `<Lacre enHoja>`, `<BotonImprimir peso="primario">`, `<Boton>` |
| Lo recibido, liviano | `components/recepcion-conteo/EnvioCerrado.tsx`, `LoQueEntro.tsx` | `<Chip>`, `<Odometro>`, `<BotonImprimir>`, `<BotonEnlace>`, `<MenuAcciones texto="Más">`, `<Casilla>`, la matriz de tallas (como «Recibido por envío») |

## Resultado: 0 graves · 0 medias · 2 leves

| Caso | Estados | Color |
|---|---|---|
| Envío cerrado, 1440 claro | sin hallazgos propios | «no concluyente» en el texto del botón negro (el medidor no lee el fondo ahumado; la captura y `vidrio-contraste.test.ts` lo cubren) |
| Envío cerrado, 1440 oscuro | sin hallazgos propios | igual; y APCA pide segunda mirada en el taupe de 11 y 15 px (WCAG 6,31:1, pasa) |
| Envío cerrado, 375 | sin hallazgos propios | — (el medidor de color no corre a 375) |
| Aviso, claro y oscuro | sin hallazgos propios | igual que arriba; la línea taupe de 15 px pasa WCAG (6,23:1) con segunda mirada APCA |
| Firma, claro y oscuro | sin hallazgos propios | «no concluyente» en «Cerrar y firmar» (botón negro del sistema) |

Los dos `:hover` que marca el medidor de estados (`.barra-t`, `.parecidas-punto`) son de otras pantallas, cargados con el CSS global; `hover-con-mouse.test.ts` pasa.

**Leves (práctica, no se tocan aquí):** la segunda mirada APCA del taupe sobre el vidrio oscuro es de los tokens del sistema, no de esta pantalla.

## No medido
- La pantalla con la base y una cuenta real (no hay envío cerrado en la base local compartida); `guias:recorrer` por lo mismo.
- El aviso de 7 s en la lista tras «Volver a Recibir mercadería»: en la prueba, sin sesión, la vuelta termina en el login.
