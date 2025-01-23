const Invite = require('../models/Invite');

module.exports = {
  name: 'davetleri-sifirla',
  async execute(message) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('Bu komutu kullanmak için yetkiniz yok.');
    }

    await Invite.deleteMany({ guildId: message.guild.id });
    message.reply('Tüm davetler sıfırlandı.');
  },
};
