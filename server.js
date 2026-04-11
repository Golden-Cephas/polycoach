/*
 * PolyCoach — Production Server v2.1
 * Fixed: Cloudinary errors no longer crash registration
 * Fixed: Graceful fallback if env vars missing
 *
 * ENVIRONMENT VARIABLES (set in Render dashboard):
 *   MONGODB_URI        — MongoDB Atlas connection string
 *   CLOUDINARY_CLOUD   — Your Cloudinary cloud name
 *   CLOUDINARY_KEY     — Your Cloudinary API key
 *   CLOUDINARY_SECRET  — Your Cloudinary API secret
 *   SESSION_SECRET     — Any long random string
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
   CLOUDINARY — only init if credentials exist
════════════════════════════════════════ */
let cloudinary = null;
let CloudinaryStorage = null;
const CLOUDINARY_CONFIGURED =
  process.env.CLOUDINARY_CLOUD &&
  process.env.CLOUDINARY_KEY &&
  process.env.CLOUDINARY_SECRET;

if (CLOUDINARY_CONFIGURED) {
  cloudinary = require("cloudinary").v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD,
    api_key:    process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
  });
  CloudinaryStorage = require("multer-storage-cloudinary").CloudinaryStorage;
  console.log("✅ Cloudinary configured");
} else {
  console.log("⚠️  Cloudinary not configured — uploads stored in memory only");
}

/* ════════════════════════════════════════
   MULTER — uses Cloudinary if available,
            otherwise memory (file is lost
            but registration still works)
════════════════════════════════════════ */
function makeUploader(folder) {
  if (CLOUDINARY_CONFIGURED) {
    const storage = new CloudinaryStorage({
      cloudinary,
      params: { folder, allowed_formats: ["jpg","jpeg","png","webp"] }
    });
    return multer({ storage });
  }
  // Fallback: memory storage — registration works, file just not saved
  return multer({ storage: multer.memoryStorage() });
}

const uploadID      = makeUploader("polycoach/studentIDs");
const uploadPayment = makeUploader("polycoach/payments");

/* ════════════════════════════════════════
   MONGODB
════════════════════════════════════════ */
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI environment variable is not set!");
  console.error("   Go to Render dashboard → Your service → Environment → Add MONGODB_URI");
  process.exit(1); // Stop server so you see the error clearly in Render logs
}

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

/* ════════════════════════════════════════
   SCHEMAS
════════════════════════════════════════ */
const userSchema = new mongoose.Schema({
  fullName:  { type: String, required: true },
  phone:     { type: String, required: true, unique: true },
  regNumber: { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  studentID: { type: String, default: null },
  createdAt: { type: Date,   default: Date.now }
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
  paymentProof:  String,
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
  // Seats
  const seatCount = await Seat.countDocuments();
  if (seatCount === 0) {
    const seats = [];
    for (let i = 1; i <= 72; i++) seats.push({ number: i });
    await Seat.insertMany(seats);
    console.log("✅ 72 seats seeded");
  }
  // Admins
  for (const a of DEFAULT_ADMINS) {
    const exists = await Admin.findOne({ phone: a.phone });
    if (!exists) {
      const hashed = await bcrypt.hash(a.password, 10);
      await Admin.create({ fullName: a.fullName, phone: a.phone, password: hashed });
      console.log(`✅ Admin seeded: ${a.fullName}`);
    }
  }
  // Settings
  if (await Settings.countDocuments() === 0) {
    await Settings.create({});
    console.log("✅ Settings seeded");
  }
}

/* ════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "polycoach-fallback-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Home-Page.html"));
});
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
  // Run multer but catch its errors so registration never crashes
  uploadID.single("studentID")(req, res, (err) => {
    if (err) {
      console.error("Upload middleware error (non-fatal):", err.message);
      // Continue without the file — registration still works
    }
    next();
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
    // Get Cloudinary URL if upload succeeded, otherwise null
    let studentIDUrl = null;
    if (req.file) {
      studentIDUrl = req.file.path || req.file.secure_url || null;
    }
    await User.create({
      fullName: name, phone, regNumber,
      password: hashed,
      studentID: studentIDUrl
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Registration error:", err);
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
    console.error("Login error:", err);
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

// ── UPLOAD PAYMENT ──
app.post("/api/upload-payment", requireUser, (req, res, next) => {
  uploadPayment.single("paymentProof")(req, res, (err) => {
    if (err) {
      console.error("Payment upload error:", err.message);
      return res.json({ success: false, message: "Upload failed. Check your internet and try again." });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.json({ success: false, message: "No file received." });
  const url = req.file.path || req.file.secure_url || null;
  req.session.paymentProof = url;
  res.json({ success: true, url });
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
    seat.status = "pending"; seat.passengerName = passengerName;
    seat.destination = destination || ""; seat.phone = req.session.user.phone;
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
    console.error("Booking error:", err);
    res.status(500).json({ success: false, message: "Booking failed." });
  }
});

/* ════════════════════════════════════════
   ADMIN ROUTES
════════════════════════════════════════ */
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  res.json(await User.find().select("-password").sort({ createdAt: -1 }));
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

app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
  res.json(await Booking.find().sort({ createdAt: -1 }));
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

app.post("/api/admin/reset-seats", requireAdmin, async (req, res) => {
  await Seat.updateMany({}, { status: "available", passengerName: null, destination: "", phone: "" });
  await Booking.deleteMany({});
  res.json({ success: true });
});

app.post("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = new Settings();
    Object.assign(s, req.body);
    await s.save();
    res.json({ success: true, settings: s });
  } catch { res.json({ success: false }); }
});

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
  app.listen(PORT, () => console.log(`✅ PolyCoach running on http://localhost:${PORT}`));
});
