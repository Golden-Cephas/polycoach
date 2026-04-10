/* =====================================
   POLYCOACH BOOKING SCRIPT
   public/js/booking.js
===================================== */

let selectedSeat = null;
let seatName = null;

/* ===============================
   CHECK LOGIN SESSION
=============================== */

async function checkSession() {
    try {

        const response = await fetch('/api/auth/session');
        const data = await response.json();

        if (!data.loggedIn) {
            window.location.href = "/Book-Login.html";
        }

    } catch (error) {
        console.error("Session check failed:", error);
        window.location.href = "/Book-Login.html";
    }
}

checkSession();

/* ===============================
   LOAD SEATS FROM SERVER
=============================== */

async function loadSeats() {

    try {

        const response = await fetch('/api/booking/seats');
        const seats = await response.json();

        const seatContainer = document.getElementById("seat-container");

        seatContainer.innerHTML = "";

        seats.forEach(seat => {

            const seatDiv = document.createElement("div");
            seatDiv.classList.add("seat");

            seatDiv.innerText = seat.number;

            if (seat.status === "booked") {
                seatDiv.classList.add("booked");
            }

            if (seat.status === "pending") {
                seatDiv.classList.add("pending");
            }

            if (seat.status === "available") {
                seatDiv.addEventListener("click", () => selectSeat(seat.number));
            }

            seatContainer.appendChild(seatDiv);

        });

    } catch (error) {

        console.error("Error loading seats:", error);

    }

}

loadSeats();

/* ===============================
   SELECT SEAT
=============================== */

function selectSeat(seatNumber) {

    selectedSeat = seatNumber;

    openBookingPopup();

}

/* ===============================
   BOOKING POPUP
=============================== */

function openBookingPopup() {

    const popup = document.getElementById("bookingPopup");

    popup.style.display = "flex";

}

function closePopup() {

    document.getElementById("bookingPopup").style.display = "none";

}

/* ===============================
   BOOK FOR MYSELF
=============================== */

async function bookForMyself() {

    try {

        const response = await fetch('/api/auth/user');
        const user = await response.json();

        seatName = user.fullName;

        submitBooking();

    } catch (error) {

        console.error("Error getting user:", error);

    }

}

/* ===============================
   BOOK FOR SOMEONE
=============================== */

function bookForSomeone() {

    const nameInput = document.getElementById("otherPassengerName");

    const passengerName = nameInput.value.trim();

    if (passengerName === "") {
        alert("Please enter passenger name");
        return;
    }

    seatName = passengerName;

    submitBooking();

}

/* ===============================
   SUBMIT BOOKING
=============================== */

async function submitBooking() {

    if (!selectedSeat) {
        alert("Please select a seat first.");
        return;
    }

    try {

        const response = await fetch('/api/booking/book-seat', {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                seatNumber: selectedSeat,
                passengerName: seatName
            })

        });

        const result = await response.json();

        if (result.success) {

            alert("Seat reserved successfully!");

            window.location.href = "/Final-Thanks.html";

        } else {

            alert(result.message || "Booking failed");

        }

    } catch (error) {

        console.error("Booking error:", error);

        alert("Server error occurred.");

    }

}

/* ===============================
   AUTO REFRESH SEATS
=============================== */

setInterval(() => {

    loadSeats();

}, 5000);

/* ===============================
   LOGOUT
=============================== */

async function logout() {

    await fetch('/api/auth/logout');

    window.location.href = "/Home-Page.html";

}