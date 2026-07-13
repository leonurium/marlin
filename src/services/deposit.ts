import type { Page } from 'playwright';

const BASE_URL = 'https://projects.co.id/';

export interface BankAccount {
  bank: string;
  account: string;
  name: string;
}

export interface DepositResult {
  track_code: string;
  amount_to_transfer: string;
  unique_code: string;
  deadline: string;
  banks: BankAccount[];
  deduped?: boolean;
}

export interface OrderStatus {
  track_code: string;
  status: 'Completed' | 'Processing Payment' | 'Waiting Payment' | 'Canceled' | 'Unknown';
  amount: string;
  total_pay: string;
  date: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function getDepositUrl(page: Page): Promise<string> {
  await page.goto(BASE_URL + 'user/my_finance/view', { timeout: 30_000 });
  await page.waitForTimeout(2_000);
  const href = await page.locator('a:has-text("Deposit Balance")').first().getAttribute('href');
  if (!href) throw new Error('Deposit Balance link not found');
  return href.startsWith(BASE_URL) ? href.slice(BASE_URL.length) : href;
}

async function emptyCart(page: Page): Promise<void> {
  await page.goto(BASE_URL + 'user/cart/view', { timeout: 30_000 });
  await page.waitForTimeout(1_500);
  const emptyLink = page.locator('a[href*="empty_cart"]').first();
  if (await emptyLink.isVisible().catch(() => false)) {
    await emptyLink.click();
    await page.waitForTimeout(1_500);
  }
}

async function findLatestOrderId(page: Page): Promise<string | null> {
  await page.goto(BASE_URL + 'user/my_orders', { timeout: 30_000 });
  await page.waitForTimeout(2_000);
  // Orders are sorted ASC — last links are newest; iterate bottom-up
  const links = await page.locator('a[href*="/view/"]').all();
  for (let i = links.length - 1; i >= 0; i--) {
    const href = await links[i].getAttribute('href') || '';
    const text = await links[i].innerText();
    const m = href.match(/\/view\/([a-z0-9]+)\/\1/);
    if (m && text.trim() === m[1]) {
      return m[1];
    }
  }
  return null;
}

function extractPaymentDetails(html: string, pageText: string): DepositResult {
  // Extract amount to pay
  const amountMatch = pageText.match(/(?:total tagihan|total\s+sum|sebesar)\s*:?\s*([Rr]p\.?\s*[\d,]+)/i)
    || pageText.match(/([Rr]p\.?\s*[\d,]{1,3}(?:\.\d{3})*(?:,\d{3})*)/);
  const amountToPay = amountMatch ? amountMatch[1].trim() : 'Rp ???';

  // Extract unique code (3 digits at end, after base amount)
  const uniqueMatch = pageText.match(/unique transfer code.*?(\d{3})/i)
    || pageText.match(/(?:Rp\s*[\d,]+[^\d]*)(\d{3})/);
  const uniqueCode = uniqueMatch ? uniqueMatch[1] : '???';

  // Extract deadline
  const deadlineMatch = pageText.match(/(\d+)x\d+\s*jam/i) || pageText.match(/(\d+)\s*jam/i);
  const deadline = deadlineMatch ? `${deadlineMatch[1]}x24 jam` : '3x24 jam';

  // Extract banks
  const banks: BankAccount[] = [];
  const bankBlocks = pageText.match(/Bank\s+(\w+).*?([\d]{8,}).*?a\.n\.\s*(.+?)(?=\n\n|\nBank\s|\Z)/gis);
  if (bankBlocks) {
    for (const block of bankBlocks) {
      const bankMatch = block.match(/Bank\s+(\w+)/i);
      const accMatch = block.match(/([\d]{8,})/);
      const nameMatch = block.match(/a\.n\.\s*(.+)/);
      if (bankMatch && accMatch) {
        banks.push({
          bank: bankMatch[1].trim(),
          account: accMatch[1].trim(),
          name: nameMatch ? nameMatch[1].trim() : 'PANONPOE MEDIA',
        });
      }
    }
  }

  // Fallback if no banks extracted
  if (banks.length === 0) {
    banks.push(
      { bank: 'BCA', account: '4373037667', name: 'PANONPOE MEDIA PT' },
      { bank: 'Mandiri', account: '1310011570639', name: 'PANONPOE MEDIA' },
      { bank: 'BNI', account: '0345700851', name: 'PANONPOE MEDIA' },
    );
  }

  return { track_code: '', amount_to_transfer: amountToPay, unique_code: uniqueCode, deadline, banks };
}

// ─── dedup ───────────────────────────────────────────────────────────────

async function findPendingOrderByAmount(page: Page, amount: number): Promise<string | null> {
  await page.goto(BASE_URL + 'user/my_orders', { timeout: 30_000 });
  await page.waitForTimeout(2_000);

  const links = await page.locator('a[href*="/view/"]').all();
  // ponytail: checks up to 10 most recent orders; bump if users have >10 pending deposits
  for (let i = Math.min(links.length, 10) - 1; i >= 0; i--) {
    const href = await links[i].getAttribute('href') || '';
    const m = href.match(/\/view\/([a-z0-9]+)\/\1/);
    if (!m) continue;

    const trackCode = m[1];
    const { status, amount: orderAmount } = await getOrderStatus(page, trackCode);
    if (status !== 'Waiting Payment') continue;

    // Order page amount format: "Rp 50,000" — strip non-digits, compare as int
    const orderNum = parseInt(orderAmount.replace(/[^\d]/g, ''), 10);
    if (orderNum === amount) return trackCode;
  }
  return null;
}

// ─── public API ────────────────────────────────────────────────────────────

export async function createDeposit(page: Page, amount: number): Promise<DepositResult> {
  // 0. Dedup — skip creation if a pending order with the same amount exists
  const existing = await findPendingOrderByAmount(page, amount);
  if (existing) {
    // Re-extract payment details from the existing order's confirm page
    await page.goto(`${BASE_URL}user/my_orders/confirm_payment/${existing}/${existing}`, { timeout: 30_000 });
    await page.waitForTimeout(3_000);
    const pageText = await page.innerText('body');
    const result = extractPaymentDetails(await page.content(), pageText);
    result.track_code = existing;
    result.deduped = true;
    console.log(`[deposit] dedup — returning existing order ${existing} for amount ${amount}`);
    return result;
  }

  // 1. Empty cart
  await emptyCart(page);

  // 2. Go to deposit form
  const depositPath = await getDepositUrl(page);
  await page.goto(BASE_URL + depositPath, { timeout: 30_000 });
  await page.waitForTimeout(2_000);

  // Check if session expired
  if (page.url().includes('unauthorized')) {
    throw new Error('Session expired — reconnect via POST /api/auth/connect');
  }

  // 3. Fill & submit deposit form
  await page.locator('input[name="user[deposit_amount]"]').fill(`${amount},`);
  await page.waitForTimeout(500);
  await page.locator('button#deposit_balance, button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);

  // 4. Navigate to bank transfer
  await page.goto(BASE_URL + 'user/cart/view', { timeout: 30_000 });
  await page.waitForTimeout(2_000);
  const bankTransferHref = await page.locator('a[href*="pay_via_bank_transfer"]').first().getAttribute('href');
  if (!bankTransferHref) throw new Error('Bank Transfer link not found on cart page');
  const path = bankTransferHref.replace(BASE_URL, '').replace(/^\//, '');

  await page.goto(BASE_URL + path, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3_000);

  // 5. Extract payment details
  const pageText = await page.innerText('body');
  const result = extractPaymentDetails(await page.content(), pageText);

  // 6. Get and save order ID
  const orderId = await findLatestOrderId(page);
  if (!orderId) throw new Error('Could not find order ID after deposit');
  result.track_code = orderId;

  return result;
}

export async function getOrderStatus(page: Page, trackCode: string): Promise<OrderStatus> {
  await page.goto(`${BASE_URL}user/my_orders/view/${trackCode}/${trackCode}`, { timeout: 30_000 });
  await page.waitForTimeout(2_000);
  const text = await page.innerText('body');

  let status: OrderStatus['status'] = 'Unknown';
  if (text.includes('Completed')) status = 'Completed';
  else if (text.includes('Processing Payment')) status = 'Processing Payment';
  else if (text.includes('Waiting Payment')) status = 'Waiting Payment';
  else if (text.includes('Canceled')) status = 'Canceled';

  const amountMatch = text.match(/(?:Total\s*Price|Total\s*Tagihan)\s*:\s*([Rr]p\.?\s*[\d,]+)/i);
  const totalMatch = text.match(/(?:Total\s*Sum|Total\s*Bayar)\s*:\s*([Rr]p\.?\s*[\d,]+)/i);
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}:\d{2})/);

