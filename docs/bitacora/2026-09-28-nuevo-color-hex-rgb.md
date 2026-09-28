## 2026-09-28 (Nuevo producto: «+ Nuevo color» acepta #hex o RGB, como Atributos)
Qué hice: el formulario de color nuevo del alta solo abría el selector del navegador; ahora usa el mismo control que Catálogo ▸ Atributos (muestra + campo que acepta `#b3573f` o `179, 87, 63`, con el RGB al pie). El control salió de `ColoresLista.tsx` a `components/SelectorColor.tsx` y lo usan los dos.
Por qué así: Felipe lo pidió al ver el alta en producción; un proveedor manda el tono como RGB o hex, no como un clic en una paleta. Un solo componente evita que Atributos y el alta vuelvan a separarse.
Felipe se lleva: el tono se escribe o se elige, y los dos lugares se comportan igual; el aviso «se ve casi igual que Terracota» sigue saliendo mientras escribes.
