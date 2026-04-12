/*
 * PolyCoach — Production Server v3.0
 * Uploads: stored as base64 in MongoDB (no Cloudinary needed)
 * All files viewable directly from the admin dashboard
 *
 * ENVIRONMENT VARIABLES (set in Render dashboard):
 *   MONGODB_URI      — MongoDB Atlas connection string (REQUIRED)
 *   SESSION_SECRET   — Any long random string (REQUIRED)
 *   PORT             — Set automatically by Render, leave blank
 */

const express    = require("express");
const session    = require("express-session");
const multer     = require("multer");
const mongoose   = require("mongoose");
const MongoStore = require("connect-mongo");
const path       = require("path");
const bcrypt     = require("bcrypt");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ════════════════════════════════════════
   MONGODB
════════════════════════════════════════ */
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI not set! Go to Render → Environment and add it.");
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => { console.error("❌ MongoDB failed:", err.message); process.exit(1); });

/* ════════════════════════════════════════
   MULTER — memory storage only
   Files stored as base64 in MongoDB
   No external service needed
════════════════════════════════════════ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  }
});

/* ════════════════════════════════════════
   SCHEMAS
════════════════════════════════════════ */
const userSchema = new mongoose.Schema({
  fullName:  { type: String, required: true },
  phone:     { type: String, required: true, unique: true },
  regNumber: { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  // Student ID stored as base64 data URL
  studentID: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const adminSchema = new mongoose.Schema({
  fullName: String,
  phone:    { type: String, unique: true },
  password: String,
});
const Admin = mongoose.model("Admin", adminSchema);

const seatSchema = new mongoose.Schema({
  number:        { type: Number, required: true, unique: true },
  status:        { type: String, enum: ["available","pending","booked"], default: "available" },
  passengerName: { type: String, default: null },
  destination:   { type: String, default: "" },
  phone:         { type: String, default: "" },
});
const Seat = mongoose.model("Seat", seatSchema);

const bookingSchema = new mongoose.Schema({
  seatNumber:    Number,
  passengerName: String,
  destination:   String,
  phone:         String,
  // Payment proof stored as base64 data URL
  paymentProof:  { type: String, default: null },
  status:        { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  createdAt:     { type: Date, default: Date.now }
});
const Booking = mongoose.model("Booking", bookingSchema);

const settingsSchema = new mongoose.Schema({
  bookingLabel:    { type: String, default: "Booking" },
  bookingFee:      { type: String, default: "K5,000" },
  departureDate:   { type: String, default: "15 March 2025" },
  departureTime:   { type: String, default: "18:00 hrs" },
  departureVenue:  { type: String, default: "MUBAS Main Gate" },
  payNationalBank: { type: String, default: "1012168938" },
  payAirtelMoney:  { type: String, default: "0999 261 665" },
  payTNMMpamba:    { type: String, default: "0881 730 203" },
  payAccountName:  { type: String, default: "PETROS MWAKHWAWA" },
});
const Settings = mongoose.model("Settings", settingsSchema);

/* ════════════════════════════════════════
   DEFAULT ADMINS
════════════════════════════════════════ */
const DEFAULT_ADMINS = [
  { phone: "0981136268", password: "Golden Cephas", fullName: "Golden Cephas" },
  { phone: "0881730203", password: "soyo1234",      fullName: "Emmanuel Soyo"  }
];
const DEFAULT_PASSWORDS = {
  "0981136268": "Golden Cephas",
  "0881730203": "soyo1234"
};

/* ════════════════════════════════════════
   SEED
════════════════════════════════════════ */
async function seedDatabase() {
  if (await Seat.countDocuments() === 0) {
    const seats = [];
    for (let i = 1; i <= 72; i++) seats.push({ number: i });
    await Seat.insertMany(seats);
    console.log("✅ 72 seats seeded");
  }
  for (const a of DEFAULT_ADMINS) {
    if (!await Admin.findOne({ phone: a.phone })) {
      await Admin.create({ fullName: a.fullName, phone: a.phone, password: await bcrypt.hash(a.password, 10) });
      console.log(`✅ Admin seeded: ${a.fullName}`);
    }
  }
  if (await Settings.countDocuments() === 0) {
    await Settings.create({});
    console.log("✅ Settings seeded");
  }
}

/* ════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════ */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "polycoach-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.get('/', (req, res) => res.redirect('/Home-Page.html'));
app.use(express.static(path.join(__dirname, "public")));

/* ════════════════════════════════════════
   RATE LIMITING
════════════════════════════════════════ */
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
  entry.count++;
  loginAttempts.set(ip, entry);
  if (entry.count > 10)
    return res.status(429).json({ success: false, message: "Too many attempts. Wait 15 minutes." });
  next();
}

/* ════════════════════════════════════════
   AUTH MIDDLEWARE
════════════════════════════════════════ */
function requireUser(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ success: false, message: "Not authenticated" });
}
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") return next();
  res.status(403).json({ success: false, message: "Admin only" });
}

