# Panel MA · MA Importaciones

Plataforma interna de **MA Importaciones** para gestionar todo el negocio en un solo lugar:
importaciones (contenedores/arribos), ventas (MercadoLibre + Odoo), reposición, rentabilidad
y una sección de **reportes** analíticos. El acceso se controla **por módulos** según el usuario.

Construida con **Next.js 16 · React 19 · Prisma · Tailwind · TypeScript**, desplegada en **Vercel**
con base **Postgres (Neon)**. Los datos de ventas y stock se leen en vivo de la API externa
**MUNDO SHOP** (espejo de solo lectura de Odoo + MercadoLibre).

---

## 🧭 Módulos

| Sección | Qué hace |
|---|---|
| **Dashboard** | Panorama general del negocio. |
| **Importaciones** | • **Resumen** de importaciones · • **Tablero** kanban de embarques (con adjuntos) · • **Embarques**: subís el Excel de cada contenedor y muestra foto, código, FOB, CBM y totales (extrae las fotos incrustadas en las celdas) · • **Calculadora** de costo nacionalizado · • **Buscar SKU**. |
| **Ventas** | • **Resumen de Ventas** (ML + Odoo local/mayorista/otros) · • **Rentabilidad por SKU** · • **Órdenes ML** en tiempo real · • **Reposición** (cruza ventas con stock y sugiere cuánto pedir). |
| **Reportes** | • **Ventas aceleradas / riesgo de quiebre** (alerta diaria, opcional por WhatsApp) · • **Publicaciones sin rotación** (mes vs mes vs mismo mes del año pasado) · • **Cancelaciones de MercadoLibre** (por semana/mes, con detalle al clickear) · • **Calidad de las publicaciones** (health de ML + objetivos a cumplir) · • **Mala experiencia de compra** (por SKU: los problemas de compradores de los últimos 180 días, las ventas del período, el problema principal y cómo mejorarlo según ML; se alimenta de una captura del panel y avisa por mail lo que empeora) · • **Publicaciones a revisar** (inactivas con stock en Odoo y su motivo + activas sin ventas en una ventana configurable). |
| **Administración** | Gestión de usuarios y sus módulos, backups. |

El menú (sidebar y nav móvil) muestra a cada usuario solo los módulos que tiene habilitados.
La app es **PWA** (se puede instalar como app en iOS/Android).

---

## 🗄️ Fuentes de datos

- **Postgres (Neon)** vía Prisma — datos propios de la plataforma: contenedores y sus productos,
  usuarios, configuración y corridas de reportes, overrides de costo, histórico mensual, etc.
- **API MUNDO SHOP** (`src/lib/mundoshop.ts`) — base **SQLite de solo lectura** con datos de Odoo +
  MercadoLibre (órdenes, ítems, stock, envíos…). Se consulta con SQL (`SELECT`) autenticando por
  header `x-api-key`. **Nunca se expone al navegador**: siempre se llama desde el servidor.

Modelos Prisma: `Container`, `ContainerDoc`, `Product`, `Reposicion`, `CostOverride`, `User`,
`Profile`, `LoginAttempt`, `ReportConfig`, `ReportRun`, `CodigoFoto`, `ProductOrigin`,
`VentaHistorica`.

Las **fotos de los productos** no se guardan en la base: van a **Vercel Blob** y en
`Product.photo` queda sólo la URL (ver `src/lib/photos.ts`).

---

## 🚀 Correr en tu PC (local)

1. Instalá dependencias (solo la primera vez):

   ```bash
   npm install
   ```

2. Creá el `.env` a partir del ejemplo y completá los valores (ver más abajo):

   ```bash
   cp .env.example .env
   ```

3. Aplicá las migraciones en la base (solo la primera vez o al traer cambios de schema):

   ```bash
   npx prisma migrate deploy
   ```

4. Arrancá la plataforma:

   ```bash
   npm run dev
   ```

5. Abrí **http://localhost:3000**. Acceso inicial: usuario/clave de `ADMIN_USER` / `ADMIN_PASSWORD`.

Otros comandos:

```bash
npm test        # corre los tests (Vitest)
npm run lint    # ESLint
npm run build   # build de producción (corre prisma generate + prisma migrate deploy + next build)
```

> La base es **Postgres**. En local podés apuntar `DATABASE_URL` a un Neon de desarrollo o a un
> Postgres local.

### Cambiar el schema

El esquema se gestiona con **migraciones versionadas** (`prisma/migrations/`), no con `db push`.
Cuando toques `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name lo-que-cambiaste
```

Eso genera el `.sql` de la migración, lo aplica en tu base y regenera el cliente. **El `.sql` se
commitea junto con el cambio de schema**: es el que corre en producción durante el deploy.

