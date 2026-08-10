const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const User = require("./models/User");
const Medicine = require("./models/Medicine");

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "views")));

// ================= PAGES =================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

// ================= REGISTER =================

app.post("/register", async (req, res) => {

    try {

        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password
        });

        await newUser.save();

        res.send(`
            <h2>Registration Successful!</h2>
            <p>You can now login.</p>
            <a href="/login">Go to Login</a>
        `);

    } catch (error) {

        console.log(error);
        res.send(error.message);

    }

});

// ================= LOGIN =================

app.post("/login", async (req, res) => {

    try {

        const user = await User.findOne({
            email: req.body.email
        });

        if (!user) {
            return res.send("User not found.");
        }

        if (user.password !== req.body.password) {
            return res.send("Incorrect password.");
        }

        res.redirect("/dashboard");

    } catch (error) {

        console.log(error);
        res.send("Login failed.");

    }

});

// ================= ADD MEDICINE =================

app.post("/addMedicine", async (req, res) => {

    try {

        const medicine = new Medicine({
            medicineName: req.body.medicineName,
            medicineTime: req.body.medicineTime
        });

        await medicine.save();

        res.redirect("/dashboard");

    } catch (error) {

        console.log(error);
        res.send("Failed to add medicine.");

    }

});

// ================= GET ALL MEDICINES =================

app.get("/getMedicines", async (req, res) => {

    try {

        const medicines = await Medicine.find();

        res.json(medicines);

    } catch (error) {

        console.log(error);
        res.status(500).send("Error loading medicines.");

    }

});

// ================= DELETE MEDICINE =================

app.delete("/deleteMedicine/:id", async (req, res) => {

    try {

        await Medicine.findByIdAndDelete(req.params.id);

        res.send("Medicine Deleted");

    } catch (error) {

        console.log(error);
        res.status(500).send("Delete Failed");

    }

});

// ================= UPDATE MEDICINE =================

app.put("/updateMedicine/:id", async (req, res) => {

    try {

        await Medicine.findByIdAndUpdate(
            req.params.id,
            {
                medicineName: req.body.medicineName,
                medicineTime: req.body.medicineTime
            }
        );

        res.send("Medicine Updated");

    } catch (error) {

        console.log(error);
        res.status(500).send("Update Failed");

    }

});

// ================= MONGODB =================

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