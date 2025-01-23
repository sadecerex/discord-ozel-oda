const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  invitedUsers: [{ userId: String }],
  inviteCount: { type: Number, default: 0 },
});

module.exports = mongoose.model('Invite', inviteSchema);
