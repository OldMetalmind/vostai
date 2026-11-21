/* eslint-disable global-require */
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
const { initTelemetry } = require('./telemetry');

dotenvExpand(dotenv.config());
initTelemetry();

const fs = require('fs');
const Discord = require('discord.js');
const Events = require('./events');
const startHttpServer = require('./server/server');
const { chatOnlyMode, llmChatLocalInput } = require('../config/bot');
const { startLocalInput } = require('./events/localInput');

const client = new Discord.Client();
const commands = new Discord.Collection();
const triggers = new Discord.Collection();
const cooldowns = new Discord.Collection();

// Load commands
fs.readdirSync('./src/commands')
  .filter(file => file.endsWith('.js'))
  .forEach((file) => {
    const command = require(`./commands/${file}`);
    commands.set(command.name, command);
    cooldowns.set(command.name, new Discord.Collection());
  });

// Load triggers
fs.readdirSync('./src/triggers')
  .filter(file => file.endsWith('.js'))
  .forEach((file) => {
    const trigger = require(`./triggers/${file}`);
    triggers.set(trigger.name, trigger);
  });

if (chatOnlyMode) {
  commands.forEach((command, name) => {
    if (name !== 'chat') {
      command.active = false;
    }
  });
  triggers.clear();
}

client.commands = commands;
client.triggers = triggers;
client.cooldowns = cooldowns;

client.once('ready', () => {
  Events.ready(client);

  if (!chatOnlyMode) {
    startHttpServer(client);
  }

  if (llmChatLocalInput) {
    startLocalInput(client);
  }
});
client.on('message', message => Events.message(client, message));

client.login(process.env.BOT_TOKEN);
