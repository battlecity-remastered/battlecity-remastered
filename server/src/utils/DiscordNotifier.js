"use strict";

const https = require('https');

let discord;
try {
    // Prefer discord.js when it is installed so we use the official REST helper
    // and route builder. If it is missing we fall back to plain HTTPS to keep
    // notifications working without the extra dependency.
    // eslint-disable-next-line global-require
    discord = require('discord.js');
} catch (_error) {
    discord = null;
}

const Routes = {
    channelMessages: (channelId) => `/api/v10/channels/${encodeURIComponent(channelId)}/messages`
};

const clampContent = (content, maxLength = 1800) => {
    if (typeof content !== 'string') {
        return '';
    }
    if (content.length <= maxLength) {
        return content;
    }
    return `${content.slice(0, maxLength - 3)}...`;
};

class DiscordNotifier {
    constructor(options = {}) {
        const {
            token,
            channelId,
            minIntervalMs = 10000,
            requestTimeoutMs = 5000,
            discordModule
        } = options;
        this.discord = discordModule === undefined ? discord : discordModule;
        this.token = token;
        this.channelId = channelId;
        this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
        this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 5000);
        this.lastSentAt = 0;
        this.rest = this.discord && token
            ? new this.discord.REST({ version: '10', timeout: this.requestTimeoutMs }).setToken(token)
            : null;
    }

    static fromEnv(env = process.env) {
        const token = env.DISCORD_BOT_TOKEN;
        const channelId = env.DISCORD_CHANNEL_ID;
        if (!token || !channelId) {
            return null;
        }
        return new DiscordNotifier({
            token,
            channelId,
            minIntervalMs: Number(env.DISCORD_MIN_INTERVAL_MS) || undefined,
            requestTimeoutMs: Number(env.DISCORD_REQUEST_TIMEOUT_MS) || undefined
        });
    }

    get enabled() {
        return Boolean(this.token && this.channelId);
    }

    async send(content) {
        if (!this.enabled) {
            return false;
        }
        const now = Date.now();
        if (now - this.lastSentAt < this.minIntervalMs) {
            return false;
        }
        const clamped = clampContent(content);

        if (this.rest && this.discord?.Routes) {
            await this.rest.post(this.discord.Routes.channelMessages(this.channelId), {
                body: { content: clamped }
            });
        } else {
            await this.sendViaHttps(clamped);
        }

        this.lastSentAt = now;
        return true;
    }

    async sendViaHttps(content) {
        const payload = JSON.stringify({ content });
        const options = {
            hostname: 'discord.com',
            port: 443,
            path: Routes.channelMessages(this.channelId),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'Authorization': `Bot ${this.token}`
            },
            timeout: this.requestTimeoutMs
        };

        await new Promise((resolve, reject) => {
            const request = https.request(options, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                        return resolve();
                    }
                    const error = new Error(`Discord responded with status ${response.statusCode}`);
                    error.status = response.statusCode;
                    error.body = body;
                    reject(error);
                });
            });

            request.on('timeout', () => {
                request.destroy(new Error('Discord request timed out'));
            });

            request.on('error', (error) => {
                reject(error);
            });

            request.write(payload);
            request.end();
        });
    }
}

module.exports = {
    DiscordNotifier
};
