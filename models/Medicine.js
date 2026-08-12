const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    medicineName: {
        type: String,
        required: true
    },

    medicineTime: {
        type: String,
        required: true
    },

    startDate: {
        type: String,
        required: true
    },

    endDate: {
        type: String,
        required: true
    },

    taken: {
        type: Boolean,
        default: false
    },

    lastTakenDate: {
        type: String,
        default: ""
    }

});

module.exports = mongoose.model("Medicine", medicineSchema);