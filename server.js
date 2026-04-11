const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure dirs
["data","uploads/payments","uploads/studentIDs"].forEach(d=>{
    const full=path.join(__dirname,d);
    if(!fs.existsSync(full)) fs.mkdirSync(full,{recursive:true});
});

app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(session({secret:"polycoach-2025",resave:false,saveUninitialized:true,cookie:{maxAge:86400000}}));
app.get('/', (req, res) => res.redirect('/Home-Page.html'));
app.use(express.static(path.join(__dirname,"public")));
app.use("/uploads",express.static(path.join(__dirname,"uploads")));

const FILES={
    users:path.join(__dirname,"data/users.json"),
    bookings:path.join(__dirname,"data/bookings.json"),
    seats:path.join(__dirname,"data/seats.json"),
    settings:path.join(__dirname,"data/settings.json"),
    admins:path.join(__dirname,"data/admins.json")
};

function makeStorage(dest){
    return multer.diskStorage({
        destination:(_,__,cb)=>cb(null,path.join(__dirname,dest)),
        filename:(_,f,cb)=>cb(null,Date.now()+"-"+f.originalname)
    });
}
const uploadPayment=multer({storage:makeStorage("uploads/payments")});
const uploadID=multer({storage:makeStorage("uploads/studentIDs")});

function readJSON(file,def=[]){
    if(!fs.existsSync(file)){fs.writeFileSync(file,JSON.stringify(def,null,2));return def;}
    try{return JSON.parse(fs.readFileSync(file));}catch{return def;}
}
function writeJSON(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2));}

// Seed / validate seats — always ensure 72 seats exist with correct structure
function seedSeats(){
    let existing=[];
    if(fs.existsSync(FILES.seats)){
        try{ existing=JSON.parse(fs.readFileSync(FILES.seats)); }catch{}
    }
    // Rebuild if empty, wrong length, or numbers are strings
    const valid=Array.isArray(existing)&&existing.length===72&&typeof existing[0]?.number==="number";
    if(!valid){
        const s=[];
        for(let i=1;i<=72;i++) s.push({number:i,status:"available",passengerName:null,destination:""});
        writeJSON(FILES.seats,s);
        console.log("Seats reseeded (72 seats).");
    }
}
seedSeats();
// Seed settings
if(!fs.existsSync(FILES.settings)){
    writeJSON(FILES.settings,{
        bookingLabel:"Booking",
        bookingFee:"K5,000",
        departureDate:"15 March 2025",
        departureTime:"18:00 hrs",
        departureVenue:"MUBAS Main Gate",
        payNationalBank:"1012168938",
        payAirtelMoney:"0999 261 665",
        payTNMMpamba:"0881 730 203",
        payAccountName:"PETROS MWAKHWAWA"
    });
}

// Default admin credentials - seeded to file on first run
const DEFAULT_ADMINS=[
    {phone:"0981136268",password:"Golden Cephas",fullName:"Golden Cephas"},
    {phone:"0881730203",password:"soyo1234",fullName:"Emmanuel Soyo"}
];
if(!fs.existsSync(FILES.admins)){
    writeJSON(FILES.admins,DEFAULT_ADMINS);
}
function getAdmins(){return readJSON(FILES.admins,DEFAULT_ADMINS);}

function requireUser(req,res,next){
    if(req.session.user) return next();
    res.status(401).json({success:false,message:"Not authenticated"});
}
function requireAdmin(req,res,next){
    if(req.session.user&&req.session.user.role==="admin") return next();
    res.status(403).json({success:false,message:"Admin only"});
}

// Settings (public)
app.get("/api/settings",(req,res)=>res.json(readJSON(FILES.settings,{})));

// Register
app.post("/api/register",uploadID.single("studentID"),(req,res)=>{
    const{name,phone,regNumber,password}=req.body;
    if(!name||!phone||!regNumber||!password) return res.json({success:false,message:"All fields required."});
    let users=readJSON(FILES.users);
    if(users.find(u=>u.phone===phone||u.regNumber===regNumber))
        return res.json({success:false,message:"Phone or Registration Number already registered."});
    users.push({id:Date.now().toString(),fullName:name,phone,regNumber,password,studentID:req.file?req.file.filename:null,createdAt:new Date().toISOString()});
    writeJSON(FILES.users,users);
    res.json({success:true});
});

// Login
app.post("/api/login",(req,res)=>{
    const{phone,password}=req.body;
    const admin=getAdmins().find(a=>a.phone===phone&&a.password===password);
    if(admin){
        req.session.user={fullName:admin.fullName,phone:admin.phone,role:"admin"};
        return res.json({success:true,user:req.session.user});
    }
    const users=readJSON(FILES.users);
    const user=users.find(u=>u.phone===phone&&u.password===password);
    if(!user) return res.status(401).json({success:false,message:"Invalid credentials. Not registered? Please register to book a seat."});
    req.session.user={fullName:user.fullName,phone:user.phone,regNumber:user.regNumber,role:"user"};
    res.json({success:true,user:req.session.user});
});

