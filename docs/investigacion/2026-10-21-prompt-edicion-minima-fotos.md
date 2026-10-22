# Prompt de edición mínima para las fotos de prenda (piloto con ChatGPT Plus)

**Fecha:** 2026-10-21 · **Estado:** piloto de 8 fotos, sin tocar el catálogo ni producción. Nada se subió al ERP.
**Relacionado:** `2026-10-17-prompt-estandar-fotos-armador.md` (el prompt del equipo), ADR-0442 (la foto se sube tal cual).

## Qué se probó

Fotos reales de producción tomadas con gancho, pinzas o etiqueta colgante (8 de las más antiguas de Productos), pasadas por ChatGPT Plus
(chat, no API) con un PNG de fondo transparente como pedido. Cada una en una conversación nueva.

## Hallazgo 1 — el prompt anterior redibuja la prenda

Con el prompt largo (clasificar + limpiar + simétrico + «quita arrugas» + «luz pareja») ChatGPT **regenera** la prenda en vez de borrar solo
lo que sobra. Resultado en las 8: gancho, clips y etiquetas colgantes fuera y prenda de frente, pero:

| Prenda | Lo que cambió del diseño |
|---|---|
| Blusa rayada | rayas más gruesas y más azules, cuello y puños redibujados |
| Jean | quitó la etiqueta cosida «WAH JEANS» de la cintura (lo avisó él mismo) |
| Pantalón beige | retocó costuras, botón y silueta («pudo modificar ligeramente») |
| Top negro | quitó la etiqueta interior «DIVANANA», mangas algo distintas |
| Chaleco | forro del hombro distinto, tela algo más azulada |

## Hallazgo 2 — el prompt de edición mínima conserva más, pero no garantiza

Con el prompt de abajo (sin «quita arrugas», sin «luz pareja», con la regla de las etiquetas cosidas):

- **Jean:** conserva la etiqueta de la cintura y se parece más al original.
- **Top negro:** conserva la etiqueta interior «DIVANANA».
- **Blusa rayada:** rayas más finas y grisáceas, más cerca de la foto real; el cuello sigue reconstruido.
- **Pantalón beige:** casi igual que antes, y algo más ancho que el original.
- ChatGPT mismo responde que **no puede garantizar** que sea una edición solo sobre los píxeles originales: «la herramienta regeneró la imagen».

**Conclusión:** mejora, pero cada foto necesita que una persona compare antes y después antes de subirla. Un modelo generativo no «borra»,
reconstruye.

## El prompt (v2, edición mínima)

```
Esta es la foto real de UN producto de mi tienda de ropa. Haz una EDICIÓN MÍNIMA para mi página web: NO redibujes ni regeneres la prenda; conserva exactamente su tela, rayas, estampado, tono, costuras, botones, bolsillos, cuello y proporciones. Primero clasifícalo en una línea (TIPO: ARRIBA, PANTALÓN, CARTERA u OTRO). Haz SOLO esto: (1) quita el gancho, las pinzas, la etiqueta colgante, el código QR y cualquier maniquí o persona, y rellena únicamente lo que ellos tapaban continuando la tela con su mismo patrón; (2) quita el fondo: entrega un PNG con fondo TRANSPARENTE real (canal alfa), no blanco ni cuadritos dibujados; (3) endereza la prenda nivelándola sin deformarla ni redibujarla: vertical 4:5, de frente, centrada, margen máximo de 3 %, sin sombra proyectada. LAS ETIQUETAS COSIDAS O ESTAMPADAS EN LA PRENDA SE QUEDAN (marca en la cintura o la pretina, parche, etiqueta interior del cuello, logos): solo se quitan las que cuelgan. No cambies ni suavices las arrugas, el color ni la luz. Simétrico no es espejo: si el diseño es asimétrico, se queda asimétrico. Si para cumplir algo tuvieras que cambiar unas rayas, una costura, un botón o una marca, NO lo hagas y dímelo. Al terminar dime en una línea qué cambiaste fuera de esta lista.
```

