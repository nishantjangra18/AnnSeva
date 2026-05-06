# AnnSeva

AnnSeva is a full-stack real-time food redistribution platform for Donors, Collectors, and Drivers. It uses a universal dashboard shell with role-specific navigation and styling, a MongoDB-backed listing state machine, OTP-gated handoffs, Socket.IO updates, and Google Maps route support.

## Stack

- Frontend: React + Vite, Socket.IO client, lucide icons
- Backend: Node.js + Express, Socket.IO, Mongoose
- Database: MongoDB

## Folder Structure

```text
AnnSeva/
  backend/
    src/
      config/          MongoDB connection
      controllers/     Auth, listings, locations
      middleware/      Auth, role checks, error handling
      models/          User and single Listing collection
      routes/          Express route modules
      services/        Listing state machine and OTP service
      sockets/         Realtime listing room handlers
      app.js
      server.js
  frontend/
    src/
      App.jsx          Universal shell, role dashboards, listing UI
      api.js           Authenticated API client
      socket.js        Socket.IO client singleton
      styles.css       MongoDB-inspired dark premium theme
```

## Listing Collection

The backend stores food redistribution work in one `listings` collection with:

- `donorId`, `collectorId`, `driverId`
- `foodDetails.title`, `quantity`, `unit`, `expiry`, `notes`
- `locations.donor`, `locations.collector`, `locations.driver`
- `stage`: `listed`, `connected`, `picking`, `delivering`, `completed`
- hashed donor and collector OTPs
- `ratings`
- `impactScore`
- timestamps

Stage changes are only exposed through backend endpoints. The service validates the current stage before every transition, so stages cannot be skipped from the client.

Donor and collector locations come from saved user profiles. The listing UI does not accept manual coordinates.

## Key API Endpoints

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
PUT  /api/auth/profile

GET  /api/listings
POST /api/listings
POST /api/listings/:id/accept-collector
POST /api/listings/:id/accept-driver
POST /api/listings/:id/pickup
POST /api/listings/:id/delivery
POST /api/listings/:id/rate
POST /api/listings/:id/location
```

## Realtime Events

- `listing:join`: subscribe to one listing room
- `listing:update`: receive stage/listing updates
- `driver:location`: receive live driver position updates
- `listings:changed`: refresh role dashboards when inventory changes

## Local Setup

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and `JWT_SECRET`.
2. Copy `frontend/.env.example` to `frontend/.env`; optionally add `VITE_GOOGLE_MAPS_API_KEY`.
3. Run the backend:

```bash
cd backend
npm install
npm run dev
```

4. Run the frontend:

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

The frontend defaults to `http://localhost:5173` and the API defaults to `http://localhost:5000`.

Before a donor can create listings or a collector can accept listings, the user must save a profile address and map location.