> **Por qué no `db push`.** Antes el build corría `prisma db push --accept-data-loss` contra la base
> de producción en cada deploy. Con cambios aditivos no pasaba nada, pero un rename de columna se
> traduce en borrar la vieja y crear la nueva vacía — sin aviso, sin registro y sin vuelta atrás.
> Con migraciones el SQL se revisa en el PR antes de tocar la base.

---

## 🔐 Variables de entorno (`.env`)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres (Neon) — conexión *pooled*. |
| `DATABASE_URL_UNPOOLED` | Postgres — conexión directa (la usa Prisma para el schema). |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Superadmin (acceso a todos los módulos, sin fila en la tabla de usuarios). |
| `AUTH_SECRET` | Secreto para firmar la cookie de sesión (poné uno largo y aleatorio). |
| `MUNDOSHOP_BASE_URL` / `MUNDOSHOP_API_KEY` | API externa de Odoo + MercadoLibre. |
| `CRON_SECRET` | Protege el endpoint del cron diario de reportes. |
| `SHEETS_TOKEN` | Protege el feed de embarques que consume la planilla de Google Sheets (opcional; sin él, el feed queda cerrado). |
| `REPORT_WHATSAPP_TO` | Número(s) destino del reporte por WhatsApp (opcional). |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` | Envío por WhatsApp vía Meta Cloud API (opcional; si faltan, el reporte igual se genera y se muestra). |
| `RESEND_API_KEY` | Clave de [Resend](https://resend.com) para las alertas por mail de experiencia de compra (opcional; sin ella el reporte se muestra igual y el aviso queda en `skipped:sin-config`). |
| `REPORT_EMAIL_FROM` | Remitente de las alertas, ej. `MA Importaciones <alertas@maimportaciones.com.uy>`. El dominio tiene que estar **verificado** en Resend; sin dominio propio solo se puede mandar desde `onboarding@resend.dev` a la casilla de la cuenta. |
| `REPORT_EMAIL_TO` | Mail(es) destino por defecto de las alertas. Lo que se configure desde la pantalla del reporte le gana a esto. |
| `PANEL_BASE_URL` | Base para el link al panel dentro del mail (opcional; en Vercel se deduce del dominio del deploy). |

El `.env` y cualquier base local están en `.gitignore` (no se suben). Ver `.env.example`.

---

## ⏰ Reporte automático (cron)

**Ventas aceleradas** corre y se envía solo todos los días. Está configurado en `vercel.json`:

```json
{ "crons": [ { "path": "/api/cron/reportes", "schedule": "0 12 * * *" } ] }
```

`12:00 UTC` = **09:00 de Uruguay** (UTC-3). El endpoint valida el header `Authorization: Bearer $CRON_SECRET`,
así que hay que cargar `CRON_SECRET` en las variables de entorno de Vercel para que funcione. Si hay SKU
en riesgo, se manda por WhatsApp.

El reporte de **experiencia de compra** no está en el cron, y no es un olvido: su dato solo existe en el
panel de vendedor. Ver abajo.

---

## 😞 Experiencia de compra

Es lo que ML mide con los **problemas que tuvieron los compradores** en las ventas de los últimos 180
días («hiciste 422 ventas y tuviste 17 problemas»), comparado contra productos parecidos de la
competencia. Cada problema viene tipificado (faltaban partes, llegó dañado, era diferente a lo pedido…)
con el consejo textual de ML para arreglarlo.

**No confundir con la calidad de la publicación** (ficha, fotos, catálogo, video), que es otra métrica y
tiene su propio reporte en *Calidad de las publicaciones*.

### Por qué se importa a mano

El dato **no está en ninguna API**. La doc de MUNDO SHOP lo dice en sus notas: *«Reclamos: No disponible
por API de ML (permiso no habilitado)»*. Ojo con `/ml-experiencia/:id`: a pesar del nombre **no** es
esto, es un puntaje casero de 9 aspectos de la ficha (health 25 pts, fotos 15, opiniones 15…) que no
mira reclamos.

Como el panel pide login, un cron de Vercel no puede ir a buscarlo. El flujo es:

1. **Capturar** el panel de vendedor con el navegador. Salen dos JSON: el del **listado** (todas las
   publicaciones con su `%` de experiencia y de calidad) y el del **diagnóstico** (el detalle de
   problemas de las que están por debajo de 100).
2. **Importar** los JSON desde el botón *Importar captura* de la pantalla del reporte
   (`POST /api/reportes/experiencia/import`, acepta los dos archivos juntos). Se mergean por id de
   publicación y quedan guardados como snapshot en `ExperienciaSnapshot`.
3. La pantalla y el Excel leen **la última captura**.

### Cómo se arma el reporte

- **Una fila por SKU completo.** `16214-BLA` y `16214-NOG` van separados: ML calcula la experiencia a
  nivel producto, así que las publicaciones que comparten SKU traen los mismos reclamos, las mismas
  ventas y el mismo consejo. Los números se toman **una vez por SKU**, no se suman entre hermanas
  (verificado en los 60 SKU con más de una publicación). Las publicaciones sin SKU cargado en ML quedan
  como filas propias.
- **Semáforo:** 🔴 hasta 30 % (ahí ML avisa que puede pausar o anular), 🟡 por debajo de 100 %.
- **Ventas 180 d:** las que informa ML. Cuando el panel no las dice (los SKU sin problemas) se usa la
  columna de nuestra base, calculada sobre `ml_orders` de MUNDO SHOP.
- **`exp: -1` no es un puntaje malo, es «no lo calculé»**: son las publicaciones que no vendieron en la
  ventana (683 de 2213 en la captura del 29/07). Quedan afuera del reporte y se informan aparte en el
  resumen; si entraran, aparecerían como las peores del catálogo.

### El aviso por mail

Sale **al importar una captura nueva**, comparándola con la anterior: avisa los SKU que sumaron
reclamos (`minReclamos`, por defecto 1) o que perdieron puntos de experiencia. Comparar es la única
forma de saber qué empeoró, porque ML da los reclamos de la ventana como total y no fechados. La
**primera captura no manda nada** (no hay con qué comparar). El destino se edita desde la pantalla (o
con `REPORT_EMAIL_TO`).

---

## 📊 Embarques en Google Sheets

La planilla se mantiene sola: una pestaña **Resumen** con todos los embarques (con su **Origen**: 🇨🇳 China
o 🇧🇷 Brasil) y una pestaña por embarque con su detalle (foto, código, cantidad y observaciones). Los
embarques de Brasil llevan **“ - BR”** al final del nombre, porque en la pestaña no hay columna que lo
aclare. Cuando un embarque se marca como **arribado** (entra a depósito), **su pestaña se queda donde
está**, con todo el detalle a mano: el cambio se ve en el Resumen (estado y fecha de llegada) y en el
encabezado de la pestaña. Lo único que se mueve es el orden: los recibidos bajan al final.

La foto que se manda es la misma que muestra la tabla del panel: **la puesta a mano > la de MercadoLibre
(por código) > la del Excel**. Las `.webp` no viajan: `=IMAGE()` de Sheets no las renderiza.

> **El feed no expone datos comerciales.** Ni precios FOB, ni montos, ni CBM, ni flete, ni costo
> nacionalizado: la route ni siquiera los trae de la base. La planilla se comparte con gente que sólo
> necesita saber qué viene y cuándo llega, y quien tenga permiso de edición sobre la hoja puede leer el
> token en las propiedades del Apps Script y pegarle al endpoint a mano. Si alguna vez hace falta un feed
> con números, va como endpoint aparte y con su propio token.

- **Feed:** `GET /api/sheets/embarques`, valida `Authorization: Bearer $SHEETS_TOKEN`.
- **Script:** `docs/embarques-google-sheet.gs` — se pega en *Extensiones > Apps Script* de la planilla.
  Las instrucciones de instalación están en el encabezado del archivo. Si el script cambia (por ejemplo,
  al agregarse la columna Origen), hay que volver a pegarlo: el panel solo manda los datos.

El `API_URL` y el `TOKEN` van en *Propiedades del script*, no en el código, para que el token no viaje
si se comparte la planilla. El refresco es cada 15 minutos (menú **Embarques**); no es instantáneo.

---

## ☁️ Deploy en Vercel

1. El repo está conectado a Vercel: **cada push a `main` dispara un deploy** de producción.
2. Cargar las variables de entorno (las de la tabla de arriba) en *Settings → Environment Variables*.
3. El `build` corre `prisma generate && prisma migrate deploy`: aplica las migraciones pendientes
   que vengan commiteadas en `prisma/migrations/`. Si una falla, el deploy se corta y la base queda
   como estaba.

---

## 🧩 Estructura

```
src/
  app/
    (app)/                 -> páginas con sesión, agrupadas por módulo
      dashboard/  arribos/  resumen/  rentabilidad/  ordenes/
      reposicion/  reportes/  admin/  page.tsx (Resumen Importaciones)
    api/                   -> endpoints (login, containers, resumen, reportes, cron, admin…)
    login/                 -> pantalla de acceso
  components/              -> UI (Sidebar, MobileNav, tablas y componentes de cada reporte)
  lib/                     -> lógica pura + acceso a datos (con tests .test.ts)
    mundoshop.ts           -> cliente de la API externa
    modules.ts             -> definición de módulos y control de acceso
    reportes.* rotacion.* cancelaciones.* calidad.* publicaciones.*  -> lógica de los reportes
    excel.ts               -> parseo del Excel de contenedores (incluye fotos)
  middleware.ts            -> sesión + control de acceso por módulo