  return {
    track_code: trackCode,
    status,
    amount: amountMatch ? amountMatch[1].trim() : 'Rp ???',
    total_pay: totalMatch ? totalMatch[1].trim() : 'Rp ???',
    date: dateMatch ? `${dateMatch[1]} WIB` : '',
  };
}

export async function confirmDeposit(page: Page, trackCode: string): Promise<{ status: string; message: string }> {
  // Check status first
  const { status } = await getOrderStatus(page, trackCode);

  if (status === 'Completed') {
    return { status: 'Completed', message: 'Order already completed.' };
  }
  if (status === 'Processing Payment') {
    return { status: 'Processing Payment', message: 'Payment received, waiting for admin to credit balance.' };
  }
  if (status === 'Canceled') {
    return { status: 'Canceled', message: 'Order was canceled.' };
  }
  if (status !== 'Waiting Payment') {
    return { status: 'Unknown', message: `Unexpected status: ${status}` };
  }

  // Navigate to confirm page
  await page.goto(`${BASE_URL}user/my_orders/confirm_payment/${trackCode}/${trackCode}`, { timeout: 30_000 });
  await page.waitForTimeout(3_000);

  const text = await page.innerText('body');
  if (text.includes('Unauthorized') || page.url().includes('unauthorized')) {
    return { status: 'Unauthorized', message: 'Cannot confirm this order — status may have changed.' };
  }

  if (!text.includes('Confirm Payment')) {
    return { status: 'Unknown', message: 'Confirm Payment page did not load correctly.' };
  }

  // Submit via JS click
  await page.evaluate(
    "document.querySelector('#form_my_orders_confirm_payment button').click()"
  );
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3_000);

  const resultText = await page.innerText('body');
  if (resultText.includes('Payment Confirmation Sent') || resultText.toLowerCase().includes('terima kasih')) {
    return { status: 'Confirmed', message: 'Payment confirmed. Balance will be updated shortly.' };
  }
  if (resultText.includes('Completed')) {
    return { status: 'Completed', message: 'Order completed.' };
  }

  return { status: 'Unknown', message: 'Confirm submitted but result unclear — check manually.' };
}
