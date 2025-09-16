const { attachInteractionEvents } = require('../src/events/interactionEvents');
const storage = require('../src/utils/storage');
const logChannels = require('../src/utils/logChannels');

// Jest mocks
jest.mock('../src/utils/logger');

describe('Interaction error posting and fallback ack', () => {
	let client;
	beforeEach(() => {
		// Minimal fake channel with send
		const fakeLogChannel = { send: jest.fn().mockResolvedValue({}) };
		// client.channels.fetch will return fakeLogChannel when called with CONFIG_LOG_CHANNEL
		const channels = {
			fetch: jest.fn((id) => {
				if (id === logChannels.CONFIG_LOG_CHANNEL) return Promise.resolve(fakeLogChannel);
				return Promise.resolve(null);
			}),
		};

		client = {
			on: jest.fn((evt, fn) => {
				client._handler = fn;
			}),
			channels,
			users: { fetch: jest.fn().mockResolvedValue(null) },
		};

		// ensure config flags set
		storage.config.postInteractionErrorsToLogChannel = true;
		storage.config.debugMode = false;

		// attach events
		attachInteractionEvents(client);
	});

	afterEach(() => {
		jest.resetAllMocks();
	});

	test('posts to log channel when interaction handler throws', async () => {
		// craft an interaction that will throw inside handler: a button with unknown customId that triggers code path we can force to throw
		const interaction = {
			isButton: () => true,
			isStringSelectMenu: () => false,
			isRepliable: () => true,
			replied: false,
			deferred: false,
			customId: 'clockin:nonexistent:event',
			user: { id: 'U1' },
			guildId: null,
			channelId: 'C1',
			message: { id: 'M1', embeds: [] },
			client,
			reply: jest.fn().mockResolvedValue(null),
			deferUpdate: jest.fn().mockResolvedValue(null),
		};

		// Force getEvent to throw when called by the code path.
		const eventsStorage = require('../src/utils/eventsStorage');
		jest.spyOn(eventsStorage, 'getEvent').mockImplementation(() => {
			throw new Error('boom-getEvent');
		});

		// invoke handler
		await client._handler(interaction);

		// expect channel.fetch called and log channel send invoked
		expect(client.channels.fetch).toHaveBeenCalledWith(logChannels.CONFIG_LOG_CHANNEL);
		const ch = await client.channels.fetch(logChannels.CONFIG_LOG_CHANNEL);
		expect(ch.send).toHaveBeenCalled();
	});

	test('fallback ack posts to log channel when interaction deferred in finally', async () => {
		const fakeLogChannel = await client.channels.fetch(logChannels.CONFIG_LOG_CHANNEL);

		const interaction = {
			isButton: () => true,
			isStringSelectMenu: () => false,
			isRepliable: () => true,
			replied: false,
			deferred: false,
			customId: 'some:button:that:fallsback',
			user: { id: 'U2' },
			guildId: 'G1',
			channelId: 'C2',
			message: { id: 'M2' },
			client,
			reply: jest.fn().mockRejectedValue(new Error('reply failed')),
			deferUpdate: jest.fn().mockResolvedValue(null),
		};

		// Make router code path not handle the customId and not throw earlier, so finally's fallback ack runs.
		await client._handler(interaction);

		// fallback should call deferUpdate and then post to channel
		expect(interaction.deferUpdate).toHaveBeenCalled();
		expect(client.channels.fetch).toHaveBeenCalledWith(logChannels.CONFIG_LOG_CHANNEL);
		expect(fakeLogChannel.send).toHaveBeenCalled();
	});
});
