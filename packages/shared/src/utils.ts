import { createHmac, randomBytes } from 'crypto';

// ID Generation
export function generateId(prefix?: string): string {
  const id = randomBytes(12).toString('hex');
  return prefix ? `${prefix}_${id}` : id;
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `vp_${randomBytes(32).toString('hex')}`;
  const prefix = key.substring(0, 10);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

export function hashApiKey(key: string): string {
  return createHmac('sha256', process.env.API_KEY_SECRET || 'secret').update(key).digest('hex');
}

// Webhook Signature
export function signWebhookPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string, tolerance = 300): boolean {
  const parts = signature.split(',');
  const timestamp = parseInt(parts.find(p => p.startsWith('t='))?.slice(2) || '0');
  const hash = parts.find(p => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !hash) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return hash === expected;
}

// Phone Number Formatting
export function formatE164(phoneNumber: string, defaultCountry = 'US'): string {
  let digits = phoneNumber.replace(/\D/g, '');
  if (defaultCountry === 'US') {
    if (digits.length === 10) digits = '1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  }
  return '+' + digits;
}

export function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

// Duration Formatting
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Cost Formatting
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Slug Generation
export function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

export function generateUniqueSlug(name: string): string {
  return `${generateSlug(name)}-${randomBytes(4).toString('hex')}`;
}

// Retry Logic
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; backoff?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = 2 } = options;
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) throw lastError;
      await sleep(delayMs * Math.pow(backoff, attempt));
    }
  }
  throw lastError!;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Object Utils
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) if (key in obj) result[key] = obj[key];
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}
