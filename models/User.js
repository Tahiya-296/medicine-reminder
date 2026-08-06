const mongoose = require("mongoose");

console.log("User.js loaded");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    }
});

const User = mongoose.model("User", userSchema);

console.log("User model connection:", User.db.readyState);

module.exports = User;