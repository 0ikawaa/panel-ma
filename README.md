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
| **Reportes** | • **Ventas aceleradas / riesgo de quiebre** (alerta diaria, opcional por WhatsApp) · • **Publicaciones sin rotación** (mes vs mes vs mismo mes del año pasado) · • **Cancelaciones de MercadoLibre** (por semana/mes, con detalle al clickear) · • **Calidad de las publicaciones** (health de ML + objetivos a cumplir) · • **Publicaciones a revisar** (inactivas con stock en Odoo y su motivo + activas sin ventas en una ventana configurable). |
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
`Profile`, `ReportConfig`, `ReportRun`, `ProductOrigin`, `VentaHistorica`.

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

3. Creá/actualizá las tablas en la base (solo la primera vez o al cambiar el schema):

   ```bash
   npx prisma db push
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
npm run build   # build de producción (corre prisma generate + prisma db push + next build)
```

> La base es **Postgres**. En local podés apuntar `DATABASE_URL` a un Neon de desarrollo o a un
> Postgres local. El esquema se gestiona con `prisma db push` (no hay carpeta de migraciones).

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

El `.env` y cualquier base local están en `.gitignore` (no se suben). Ver `.env.example`.

---

## ⏰ Reportes automáticos (cron)

El reporte **Ventas aceleradas** puede correr y enviarse solo todos los días. Está configurado en
`vercel.json`:

```json
{ "crons": [ { "path": "/api/cron/reportes", "schedule": "0 12 * * *" } ] }
```

`12:00 UTC` = **09:00 de Uruguay** (UTC-3). El endpoint valida el header `Authorization: Bearer $CRON_SECRET`,
así que hay que cargar `CRON_SECRET` en las variables de entorno de Vercel para que funcione.

---

## 📊 Embarques en Google Sheets

La planilla se mantiene sola: una pestaña **Resumen** con todos los embarques y una pestaña por embarque
con su detalle de ítems y las fotos. Cuando un embarque se marca como **arribado** (entra a depósito),
su pestaña se oculta sola; queda accesible desde *Ver > Hojas ocultas*.

- **Feed:** `GET /api/sheets/embarques`, valida `Authorization: Bearer $SHEETS_TOKEN`.
- **Script:** `docs/embarques-google-sheet.gs` — se pega en *Extensiones > Apps Script* de la planilla.
  Las instrucciones de instalación están en el encabezado del archivo.

El `API_URL` y el `TOKEN` van en *Propiedades del script*, no en el código, para que el token no viaje
si se comparte la planilla. El refresco es cada 15 minutos (menú **Embarques**); no es instantáneo.

---

## ☁️ Deploy en Vercel

1. El repo está conectado a Vercel: **cada push a `main` dispara un deploy** de producción.
2. Cargar las variables de entorno (las de la tabla de arriba) en *Settings → Environment Variables*.
3. El `build` corre `prisma generate && prisma db push`, así que los cambios de schema se aplican
   automáticamente contra la base de producción en cada deploy.

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

## 📄 Formato del Excel de contenedores

La primera hoja debe tener una fila de encabezados con columnas como **Foto · Código · Precio China (FOB) ·
Cantidad por caja · CBM unitario · CBM total** (los nombres no tienen que ser exactos: detecta variantes).
Las **fotos** deben estar incrustadas en la columna Foto — soporta imágenes ancladas de Excel y el formato
**DISPIMG** de WPS (habitual en proveedores chinos). Si falta el CBM total pero está el unitario y la
cantidad, se calcula solo. Subir un Excel nuevo **reemplaza** los productos de ese contenedor.

---

## 🔒 Acceso y usuarios

- El **superadmin** entra con `ADMIN_USER`/`ADMIN_PASSWORD` y ve todos los módulos.
- Los demás usuarios se crean desde **Administración**, con los módulos que cada uno puede ver.
- La sesión es una cookie firmada (JWT con `jose`); el `middleware.ts` valida sesión y permisos por ruta.

---

## ⚠️ Nota para desarrollo

Este proyecto usa **Next.js 16**, que trae cambios respecto de versiones anteriores. Antes de tocar
código, leé la guía correspondiente en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
