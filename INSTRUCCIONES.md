# Sales Dashboard 2026 · Refractarios Iunge

Dashboard interactivo conectado en tiempo real a Google Sheets, con vista
ejecutiva consolidada y vistas individuales por vendedor (RC, MC, FF).

## Estructura de archivos

```
dashboard/
├── index.html         ← Estructura principal (doble clic para abrir)
├── style.css          ← Estilos (diseño claro y ejecutivo)
├── script.js          ← Lógica: fetch GET/POST, Chart.js, formularios
├── config.js          ← API_URL + opciones (refreshInterval, defaultVendor, enableLogging)
├── demo-data.js       ← Datos de respaldo para modo DEMO
├── apps-script.gs     ← Backend para pegar en Google Apps Script
└── INSTRUCCIONES.md   ← Este archivo
```

`index.html` carga los scripts en este orden:
1. `config.js`     — define `API_URL` y opciones
2. `demo-data.js`  — datos de respaldo
3. `script.js`     — consume `API_URL`

Al abrir por primera vez funciona en **modo DEMO** con los datos del
consolidado, hasta que pegues la URL real en `config.js`.

---

## Paso 1 · Subir el Excel a Google Sheets

1. Entra a https://drive.google.com con tu cuenta de Iunge.
2. **Nuevo → Subir archivo** → elige `Sales Dashboard 2026 - Consolidado.xlsx`.
3. Una vez subido, haz **doble clic** en el archivo en Drive.
4. Menú: **Archivo → Guardar como Hojas de cálculo de Google**.
5. Cierra el `.xlsx` original; trabaja con la versión Sheets.
6. **Anota el ID del Sheet**: en la URL aparece como
   `https://docs.google.com/spreadsheets/d/EL_ID_VA_AQUI/edit`.
7. **Comparte** el Sheet con Ricardo, Mónica y Franco como **Editor**.

---

## Paso 2 · Crear el Apps Script (backend)

1. Con el Sheet abierto, ve a **Extensiones → Apps Script**.
2. Borra el código por defecto.
3. Abre `apps-script.gs` desde tu carpeta local y copia todo su contenido.
4. Pégalo en el editor de Apps Script.
5. Reemplaza `'PEGA_AQUI_EL_ID_DE_TU_SHEET'` con el ID del Paso 1.
6. **Ctrl+S** para guardar.

### Probar el script
- Selecciona la función `testRead` y presiona **Ejecutar**.
- Autoriza permisos: *Avanzado → Ir a (proyecto) → Permitir*.
- En el panel inferior **Registro** debe verse un JSON con tus datos.

---

## Paso 3 · Publicar como aplicación web

1. **Implementar → Nueva implementación**.
2. Engranaje al lado de *Tipo* → **Aplicación web**.
3. Configura así:
   - Descripción: `Sales Dashboard API v1`
   - Ejecutar como: *Yo*
   - Quién tiene acceso: **Cualquier usuario**
4. Click **Implementar**.
5. **Copia la URL** que termina en `/exec`.

> *"Cualquier usuario"* no expone el Sheet — solo expone el endpoint que
> el script controla. El Sheet sigue protegido por su lista de compartidos.

---

## Paso 4 · Conectar el dashboard

1. Abre `config.js` con un editor de texto (Bloc de notas, VS Code, etc.).
2. Reemplaza la línea:
   ```js
   const API_URL = "PEGA_AQUI_LA_URL_DEL_SCRIPT";
   ```
   por la URL del paso anterior, por ejemplo:
   ```js
   const API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```
3. Guarda el archivo.
4. **Doble clic en `index.html`**. El indicador de la esquina superior
   derecha pasa de **DEMO** (amarillo) a **Conectado** (verde) con la
   hora del último refresh.

### Otras opciones en config.js
| Variable          | Por defecto    | Qué hace                                                    |
|-------------------|----------------|-------------------------------------------------------------|
| `refreshInterval` | `60`           | Segundos entre auto-refresh. Pon `0` para desactivarlo.     |
| `defaultVendor`   | `"executive"`  | Pestaña que abre por defecto: `executive` / `RC` / `MC` / `FF` |
| `enableLogging`   | `true`         | Imprime diagnóstico en la consola del navegador (F12).      |

---

## Uso diario

| Acción                                    | Cómo                                      |
|-------------------------------------------|-------------------------------------------|
| Cambiar de vista                          | Pestañas en la cabecera                   |
| Filtrar por vendedor / etapa              | Chips en la barra de filtros              |
| Buscar cliente                            | Cuadro de búsqueda en vista ejecutiva     |
| Refrescar manualmente                     | Botón ↻ en la esquina superior derecha    |
| Refresco automático                       | Cada `refreshInterval` segundos           |
| Agregar oportunidad                       | Formulario en cada pestaña de vendedor    |

### Agregar oportunidad
- Abre la pestaña del vendedor (RC, MC o FF).
- Llena el formulario. Si dejas % de avance vacío se completa automáticamente
  según la etapa seleccionada (ej. *Reunión* → 30 %).
- Al enviar, la fila se inserta en la pestaña correspondiente del Sheet
  (justo antes de *GRAN TOTAL US$*).

---

## Compartir con el equipo

Para que Ricardo, Mónica o Franco usen el dashboard desde sus computadores:

1. Comparte la **carpeta `dashboard/` completa** (Drive, Teams, Email).
2. Que cada uno la guarde donde prefieran.
3. Doble clic en `index.html`.

Como `config.js` ya trae la URL del Web App, todos verán los mismos datos
en vivo. No necesitan instalar nada.

---

## Solución de problemas

| Síntoma                                    | Solución                                                                 |
|--------------------------------------------|--------------------------------------------------------------------------|
| Indicador rojo "Error de conexión"         | Verifica que `API_URL` en `config.js` esté correcta y termine en `/exec` |
| Indicador amarillo "Modo DEMO"             | `API_URL` aún tiene el placeholder `PEGA_AQUI_LA_URL_DEL_SCRIPT`        |
| Charts vacíos                              | El Sheet no tiene filas o están filtradas. Quita filtros.               |
| Error al guardar oportunidad               | Revisa que el Apps Script siga implementado y tengas permiso editor     |
| Cambios en Apps Script no se reflejan      | **Implementar → Administrar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar** |
| Quiero ver qué pasa en background          | Pon `enableLogging = true` y abre la consola del navegador (F12)        |

---

## Estructura de datos en el Sheet

Cada pestaña (`RC`, `MC`, `FF`) debe tener:

| Fila    | Contenido                                          |
|---------|----------------------------------------------------|
| 1       | Título                                             |
| 2       | Subtítulo (ej. *OBJETIVOS RICARDO CEPEDA*)         |
| 3       | Encabezados                                        |
| 4+      | Filas de datos (una oportunidad por fila)          |
| Última  | `GRAN TOTAL US$` (opcional, marca el fin)          |

Las 13 columnas en orden son:
`Cliente · Objetivo Venta · Nombre del contacto · Etapa de ventas ·
Estimación Negocio · Grado de Avance · Precio Unitario Estimado ·
Cantidad Parcial (KG) · Avance Parcial · Cumplimiento ·
Fecha de cierre actividad · Siguientes pasos · Comentarios`
