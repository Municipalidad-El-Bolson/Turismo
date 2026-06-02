# Turismo MEB

Aplicacion web para que establecimientos carguen ocupacion semanal y para que usuarios MEB administren cumplimiento y estadisticas.

## Stack

- Frontend: Next.js + React + TypeScript
- Backend: Python + FastAPI
- Base de datos: MongoDB

## Estructura

```text
frontend/   App Next.js
backend/    API FastAPI
docker-compose.yml
```

## Levantar con Docker

```bash
docker compose up --build
```

Frontend: http://localhost:3000  
Backend: http://localhost:8000/docs

## Levantar en desarrollo local

1. Copiar variables de entorno:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

2. Levantar MongoDB:

```bash
docker compose up -d mongodb
```

3. Instalar y correr backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

4. Instalar y correr frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:8000/docs

## Usuarios de ejemplo

El backend crea usuarios demo al iniciar si no existen:

- Admin MEB: usuario `admin`, contrasena `admin123`
- Establecimiento: ID `10000001`
- Establecimiento: ID `10000002`

Los nuevos establecimientos se crean desde el panel admin cargando nro. de parcela, nombre de alojamiento, direccion y telefono. El sistema genera automaticamente un ID aleatorio solo numerico; ese ID es el acceso que usa el establecimiento para cargar sus datos.

Si ya habias levantado MongoDB antes de cambiar a IDs numericos, puede que queden registros demo viejos en la base. Para arrancar limpio en desarrollo podes recrear el volumen de Docker.

La lista base de turismo 2026 se carga automaticamente desde `backend/app/establishments_seed.json`. Los telefonos locales `2944...` y `0294...` se normalizan como `+542944...` para prepararlos para WhatsApp.

## WhatsApp

La app trae una integracion preparada para WhatsApp Cloud API de Meta.

Por defecto corre en modo simulacion:

```env
WHATSAPP_PROVIDER=console
```

Para enviar mensajes reales, configurar:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=token_de_meta
WHATSAPP_PHONE_NUMBER_ID=id_del_numero_de_whatsapp
WHATSAPP_GRAPH_VERSION=v23.0
```

Desde el panel admin se puede enviar un recordatorio individual desde Cumplimiento, o recordar a todos los pendientes de la semana seleccionada.

Nota: para mensajes iniciados por la organizacion fuera de la ventana de atencion de WhatsApp, Meta puede requerir plantillas aprobadas. El servicio quedo encapsulado en `backend/app/whatsapp.py` para cambiar el texto libre por plantillas cuando tengas la cuenta configurada.

## Proximos pasos sugeridos

- Agregar autenticacion real con contrasenas/JWT.
- Integrar proveedor de WhatsApp, por ejemplo Twilio o Meta WhatsApp Cloud API.
- Agregar jobs programados para recordatorios semanales.
- Definir unidades por establecimiento si se necesita cargar detalle por unidad.
