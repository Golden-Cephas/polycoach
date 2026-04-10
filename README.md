# PolyCoach — Student Bus Booking System

## Project Structure

```
polycoach/
├── server.js              ← Express backend (all API routes)
├── package.json
├── data/                  ← JSON data store (auto-created on first run)
│   ├── users.json
│   ├── bookings.json
│   ├── seats.json         ← 72 seats, auto-seeded
│   └── settings.json      ← Departure info, fees (editable by admin)
├── uploads/
│   ├── payments/          ← Payment proof images
│   └── studentIDs/        ← Student ID images
└── public/                ← All frontend files served statically
    ├── css/Home-Page.css  ← Shared styles for all pages
    ├── js/popup.js        ← Shared popup + booking logic
    ├── Images/            ← Your image assets go here
    ├── Home-Page.html
    ├── Register.html
    ├── Thanks-Remark1.html
    ├── Book-Login.html
    ├── Payment-Upload.html
    ├── Bus-Lay.html
    ├── Final-Thanks.html
    ├── Status-Login.html
    ├── Bust-Status-Lay.html
    ├── Admin-Dashboard.html
    └── Help.html
```

## Images Required

Place these in `public/Images/`:
- `Logo1.png` — header logo
- `Logo3.png` — footer logo
- `Background1.png` — home page hero background
- `Mzuzu.jpg` — Mzuzu destination card
- `Mzimba.png` — Mzimba destination card
- `Jenda.jpg` — Jenda destination card
- `Facebook.png`, `Twitter.png`, `Whatsapp.png` — social icons

## Admin Credentials

| Phone | Password | Name |
|-------|----------|------|
| 0981136268 | Golden Cephas | Golden Cephas |
| 0881730203 | soyo1234 | Emmanuel Soyo |

## User Flow

1. **Register** → `/Register.html`
2. **Login to Book** → `/Book-Login.html` → choose destination + login
3. **Booking Popup** → "For myself" or "Someone else"
4. **Upload Payment** → `/Payment-Upload.html` → upload mobile money screenshot
5. **Select Seat** → `/Bus-Lay.html` → 72-seat bus (2+aisle+3 × 13 rows + 7 back)
6. **Confirmation** → `/Final-Thanks.html`

Admin goes straight to `/Admin-Dashboard.html` on login.

View-only seat status: `/Status-Login.html` → `/Bust-Status-Lay.html`

## Auth Protection

- Payment Upload, Seat Selection, Final Thanks → require active session
- Admin Dashboard → requires admin session
- Status page → requires any valid login
- Wrong credentials on Status Login shows a message + register prompt

---

## Local Development

```bash
npm install
node server.js
# Visit http://localhost:3000
```

---

## Deployment Options

### Option 1: Render.com (Recommended Free Tier)

1. Create account at [render.com](https://render.com)
2. New → Web Service → Connect your GitHub repo
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
4. Deploy

> ⚠️ Render free tier sleeps after 15min inactivity. Uploads and data persist between deploys only if you use a Render Disk.

### Option 2: Railway.app

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Add environment variable: `PORT=3000`
4. Railway auto-detects Node and runs `npm start`

### Option 3: Cyclic.sh / Glitch.com

- Glitch: Import from GitHub, runs automatically
- Cyclic: Free Node.js hosting with persistent storage

### Option 4: VPS (DigitalOcean, Contabo, etc.)

```bash
# On server
git clone <your-repo>
cd polycoach
npm install
npm install -g pm2
pm2 start server.js --name polycoach
pm2 save
pm2 startup
```

---

## Persistent Data on Free Hosts

Free hosts **reset the filesystem** on redeploy. To keep data:
- Use a free **MongoDB Atlas** cluster and swap `readJSON/writeJSON` for mongoose calls
- Or use **Render Disks** (paid add-on) to mount a persistent volume

For a simple student project, the JSON approach works fine locally and on VPS.

---

## Admin Features

- **Bus Layout Panel** — Click any of 72 seats to edit status, passenger name, destination
- **Registered Users Panel** — View, search, add manually, delete users
- **Pending Approvals Panel** — Approve/reject/delete bookings; badge shows pending count
- **Settings Panel** — Edit booking label, fee, departure date/time/venue (reflected live on Home Page)
