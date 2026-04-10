const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const seatsFile = path.join(__dirname, "../data/seats.json");
const bookingsFile = path.join(__dirname, "../data/bookings.json");


/* =========================
GET ALL SEATS
========================= */

router.get("/seats", (req, res) => {

let seats = JSON.parse(fs.readFileSync(seatsFile));

res.json(seats);

});


/* =========================
BOOK SEAT
========================= */

router.post("/book-seat", (req, res) => {

const { seatNumber, passengerName, phone, destination } = req.body;

let seats = JSON.parse(fs.readFileSync(seatsFile));
let bookings = JSON.parse(fs.readFileSync(bookingsFile));

const seat = seats.find(s => s.number === seatNumber);

if (!seat) {

return res.status(404).json({
message: "Seat not found"
});

}

if (seat.status !== "available") {

return res.status(400).json({
message: "Seat already taken"
});

}

/* mark seat pending */

seat.status = "pending";

const booking = {

seatNumber,
passengerName,
phone,
destination,
status: "pending",
time: Date.now()

};

bookings.push(booking);

fs.writeFileSync(seatsFile, JSON.stringify(seats, null, 2));
fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));

res.json({
message: "Seat reserved pending admin verification"
});

});


module.exports = router;