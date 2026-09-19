#!/usr/bin/env python3
"""Une src/*.css + src/*.js en un solo HTML autocontenido: ../produccion-modulo-spike.html"""
import os
d=os.path.dirname(os.path.abspath(__file__))
rd=lambda f: open(os.path.join(d,f),encoding='utf-8').read()
js='\n'.join(rd(f) for f in ['datos.js','marco.js','vista-resumen.js','vista-abastecer.js','vista-ordenes.js','vista-insumos.js','acciones.js'])
html=rd('plantilla.html').replace('/*CSS*/',rd('estilos.css')).replace('/*JS*/',js)
open(os.path.join(d,'..','produccion-modulo-spike.html'),'w',encoding='utf-8').write(html)
print('ok',len(html))