## Revisión antes de subir (por foto)

1. ¿Las rayas o el estampado tienen el mismo grosor y tono que la foto real?
2. ¿Siguen las etiquetas cosidas (marca en la cintura, etiqueta interior)?
3. ¿Mismos botones, costuras y bolsillos, en cantidad y posición?
4. ¿La silueta no quedó más ancha o más corta que la prenda real?
5. Lo que ChatGPT diga en «cambios fuera de la lista» se lee siempre.

## Límites del chat para hacerlo en volumen

~1 a 1,5 minutos por foto y una conversación por foto. Para las 463 fotos publicadas no es práctico por la pantalla del chat: haría falta la API
de OpenAI (cuenta aparte del plan Plus, con cobro por imagen). Decisión pendiente de Felipe.

## Fotos principales que aún traen gancho o etiqueta (revisión del 2026-10-21)

Se miraron las 281 fotos principales de ropa en JPG del catálogo (sin accesorios, bolsos ni bisutería; sin las fotos por color). Son 32 con gancho, pinzas
o etiqueta colgante, y todas deben pasar por el prompt de arriba:

BLZ-0008, CHA-0011, CHA-0013, CMS-0011, CMS-0019, CMS-0028, CMS-0029, CMS-0045, CMS-0047, CMS-0048, CMS-0050, CMS-0051, CMS-0052 («Blusa Marga Larga Cuello Tortuga»),
FAL-0008, FAL-0009, FAL-0010, JEA-0014, JEA-0015, PAN-0014, PAN-0017, PAN-0021, PAN-0022, POL-0012, POL-0015, POL-0028, POL-0032, POL-0044,
TOP-0018, TOP-0021, TOP-0049, VES-0014, VES-0015.

Quedan sin revisar: las fotos no principales (por color), los accesorios y las 84 que ya son PNG. Un recorte se genera solo al subir la foto nueva (estado «listo»).

## Las 32 pendientes, corridas con el prompt de edición mínima (2026-10-21, noche)

Las 32 pasaron por ChatGPT Plus (una conversación por foto) y quedaron como PNG sin fondo de 1122×1402 en `Descargas/fotos-corregidas-32/` (nombre = código del
producto). Todas traen transparencia real (32 % a 71 % del lienzo). Pendiente: la aprobación de Felipe, foto por foto, antes de subir nada al ERP. A mirar con lupa:
VES-0014 y VES-0015 (la silueta cambió), TOP-0018 (el texto estampado del pecho), POL-0015 (la etiqueta del cuello) y JEA-0015 (más ancho que el original).

## Las 32, subidas al ERP real (2026-10-21, noche)

Felipe aprobó las 32 y se subieron una a una desde Editar producto (Felipe elegía el PNG en el selector; el resto lo hizo Claude), con verificación en la base después de cada una:
1 foto en cada producto sin colores, el PNG nuevo como principal y su recorte del probador generado solo. Las fotos viejas siguen en el bucket `retail-productos-fotos/fotos/` (no se borró nada);
sus nombres están en `RESPALDO-fotos-actuales.tsv` junto a los PNG (`Descargas/fotos-corregidas-32/`).

- **CMS-0048 y VES-0015** (varias fotos de color): solo se reemplazó la general; las otras (12 y 6) quedaron intactas. En ambas, y en CMS-0045, el ERP dejó otra foto como principal al quitar la vieja y hubo que marcar «Principal» en la nueva.
- **Recorte del probador:** 31 en `listo`. **CMS-0045** (Blusa Manga Larga con Amarre) quedó `por_revisar` por «huecos»: mirar en Vitrina ▸ Probador.
- **TOP-0021:** se subió la versión corregida (1 915 974 bytes), no la v1 con gancho.
- **Pendiente de Felipe:** comparar con la prenda física, sobre todo VES-0014, VES-0015, TOP-0018 (texto del pecho), POL-0015 (etiqueta del cuello) y JEA-0015 (ancho). Cualquiera se puede revertir apuntando de nuevo al archivo viejo.
