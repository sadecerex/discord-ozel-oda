const { Client, MessageFlags, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, UserSelectMenuBuilder, ButtonStyle, EmbedBuilder, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { MONGO_URI, TOKEN, LOG_CHANNEL_ID, CATEGORY_ID, TARGET_CHANNEL_ID } = require('./config.json');
const Invite = require('./models/Invite');
const SecretRoom = require('./models/Room');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.name, command);
}

const invitesCache = new Map();

async function sendLogMessage(guild, message, embed = null) {
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel && logChannel.isTextBased()) {
    await logChannel.send({ content: message, embeds: embed ? [embed] : [] });
  }
}

client.once('ready', async () => {
  console.log(`${client.user.tag} aktif!`);

  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('MongoDB bağlantısı başarılı.');

  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);

   
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });
    await channel.bulkDelete(fetchedMessages);

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Özel Oda Oluşturma Sistemi')
      .setDescription('Merhaba Değerli Üyeler, Özel oda oluşturmak için aşağıdaki butona tıklayabilirsiniz. 15 davet sayısına ulaştığınızda özel oda oluşturabilirsiniz.')
      .setImage('https://sadecerex.com/nemlizade.png')
      .setFooter({ text: 'Developed By Rex - Özel Oda Oluşturma Sistemi' });  
      
    const button1 = new ButtonBuilder()
      .setCustomId('create_room')
      .setLabel('Özel Oda Oluştur')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button1);

    await channel.send({ embeds: [embed], components: [row] });

  console.log('Mesaj Gönderildi.');
  } catch (error) {}



  client.guilds.cache.forEach(async (guild) => {
    const invites = await guild.invites.fetch();
    const cachedInvites = new Map();
    invites.forEach((invite) => cachedInvites.set(invite.code, invite.uses || 0));
    invitesCache.set(guild.id, cachedInvites);
  });
});

client.on('inviteCreate', (invite) => {
  const cachedInvites = invitesCache.get(invite.guild.id) || new Map();
  cachedInvites.set(invite.code, invite.uses || 0);
  invitesCache.set(invite.guild.id, cachedInvites);
});

client.on('guildMemberAdd', async (member) => {
  try {
    const cachedInvites = invitesCache.get(member.guild.id);
    const currentInvites = await member.guild.invites.fetch();
    const inviteUsed = currentInvites.find(
      (inv) => cachedInvites.get(inv.code) < inv.uses
    );

    if (inviteUsed) {
      const inviter = inviteUsed.inviter;

      if (inviter) {
        const existingData = await Invite.findOne({
          guildId: member.guild.id,
          userId: inviter.id,
        });

        if (existingData) {
          existingData.invitedUsers.push({ userId: member.id });
          existingData.inviteCount += 1;
          await existingData.save();
        } else {
          await Invite.create({
            guildId: member.guild.id,
            userId: inviter.id,
            invitedUsers: [{ userId: member.id }],
            inviteCount: 1,
          });
        }

        const embed = {
          color: 0x00ff00,
          title: 'Yeni Üye Katıldı!',
          description: `<a:36:1328637962979901470> ${member.user.tag} sunucuya katıldı.`,
          fields: [
            { name: 'Davet Eden', value: inviter.tag, inline: true },
            { name: 'Sunucu', value: member.guild.name, inline: true },
          ],
          thumbnail: { url: member.user.displayAvatarURL() },
          timestamp: new Date(),
        };

        await sendLogMessage(member.guild, null, embed);
      }
    }

    invitesCache.set(
      member.guild.id,
      currentInvites.reduce((acc, inv) => acc.set(inv.code, inv.uses || 0), new Map())
    );
  } catch (error) {
    console.error('guildMemberAdd hatası:', error);
    }
  });

