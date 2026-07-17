# Sharing Music

Plataforma social para escuchar música en tiempo real.

## Stack

- **API**: NestJS, Prisma, PostgreSQL, Redis, Socket.IO, Auth0
- **Web**: Next.js (App Router, mock data MVP)
- **Mobile** (próximo): Expo

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Variables de entorno
cp .env.example .env

# 3. Infra local
npm run db:up

# 4. Migraciones
npm run db:migrate

# 5. API en desarrollo
npm run api:dev

# 6. Smoke (API + Postgres + Redis)
npm run smoke

# 7. Web en desarrollo
npm run web:dev
```

La API queda en `http://localhost:3001/api/v1`.
La web queda en `http://localhost:3000`.

Checklist E2E: [`docs/E2E-VALIDATION-CHECKLIST.md`](docs/E2E-VALIDATION-CHECKLIST.md).

## Endpoints (Phase 2 persistence)

Base: `http://localhost:3001/api/v1`  
Guest headers (required for room mutations): `X-Guest-Id`, `X-Guest-Name`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/rooms` | No | Salas públicas |
| POST | `/rooms` | Guest | Crear sala (+ membership OWNER) |
| POST | `/rooms/:id/join` | Guest | Join → `RoomMember` real |
| GET | `/rooms/:id` | Guest | Snapshot completo |
| POST | `/rooms/:id/queue` | Guest | Add / start Now playing |
| DELETE | `/rooms/:id/queue/:itemId` | Guest | Quitar propia canción sin votos |
| POST | `/rooms/:id/votes` | Guest | Voto único (cast/move) |
| POST | `/rooms/:id/messages` | Guest | Chat texto |
| POST | `/rooms/:id/messages/voice` | Guest | Multipart `file` + `durationMs` |
| POST | `/rooms/:id/playback/advance` | Guest | Siguiente por votos/`addedAt` |

Voice files: disco local `apps/api/uploads/voice/`, URL pública `/uploads/voice/...` (no base64 en Postgres).

## Realtime (Phase 3)

Namespace Socket.IO: `http://localhost:3001/realtime`  
La DB (Phase 2) es la fuente de verdad: cada mutación se persiste y luego se hace broadcast a la sala.

### Cliente → servidor

| Evento | Payload | Efecto |
|--------|---------|--------|
| `room.join` | `{ roomId, guestId, displayName? }` | Join → `RoomMember`, ack + `room.joined` / `room.snapshot` |
| `room.sync` | `{ roomId }` | Reconnect: emite `room.snapshot` fresco |
| `queue.add` | video + metadata | Persiste cola / Now playing |
| `queue.remove` | `{ roomId, queueItemId }` | Quita ítem propio |
| `vote.cast` | `{ roomId, queueItemId }` | Voto único (cast/move) |
| `chat.send` | `{ roomId, content }` | Mensaje de texto |
| `playback.advance` | `{ roomId, endingYoutubeVideoId? }` | Avanza de forma idempotente |

### Servidor → cliente

`room.joined`, `room.snapshot`, `member.joined`, `member.left`, `queue.updated`, `vote.updated`, `chat.message`, `playback.updated`, `playback.advanced`

Redis pub/sub está preparado para varias instancias de API (publish en el canal de la sala); aún no hay adapter Socket.IO multi-nodo completo.

### Tests realtime

```bash
npm run test -w api
# incluye rooms.gateway.spec.ts (dos clientes Socket.IO en la misma sala)
```

## Frontend conectado (Phase 4)

La web usa REST + Socket.IO (ya no mock/localStorage de salas).

```bash
# apps/web/.env.local
YOUTUBE_API_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

| Responsabilidad | Canal |
|-----------------|-------|
| Crear / listar / join / snapshot / voz | REST `/api/v1` |
| Cola, votos, chat texto, advance, sync | Socket.IO `/realtime` |
| Volumen, mute, ducking, guest id/name | `localStorage` local |

```bash
npm run test -w web
# incluye room-session.test.ts (convergencia 2 clientes, reconnect, votos, voice URL, sin duplicar system msgs)
```

**Validación real (2 ventanas):** ver checklist estricta en [`docs/E2E-VALIDATION-CHECKLIST.md`](docs/E2E-VALIDATION-CHECKLIST.md).

Antes de abrir el frontend:

```bash
npm run db:up
npm run db:migrate
npm run api:dev
# otra terminal:
npm run smoke   # Docker + GET /api/v1/health (Postgres SELECT 1 + Redis PING)
npm run web:dev
```

Phase 5 feature work aún no empezada.
