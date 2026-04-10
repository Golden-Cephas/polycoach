const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const usersFile = path.join(__dirname, "../data/users.json");

/* =========================
REGISTER USER
========================= */

router.post("/register", (req, res) => {

const { regNumber, name, phone, password } = req.body;

let users = JSON.parse(fs.readFileSync(usersFile));

/* Prevent duplicate registration */

const exists = users.find(user =>
user.regNumber === regNumber ||
user.phone === phone ||
user.name === name
);

if (exists) {

return res.status(400).json({
message: "User already registered"
});

}

const newUser = {

regNumber,
name,
phone,
password,
role: "student"

};

users.push(newUser);

fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

res.json({
message: "Registration successful"
});

});


/* =========================
LOGIN USER
========================= */

router.post("/login", (req, res) => {

const { phone, password } = req.body;

let users = JSON.parse(fs.readFileSync(usersFile));

const user = users.find(u =>
u.phone === phone &&
u.password === password
);

if (!user) {

return res.status(401).json({
message: "Invalid credentials"
});

}

/* ADMIN OVERRIDE */

if (phone === "0981136268" || phone === "0881730203") {

return res.json({

role: "admin",

name: phone === "0881730203"
? "Emmanuel Soyo"
: "Petros Mwakhwawa"

});

}

res.json({

role: "student",
name: user.name,
phone: user.phone

});

});


module.exports = router;