/* ════════════════════════════════════════
   HELPER — convert multer buffer to base64 data URL
════════════════════════════════════════ */
function fileToDataURL(file) {
  if (!file || !file.buffer) return null;
  const base64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${base64}`;
}

/* ════════════════════════════════════════
   STATUS CHECK
════════════════════════════════════════ */
app.get("/api/status", (req, res) => {
  res.json({
    server: "running",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uploadMethod: "base64-mongodb",
    sessionSecret: !!process.env.SESSION_SECRET
  });
});

/* ════════════════════════════════════════
   ROUTES
════════════════════════════════════════ */

// Settings (public)
app.get("/api/settings", async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    res.json(s);
  } catch { res.json({}); }
});

// ── REGISTER ──
app.post("/api/register", (req, res, next) => {
  upload.single("studentID")(req, res, (err) => {
    if (err) console.error("Register upload error (non-fatal):", err.message);
    next(); // always continue even if file fails
  });
}, async (req, res) => {
  const { name, phone, regNumber, password } = req.body;
  if (!name || !phone || !regNumber || !password)
    return res.json({ success: false, message: "All fields are required." });
  try {
    const exists = await User.findOne({ $or: [{ phone }, { regNumber }] });
    if (exists)
      return res.json({ success: false, message: "Phone or Registration Number already registered." });
    const hashed = await bcrypt.hash(password, 10);
    const studentID = fileToDataURL(req.file); // base64 or null
    await User.create({ fullName: name, phone, regNumber, password: hashed, studentID });
    res.json({ success: true });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.json({ success: false, message: "Registration failed. Please try again." });
  }
});

// ── LOGIN ──
app.post("/api/login", loginRateLimit, async (req, res) => {
  const { phone, password } = req.body;
  try {
    const admin = await Admin.findOne({ phone });
    if (admin && await bcrypt.compare(password, admin.password)) {
      req.session.user = { fullName: admin.fullName, phone: admin.phone, role: "admin" };
      return res.json({ success: true, user: req.session.user });
    }
    const user = await User.findOne({ phone });
    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(401).json({ success: false, message: "Invalid credentials. Not registered? Please register to book a seat." });
    req.session.user = { fullName: user.fullName, phone: user.phone, regNumber: user.regNumber, role: "user" };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ── SESSION ──
app.get("/api/session", (req, res) => {
  res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false });
});
app.get("/api/logout", (req, res) => { req.session.destroy(); res.json({ success: true }); });

// ── SEATS ──
app.get("/api/seats", async (req, res) => {
  try { res.json(await Seat.find().sort({ number: 1 })); }
  catch { res.json([]); }
});

// ── UPLOAD PAYMENT PROOF ──
app.post("/api/upload-payment", requireUser, (req, res, next) => {
  upload.single("paymentProof")(req, res, (err) => {
    if (err) {
      console.error("Payment upload error:", err.message);
      return res.json({ success: false, message: err.message || "Upload failed." });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file)
    return res.json({ success: false, message: "No file received. Please select an image." });
  try {
    const dataURL = fileToDataURL(req.file);
    if (!dataURL)
      return res.json({ success: false, message: "Could not process image. Try a smaller file." });
    req.session.paymentProof = dataURL; // store in session until seat is booked
    req.session.save(err => {
      if (err) {
        console.error("Session save error:", err);
        return res.json({ success: false, message: "Session error. Please try again." });
      }
      res.json({ success: true });
    });
  } catch (err) {
    console.error("Payment proof error:", err.message);
    res.json({ success: false, message: "Upload failed. Please try again." });
  }
});

// ── BOOK SEAT ──
app.post("/api/book-seat", requireUser, async (req, res) => {
  const { seatNumber, passengerName, destination } = req.body;
  if (!seatNumber || !passengerName)
    return res.status(400).json({ success: false, message: "Missing data." });
  const seatNum = Number(seatNumber);
  if (isNaN(seatNum) || seatNum < 1 || seatNum > 72)
    return res.status(400).json({ success: false, message: "Invalid seat number." });
  try {
    const seat = await Seat.findOne({ number: seatNum });
    if (!seat) return res.status(404).json({ success: false, message: "Seat not found." });
    if (seat.status !== "available")
      return res.status(409).json({ success: false, message: "Seat already taken. Please choose another." });
    seat.status = "pending";
    seat.passengerName = passengerName;
    seat.destination = destination || "";
    seat.phone = req.session.user.phone;
    await seat.save();
    await Booking.create({
      seatNumber: seatNum, passengerName,
      destination: destination || "",
      phone: req.session.user.phone,
      paymentProof: req.session.paymentProof || null,
      status: "pending"
    });
    req.session.paymentProof = null;
    res.json({ success: true });
  } catch (err) {
    console.error("Booking error:", err.message);
    res.status(500).json({ success: false, message: "Booking failed." });
  }
});

/* ════════════════════════════════════════
   ADMIN ROUTES
════════════════════════════════════════ */
// Users
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  // Don't send base64 studentID in list (too large) — send flag instead
  const users = await User.find().select("-password").sort({ createdAt: -1 }).lean();
  res.json(users.map(u => ({
    ...u,
    hasStudentID: !!u.studentID,
    studentID: u.studentID ? "has_file" : null // don't send full base64 in list
  })));
});

// Get student ID image for a specific user (admin only)
app.get("/api/admin/users/:id/studentid", requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id).select("studentID fullName");
  if (!user || !user.studentID)
    return res.status(404).json({ success: false, message: "No student ID found." });
  res.json({ success: true, image: user.studentID, name: user.fullName });
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  const { fullName, phone, regNumber, password } = req.body;
  try {
    if (await User.findOne({ $or: [{ phone }, { regNumber }] }))
      return res.json({ success: false, message: "Already exists." });
    await User.create({ fullName, phone, regNumber, password: await bcrypt.hash(password || "changeme", 10) });
    res.json({ success: true });
  } catch { res.json({ success: false, message: "Error." }); }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Bookings
app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
  // Don't send base64 in list — send flag instead
  const bookings = await Booking.find().sort({ createdAt: -1 }).lean();
  res.json(bookings.map(b => ({
    ...b,
    hasPaymentProof: !!b.paymentProof,
    paymentProof: b.paymentProof ? "has_file" : null
  })));
});

// Get payment proof image for a specific booking (admin only)
app.get("/api/admin/bookings/:id/proof", requireAdmin, async (req, res) => {
  const booking = await Booking.findById(req.params.id).select("paymentProof passengerName");
  if (!booking || !booking.paymentProof)
    return res.status(404).json({ success: false, message: "No payment proof found." });
  res.json({ success: true, image: booking.paymentProof, name: booking.passengerName });
});

app.post("/api/admin/approve/:id", requireAdmin, async (req, res) => {
  const b = await Booking.findById(req.params.id);
  if (!b) return res.status(404).json({ success: false });
  b.status = "approved"; await b.save();
  await Seat.findOneAndUpdate({ number: b.seatNumber }, { status: "booked" });
  res.json({ success: true });
});
app.post("/api/admin/reject/:id", requireAdmin, async (req, res) => {
  const b = await Booking.findById(req.params.id);
  if (!b) return res.status(404).json({ success: false });
  b.status = "rejected"; await b.save();
  await Seat.findOneAndUpdate({ number: b.seatNumber }, { status: "available", passengerName: null, destination: "" });
  res.json({ success: true });
});
app.post("/api/admin/bookings/add", requireAdmin, async (req, res) => {
  const { seatNumber, passengerName, destination, phone } = req.body;
  try {
    const seat = await Seat.findOne({ number: Number(seatNumber) });
    if (!seat) return res.json({ success: false, message: "Seat not found." });
    seat.status = "booked"; seat.passengerName = passengerName; seat.destination = destination || "";
    await seat.save();
    await Booking.create({ seatNumber: Number(seatNumber), passengerName, destination: destination || "", phone: phone || "", status: "approved" });
    res.json({ success: true });
  } catch { res.json({ success: false, message: "Error." }); }
});
app.delete("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const b = await Booking.findById(req.params.id);
  if (b) {
    await Seat.findOneAndUpdate({ number: b.seatNumber }, { status: "available", passengerName: null, destination: "" });
    await b.deleteOne();
  }
  res.json({ success: true });
});

// Seat edit
app.post("/api/admin/seats/:num", requireAdmin, async (req, res) => {
  const num = Number(req.params.num);
  const { status, passengerName, destination } = req.body;
  const seat = await Seat.findOne({ number: num });
  if (!seat) return res.status(404).json({ success: false });
  seat.status = status || "available";
  seat.passengerName = status === "available" ? null : (passengerName || null);
  seat.destination = destination || "";
  await seat.save();
  res.json({ success: true });
});

// Reset seats
app.post("/api/admin/reset-seats", requireAdmin, async (req, res) => {
  await Seat.updateMany({}, { status: "available", passengerName: null, destination: "", phone: "" });
  await Booking.deleteMany({});
  res.json({ success: true });
});

// Settings
app.post("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = new Settings();
    Object.assign(s, req.body);
    await s.save();
    res.json({ success: true, settings: s });
  } catch { res.json({ success: false }); }
});

// Admin password change
app.post("/api/admin/change-password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 4)
    return res.json({ success: false, message: "Invalid password data." });
  const admin = await Admin.findOne({ phone: req.session.user.phone });
  if (!admin) return res.json({ success: false, message: "Admin not found." });
  if (!await bcrypt.compare(currentPassword, admin.password))
    return res.json({ success: false, message: "Current password is incorrect." });
  admin.password = await bcrypt.hash(newPassword, 10);
  await admin.save();
  res.json({ success: true, message: "Password changed successfully." });
});

// Reset admin to default password
app.post("/api/admin/reset-admin-password", requireAdmin, async (req, res) => {
  const { targetPhone } = req.body;
  if (!DEFAULT_PASSWORDS[targetPhone])
    return res.json({ success: false, message: "No default found for this admin." });
  const admin = await Admin.findOne({ phone: targetPhone });
  if (!admin) return res.json({ success: false, message: "Admin not found." });
  admin.password = await bcrypt.hash(DEFAULT_PASSWORDS[targetPhone], 10);
  await admin.save();
  res.json({ success: true, message: `Password for ${admin.fullName} reset to default.` });
});

/* ════════════════════════════════════════
   START
════════════════════════════════════════ */
mongoose.connection.once("open", async () => {
  await seedDatabase();
  /* ── KEEP-ALIVE: prevents Render free tier sleep ── */
app.get("/ping",(req,res)=>res.json({status:"alive",time:new Date().toISOString()}));

function keepAlive(){
  const base = process.env.RENDER_EXTERNAL_URL || ("http://localhost:"+PORT);
  setInterval(()=>{
    try{
      const mod = base.startsWith("https") ? require("https") : require("http");
      mod.get(base+"/ping",(r)=>console.log("Keep-alive ping:",r.statusCode))
         .on("error",(e)=>console.log("Ping error:",e.message));
    }catch(e){ console.log("Ping err:",e.message); }
  }, 14*60*1000);
}

app.listen(PORT, () => { keepAlive(); console.log(`✅ PolyCoach running on port ${PORT}`); });
});
