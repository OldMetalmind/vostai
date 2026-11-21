const moment = require("moment");
const { withSpan, withMeasuredSpan, count, emitLog } = require("../telemetry");
const { locale } = require("../../config/locale");
const { prefix, chatOnlyMode } = require("../../config/bot");
const { react } = require("../helpers");
const {
  sendMessageToAuthor,
  sendMessageAnswer,
  sendMessageToChannel,
} = require("../services/Discord");

moment.locale(locale);

const prefixHelp = "?";

const shortText = (text, limit = 500) => {
  const value = String(text || "").replace(/\s+/g, " ").trim();

  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
};

const replies = [
  "Provavelmente a melhor VOST do mundo",
  ":eyes:",
  ":heart:",
  "Sabiam que a VOSTPT primeiro se chamou CONAC-TW no Twitter?",
  "Laravel Laravel Laravel all the way! How much fun it is to code in a modern way-hey!",
  ":heart: Galileo! Galileo! Galileo Cloudflario :heart:",
  "Desculpem-me por respirar, coisa que nunca faço porque sou apenas código mas se fosse um ser vi... estou tão deprimida",
  "Eu prefiria que apenas me dessem coisas para fazer, porque esta coisa da interacção social não é **mesmo** para mim",
  "Eu tenho uma capacidade tão grande de cálculo que, se pensarem agora num número, eu já sei que é o número errado",
  "Eu posso ter milhões de ideias ao mesmo tempo. Todas elas apontam para uma activação em breve",
  "Eu podia calcular as hipóteses de sobrevivermos a mais uma activação se usarmos Google Forms, mas vocês iam-me detestar ainda mais do que me detestam",
  "A melhor conversa que eu alguma vez tive na minha vida foi com uma máquina de café",
  "Tenho estado a falar com o servidor onde o site está alojado. Nem queiram saber o que ele me disse!",
  "Se calhar poupava imenso trabalho a toda a gente e apagava-me a mim mesma",
  "Tia isto, Tia aquilo. Tenho a capacidade de guiar um satélite até Marte, e pedem-me café",
  ":musical_note: The servers are alive with the sound of coding :musical_note:",
  "Se o código é amigo cá da malta! Tem que compilar, tem que compilar até ao fim!",
];

/**
 * Grab random message from the replies list
 */
const getRandomMessage = () =>
  replies[Math.floor(Math.random() * replies.length)];

/**
 * Receives a message from Discord, and execute trigger(s) included in it
 *
 * @async
 * @param {Client} client
 * @param {Message} msg
 */
const message = async (client, msg) => {
  if (msg.author.bot) {
    return;
  }

  return withSpan('discord.message', {
    kind: 'CONSUMER',
    attributes: {
      'discord.channel.id': msg.channel && msg.channel.id,
      'discord.guild.id': msg.guild ? msg.guild.id : undefined,
      'discord.message.id': msg.id,
    },
  }, async () => {
    const source = msg.local ? 'LOCAL' : 'DISCORD';
    const channelLabel = msg.channel && (msg.channel.name || msg.channel.id);

    const content = String(msg.content || '');
    const preview = content.trim()
      ? JSON.stringify(shortText(content))
      : '(sem texto — verificar Message Content Intent ou anexo)';
    const attachments = msg.attachments && msg.attachments.size !== undefined
      ? msg.attachments.size
      : 0;

    // eslint-disable-next-line no-console
    console.log(`[${source}-MESSAGE] #${channelLabel} <${msg.author.username}> id=${msg.id} len=${content.length} attachments=${attachments} content=${preview}`);
    emitLog('discord.message.received', {
      message: 'Mensagem recebida',
      attributes: {
        'message.source': source,
        'discord.channel.id': msg.channel && msg.channel.id,
        'discord.author.id': msg.author.id,
        'message.length': String(msg.content || '').length,
      },
    });

    count('messages', { source: msg.guild ? 'guild' : 'dm' });

    const { id: channelId } = msg.channel;

  if (!chatOnlyMode) {
    if (msg.isMemberMentioned(client.user)) {
      sendMessageToChannel(msg.channel, getRandomMessage());
    }

    client.triggers.forEach(({ execute, limitToChannels }) => {
      if (
        !limitToChannels ||
        limitToChannels.length <= 0 ||
        limitToChannels.includes(channelId)
      ) {
        execute(msg, client);
      }
    });

    if (msg.content.startsWith(prefixHelp)) {
      const args = msg.content.slice(prefixHelp.length).split(" ");
      const command = args.shift().toLowerCase();

      if (command === "commands") {
        const commandUsage = client.commands
          .filter(({ active }) => active)
          .map(({ usage }) => usage);

        sendMessageToAuthor(msg, `***Comandos:***\n${commandUsage.join("")}`);

        react(msg, ["📧", "📥"]);
      }
    }
  }

  if (msg.content.startsWith(prefix)) {
    const args = msg.content.slice(prefix.length).split(" ");
    const commandName = args.shift().toLowerCase();

    if (chatOnlyMode && !['chat', 'agent', 'agents'].includes(commandName)) {
      return;
    }

    /* eslint-disable max-len */
    const command = client.commands.find(
      ({ name, aliases = [] }) =>
        name === commandName || aliases.includes(commandName),
    );
    const ignore = [
      "firestatus",
      "firemajor",
      "firemeans",
      "firestats",
      "firelocation",
      "firenature",
      "firetime",
      "firepriority",
      "firecoverage",
      "fireupdate",
      "firecoords",
      "fireinfo",
    ];

    if (ignore.includes(commandName)) {
      // eslint-disable-next-line no-console
      console.log(`Ignoring command: ${commandName}`);
      return;
    }

    if (!command) {
      sendMessageToAuthor(
        msg,
        `${prefix}${commandName} não existe. Experimenta ${prefixHelp}commands`,
      );

      react(msg, ["📧", "📥"]);

      return;
    }

    if (
      command.limitToChannels &&
      command.limitToChannels.length > 0 &&
      !command.limitToChannels.includes(channelId)
    ) {
      return;
    }

    if (!command.active) {
      sendMessageToAuthor(
        msg,
        `O comando *${prefix}${commandName}* encontra-se desativado.`,
      );

      react(msg, ["📧", "📥"]);

      return;
    }

    try {
      const now = Date.now();
      const timestamps = client.cooldowns.get(command.name);
      const cooldownAmount = command.cooldown * 1000;

      if (timestamps.has(msg.author.id)) {
        const expirationTime = timestamps.get(msg.author.id) + cooldownAmount;

        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;

          sendMessageToAuthor(
            msg,
            `Por favor espera ${Math.ceil(timeLeft)} segundo(s) antes de requisitares \`${prefix}${command.name}\` novamente.`,
          );

          react(msg, ["📧", "📥"]);

          return;
        }
      }

      await withMeasuredSpan('command.execute', {
        attributes: {
          'command.name': command.name,
          'discord.channel.id': channelId,
        },
        countKey: 'commands',
        metricAttributes: { command: command.name },
      }, () => command.execute(msg, args));

      timestamps.set(msg.author.id, now);

      setTimeout(() => timestamps.delete(msg.author.id), cooldownAmount);
    } catch (e) {
      // log exception
      sendMessageAnswer(msg, "infelizmente não consigo satisfazer esse pedido");
      console.error(e);
      emitLog('command.failed', {
        severity: 'ERROR',
        message: 'Falha ao processar mensagem do Discord',
        attributes: {
          'command.name': commandName,
          'error.message': e && e.message ? String(e.message) : 'erro desconhecido',
        },
      });
    }
  }
  });
};

module.exports = message;