// Session
app.get("/api/session",(req,res)=>{
    res.json(req.session.user?{loggedIn:true,user:req.session.user}:{loggedIn:false});
});
app.get("/api/logout",(req,res)=>{req.session.destroy();res.json({success:true});});

// Seats (public)
app.get("/api/seats",(req,res)=>res.json(readJSON(FILES.seats,[])));

// Upload payment
app.post("/api/upload-payment",requireUser,uploadPayment.single("paymentProof"),(req,res)=>{
    if(!req.file) return res.json({success:false,message:"No file uploaded."});
    req.session.paymentProof=req.file.filename;
    res.json({success:true,filename:req.file.filename});
});

// Book seat
app.post("/api/book-seat",requireUser,(req,res)=>{
    const{seatNumber,passengerName,destination}=req.body;
    if(!seatNumber||!passengerName) return res.status(400).json({success:false,message:"Missing data."});
    const seatNum=Number(seatNumber);
    if(isNaN(seatNum)||seatNum<1||seatNum>72) return res.status(400).json({success:false,message:"Invalid seat number."});
    let seats=readJSON(FILES.seats,[]);
    // Coerce both sides to number to avoid type mismatch
    const seat=seats.find(s=>Number(s.number)===seatNum);
    if(!seat) return res.status(404).json({success:false,message:"Seat "+seatNum+" not found. Try refreshing the page."});
    if(seat.status!=="available") return res.status(409).json({success:false,message:"Seat already taken. Please choose another."});
    seat.status="pending";seat.passengerName=passengerName;seat.destination=destination||"";seat.phone=req.session.user.phone;
    writeJSON(FILES.seats,seats);
    let bookings=readJSON(FILES.bookings,[]);
    bookings.push({id:Date.now().toString(),seatNumber:Number(seatNumber),passengerName,destination:destination||"",phone:req.session.user.phone,paymentProof:req.session.paymentProof||null,status:"pending",createdAt:new Date().toISOString()});
    writeJSON(FILES.bookings,bookings);
    req.session.paymentProof=null;
    res.json({success:true});
});

// Admin users
app.get("/api/admin/users",requireAdmin,(req,res)=>{
    res.json(readJSON(FILES.users,[]).map(u=>({id:u.id,fullName:u.fullName,phone:u.phone,regNumber:u.regNumber,studentID:u.studentID,createdAt:u.createdAt})));
});
app.post("/api/admin/users",(req,res)=>{
    // Admin add user manually
    if(!req.session.user||req.session.user.role!=="admin") return res.status(403).json({success:false});
    const{fullName,phone,regNumber,password}=req.body;
    let users=readJSON(FILES.users);
    if(users.find(u=>u.phone===phone||u.regNumber===regNumber)) return res.json({success:false,message:"Already exists."});
    users.push({id:Date.now().toString(),fullName,phone,regNumber,password:password||"changeme",studentID:null,createdAt:new Date().toISOString()});
    writeJSON(FILES.users,users);
    res.json({success:true});
});
app.delete("/api/admin/users/:id",requireAdmin,(req,res)=>{
    let users=readJSON(FILES.users,[]).filter(u=>u.id!==req.params.id);
    writeJSON(FILES.users,users);
    res.json({success:true});
});

// Admin bookings
app.get("/api/admin/bookings",requireAdmin,(req,res)=>res.json(readJSON(FILES.bookings,[])));
app.post("/api/admin/approve/:id",requireAdmin,(req,res)=>{
    let bookings=readJSON(FILES.bookings,[]),seats=readJSON(FILES.seats,[]);
    const b=bookings.find(x=>x.id===req.params.id);
    if(!b) return res.status(404).json({success:false});
    b.status="approved";
    const seat=seats.find(s=>s.number===b.seatNumber);
    if(seat) seat.status="booked";
    writeJSON(FILES.bookings,bookings);writeJSON(FILES.seats,seats);
    res.json({success:true});
});
app.post("/api/admin/reject/:id",requireAdmin,(req,res)=>{
    let bookings=readJSON(FILES.bookings,[]),seats=readJSON(FILES.seats,[]);
    const b=bookings.find(x=>x.id===req.params.id);
    if(!b) return res.status(404).json({success:false});
    b.status="rejected";
    const seat=seats.find(s=>s.number===b.seatNumber);
    if(seat){seat.status="available";seat.passengerName=null;seat.destination="";}
    writeJSON(FILES.bookings,bookings);writeJSON(FILES.seats,seats);
    res.json({success:true});
});
app.post("/api/admin/bookings/add",requireAdmin,(req,res)=>{
    const{seatNumber,passengerName,destination,phone}=req.body;
    let seats=readJSON(FILES.seats,[]);
    const seat=seats.find(s=>s.number===Number(seatNumber));
    if(!seat) return res.json({success:false,message:"Seat not found."});
    seat.status="booked";seat.passengerName=passengerName;seat.destination=destination||"";
    writeJSON(FILES.seats,seats);
    let bookings=readJSON(FILES.bookings,[]);
    bookings.push({id:Date.now().toString(),seatNumber:Number(seatNumber),passengerName,destination:destination||"",phone:phone||"",paymentProof:null,status:"approved",createdAt:new Date().toISOString()});
    writeJSON(FILES.bookings,bookings);
    res.json({success:true});
});
app.delete("/api/admin/bookings/:id",requireAdmin,(req,res)=>{
    let bookings=readJSON(FILES.bookings,[]);
    const b=bookings.find(x=>x.id===req.params.id);
    if(b){
        let seats=readJSON(FILES.seats,[]);
        const seat=seats.find(s=>s.number===b.seatNumber);
        if(seat){seat.status="available";seat.passengerName=null;seat.destination="";}
        writeJSON(FILES.seats,seats);
    }
    writeJSON(FILES.bookings,bookings.filter(x=>x.id!==req.params.id));
    res.json({success:true});
});