prisma/schema.prisma       -> modelos de la base propia (Postgres)
vercel.json                -> cron de reportes
```

Convención: la **lógica pura** vive en `*.ts` (testeable con Vitest) y lo que toca red/base en
`*.server.ts`.

---

## ⚡ Rendimiento

Tres cosas que conviene no deshacer sin querer:

- **Los reportes en vivo de ML se cachean 15 minutos** (`src/lib/cache.ts`). Armar el de Calidad
  son cientos de llamadas a MercadoLibre —el detalle de cada publicación— y más de un minuto de
  espera. Al abrir la pantalla se muestra lo cacheado; el botón **Actualizar** manda `?forzar=1`
  y lo rehace con los datos del momento. El cache vive en la memoria de la instancia: no es
  compartido ni sobrevive a un deploy, es un amortiguador.
- **Las fotos van por `next/image`**, no por `<img>`. Las del Excel se guardan tal cual las manda
  el proveedor (400 KB de promedio, alguna de 3 MB) y en pantalla se ven a 40 píxeles: sin
  optimizar, abrir un embarque de 50 ítems se baja ~20 MB. Los hosts permitidos están en
  `next.config.ts`; si aparece uno nuevo hay que sumarlo ahí **y** en `src/lib/fotoOptimizable.ts`.
  El lightbox es la excepción a propósito: ahí se quiere la foto en tamaño real.
- **`npm run lint` tiene que pasar limpio.** Las reglas de React que trae Next 16 avisan de cosas
  que cuestan renders de verdad: componentes definidos adentro de otro componente (se remontan en
  cada render) y dependencias de `useMemo` que se recrean solas (memoizan nada).

---

## 📄 Formato del Excel de contenedores

La primera hoja debe tener una fila de encabezados con columnas como **Foto · Código · Precio China (FOB) ·
Cantidad por caja · CBM unitario · CBM total** (los nombres no tienen que ser exactos: detecta variantes).
Las **fotos** deben estar incrustadas en la columna Foto — soporta imágenes ancladas de Excel y el formato
**DISPIMG** de WPS (habitual en proveedores chinos). Si falta el CBM total pero está el unitario y la
cantidad, se calcula solo. Subir un Excel nuevo **reemplaza** los productos de ese contenedor.

**Fotos corregidas a mano.** Cuando alguien cambia la foto de un ítem desde el panel, esa foto queda
guardada contra su código (tabla `CodigoFoto`, clave = código base: `48108-BEI-39` → `48108`). Todo
embarque futuro con ese código —venga del Excel o cargado a mano— nace con ella en lugar de la que traiga
el proveedor, y manda también sobre la de MercadoLibre. Si la foto se quita a mano, el código se olvida.

**La prioridad es una sola para toda la app**: manual > MercadoLibre > Excel, y vive en
`src/lib/fotoProducto.ts`. La usan la tabla de Embarques, la planilla de Google Sheets y —desde que
se unificó— también Órdenes ML, Rentabilidad y Reposición, que antes armaban su propio criterio
(ML > Excel) e ignoraban las fotos corregidas a mano.

---

## 🔒 Acceso y usuarios

- El **superadmin** entra con `ADMIN_USER`/`ADMIN_PASSWORD` y ve todos los módulos.
  **Si esas dos variables no están cargadas, el superadmin no existe** (antes caía a
  `admin`/`admin`, así que un deploy sin variables dejaba el panel abierto).
- Los demás usuarios se crean desde **Administración**, con los módulos que cada uno puede ver.
- La sesión es una cookie firmada (JWT con `jose`); el `middleware.ts` valida sesión y permisos por ruta.

### Freno a la fuerza bruta

El login cuenta los intentos fallidos en la tabla `LoginAttempt` y bloquea de a poco:
los primeros 5 no cuestan nada y de ahí en más la espera sube 1 → 2 → 5 → 15 → 30 minutos
(ver `src/lib/loginThrottle.ts`). Si pasa una hora sin fallos, el contador se olvida.

Se cuentan dos claves a la vez: **usuario + IP** (quien insiste con un usuario desde un lugar)
e **IP sola**, con un umbral más flojo de 15 (quien prueba usuarios distintos desde el mismo
lugar; una oficina entera comparte una IP). La clave de usuario lleva la IP adentro para que
nadie pueda dejar afuera a una persona real fallándole el login a propósito.

> Va en la base y no en memoria porque en Vercel cada instancia tiene su propia memoria: un
> contador en RAM se saltea con reintentar hasta caer en otra. Si la base no contesta, el login
> sigue funcionando sin freno — preferimos eso a que un problema de red deje a todos afuera.

---

## ⚠️ Nota para desarrollo

Este proyecto usa **Next.js 16**, que trae cambios respecto de versiones anteriores. Antes de tocar
código, leé la guía correspondiente en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
