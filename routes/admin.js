const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const usersFile = path.join(__dirname, "../data/users.json");
const bookingsFile = path.join(__dirname, "../data/bookings.json");
const seatsFile = path.join(__dirname, "../data/seats.json");


/* =========================
GET REGISTRATION LIST
========================= */

router.get("/users", (req, res) => {

let users = JSON.parse(fs.readFileSync(usersFile));

res.json(users);

});


/* =========================
GET BOOKINGS
========================= */

router.get("/bookings", (req, res) => {

let bookings = JSON.parse(fs.readFileSync(bookingsFile));

res.json(bookings);

});


/* =========================
APPROVE BOOKING
========================= */

router.post("/approve", (req, res) => {

const { seatNumber } = req.body;

let seats = JSON.parse(fs.readFileSync(seatsFile));
let bookings = JSON.parse(fs.readFileSync(bookingsFile));

const seat = seats.find(s => s.number === seatNumber);

if (seat) {

seat.status = "booked";

}

const booking = bookings.find(b => b.seatNumber === seatNumber);

if (booking) {

booking.status = "approved";

}

fs.writeFileSync(seatsFile, JSON.stringify(seats, null, 2));
fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));

res.json({
message: "Booking approved"
});

});


/* =========================
REJECT BOOKING
========================= */

router.post("/reject", (req, res) => {

const { seatNumber } = req.body;

let seats = JSON.parse(fs.readFileSync(seatsFile));
let bookings = JSON.parse(fs.readFileSync(bookingsFile));

const seat = seats.find(s => s.number === seatNumber);

if (seat) {

seat.status = "available";

}

const booking = bookings.find(b => b.seatNumber === seatNumber);

if (booking) {

booking.status = "rejected";

}

fs.writeFileSync(seatsFile, JSON.stringify(seats, null, 2));
fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));

res.json({
message: "Booking rejected"
});

});


module.exports = router;