const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema({

    medicineName: {
        type: String,
        required: true
    },

    medicineTime: {
        type: String,
        required: true
    }

});

module.exports = mongoose.model("Medicine", medicineSchema);