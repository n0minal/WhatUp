import type { Conversation, ConversationDetail, Message } from '../types';

/**
 * In-memory stand-in for the whatup-backend API, so the admin UI runs
 * standalone. Swap to the real thing by setting VITE_API_URL (see client.ts).
 */

const now = Date.now();
const min = (n: number) => new Date(now - n * 60_000).toISOString();

interface Seed {
  id: string;
  phoneNumber: string;
  // [direction shorthand, body, status, minutes ago]
  messages: Array<['in' | 'out', string, Message['status'], number]>;
}

const seeds: Seed[] = [
  {
    id: 'c_01',
    phoneNumber: '+15550100742',
    messages: [
      ['in', 'Hi, what time do you open tomorrow?', 'sent', 60 * 26],
      ['out', 'We open at 9:00 AM. Anything else I can help with?', 'sent', 60 * 26 - 1],
      ['in', 'Do I need an appointment for a consultation?', 'sent', 190],
      ['out', 'Walk-ins are welcome, but booking guarantees a slot. Reply BOOK to reserve one.', 'sent', 189],
      ['in', 'BOOK', 'sent', 12],
      ['out', 'You are booked for tomorrow at 9:30 AM. Reply CANCEL to cancel.', 'sent', 11],
      ['in', 'Perfect, thanks!', 'processing', 1],
    ],
  },
  {
    id: 'c_02',
    phoneNumber: '+15550187330',
    messages: [
      ['in', 'STATUS order 4821', 'sent', 60 * 5],
      ['out', 'Order #4821 shipped this morning — tracking number 1Z999AA10123456784.', 'sent', 60 * 5 - 1],
      ['in', 'It says delivered but nothing arrived??', 'sent', 34],
      ['out', 'Sorry about that. I have opened an investigation with the carrier and flagged your order for a human agent. You will hear back within 2 hours.', 'failed', 33],
    ],
  },
  {
    id: 'c_03',
    phoneNumber: '+15550194155',
    messages: [
      ['in', 'How much is the monthly plan?', 'sent', 60 * 49],
      ['out', 'The monthly plan is $29/mo, or $290/yr paid annually (two months free).', 'sent', 60 * 49 - 1],
      ['in', 'And does it include SMS notifications?', 'sent', 60 * 48],
      ['out', 'Yes — SMS notifications are included on every plan at no extra cost.', 'sent', 60 * 48 - 1],
    ],
  },
  {
    id: 'c_04',
    phoneNumber: '+15550172986',
    messages: [
      ['in', 'CANCEL', 'sent', 60 * 30],
      ['out', 'Your appointment for Friday has been cancelled. Reply BOOK to schedule a new one.', 'sent', 60 * 30 - 1],
    ],
  },
  {
    id: 'c_05',
    phoneNumber: '+15550163412',
    messages: [
      ['in', 'Hola, ¿tienen soporte en español?', 'sent', 60 * 73],
      ['out', '¡Sí! Puedes escribirnos en español y con gusto te ayudamos.', 'sent', 60 * 73 - 1],
      ['in', 'Genial. ¿Cuál es el horario de atención?', 'sent', 60 * 72],
      ['out', 'Atendemos de lunes a viernes, de 9:00 a 18:00.', 'sent', 60 * 72 - 2],
    ],
  },
  {
    id: 'c_06',
    phoneNumber: '+15550158209',
    messages: [
      ['in', 'Is there parking at the clinic?', 'received', 0],
    ],
  },
];

function buildMessages(seed: Seed): Message[] {
  return seed.messages.map(([dir, body, status, minutesAgo], i) => ({
    id: `${seed.id}_m${String(i + 1).padStart(2, '0')}`,
    conversationId: seed.id,
    direction: dir === 'in' ? 'inbound' : 'outbound',
    body,
    status,
    createdAt: min(minutesAgo),
  }));
}

function buildConversation(seed: Seed): Conversation {
  const messages = buildMessages(seed);
  const last = messages[messages.length - 1];
  return {
    id: seed.id,
    phoneNumber: seed.phoneNumber,
    lastMessagePreview: last.body,
    lastMessageAt: last.createdAt,
    messageCount: messages.length,
  };
}

const latency = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

/** Mirrors ReplyGeneratorService in whatup-backend, for the standalone demo. */
function mockReply(inboundBody: string): string {
  const normalized = inboundBody.trim().toUpperCase();
  if (normalized === 'BOOK') return 'You are booked! Reply CANCEL to cancel.';
  if (normalized === 'CANCEL')
    return 'Your booking has been cancelled. Reply BOOK to schedule a new one.';
  return `Thanks for your message! You said: "${inboundBody.trim()}". Reply BOOK to make a booking.`;
}

/** Append an inbound message and simulate the pipeline: status flip + reply. */
function simulatePipeline(seed: Seed, body: string): void {
  const inbound: Seed['messages'][number] = ['in', body, 'processing', 0];
  seed.messages.push(inbound);
  setTimeout(() => {
    inbound[2] = 'sent';
    seed.messages.push(['out', mockReply(body), 'sent', 0]);
  }, 3000);
}

export async function mockSendMessage(
  conversationId: string,
  body: string,
): Promise<{ messageSid: string }> {
  await latency();
  const seed = seeds.find((s) => s.id === conversationId);
  if (!seed) throw new Error(`Conversation not found: ${conversationId}`);
  simulatePipeline(seed, body);
  return { messageSid: `MOCK${Date.now()}` };
}

export async function mockStartConversation(
  phoneNumber: string,
  body: string,
): Promise<{ messageSid: string }> {
  await latency();
  let seed = seeds.find((s) => s.phoneNumber === phoneNumber);
  if (!seed) {
    seed = { id: `c_${String(seeds.length + 1).padStart(2, '0')}`, phoneNumber, messages: [] };
    seeds.push(seed);
  }
  simulatePipeline(seed, body);
  return { messageSid: `MOCK${Date.now()}` };
}

export async function mockListConversations(): Promise<Conversation[]> {
  await latency();
  return seeds
    .map(buildConversation)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function mockGetConversation(id: string): Promise<ConversationDetail> {
  await latency();
  const seed = seeds.find((s) => s.id === id);
  if (!seed) throw new Error(`Conversation not found: ${id}`);
  return { conversation: buildConversation(seed), messages: buildMessages(seed) };
}
