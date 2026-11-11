const mongoose = require("mongoose");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;
let app;
let sessionStore;
let User;
let Medicine;

const validMedicine = {
    medicineName: "Daily vitamin",
    medicineTime: "08:30",
    startDate: "2026-01-01",
    endDate: "2026-12-31"
};

async function registerAndLogin(email, password = "TestPassword123!") {
    const agent = request.agent(app);

    await agent
        .post("/register")
        .type("form")
        .send({ name: "Test User", email, password })
        .expect(200);

    await agent
        .post("/login")
        .type("form")
        .send({ email, password })
        .expect(302)
        .expect("Location", "/dashboard");

    const tokenResponse = await agent.get("/csrf-token").expect(200);
    return { agent, csrfToken: tokenResponse.body.csrfToken };
}

async function clearSessionStore() {
    await new Promise((resolve, reject) => {
        sessionStore.clear((error) => error ? reject(error) : resolve());
    });
}

beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "jest-only-session-secret-not-for-production";
    process.env.MONGOMS_DOWNLOAD_DIR = path.join(os.tmpdir(), "medicine-reminder-mongodb-binaries");

    mongoServer = await MongoMemoryServer.create();
    const testMongoUri = mongoServer.getUri("medicine_reminder_test");
    process.env.MONGO_URI = testMongoUri;

    await mongoose.connect(testMongoUri);

    app = require("../server");
    sessionStore = app.locals.sessionStore;
    User = require("../models/User");
    Medicine = require("../models/Medicine");
}, 300000);

afterEach(async () => {
    if (!User || !Medicine || !sessionStore) {
        return;
    }

    await Promise.all([
        User.deleteMany({}),
        Medicine.deleteMany({})
    ]);
    await clearSessionStore();
});

afterAll(async () => {
    if (sessionStore) {
        await sessionStore.close();
    }
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
    }
});

describe("authentication and session routes", () => {
    test("registers a user, stores a password hash, and logs in", async () => {
        const agent = request.agent(app);
        const password = "TestPassword123!";

        await agent
            .post("/register")
            .type("form")
            .send({ name: "A User", email: "a@example.test", password })
            .expect(200);

        const user = await User.findOne({ email: "a@example.test" });
        expect(user.password).not.toBe(password);
        await expect(user.comparePassword(password)).resolves.toBe(true);

        await agent
            .post("/login")
            .type("form")
            .send({ email: "a@example.test", password })
            .expect(302)
            .expect("Location", "/dashboard");

        await agent.get("/dashboard").expect(200);
    });

    test("returns the same invalid-credentials response for unknown users and wrong passwords", async () => {
        await request(app)
            .post("/login")
            .type("form")
            .send({ email: "missing@example.test", password: "WrongPassword123!" })
            .expect(401)
            .expect("Invalid email or password.");

        const { agent } = await registerAndLogin("known@example.test");
        const response = await agent
            .post("/login")
            .type("form")
            .send({ email: "known@example.test", password: "WrongPassword123!" })
            .expect(401);

        expect(response.text).toBe("Invalid email or password.");
    });

    test("rejects unauthenticated dashboard and medicine requests", async () => {
        await request(app).get("/dashboard").expect(302).expect("Location", "/login");
        await request(app).get("/getMedicines").expect(401);
        await request(app).get("/csrf-token").expect(401);
        await request(app).post("/addMedicine").send(validMedicine).expect(401);
        await request(app).put("/updateMedicine/507f1f77bcf86cd799439011").send(validMedicine).expect(401);
        await request(app).delete("/deleteMedicine/507f1f77bcf86cd799439011").expect(401);
        await request(app).put("/takeMedicine/507f1f77bcf86cd799439011").expect(401);
        await request(app).post("/logout").expect(401);
    });

    test("destroys a session at logout and rejects the old session afterwards", async () => {
        const { agent, csrfToken } = await registerAndLogin("logout@example.test");

        const response = await agent
            .post("/logout")
            .set("X-CSRF-Token", csrfToken)
            .expect(302)
            .expect("Location", "/login");

        expect(response.headers["set-cookie"].join(";")).toContain("connect.sid=;");
        await agent.get("/getMedicines").expect(401);
        await agent.get("/dashboard").expect(302).expect("Location", "/login");
    });
});

