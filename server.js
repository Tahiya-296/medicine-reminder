require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;

const User = require("./models/User");
const Medicine = require("./models/Medicine");

const app = express();
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required.");
}

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    },
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI
    })
}));
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
        const { email, password } = req.body || {};

        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
            return res.status(401).send("Invalid email or password.");
        }

        const user = await User.findOne({ email });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).send("Invalid email or password.");
        }

        await new Promise((resolve, reject) => {
            req.session.regenerate((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        req.session.userId = user._id;

        await new Promise((resolve, reject) => {
            req.session.save((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        res.redirect("/dashboard");

    } catch (error) {
        res.status(500).send("Unable to log in. Please try again.");
    }
});

// ================= ADD MEDICINE =================

app.post("/addMedicine", async (req, res) => {
    try {

        if (!req.session.userId) {
            return res.send("Please login first.");
        }

        const medicine = new Medicine({

            userId: req.session.userId,

            medicineName: req.body.medicineName,
            medicineTime: req.body.medicineTime,
            startDate: req.body.startDate,
            endDate: req.body.endDate

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

        if (!req.session.userId) {
            return res.status(401).send("Please login first.");
        }

        const medicines = await Medicine.find({
            userId: req.session.userId
        });

        res.json(medicines);

    } catch (error) {

        console.log(error);
        res.status(500).send("Error loading medicines.");

    }
});

// ================= DELETE MEDICINE =================

app.delete("/deleteMedicine/:id", async (req, res) => {
    try {

        if (!req.session.userId) {
            return res.status(401).send("Please login first.");
        }

        const medicine = await Medicine.findOneAndDelete({
            _id: req.params.id,
            userId: req.session.userId
        });

        if (!medicine) {
            return res.status(404).send("Medicine not found.");
        }

        res.send("Medicine Deleted");

    } catch (error) {

        console.log(error);
        res.status(500).send("Delete Failed");

    }
});

// ================= UPDATE MEDICINE =================

app.put("/updateMedicine/:id", async (req, res) => {
    try {

        if (!req.session.userId) {
            return res.status(401).send("Please login first.");
        }

        const medicine = await Medicine.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: req.session.userId
            },
            {
                medicineName: req.body.medicineName,
                medicineTime: req.body.medicineTime,
                startDate: req.body.startDate,
                endDate: req.body.endDate
            },
            {
                new: true
            }
        );

        if (!medicine) {
            return res.status(404).send("Medicine not found.");
        }

        res.send("Medicine Updated");

    } catch (error) {

        console.log(error);
        res.status(500).send("Update Failed");

    }
});

// ================= MARK MEDICINE AS TAKEN =================

app.put("/takeMedicine/:id", async (req, res) => {
    try {

        if (!req.session.userId) {
            return res.status(401).send("Please login first.");
        }

        const today = new Date();

        const year = today.getFullYear();

        const month = String(
            today.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
            today.getDate()
        ).padStart(2, "0");

        const todayDate =
            `${year}-${month}-${day}`;

        const medicine = await Medicine.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: req.session.userId
            },
            {
                taken: true,
                lastTakenDate: todayDate
            },
            {
                new: true
            }
        );

        if (!medicine) {
            return res.status(404).send("Medicine not found.");
        }

        res.send("Medicine marked as taken");

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Failed to mark medicine as taken"
        );

    }
});

// ================= MONGODB =================

mongoose.connect(process.env.MONGO_URI)

.then(() => {

    console.log("MongoDB connected");

    app.listen(process.env.PORT || 3000, () => {

        console.log(
            "Server running on port " +
            (process.env.PORT || 3000)
        );

    });

})

.catch((error) => {

    console.log(error);

});
