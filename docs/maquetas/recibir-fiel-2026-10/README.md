# Recibir mercadería · rediseño fiel (2026-10-29)

Pedido de Felipe: que Recibir sea más visual y animado **sin cambiar qué hace ni sumar clics**. Las chicas de tienda dijeron
que hay mucho texto en letra chica que nadie lee. Este prototipo cambia **solo la forma**: cada función de hoy sigue en su lugar, con los
mismos toques. Lo que deja de verse a primera vista es la explicación larga: pasa a un «¿Por qué?» (ⓘ) que se abre con un toque.

Abrir: `index.html` (el selector de arriba cambia entre las direcciones A, B y C; las tres comparten todo lo demás).

## Lo que existe hoy (inventario del código, 2026-10-29)

| Pantalla u hoja | Archivo de hoy | Lo que hace | Está en la maqueta |
|---|---|---|---|
| Portada `/recibir` | `app/(app)/recibir/page.tsx` | Avisos (prendas por terminar, traslados en camino), envíos por recibir con buscador y filtros Estado / Proveedor / Fechas, 10 por página, «Sin aviso», «Lo recibido» con Por terminar / Terminados y «Ver todo lo recibido» | Sí |
| Hoja «Envío ENV-…» | `recepcion-envio/DetalleEnvioPorRecibir.tsx` | Lo que trae, fardos, «Dijeron N», Quién recibe, Empezar a recibir (`abrir_despacho`) | Sí |
| Hoja «Recibir OC sin guía» | `recepcion-envio/RecibirSinGuia.tsx` | La orden directa sin guía (`recibir_orden_sin_envio`) | Sí |
| Hoja «¿Llegó algo que no está en la lista?» | `recepcion-conteo/LlegoSinAviso.tsx` | Proveedor (6 + «No sé de quién es»), «+ Agregar proveedor», facturas pendientes, guía, Quién recibe (`abrir_envio_sin_aviso`) | Sí |
| Envío en camino (página) | `recepcion-envio/EmpezarARecibir.tsx` | Lo mismo que la hoja, a página completa, y «Recibir sin aviso» | Sí |
| Paso «Contar» | `recepcion-conteo/ContarEnvio.tsx` | Categorías del envío, + Agregar categoría, Quién cuenta, número con − / + / +5 / +10 / «Llegaron las N» / «No llegó nada», veredicto, observaciones (7 tipos), «¿Qué son?» (anotadas, buscador, nuevas), Tallas y colores, guardado solo, barra de abajo | Sí |
| Hoja «Tallas y colores» | `recepcion-conteo/HojaTallas.tsx` + `MatrizRecepcion` | Color × talla, «+ talla o color», «Cambiar», dañadas con «¿Tienen arreglo?» | Sí («+ talla o color» y «Cambiar» avisan que abren lo de hoy) |
| Hojas de prenda nueva | `HojaPrenda.tsx`, `DescribirNuevas.tsx` | Crear la prenda que llegó; describir las nuevas | Sí (crear, resumida) |
| Hoja «Algo que no estaba en la guía» | `AgregarFueraDeGuia.tsx` | Categoría y marca extra | Sí |
| Paso «Cerrar» | `recepcion-conteo/CerrarEnvio.tsx` | Por categoría: dijeron, contaste, se venden, para después, diferencia y su causa; costo y precio por prenda y por color × talla; balanza; guía, nota, de quién llegó, quién cierra; confirmar precios | Sí (la barra «Aplicar a» de la matriz de precios no se redibujó: queda como hoy) |
| Envío cerrado | `recepcion-conteo/EnvioCerrado.tsx` | 4 cifras, stock con Imprimir etiquetas / Bajar al piso, Para después con «Hacer ahora», Lo que no cuadró, Reabrir el conteo | Sí |
| «Hacer ahora» | `recepcion-conteo/HacerAhora.tsx` | Separar, poner tallas (Meter al stock), crear | Sí (poner tallas y crear) |
| «Ver todo lo recibido» | `?vista=recibidas` | Historial con filtros por URL | No (se abre igual que hoy) |
| Cara vieja con lector y vista contra factura | `LlegoMercaderia.tsx`, `RecepcionEnvio.tsx` | Solo se ve si la base no tiene el conteo nuevo | No |

## Clics del camino feliz (1 categoría, llegó lo que dijeron, tallas al contar)

| Paso | Hoy | Maqueta |
|---|---|---|
| Abrir el envío | «Detalle» → «Empezar a recibir» (2) | Igual (2) |
| Contar | «Llegaron las 2» (1) | Igual (1) |
| Decir qué prenda es | «+ Falda Ariana × 2» (1) | Igual (1) |
| Tallas y colores | «Tallas y colores ahora» → la matriz → «Listo» (2 + matriz) | Igual (2 + matriz) |
| Ir a cerrar | «Pasar a cerrar» (1) | Igual (1) |
| Cerrar | «Cerrar el envío» (1, + 1 por cada diferencia) | Igual |
| **Total** | **8 + matriz** | **8 + matriz** |

## Qué cambia a la vista (y nada más)

- **Letra:** el cuerpo pasa de 13–14 px a 16 px; los títulos de campo, de 11 px a 14 px; las cifras, a 40–96 px.
- **Texto:** cada frase de ayuda baja a una línea; la explicación larga queda tras un ⓘ (ley 6 de Formidable). No se borra ningún texto que diga una regla: se mueve.
- **Visual:** la prenda se ve con su color e ícono (ADR-0333); las categorías llevan su anillo de avance; el cierre muestra cada categoría como una barra «se venden / para después / faltan»; la balanza se inclina.
- **Movimiento** (ADR-0136): todo una vez, sin rebote ni bucle; se apaga con `prefers-reduced-motion`.
- **A / B / C** solo cambian dos piezas: cómo se ve la lista de envíos (tarjetas, línea o tablero) y cómo se ve el número que se cuenta (barra, anillo o casillas).

## Lo que esto obliga a tocar si se construye

`lib/guias/huellas/recibir.json` y `recibir.envio.id.json` (cambia la forma de los controles: hay que poner al día las guías con `/guia`),
la guía de foco (los `data-campo` se conservan), `lib/unificar.test.ts` (las piezas nuevas deben salir de las ya decididas: `TarjetaCifra`,
`Anillo`, `BarraApilada`, `PasoCantidad`, `Chip`, `<Modal>`, `BarraDeAbajo`).