describe("medicine CRUD, CSRF, and ownership", () => {
    test("requires a valid CSRF token for medicine writes", async () => {
        const { agent, csrfToken } = await registerAndLogin("csrf@example.test");

        await agent.post("/addMedicine").send(validMedicine).expect(403);
        await agent
            .post("/addMedicine")
            .set("X-CSRF-Token", "incorrect-token")
            .send(validMedicine)
            .expect(403);
        expect(await Medicine.countDocuments()).toBe(0);

        await agent
            .post("/addMedicine")
            .set("X-CSRF-Token", csrfToken)
            .send(validMedicine)
            .expect(201);
        const medicine = await Medicine.findOne({ medicineName: validMedicine.medicineName });

        const protectedWrites = [
            () => agent.put(`/updateMedicine/${medicine._id}`).send({ ...validMedicine, medicineName: "Changed" }),
            () => agent.delete(`/deleteMedicine/${medicine._id}`),
            () => agent.put(`/takeMedicine/${medicine._id}`),
            () => agent.post("/logout")
        ];

        for (const sendWrite of protectedWrites) {
            await sendWrite().expect(403);
            await sendWrite().set("X-CSRF-Token", "incorrect-token").expect(403);
        }

        const unchangedMedicine = await Medicine.findById(medicine._id);
        expect(unchangedMedicine.medicineName).toBe(validMedicine.medicineName);
        expect(unchangedMedicine.taken).toBe(false);
        expect(await agent.get("/getMedicines")).toHaveProperty("status", 200);

        await agent
            .post("/addMedicine")
            .set("X-CSRF-Token", csrfToken)
            .send({ ...validMedicine, medicineName: "Second valid medicine" })
            .expect(201);
        expect(await Medicine.countDocuments()).toBe(2);
    });

    test("creates, lists, updates, marks taken, and deletes a medicine", async () => {
        const { agent, csrfToken } = await registerAndLogin("crud@example.test");
        const user = await User.findOne({ email: "crud@example.test" });

        const created = await agent
            .post("/addMedicine")
            .set("X-CSRF-Token", csrfToken)
            .send({ ...validMedicine, userId: new mongoose.Types.ObjectId().toString() })
            .expect(201);

        const medicine = await Medicine.findOne({ medicineName: validMedicine.medicineName });
        expect(medicine.userId.toString()).toBe(user._id.toString());
        expect(created.body.message).toBe("Medicine added.");

        const list = await agent.get("/getMedicines").expect(200);
        expect(list.body).toHaveLength(1);
        expect(list.body[0].medicineName).toBe(validMedicine.medicineName);

        const updatedMedicine = { ...validMedicine, medicineName: "Updated vitamin" };
        await agent
            .put(`/updateMedicine/${medicine._id}`)
            .set("X-CSRF-Token", csrfToken)
            .send(updatedMedicine)
            .expect(200);
        expect((await Medicine.findById(medicine._id)).medicineName).toBe("Updated vitamin");

        await agent
            .put(`/takeMedicine/${medicine._id}`)
            .set("X-CSRF-Token", csrfToken)
            .expect(200);
        expect((await Medicine.findById(medicine._id)).taken).toBe(true);

        await agent
            .delete(`/deleteMedicine/${medicine._id}`)
            .set("X-CSRF-Token", csrfToken)
            .expect(200);
        expect(await Medicine.findById(medicine._id)).toBeNull();
    });

    test("isolates two users and rejects cross-user update, delete, and mark-as-taken", async () => {
        const userA = await registerAndLogin("owner-a@example.test");
        const userB = await registerAndLogin("owner-b@example.test");

        await userA.agent
            .post("/addMedicine")
            .set("X-CSRF-Token", userA.csrfToken)
            .send({ ...validMedicine, medicineName: "A medicine" })
            .expect(201);
        await userB.agent
            .post("/addMedicine")
            .set("X-CSRF-Token", userB.csrfToken)
            .send({ ...validMedicine, medicineName: "B medicine" })
            .expect(201);

        const medicineA = await Medicine.findOne({ medicineName: "A medicine" });
        const medicineB = await Medicine.findOne({ medicineName: "B medicine" });

        expect((await userA.agent.get("/getMedicines").expect(200)).body.map((item) => item.medicineName))
            .toEqual(["A medicine"]);
        expect((await userB.agent.get("/getMedicines").expect(200)).body.map((item) => item.medicineName))
            .toEqual(["B medicine"]);

        await userB.agent
            .put(`/updateMedicine/${medicineA._id}`)
            .set("X-CSRF-Token", userB.csrfToken)
            .send({ ...validMedicine, medicineName: "Cross-user update" })
            .expect(404);
        await userB.agent
            .delete(`/deleteMedicine/${medicineA._id}`)
            .set("X-CSRF-Token", userB.csrfToken)
            .expect(404);
        await userB.agent
            .put(`/takeMedicine/${medicineA._id}`)
            .set("X-CSRF-Token", userB.csrfToken)
            .expect(404);

        const unchangedMedicineA = await Medicine.findById(medicineA._id);
        expect(unchangedMedicineA.medicineName).toBe("A medicine");
        expect(unchangedMedicineA.taken).toBe(false);
        expect(await Medicine.findById(medicineB._id)).not.toBeNull();
    });

    test("keeps legacy medicines without an owner untouched and unavailable", async () => {
        const { agent, csrfToken } = await registerAndLogin("legacy@example.test");
        const legacyId = new mongoose.Types.ObjectId();
        await Medicine.collection.insertOne({
            _id: legacyId,
            medicineName: "Legacy medicine",
            medicineTime: "12:00",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            taken: false,
            lastTakenDate: ""
        });

        expect((await agent.get("/getMedicines").expect(200)).body).toEqual([]);
        await agent
            .put(`/updateMedicine/${legacyId}`)
            .set("X-CSRF-Token", csrfToken)
            .send({ ...validMedicine, medicineName: "Should not update" })
            .expect(404);
        await agent
            .delete(`/deleteMedicine/${legacyId}`)
            .set("X-CSRF-Token", csrfToken)
            .expect(404);
        await agent
            .put(`/takeMedicine/${legacyId}`)
            .set("X-CSRF-Token", csrfToken)
            .expect(404);

        const legacyRecord = await Medicine.collection.findOne({ _id: legacyId });
        expect(legacyRecord).not.toBeNull();
        expect(legacyRecord.userId).toBeUndefined();
        expect(legacyRecord.medicineName).toBe("Legacy medicine");
        expect(legacyRecord.taken).toBe(false);
    });
});
