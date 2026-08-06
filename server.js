const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "views")));


// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views/register.html"));
});


// Register route
app.post("/register", async (req, res) => {

    console.log("===== REGISTER ROUTE WORKING =====");

    try {

        console.log("Register request received");
        console.log(req.body);

        console.log("MongoDB status:", mongoose.connection.readyState);

        const User = require("./models/User");

        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password
        });

        console.log("Before save");
        console.log("Connection state:", mongoose.connection.readyState);
        console.log("Database:", mongoose.connection.name);

        await newUser.save();

        console.log("User saved successfully");

        res.send(`
        <h2>Registration successful!</h2>
        <p>You can now login.</p>
         <a href="/login">Go to Login</a>
        `);

    } catch (error) {

        console.log(error);
        res.send(error.message);

    }

});


// Connect MongoDB
mongoose.connect("mongodb+srv://tahiyametro_db_user:pOpwmr1JFhXoWCBU@medicinereminder.so5zr2o.mongodb.net/medicineReminder?appName=MedicineReminder")
.then(() => {

    console.log("MongoDB connected");

    app.listen(3000, () => {
        console.log("Server running on port 3000");
    });

})
.catch((error) => {
    console.log(error);
});