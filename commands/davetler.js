const Invite = require('../models/Invite');

module.exports = {
  name: 'davetler',
  async execute(message, args) {
    const inviterId = args[0]?.replace(/[<@!>]/g, '') || message.author.id;
    const inviterData = await Invite.findOne({
      guildId: message.guild.id,
      userId: inviterId,
    });

    if (!inviterData) {
      return message.reply('Bu kullanıcı için kayıtlı davet bulunamadı.');
    }

    const embed = {
      color: 0x00ff00,
      title: 'Davet Bilgileri',
      fields: [
        { name: 'Kullanıcı', value: `<@${inviterId}>`, inline: true },
        { name: 'Toplam Davet Sayısı', value: `${inviterData.inviteCount}`, inline: true },
      ],
      timestamp: new Date(),
    };

    message.reply({ embeds: [embed] });
  },
};
