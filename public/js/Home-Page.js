/* =====================================
   POLYCOACH HOME PAGE SCRIPT
   public/js/Home-Page.js
===================================== */

/* ===============================
   START BOOKING
=============================== */

function startBooking() {

    window.location.href = "/Book-Login.html";

}


/* ===============================
   REGISTER USER
=============================== */

function goRegister() {

    window.location.href = "/Register.html";

}


/* ===============================
   VIEW AVAILABLE SEATS
=============================== */

function viewSeats() {

    window.location.href = "/Status-Login.html";

}


/* ===============================
   HELP PAGE
=============================== */

function openHelp() {

    window.location.href = "/Help.html";

}


/* ===============================
   SESSION CHECK
=============================== */

async function checkUserSession() {

    try {

        const response = await fetch('/api/auth/session');
        const data = await response.json();

        if (data.loggedIn) {

            console.log("User session active");

        }

    } catch (error) {

        console.log("Session check skipped");

    }

}


/* ===============================
   PAGE LOAD INITIALIZATION
=============================== */

document.addEventListener("DOMContentLoaded", () => {

    checkUserSession();

});


/* ===============================
   NAVIGATION HELPERS
=============================== */

function navigate(page) {

    window.location.href = page;

}


/* ===============================
   SOCIAL LINKS
=============================== */

function openFacebook() {

    window.open("https://facebook.com", "_blank");

}

function openTwitter() {

    window.open("https://twitter.com", "_blank");

}

function openWhatsapp() {

    window.open("https://wa.me/", "_blank");

}