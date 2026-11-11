require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;

const User = require("./models/User");
const Medicine = require("./models/Medicine");

const app = express();
const sessionSecret = process.env.SESSION_SECRET;
const sessionCookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
};

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
    cookie: sessionCookieOptions,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI
    })
}));
app.use(express.static("public"));

function requireAuth(unauthorizedHandler) {
    return (req, res, next) => {
        if (!req.session || !mongoose.isObjectIdOrHexString(req.session.userId)) {
            return unauthorizedHandler(req, res);
        }

        next();
    };
}

const requirePageAuth = requireAuth((req, res) => res.redirect("/login"));
const requireApiAuth = requireAuth((req, res) => res.status(401).send("Please login first."));

function requireCsrfToken(req, res, next) {
    const expectedToken = req.session.csrfToken;
    const providedToken = req.get("x-csrf-token");

    if (typeof expectedToken !== "string" || typeof providedToken !== "string") {
        return res.status(403).json({ error: "Invalid or missing CSRF token." });
    }

    const expectedBuffer = Buffer.from(expectedToken);
    const providedBuffer = Buffer.from(providedToken);

    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return res.status(403).json({ error: "Invalid or missing CSRF token." });
    }

    next();
}

function validateMedicineInput(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Request body must contain medicine details." };
    }

    if (typeof body.medicineName !== "string" || body.medicineName.trim().length === 0) {
        return { error: "Medicine name is required." };
    }

    const medicineName = body.medicineName.trim();
    if (medicineName.length > 120) {
        return { error: "Medicine name must be 120 characters or fewer." };
    }

    if (typeof body.medicineTime !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.medicineTime)) {
        return { error: "Medicine time must use the 24-hour HH:MM format." };
    }

    const isValidDate = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const parsedDate = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
    };

    if (!isValidDate(body.startDate)) {
        return { error: "Start date must be a valid date in YYYY-MM-DD format." };
    }

    if (!isValidDate(body.endDate)) {
        return { error: "End date must be a valid date in YYYY-MM-DD format." };
    }

    if (body.endDate < body.startDate) {
        return { error: "End date cannot be earlier than start date." };
    }

    return {
        value: {
            medicineName,
            medicineTime: body.medicineTime,
            startDate: body.startDate,
            endDate: body.endDate
        }
    };
}

function validateMedicineId(id, res) {
    if (!mongoose.isObjectIdOrHexString(id)) {
        res.status(400).json({ error: "Invalid medicine ID." });
        return false;
    }

    return true;
}

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

app.get("/dashboard", requirePageAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

app.get("/csrf-token", requireApiAuth, (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }

    req.session.save((error) => {
        if (error) {
            return res.status(500).json({ error: "Unable to prepare a secure request token." });
        }

        return res.json({ csrfToken: req.session.csrfToken });
    });
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

app.post("/logout", requireApiAuth, requireCsrfToken, (req, res) => {
    if (!req.session) {
        res.clearCookie("connect.sid", sessionCookieOptions);
        return res.redirect("/login");
    }

    req.session.destroy((error) => {
        res.clearCookie("connect.sid", sessionCookieOptions);

        if (error) {
            return res.status(500).send("Unable to log out. Please try again.");
        }

        return res.redirect("/login");
    });
});

// ================= ADD MEDICINE =================

app.post("/addMedicine", requireApiAuth, requireCsrfToken, async (req, res) => {
    try {
        const validation = validateMedicineInput(req.body);
        if (validation.error) {
            return res.status(400).json({ error: validation.error });
        }

        const medicine = new Medicine({
            userId: req.session.userId,
            ...validation.value
        });

        await medicine.save();

        res.status(201).json({ message: "Medicine added." });

    } catch (error) {
        res.status(500).json({ error: "Failed to add medicine." });
    }
});

// ================= GET ALL MEDICINES =================

app.get("/getMedicines", requireApiAuth, async (req, res) => {
    try {

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

app.delete("/deleteMedicine/:id", requireApiAuth, requireCsrfToken, async (req, res) => {
    try {
        if (!validateMedicineId(req.params.id, res)) {
            return;
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

app.put("/updateMedicine/:id", requireApiAuth, requireCsrfToken, async (req, res) => {
    try {
        if (!validateMedicineId(req.params.id, res)) {
            return;
        }

        const validation = validateMedicineInput(req.body);
        if (validation.error) {
            return res.status(400).json({ error: validation.error });
        }

        const medicine = await Medicine.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: req.session.userId
            },
            validation.value,
            {
                new: true,
                runValidators: true
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

app.put("/takeMedicine/:id", requireApiAuth, requireCsrfToken, async (req, res) => {
    try {
        if (!validateMedicineId(req.params.id, res)) {
            return;
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
