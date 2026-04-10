const fs = require("fs");
const path = require("path");

const usersFile = path.join(__dirname, "../data/users.json");

/* CHECK IF USER EXISTS */

function verifyUser(req, res, next) {

    const phone = req.body.phone || req.query.phone;

    if (!phone) {
        return res.status(401).json({ message: "Login required" });
    }

    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(u => u.phone === phone);

    if (!user) {
        return res.status(403).json({ message: "User not registered" });
    }

    req.user = user;

    next();
}


/* CHECK IF ADMIN */

function verifyAdmin(req, res, next) {

    const phone = req.body.phone || req.query.phone;

    if (phone === "0981136268" || phone === "0881730203") {
        next();
    } else {
        return res.status(403).json({ message: "Admin access only" });
    }

}


module.exports = {
    verifyUser,
    verifyAdmin
};