client.on('guildMemberRemove', async (member) => {
  try {
    const inviterData = await Invite.findOne({
      guildId: member.guild.id,
      invitedUsers: { $elemMatch: { userId: member.id } },
    });

    if (inviterData) {
      inviterData.invitedUsers = inviterData.invitedUsers.filter((u) => u.userId !== member.id);
      inviterData.inviteCount -= 1;
      await inviterData.save();

      const embed = {
        color: 0xff0000,
        title: 'Bir Üye Ayrıldı!',
        description: `<a:19:1328637950140874773> ${member.user.tag} sunucudan ayrıldı.`,
        fields: [
          { name: 'Davet Eden', value: `<@${inviterData.userId}>`, inline: true },
          { name: 'Sunucu', value: member.guild.name, inline: true },
        ],
        thumbnail: { url: member.user.displayAvatarURL() },
        timestamp: new Date(),
      };

      await sendLogMessage(member.guild, null, embed);
    }
  } catch (error) {
    console.error('guildMemberRemove hatası:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'create_room') {
    const userInvites = await Invite.findOne({ guildId: interaction.guild.id, userId: interaction.user.id });

     if (!userInvites || userInvites.inviteCount < 15) {
      return interaction.reply({ content: 'Özel oda oluşturmak için 15 davet sayısına ulaşmanız gerekiyor.', ephemeral: true });
    } 

    const existingRoom = await SecretRoom.findOne({ userId: interaction.user.id });
    if (existingRoom) {
      return interaction.reply({ content: 'Zaten bir özel odanız mevcut.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('create_room_modal')
      .setTitle('Özel Oda Oluşturma');

    const roomNameInput = new TextInputBuilder()
      .setCustomId('room_name')
      .setLabel('Oda Adı')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const roomLimitInput = new TextInputBuilder()
      .setCustomId('room_limit')
      .setLabel('Kişi Sayısı (1-99)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow1 = new ActionRowBuilder().addComponents(roomNameInput);
    const actionRow2 = new ActionRowBuilder().addComponents(roomLimitInput);

    modal.addComponents(actionRow1, actionRow2);

    await interaction.showModal(modal);
  }
})

client.on('interactionCreate', async (interaction) => {
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'create_room_modal') {
      const roomName = interaction.fields.getTextInputValue('room_name');
      const roomLimit = parseInt(interaction.fields.getTextInputValue('room_limit'), 10);

      if (isNaN(roomLimit) || roomLimit < 1 || roomLimit > 99) {
        return interaction.reply({ content: 'Geçersiz kişi sayısı! (1-99 arası bir değer giriniz)', ephemeral: true });
      }

      const category = interaction.guild.channels.cache.get(CATEGORY_ID);
      if (!category) {
        return interaction.reply({ content: 'Kategoriniz bulunamadı. Lütfen kategori ID\'sini kontrol edin.', ephemeral: true });
      }

      const newChannel = await interaction.guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        userLimit: roomLimit,
        parent: category,
      });

      await newChannel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true, 
        Connect: true,     
        Speak: true,        
        ManageChannels: true, 
        MuteMembers: true,  
        DeafenMembers: true 
      });

      const newRoom = new SecretRoom({
        id: newChannel.id,
        ownerId: interaction.user.id,
      });

      await newRoom.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Özel Oda Oluşturma Sistemi')
        .setDescription('Aşağıdaki butonları kullanarak özel oda işlemlerinizi gerçekleştirebilirsiniz.')
        .setImage('https://sadecerex.com/odaaciklamasi.png')
        .setFooter({ text: 'Developed By Rex - Özel Oda Oluşturma Sistemi' });
        

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setEmoji("1195645121107083326").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("unlock").setEmoji("1195645253311537184").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("giveowner").setEmoji("1195645255157030924").setStyle(ButtonStyle.Secondary),
      );

      await newChannel.send({ embeds: [embed], components: [row1] });

      return interaction.reply({ content: 'Özel odanız başarıyla oluşturuldu!', ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    const ID = interaction.customId;

    if (ID === 'lock') {
      const secretRoom = await SecretRoom.findOne({ ownerId: interaction.user.id });
      if (!secretRoom || secretRoom.ownerId !== interaction.user.id) {
        return interaction.reply({ content: 'Bu kanal size ait olmadığı için bu işlemi yapamazsınız.', ephemeral: true });
      }

      const lockChannel = interaction.guild.channels.cache.get(secretRoom.id);
      if (!lockChannel) return interaction.reply({ content: 'Kanal bulunamadı.', ephemeral: true });

      await lockChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
      return interaction.reply({ content: 'Kanalınız başarıyla kilitlendi.', ephemeral: true });
    }

    if (ID === 'unlock') {
      const secretRoom = await SecretRoom.findOne({ ownerId: interaction.user.id });
      if (!secretRoom || secretRoom.ownerId !== interaction.user.id) {
        return interaction.reply({ content: 'Bu kanal size ait olmadığı için bu işlemi yapamazsınız.', ephemeral: true });
      }

      const lockChannel = interaction.guild.channels.cache.get(secretRoom.id);
      if (!lockChannel) return interaction.reply({ content: 'Kanal bulunamadı.', ephemeral: true });

      await lockChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
      return interaction.reply({ content: 'Kanalınız başarıyla kilidi açıldı.', ephemeral: true });
    }

    if (ID === 'giveowner') {
      try {
        const secretRoom = await SecretRoom.findOne({ ownerId: interaction.user.id });
        if (!secretRoom || secretRoom.ownerId !== interaction.user.id) {
          if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
              content: 'Bu kanal size ait olmadığı için bu işlemi yapamazsınız.',
              ephemeral: true,
            });
          }
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('giveowner_modal')
          .setTitle('Oda Sahipliği Devret');

        const newOwnerIdInput = new TextInputBuilder()
          .setCustomId('new_owner_id')
          .setLabel('Yeni Sahibin Kullanıcı ID\'si')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Kullanıcı ID\'si giriniz')
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(newOwnerIdInput);

        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } catch (error) {
        console.error('giveowner hatası:', error);
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
            ephemeral: true,
          });
        }
      }
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'giveowner_modal') {
    try {
      const newOwnerId = interaction.fields.getTextInputValue('new_owner_id').trim();

      if (!/^\d+$/.test(newOwnerId)) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: 'Geçersiz ID formatı! Sadece sayılardan oluşan bir kullanıcı ID\'si girin.',
            ephemeral: true,
          });
        }
        return;
      }

      const secretRoom = await SecretRoom.findOne({ ownerId: interaction.user.id });
      if (!secretRoom || secretRoom.ownerId !== interaction.user.id) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: 'Bu kanal size ait olmadığı için bu işlemi yapamazsınız.',
            ephemeral: true,
          });
        }
        return;
      }

      const newOwner = await interaction.guild.members.fetch(newOwnerId).catch(() => null);
      if (!newOwner) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: 'Geçersiz kullanıcı ID\'si girdiniz. Lütfen geçerli bir kullanıcı ID\'si girin.',
            ephemeral: true,
          });
        }
        return;
      }

      const roomChannel = interaction.guild.channels.cache.get(secretRoom.id);
      if (!roomChannel) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: 'Oda bulunamadı. Lütfen tekrar deneyin.',
            ephemeral: true,
          });
        }
        return;
      }

      await roomChannel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: null,
        Connect: null,
        Speak: null,
        ManageChannels: null,
        MuteMembers: null,
        DeafenMembers: null,
      });

      await roomChannel.permissionOverwrites.edit(newOwner.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        ManageChannels: true,
        MuteMembers: true,
        DeafenMembers: true,
      });

      secretRoom.ownerId = newOwner.id;
      await secretRoom.save();

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: `${newOwner.user.tag} artık odanızın sahibi!`,
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: `${newOwner.user.tag} artık odanızın sahibi!`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('giveowner_modal hatası:', error);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
          ephemeral: true,
        });
      }
    }
  }
});
    
    
  


client.login(TOKEN);