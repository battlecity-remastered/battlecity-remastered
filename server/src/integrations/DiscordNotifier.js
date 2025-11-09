"use strict";

const debug = require('debug')('BattleCity:DiscordNotifier');

let discordLib = null;
try {
    // eslint-disable-next-line global-require
    discordLib = require('discord.js');
} catch (error) {
    debug('discord.js not available: %s', error && error.message ? error.message : error);
}

const Client = discordLib ? discordLib.Client : null;
const GatewayIntentBits = discordLib ? discordLib.GatewayIntentBits : {};
const Events = discordLib ? discordLib.Events : {};
const hasDiscordLib = Boolean(Client && GatewayIntentBits && Events);
const DEFAULT_INTENTS = [];
if (hasDiscordLib && typeof GatewayIntentBits.Guilds !== 'undefined') {
    DEFAULT_INTENTS.push(GatewayIntentBits.Guilds);
}
if (hasDiscordLib && typeof GatewayIntentBits.GuildMessages !== 'undefined') {
    DEFAULT_INTENTS.push(GatewayIntentBits.GuildMessages);
}

const toTrimmedString = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

const escapeDiscordMentions = (value) => {
    if (typeof value !== 'string') {
        if (value === null || typeof value === 'undefined') {
            return '';
        }
        return escapeDiscordMentions(String(value));
    }
    if (value.length === 0) {
        return '';
    }
    return value.replace(/@/g, '@\u200B');
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

class DiscordNotifier {

    constructor(options = {}) {
        this.token = toTrimmedString(options.token || process.env.DISCORD_BOT_TOKEN || '');
        this.channelId = toTrimmedString(options.channelId || process.env.DISCORD_CHANNEL_ID || '');
        this.threadId = toTrimmedString(options.threadId || process.env.DISCORD_THREAD_ID || '');
        this.activity = toTrimmedString(options.activity || process.env.DISCORD_BOT_ACTIVITY || '');
        this.client = null;
        this.targetChannel = null;
        this.readyPromise = null;
        this.readyReject = null;
        this.queue = Promise.resolve();
        this.started = false;
        this.enabled = Boolean(this.token && this.channelId && hasDiscordLib);
        this.hasWarnedDisabled = false;
        if (!hasDiscordLib) {
            this.hasWarnedDisabled = true;
            debug('Discord notifier disabled (discord.js library missing)');
        }
    }

    isEnabled() {
        if (!this.enabled && !this.hasWarnedDisabled) {
            this.hasWarnedDisabled = true;
            if (!hasDiscordLib) {
                debug('Discord notifier disabled (discord.js library missing)');
            } else {
                debug('Discord notifier disabled (missing configuration)');
            }
        }
        return this.enabled;
    }

    start() {
        if (!this.isEnabled()) {
            return Promise.resolve(false);
        }
        if (this.started) {
            return this.readyPromise || Promise.resolve(false);
        }
        this.started = true;
        this.client = new Client({ intents: DEFAULT_INTENTS });
        this.client.on('error', (error) => {
            debug('Discord client error: %s', error && error.message ? error.message : error);
        });
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyReject = reject;
            this.client.once(Events.ClientReady, async () => {
                try {
                    await this.refreshChannel();
                    if (this.activity && this.client.user) {
                        this.client.user.setActivity(this.activity);
                    }
                    this.readyReject = null;
                    resolve(true);
                } catch (error) {
                    debug('Failed to prepare Discord notifier: %s', error && error.message ? error.message : error);
                    reject(error);
                }
            });
        });
        this.client.login(this.token).catch((error) => {
            debug('Discord login failed: %s', error && error.message ? error.message : error);
            this.enabled = false;
            if (typeof this.readyReject === 'function') {
                this.readyReject(error);
                this.readyReject = null;
            }
        });
        return this.readyPromise;
    }

    async refreshChannel() {
        if (!this.client) {
            throw new Error('Client not initialised');
        }
        const channel = await this.client.channels.fetch(this.channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Configured Discord channel is not text-capable');
        }
        if (this.threadId && channel.threads && typeof channel.threads.fetch === 'function') {
            try {
                const thread = await channel.threads.fetch(this.threadId);
                if (thread && thread.isTextBased()) {
                    this.targetChannel = thread;
                    return this.targetChannel;
                }
            } catch (error) {
                debug('Unable to load Discord thread %s: %s', this.threadId, error && error.message ? error.message : error);
            }
        }
        this.targetChannel = channel;
        return this.targetChannel;
    }

    async ensureReady() {
        if (!this.isEnabled()) {
            return false;
        }
        try {
            const ready = this.start();
            if (ready && typeof ready.then === 'function') {
                await ready;
            }
        } catch (error) {
            debug('Discord notifier failed to initialise: %s', error && error.message ? error.message : error);
            return false;
        }
        return Boolean(this.targetChannel);
    }

    enqueue(action) {
        this.queue = this.queue.then(() => action()).catch((error) => {
            debug('Discord notifier send failed: %s', error && error.message ? error.message : error);
        });
        return this.queue;
    }

    async sendMessage(content) {
        const message = toTrimmedString(content);
        if (!message) {
            return Promise.resolve();
        }
        const ready = await this.ensureReady();
        if (!ready || !this.targetChannel) {
            return Promise.resolve();
        }
        return this.enqueue(async () => {
            await this.targetChannel.send({ content: message });
        });
    }

    formatCityName(payload, fallback) {
        if (!payload) {
            return escapeDiscordMentions(fallback);
        }
        if (typeof payload.cityName === 'string' && payload.cityName.trim().length) {
            return escapeDiscordMentions(payload.cityName.trim());
        }
        if (Number.isFinite(payload.cityId)) {
            return escapeDiscordMentions(`City ${Math.floor(payload.cityId) + 1}`);
        }
        return escapeDiscordMentions(fallback);
    }

    formatPlayerName(payload, fallback = 'Unknown Player') {
        if (!payload) {
            return escapeDiscordMentions(fallback);
        }
        if (typeof payload.displayName === 'string' && payload.displayName.trim().length) {
            return escapeDiscordMentions(payload.displayName.trim());
        }
        if (typeof payload.callsign === 'string' && payload.callsign.trim().length) {
            return escapeDiscordMentions(payload.callsign.trim());
        }
        const shortId = shortenId(typeof payload.playerId === 'string' ? payload.playerId : String(payload.playerId || ''));
        if (shortId) {
            return escapeDiscordMentions(shortId);
        }
        return escapeDiscordMentions(fallback);
    }

    notifyPlayerJoined(payload = {}) {
        if (!this.isEnabled()) {
            return Promise.resolve();
        }
        const playerName = this.formatPlayerName(payload);
        const cityName = this.formatCityName(payload, 'the battlefield');
        const role = payload.isMayor ? 'Mayor' : 'Recruit';
        const tags = [];
        if (payload.isFake) {
            tags.push('bot');
        }
        const suffix = tags.length ? ` [${tags.join(', ')}]` : '';
        const message = `🟢 **${playerName}** joined ${cityName} as ${role}.${suffix}`;
        return this.sendMessage(message);
    }

    notifyPlayerLeft(payload = {}) {
        if (!this.isEnabled()) {
            return Promise.resolve();
        }
        const playerName = this.formatPlayerName(payload);
        const cityName = this.formatCityName(payload, 'the battlefield');
        const message = `🔴 **${playerName}** left ${cityName}.`;
        return this.sendMessage(message);
    }

    notifyOrbDetonated(payload = {}) {
        if (!this.isEnabled()) {
            return Promise.resolve();
        }
        const attackerName = this.formatPlayerName({
            displayName: payload.attackerDisplayName,
            callsign: payload.attackerCallsign,
            playerId: payload.attackerId,
        }, 'An attacker');
        const attackerCityName = this.formatCityName({
            cityName: payload.attackerCityName,
            cityId: payload.attackerCity,
        }, 'their city');
        const targetCityName = this.formatCityName({
            cityName: payload.targetCityName,
            cityId: payload.targetCity,
        }, 'a rival city');
        const points = Number.isFinite(payload.points) ? Math.max(0, Math.floor(payload.points)) : null;
        const scoreText = points !== null ? ` for ${points} points` : '';
        const message = `💥 **${attackerName}** orb'd **${targetCityName}** (${attackerCityName})${scoreText}!`;
        return this.sendMessage(message);
    }

    async shutdown() {
        this.enabled = false;
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (error) {
                debug('Failed to destroy Discord client: %s', error && error.message ? error.message : error);
            }
        }
    }
}

module.exports = DiscordNotifier;

