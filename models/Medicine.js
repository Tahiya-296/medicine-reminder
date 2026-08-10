const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema({

    medicineName: {
        type: String,
        required: true
    },

    medicineTime: {
        type: String,
        required: true
    },

    taken: {
        type: Boolean,
        default: false
    }

});

module.exports = mongoose.model("Medicine", medicineSchema);