// Admin seat edit
app.post("/api/admin/seats/:num",requireAdmin,(req,res)=>{
    const num=Number(req.params.num);
    const{status,passengerName,destination}=req.body;
    let seats=readJSON(FILES.seats,[]);
    const seat=seats.find(s=>Number(s.number)===num);
    if(!seat) return res.status(404).json({success:false});
    seat.status=status||"available";
    seat.passengerName=status==="available"?null:(passengerName||null);
    seat.destination=destination||"";
    writeJSON(FILES.seats,seats);
    // Sync bookings
    let bookings=readJSON(FILES.bookings,[]);
    const bStatus=status==="booked"?"approved":status==="pending"?"pending":"rejected";
    const existing=bookings.find(b=>b.seatNumber===num&&(b.status==="pending"||b.status==="approved"));
    if(existing){existing.status=bStatus;existing.passengerName=seat.passengerName||existing.passengerName;}
    writeJSON(FILES.bookings,bookings);
    res.json({success:true});
});

// Admin settings
app.post("/api/admin/settings",requireAdmin,(req,res)=>{
    const current=readJSON(FILES.settings,{});
    const updated={...current,...req.body};
    writeJSON(FILES.settings,updated);
    res.json({success:true,settings:updated});
});

// Admin: reset all seats to available
app.post("/api/admin/reset-seats",requireAdmin,(req,res)=>{
    const s=[];for(let i=1;i<=72;i++) s.push({number:i,status:"available",passengerName:null,destination:""});
    writeJSON(FILES.seats,s);
    writeJSON(FILES.bookings,[]);
    res.json({success:true,message:"All seats reset to available."});
});

// Admin: change own password
app.post("/api/admin/change-password",requireAdmin,(req,res)=>{
    const{currentPassword,newPassword}=req.body;
    if(!currentPassword||!newPassword||newPassword.length<4)
        return res.json({success:false,message:"Invalid password data."});
    let admins=getAdmins();
    const admin=admins.find(a=>a.phone===req.session.user.phone);
    if(!admin) return res.json({success:false,message:"Admin not found."});
    if(admin.password!==currentPassword)
        return res.json({success:false,message:"Current password is incorrect."});
    admin.password=newPassword;
    writeJSON(FILES.admins,admins);
    res.json({success:true,message:"Password changed successfully."});
});

// Admin: reset another admin's password to default
app.post("/api/admin/reset-admin-password",requireAdmin,(req,res)=>{
    const{targetPhone}=req.body;
    if(!targetPhone) return res.json({success:false,message:"Target phone required."});
    let admins=getAdmins();
    const target=admins.find(a=>a.phone===targetPhone);
    if(!target) return res.json({success:false,message:"Admin not found."});
    const defaultAdmin=DEFAULT_ADMINS.find(a=>a.phone===targetPhone);
    if(!defaultAdmin) return res.json({success:false,message:"No default found for this admin."});
    target.password=defaultAdmin.password;
    writeJSON(FILES.admins,admins);
    res.json({success:true,message:`Password for ${target.fullName} reset to default.`});
});

/* ═══════════════════════════════════
   KEEP-ALIVE — prevents Render sleep
   Self-pings every 14 minutes
═══════════════════════════════════ */
app.get("/ping",(req,res)=>res.json({status:"alive",time:new Date().toISOString()}));

function keepAlive(){
  const base=process.env.RENDER_EXTERNAL_URL||("http://localhost:"+PORT);
  setInterval(()=>{
    try{
      const mod=base.startsWith("https")?require("https"):require("http");
      mod.get(base+"/ping",(r)=>console.log("Keep-alive ping:",r.statusCode))
         .on("error",(e)=>console.log("Ping error:",e.message));
    }catch(e){console.log("Ping err:",e.message);}
  }, 14*60*1000);
}

app.listen(PORT,()=>{
  keepAlive();
  console.log(`PolyCoach running on http://localhost:${PORT}`);
});
