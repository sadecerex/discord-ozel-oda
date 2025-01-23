const mongoose = require('mongoose');

const model = mongoose.model("Rex-SecretRoom", mongoose.Schema({
    id: String,
    ownerId: String,
}))

module.exports = model;